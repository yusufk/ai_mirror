# Viki - Holographic Face Mirror

**Live Demo:** [https://yusuf.kaka.co.za/ai_mirror/](https://yusuf.kaka.co.za/ai_mirror/)

A real-time, interactive 3D holographic face that mirrors your expressions using your webcam. Inspired by the AI "Viki" from *I, Robot*, this project uses Three.js for particle rendering and MediaPipe Face Mesh for facial tracking. and interactive controls.

![Viki Holographic Face](Screenshot%202026-01-17%20at%2023.13.58.png)

## ✨ Features

- 🎭 **Real-time Expression Mirroring** - Uses your camera to mirror your facial expressions
- 👀 **Blink Detection** - Automatically blinks when you blink
- 😊 **Smile Detection** - Mirrors your smile in real-time
- 🤨 **Eyebrow Tracking** - Raises eyebrows when you do
- 🔄 **Head Rotation** - Follows your head movements
- ⌨️ **Keyboard Controls** - Manual expression control (S/E/T keys)
- 🎨 **Viki-Style Aesthetic** - Large, bright cyan/white particles in a holographic grid
- 🎧 **Head-Tracked Spatial Audio** - Load any clip; its sound stays fixed to the screen as you turn your head, on any headphones

## 🎧 Spatial Audio (new)

On headphones, sound normally turns with your head. The Spatial Audio panel
(bottom left) fixes that using the same webcam face tracking:

1. Pick a **Test clip** (six public domain / CC0 recordings in `samples/`, see
   `samples/CREDITS.md`), or choose your own video or audio file (it never leaves your machine).
2. Press play, then pick a mode:
   - **Stereo**: plain playback, for comparison
   - **Speakers**: stereo rendered as two virtual speakers either side of the screen (HRTF)
   - **Head tracked**: the speakers stay put while your head turns
3. Turn your head. The radar shows your head (blue arrow) and the speakers (green).
   If the arrow turns the wrong way, tick **Flip direction**.

Tips: wired headphones give the lowest latency. On Bluetooth, try **Prediction → Auto**.
For mono clips (e.g. a MacBook mic recording) set **Speaker width** to about 10°.
Press **C** to recentre.

## 🚀 Live Demo

**[View Live Demo](https://yourusername.github.io/web_graphics/)** *(Update this URL after deployment)*

## 🛠️ Technology Stack

- **Three.js** - 3D rendering and particle system
- **MediaPipe Face Landmarker** - Facial landmarks, blendshapes and head pose matrix
- **Web Audio API** - HRTF panners for binaural rendering
- **WebGL Shaders** - Custom vertex/fragment shaders for effects
- **Pure JavaScript** - No build tools required

## 📋 Prerequisites

- Modern web browser with WebGL support
- Camera access for expression mirroring (optional)
- JavaScript enabled

## 🏃 Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/web_graphics.git
   cd web_graphics
   ```

2. **Start a local server**
   ```bash
   # Python 3
   python3 -m http.server 8000
   
   # Node.js
   npx http-server
   ```

3. **Open in browser**
   ```
   http://localhost:8000
   ```

## 🎮 Usage

### Camera Mode (Default)
1. Allow camera access when prompted
2. Your facial expressions will be mirrored in real-time
3. Try blinking, smiling, raising eyebrows, or turning your head

### Keyboard Mode
- **S** - Trigger smile animation
- **E** - Trigger eyebrow raise
- **T** - Trigger talk animation (rhythmic mouth movement)
- **Mouse** - Rotate the face by moving your cursor

### Controls
- Toggle between camera and keyboard modes using the control panel
- Deny camera access to use keyboard-only mode

## 🗂️ Project Structure

```
web_graphics/
├── index.html              # Main HTML file
├── styles.css              # Styling
├── js/
│   ├── main.js            # Application entry point
│   ├── particles.js       # Particle system & shaders
│   ├── face-geometry.js   # Face mesh generation
│   ├── face-data.js       # Face vertex/triangle data
│   ├── face-tracker.js    # Camera & MediaPipe Face Landmarker
│   ├── head-pose.js       # Pose maths: matrix to angles, One Euro filter, prediction
│   ├── spatial-audio.js   # Web Audio HRTF virtual speakers
│   └── audio-ui.js        # Spatial audio panel and radar
├── tests/                 # node --test tests/*.test.mjs
├── Screenshot...png       # Viki reference image
└── README.md              # This file
```

## 🧠 How It Works

### 1. Face Mesh
The face is constructed from a 3D mesh with 471 vertices and ~800 triangles, sampled to create 2,500 particles arranged in a structured grid pattern.

### 2. Particle System
Each particle is rendered as a large point (6000-8000px size) using WebGL point sprites, with custom shaders for:
- Position scaling and animation
- Expression deformation (eyes, mouth, eyebrows)
- Bright cyan/white coloring
- Subtle floating animation

### 3. Expression Detection
MediaPipe Face Mesh provides 468 facial landmarks, which are analyzed to detect:
- **Blinking**: Eye aspect ratio (EAR)
- **Smiling**: Mouth corner position relative to center
- **Eyebrow raise**: Forehead landmark vertical movement
- **Head rotation**: Face mesh orientation (pitch/yaw/roll)

### 4. Animation
Detected expressions trigger smooth animations in the shader:
- Eye particles collapse toward center (blink)
- Mouth corners lift upward (smile)
- Eyebrow particles move upward (surprise)
- Entire mesh rotates (head tracking)

## 🌐 Browser Compatibility

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome/Edge | ✅ Full | Recommended |
| Firefox | ✅ Full | MediaPipe supported |
| Safari | ⚠️ Partial | Camera may require HTTPS |
| Mobile | ⚠️ Limited | Performance may vary |

## 🔒 Privacy

All face tracking is performed **locally in your browser**. No video data is ever sent to any server. The camera feed is processed in real-time using client-side JavaScript.

## 🎨 Customization

### Adjust Particle Count
Edit `js/particles.js`:
```javascript
this.count = 2500; // Change particle density
```

### Modify Colors
Edit the fragment shader in `js/particles.js`:
```javascript
vec3 colBase = vec3(0.7, 0.85, 1.0); // Bright cyan-white
```

### Change Camera Position
Edit `js/main.js`:
```javascript
this.camera.position.z = 800; // Adjust zoom level
```

## 🤝 Contributing

Contributions are welcome! Feel free to:
- Report bugs
- Suggest features
- Submit pull requests

## 📄 License

MIT License - Feel free to use this project for personal or commercial purposes.

## 🙏 Acknowledgments

- Inspired by **Viki** from *I, Robot* (2004)
- Face mesh data based on MediaPipe Face Mesh topology
- Built with Three.js and MediaPipe

## 📧 Contact

Questions or feedback? Open an issue or reach out!

---

**Enjoy your holographic face experience! 🎭✨**
