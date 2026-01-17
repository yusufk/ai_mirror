import * as THREE from 'three';

export class FaceGeometry {
    static generate(count) {
        const positions = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;

            // Generate points on a modified sphere/ellipsoid to approximate a face mask
            // We want a surface that looks like a theatre mask

            // 1. Base UV mapping
            let u = Math.random();
            let v = Math.random();

            // 2. Map to Sphere coordinates, but focus on the "front" face
            // Phi (vertical): 0 to PI. We want most points in the middle-ish (face area)
            // Theta (horizontal): 0 to 2PI. We want front +/- 90 degrees mainly

            let theta = (u - 0.5) * Math.PI * 1.5; // -135 to +135 degrees
            let phi = v * Math.PI;

            // 3. Radius variation to sculpt features
            let r = 1.2;

            // Flatten the back (beyond +/- 90 degrees) to simulate a mask shell
            if (Math.abs(theta) > Math.PI / 2) {
                r *= 1.0 - (Math.abs(theta) - Math.PI / 2) * 0.5;
            }

            // Chin tapering
            if (phi > Math.PI * 0.7) {
                r *= 1.0 - (phi - Math.PI * 0.7) * 1.2;
            }

            // Forehead reshaping
            if (phi < Math.PI * 0.3) {
                r *= 0.9 + Math.sin(phi * 5) * 0.05;
            }

            // Convert to Cartesian (Y-up)
            // Y is Up (-1 to 1), X is Left/Right, Z is Forward/Back

            let y = -Math.cos(phi) * 1.5; // Stretch vertically
            let x = Math.sin(phi) * Math.sin(theta) * 1.0;
            let z = Math.sin(phi) * Math.cos(theta) * 1.0;

            // Now sculpt based on (x,y,z)
            // These sculpts assume face handles roughly z > 0

            // Nose protrusion
            let distToNose = Math.sqrt(x * x + (y + 0.2) * (y + 0.2));
            if (z > 0 && distToNose < 0.4) {
                z += 0.3 * Math.exp(-distToNose * 5.0);
            }

            // Eye sockets (indentation)
            // Left Eye
            let distLea = Math.sqrt((x + 0.35) * (x + 0.35) + (y - 0.2) * (y - 0.2));
            if (z > 0 && distLea < 0.25) {
                z -= 0.15 * Math.exp(-distLea * 4.0);
            }
            // Right Eye
            let distRea = Math.sqrt((x - 0.35) * (x - 0.35) + (y - 0.2) * (y - 0.2));
            if (z > 0 && distRea < 0.25) {
                z -= 0.15 * Math.exp(-distRea * 4.0);
            }

            // Mouth area (slight protrusion then indentation)
            let distMouth = Math.sqrt(x * x + (y + 0.5) * (y + 0.5));
            if (z > 0 && distMouth < 0.3) {
                z += 0.1 * Math.exp(-distMouth * 2.0); // muzzle
            }

            // Only keep points that are somewhat "front facing" or part of the mask shell
            // If it's too far back, bring it forward or discard (clamping)
            if (z < -0.5) z = -0.5 + (Math.random() * 0.1);

            positions[i3] = x;
            positions[i3 + 1] = y;
            positions[i3 + 2] = z;
        }

        return positions;
    }
}
