import urllib.request
import re

url = "https://raw.githubusercontent.com/google/mediapipe/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj"

print(f"Fetching {url}...")
try:
    with urllib.request.urlopen(url) as response:
        data = response.read().decode('utf-8')
except Exception as e:
    print(f"Error fetching URL: {e}")
    exit(1)

vertices = []
indices = []

print("Parsing OBJ data...")
for line in data.splitlines():
    parts = line.strip().split()
    if not parts:
        continue
        
    if parts[0] == 'v':
        # Vertex: v x y z
        # MediaPipe coordinates might need scaling. Let's keep them raw first.
        # They are usually roughly -10 to 10 or similar? Or normalized? 
        # We will check.
        v = [float(parts[1]), float(parts[2]), float(parts[3])]
        vertices.append(v)
        
    elif parts[0] == 'f':
        # Face: f v1/vt1/vn1 v2/vt2/vn2 ...
        # OBJ is 1-indexed. JS is 0-indexed.
        face_indices = []
        for p in parts[1:]:
            # Take the first number before any slash
            v_idx = int(p.split('/')[0]) - 1 
            face_indices.append(v_idx)
            
        # Triangulate if quad (unlikely for this specific mesh, but good practice)
        if len(face_indices) == 3:
            indices.append([face_indices[0], face_indices[1], face_indices[2], 0]) # Type 0 (Skin)
        elif len(face_indices) == 4:
            indices.append([face_indices[0], face_indices[1], face_indices[2], 0])
            indices.append([face_indices[0], face_indices[2], face_indices[3], 0])

print(f"Found {len(vertices)} vertices and {len(indices)} triangles.")

# Identify Eyes?
# We don't have semantic data here (which index is an eye).
# However, we can use simple coordinate bounds to tag them later in JS or here.
# Eye approximation (canonical model):
# Left Eye: x > 0 generally (model might be centered)
# We will leave type=0 for now and let the visualizer handle it, or simple logic.

# Format as JS
js_content = "export const FaceData = {\n"
js_content += "    vertices: [\n"
for v in vertices:
    js_content += f"        [{v[0]}, {v[1]}, {v[2]}],\n"
js_content += "    ],\n"
js_content += "    indices: [\n"
for f in indices:
    js_content += f"        [{f[0]}, {f[1]}, {f[2]}, {f[3]}],\n"
js_content += "    ]\n"
js_content += "};\n"

output_path = "js/face-data.js"
with open(output_path, "w") as f:
    f.write(js_content)

print(f"Successfully wrote {output_path}")
