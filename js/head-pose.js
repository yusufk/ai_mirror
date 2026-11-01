// Head pose maths: real angles in degrees, low-latency smoothing, recentre
// and short-term prediction. Shared by the particle face and spatial audio.

const RAD2DEG = 180 / Math.PI;

/**
 * Extract yaw/pitch/roll (degrees) from a MediaPipe facial transformation
 * matrix (4x4, column-major, maps the canonical face into camera space).
 *
 * Conventions (subject's point of view):
 *   yaw   > 0  head turned to the subject's LEFT
 *   pitch > 0  looking UP
 *   roll  > 0  head tilted towards the subject's LEFT shoulder
 */
export function matrixToEuler(data) {
    // Column 2 is the face's forward axis, column 0 its right axis.
    const fx = data[8], fy = data[9], fz = data[10];
    const yaw = Math.atan2(fx, fz) * RAD2DEG;
    const pitch = Math.asin(Math.max(-1, Math.min(1, fy))) * RAD2DEG;
    const roll = Math.atan2(data[1], data[0]) * RAD2DEG;
    return { yaw, pitch, roll };
}

/**
 * One Euro filter (Casiez et al. 2012). Smooths jitter when the head is still
 * but adds very little lag when it moves fast, which is exactly the trade-off
 * head-tracked audio needs. Also exposes a smoothed velocity for prediction.
 */
export class OneEuroFilter {
    constructor({ minCutoff = 1.0, beta = 0.02, dCutoff = 1.0 } = {}) {
        this.minCutoff = minCutoff;
        this.beta = beta;
        this.dCutoff = dCutoff;
        this.reset();
    }

    reset() {
        this.x = null;
        this.prevRaw = null;
        this.dx = 0;
        this.t = null;
    }

    static alpha(cutoff, dt) {
        const tau = 1 / (2 * Math.PI * cutoff);
        return 1 / (1 + tau / dt);
    }

    /** @param value raw sample @param tSec timestamp in seconds */
    filter(value, tSec) {
        if (this.x === null) {
            this.x = value;
            this.prevRaw = value;
            this.t = tSec;
            return value;
        }
        const dt = Math.max(1e-3, tSec - this.t);
        this.t = tSec;

        // Velocity from consecutive RAW samples. Differencing against the
        // smoothed value would add its lag and overestimate speed, which
        // makes prediction overshoot.
        const rawDx = (value - this.prevRaw) / dt;
        this.prevRaw = value;
        this.dx += OneEuroFilter.alpha(this.dCutoff, dt) * (rawDx - this.dx);

        const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
        this.x += OneEuroFilter.alpha(cutoff, dt) * (value - this.x);
        return this.x;
    }
}

/**
 * Filtered head pose with recentre, lost-face easing and prediction.
 */
export class HeadPose {
    constructor() {
        this.filters = {
            yaw: new OneEuroFilter({ minCutoff: 1.2, beta: 0.03 }),
            pitch: new OneEuroFilter({ minCutoff: 1.2, beta: 0.03 }),
            roll: new OneEuroFilter({ minCutoff: 1.0, beta: 0.02 }),
        };
        this.offset = { yaw: 0, pitch: 0, roll: 0 };
        this.current = { yaw: 0, pitch: 0, roll: 0 };
        this.lastSampleMs = 0;
        this.tracking = false;
        this.invertYaw = false;
        this.needsAutoCentre = true;

        // Lost-face behaviour: hold briefly, then ease back to centre.
        this.holdMs = 400;
        this.easeMs = 1200;
    }

    /** Feed a raw pose sample (degrees) captured at performance.now() time tMs. */
    update(raw, tMs) {
        const t = tMs / 1000;
        const yaw = this.filters.yaw.filter(raw.yaw, t);
        const pitch = this.filters.pitch.filter(raw.pitch, t);
        const roll = this.filters.roll.filter(raw.roll, t);

        // First sample after (re)start defines "forward". Webcams are rarely
        // dead centre, so this beats assuming the camera axis is forward.
        if (this.needsAutoCentre) {
            this.offset = { yaw, pitch, roll };
            this.needsAutoCentre = false;
        }

        this.current = { yaw, pitch, roll };
        this.lastSampleMs = tMs;
        this.tracking = true;
    }

    /** Treat the current head direction as "forward". */
    recentre() {
        this.offset = { ...this.current };
    }

    /** Forget filter state and auto-centre on the next sample. */
    reset() {
        Object.values(this.filters).forEach(f => f.reset());
        this.needsAutoCentre = true;
        this.tracking = false;
    }

    /**
     * Pose relative to "forward", predicted aheadMs into the future to hide
     * render/output latency (Bluetooth especially).
     */
    get(nowMs = performance.now(), aheadMs = 0) {
        const sinceSample = nowMs - this.lastSampleMs;
        const sign = this.invertYaw ? -1 : 1;

        let yaw = this.current.yaw - this.offset.yaw;
        let pitch = this.current.pitch - this.offset.pitch;
        let roll = this.current.roll - this.offset.roll;

        if (!this.tracking || sinceSample > this.holdMs) {
            // Face lost: ease towards centre instead of snapping.
            const k = this.tracking
                ? Math.max(0, 1 - (sinceSample - this.holdMs) / this.easeMs)
                : 0;
            return { yaw: sign * yaw * k, pitch: pitch * k, roll: roll * k, tracking: false };
        }

        // Extrapolate using the filters' velocity estimate. Cap the horizon so
        // a noisy velocity can't fling the sound around.
        // aheadMs = 0 means no prediction at all (handy for A/B testing).
        const horizon = aheadMs > 0 ? Math.min(sinceSample + aheadMs, 250) / 1000 : 0;
        yaw += this.filters.yaw.dx * horizon;
        pitch += this.filters.pitch.dx * horizon;

        return { yaw: sign * yaw, pitch, roll, tracking: true };
    }
}
