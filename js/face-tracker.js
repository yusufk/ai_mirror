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

        // Previous states for edge detection
        this.prevLeftEyeOpen = true;
        this.prevRightEyeOpen = true;
        this.prevSmiling = false;
        this.prevEyebrowRaised = false;

        // Smoothing
        this.rotationX = 0;
        this.rotationY = 0;
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
                    if (this.isActive) {
                        await this.faceMesh.send({ image: this.videoElement });
                    }
                },
                width: 640,
                height: 480
            });

            await this.camera.start();
            this.isActive = true;
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
        if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
            return;
        }

        const landmarks = results.multiFaceLandmarks[0];

        // Detect expressions
        this.detectBlink(landmarks);
        this.detectSmile(landmarks);
        this.detectEyebrowRaise(landmarks);
        this.detectHeadRotation(landmarks);
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
        const SMILE_THRESHOLD = 3.0;

        const isSmiling = smileRatio > SMILE_THRESHOLD;

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
        const pitch = (chin.y - forehead.y - 0.3) * 3; // Centered and scaled

        // Smooth the rotation
        this.rotationX += (pitch - this.rotationX) * 0.1;
        this.rotationY += (yaw - this.rotationY) * 0.1;

        if (this.onRotation) {
            this.onRotation(this.rotationX, this.rotationY);
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
