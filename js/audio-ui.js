// Spatial audio panel: load a clip, pick a mode, tune, and watch the radar.

import { SpatialAudio, MODES } from './spatial-audio.js';

// Rough camera + inference delay added on top of audio latency when
// prediction is matched automatically.
const CAMERA_PIPELINE_MS = 35;

export class AudioUI {
    /**
     * @param {object} deps
     * @param {HeadPose} deps.headPose
     * @param {FaceTracker} deps.faceTracker
     * @param {() => Promise<boolean>} deps.ensureCamera starts camera tracking
     */
    constructor({ headPose, faceTracker, ensureCamera }) {
        this.headPose = headPose;
        this.faceTracker = faceTracker;
        this.ensureCamera = ensureCamera;
        this.predictionMs = 0;

        this.el = (id) => document.getElementById(id);
        this.media = this.el('sa-media');
        this.audio = new SpatialAudio(this.media);

        this.bind();
        this.loop = this.loop.bind(this);
        requestAnimationFrame(this.loop);
    }

    bind() {
        const panel = this.el('audio-panel');
        this.el('sa-collapse').addEventListener('click', () => {
            panel.classList.toggle('collapsed');
            this.el('sa-collapse').textContent = panel.classList.contains('collapsed') ? '▸' : '▾';
        });

        // Load a local file. It stays on this machine (object URL only).
        this.el('sa-file').addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
            this.objectUrl = URL.createObjectURL(file);
            this.el('sa-sample').value = '';
            this.el('sa-credit').textContent = '';
            this.loadSource(this.objectUrl, file.name, file.type.startsWith('audio/'));
        });

        // Bundled public domain / CC0 test clips
        this.loadSampleList();
        this.el('sa-sample').addEventListener('change', (e) => {
            const s = this.samples?.find(x => x.file === e.target.value);
            if (!s) return;
            this.loadSource(`samples/${s.file}`, s.title, true);
            this.el('sa-filename').textContent = 'Video or audio, stays on this machine';
            const credit = this.el('sa-credit');
            credit.textContent = `${s.hint}. By ${s.author}, ${s.license}. `;
            const link = document.createElement('a');
            link.href = s.source;
            link.target = '_blank';
            link.rel = 'noopener';
            link.textContent = 'Source';
            credit.appendChild(link);
        });

        // AudioContext needs a user gesture; play is one.
        this.media.addEventListener('play', () => this.audio.init());

        // Mode buttons
        document.querySelectorAll('[data-sa-mode]').forEach(btn => {
            btn.addEventListener('click', () => this.setMode(btn.dataset.saMode));
        });

        this.el('sa-width').addEventListener('input', (e) => {
            this.audio.setWidth(Number(e.target.value));
            this.el('sa-width-val').textContent = `±${e.target.value}°`;
        });

        this.el('sa-room').addEventListener('input', (e) => {
            this.audio.setRoom(Number(e.target.value) / 100);
            this.el('sa-room-val').textContent = `${e.target.value}%`;
        });

        this.el('sa-predict').addEventListener('input', (e) => {
            this.predictionMs = Number(e.target.value);
            this.el('sa-predict-val').textContent = `${this.predictionMs} ms`;
        });

        this.el('sa-predict-auto').addEventListener('click', () => {
            const lat = this.audio.latencyMs();
            const ms = Math.round((lat ? lat.total : 0) + CAMERA_PIPELINE_MS);
            this.el('sa-predict').value = Math.min(250, ms);
            this.el('sa-predict').dispatchEvent(new Event('input'));
        });

        this.el('sa-pitch').addEventListener('change', (e) => {
            this.audio.usePitch = e.target.checked;
        });

        this.el('sa-flip').addEventListener('change', (e) => {
            this.headPose.invertYaw = e.target.checked;
        });

        this.el('sa-recentre').addEventListener('click', () => this.headPose.recentre());
        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;
            if (e.key.toLowerCase() === 'c' && this.faceTracker.isActive) this.headPose.recentre();
        });
    }

    loadSource(url, label, audioOnly) {
        this.media.src = url;
        this.media.loop = true;
        this.media.classList.toggle('audio-only', audioOnly);
        this.el('sa-filename').textContent = label;
        this.el('sa-player').classList.remove('hidden');
    }

    async loadSampleList() {
        try {
            const res = await fetch('samples/samples.json');
            this.samples = await res.json();
            const select = this.el('sa-sample');
            for (const s of this.samples) {
                const opt = document.createElement('option');
                opt.value = s.file;
                opt.textContent = s.title;
                select.appendChild(opt);
            }
        } catch (e) {
            console.warn('Sample list unavailable:', e);
            this.el('sa-sample').disabled = true;
        }
    }

    async setMode(mode) {
        if (mode === MODES.TRACKED && !this.faceTracker.isActive) {
            const ok = await this.ensureCamera();
            if (!ok) {
                this.el('sa-status').textContent = 'Camera needed for head tracking';
                return;
            }
        }
        this.audio.setMode(mode);
        document.querySelectorAll('[data-sa-mode]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.saMode === mode);
        });
        this.el('sa-status').textContent = {
            [MODES.OFF]: 'Plain stereo: sound turns with your head',
            [MODES.FIXED]: 'Virtual speakers, not tracked',
            [MODES.TRACKED]: 'Virtual speakers fixed to the screen',
        }[mode];
    }

    loop() {
        requestAnimationFrame(this.loop);

        const pose = this.headPose.get(performance.now(), this.predictionMs);
        this.audio.setHead(pose.yaw, pose.pitch);

        this.drawRadar(pose);
        this.updateReadout(pose);
    }

    updateReadout(pose) {
        const rel = this.audio.relativeAngles();
        const lat = this.audio.latencyMs();
        const side = (deg) => `${Math.abs(deg).toFixed(0)}°${deg >= 0 ? 'L' : 'R'}`;

        this.el('sa-head').textContent = this.faceTracker.isActive
            ? `${side(pose.yaw)}  ${pose.pitch >= 0 ? '↑' : '↓'}${Math.abs(pose.pitch).toFixed(0)}°${pose.tracking ? '' : ' (lost)'}`
            : 'camera off';
        this.el('sa-speakers').textContent = `${side(rel.left)} · ${side(rel.right)}`;
        this.el('sa-latency').textContent = lat
            ? `${lat.total.toFixed(0)} ms${lat.outputKnown ? '' : ' (output not reported)'}`
            : 'press play';
        const fpsEl = this.el('sa-fps');
        if (this.faceTracker.isActive) {
            const fps = this.faceTracker.fps;
            // Chrome throttles camera processing for background windows.
            const slow = fps < 10;
            fpsEl.textContent = slow ? `${fps} fps (keep window in front)` : `${fps} fps`;
            fpsEl.style.color = slow ? '#ffaa00' : '';
        } else {
            fpsEl.textContent = '-';
            fpsEl.style.color = '';
        }
    }

    /** Top-down view: screen at top, speakers fixed, head arrow turns. */
    drawRadar(pose) {
        const canvas = this.el('sa-radar');
        const g = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        const cx = w / 2, cy = h * 0.62, r = h * 0.48;
        g.clearRect(0, 0, w, h);

        // Screen
        g.strokeStyle = 'rgba(0, 198, 255, 0.5)';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(cx - 28, 8);
        g.lineTo(cx + 28, 8);
        g.stroke();

        // Speakers (world positions; "up" on the radar = towards the screen)
        const width = this.audio.widthDeg * Math.PI / 180;
        const on = this.audio.mode !== MODES.OFF;
        [width, -width].forEach((az, i) => {
            const x = cx - Math.sin(az) * r;
            const y = cy - Math.cos(az) * r;
            g.fillStyle = on ? '#00ff88' : 'rgba(255,255,255,0.25)';
            g.beginPath();
            g.arc(x, y, 6, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = 'rgba(255,255,255,0.7)';
            g.font = '10px sans-serif';
            g.fillText(i === 0 ? 'L' : 'R', x - 3, y + 18);
        });

        // Head: yaw > 0 is turning left, i.e. anticlockwise on screen.
        const yaw = pose.yaw * Math.PI / 180;
        g.save();
        g.translate(cx, cy);
        g.rotate(-yaw);
        g.fillStyle = pose.tracking ? '#00c6ff' : '#ffaa00';
        g.beginPath();
        g.arc(0, 0, 10, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = g.fillStyle;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(0, -10);
        g.lineTo(0, -32);
        g.stroke();
        g.beginPath();
        g.moveTo(-5, -26);
        g.lineTo(0, -34);
        g.lineTo(5, -26);
        g.stroke();
        g.restore();
    }
}
