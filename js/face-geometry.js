import * as THREE from 'three';

export class FaceGeometry {
    static generate(count) {
        const positions = new Float32Array(count * 3);
        const types = new Float32Array(count); // 0: Skin, 1: Left Eye, 2: Right Eye

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;

            // Structured Grid-like distribution attempts?
            // Viki is very "cubic" pixels.
            // Let's stick to random for now but sculpt closer.

            let u = Math.random();
            let v = Math.random();

            let theta = (u - 0.5) * Math.PI * 1.5;
            let phi = v * Math.PI;

            let r = 1.2;

            // Simple mask shape refinement
            if (Math.abs(theta) > Math.PI / 2) r *= 1.0 - (Math.abs(theta) - Math.PI / 2) * 0.5;
            if (phi > Math.PI * 0.7) r *= 1.0 - (phi - Math.PI * 0.7) * 1.2;
            if (phi < Math.PI * 0.3) r *= 0.9 + Math.sin(phi * 5) * 0.05;

            // Cartesian
            let y = -Math.cos(phi) * 1.5;
            let x = Math.sin(phi) * Math.sin(theta) * 1.0;
            let z = Math.sin(phi) * Math.cos(theta) * 1.0;

            // Sculpting Features
            let type = 0.0; // Default Skin

            // Eyes
            // Left Eye
            let distLea = Math.sqrt((x + 0.35) * (x + 0.35) + (y - 0.1) * (y - 0.1));
            // Right Eye
            let distRea = Math.sqrt((x - 0.35) * (x - 0.35) + (y - 0.1) * (y - 0.1));

            if (z > 0) {
                // If inside eye radius
                if (distLea < 0.15) {
                    type = 1.0; // Left Eye
                    z -= 0.1; // Recess slightly
                } else if (distRea < 0.15) {
                    type = 2.0; // Right Eye
                    z -= 0.1;
                } else {
                    // Nose
                    let distToNose = Math.sqrt(x * x + (y + 0.2) * (y + 0.2));
                    if (distToNose < 0.4) z += 0.3 * Math.exp(-distToNose * 5.0);

                    // Mouth
                    let distMouth = Math.sqrt(x * x + (y + 0.5) * (y + 0.5));
                    if (distMouth < 0.3) z += 0.1 * Math.exp(-distMouth * 2.0);
                }
            }

            // Clean up back points
            if (z < -0.5) z = -0.5 + (Math.random() * 0.1);

            positions[i3] = x;
            positions[i3 + 1] = y;
            positions[i3 + 2] = z;
            types[i] = type;
        }

        return { positions, types };
    }
}
