import * as THREE from 'three';
import { type NormalizedLandmark, type Landmark } from '@mediapipe/tasks-vision';
import { HAND_LANDMARKS } from './HandTracker';

// ── Pinch thresholds (scale-invariant ratio: thumbIndexDist / palmWidth) ─────
// palmWidth = ||indexMCP − pinkyMCP|| in normalized screen space.
const PINCH_ON_THRESHOLD  = 0.4;  // ratio below this → pinch activates
const PINCH_OFF_THRESHOLD = 0.6;  // ratio above this → pinch releases (hysteresis gap = 0.2)
const PINCH_COOLDOWN_MS   = 200;  // minimum ms between triggered pinch events
/** Consecutive frames ratio must stay below PINCH_ON_THRESHOLD before activating. */
const PINCH_HOLD_FRAMES   = 3;

// ── Open/closed hand thresholds (avg fingertip-to-wrist distance) ─────────────
const HAND_OPEN_THRESHOLD = 0.15;  // above → open
const HAND_CLOSED_THRESHOLD = 0.10; // below → closed (hysteresis)

/**
 * Per-hand gesture state machine.
 *
 * Create one instance per hand, call update() each frame with that hand's
 * landmark arrays. Read the resulting state properties.
 *
 * Coordinate conventions:
 * - landmarks are NormalizedLandmark (x, y in [0,1] screen space)
 * - worldLandmarks are Landmark (x, y, z in metric space, hand-centred)
 */
export class GestureDetector {
  // ── Pinch ────────────────────────────────────────────────────────────────
  /** True while the pinch gesture is held. */
  isPinching = false;
  /**
   * True for exactly one frame when a new pinch starts (falling edge of
   * thumb-index distance). Resets to false on the next update() call.
   * Respects PINCH_COOLDOWN_MS to prevent rapid re-triggering.
   */
  pinchTriggered = false;

  /**
   * Continuous pinch progress in [0, 1].
   * 0 = fingers fully apart (≥ PINCH_OFF_THRESHOLD).
   * 1 = fingers at or below PINCH_ON_THRESHOLD (pinch active).
   * Useful for drawing a closing-arc indicator that anticipates the pinch.
   */
  pinchProgress = 0;

  // Starts at cooldown so the very first pinch always triggers immediately.
  private _timeSinceLastPinchMs = PINCH_COOLDOWN_MS;
  /** Consecutive frames dist has been below PINCH_ON_THRESHOLD (confirmation hold). */
  private _pinchHoldFrames = 0;

  // ── Open / closed ─────────────────────────────────────────────────────────
  /** True when the hand is open (fingers extended). */
  isOpen = true;

  // ── Palm rotation (world-space) ───────────────────────────────────────────
  /**
   * Quaternion delta representing how much the palm rotated since the previous
   * frame. Apply to a Three.js Object3D's quaternion to rotate the molecule.
   * Identity when no previous frame exists or when the hand is closed.
   */
  readonly rotationDelta: THREE.Quaternion = new THREE.Quaternion();

  private _prevPalmQuaternion: THREE.Quaternion | null = null;

  // ── Fingertip position ────────────────────────────────────────────────────
  /**
   * Index fingertip position in normalized screen space [0,1].
   * x: left→right, y: top→bottom (as MediaPipe outputs).
   * (0,0) when no landmarks are present.
   */
  indexTip = { x: 0, y: 0 };

  // ─── Reusable THREE objects (avoid per-frame allocations) ─────────────────
  private _v0 = new THREE.Vector3();
  private _v1 = new THREE.Vector3();
  private _v2 = new THREE.Vector3();
  private _v3 = new THREE.Vector3();
  private _normal = new THREE.Vector3();
  private _forward = new THREE.Vector3();
  private _currentQ = new THREE.Quaternion();
  private _mat = new THREE.Matrix4();

  /**
   * Process one frame for this hand.
   *
   * @param landmarks       21 NormalizedLandmark entries for this hand.
   * @param worldLandmarks  21 Landmark entries in metric world space.
   * @param elapsedMs       Elapsed milliseconds since the previous frame
   *                        (used for cooldown; pass 0 on first frame).
   */
  update(
    landmarks: NormalizedLandmark[],
    worldLandmarks: Landmark[],
    elapsedMs: number,
  ): void {
    // Reset edge-triggered state from the previous frame.
    this.pinchTriggered = false;

    if (landmarks.length < 21 || worldLandmarks.length < 21) {
      // No valid hand data — reset derived state.
      this._prevPalmQuaternion = null;
      this.rotationDelta.identity();
      return;
    }

    this._updateIndexTip(landmarks);
    this._updatePinch(landmarks, elapsedMs);
    this._updateOpenClosed(landmarks);
    this._updateRotationDelta(worldLandmarks);
  }

