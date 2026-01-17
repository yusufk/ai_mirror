import * as THREE from 'three';
import { FaceGeometry } from './face-geometry.js';

export class Particles {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.count = 20000;

        this.mouse = new THREE.Vector2(0, 0); // Normalized for screen
        this.targetRotation = new THREE.Vector2(0, 0); // For head tracking

        this.blinkVal = 0;
        this.isBlinking = false;

        this.init();
        this.addEvents();
    }

    init() {
        const geometry = new THREE.BufferGeometry();

        // Generate Face Data
        const { positions, types } = FaceGeometry.generate(this.count);

        const randoms = new Float32Array(this.count);
        for (let i = 0; i < this.count; i++) randoms[i] = Math.random();

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('aType', new THREE.BufferAttribute(types, 1));
        geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));

        // Shader Material
        this.material = new THREE.ShaderMaterial({
            vertexShader: this.vertexShader(),
            fragmentShader: this.fragmentShader(),
            uniforms: {
                uTime: { value: 0 },
                uBlink: { value: 0 }, // 0 = Open, 1 = Closed
                uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        this.points = new THREE.Points(geometry, this.material);
        this.scene.add(this.points);

        // Group for rotation? No, let's rotate the points object directly.
    }

    vertexShader() {
        return `
            uniform float uTime;
            uniform float uBlink;
            
            attribute float aType; // 0: Skin, 1: Left Eye, 2: Right Eye
            attribute float aRandom;
            
            varying float vType;
            varying float vAlpha;
            
            void main() {
                vec3 pos = position;
                vType = aType;
                
                // Tech/Digital Glitch Movement (stuttery)
                // float glitch = step(0.98, sin(uTime * 10.0 + pos.y * 5.0));
                // pos.x += glitch * 0.02;
                
                // Subtle breathing
                pos.z += sin(uTime + pos.x) * 0.01;
                
                // Blinking Logic
                if (aType > 0.5) {
                    // It's an eye (1 or 2)
                    // If blink is active, squish Y towards center of eye?
                    // Better: Mask them out or move eyelids.
                    // Let's just scale Y of eye points to 0 when blinking
                    
                    // Simple "shut" animation:
                    // If uBlink > 0, we contract the eye points vertically towards their center?
                    // Center of L Eye ~ (-0.35, 0.1), R Eye ~ (0.35, 0.1)
                    
                    float eyeY = 0.1;
                    if (uBlink > 0.0) {
                       pos.y = mix(pos.y, eyeY, uBlink); 
                    }
                }
                
                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                
                gl_PointSize = (4.0 / -mvPosition.z);
                
                // Twinkle
                vAlpha = 0.8 + 0.2 * sin(uTime * 5.0 + aRandom * 100.0);
            }
        `;
    }

    fragmentShader() {
        return `
            varying float vType;
            varying float vAlpha;
            
            void main() {
                vec2 center = gl_PointCoord - 0.5;
                float dist = length(center);
                if (dist > 0.5) discard;
                
                float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
                
                // Viki Colors: Clean White / Tech Blue / Hologram
                vec3 colSkin = vec3(0.5, 0.7, 1.0); // Translucent blueish white
                vec3 colEye = vec3(1.0, 1.0, 1.0); // Bright white eyes
                
                vec3 finalColor = (vType > 0.5) ? colEye : colSkin;
                
                // Make eyes glow brighter
                float intensity = (vType > 0.5) ? 1.5 : 0.6;
                
                gl_FragColor = vec4(finalColor * intensity, alpha * vAlpha);
            }
        `;
    }

    addEvents() {
        window.addEventListener('mousemove', (e) => {
            // Normalized -1 to 1
            this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

            // Calculate target rotation (look at mouse)
            // Limit rotation angles
            this.targetRotation.x = this.mouse.y * 0.5; // Pitch (Up/Down)
            this.targetRotation.y = this.mouse.x * 0.5; // Yaw (Left/Right)
        });
    }

    triggerBlink() {
        if (this.isBlinking) return;
        this.isBlinking = true;
        let startTime = performance.now();
        let duration = 200; // ms

        const blinkAnim = () => {
            let now = performance.now();
            let progress = (now - startTime) / duration;

            if (progress >= 1) {
                this.material.uniforms.uBlink.value = 0;
                this.isBlinking = false;
                return;
            }

            // 0 -> 1 -> 0 parbaola-ish
            // sin(PI * progress)
            this.material.uniforms.uBlink.value = Math.sin(Math.PI * progress);

            requestAnimationFrame(blinkAnim);
        };
        blinkAnim();
    }

    onResize(width, height) {
        this.material.uniforms.uResolution.value.set(width, height);
    }

    update(time) {
        this.material.uniforms.uTime.value = time;

        // Smooth Rotation
        this.points.rotation.x += (this.targetRotation.x * 0.5 - this.points.rotation.x) * 0.1;
        this.points.rotation.y += (this.targetRotation.y * 0.5 - this.points.rotation.y) * 0.1;
    }
}
