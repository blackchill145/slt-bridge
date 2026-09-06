/**
 * SLT Bridge - GSL Gesture Classifier Engine
 * Analyzes MediaPipe hand landmarks mathematically to recognize letters and words.
 */

// Helper to calculate 3D Euclidean distance
export function euclideanDistance(p1, p2) {
  return Math.sqrt(
    Math.pow(p1.x - p2.x, 2) +
    Math.pow(p1.y - p2.y, 2) +
    Math.pow(p1.z - p2.z, 2)
  );
}

/**
 * Classify hand landmarks into a specific gesture (GSL letters and words)
 * @param {Array} landmarks - 21 hand tracking points from MediaPipe
 * @param {string} handedness - "Left" or "Right"
 * @returns {Object} { gesture: string, confidence: number }
 */
export function classifyGesture(landmarks, handedness) {
  if (!landmarks || landmarks.length < 21) {
    return { gesture: "No hand", confidence: 0 };
  }

  // 1. Calculate Palm Scale (Reference Distance)
  // Distance from Wrist (0) to Middle Finger MCP (9) represents palm size
  const palmSize = euclideanDistance(landmarks[0], landmarks[9]);
  if (palmSize === 0) return { gesture: "Unknown", confidence: 0 };

  // Helper to get normalized distance
  const getDist = (i, j) => euclideanDistance(landmarks[i], landmarks[j]) / palmSize;

  // 2. Determine Finger Extension States
  // A finger is extended if tip is significantly further from the base (MCP) than the joint (PIP)
  const isIndexExtended = getDist(8, 5) > getDist(6, 5) * 1.15;
  const isMiddleExtended = getDist(12, 9) > getDist(10, 9) * 1.15;
  const isRingExtended = getDist(16, 13) > getDist(14, 13) * 1.15;
  const isPinkyExtended = getDist(20, 17) > getDist(18, 17) * 1.15;

  // Thumb is extended if wide open relative to index finger base (5) and MCP joint (2)
  const thumbIndexBaseDist = getDist(4, 5);
  const isThumbExtended = thumbIndexBaseDist > 0.85 && getDist(4, 2) > getDist(3, 2);

  // 3. Tip-to-Tip distances (for specialized shapes)
  const thumbIndexTipDist = getDist(4, 8);
  const thumbMiddleTipDist = getDist(4, 12);
  const thumbRingTipDist = getDist(4, 16);
  const thumbPinkyTipDist = getDist(4, 20);
  const indexMiddleTipDist = getDist(8, 12);
  const middleRingTipDist = getDist(12, 16);
  const ringPinkyTipDist = getDist(16, 20);

  // 4. Orientation markers
  const wrist = landmarks[0];
  const indexMCP = landmarks[5];
  const indexTip = landmarks[8];

  // Is hand pointing up, down, or sideways?
  const isHandUpright = indexMCP.y < wrist.y;
  const isHandPointingDown = indexMCP.y > wrist.y + 0.2 * palmSize;
  const isHandHorizontal = Math.abs(indexMCP.y - wrist.y) < 0.35 * palmSize;

  // ==========================================
  // HEALTHCARE WORDS (Enabled in Healthcare Mode)
  // ==========================================

  // 1. "Doctor" (Checking pulse gesture)
  if (isIndexExtended && isMiddleExtended && !isRingExtended && !isPinkyExtended && !isThumbExtended && indexMiddleTipDist < 0.35 && isHandHorizontal) {
    return { gesture: "Doctor", confidence: 0.9 };
  }

  // 2. "Fever" (Hand to forehead)
  if (isThumbExtended && isIndexExtended && isMiddleExtended && isRingExtended && isPinkyExtended && isHandHorizontal && indexMiddleTipDist < 0.4) {
    return { gesture: "Fever", confidence: 0.85 };
  }

  // 3. "Pain" (Index fingers pointing at each other twisting)
  if (isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended && !isThumbExtended && isHandHorizontal) {
    return { gesture: "Pain", confidence: 0.85 };
  }

  // 4. "Help" (Thumbs up sign)
  if (isThumbExtended && !isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended && isHandUpright && landmarks[4].y < landmarks[2].y) {
    return { gesture: "Help", confidence: 0.9 };
  }

  // 5. "Medicine" (Middle finger tip folded down touching palm)
  if (!isMiddleExtended && isIndexExtended && isRingExtended && isPinkyExtended && getDist(12, 0) < 0.6) {
    return { gesture: "Medicine", confidence: 0.85 };
  }

  // ==========================================
  // CONVERSATIONAL WORDS / COMMON PHRASES
  // ==========================================

  // I Love You (ILY): Thumb, Index, Pinky extended; Middle and Ring folded
  if (isThumbExtended && isIndexExtended && !isMiddleExtended && !isRingExtended && isPinkyExtended) {
    return { gesture: "I Love You", confidence: 0.95 };
  }

  // Hello / Flat Hand (All extended, vertical orientation)
  if (isThumbExtended && isIndexExtended && isMiddleExtended && isRingExtended && isPinkyExtended && isHandUpright) {
    return { gesture: "Hello", confidence: 0.9 };
  }

  // Thank You (Flat hand tilted forward)
  if (isThumbExtended && isIndexExtended && isMiddleExtended && isRingExtended && isPinkyExtended && !isHandUpright) {
    return { gesture: "Thank You", confidence: 0.8 };
  }

  // No (Index and Middle tapping thumb)
  if (!isRingExtended && !isPinkyExtended && thumbIndexTipDist < 0.35 && thumbMiddleTipDist < 0.35) {
    return { gesture: "No", confidence: 0.88 };
  }

  // Yes (Nodding fist)
  if (!isThumbExtended && !isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended) {
    const averageFingertipDist = (getDist(8, 0) + getDist(12, 0) + getDist(16, 0) + getDist(20, 0)) / 4;
    if (averageFingertipDist < 0.6) {
      return { gesture: "Yes", confidence: 0.85 };
    }
  }

  // ==========================================
  // COMPLETE GSL MANUAL ALPHABET (LETTERS A - Z)
  // ==========================================

  // 1. L: Index and Thumb extended, others folded
  if (isThumbExtended && isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended) {
    return { gesture: "L", confidence: 0.95 };
  }

  // 2. Y: Thumb and Pinky extended, others folded
  if (isThumbExtended && !isIndexExtended && !isMiddleExtended && !isRingExtended && isPinkyExtended) {
    return { gesture: "Y", confidence: 0.95 };
  }

  // 3. W: Index, Middle, Ring extended
  if (isIndexExtended && isMiddleExtended && isRingExtended && !isPinkyExtended && !isThumbExtended) {
    return { gesture: "W", confidence: 0.92 };
  }

  // 4. V: Index and Middle extended spread out
  if (isIndexExtended && isMiddleExtended && !isRingExtended && !isPinkyExtended && !isThumbExtended && indexMiddleTipDist > 0.45) {
    return { gesture: "V", confidence: 0.92 };
  }

  // 5. U: Index and Middle extended close together
  if (isIndexExtended && isMiddleExtended && !isRingExtended && !isPinkyExtended && !isThumbExtended && indexMiddleTipDist <= 0.45) {
    return { gesture: "U", confidence: 0.9 };
  }

  // 6. R: Index and Middle crossed
  if (isIndexExtended && isMiddleExtended && !isRingExtended && !isPinkyExtended && indexMiddleTipDist < 0.2) {
    return { gesture: "R", confidence: 0.88 };
  }

  // 7. K: Index up, Middle forward/angled, Thumb touching middle finger
  if (isIndexExtended && isMiddleExtended && !isRingExtended && !isPinkyExtended && isThumbExtended && indexMiddleTipDist > 0.3 && isHandUpright) {
    return { gesture: "K", confidence: 0.88 };
  }

  // 8. P: Pointing downwards K shape
  if (isHandPointingDown && isIndexExtended && isMiddleExtended && !isRingExtended && !isPinkyExtended) {
    return { gesture: "P", confidence: 0.85 };
  }

  // 9. Q: Pointing downwards G shape
  if (isHandPointingDown && isIndexExtended && isThumbExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended) {
    return { gesture: "Q", confidence: 0.85 };
  }

  // 10. G: Index pointing horizontally, thumb parallel
  if (isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended && isThumbExtended && isHandHorizontal) {
    return { gesture: "G", confidence: 0.88 };
  }

  // 11. H: Index and Middle pointing horizontally
  if (isIndexExtended && isMiddleExtended && !isRingExtended && !isPinkyExtended && isHandHorizontal) {
    return { gesture: "H", confidence: 0.88 };
  }

  // 12. F: Index tip touches thumb tip, Middle, Ring, Pinky extended
  if (thumbIndexTipDist < 0.25 && isMiddleExtended && isRingExtended && isPinkyExtended) {
    return { gesture: "F", confidence: 0.9 };
  }

  // 13. O: All fingertips touching thumb tip in a circle
  if (thumbIndexTipDist < 0.3 && thumbMiddleTipDist < 0.35 && thumbRingTipDist < 0.35 && thumbPinkyTipDist < 0.4) {
    return { gesture: "O", confidence: 0.9 };
  }

  // 14. D: Index extended up, other tips touch thumb tip
  if (isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended && thumbMiddleTipDist < 0.45) {
    return { gesture: "D", confidence: 0.9 };
  }

  // 15. B: All 4 fingers extended, thumb folded across palm
  if (isIndexExtended && isMiddleExtended && isRingExtended && isPinkyExtended && !isThumbExtended) {
    return { gesture: "B", confidence: 0.9 };
  }

  // 16. I: Only Pinky extended up
  if (!isThumbExtended && !isIndexExtended && !isMiddleExtended && !isRingExtended && isPinkyExtended) {
    return { gesture: "I", confidence: 0.95 };
  }

  // 17. J: Pinky extended with sideways/curved orientation
  if (!isIndexExtended && !isMiddleExtended && !isRingExtended && isPinkyExtended && (isHandHorizontal || landmarks[20].x < landmarks[17].x - 0.15)) {
    return { gesture: "J", confidence: 0.85 };
  }

  // 18. A: Fist with thumb resting upright at side of index
  if (!isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended && isThumbExtended && getDist(4, 5) < 0.65) {
    return { gesture: "A", confidence: 0.9 };
  }

  // 19. S: Fist with thumb wrapped across front of fingers
  if (!isThumbExtended && !isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended && getDist(4, 6) < 0.35) {
    return { gesture: "S", confidence: 0.88 };
  }

  // 20. T: Fist with thumb tucked under index finger
  if (!isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended && getDist(4, 5) < 0.32) {
    return { gesture: "T", confidence: 0.85 };
  }

  // 21. N: Fist with thumb tucked under index & middle fingers
  if (!isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended && getDist(4, 9) < 0.35) {
    return { gesture: "N", confidence: 0.85 };
  }

  // 22. M: Fist with thumb tucked under 3 fingers
  if (!isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended && getDist(4, 13) < 0.35) {
    return { gesture: "M", confidence: 0.85 };
  }

  // 23. E: All fingertips curled down touching thumb
  if (!isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended && thumbIndexTipDist < 0.38) {
    return { gesture: "E", confidence: 0.85 };
  }

  // 24. X: Index finger hooked/bent, others folded
  if (!isIndexExtended && getDist(8, 0) > 0.55 && getDist(8, 0) < 0.8 && !isMiddleExtended && !isRingExtended && !isPinkyExtended) {
    return { gesture: "X", confidence: 0.85 };
  }

  // 25. C: Curved C shape
  const avgExtension = (getDist(8, 5) + getDist(12, 9) + getDist(16, 13) + getDist(20, 17)) / 4;
  if (avgExtension > 0.55 && avgExtension < 0.9 && thumbIndexTipDist > 0.4 && thumbIndexTipDist < 0.9) {
    return { gesture: "C", confidence: 0.8 };
  }

  // 26. Z: Index extended pointing forward/up
  if (isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended && !isThumbExtended && isHandUpright) {
    return { gesture: "Z", confidence: 0.85 };
  }

  return { gesture: "Searching...", confidence: 0.2 };
}