  /** Reset all state (e.g. when the hand disappears from view). */
  reset(): void {
    this.isPinching = false;
    this.pinchTriggered = false;
    this.pinchProgress = 0;
    this._pinchHoldFrames = 0;
    this.isOpen = true;
    this.rotationDelta.identity();
    this._prevPalmQuaternion = null;
    this.indexTip = { x: 0, y: 0 };
    this._timeSinceLastPinchMs = PINCH_COOLDOWN_MS;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _updateIndexTip(lm: NormalizedLandmark[]): void {
    const tip = lm[HAND_LANDMARKS.INDEX_TIP];
    this.indexTip = { x: tip.x, y: tip.y };
  }

  private _updatePinch(lm: NormalizedLandmark[], elapsedMs: number): void {
    this._timeSinceLastPinchMs += elapsedMs;

    // Scale-invariant pinch ratio: thumbIndexDist / palmWidth.
    // palmWidth normalises for hand size and camera distance.
    const indexMCP = lm[HAND_LANDMARKS.INDEX_MCP];
    const pinkyMCP = lm[HAND_LANDMARKS.PINKY_MCP];
    const pwdx = indexMCP.x - pinkyMCP.x;
    const pwdy = indexMCP.y - pinkyMCP.y;
    const palmWidth = Math.sqrt(pwdx * pwdx + pwdy * pwdy);

    // Guard: degenerate pose (hand nearly edge-on) — skip update this frame.
    if (palmWidth < 0.001) return;

    const thumb = lm[HAND_LANDMARKS.THUMB_TIP];
    const index = lm[HAND_LANDMARKS.INDEX_TIP];
    const dx = thumb.x - index.x;
    const dy = thumb.y - index.y;
    const ratio = Math.sqrt(dx * dx + dy * dy) / palmWidth;

    // Continuous progress for the arc indicator — independent of hold logic.
    this.pinchProgress = 1 - Math.min(1, Math.max(0,
      (ratio - PINCH_ON_THRESHOLD) / (PINCH_OFF_THRESHOLD - PINCH_ON_THRESHOLD),
    ));

    // Confirmation hold: count consecutive frames below the on-threshold.
    // Resets the instant ratio rises back above it (even into the hysteresis
    // zone) so jitter can't accumulate across a brief gap. isPinching uses
    // the standard hysteresis for the *release* direction only.
    if (ratio < PINCH_ON_THRESHOLD) {
      this._pinchHoldFrames++;
    } else {
      this._pinchHoldFrames = 0;
    }

    const wasPinching = this.isPinching;

    if (!this.isPinching && this._pinchHoldFrames >= PINCH_HOLD_FRAMES) {
      this.isPinching = true;
    } else if (this.isPinching && ratio > PINCH_OFF_THRESHOLD) {
      this.isPinching = false;
    }

    // Rising edge + cooldown elapsed → trigger
    if (this.isPinching && !wasPinching && this._timeSinceLastPinchMs >= PINCH_COOLDOWN_MS) {
      this.pinchTriggered = true;
      this._timeSinceLastPinchMs = 0;
    }
  }

  private _updateOpenClosed(lm: NormalizedLandmark[]): void {
    const wrist = lm[HAND_LANDMARKS.WRIST];
    const tips = [
      lm[HAND_LANDMARKS.INDEX_TIP],
      lm[HAND_LANDMARKS.MIDDLE_TIP],
      lm[HAND_LANDMARKS.RING_TIP],
      lm[HAND_LANDMARKS.PINKY_TIP],
    ];
    let sum = 0;
    for (const tip of tips) {
      const dx = tip.x - wrist.x;
      const dy = tip.y - wrist.y;
      sum += Math.sqrt(dx * dx + dy * dy);
    }
    const avg = sum / tips.length;

    if (!this.isOpen && avg > HAND_OPEN_THRESHOLD) {
      this.isOpen = true;
    } else if (this.isOpen && avg < HAND_CLOSED_THRESHOLD) {
      this.isOpen = false;
    }
  }

  private _updateRotationDelta(wl: Landmark[]): void {
    // Four landmarks define the palm orientation:
    //   wrist (0), index MCP (5), middle MCP (9), pinky MCP (17)
    const wrist     = wl[HAND_LANDMARKS.WRIST];
    const indexMCP  = wl[HAND_LANDMARKS.INDEX_MCP];
    const middleMCP = wl[HAND_LANDMARKS.MIDDLE_MCP];
    const pinkyMCP  = wl[HAND_LANDMARKS.PINKY_MCP];

    this._v0.set(wrist.x,     wrist.y,     wrist.z);
    this._v1.set(indexMCP.x,  indexMCP.y,  indexMCP.z);
    this._v2.set(middleMCP.x, middleMCP.y, middleMCP.z);
    this._v3.set(pinkyMCP.x,  pinkyMCP.y,  pinkyMCP.z);

    // x = normalize(indexMCP - pinkyMCP)
    this._forward.subVectors(this._v1, this._v3).normalize();
    const xAxis = this._forward;

    // y' = normalize(middleMCP - wrist)
    this._normal.subVectors(this._v2, this._v0).normalize();

    // z = normalize(cross(x, y'))  — reuse _v0 (wrist pos no longer needed)
    this._v0.crossVectors(xAxis, this._normal).normalize();
    const zAxis = this._v0;

    // y = normalize(cross(z, x))  — reuse _v1 (indexMCP pos no longer needed)
    this._v1.crossVectors(zAxis, xAxis).normalize();
    const yAxis = this._v1;

    this._mat.makeBasis(xAxis, yAxis, zAxis);
    this._currentQ.setFromRotationMatrix(this._mat);

    if (this._prevPalmQuaternion === null) {
      this.rotationDelta.identity();
    } else {
      // delta = prev^-1 * current
      this.rotationDelta
        .copy(this._prevPalmQuaternion)
        .invert()
        .multiply(this._currentQ);
    }

    this._prevPalmQuaternion = this._currentQ.clone();
  }
}
