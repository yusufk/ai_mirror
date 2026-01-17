import * as THREE from 'three';
import { FaceGeometry } from './face-geometry.js';

export class Particles {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.count = 20000;

        this.mouse = new THREE.Vector2(0, 0);
        this.raycaster = new THREE.Raycaster();
        this.planeNormal = new THREE.Vector3(0, 0, 1);
        this.planeConstant = 0;
        this.plane = new THREE.Plane(this.planeNormal, this.planeConstant);

        this.init();
        this.addEvents();
    }

    init() {
        const geometry = new THREE.BufferGeometry();

        // Attributes
        const positions = new Float32Array(this.count * 3);
        const targetPositions = FaceGeometry.generate(this.count);
        const randoms = new Float32Array(this.count * 3);

        for (let i = 0; i < this.count * 3; i++) {
            // Initial positions: Random Cloud spread out
            positions[i] = (Math.random() - 0.5) * 10;

            // Randoms for noise
            randoms[i] = Math.random();
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('targetPosition', new THREE.BufferAttribute(targetPositions, 3));
        geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1)); // We can repack (x,y,z) to just 1 float if needed

        // Shader Material
        this.material = new THREE.ShaderMaterial({
            vertexShader: this.vertexShader(),
            fragmentShader: this.fragmentShader(),
            uniforms: {
                uTime: { value: 0 },
                uMouse: { value: new THREE.Vector3(0, 0, 0) }, // Mouse World Position
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
            uniform vec3 uMouse;
            
            attribute vec3 targetPosition;
            attribute float aRandom;
            
            varying float vAlpha;
            varying float vDist;
            
            // Simplex noise helper (optional, or simple sin wave)
            // Using simple sine movements for now
            
            void main() {
                vec3 pos = position; // Start with base position (we will mix later, but for now let's just use target)
                
                // For this step, let's just render the target face to verify shape
                pos = targetPosition;
                
                // Noise / Float movement
                pos.x += sin(uTime * 0.5 + aRandom * 10.0) * 0.02;
                pos.y += cos(uTime * 0.3 + aRandom * 20.0) * 0.02;
                
                // Mouse Interaction (Repel/Attract)
                float dist = distance(pos, uMouse);
                vDist = dist;
                
                if (dist < 0.5) {
                    vec3 dir = normalize(pos - uMouse);
                    // Push away
                    pos += dir * (0.5 - dist) * 0.5;
                }
                
                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                
                // Size attenuation
                gl_PointSize = (4.0 / -mvPosition.z);
                
                vAlpha = 0.5 + 0.5 * sin(uTime + aRandom * 10.0);
            }
        `;
    }

    fragmentShader() {
        return `
            varying float vAlpha;
            varying float vDist;
            
            void main() {
                // Circular particle
                vec2 center = gl_PointCoord - 0.5;
                float dist = length(center);
                if (dist > 0.5) discard;
                
                // Soft edge
                float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
                
                // Color (Greenish/Gold for Shrek mirror vibe?)
                // Let's start with a mystical cyan/green mix
                vec3 color = mix(vec3(0.2, 0.8, 0.5), vec3(0.2, 0.5, 1.0), vDist); // Green -> Blue away from mouse
                
                gl_FragColor = vec4(color, alpha * vAlpha * 0.8);
            }
        `;
    }

    addEvents() {
        window.addEventListener('mousemove', (e) => {
            // Normalized Device Coordinates
            this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

            // Raycast to find world position on a plane at Z=0 (approx face pos)
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersectPoint = new THREE.Vector3();
            this.raycaster.ray.intersectPlane(this.plane, intersectPoint);

            if (intersectPoint) {
                this.material.uniforms.uMouse.value.copy(intersectPoint);
            }
        });
    }

    onResize(width, height) {
        this.material.uniforms.uResolution.value.set(width, height);
    }

    update(time) {
        this.material.uniforms.uTime.value = time;
        // Logic to interpolate positions could go here or in shader
    }
}
