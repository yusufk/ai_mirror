// Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';

// head-pose.js uses performance.now() defaults only; Node provides it.
import { matrixToEuler, OneEuroFilter, HeadPose } from '../js/head-pose.js';
import { SpatialAudio, MODES } from '../js/spatial-audio.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

/**
 * Column-major 4x4 for R = Ry(yaw) * Rx(-pitch), so the face's forward axis
 * (0,0,1) maps to (sin(yaw)cos(pitch), sin(pitch), cos(yaw)cos(pitch)).
 */
function poseMatrix(yawDeg, pitchDeg = 0) {
    const y = yawDeg * Math.PI / 180, p = pitchDeg * Math.PI / 180;
    const cy = Math.cos(y), sy = Math.sin(y), cp = Math.cos(p), sp = Math.sin(p);
    const r = [
        [cy, -sy * sp, sy * cp],
        [0, cp, sp],
        [-sy, -cy * sp, cy * cp],
    ];
    const data = new Array(16).fill(0);
    for (let c = 0; c < 3; c++) for (let row = 0; row < 3; row++) data[c * 4 + row] = r[row][c];
    data[15] = 1;
    return data;
}

test('matrixToEuler: identity is straight ahead', () => {
    const e = matrixToEuler(poseMatrix(0, 0));
    near(e.yaw, 0); near(e.pitch, 0); near(e.roll, 0);
});

test('matrixToEuler: recovers yaw and pitch', () => {
    for (const [yaw, pitch] of [[30, 0], [-45, 0], [0, 20], [25, -15]]) {
        const e = matrixToEuler(poseMatrix(yaw, pitch));
        near(e.yaw, yaw, 1e-4);
        near(e.pitch, pitch, 1e-4);
    }
});

test('OneEuroFilter: converges to a constant and tracks velocity', () => {
    const f = new OneEuroFilter({ minCutoff: 1, beta: 0.05 });
    let v = 0;
    for (let i = 0; i <= 120; i++) v = f.filter(10, i / 60);
    near(v, 10, 1e-3);

    const g = new OneEuroFilter({ minCutoff: 1, beta: 0.05 });
    for (let i = 0; i <= 120; i++) g.filter(i * 0.5, i / 60); // 30 deg/s ramp
    assert.ok(Math.abs(g.dx - 30) < 3, `velocity ${g.dx}`);
});

test('HeadPose: auto-centres on first sample and recentres', () => {
    const hp = new HeadPose();
    hp.update({ yaw: 12, pitch: -5, roll: 0 }, 1000);
    let p = hp.get(1000);
    near(p.yaw, 0); near(p.pitch, 0);

    for (let t = 1016; t < 3000; t += 16) hp.update({ yaw: 42, pitch: -5, roll: 0 }, t);
    p = hp.get(3000);
    near(p.yaw, 30, 0.5);

    hp.recentre();
    near(hp.get(3000).yaw, 0);
});

test('HeadPose: invertYaw flips direction', () => {
    const hp = new HeadPose();
    hp.update({ yaw: 0, pitch: 0, roll: 0 }, 0);
    for (let t = 16; t < 2000; t += 16) hp.update({ yaw: 20, pitch: 0, roll: 0 }, t);
    const a = hp.get(2000).yaw;
    hp.invertYaw = true;
    near(hp.get(2000).yaw, -a);
});

test('HeadPose: eases to centre after losing the face', () => {
    const hp = new HeadPose();
    hp.update({ yaw: 0, pitch: 0, roll: 0 }, 0);
    for (let t = 16; t < 2000; t += 16) hp.update({ yaw: 30, pitch: 0, roll: 0 }, t);
    const last = 1999;
    assert.ok(hp.get(last + 100).tracking);
    const mid = hp.get(last + hp.holdMs + hp.easeMs / 2);
    assert.equal(mid.tracking, false);
    assert.ok(mid.yaw > 5 && mid.yaw < 25, `mid ${mid.yaw}`);
    near(hp.get(last + hp.holdMs + hp.easeMs + 10).yaw, 0, 1e-9);
});

test('HeadPose: prediction extrapolates only when asked', () => {
    const hp = new HeadPose();
    hp.update({ yaw: 0, pitch: 0, roll: 0 }, 0);
    let t = 0;
    for (; t < 1000; t += 16) hp.update({ yaw: t * 0.06, pitch: 0, roll: 0 }, t); // 60 deg/s
    const now = t - 16;
    const plain = hp.get(now, 0).yaw;
    const ahead = hp.get(now, 100).yaw;
    assert.ok(ahead - plain > 3 && ahead - plain < 9, `predicted +${ahead - plain}`);
});

test('SpatialAudio: speakers sit either side of the screen', () => {
    const sa = new SpatialAudio({});
    sa.mode = MODES.TRACKED;
    const L = sa.speakerPosition(30), R = sa.speakerPosition(-30);
    assert.ok(L.x < 0 && R.x > 0, 'left is -x, right is +x');
    assert.ok(L.z < 0 && R.z < 0, 'both in front (-z)');
});

test('SpatialAudio: turning left moves speakers to the right', () => {
    const sa = new SpatialAudio({});
    sa.mode = MODES.TRACKED;
    sa.head = { yaw: 30, pitch: 0 }; // turned left by exactly the speaker width
    const L = sa.speakerPosition(30);
    near(L.x, 0, 1e-9); // left speaker now dead ahead
    const R = sa.speakerPosition(-30);
    assert.ok(R.x > 0, 'right speaker further right');
    assert.deepEqual(sa.relativeAngles(), { left: 0, right: -60 });
});

test('SpatialAudio: fixed mode ignores head pose', () => {
    const sa = new SpatialAudio({});
    sa.mode = MODES.FIXED;
    sa.head = { yaw: 45, pitch: 20 };
    const L = sa.speakerPosition(30);
    near(L.x, -Math.sin(Math.PI / 6) * sa.distance);
    near(L.y, 0);
});

test('SpatialAudio: looking up drops speakers below ear level', () => {
    const sa = new SpatialAudio({});
    sa.mode = MODES.TRACKED;
    sa.head = { yaw: 0, pitch: 20 };
    assert.ok(sa.speakerPosition(30).y < 0);
});
