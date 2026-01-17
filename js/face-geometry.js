import { FaceData } from './face-data.js';

export class FaceGeometry {
    static generate(count) {
        // Mesh Sampling Approach
        // We have a low-poly mesh in FaceData.
        // We will sample random points on the surface of these triangles.

        const positions = new Float32Array(count * 3);
        const types = new Float32Array(count);

        const indices = FaceData.indices;
        const verts = FaceData.vertices;

        // 1. Calculate Triangle Areas
        const areas = [];
        let totalArea = 0;

        for (let i = 0; i < indices.length; i++) {
            const [i1, i2, i3] = indices[i];
            const v1 = verts[i1];
            const v2 = verts[i2];
            const v3 = verts[i3];

            // Vector edges
            const ax = v2[0] - v1[0], ay = v2[1] - v1[1], az = v2[2] - v1[2];
            const bx = v3[0] - v1[0], by = v3[1] - v1[1], bz = v3[2] - v1[2];

            // Cross product length / 2
            const cx = ay * bz - az * by;
            const cy = az * bx - ax * bz;
            const cz = ax * by - ay * bx;

            const area = 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
            areas.push(area);
            totalArea += area;
        }

        // 2. Generate Points
        for (let i = 0; i < count; i++) {
            const i3 = i * 3;

            // Pick a triangle weighted by area
            let r = Math.random() * totalArea;
            let triIndex = 0;
            for (let j = 0; j < areas.length; j++) {
                r -= areas[j];
                if (r <= 0) {
                    triIndex = j;
                    break;
                }
            }

            const [id1, id2, id3, type] = indices[triIndex];
            const v1 = verts[id1];
            const v2 = verts[id2];
            const v3 = verts[id3];

            // Random Point in Triangle (Barycentric)
            let r1 = Math.random();
            let r2 = Math.random();

            if (r1 + r2 > 1) {
                r1 = 1 - r1;
                r2 = 1 - r2;
            }

            const r3 = 1 - r1 - r2;

            const x = r1 * v1[0] + r2 * v2[0] + r3 * v3[0];
            const y = r1 * v1[1] + r2 * v2[1] + r3 * v3[1];
            const z = r1 * v1[2] + r2 * v2[2] + r3 * v3[2];

            positions[i3] = x;
            positions[i3 + 1] = y;
            positions[i3 + 2] = z;
            types[i] = type;
        }

        return { positions, types };
    }
}
