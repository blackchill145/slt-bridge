/**
 * SLT Bridge - MediaPipe Hand Tracking & Camera Controller
 * Manages webcam streams, loads WASM assets, runs inference, and renders the glowing HUD overlay.
 */

import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/vision_bundle.mjs";
import { classifyGesture } from "./gestures.js";

export class GSLTranslator {
  constructor(options = {}) {
    this.video = options.videoElement;
    this.canvas = options.canvasElement;
    this.ctx = this.canvas ? this.canvas.getContext("2d") : null;
    this.onResult = options.onResult || (() => {});
    this.onStatus = options.onStatus || (() => {});
    
    this.handLandmarker = null;
    this.stream = null;
    this.isActive = false;
    this.animationFrameId = null;
    this.lastVideoTime = -1;
    this.fpsLastTime = performance.now();
    this.fpsFrames = 0;
    this.fps = 0;

    // Default Configuration
    this.minConfidence = options.minConfidence || 0.5;
    this.overlayColor = options.overlayColor || "cyan";
    this.drawSkeletonEnabled = true;
    this.showHudEnabled = true;
    this.facingMode = options.facingMode || "user"; // "user" or "environment"
    this.isHealthcareMode = false;
  }

  // Get active HEX color code for drawing
  getGlowColor() {
    switch (this.overlayColor) {
      case "purple": return "#d946ef";
      case "emerald": return "#10b981";
      case "orange": return "#f59e0b";
      case "cyan":
      default:
        return "#00f2fe";
    }
  }

