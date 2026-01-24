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

        // Gestures
        this.gestures = {};
        this.activeMorph = null;

        this.init();
        this.addEvents();
    }

    init() {
        const geometry = new THREE.BufferGeometry();

        // Restore Viki Grid for initial state
        this.count = 2500;
        const { positions, types } = FaceGeometry.generate(this.count);

        const randoms = new Float32Array(this.count);
        for (let i = 0; i < this.count; i++) randoms[i] = Math.random();

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('aType', new THREE.BufferAttribute(types, 1));
        geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));
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

    loadGestures(gestureMap) {
        this.gestures = gestureMap;
        console.log("Particles loaded gestures:", Object.keys(this.gestures));
    }

    updateFaceMesh(landmarks) {
        const posAttribute = this.points.geometry.attributes.position;
        const positions = posAttribute.array;
        const scale = 1000.0;

        for (let i = 0; i < this.count; i++) {
            if (i < landmarks.length) {
                const p = landmarks[i];
                const x = -(p.x - 0.5) * scale;
                const y = -(p.y - 0.5) * scale;
                const z = -p.z * scale;

                positions[i * 3] = x;
                positions[i * 3 + 1] = y;
                positions[i * 3 + 2] = z;
            } else {
                positions[i * 3] = 0;
                positions[i * 3 + 1] = 0;
                positions[i * 3 + 2] = 0;
            }
        }
        posAttribute.needsUpdate = true;
    }

    morphToGesture(landmarks, duration = 400) {
        const startPositions = new Float32Array(this.points.geometry.attributes.position.array);
        const targetPositions = new Float32Array(this.count * 3);
        const scale = 1000.0;

        for (let i = 0; i < this.count; i++) {
            if (i < landmarks.length) {
                const p = landmarks[i];
                targetPositions[i * 3] = -(p.x - 0.5) * scale;
                targetPositions[i * 3 + 1] = -(p.y - 0.5) * scale;
                targetPositions[i * 3 + 2] = -p.z * scale;
            } else {
                targetPositions[i * 3] = 0;
                targetPositions[i * 3 + 1] = 0;
                targetPositions[i * 3 + 2] = 0;
            }
        }

        this.activeMorph = {
            start: startPositions,
            end: targetPositions,
            startTime: performance.now(),
            duration: duration
        };
    }

    vertexShader() {
        return `
            uniform float uTime;
            attribute float aType; 
            attribute float aRandom;
            varying float vType;
            varying float vAlpha;
            varying float vElevation;
            
            void main() {
                vec3 pos = position;
                vElevation = pos.y; 
                vType = 0.0;
                if (pos.y > 50.0 && abs(pos.x) > 100.0 && abs(pos.x) < 300.0) {
                     vType = 1.0; 
                }

                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                
                float sizeBase = 4000.0; 
                gl_PointSize = (sizeBase / -mvPosition.z); 
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
                
                vec3 colBase = vec3(0.7, 0.85, 1.0);
                vec3 colHighlight = vec3(0.95, 0.98, 1.0);
                
                float highlightBand = smoothstep(-675.0, 0.0, vElevation) * (1.0 - smoothstep(450.0, 900.0, vElevation));
                vec3 skinColor = mix(colBase, colHighlight, highlightBand * 0.8);
                vec3 colEye = vec3(1.0, 1.0, 1.0); 
                
                vec3 finalColor = (vType > 0.5) ? colEye : skinColor;
                gl_FragColor = vec4(finalColor, alpha);
            }
        `;
    }

    playGestureAnimation(deltas, durationMs = 3000) {
        // Deltas is array of array of {x,y,z}
        // Playback: We need to animate through these frames.
        // If recording was ~30fps for 3s, we have ~90 frames.

        this.activeAnimation = {
            frames: deltas,
            startTime: performance.now(),
            duration: durationMs, // Playback at originally recorded speed? Or fixed 3s? 
            // If we want exact replay speed, we should rely on frame count * 16ms or similiar?
            // Let's assume 3000ms for now.
        };

        // Capture a "Base Pose" for this animation?
        // In Keyboard mode, face is static. We apply delta to CURRENT static pose.
        // We need to store the "Base" state when animation starts.
        const currentPos = this.points.geometry.attributes.position.array;
        this.animationBase = new Float32Array(currentPos);
    }

    addEvents() {
        window.addEventListener('mousemove', (e) => {
            this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

            this.targetRotation.x = -this.mouse.y * 0.3;
            this.targetRotation.y = this.mouse.x * 0.3;
        });

        window.addEventListener('keydown', (e) => {
            if (this.cameraMode) return;
            const key = e.key.toLowerCase();

            if (this.gestures && this.gestures[key]) {
                const g = this.gestures[key];
                // Check if it is a delta animation (array of frames) or old snapshot
                if (Array.isArray(g.landmarks) && g.landmarks.length > 0 && Array.isArray(g.landmarks[0])) {
                    // It's the new Delta format (landmarks property was actually used to store deltas in main.js saveGesture call?)
                    // wait, main.js calls: this.gestureManager.saveGesture(name, key, deltas);
                    // The 3rd arg is usually 'landmarks', so g.landmarks holds the deltas.
                    console.log("Replaying animation:", g.name);
                    this.playGestureAnimation(g.landmarks);
                } else if (Array.isArray(g.landmarks) && g.landmarks.length > 0 && typeof g.landmarks[0] === 'object' && 'x' in g.landmarks[0]) {
                    // It's an old snapshot (single frame of landmarks)
                    console.log("Replaying static gesture:", g.name);
                    this.morphToGesture(g.landmarks);
                } else {
                    // Fallback??
                    console.log("Unknown gesture format for key:", key, g);
                }
                return;
            }

            // Legacy fallbacks
            switch (key) {
                case 's': this.triggerSmile(); break;
                case 'e': this.triggerEyebrowRaise(); break;
                case 't': this.triggerTalk(); break;
            }
        });
    }

    setCameraMode(enabled) {
        this.cameraMode = enabled;
    }

    onCameraRotation(pitchDeg, yawDeg) {
        this.trackedRotation.x = pitchDeg * (Math.PI / 180);
        this.trackedRotation.y = yawDeg * (Math.PI / 180);
    }

    // Legacy / Unused but kept for interface safety
    triggerSmile() { }
    triggerEyebrowRaise() { }
    triggerTalk() { }
    triggerBlink() { }
    onCameraBlink() { }
    onCameraSmile() { }
    onCameraEyebrowRaise() { }
    onCameraMouthOpen(val) { this.setTalkValue(val); }
    setTalkValue(val) {
        // Legacy: if uTalk existed. For now doing nothing or we can re-add uTalk.
        // Since we did direct mapping, uTalk is irrelevant for camera mode!
        // But for keyboard mode, we might want it.
        // We removed uTalk from shader, so removing logic here.
    }

    onResize(width, height) {
        this.material.uniforms.uResolution.value.set(width, height);
    }

    update(time) {
        this.material.uniforms.uTime.value = time;

        if (this.activeAnimation && this.animationBase) {
            const now = performance.now();
            const elapsed = now - this.activeAnimation.startTime;
            const progress = elapsed / this.activeAnimation.duration; // 0 to 1

            if (progress < 1.0) {
                const frames = this.activeAnimation.frames;
                // Calculate current frame index (float)
                const frameIndex = progress * (frames.length - 1);
                const iLow = Math.floor(frameIndex);
                const iHigh = Math.min(iLow + 1, frames.length - 1);
                const mix = frameIndex - iLow;

                const frameLow = frames[iLow];
                const frameHigh = frames[iHigh];

                const positions = this.points.geometry.attributes.position.array;
                const scale = 1000.0;

                // Apply interpolated delta to base
                for (let i = 0; i < this.count && i < frameLow.length; i++) {
                    // Interpolate delta
                    const dX = frameLow[i].x * (1 - mix) + frameHigh[i].x * mix;
                    const dY = frameLow[i].y * (1 - mix) + frameHigh[i].y * mix;
                    const dZ = frameLow[i].z * (1 - mix) + frameHigh[i].z * mix;

                    // Note: Deltas are in 0..1 MediaPipe Space? No, we need to scale them.
                    // In updateFaceMesh we did: -(p.x - 0.5) * scale.
                    // Our saved deltas (main.js) were: frame[j].x - baseFrame[j].x. (Raw 0..1 difference)
                    // So we must scale them similarly:
                    // newX = baseX + -(dX) * scale. (Flip X/Y apply to deltas too)

                    const worldDeltaX = -dX * scale;
                    const worldDeltaY = -dY * scale;
                    const worldDeltaZ = -dZ * scale;

                    positions[i * 3] = this.animationBase[i * 3] + worldDeltaX;
                    positions[i * 3 + 1] = this.animationBase[i * 3 + 1] + worldDeltaY;
                    positions[i * 3 + 2] = this.animationBase[i * 3 + 2] + worldDeltaZ;
                }
                this.points.geometry.attributes.position.needsUpdate = true;

            } else {
                this.activeAnimation = null;
                // Optional: Snap to final frame or revert? 
                // Usually gesture ends at neutral? Or hold?
                // For now, it stays at last frame state.
            }
        }

        if (this.cameraMode) {
            this.points.rotation.x += (this.trackedRotation.x - this.points.rotation.x) * 0.15;
            this.points.rotation.y += (this.trackedRotation.y - this.points.rotation.y) * 0.15;
        } else {
            this.points.rotation.x += (this.targetRotation.x - this.points.rotation.x) * 0.1;
            this.points.rotation.y += (this.targetRotation.y - this.points.rotation.y) * 0.1;
        }
    }
}
