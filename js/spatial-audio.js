// Head-tracked binaural playback for a media element (Web Audio API).
//
// Stereo L/R become two virtual speakers either side of the screen, rendered
// through HRTF panners. As the head turns, the speakers are counter-rotated so
// they stay fixed in the room ("screen as a window").
//
// Graph:
//   media -> upmix(2ch) -+-> dry ------------------------------+
//                        +-> splitter -> L panner -+-> wet ----+-> master -> out
//                        |            -> R panner -+           |
//                        +-> room (convolver) -> lowpass -> wet+

const DEG2RAD = Math.PI / 180;

export const MODES = {
    OFF: 'off',         // plain stereo, glued to your head
    FIXED: 'fixed',     // virtual speakers, no head tracking
    TRACKED: 'tracked', // virtual speakers, counter-rotated by head pose
};

export class SpatialAudio {
    constructor(mediaElement) {
        this.media = mediaElement;
        this.ctx = null;
        this.mode = MODES.FIXED;
        this.widthDeg = 30;   // each speaker this far off-centre
        this.distance = 1.5;  // metres, only affects HRTF direction here
        this.room = 0.15;     // 0..1 reverb send
        this.usePitch = true;
        this.head = { yaw: 0, pitch: 0 };
    }

    /** Must be called from a user gesture (autoplay policy). */
    async init() {
        if (this.ctx) {
            if (this.ctx.state === 'suspended') await this.ctx.resume();
            return;
        }
        const ctx = new AudioContext({ latencyHint: 'interactive' });
        this.ctx = ctx;

        const source = ctx.createMediaElementSource(this.media);

        // Force 2 channels so mono clips feed both virtual speakers.
        const upmix = ctx.createGain();
        upmix.channelCount = 2;
        upmix.channelCountMode = 'explicit';
        upmix.channelInterpretation = 'speakers';
        source.connect(upmix);

        this.master = ctx.createGain();
        this.master.connect(ctx.destination);

        // Dry (plain stereo) path
        this.dry = ctx.createGain();
        upmix.connect(this.dry);
        this.dry.connect(this.master);

        // Wet (virtual speaker) path
        this.wet = ctx.createGain();
        this.wet.connect(this.master);

        const splitter = ctx.createChannelSplitter(2);
        upmix.connect(splitter);
        this.panners = [0, 1].map(ch => {
            const p = ctx.createPanner();
            p.panningModel = 'HRTF';
            p.distanceModel = 'inverse';
            p.refDistance = 1;
            p.rolloffFactor = 0; // direction only, no distance attenuation
            // Mono into each panner, otherwise it would downmix again.
            const mono = ctx.createGain();
            mono.channelCount = 1;
            mono.channelCountMode = 'explicit';
            splitter.connect(mono, ch);
            mono.connect(p);
            p.connect(this.wet);
            return p;
        });

        // A touch of room helps the brain place sound outside the head.
        this.convolver = ctx.createConvolver();
        this.convolver.buffer = this.makeRoomImpulse(0.7);
        this.roomSend = ctx.createGain();
        const roomTone = ctx.createBiquadFilter();
        roomTone.type = 'lowpass';
        roomTone.frequency.value = 6000;
        upmix.connect(this.roomSend);
        this.roomSend.connect(this.convolver);
        this.convolver.connect(roomTone);
        roomTone.connect(this.wet);

        this.applyMode(true);
        this.setRoom(this.room);
        this.updatePositions(true);
    }

    /** Synthetic stereo room: decorrelated noise with exponential decay. */
    makeRoomImpulse(seconds) {
        const rate = this.ctx.sampleRate;
        const len = Math.floor(rate * seconds);
        const preDelay = Math.floor(rate * 0.012);
        const buf = this.ctx.createBuffer(2, len, rate);
        for (let ch = 0; ch < 2; ch++) {
            const d = buf.getChannelData(ch);
            for (let i = preDelay; i < len; i++) {
                const t = (i - preDelay) / rate;
                d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 6) * 0.35;
            }
        }
        return buf;
    }

    setMode(mode) {
        this.mode = mode;
        this.applyMode();
        this.updatePositions();
    }

    applyMode(immediate = false) {
        if (!this.ctx) return;
        const spatial = this.mode !== MODES.OFF;
        // Short crossfade so A/B switching doesn't click.
        const t = this.ctx.currentTime;
        const tc = immediate ? 0.001 : 0.03;
        this.dry.gain.setTargetAtTime(spatial ? 0 : 1, t, tc);
        this.wet.gain.setTargetAtTime(spatial ? 1 : 0, t, tc);
    }

    setWidth(deg) {
        this.widthDeg = deg;
        this.updatePositions();
    }

    setRoom(amount) {
        this.room = amount;
        if (this.roomSend) {
            this.roomSend.gain.setTargetAtTime(amount, this.ctx.currentTime, 0.05);
        }
    }

    /** Head pose in degrees (yaw > 0 = turned left, pitch > 0 = looking up). */
    setHead(yaw, pitch) {
        this.head.yaw = yaw;
        this.head.pitch = pitch;
        if (this.mode === MODES.TRACKED) this.updatePositions();
    }

    /**
     * Speaker direction relative to the head. World azimuth +w (left) / -w
     * (right); relative azimuth = world - headYaw. Web Audio listener faces -Z
     * with +X to the right.
     */
    speakerPosition(worldAzDeg) {
        const tracked = this.mode === MODES.TRACKED;
        const az = (worldAzDeg - (tracked ? this.head.yaw : 0)) * DEG2RAD;
        const el = (tracked && this.usePitch ? -this.head.pitch : 0) * DEG2RAD;
        const d = this.distance;
        return {
            x: -Math.sin(az) * Math.cos(el) * d,
            y: Math.sin(el) * d,
            z: -Math.cos(az) * Math.cos(el) * d,
        };
    }

    updatePositions(immediate = false) {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const azimuths = [this.widthDeg, -this.widthDeg]; // L, R
        this.panners.forEach((p, i) => {
            const pos = this.speakerPosition(azimuths[i]);
            if (p.positionX) {
                // Tiny time constant: smooth enough to avoid zipper noise,
                // short enough not to add perceptible lag.
                const tc = immediate ? 0.001 : 0.008;
                p.positionX.setTargetAtTime(pos.x, t, tc);
                p.positionY.setTargetAtTime(pos.y, t, tc);
                p.positionZ.setTargetAtTime(pos.z, t, tc);
            } else {
                p.setPosition(pos.x, pos.y, pos.z); // older Safari
            }
        });
    }

    /** Relative speaker angles, for the readout. */
    relativeAngles() {
        const yaw = this.mode === MODES.TRACKED ? this.head.yaw : 0;
        return { left: this.widthDeg - yaw, right: -this.widthDeg - yaw };
    }

    /** Audio pipeline latency in ms as reported by the browser. */
    latencyMs() {
        if (!this.ctx) return null;
        const base = (this.ctx.baseLatency || 0) * 1000;
        const out = (this.ctx.outputLatency || 0) * 1000;
        return { base, out, total: base + out, outputKnown: !!this.ctx.outputLatency };
    }
}
