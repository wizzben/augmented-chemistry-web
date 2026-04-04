import * as THREE from 'three';
import { type NormalizedLandmark, type Landmark } from '@mediapipe/tasks-vision';
import { HAND_LANDMARKS } from './HandTracker';

// ── Pinch thresholds (normalized screen-space distance) ──────────────────────
const PINCH_ON_THRESHOLD = 0.04;   // thumb tip to index tip: pinch activates
const PINCH_OFF_THRESHOLD = 0.06;  // hysteresis: pinch releases above this
const PINCH_COOLDOWN_MS = 300;     // minimum ms between triggered pinch events

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

  // Starts at cooldown so the very first pinch always triggers immediately.
  private _timeSinceLastPinchMs = PINCH_COOLDOWN_MS;

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

    const thumb = lm[HAND_LANDMARKS.THUMB_TIP];
    const index = lm[HAND_LANDMARKS.INDEX_TIP];
    const dx = thumb.x - index.x;
    const dy = thumb.y - index.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const wasPinching = this.isPinching;

    if (!this.isPinching && dist < PINCH_ON_THRESHOLD) {
      this.isPinching = true;
    } else if (this.isPinching && dist > PINCH_OFF_THRESHOLD) {
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
    // Three points on the palm define its orientation:
    //   wrist (0), index MCP (5), pinky MCP (17)
    const wrist = wl[HAND_LANDMARKS.WRIST];
    const indexMCP = wl[HAND_LANDMARKS.INDEX_MCP];
    const pinkyMCP = wl[HAND_LANDMARKS.PINKY_MCP];

    this._v0.set(wrist.x, wrist.y, wrist.z);
    this._v1.set(indexMCP.x, indexMCP.y, indexMCP.z);
    this._v2.set(pinkyMCP.x, pinkyMCP.y, pinkyMCP.z);

    // Palm normal = (indexMCP - wrist) × (pinkyMCP - wrist)
    const edge1 = this._v1.clone().sub(this._v0);
    const edge2 = this._v2.clone().sub(this._v0);
    this._normal.crossVectors(edge1, edge2).normalize();

    // Palm forward = direction from wrist toward index MCP
    this._forward.copy(edge1).normalize();

    // Build rotation matrix: X = forward, Z = normal, Y = Z × X
    const xAxis = this._forward;
    const zAxis = this._normal;
    const yAxis = this._v0.clone().crossVectors(zAxis, xAxis).normalize();

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
