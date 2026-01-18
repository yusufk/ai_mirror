import * as THREE from 'three';
import { Particles } from './particles.js';
import { FaceTracker } from './face-tracker.js';

class App {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.cameraMode = false;
        this.faceTracker = null;

        this.init();
        this.setupUI();
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

        // Face Tracker
        this.faceTracker = new FaceTracker();
        this.connectFaceTracker();
    }

    connectFaceTracker() {
        this.faceTracker.onBlink = () => this.particles.onCameraBlink();
        this.faceTracker.onSmile = () => this.particles.onCameraSmile();
        this.faceTracker.onEyebrowRaise = () => this.particles.onCameraEyebrowRaise();
        this.faceTracker.onRotation = (pitch, yaw) => this.particles.onCameraRotation(pitch, yaw);
        this.faceTracker.onMouthOpen = (val) => this.particles.onCameraMouthOpen(val);
    }

    setupUI() {
        const controls = document.getElementById('controls');
        const statusDiv = document.getElementById('status');
        const toggleBtn = document.getElementById('toggle-camera');

        toggleBtn.addEventListener('click', async () => {
            if (!this.cameraMode) {
                // Enable camera mode
                statusDiv.textContent = 'Initializing camera...';
                const success = await this.faceTracker.start();

                if (success) {
                    this.cameraMode = true;
                    this.particles.setCameraMode(true);
                    toggleBtn.textContent = 'Switch to Keyboard Mode';
                    statusDiv.textContent = 'Camera Active - Mirror your expressions!';
                    statusDiv.className = 'status active';
                } else {
                    statusDiv.textContent = 'Camera access denied or unavailable';
                    statusDiv.className = 'status error';
                }
            } else {
                // Disable camera mode
                this.faceTracker.stop();
                this.cameraMode = false;
                this.particles.setCameraMode(false);
                toggleBtn.textContent = 'Enable Camera Tracking';
                statusDiv.textContent = 'Keyboard Mode: Press S/E/T for expressions';
                statusDiv.className = 'status';
            }
        });
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

new App();
