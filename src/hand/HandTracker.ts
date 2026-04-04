import {
  FilesetResolver,
  HandLandmarker,
  type NormalizedLandmark,
  type Landmark,
  type Category,
} from '@mediapipe/tasks-vision';

/**
 * One frame of hand-tracking results.
 * landmarks and worldLandmarks are indexed by hand (0 or 1),
 * then by landmark index (0–20).
 * handedness[i] contains the Category[] for hand i — check [0].categoryName
 * for "Left" or "Right".
 */
export interface HandFrame {
  /** Normalized screen-space coords (x, y, z in [0,1]). 21 landmarks per hand. */
  landmarks: NormalizedLandmark[][];
  /** Metric world-space coords. 21 landmarks per hand. */
  worldLandmarks: Landmark[][];
  /** Handedness categories per hand. Use [i][0].categoryName: "Left" | "Right". */
  handedness: Category[][];
  timestamp: number;
}

/**
 * Landmark indices used throughout the hand module.
 * Defined here as a central reference.
 */
export const HAND_LANDMARKS = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_TIP: 8,
  MIDDLE_TIP: 12,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_TIP: 20,
} as const;

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const MODEL_CDN =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

/**
 * Thin wrapper around MediaPipe Hand Landmarker.
 * Handles init and per-frame detection. No Three.js or DOM dependencies.
 */
export class HandTracker {
  private landmarker: HandLandmarker | null = null;

  async init(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
    this.landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_CDN,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  }

  /**
   * Run detection on the current video frame.
   * Must be called after init(). Returns an empty HandFrame if no hands detected.
   */
  detect(video: HTMLVideoElement, timestamp: number): HandFrame {
    if (!this.landmarker) {
      throw new Error('HandTracker: call init() before detect()');
    }
    const result = this.landmarker.detectForVideo(video, timestamp);
    return {
      landmarks: result.landmarks,
      worldLandmarks: result.worldLandmarks,
      handedness: result.handedness,
      timestamp,
    };
  }

  dispose(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }
}
