import * as THREE from 'three';
import { Particles } from './particles.js';

class App {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.width = window.innerWidth;
        this.height = window.innerHeight;

        this.init();
        this.animate();
        this.setupResize();
    }

    init() {
        // Scene
        this.scene = new THREE.Scene();
        // this.scene.background = new THREE.Color(0x050510); // Managed by CSS, but good to have fallback

        // Camera
        this.camera = new THREE.PerspectiveCamera(75, this.width / this.height, 0.1, 1000);
        this.camera.position.z = 2.5;

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

            // Random blink
            if (Math.random() < 0.005) { // Approx once every few seconds
                this.particles.triggerBlink();
            }
        }

        this.renderer.render(this.scene, this.camera);
    }
}

new App();
