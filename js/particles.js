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

                // --- BLINKING ---
                if (vType > 0.5) {
                    float eyeCenterY = 315.0; // 7.0 * 45
                    if (uBlink > 0.0) {
                       pos.y = mix(pos.y, eyeCenterY, uBlink * 0.9); // Strong blink
                    }
                }
                
                // --- SMILE ---
                // Mouth area: lower face, center region
                // Original: y > -15 and y < -5, abs(x) < 15
                bool isMouth = pos.y > -675.0 && pos.y < -225.0 && abs(pos.x) < 675.0;
                if (isMouth && uSmile > 0.0) {
                    // Lift corners of mouth and widen
                    float mouthCenterY = -450.0; // -10.0 * 45
                    float distFromCenter = abs(pos.x) / 675.0;
                    pos.y += uSmile * 135.0 * distFromCenter; // Corners lift more (3.0 * 45)
                    pos.x *= 1.0 + uSmile * 0.15; // Slight widening
                }
                
                // --- EYEBROW RAISE ---
                // Eyebrow area: above eyes
                // Original: y > 10 and y < 18
                bool isEyebrow = pos.y > 450.0 && pos.y < 810.0;
                if (isEyebrow && uEyebrow > 0.0) {
                    pos.y += uEyebrow * 225.0; // Raise eyebrows (5.0 * 45)
                }
                
                // --- TALK ---
                // Jaw/mouth movement
                if (isMouth && uTalk > 0.0) {
                    pos.y -= uTalk * 180.0; // Open mouth by moving lower (4.0 * 45)
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
                // Y range is approx -20 (Chin) to +20 (Forehead)
                // Highlight middle band (-5 to 10)
                float highlightBand = smoothstep(-15.0, 0.0, vElevation) * (1.0 - smoothstep(10.0, 20.0, vElevation));
                
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
        this.points.rotation.x += (this.targetRotation.x - this.points.rotation.x) * 0.1;
        this.points.rotation.y += (this.targetRotation.y - this.points.rotation.y) * 0.1;
    }
}