/**
 * Reference 2D skeletal mockups for all 26 letters (A-Z) and common signs
 */
export const DICTIONARY_SHAPES = {
  "A": {
    joints: [
      {x: 100, y: 180},
      {x: 140, y: 150}, {x: 155, y: 120}, {x: 150, y: 90}, {x: 140, y: 70},
      {x: 110, y: 130}, {x: 115, y: 115}, {x: 112, y: 105}, {x: 110, y: 100},
      {x: 95, y: 130}, {x: 98, y: 115}, {x: 95, y: 105}, {x: 92, y: 100},
      {x: 80, y: 135}, {x: 82, y: 120}, {x: 80, y: 110}, {x: 78, y: 105},
      {x: 65, y: 140}, {x: 68, y: 128}, {x: 65, y: 120}, {x: 62, y: 115}
    ]
  },
  "B": {
    joints: [
      {x: 100, y: 180},
      {x: 120, y: 160}, {x: 130, y: 145}, {x: 125, y: 135}, {x: 112, y: 130},
      {x: 110, y: 120}, {x: 110, y: 90}, {x: 110, y: 65}, {x: 110, y: 40},
      {x: 95, y: 120}, {x: 95, y: 85}, {x: 95, y: 60}, {x: 95, y: 35},
      {x: 80, y: 125}, {x: 80, y: 90}, {x: 80, y: 65}, {x: 80, y: 42},
      {x: 65, y: 130}, {x: 65, y: 100}, {x: 65, y: 80}, {x: 65, y: 60}
    ]
  },
  "C": {
    joints: [
      {x: 100, y: 180},
      {x: 125, y: 160}, {x: 145, y: 145}, {x: 145, y: 125}, {x: 130, y: 110},
      {x: 95, y: 130}, {x: 85, y: 100}, {x: 85, y: 75}, {x: 98, y: 65},
      {x: 85, y: 135}, {x: 70, y: 105}, {x: 70, y: 80}, {x: 88, y: 70},
      {x: 75, y: 140}, {x: 60, y: 115}, {x: 60, y: 90}, {x: 78, y: 80},
      {x: 65, y: 145}, {x: 50, y: 125}, {x: 50, y: 105}, {x: 68, y: 95}
    ]
  },
  "D": {
    joints: [
      {x: 100, y: 180},
      {x: 125, y: 155}, {x: 130, y: 135}, {x: 120, y: 120}, {x: 108, y: 115},
      {x: 105, y: 125}, {x: 105, y: 95}, {x: 105, y: 70}, {x: 105, y: 45},
      {x: 95, y: 125}, {x: 90, y: 115}, {x: 88, y: 112}, {x: 96, y: 115},
      {x: 80, y: 130}, {x: 75, y: 120}, {x: 75, y: 118}, {x: 86, y: 120},
      {x: 65, y: 135}, {x: 60, y: 125}, {x: 60, y: 122}, {x: 76, y: 125}
    ]
  },
  "E": {
    joints: [
      {x: 100, y: 180},
      {x: 120, y: 160}, {x: 125, y: 145}, {x: 115, y: 135}, {x: 105, y: 130},
      {x: 105, y: 130}, {x: 108, y: 115}, {x: 105, y: 120}, {x: 105, y: 128},
      {x: 92, y: 130}, {x: 95, y: 115}, {x: 92, y: 120}, {x: 92, y: 128},
      {x: 80, y: 132}, {x: 82, y: 118}, {x: 80, y: 122}, {x: 80, y: 128},
      {x: 68, y: 135}, {x: 70, y: 122}, {x: 68, y: 125}, {x: 68, y: 130}
    ]
  },
  "F": {
    joints: [
      {x: 100, y: 180},
      {x: 125, y: 155}, {x: 130, y: 135}, {x: 120, y: 120}, {x: 108, y: 115},
      {x: 105, y: 125}, {x: 112, y: 115}, {x: 110, y: 115}, {x: 108, y: 115},
      {x: 95, y: 120}, {x: 95, y: 85}, {x: 95, y: 60}, {x: 95, y: 35},
      {x: 80, y: 125}, {x: 80, y: 90}, {x: 80, y: 65}, {x: 80, y: 42},
      {x: 65, y: 130}, {x: 65, y: 100}, {x: 65, y: 80}, {x: 65, y: 60}
    ]
  },
  "G": {
    joints: [
      {x: 100, y: 180},
      {x: 120, y: 160}, {x: 135, y: 145}, {x: 150, y: 135}, {x: 165, y: 130},
      {x: 110, y: 125}, {x: 130, y: 120}, {x: 150, y: 115}, {x: 170, y: 110},
      {x: 95, y: 130}, {x: 98, y: 118}, {x: 95, y: 112}, {x: 92, y: 108},
      {x: 82, y: 135}, {x: 85, y: 122}, {x: 82, y: 115}, {x: 80, y: 110},
      {x: 70, y: 140}, {x: 72, y: 128}, {x: 70, y: 120}, {x: 68, y: 115}
    ]
  },
  "H": {
    joints: [
      {x: 100, y: 180},
      {x: 115, y: 155}, {x: 122, y: 140}, {x: 115, y: 132}, {x: 105, y: 132},
      {x: 110, y: 125}, {x: 130, y: 120}, {x: 150, y: 115}, {x: 170, y: 110},
      {x: 95, y: 125}, {x: 125, y: 120}, {x: 148, y: 115}, {x: 168, y: 110},
      {x: 82, y: 135}, {x: 85, y: 122}, {x: 82, y: 115}, {x: 80, y: 110},
      {x: 70, y: 140}, {x: 72, y: 128}, {x: 70, y: 120}, {x: 68, y: 115}
    ]
  },
  "I": {
    joints: [
      {x: 100, y: 180},
      {x: 120, y: 160}, {x: 128, y: 148}, {x: 122, y: 140}, {x: 110, y: 138},
      {x: 108, y: 130}, {x: 112, y: 115}, {x: 110, y: 105}, {x: 108, y: 100},
      {x: 95, y: 130}, {x: 98, y: 115}, {x: 95, y: 105}, {x: 92, y: 100},
      {x: 82, y: 135}, {x: 85, y: 120}, {x: 82, y: 110}, {x: 80, y: 105},
      {x: 65, y: 140}, {x: 60, y: 115}, {x: 55, y: 92}, {x: 50, y: 70}
    ]
  },
  "J": {
    joints: [
      {x: 100, y: 180},
      {x: 120, y: 160}, {x: 128, y: 148}, {x: 122, y: 140}, {x: 110, y: 138},
      {x: 108, y: 130}, {x: 112, y: 115}, {x: 110, y: 105}, {x: 108, y: 100},
      {x: 95, y: 130}, {x: 98, y: 115}, {x: 95, y: 105}, {x: 92, y: 100},
      {x: 82, y: 135}, {x: 85, y: 120}, {x: 82, y: 110}, {x: 80, y: 105},
      {x: 65, y: 140}, {x: 55, y: 125}, {x: 42, y: 120}, {x: 35, y: 135}
    ]
  },
  "K": {
    joints: [
      {x: 100, y: 180},
      {x: 125, y: 155}, {x: 135, y: 138}, {x: 125, y: 115}, {x: 112, y: 95},
      {x: 105, y: 125}, {x: 105, y: 95}, {x: 105, y: 70}, {x: 105, y: 45},
      {x: 90, y: 125}, {x: 100, y: 98}, {x: 112, y: 78}, {x: 125, y: 60},
      {x: 75, y: 130}, {x: 78, y: 115}, {x: 75, y: 105}, {x: 72, y: 100},
      {x: 60, y: 135}, {x: 62, y: 120}, {x: 60, y: 110}, {x: 58, y: 105}
    ]
  },
  "L": {
    joints: [
      {x: 100, y: 180},
      {x: 130, y: 155}, {x: 150, y: 150}, {x: 168, y: 148}, {x: 185, y: 145},
      {x: 95, y: 125}, {x: 95, y: 95}, {x: 95, y: 70}, {x: 95, y: 45},
      {x: 85, y: 125}, {x: 88, y: 110}, {x: 85, y: 100}, {x: 82, y: 95},
      {x: 72, y: 130}, {x: 75, y: 115}, {x: 72, y: 105}, {x: 70, y: 100},
      {x: 60, y: 135}, {x: 62, y: 120}, {x: 60, y: 110}, {x: 58, y: 105}
    ]
  },
  "M": {
    joints: [
      {x: 100, y: 180},
      {x: 115, y: 155}, {x: 95, y: 135}, {x: 80, y: 132}, {x: 70, y: 130},
      {x: 105, y: 130}, {x: 108, y: 112}, {x: 105, y: 125}, {x: 105, y: 135},
      {x: 92, y: 130}, {x: 95, y: 112}, {x: 92, y: 125}, {x: 92, y: 135},
      {x: 80, y: 132}, {x: 82, y: 115}, {x: 80, y: 125}, {x: 80, y: 135},
      {x: 68, y: 135}, {x: 70, y: 122}, {x: 68, y: 125}, {x: 68, y: 130}
    ]
  },
  "N": {
    joints: [
      {x: 100, y: 180},
      {x: 115, y: 155}, {x: 100, y: 135}, {x: 88, y: 132}, {x: 82, y: 130},
      {x: 105, y: 130}, {x: 108, y: 112}, {x: 105, y: 125}, {x: 105, y: 135},
      {x: 92, y: 130}, {x: 95, y: 112}, {x: 92, y: 125}, {x: 92, y: 135},
      {x: 80, y: 132}, {x: 82, y: 120}, {x: 80, y: 112}, {x: 78, y: 108},
      {x: 68, y: 135}, {x: 70, y: 122}, {x: 68, y: 120}, {x: 65, y: 115}
    ]
  },
  "O": {
    joints: [
      {x: 100, y: 180},
      {x: 125, y: 155}, {x: 135, y: 135}, {x: 125, y: 115}, {x: 105, y: 98},
      {x: 95, y: 128}, {x: 85, y: 102}, {x: 88, y: 88}, {x: 102, y: 95},
      {x: 85, y: 132}, {x: 75, y: 105}, {x: 78, y: 90}, {x: 98, y: 96},
      {x: 75, y: 136}, {x: 65, y: 110}, {x: 68, y: 95}, {x: 94, y: 98},
      {x: 65, y: 140}, {x: 55, y: 118}, {x: 58, y: 102}, {x: 90, y: 100}
    ]
  },
  "P": {
    joints: [
      {x: 100, y: 180},
      {x: 125, y: 155}, {x: 135, y: 145}, {x: 125, y: 140}, {x: 112, y: 142},
      {x: 105, y: 135}, {x: 105, y: 160}, {x: 105, y: 185}, {x: 105, y: 210},
      {x: 90, y: 135}, {x: 100, y: 155}, {x: 112, y: 175}, {x: 125, y: 190},
      {x: 75, y: 130}, {x: 78, y: 115}, {x: 75, y: 105}, {x: 72, y: 100},
      {x: 60, y: 135}, {x: 62, y: 120}, {x: 60, y: 110}, {x: 58, y: 105}
    ]
  },
  "Q": {
    joints: [
      {x: 100, y: 180},
      {x: 120, y: 160}, {x: 135, y: 175}, {x: 150, y: 185}, {x: 165, y: 190},
      {x: 110, y: 135}, {x: 130, y: 145}, {x: 150, y: 155}, {x: 170, y: 165},
      {x: 95, y: 130}, {x: 98, y: 118}, {x: 95, y: 112}, {x: 92, y: 108},
      {x: 82, y: 135}, {x: 85, y: 122}, {x: 82, y: 115}, {x: 80, y: 110},
      {x: 70, y: 140}, {x: 72, y: 128}, {x: 70, y: 120}, {x: 68, y: 115}
    ]
  },
  "R": {
    joints: [
      {x: 100, y: 180},
      {x: 120, y: 160}, {x: 128, y: 148}, {x: 122, y: 140}, {x: 110, y: 138},
      {x: 105, y: 125}, {x: 100, y: 95}, {x: 92, y: 70}, {x: 85, y: 45},
      {x: 95, y: 125}, {x: 100, y: 95}, {x: 108, y: 70}, {x: 115, y: 45},
      {x: 75, y: 130}, {x: 78, y: 115}, {x: 75, y: 105}, {x: 72, y: 100},
      {x: 60, y: 135}, {x: 62, y: 120}, {x: 60, y: 110}, {x: 58, y: 105}
    ]
  },
  "S": {
    joints: [
      {x: 100, y: 180},
      {x: 120, y: 155}, {x: 110, y: 135}, {x: 95, y: 125}, {x: 82, y: 120},
      {x: 110, y: 130}, {x: 112, y: 118}, {x: 110, y: 110}, {x: 108, y: 108},
      {x: 95, y: 130}, {x: 98, y: 118}, {x: 95, y: 110}, {x: 92, y: 108},
      {x: 82, y: 135}, {x: 85, y: 120}, {x: 82, y: 112}, {x: 80, y: 110},
      {x: 68, y: 140}, {x: 70, y: 125}, {x: 68, y: 118}, {x: 65, y: 115}
    ]
  },
  "T": {
    joints: [
      {x: 100, y: 180},
      {x: 120, y: 155}, {x: 112, y: 135}, {x: 105, y: 120}, {x: 102, y: 112},
      {x: 110, y: 130}, {x: 112, y: 108}, {x: 108, y: 118}, {x: 106, y: 125},
      {x: 95, y: 130}, {x: 98, y: 118}, {x: 95, y: 110}, {x: 92, y: 108},
      {x: 82, y: 135}, {x: 85, y: 120}, {x: 82, y: 112}, {x: 80, y: 110},
      {x: 68, y: 140}, {x: 70, y: 125}, {x: 68, y: 118}, {x: 65, y: 115}
    ]
  },
  "U": {
    joints: [
      {x: 100, y: 180},
      {x: 120, y: 160}, {x: 128, y: 148}, {x: 122, y: 140}, {x: 110, y: 138},
      {x: 105, y: 125}, {x: 105, y: 95}, {x: 105, y: 70}, {x: 105, y: 45},
      {x: 92, y: 125}, {x: 92, y: 95}, {x: 92, y: 70}, {x: 92, y: 45},
      {x: 78, y: 130}, {x: 78, y: 115}, {x: 75, y: 105}, {x: 72, y: 100},
      {x: 62, y: 135}, {x: 62, y: 120}, {x: 60, y: 110}, {x: 58, y: 105}
    ]
  },
  "V": {
    joints: [
      {x: 100, y: 180},
      {x: 120, y: 160}, {x: 128, y: 148}, {x: 122, y: 140}, {x: 110, y: 138},
      {x: 110, y: 125}, {x: 115, y: 95}, {x: 120, y: 70}, {x: 125, y: 45},
      {x: 90, y: 125}, {x: 85, y: 95}, {x: 80, y: 70}, {x: 75, y: 45},
      {x: 75, y: 130}, {x: 78, y: 115}, {x: 75, y: 105}, {x: 72, y: 100},
      {x: 60, y: 135}, {x: 62, y: 120}, {x: 60, y: 110}, {x: 58, y: 105}
    ]
  },
  "W": {
    joints: [
      {x: 100, y: 180},
      {x: 120, y: 160}, {x: 128, y: 148}, {x: 122, y: 140}, {x: 110, y: 138},
      {x: 115, y: 125}, {x: 122, y: 95}, {x: 128, y: 70}, {x: 135, y: 45},
      {x: 95, y: 125}, {x: 95, y: 92}, {x: 95, y: 65}, {x: 95, y: 40},
      {x: 75, y: 125}, {x: 68, y: 95}, {x: 62, y: 70}, {x: 55, y: 45},
      {x: 60, y: 135}, {x: 62, y: 120}, {x: 60, y: 110}, {x: 58, y: 105}
    ]
  },
  "X": {
    joints: [
      {x: 100, y: 180},
      {x: 120, y: 160}, {x: 128, y: 148}, {x: 122, y: 140}, {x: 110, y: 138},
      {x: 105, y: 125}, {x: 105, y: 95}, {x: 112, y: 80}, {x: 105, y: 92},
      {x: 92, y: 130}, {x: 95, y: 115}, {x: 92, y: 105}, {x: 90, y: 100},
      {x: 78, y: 135}, {x: 80, y: 120}, {x: 78, y: 110}, {x: 75, y: 105},
      {x: 65, y: 140}, {x: 68, y: 128}, {x: 65, y: 120}, {x: 62, y: 115}
    ]
  },
  "Y": {
    joints: [
      {x: 100, y: 180},
      {x: 130, y: 155}, {x: 150, y: 148}, {x: 168, y: 142}, {x: 185, y: 138},
      {x: 108, y: 130}, {x: 112, y: 115}, {x: 110, y: 105}, {x: 108, y: 100},
      {x: 95, y: 130}, {x: 98, y: 115}, {x: 95, y: 105}, {x: 92, y: 100},
      {x: 82, y: 135}, {x: 85, y: 120}, {x: 82, y: 110}, {x: 80, y: 105},
      {x: 68, y: 140}, {x: 52, y: 125}, {x: 40, y: 112}, {x: 28, y: 100}
    ]
  },
  "Z": {
    joints: [
      {x: 100, y: 180},
      {x: 120, y: 160}, {x: 128, y: 148}, {x: 122, y: 140}, {x: 110, y: 138},
      {x: 105, y: 125}, {x: 105, y: 95}, {x: 105, y: 70}, {x: 105, y: 45},
      {x: 92, y: 130}, {x: 95, y: 115}, {x: 92, y: 105}, {x: 90, y: 100},
      {x: 78, y: 135}, {x: 80, y: 120}, {x: 78, y: 110}, {x: 75, y: 105},
      {x: 65, y: 140}, {x: 68, y: 128}, {x: 65, y: 120}, {x: 62, y: 115}
    ]
  },
  "I Love You": {
    joints: [
      {x: 100, y: 180},
      {x: 130, y: 155}, {x: 150, y: 148}, {x: 168, y: 142}, {x: 185, y: 138},
      {x: 110, y: 125}, {x: 110, y: 95}, {x: 110, y: 70}, {x: 110, y: 45},
      {x: 95, y: 130}, {x: 98, y: 115}, {x: 95, y: 105}, {x: 92, y: 100},
      {x: 82, y: 135}, {x: 85, y: 120}, {x: 82, y: 110}, {x: 80, y: 105},
      {x: 65, y: 140}, {x: 60, y: 115}, {x: 55, y: 92}, {x: 50, y: 70}
    ]
  },
  "Hello": {
    joints: [
      {x: 100, y: 180},
      {x: 130, y: 165}, {x: 148, y: 150}, {x: 156, y: 138}, {x: 160, y: 125},
      {x: 110, y: 120}, {x: 110, y: 90}, {x: 110, y: 65}, {x: 110, y: 40},
      {x: 95, y: 120}, {x: 95, y: 85}, {x: 95, y: 60}, {x: 95, y: 35},
      {x: 80, y: 125}, {x: 80, y: 90}, {x: 80, y: 65}, {x: 80, y: 42},
      {x: 65, y: 130}, {x: 65, y: 100}, {x: 65, y: 80}, {x: 65, y: 60}
    ]
  },
  "Doctor": {
    joints: [
      {x: 100, y: 180},
      {x: 115, y: 155}, {x: 122, y: 140}, {x: 115, y: 132}, {x: 105, y: 132},
      {x: 115, y: 120}, {x: 138, y: 110}, {x: 160, y: 102}, {x: 180, y: 95},
      {x: 102, y: 120}, {x: 128, y: 115}, {x: 150, y: 110}, {x: 170, y: 105},
      {x: 88, y: 125}, {x: 90, y: 115}, {x: 88, y: 108}, {x: 85, y: 102},
      {x: 75, y: 130}, {x: 78, y: 120}, {x: 75, y: 115}, {x: 72, y: 110}
    ]
  },
  "Fever": {
    joints: [
      {x: 100, y: 180},
      {x: 120, y: 160}, {x: 132, y: 148}, {x: 138, y: 135}, {x: 142, y: 122},
      {x: 112, y: 120}, {x: 132, y: 102}, {x: 150, y: 88}, {x: 165, y: 75},
      {x: 98, y: 120}, {x: 118, y: 100}, {x: 135, y: 85}, {x: 150, y: 70},
      {x: 84, y: 122}, {x: 102, y: 105}, {x: 118, y: 92}, {x: 132, y: 78},
      {x: 70, y: 128}, {x: 86, y: 112}, {x: 100, y: 100}, {x: 112, y: 88}
    ]
  },
  "Pain": {
    joints: [
      {x: 100, y: 180},
      {x: 115, y: 155}, {x: 120, y: 145}, {x: 115, y: 140}, {x: 108, y: 138},
      {x: 110, y: 122}, {x: 132, y: 112}, {x: 155, y: 105}, {x: 178, y: 100},
      {x: 95, y: 125}, {x: 98, y: 110}, {x: 95, y: 102}, {x: 92, y: 98},
      {x: 82, y: 130}, {x: 85, y: 115}, {x: 82, y: 108}, {x: 80, y: 102},
      {x: 68, y: 135}, {x: 70, y: 120}, {x: 68, y: 112}, {x: 65, y: 108}
    ]
  },
  "Help": {
    joints: [
      {x: 100, y: 180},
      {x: 112, y: 142}, {x: 115, y: 112}, {x: 112, y: 88}, {x: 108, y: 65},
      {x: 110, y: 135}, {x: 115, y: 120}, {x: 112, y: 112}, {x: 108, y: 108},
      {x: 95, y: 135}, {x: 98, y: 120}, {x: 95, y: 112}, {x: 92, y: 108},
      {x: 82, y: 138}, {x: 85, y: 122}, {x: 82, y: 115}, {x: 80, y: 110},
      {x: 68, y: 140}, {x: 70, y: 125}, {x: 68, y: 118}, {x: 65, y: 112}
    ]
  },
  "Medicine": {
    joints: [
      {x: 100, y: 180},
      {x: 120, y: 160}, {x: 130, y: 145}, {x: 125, y: 135}, {x: 115, y: 132},
      {x: 110, y: 120}, {x: 110, y: 90}, {x: 110, y: 65}, {x: 110, y: 40},
      {x: 95, y: 120}, {x: 95, y: 110}, {x: 95, y: 125}, {x: 95, y: 142},
      {x: 80, y: 125}, {x: 80, y: 92}, {x: 80, y: 68}, {x: 80, y: 45},
      {x: 65, y: 130}, {x: 65, y: 100}, {x: 65, y: 80}, {x: 65, y: 60}
    ]
  }
};