  // Initialize MediaPipe Landmarker
  async init() {
    try {
      this.onStatus("loading", "Initializing WebAssembly engine...");
      
      // Load Fileset Resolver from jsdelivr CDN
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
      );

      this.onStatus("loading", "Downloading Hand landmark models...");

      // Load specific model from Google CDN
      this.handLandmarker = await HandLandmarker.createFromModelPath(vision, 
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
      );

      // Apply initial configuration
      this.updateConfig();
      
      this.onStatus("ready", "Translator engine is loaded and ready.");
      return true;
    } catch (error) {
      console.error("Failed to load MediaPipe HandLandmarker:", error);
      this.onStatus("error", "Failed to load hand-tracking assets. Please check your network.");
      throw error;
    }
  }

  // Update MediaPipe instance options
  updateConfig() {
    if (this.handLandmarker) {
      this.handLandmarker.setOptions({
        runningMode: "VIDEO",
        numHands: 1, // Detect 1 hand at a time for high-performance and GSL manual shapes
        minHandDetectionConfidence: this.minConfidence,
        minHandPresenceConfidence: this.minConfidence,
        minTrackingConfidence: this.minConfidence,
      });
    }
  }

  // Request camera and start tracking loop
  async start() {
    if (this.isActive) return;

    if (!this.handLandmarker) {
      await this.init();
    }

    try {
      this.onStatus("loading", "Requesting webcam access...");
      
      const constraints = {
        video: {
          facingMode: this.facingMode,
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = this.stream;
      
      // Wait for video metadata to load and start playing
      await new Promise((resolve) => {
        this.video.onloadedmetadata = () => {
          this.video.play().then(resolve);
        };
      });

      this.isActive = true;
      this.video.classList.remove("hidden");
      this.canvas.classList.remove("hidden");
      
      // Resize canvas to match the actual stream dimensions
      this.resizeCanvas();
      
      // Run the detection loop
      this.lastVideoTime = -1;
      this.fpsLastTime = performance.now();
      this.fpsFrames = 0;
      this.tick();
      
      this.onStatus("ready", "Webcam streaming and tracking active.");
    } catch (error) {
      console.error("Camera access failed:", error);
      this.onStatus("error", "Camera access denied. Please grant permissions.");
      this.stop();
      throw error;
    }
  }

  // Stop camera and tracking loop
  stop() {
    this.isActive = false;
    
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.video) {
      this.video.srcObject = null;
      this.video.classList.add("hidden");
    }

    if (this.canvas) {
      this.canvas.classList.add("hidden");
      this.clearCanvas();
    }

    this.onStatus("ready", "Camera stopped.");
  }

  // Match canvas rendering size to video source aspect ratios
  resizeCanvas() {
    if (this.video && this.canvas) {
      this.canvas.width = this.video.videoWidth;
      this.canvas.height = this.video.videoHeight;
    }
  }

  clearCanvas() {
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  // Frame tick loop
  tick() {
    if (!this.isActive) return;

    // Detect if browser video time updated
    let now = performance.now();
    if (this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      
      // Performance calculations (FPS)
      this.fpsFrames++;
      if (now >= this.fpsLastTime + 1000) {
        this.fps = Math.round((this.fpsFrames * 1000) / (now - this.fpsLastTime));
        this.fpsFrames = 0;
        this.fpsLastTime = now;
      }

      // Run Hand landmark detection
      if (this.handLandmarker) {
        const results = this.handLandmarker.detectForVideo(this.video, now);
        this.processTrackingResults(results);
      }
    }

    this.animationFrameId = requestAnimationFrame(() => this.tick());
  }

  // Process MediaPipe output
  processTrackingResults(results) {
    this.clearCanvas();
    
    const handDetected = results.landmarks && results.landmarks.length > 0;
    let gestureResult = { gesture: "Searching...", confidence: 0 };
    let handednessLabel = "None";

    if (handDetected) {
      const landmarks = results.landmarks[0];
      handednessLabel = results.handedness[0][0].displayName;

      // Classify the hand geometry
      gestureResult = classifyGesture(landmarks, handednessLabel);
      
      // Override or filter GSL gesture rules depending on active Healthcare Mode
      if (this.isHealthcareMode) {
        // Boost confidence in medical terms or filter accordingly
        const medicalGestures = ["Doctor", "Fever", "Pain", "Help", "Medicine"];
        if (medicalGestures.includes(gestureResult.gesture)) {
            // Keep gesture
        } else if (["Yes", "No", "Hello", "Thank You"].includes(gestureResult.gesture)) {
            // Standard conversational signs allowed
        } else {
            // Demote standard letter signs in healthcare mode if they overlap
            if (gestureResult.confidence < 0.9) {
                gestureResult = { gesture: "Searching...", confidence: 0.1 };
            }
        }
      }

      // Draw the joints skeleton
      if (this.drawSkeletonEnabled) {
        this.drawSkeleton(landmarks);
      }
    }

    // Draw performance overlay on screen
    if (this.showHudEnabled) {
      this.drawHud(handednessLabel, handDetected ? gestureResult : null);
    }

    // Call UI event listener
    this.onResult({
      handDetected,
      handedness: handednessLabel,
      gesture: gestureResult.gesture,
      confidence: gestureResult.confidence,
      landmarks: handDetected ? results.landmarks[0] : null
    });
  }

  // Draws glowing neon HUD text directly on canvas
  drawHud(handedness, gestureInfo) {
    if (!this.ctx || !this.canvas) return;

    this.ctx.save();
    
    // Invert drawing text so it reads upright on mirrored canvas
    this.ctx.translate(this.canvas.width, 0);
    this.ctx.scale(-1, 1);

    this.ctx.fillStyle = "rgba(11, 15, 25, 0.7)";
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    this.ctx.beginPath();
    this.ctx.roundRect(16, 16, 180, 80, 8);
    this.ctx.fill();
    this.ctx.stroke();

    this.ctx.font = "bold 11px monospace";
    this.ctx.fillStyle = "#ffffff";
    this.ctx.fillText(`FPS: ${this.fps}`, 28, 36);
    this.ctx.fillText(`HAND: ${handedness.toUpperCase()}`, 28, 52);
    
    const statusText = gestureInfo ? `${gestureInfo.gesture} (${Math.round(gestureInfo.confidence * 100)}%)` : "WAITING...";
    this.ctx.fillStyle = gestureInfo ? this.getGlowColor() : "#ef4444";
    this.ctx.fillText(`GEST: ${statusText}`, 28, 70);

    this.ctx.restore();
  }

  // Render skeletal nodes and bones
  drawSkeleton(landmarks) {
    if (!this.ctx) return;
    
    const glowColor = this.getGlowColor();
    
    this.ctx.save();
    this.ctx.lineWidth = 4;
    this.ctx.lineCap = "round";
    
    // Add glowing filter effects
    this.ctx.shadowBlur = 12;
    this.ctx.shadowColor = glowColor;
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";

    // Connections map representing the hand bones structures
    const bones = [
      // Thumb
      [0, 1], [1, 2], [2, 3], [3, 4],
      // Index
      [0, 5], [5, 6], [6, 7], [7, 8],
      // Middle
      [0, 9], [9, 10], [10, 11], [11, 12],
      // Ring
      [0, 13], [13, 14], [14, 15], [15, 16],
      // Pinky
      [0, 17], [17, 18], [18, 19], [19, 20],
      // Palm crosswise lines
      [5, 9], [9, 13], [13, 17]
    ];

    // Draw Bones (Lines)
    bones.forEach(([from, to]) => {
      const p1 = landmarks[from];
      const p2 = landmarks[to];
      
      const x1 = p1.x * this.canvas.width;
      const y1 = p1.y * this.canvas.height;
      const x2 = p2.x * this.canvas.width;
      const y2 = p2.y * this.canvas.height;
      
      this.ctx.beginPath();
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.stroke();
    });

    // Draw Joint Nodes (Circles)
    landmarks.forEach((joint, index) => {
      const x = joint.x * this.canvas.width;
      const y = joint.y * this.canvas.height;
      
      const isTip = [4, 8, 12, 16, 20].includes(index);
      
      this.ctx.beginPath();
      this.ctx.arc(x, y, isTip ? 7 : 5, 0, 2 * Math.PI);
      
      // Node styling
      this.ctx.fillStyle = isTip ? glowColor : "#ffffff";
      this.ctx.shadowBlur = isTip ? 16 : 8;
      this.ctx.fill();
      
      // Add subtle white ring around tips
      if (isTip) {
        this.ctx.strokeStyle = "#ffffff";
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();
      }
    });

    this.ctx.restore();
  }
}
