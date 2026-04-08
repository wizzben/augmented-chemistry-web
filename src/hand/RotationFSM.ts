/**
 * RotationFSM — pure state-machine for the rotation hand in markerless mode.
 *
 * Owns only the FSM transitions; no Three.js or DOM dependencies.
 * HandObjectManager owns the quaternion math and delegates state transitions here.
 *
 * States:
 *   NO_HAND → HAND_DETECTED → READY → GRABBED → ROTATING → RELEASED → READY
 *   GRABBED/ROTATING → TRACKING_LOST → NO_HAND (after grace period)
 */

export type RotationState =
  | 'NO_HAND' | 'HAND_DETECTED' | 'READY'
  | 'GRABBED' | 'ROTATING' | 'RELEASED' | 'TRACKING_LOST';

/** Milliseconds the FSM stays in TRACKING_LOST before falling back to NO_HAND. */
const LOST_TRACKING_GRACE_MS = 300;

/** Minimum rotation angle (radians, ~1.4°) — smaller deltas stay in GRABBED (dead zone). */
const MIN_ROTATION_ANGLE = 0.025;

export class RotationFSM {
  state: RotationState = 'NO_HAND';
  /** True while the pinch clutch is engaged (GRABBED or ROTATING). */
  grabActive = false;

  private _trackingLostElapsedMs = 0;

  update(input: {
    handDetected: boolean;
    isPinching: boolean;
    deltaAngle: number;
    elapsedMs: number;
  }): void {
    const { handDetected, isPinching, deltaAngle, elapsedMs } = input;

    // ── Phase 1: Hand detection ───────────────────────────────────────────────
    if (!handDetected) {
      if (this.state === 'GRABBED' || this.state === 'ROTATING') {
        // Lost tracking mid-grab — enter grace period
        this.state = 'TRACKING_LOST';
        this._trackingLostElapsedMs = 0;
        this.grabActive = false;
      } else if (this.state === 'TRACKING_LOST') {
        this._trackingLostElapsedMs += elapsedMs;
        if (this._trackingLostElapsedMs >= LOST_TRACKING_GRACE_MS) {
          this.state = 'NO_HAND';
          this.grabActive = false;
        }
      } else {
        this.state = 'NO_HAND';
        this.grabActive = false;
      }
      return;
    }

    // Hand detected
    if (this.state === 'NO_HAND' || this.state === 'TRACKING_LOST') {
      this.state = 'HAND_DETECTED';
      this.grabActive = false;
      return;
    }
    if (this.state === 'HAND_DETECTED') {
      this.state = 'READY';
    }

    // ── Phase 2: Pinch clutch ─────────────────────────────────────────────────
    if (this.state === 'READY' && isPinching) {
      this.state = 'GRABBED';
      this.grabActive = true;
    } else if (this.state === 'RELEASED') {
      this.state = 'READY';
    } else if ((this.state === 'GRABBED' || this.state === 'ROTATING') && !isPinching) {
      this.state = 'RELEASED';
      this.grabActive = false;
    }

    // ── Phase 3: Dead zone check ──────────────────────────────────────────────
    // Advance GRABBED → ROTATING only once the delta exceeds the dead zone.
    if (this.grabActive && deltaAngle >= MIN_ROTATION_ANGLE) {
      this.state = 'ROTATING';
    }
  }

  reset(): void {
    this.state = 'NO_HAND';
    this.grabActive = false;
    this._trackingLostElapsedMs = 0;
  }
}
