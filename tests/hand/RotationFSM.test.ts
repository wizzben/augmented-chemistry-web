import { describe, it, expect, beforeEach } from 'vitest';
import { RotationFSM } from '@/hand/RotationFSM';

// Convenience: a full-rotation frame (delta above dead zone)
const ABOVE_DEAD_ZONE = 0.05;  // > MIN_ROTATION_ANGLE (0.025)
const BELOW_DEAD_ZONE = 0.01;  // < MIN_ROTATION_ANGLE

const NO_PINCH = { isPinching: false, deltaAngle: 0, elapsedMs: 16 };

/** Update with handDetected=true, merging any extra fields. */
function step(fsm: RotationFSM, extra: Partial<typeof NO_PINCH> = {}): void {
  fsm.update({ handDetected: true, ...NO_PINCH, ...extra });
}

/** Update with handDetected=false. */
function loseHand(fsm: RotationFSM, elapsedMs = 16): void {
  fsm.update({ handDetected: false, isPinching: false, deltaAngle: 0, elapsedMs });
}

/**
 * Drive the FSM to the target state.
 * Uses BELOW_DEAD_ZONE when stopping at GRABBED (so the dead-zone check
 * does not immediately advance it to ROTATING in the same frame).
 */
function advance(fsm: RotationFSM, target: string): void {
  for (let i = 0; i < 6; i++) {
    if (fsm.state === target) return;
    switch (fsm.state) {
      case 'NO_HAND':     step(fsm); break;           // → HAND_DETECTED
      case 'HAND_DETECTED': step(fsm); break;          // → READY
      case 'READY':
        step(fsm, { isPinching: true, deltaAngle: target === 'GRABBED' ? BELOW_DEAD_ZONE : ABOVE_DEAD_ZONE });
        break; // → GRABBED (tiny delta) or ROTATING (large delta)
      case 'GRABBED':
        step(fsm, { isPinching: true, deltaAngle: ABOVE_DEAD_ZONE });
        break; // → ROTATING
      case 'ROTATING':
        step(fsm, { isPinching: false }); break;       // → RELEASED
      case 'RELEASED':
        step(fsm); break;                              // → READY
    }
  }
}

describe('RotationFSM', () => {
  let fsm: RotationFSM;

  beforeEach(() => {
    fsm = new RotationFSM();
  });

  it('starts in NO_HAND with grabActive=false', () => {
    expect(fsm.state).toBe('NO_HAND');
    expect(fsm.grabActive).toBe(false);
  });

  // ── Core state transitions ─────────────────────────────────────────────────

  it('NO_HAND → HAND_DETECTED when hand first appears', () => {
    step(fsm);
    expect(fsm.state).toBe('HAND_DETECTED');
  });

  it('HAND_DETECTED → READY on the next frame', () => {
    step(fsm); // → HAND_DETECTED
    step(fsm); // → READY
    expect(fsm.state).toBe('READY');
  });

  it('READY → GRABBED when pinch engages', () => {
    advance(fsm, 'READY');
    step(fsm, { isPinching: true });
    expect(fsm.state).toBe('GRABBED');
    expect(fsm.grabActive).toBe(true);
  });

  it('GRABBED → ROTATING when delta exceeds dead zone', () => {
    advance(fsm, 'GRABBED');
    step(fsm, { isPinching: true, deltaAngle: ABOVE_DEAD_ZONE });
    expect(fsm.state).toBe('ROTATING');
    expect(fsm.grabActive).toBe(true);
  });

  it('ROTATING → RELEASED when pinch releases', () => {
    advance(fsm, 'ROTATING');
    step(fsm, { isPinching: false });
    expect(fsm.state).toBe('RELEASED');
    expect(fsm.grabActive).toBe(false);
  });

  it('RELEASED → READY on the next frame', () => {
    advance(fsm, 'ROTATING');
    step(fsm, { isPinching: false }); // → RELEASED
    step(fsm);                         // → READY
    expect(fsm.state).toBe('READY');
  });

  // ── Tracking loss ──────────────────────────────────────────────────────────

  it('GRABBED → TRACKING_LOST when hand disappears', () => {
    advance(fsm, 'GRABBED');
    loseHand(fsm);
    expect(fsm.state).toBe('TRACKING_LOST');
    expect(fsm.grabActive).toBe(false);
  });

  it('ROTATING → TRACKING_LOST when hand disappears', () => {
    advance(fsm, 'ROTATING');
    loseHand(fsm);
    expect(fsm.state).toBe('TRACKING_LOST');
  });

  it('stays in TRACKING_LOST during the grace window', () => {
    advance(fsm, 'GRABBED');
    loseHand(fsm);
    // Grace is 300 ms; only 200 ms elapsed so far
    loseHand(fsm, 200);
    expect(fsm.state).toBe('TRACKING_LOST');
  });

  it('TRACKING_LOST → NO_HAND after grace period expires (300 ms)', () => {
    advance(fsm, 'GRABBED');
    loseHand(fsm);
    // Single frame that pushes elapsed past 300 ms
    loseHand(fsm, 300);
    expect(fsm.state).toBe('NO_HAND');
  });

  // ── Dead zone ─────────────────────────────────────────────────────────────

  it('stays in GRABBED when delta is below dead zone', () => {
    advance(fsm, 'READY');
    step(fsm, { isPinching: true, deltaAngle: BELOW_DEAD_ZONE });
    expect(fsm.state).toBe('GRABBED');
  });

  // ── reset() ───────────────────────────────────────────────────────────────

  it('reset() returns to NO_HAND with grabActive=false', () => {
    advance(fsm, 'ROTATING');
    fsm.reset();
    expect(fsm.state).toBe('NO_HAND');
    expect(fsm.grabActive).toBe(false);
  });

  it('reset() clears tracking-lost elapsed so grace restarts', () => {
    advance(fsm, 'GRABBED');
    loseHand(fsm, 200);
    expect(fsm.state).toBe('TRACKING_LOST');

    fsm.reset();
    expect(fsm.state).toBe('NO_HAND');

    // After reset, re-entering TRACKING_LOST needs a full 300 ms again
    advance(fsm, 'GRABBED');
    loseHand(fsm, 16);   // → TRACKING_LOST, 16 ms elapsed
    expect(fsm.state).toBe('TRACKING_LOST');
    loseHand(fsm, 200);  // total 216 ms — should NOT expire yet
    expect(fsm.state).toBe('TRACKING_LOST');
  });
});
