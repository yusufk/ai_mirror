// Face tracking via MediaPipe Face Landmarker (tasks-vision).
//
// Upgrade from the legacy FaceMesh solution:
//   - real head pose (degrees) from the facial transformation matrix
//   - expressions from ML blendshapes instead of hand-tuned landmark ratios
//   - same 478 landmarks, so particle mapping and gesture recording still work
//
// Everything runs locally; frames never leave the browser.

import { FaceLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/vision_bundle.mjs';
import { matrixToEuler } from './head-pose.js';

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// Blendshape thresholds (scores are 0..1)
const BLINK_ON = 0.5;
const SMILE_ON = 0.5;
const BROW_ON = 0.45;

export class FaceTracker {
    constructor() {
        this.isActive = false;
        this.isInitialized = false;
        this.videoElement = null;
        this.stream = null;
        this.landmarker = null;
        this.lastTimestamp = -1;

        // Callbacks (same interface as before, plus onPose)
        this.onBlink = null;
        this.onSmile = null;
        this.onEyebrowRaise = null;
        this.onRotation = null;       // (pitchDeg, yawDeg), raw camera-relative
        this.onMouthOpen = null;      // (0..1)
        this.onFaceMeshUpdate = null; // (landmarks[478])
        this.onPose = null;           // ({yaw, pitch, roll}, timestampMs)
        this.onFaceLost = null;

        // Edge detection
        this.prevBlink = false;
        this.prevSmiling = false;
        this.prevEyebrowRaised = false;

        this.pose = { yaw: 0, pitch: 0, roll: 0 };

        // FPS
        this.frameCount = 0;
        this.fps = 0;
        setInterval(() => {
            this.fps = this.frameCount;
            this.frameCount = 0;
        }, 1000);
    }

    async initialize() {
        if (this.isInitialized) return true;
        try {
            const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
            const options = {
                baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
                runningMode: 'VIDEO',
                numFaces: 1,
                outputFaceBlendshapes: true,
                outputFacialTransformationMatrixes: true,
            };
            try {
                this.landmarker = await FaceLandmarker.createFromOptions(fileset, options);
            } catch (gpuErr) {
                console.warn('GPU delegate unavailable, falling back to CPU:', gpuErr);
                options.baseOptions.delegate = 'CPU';
                this.landmarker = await FaceLandmarker.createFromOptions(fileset, options);
            }

            this.videoElement = document.createElement('video');
            this.videoElement.playsInline = true;
            this.videoElement.muted = true;
            this.videoElement.style.display = 'none';
            document.body.appendChild(this.videoElement);

            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error('Failed to initialize FaceTracker:', error);
            return false;
        }
    }

    async start() {
        if (this.isActive) return true;
        if (!this.isInitialized && !(await this.initialize())) return false;

        try {
            // Higher frame rate = lower motion-to-sound latency.
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, frameRate: { ideal: 60 } },
                audio: false,
            });
            this.videoElement.srcObject = this.stream;
            await this.videoElement.play();

            this.isActive = true;
            this.scheduleNextFrame();

            const debugConsole = document.getElementById('debug-console');
            if (debugConsole) debugConsole.style.display = 'block';
            return true;
        } catch (error) {
            console.error('Failed to start camera:', error);
            return false;
        }
    }

    stop() {
        this.isActive = false;
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
    }

    scheduleNextFrame() {
        if (!this.isActive) return;
        const video = this.videoElement;
        // requestVideoFrameCallback fires once per real camera frame, which
        // avoids re-processing the same frame at display refresh rate.
        if ('requestVideoFrameCallback' in video) {
            video.requestVideoFrameCallback(() => this.processFrame());
        } else {
            requestAnimationFrame(() => this.processFrame());
        }
    }

    processFrame() {
        if (!this.isActive) return;
        const video = this.videoElement;

        if (video.readyState >= 2) {
            // detectForVideo requires strictly increasing timestamps.
            let ts = performance.now();
            if (ts <= this.lastTimestamp) ts = this.lastTimestamp + 1;
            this.lastTimestamp = ts;

            try {
                const result = this.landmarker.detectForVideo(video, ts);
                this.onResults(result, ts);
            } catch (e) {
                console.error('Face Landmarker error:', e);
            }
        }
        this.scheduleNextFrame();
    }

    onResults(result, ts) {
        if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
            if (this.onFaceLost) this.onFaceLost();
            this.updateDebug(false);
            return;
        }

        const landmarks = result.faceLandmarks[0];

        // Head pose
        const matrix = result.facialTransformationMatrixes?.[0];
        if (matrix) {
            this.pose = matrixToEuler(matrix.data);
            if (this.onPose) this.onPose(this.pose, ts);
            if (this.onRotation) this.onRotation(this.pose.pitch, this.pose.yaw);
        }

        // Expressions
        const shapes = {};
        const categories = result.faceBlendshapes?.[0]?.categories || [];
        for (const c of categories) shapes[c.categoryName] = c.score;
        this.detectExpressions(shapes);

        if (this.onFaceMeshUpdate) this.onFaceMeshUpdate(landmarks);

        this.frameCount++;
        this.updateDebug(true);
    }

    detectExpressions(s) {
        const blinkL = s.eyeBlinkLeft || 0;
        const blinkR = s.eyeBlinkRight || 0;
        const blink = blinkL > BLINK_ON || blinkR > BLINK_ON;
        if (blink && !this.prevBlink && this.onBlink) this.onBlink();
        this.prevBlink = blink;

        const smile = ((s.mouthSmileLeft || 0) + (s.mouthSmileRight || 0)) / 2;
        const smiling = smile > SMILE_ON;
        if (smiling && !this.prevSmiling && this.onSmile) this.onSmile();
        this.prevSmiling = smiling;

        const brow = s.browInnerUp || 0;
        const raised = brow > BROW_ON;
        if (raised && !this.prevEyebrowRaised && this.onEyebrowRaise) this.onEyebrowRaise();
        this.prevEyebrowRaised = raised;

        const jaw = s.jawOpen || 0;
        if (this.onMouthOpen) this.onMouthOpen(Math.min(1, jaw * 1.5));

        this.expressionDebug = { blinkL, blinkR, smile, brow, jaw };
    }

    updateDebug(faceDetected) {
        const consoleEl = document.getElementById('debug-console');
        if (!consoleEl || consoleEl.style.display === 'none') return;

        const set = (id, text, color) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.textContent = text;
            if (color) el.style.color = color;
        };

        set('debug-detected', faceDetected ? 'YES' : 'NO', faceDetected ? '#00ff88' : '#ff3333');
        set('debug-fps', String(this.fps));
        if (!faceDetected) {
            set('debug-status', 'Searching', '#ffaa00');
            return;
        }
        set('debug-status', 'Tracking', '#00ff88');

        const p = this.pose;
        set('debug-rotation', `Y: ${p.yaw.toFixed(0)}° P: ${p.pitch.toFixed(0)}° R: ${p.roll.toFixed(0)}°`);

        const e = this.expressionDebug;
        if (e) {
            set('debug-blink', `${e.blinkL > BLINK_ON ? 'CLOSED' : 'Open'} / ${e.blinkR > BLINK_ON ? 'CLOSED' : 'Open'}`);
            set('debug-mouth', `jaw ${e.jaw.toFixed(2)} smile ${e.smile.toFixed(2)}`);
            set('debug-brow', e.brow.toFixed(2));
        }
    }

    destroy() {
        this.stop();
        if (this.landmarker) {
            this.landmarker.close();
            this.landmarker = null;
        }
        if (this.videoElement) {
            this.videoElement.remove();
            this.videoElement = null;
        }
        this.isInitialized = false;
    }
}
