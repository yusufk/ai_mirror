import * as THREE from 'three';
import { FaceGeometry } from './face-geometry.js';

export class Particles {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.count = 2500; // Viki-style: fewer, larger pixels

        this.mouse = new THREE.Vector2(0, 0);
        this.targetRotation = new THREE.Vector2(0, 0);

        this.blinkVal = 0;
        this.isBlinking = false;

        this.smileVal = 0;
        this.isSmiling = false;

        this.eyebrowVal = 0;
        this.isRaisingEyebrow = false;

        this.talkVal = 0;
        this.isTalking = false;

        // Camera tracking mode
        this.cameraMode = false;
        this.trackedRotation = new THREE.Vector2(0, 0);

        this.init();
        this.addEvents();
    }

    init() {
        const geometry = new THREE.BufferGeometry();

        // Standard MediaPipe Face Mesh has 468 landmarks + 10 iris = 478
        // We originally used 2500. Let's stick to 478 for 1:1, or we could duplicate.
        // For accurate "Surface Map", 1:1 is best. Viki is "chunky" anyway.
        this.count = 478;

        // Initial positions (placeholder or Viki grid subset)
        // We'll just initialize empty/random and let the camera snap them.
        const positions = new Float32Array(this.count * 3);
        const types = new Float32Array(this.count);
        const randoms = new Float32Array(this.count);

        for (let i = 0; i < this.count; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 500;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 500;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 500;
            types[i] = 0; // Default skin
            randoms[i] = Math.random();
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('aType', new THREE.BufferAttribute(types, 1));
        geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));
        // Mark as dynamic for frequent updates
        geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);

        this.material = new THREE.ShaderMaterial({
            vertexShader: this.vertexShader(),
            fragmentShader: this.fragmentShader(),
            uniforms: {
                uTime: { value: 0 },
                uBlink: { value: 0 },
                uSmile: { value: 0 },
                uEyebrow: { value: 0 },
                uTalk: { value: 0 },
                uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        this.points = new THREE.Points(geometry, this.material);
        this.scene.add(this.points);
    }

    updateFaceMesh(landmarks) {
        // landmarks is array of {x, y, z} from 0 to 1 (normalized) typically, or world coords?
        // MediaPipe usually gives: 
        // x: 0 to 1 (left to right)
        // y: 0 to 1 (top to bottom)
        // z: relative depth (scaled similar to x)

        const posAttribute = this.points.geometry.attributes.position;
        const positions = posAttribute.array;

        // Scale factors to match Three.js world space
        // Viki face is usually ~900 units wide? (20cm * 45 scale)
        const scale = 1000.0;
        const xOffset = -500.0;
        const yOffset = 500.0; // Flip Y? JS coords y=0 is top. ThreeJS y=0 is center.

        for (let i = 0; i < landmarks.length && i < this.count; i++) {
            const p = landmarks[i];

            // Map MediaPipe (0..1) to ThreeJS World
            // MP x: 0(left) -> 1(right). ThreeJS: -x(left) -> +x(right)
            // We need to mirror X for a "Mirror" effect?
            // If user tilts head right, image tilts right.

            // Center and scale
            const x = -(p.x - 0.5) * scale; // Flip X for mirror feel?
            const y = -(p.y - 0.5) * scale; // Flip Y (MP y=0 is top, ThreeJS y is up)
            // Z in MP is depth relative to face center. 
            const z = -p.z * scale;

            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;
        }

        posAttribute.needsUpdate = true;
    }

    vertexShader() {
        return `
            uniform float uTime;
            
            attribute float aType; 
            attribute float aRandom;
            
            varying float vType;
            varying float vAlpha;
            varying float vElevation; // For gradient colors
            
            void main() {
                // Position is now driven DIRECTLY by JS keypoints
                vec3 pos = position;
                
                vElevation = pos.y; 
                
                // Identify eyes based on index? Or just simplistic height check for color
                // Viki eyes are bright.
                // In MP, eyes are specific indices. But passed 'aType' is static 0.
                // We can use a uniform array of indices? Too expensive.
                // We'll stick to a simple spatial check for eye color.
                vType = 0.0;
                // Rough eye regions in world space
                if (pos.y > 50.0 && abs(pos.x) > 100.0 && abs(pos.x) < 300.0) {
                     vType = 1.0; 
                }

                // --- ANIMATION ---
                // Gentle floating
                // pos.z += sin(uTime * 0.5 + pos.y * 0.05) * 2.0;
                
                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                
                // Size attenuation - Massive chunky pixels
                float sizeBase = 4000.0; // Slightly smaller since they are points
                
                gl_PointSize = (sizeBase / -mvPosition.z); 
                
                // Subtle twinkle - mostly bright
                vAlpha = 0.85 + 0.15 * sin(uTime * 1.5 + aRandom * 100.0);
            }
        `;
    }

    fragmentShader() {
        return `
            varying float vType;
            varying float vAlpha;
            varying float vElevation;
            
            void main() {
                vec2 center = gl_PointCoord - 0.5;
                float dist = length(center);
                if (dist > 0.5) discard;
                
                float alpha = 1.0 - smoothstep(0.4, 0.5, dist);
                alpha *= vAlpha;
                
                // --- COLOR GRADING ---
                // Viki-style: Bright white/cyan holographic look
                
                vec3 colBase = vec3(0.7, 0.85, 1.0); // Bright cyan-white
                vec3 colHighlight = vec3(0.95, 0.98, 1.0); // Nearly pure white
                
                // Mix based on "Elevation" (Y) to highlight brow/eyes/lips area
                // Y range derived from approx -20 to +20 (raw) -> Scaled in Vertex
                // Here vElevation is already scaled.
                
                // Highlight middle band
                float highlightBand = smoothstep(-675.0, 0.0, vElevation) * (1.0 - smoothstep(450.0, 900.0, vElevation));
                
                vec3 skinColor = mix(colBase, colHighlight, highlightBand * 0.8);
                
                // Eyes: Pure Bright White
                vec3 colEye = vec3(1.0, 1.0, 1.0); 
                
                vec3 finalColor = (vType > 0.5) ? colEye : skinColor;
                
                gl_FragColor = vec4(finalColor, alpha);
            }
        `;
    }

    addEvents() {
        window.addEventListener('mousemove', (e) => {
            this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

            this.targetRotation.x = -this.mouse.y * 0.3;
            this.targetRotation.y = this.mouse.x * 0.3;
        });

        // Keyboard controls for expressions
        window.addEventListener('keydown', (e) => {
            // Only process keyboard if not in camera mode
            if (this.cameraMode) return;

            switch (e.key.toLowerCase()) {
                case 's':
                    this.triggerSmile();
                    break;
                case 'e':
                    this.triggerEyebrowRaise();
                    break;
                case 't':
                    this.triggerTalk();
                    break;
            }
        });
    }

    // Camera mode methods
    setCameraMode(enabled) {
        this.cameraMode = enabled;
    }

    onCameraBlink() {
        this.triggerBlink();
    }

    onCameraSmile() {
        this.triggerSmile();
    }

    onCameraEyebrowRaise() {
        this.triggerEyebrowRaise();
    }

    onCameraRotation(pitchDeg, yawDeg) {
        // Convert degrees to radians and update tracked rotation
        this.trackedRotation.x = pitchDeg * (Math.PI / 180);
        this.trackedRotation.y = yawDeg * (Math.PI / 180);
    }

    triggerBlink() {
        if (this.isBlinking) return;
        this.isBlinking = true;
        let startTime = performance.now();
        let duration = 250;

        const blinkAnim = () => {
            let now = performance.now();
            let progress = (now - startTime) / duration;

            if (progress >= 1) {
                this.material.uniforms.uBlink.value = 0;
                this.isBlinking = false;
                return;
            }
            this.material.uniforms.uBlink.value = Math.sin(Math.PI * progress);
            requestAnimationFrame(blinkAnim);
        };
        blinkAnim();
    }

    triggerSmile() {
        if (this.isSmiling) return;
        this.isSmiling = true;
        let startTime = performance.now();
        let duration = 500; // Slower for smile

        const smileAnim = () => {
            let now = performance.now();
            let progress = (now - startTime) / duration;

            if (progress >= 1) {
                this.material.uniforms.uSmile.value = 0;
                this.isSmiling = false;
                return;
            }
            this.material.uniforms.uSmile.value = Math.sin(Math.PI * progress);
            requestAnimationFrame(smileAnim);
        };
        smileAnim();
    }

    triggerEyebrowRaise() {
        if (this.isRaisingEyebrow) return;
        this.isRaisingEyebrow = true;
        let startTime = performance.now();
        let duration = 400;

        const eyebrowAnim = () => {
            let now = performance.now();
            let progress = (now - startTime) / duration;

            if (progress >= 1) {
                this.material.uniforms.uEyebrow.value = 0;
                this.isRaisingEyebrow = false;
                return;
            }
            this.material.uniforms.uEyebrow.value = Math.sin(Math.PI * progress);
            requestAnimationFrame(eyebrowAnim);
        };
        eyebrowAnim();
    }

    triggerTalk() {
        if (this.isTalking) return;
        this.isTalking = true;
        let startTime = performance.now();
        let duration = 600; // Longer for talking

        const talkAnim = () => {
            let now = performance.now();
            let progress = (now - startTime) / duration;

            if (progress >= 1) {
                this.material.uniforms.uTalk.value = 0;
                this.isTalking = false;
                return;
            }
            // Multiple bounces for talking effect
            this.material.uniforms.uTalk.value = Math.abs(Math.sin(Math.PI * progress * 3)) * (1 - progress);
            requestAnimationFrame(talkAnim);
        };
        talkAnim();
    }

    // Continuous update for camera mode
    setTalkValue(val) {
        // val is 0.0 to 1.0
        // Smoothly interpolate to avoid jitter
        let current = this.material.uniforms.uTalk.value;
        this.material.uniforms.uTalk.value += (val - current) * 0.3;
    }

    onCameraMouthOpen(val) {
        this.setTalkValue(val);
    }

    onResize(width, height) {
        this.material.uniforms.uResolution.value.set(width, height);
    }

    update(time) {
        this.material.uniforms.uTime.value = time;

        // Use camera rotation if in camera mode, otherwise use mouse
        if (this.cameraMode) {
            this.points.rotation.x += (this.trackedRotation.x - this.points.rotation.x) * 0.15;
            this.points.rotation.y += (this.trackedRotation.y - this.points.rotation.y) * 0.15;
        } else {
            this.points.rotation.x += (this.targetRotation.x - this.points.rotation.x) * 0.1;
            this.points.rotation.y += (this.targetRotation.y - this.points.rotation.y) * 0.1;
        }
    }
}
