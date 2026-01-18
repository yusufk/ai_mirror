// MediaPipe libraries are loaded globally via <script> tags in index.html
// globals: FaceMesh, Camera

export class FaceTracker {
    constructor() {
        this.isActive = false;
        this.isInitialized = false;
        this.videoElement = null;
        this.camera = null;
        this.faceMesh = null;

        // Callbacks for detected expressions
        this.onBlink = null;
        this.onSmile = null;
        this.onEyebrowRaise = null;
        this.onRotation = null;
        this.onMouthOpen = null;

        // Previous states for edge detection
        this.prevLeftEyeOpen = true;
        this.prevRightEyeOpen = true;
        this.prevSmiling = false;
        this.prevEyebrowRaised = false;

        // Smoothing
        this.rotationX = 0;
        this.rotationY = 0;

        // Debug
        this.lastFrameTime = 0;
        this.frameCount = 0;
        this.fps = 0;
        setInterval(() => {
            this.fps = this.frameCount;
            this.frameCount = 0;
        }, 1000);
    }

    async initialize() {
        if (this.isInitialized) return true;

        try {
            // Create hidden video element for camera feed
            this.videoElement = document.createElement('video');
            this.videoElement.style.display = 'none';
            this.videoElement.width = 640;
            this.videoElement.height = 480;
            document.body.appendChild(this.videoElement);

            // Initialize MediaPipe FaceMesh using global FaceMesh
            this.faceMesh = new FaceMesh({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${file}`;
                }
            });

            this.faceMesh.setOptions({
                maxNumFaces: 1,
                refineLandmarks: true,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });

            this.faceMesh.onResults(this.onResults.bind(this));

            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error('Failed to initialize FaceTracker:', error);
            return false;
        }
    }

    async start() {
        if (!this.isInitialized) {
            const success = await this.initialize();
            if (!success) return false;
        }

        try {
            // Initialize camera
            this.camera = new Camera(this.videoElement, {
                onFrame: async () => {
                    // console.log("Camera frame tick"); // Debug loop
                    if (this.isActive) {
                        try {
                            // verify video element has data
                            if (this.videoElement.readyState === 4) {
                                await this.faceMesh.send({ image: this.videoElement });
                            }
                        } catch (e) {
                            console.error("Error sending frame to FaceMesh:", e);
                        }
                    }
                },
                width: 640,
                height: 480
            });

            console.log("Starting camera...");
            await this.camera.start();
            console.log("Camera started");
            this.isActive = true;

            // Show debug console
            const debugConsole = document.getElementById('debug-console');
            if (debugConsole) debugConsole.style.display = 'block';

            return true;
        } catch (error) {
            console.error('Failed to start camera:', error);
            return false;
        }
    }

    stop() {
        this.isActive = false;
        if (this.camera) {
            this.camera.stop();
        }
    }

    onResults(results) {
        // console.log("FaceTracker results:", results); // Uncomment for verbose logging
        if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
            // console.log("No faces detected");
            this.updateDebug(null, false);
            return;
        }

        // console.log("Face detected!");
        const landmarks = results.multiFaceLandmarks[0];

        // Detect expressions
        this.detectBlink(landmarks);
        this.detectSmile(landmarks);
        this.detectEyebrowRaise(landmarks);
        this.detectHeadRotation(landmarks);
        this.detectMouthOpen(landmarks);

        // Update debug console
        this.frameCount++;
        this.updateDebug(landmarks, true);
    }

    updateDebug(landmarks, faceDetected) {
        const consoleEl = document.getElementById('debug-console');
        if (consoleEl.style.display === 'none') return;

        // Face Detected Status
        const detectedEl = document.getElementById('debug-detected');
        if (detectedEl) {
            detectedEl.textContent = faceDetected ? 'YES' : 'NO';
            detectedEl.style.color = faceDetected ? '#00ff88' : '#ff3333';
        }

        if (!faceDetected) return;

        // Status
        document.getElementById('debug-status').textContent = 'Tracking';
        document.getElementById('debug-status').style.color = '#00ff88';

        // Rotation
        const pitch = Math.round(this.rotationX * (180 / Math.PI));
        const yaw = Math.round(this.rotationY * (180 / Math.PI));
        document.getElementById('debug-rotation').textContent = `P: ${pitch}° Y: ${yaw}°`;

        // FPS
        document.getElementById('debug-fps').textContent = this.fps;
    }

    detectBlink(landmarks) {
        // Left eye landmarks: 33, 160, 159, 145
        // Right eye landmarks: 362, 385, 386, 374

        // Calculate Eye Aspect Ratio (EAR)
        const leftEAR = this.calculateEAR(
            landmarks[33], landmarks[160], landmarks[159], landmarks[145]
        );
        const rightEAR = this.calculateEAR(
            landmarks[362], landmarks[385], landmarks[386], landmarks[374]
        );

        const EAR_THRESHOLD = 0.2; // Threshold for closed eye

        const leftClosed = leftEAR < EAR_THRESHOLD;
        const rightClosed = rightEAR < EAR_THRESHOLD;

        // Trigger on falling edge (eye just closed)
        if ((leftClosed || rightClosed) && (this.prevLeftEyeOpen || this.prevRightEyeOpen)) {
            if (this.onBlink) {
                this.onBlink();
            }
        }

        // Debug
        const debugEl = document.getElementById('debug-blink');
        if (debugEl) {
            debugEl.textContent = `${leftClosed ? 'CLOSED' : 'Open'} / ${rightClosed ? 'CLOSED' : 'Open'}`;
            debugEl.style.color = (leftClosed || rightClosed) ? '#00ff88' : 'white';
        }

        this.prevLeftEyeOpen = !leftClosed;
        this.prevRightEyeOpen = !rightClosed;
    }

    calculateEAR(p1, p2, p3, p4) {
        // Eye Aspect Ratio = (vertical distance) / (horizontal distance)
        const vertical = this.distance(p2, p4);
        const horizontal = this.distance(p1, p3);
        return vertical / (horizontal + 0.001); // Avoid division by zero
    }

    distance(p1, p2) {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dz = (p1.z || 0) - (p2.z || 0);
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    detectSmile(landmarks) {
        // Mouth corners: 61 (left), 291 (right)
        // Upper lip center: 13
        // Lower lip center: 14

        const leftCorner = landmarks[61];
        const rightCorner = landmarks[291];
        const upperLip = landmarks[13];
        const lowerLip = landmarks[14];

        // Calculate mouth width and height
        const mouthWidth = this.distance(leftCorner, rightCorner);
        const mouthHeight = this.distance(upperLip, lowerLip);

        // Smile ratio: wider mouth relative to height
        const smileRatio = mouthWidth / (mouthHeight + 0.001);

        // Refined Logic: Check if corners are lifted relative to lip center
        // In MediaPipe (y increases downwards), lower Y means higher up
        const cornersY = (leftCorner.y + rightCorner.y) / 2;
        const centerLipY = (upperLip.y + lowerLip.y) / 2;
        const liftValue = centerLipY - cornersY; // Positive = corners higher

        // Thresholds
        let isSmileStructure = liftValue > 0.01;
        const SMILE_THRESHOLD = 2.5;

        // Debug output
        const debugEl = document.getElementById('debug-mouth');
        if (debugEl) {
            debugEl.textContent = `R:${smileRatio.toFixed(1)} L:${liftValue.toFixed(3)}`;
            debugEl.style.color = (smileRatio > SMILE_THRESHOLD && isSmileStructure) ? '#00ff88' : 'white';
        }

        const isSmiling = (smileRatio > SMILE_THRESHOLD) && isSmileStructure;

        // Trigger on rising edge (just started smiling)
        if (isSmiling && !this.prevSmiling) {
            if (this.onSmile) {
                this.onSmile();
            }
        }

        this.prevSmiling = isSmiling;
    }

    detectEyebrowRaise(landmarks) {
        // Left eyebrow: 107
        // Right eyebrow: 336
        // Nose bridge: 168

        const leftEyebrow = landmarks[107];
        const rightEyebrow = landmarks[336];
        const noseBridge = landmarks[168];

        // Calculate vertical distance from eyebrows to nose
        const leftDist = noseBridge.y - leftEyebrow.y;
        const rightDist = noseBridge.y - rightEyebrow.y;
        const avgDist = (leftDist + rightDist) / 2;

        const EYEBROW_THRESHOLD = 0.08; // Raised eyebrows

        // Debug
        const debugEl = document.getElementById('debug-brow');
        if (debugEl) {
            debugEl.textContent = `${avgDist.toFixed(3)} / ${EYEBROW_THRESHOLD}`;
            debugEl.style.color = avgDist > EYEBROW_THRESHOLD ? '#00ff88' : 'white';
        }

        const isRaised = avgDist > EYEBROW_THRESHOLD;

        // Trigger on rising edge
        if (isRaised && !this.prevEyebrowRaised) {
            if (this.onEyebrowRaise) {
                this.onEyebrowRaise();
            }
        }

        this.prevEyebrowRaised = isRaised;
    }

    detectHeadRotation(landmarks) {
        // Estimate head rotation using facial landmarks
        // Nose tip: 1
        // Left face: 234
        // Right face: 454

        const noseTip = landmarks[1];
        const leftFace = landmarks[234];
        const rightFace = landmarks[454];

        // Calculate horizontal rotation (yaw)
        const leftDist = this.distance(noseTip, leftFace);
        const rightDist = this.distance(noseTip, rightFace);
        const yaw = (rightDist - leftDist) * 5; // Scale for visibility

        // Calculate vertical rotation (pitch) using forehead and chin
        const forehead = landmarks[10];
        const chin = landmarks[152];
        const pitch = (chin.y - forehead.y - 0.3) * 5; // Increased sensitivity (was 3)

        // Smooth the rotation
        this.rotationX += (pitch - this.rotationX) * 0.15; // Faster smoothing
        this.rotationY += (yaw - this.rotationY) * 0.15; // Faster smoothing

        if (this.onRotation) {
            this.onRotation(this.rotationX, this.rotationY);
        }
    }

    detectMouthOpen(landmarks) {
        // Upper lip bottom: 13
        // Lower lip top: 14
        // Mouth corners for scale: 61, 291

        const upperLip = landmarks[13];
        const lowerLip = landmarks[14];
        const leftCorner = landmarks[61];
        const rightCorner = landmarks[291];

        const mouthHeight = this.distance(upperLip, lowerLip);
        const mouthWidth = this.distance(leftCorner, rightCorner);

        // Ratio independent of distance to camera
        const openRatio = mouthHeight / (mouthWidth + 0.001);

        // Thresholds (Tuned)
        const MIN_OPEN = 0.1; // Resting state
        const MAX_OPEN = 0.6; // Fully open

        // Normalize 0 to 1
        let talkValue = (openRatio - MIN_OPEN) / (MAX_OPEN - MIN_OPEN);
        talkValue = Math.max(0, Math.min(1, talkValue));

        if (this.onMouthOpen) {
            this.onMouthOpen(talkValue);
        }
    }

    destroy() {
        this.stop();
        if (this.videoElement) {
            document.body.removeChild(this.videoElement);
            this.videoElement = null;
        }
    }
}
