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

        // Generate Face Data (Mesh Sampling)
        const { positions, types } = FaceGeometry.generate(this.count);

        const randoms = new Float32Array(this.count);
        for (let i = 0; i < this.count; i++) randoms[i] = Math.random();

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('aType', new THREE.BufferAttribute(types, 1));
        geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));

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

    vertexShader() {
        return `
            uniform float uTime;
            uniform float uBlink;
            uniform float uSmile;
            uniform float uEyebrow;
            uniform float uTalk;
            
            attribute float aType; 
            attribute float aRandom;
            
            varying float vType;
            varying float vAlpha;
            varying float vElevation; // For gradient colors
            
            void main() {
                // Scale Canonical Face (cm -> visible units)
                vec3 pos = position * 45.0; 
                
                vElevation = pos.y; // Pass Y for gradients
                
                // --- NO GEOMETRY WARPING (Reverted) ---
                // We trust the standard mesh topology.
                
                // --- EYE IDENTIFICATION ---
                vType = 0.0;
                // Scaled coordinates: multiply MediaPipe by 45
                // Original eye range was y: 2-12, x: -18 to -6 and 6-18
                if (pos.y > 90.0 && pos.y < 540.0) {  // ~2*45 to ~12*45
                     if (pos.x > -810.0 && pos.x < -270.0) vType = 1.0; // Left eye
                     if (pos.x > 270.0 && pos.x < 810.0) vType = 2.0; // Right eye
                }

                // --- ANIMATION LOGIC ---
                // We use distance fields for organic deformation
                
                // --- BLINKING ---
                // Smooth falloff around eye center
                float eyeCenterY = 315.0; // ~7.0 * 45
                float eyeL_X = -540.0; // -12 * 45
                float eyeR_X = 540.0;  // 12 * 45
                
                float distEyeL = distance(pos.xy, vec2(eyeL_X, eyeCenterY));
                float distEyeR = distance(pos.xy, vec2(eyeR_X, eyeCenterY));
                
                // Radius of influence for eyes
                float eyeRadius = 300.0; 
                
                if (uBlink > 0.0) {
                    // Left Eye - Smoother weighted pull to center
                    float influenceL = smoothstep(eyeRadius, 0.0, distEyeL);
                    if (influenceL > 0.0) {
                        // Upper lid moves down more than lower lid moves up (approx 70/30 split)
                        float targetY = eyeCenterY;
                        float offset = (pos.y - targetY);
                        if (offset > 0.0) {
                            pos.y -= offset * uBlink * influenceL * 1.0; // Upper lid closes fully
                        } else {
                            pos.y -= offset * uBlink * influenceL * 0.3; // Lower lid moves up slightly
                        }
                    }
                    
                    // Right Eye
                    float influenceR = smoothstep(eyeRadius, 0.0, distEyeR);
                    if (influenceR > 0.0) {
                         float targetY = eyeCenterY;
                        float offset = (pos.y - targetY);
                        if (offset > 0.0) {
                            pos.y -= offset * uBlink * influenceR * 1.0;
                        } else {
                            pos.y -= offset * uBlink * influenceR * 0.3;
                        }
                    }
                }
                
                // --- SMILE ---
                // Organic mouth deformation - Simpler, cleaner curve
                vec2 mouthCenter = vec2(0.0, -450.0); // -10.0 * 45
                float distMouth = distance(pos.xy, mouthCenter);
                float mouthRadius = 600.0;
                
                if (uSmile > 0.0 && distMouth < mouthRadius) {
                    float influence = smoothstep(mouthRadius, 0.0, distMouth);
                    
                    // Normalize X (-1 to 1) within mouth region
                    float xFactor = clamp(pos.x / 600.0, -1.0, 1.0);
                    
                    // Quadratic curve for smile: y = x^2
                    float lift = xFactor * xFactor; 
                    
                    // Apply lift to corners (simple additive offset)
                    pos.y += uSmile * 250.0 * lift * influence;
                    
                    // Widen mouth slightly
                    pos.x += sign(pos.x) * uSmile * 80.0 * influence;
                }
                
                // --- EYEBROW RAISE ---
                // Forehead influence
                float browY = 500.0;
                if (uEyebrow > 0.0 && pos.y > 300.0) {
                    float distBrow = abs(pos.y - browY);
                    float influence = smoothstep(800.0, 0.0, distBrow);
                    
                    // Simple uniform lift with side arch
                    float arch = 1.0 + (abs(pos.x) / 900.0) * 0.5; // Sides lift more
                    pos.y += uEyebrow * 180.0 * influence * arch;
                }
                
                // --- TALK ---
                // Jaw movement (simple vertical drop with falloff)
                if (uTalk > 0.0 && pos.y < -200.0) {
                    float jawInfluence = smoothstep(-200.0, -900.0, pos.y);
                    pos.y -= uTalk * 250.0 * jawInfluence;
                }
                
                // --- ANIMATION ---
                // Gentle floating
                pos.z += sin(uTime * 0.5 + pos.y * 0.05) * 2.0;
                
                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                
                // Size attenuation - Massive chunky pixels (10x larger)
                float sizeBase = 6000.0; 
                if (vType > 0.5) sizeBase = 8000.0; // Huge eyes
                
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
