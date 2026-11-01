import * as THREE from 'three';
import { Particles } from './particles.js';
import { FaceTracker } from './face-tracker.js';
import { GestureManager } from './gesture-manager.js';
import { HeadPose } from './head-pose.js';
import { AudioUI } from './audio-ui.js';

class App {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.cameraMode = false;
        this.faceTracker = null;

        this.init();
        this.setupUI();
        this.setupCaptureUI(); // Required for recording logic
        this.animate();
        this.setupResize();
    }

    init() {
        // Scene
        this.scene = new THREE.Scene();
        // this.scene.background = new THREE.Color(0x050510); // Managed by CSS, but good to have fallback

        // Camera
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 1000);
        this.camera.position.z = 800; // Further zoomed out for better perspective

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: true,
            powerPreference: "high-performance"
        });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);

        // Particles
        this.particles = new Particles(this.scene, this.camera);

        // Gesture Manager
        this.gestureManager = new GestureManager();

        // Face Tracker
        this.faceTracker = new FaceTracker();
        this.headPose = new HeadPose();
        this.connectFaceTracker();

        // Head-tracked spatial audio
        this.audioUI = new AudioUI({
            headPose: this.headPose,
            faceTracker: this.faceTracker,
            ensureCamera: () => this.enableCamera(),
        });

        // Load initial gestures into particles
        this.particles.loadGestures(this.gestureManager.getAllGestures());
    }

    connectFaceTracker() {
        this.faceTracker.onBlink = () => this.particles.onCameraBlink();
        this.faceTracker.onSmile = () => this.particles.onCameraSmile();
        this.faceTracker.onEyebrowRaise = () => this.particles.onCameraEyebrowRaise();
        // Head rotation is already baked into the landmarks that drive the
        // particles, so it isn't applied to the mesh a second time. The real
        // pose feeds the spatial audio instead.
        this.faceTracker.onPose = (pose, ts) => this.headPose.update(pose, ts);
        this.faceTracker.onMouthOpen = (val) => this.particles.onCameraMouthOpen(val);

        // Direct Mesh Mapping
        this.faceTracker.onFaceMeshUpdate = (landmarks) => {
            // If recording, push deep copy of landmarks
            if (this.isRecording) {
                // Deep copy landmarks array
                const frame = landmarks.map(p => ({ x: p.x, y: p.y, z: p.z }));
                this.recordedFrames.push(frame);
            }

            if (this.cameraMode) {
                this.particles.updateFaceMesh(landmarks);
            }
        };
    }

    setupCaptureUI() {
        const modal = document.getElementById('gesture-modal');
        // Capture Button
        const captureBtn = document.getElementById('btn-record');
        const btnSave = document.getElementById('btn-save-gesture');
        const btnCancel = document.getElementById('btn-cancel-gesture');

        const overlay = document.getElementById('recording-overlay');
        const countdownEl = document.getElementById('countdown');
        const statusEl = document.getElementById('recording-status');

        const inputName = document.getElementById('gesture-name');
        const inputKey = document.getElementById('gesture-key');

        if (!captureBtn) return;

        captureBtn.addEventListener('click', () => {
            this.startRecordingSequence();
        });

        btnCancel.addEventListener('click', () => {
            modal.classList.add('hidden');
        });

        btnSave.addEventListener('click', () => {
            const name = inputName.value.trim();
            const key = inputKey.value.trim().toUpperCase();

            if (!name || !key) {
                alert("Please enter both a name and a key.");
                return;
            }

            // Process Frames into Deltas
            // We assume the first frame is "Neutral".
            // Delta = Frame[i] - Frame[0]
            if (!this.recordedFrames || this.recordedFrames.length === 0) {
                alert("No frames to save!");
                return;
            }

            const baseFrame = this.recordedFrames[0];
            const deltas = [];

            for (let i = 0; i < this.recordedFrames.length; i++) {
                const frame = this.recordedFrames[i];
                const frameDelta = [];
                for (let j = 0; j < frame.length; j++) {
                    // Raw delta: just position difference
                    frameDelta.push({
                        x: frame[j].x - baseFrame[j].x,
                        y: frame[j].y - baseFrame[j].y,
                        z: frame[j].z - baseFrame[j].z
                    });
                }
                deltas.push(frameDelta);
            }

            // Save gesture with Deltas
            this.gestureManager.saveGesture(name, key, deltas);

            modal.classList.add('hidden');
            alert(`Gesture '${name}' saved to key '${key}'`);

            this.particles.loadGestures(this.gestureManager.getAllGestures());
        });
    }

    startRecordingSequence() {
        const overlay = document.getElementById('recording-overlay');
        const countdownEl = document.getElementById('countdown');
        const statusEl = document.getElementById('recording-status');

        overlay.classList.remove('hidden');
        statusEl.classList.add('hidden');
        countdownEl.classList.remove('hidden');

        let count = 3;
        countdownEl.innerText = count;

        const timer = setInterval(() => {
            count--;
            if (count > 0) {
                countdownEl.innerText = count;
            } else {
                clearInterval(timer);
                // Start Recording
                countdownEl.classList.add('hidden');
                statusEl.classList.remove('hidden');
                this.recordFrames();
            }
        }, 1000);
    }

    recordFrames() {
        this.recordedFrames = [];
        this.isRecording = true;

        // Record for 3 seconds
        setTimeout(() => {
            this.isRecording = false;
            document.getElementById('recording-overlay').classList.add('hidden');

            if (this.recordedFrames.length === 0) {
                alert("No frames captured! Ensure camera is tracking.");
                return;
            }

            // Open Save Dialog
            const modal = document.getElementById('gesture-modal');
            const inputName = document.getElementById('gesture-name');
            const inputKey = document.getElementById('gesture-key');

            modal.classList.remove('hidden');
            inputName.value = '';
            inputKey.value = '';
            inputName.focus();

        }, 3000);
    }

    setupUI() {
        const controls = document.getElementById('controls');
        const statusDiv = document.getElementById('status');
        const toggleBtn = document.getElementById('toggle-camera');

        // UI Visiblity Toggle
        const uiToggleBtn = document.getElementById('ui-toggle');
        const uiPanel = document.getElementById('ui-panel');

        uiToggleBtn.addEventListener('click', () => {
            uiPanel.classList.toggle('hidden');
            // Change icon based on state
            uiToggleBtn.textContent = uiPanel.classList.contains('hidden') ? '👁️' : '✖️';
        });

        // Set initial icon
        uiToggleBtn.textContent = '✖️';

        toggleBtn.addEventListener('click', async () => {
            if (!this.cameraMode) {
                await this.enableCamera();
            } else {
                this.disableCamera();
            }
        });
    }

    async enableCamera() {
        if (this.cameraMode) return true;
        const statusDiv = document.getElementById('status');
        const toggleBtn = document.getElementById('toggle-camera');

        statusDiv.textContent = 'Loading face tracker...';
        const success = await this.faceTracker.start();

        if (!success) {
            statusDiv.textContent = 'Camera access denied or unavailable';
            statusDiv.className = 'status error';
            return false;
        }

        this.headPose.reset(); // auto-centre on the first frame
        this.cameraMode = true;
        this.particles.setCameraMode(true);
        toggleBtn.textContent = 'Switch to Keyboard Mode';
        statusDiv.textContent = 'Camera Active - Mirror your expressions!';
        statusDiv.className = 'status active';

        const btnRecord = document.getElementById('btn-record');
        if (btnRecord) btnRecord.style.display = 'block';
        return true;
    }

    disableCamera() {
        const statusDiv = document.getElementById('status');
        const toggleBtn = document.getElementById('toggle-camera');

        this.faceTracker.stop();
        this.headPose.reset();
        this.cameraMode = false;
        this.particles.setCameraMode(false);
        toggleBtn.textContent = 'Enable Camera Tracking';
        statusDiv.textContent = 'Keyboard Mode: Press S/E/T for expressions';
        statusDiv.className = 'status';

        const btnRecord = document.getElementById('btn-record');
        if (btnRecord) btnRecord.style.display = 'none';
    }

    setupResize() {
        window.addEventListener('resize', () => {
            this.width = window.innerWidth;
            this.height = window.innerHeight;

            this.camera.aspect = this.width / this.height;
            this.camera.updateProjectionMatrix();

            this.renderer.setSize(this.width, this.height);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

            if (this.particles) this.particles.onResize(this.width, this.height);
        });
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));

        const time = performance.now() * 0.001;

        if (this.particles) {
            this.particles.update(time);

            // Random blink (only in keyboard mode)
            if (!this.cameraMode && Math.random() < 0.005) {
                this.particles.triggerBlink();
            }
        }

        this.renderer.render(this.scene, this.camera);
    }
}

// Exposed for debugging from the browser console.
window.viki = new App();
