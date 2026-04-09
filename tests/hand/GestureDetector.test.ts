import { describe, it, expect, beforeEach } from 'vitest';
import { GestureDetector } from '@/hand/GestureDetector';
import type { NormalizedLandmark, Landmark } from '@mediapipe/tasks-vision';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a flat array of 21 NormalizedLandmarks, all at (cx, cy, 0). */
function flatLandmarks(cx = 0.5, cy = 0.5): NormalizedLandmark[] {
  return Array.from({ length: 21 }, () => ({ x: cx, y: cy, z: 0, visibility: 1 }));
}

/**
 * Spread indexMCP (5) and pinkyMCP (17) so palmWidth = 0.4.
 * With this base, ratio = thumbIndexDist / 0.4.
 *   ratio < 0.4 (pinch ON)  ↔  thumbIndexDist < 0.16
 *   ratio > 0.6 (pinch OFF) ↔  thumbIndexDist > 0.24
 */
function withPalmSpread(base: NormalizedLandmark[]): NormalizedLandmark[] {
  return withOverrides(base, {
    5:  { x: 0.3, y: 0.5 }, // indexMCP
    17: { x: 0.7, y: 0.5 }, // pinkyMCP  → palmWidth = 0.4
  });
}

/** Build a flat array of 21 world Landmarks at (0,0,0). */
function flatWorldLandmarks(): Landmark[] {
  return Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }));
}

/**
 * Clone a landmark array and override specific indices.
 * overrides: { index: { x?, y?, z? } }
 */
function withOverrides(
  base: NormalizedLandmark[],
  overrides: Record<number, Partial<NormalizedLandmark>>,
): NormalizedLandmark[] {
  return base.map((lm, i) => (i in overrides ? { ...lm, ...overrides[i] } : lm));
}

function withWorldOverrides(
  base: Landmark[],
  overrides: Record<number, Partial<Landmark>>,
): Landmark[] {
  return base.map((lm, i) => (i in overrides ? { ...lm, ...overrides[i] } : lm));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GestureDetector', () => {
  let detector: GestureDetector;

  beforeEach(() => {
    detector = new GestureDetector();
  });

  // ── Pinch detection ───────────────────────────────────────────────────────

  describe('pinch detection', () => {
    it('starts not pinching', () => {
      expect(detector.isPinching).toBe(false);
      expect(detector.pinchTriggered).toBe(false);
    });

    it('activates when thumb-index distance falls below threshold', () => {
      // palmWidth = 0.4 (indexMCP at x=0.3, pinkyMCP at x=0.7).
      // thumbIndexDist = 0.04 → ratio = 0.04/0.4 = 0.10, well below ON(0.4).
      // Hold requirement: 3 consecutive frames below threshold before activating.
      const lm = withPalmSpread(withOverrides(flatLandmarks(), {
        4: { x: 0.50, y: 0.50 },
        8: { x: 0.54, y: 0.50 }, // dist = 0.04 → ratio = 0.10
      }));
      detector.update(lm, flatWorldLandmarks(), 16);
      detector.update(lm, flatWorldLandmarks(), 16);
      detector.update(lm, flatWorldLandmarks(), 16);
      expect(detector.isPinching).toBe(true);
    });

    it('fires pinchTriggered on the frame the hold is confirmed', () => {
      const lm = withPalmSpread(withOverrides(flatLandmarks(), {
        4: { x: 0.50, y: 0.50 },
        8: { x: 0.54, y: 0.50 }, // ratio = 0.10
      }));
      // Cooldown starts pre-expired; trigger fires on the 3rd consecutive frame.
      detector.update(lm, flatWorldLandmarks(), 16);
      detector.update(lm, flatWorldLandmarks(), 16);
      detector.update(lm, flatWorldLandmarks(), 16);
      expect(detector.pinchTriggered).toBe(true);
    });

    it('pinchTriggered is false on subsequent frames of the same pinch', () => {
      const lmPinch = withPalmSpread(withOverrides(flatLandmarks(), {
        4: { x: 0.50, y: 0.50 },
        8: { x: 0.54, y: 0.50 }, // ratio = 0.10
      }));
      detector.update(lmPinch, flatWorldLandmarks(), 16);
      detector.update(lmPinch, flatWorldLandmarks(), 16);
      detector.update(lmPinch, flatWorldLandmarks(), 16);
      expect(detector.pinchTriggered).toBe(true);

      // Fourth frame: still pinching, but trigger is edge-detected (false now)
      detector.update(lmPinch, flatWorldLandmarks(), 16);
      expect(detector.pinchTriggered).toBe(false);
    });

    it('does not trigger again within cooldown period', () => {
      const lmPinch = withPalmSpread(withOverrides(flatLandmarks(), {
        4: { x: 0.50, y: 0.50 },
        8: { x: 0.54, y: 0.50 }, // ratio = 0.10
      }));
      const lmRelease = withPalmSpread(withOverrides(flatLandmarks(), {
        4: { x: 0.50, y: 0.50 },
        8: { x: 0.76, y: 0.50 }, // dist = 0.26 → ratio = 0.65, above OFF(0.6)
      }));

      // First pinch — 3 frames to confirm hold
      detector.update(lmPinch, flatWorldLandmarks(), 16);
      detector.update(lmPinch, flatWorldLandmarks(), 16);
      detector.update(lmPinch, flatWorldLandmarks(), 16);
      expect(detector.pinchTriggered).toBe(true);

      // Release
      detector.update(lmRelease, flatWorldLandmarks(), 16);
      expect(detector.isPinching).toBe(false);

      // Second pinch within cooldown — trigger fires only after 200ms have elapsed
      // since the last trigger; total elapsed so far is well under that.
      detector.update(lmPinch, flatWorldLandmarks(), 16);
      detector.update(lmPinch, flatWorldLandmarks(), 16);
      detector.update(lmPinch, flatWorldLandmarks(), 16);
      expect(detector.pinchTriggered).toBe(false);
    });

    it('triggers again after cooldown expires', () => {
      const lmPinch = withPalmSpread(withOverrides(flatLandmarks(), {
        4: { x: 0.50, y: 0.50 },
        8: { x: 0.54, y: 0.50 }, // ratio = 0.10
      }));
      const lmRelease = withPalmSpread(withOverrides(flatLandmarks(), {
        4: { x: 0.50, y: 0.50 },
        8: { x: 0.76, y: 0.50 }, // ratio = 0.65
      }));

      // First pinch
      detector.update(lmPinch, flatWorldLandmarks(), 16);
      detector.update(lmPinch, flatWorldLandmarks(), 16);
      detector.update(lmPinch, flatWorldLandmarks(), 16);
      expect(detector.pinchTriggered).toBe(true);

      // Release + wait past cooldown (200ms)
      detector.update(lmRelease, flatWorldLandmarks(), 250);

      // Second pinch after cooldown — needs 3 frames again
      detector.update(lmPinch, flatWorldLandmarks(), 16);
      detector.update(lmPinch, flatWorldLandmarks(), 16);
      detector.update(lmPinch, flatWorldLandmarks(), 16);
      expect(detector.pinchTriggered).toBe(true);
    });

    it('deactivates with hysteresis (only releases above ratio 0.6)', () => {
      // palmWidth = 0.4 throughout.
      const lmPinch = withPalmSpread(withOverrides(flatLandmarks(), {
        4: { x: 0.50, y: 0.50 },
        8: { x: 0.54, y: 0.50 }, // dist = 0.04 → ratio = 0.10, below ON(0.4)
      }));
      const lmMid = withPalmSpread(withOverrides(flatLandmarks(), {
        4: { x: 0.50, y: 0.50 },
        8: { x: 0.70, y: 0.50 }, // dist = 0.20 → ratio = 0.50, in band [0.4, 0.6]
      }));
      const lmFar = withPalmSpread(withOverrides(flatLandmarks(), {
        4: { x: 0.50, y: 0.50 },
        8: { x: 0.76, y: 0.50 }, // dist = 0.26 → ratio = 0.65, above OFF(0.6)
      }));

      // Activate with 3-frame hold
      detector.update(lmPinch, flatWorldLandmarks(), 16);
      detector.update(lmPinch, flatWorldLandmarks(), 16);
      detector.update(lmPinch, flatWorldLandmarks(), 16);
      expect(detector.isPinching).toBe(true);

      // Ratio in hysteresis band — hold counter resets but isPinching stays
      detector.update(lmMid, flatWorldLandmarks(), 16);
      expect(detector.isPinching).toBe(true);

      // Ratio above release threshold — releases
      detector.update(lmFar, flatWorldLandmarks(), 16);
      expect(detector.isPinching).toBe(false);
    });
  });

  // ── Open / closed hand ────────────────────────────────────────────────────

  describe('open/closed hand', () => {
    it('starts open', () => {
      expect(detector.isOpen).toBe(true);
    });

    it('detects closed hand when fingertips are near wrist', () => {
      // All landmarks at same position → avg distance = 0 < HAND_CLOSED_THRESHOLD
      detector.update(flatLandmarks(), flatWorldLandmarks(), 16);
      expect(detector.isOpen).toBe(false);
    });

    it('detects open hand when fingertips are far from wrist', () => {
      // Wrist at (0.5, 0.5), fingertips spread out → avg dist > 0.15
      const lm = withOverrides(flatLandmarks(), {
        0:  { x: 0.5, y: 0.5 },   // wrist
        8:  { x: 0.5, y: 0.15 },  // index tip — dist = 0.35
        12: { x: 0.5, y: 0.15 },
        16: { x: 0.5, y: 0.15 },
        20: { x: 0.5, y: 0.15 },
      });
      detector.update(lm, flatWorldLandmarks(), 16);
      expect(detector.isOpen).toBe(true);
    });

    it('uses hysteresis — stays closed in the middle band', () => {
      // First close the hand
      detector.update(flatLandmarks(), flatWorldLandmarks(), 16);
      expect(detector.isOpen).toBe(false);

      // Distance in band (0.10 < avg < 0.15) — stays closed
      const lmMid = withOverrides(flatLandmarks(), {
        0:  { x: 0.5, y: 0.5 },
        8:  { x: 0.5, y: 0.38 },  // dist ≈ 0.12
        12: { x: 0.5, y: 0.38 },
        16: { x: 0.5, y: 0.38 },
        20: { x: 0.5, y: 0.38 },
      });
      detector.update(lmMid, flatWorldLandmarks(), 16);
      expect(detector.isOpen).toBe(false);
    });
  });

  // ── Fingertip position ────────────────────────────────────────────────────

  describe('indexTip position', () => {
    it('reflects index fingertip landmark coordinates', () => {
      const lm = withOverrides(flatLandmarks(), {
        8: { x: 0.3, y: 0.7 },
      });
      detector.update(lm, flatWorldLandmarks(), 16);
      expect(detector.indexTip.x).toBeCloseTo(0.3);
      expect(detector.indexTip.y).toBeCloseTo(0.7);
    });
  });

  // ── Palm rotation delta ───────────────────────────────────────────────────

  describe('rotationDelta', () => {
    it('is identity quaternion on the first frame', () => {
      // Build minimal world landmarks: wrist at origin, index MCP along X,
      // middle MCP at diagonal, pinky MCP along Y so the palm is well-defined.
      const wl = withWorldOverrides(flatWorldLandmarks(), {
        0:  { x: 0,   y: 0,   z: 0 },  // wrist
        5:  { x: 1,   y: 0,   z: 0 },  // index MCP
        9:  { x: 0.5, y: 0.5, z: 0 },  // middle MCP
        17: { x: 0,   y: 1,   z: 0 },  // pinky MCP
      });
      detector.update(flatLandmarks(), wl, 16);
      const { x, y, z, w } = detector.rotationDelta;
      expect(x).toBeCloseTo(0);
      expect(y).toBeCloseTo(0);
      expect(z).toBeCloseTo(0);
      expect(w).toBeCloseTo(1);
    });

    it('returns a non-identity delta when the palm rotates between frames', () => {
      // Frame 1: palm in standard orientation
      const wl1 = withWorldOverrides(flatWorldLandmarks(), {
        0:  { x: 0,    y: 0,   z: 0 },
        5:  { x: 1,    y: 0,   z: 0 },
        9:  { x: 0.5,  y: 0.5, z: 0 },  // middle MCP
        17: { x: 0,    y: 1,   z: 0 },
      });
      detector.update(flatLandmarks(), wl1, 16);

      // Frame 2: palm rotated 90° around Z (all landmarks rotated by same amount)
      const wl2 = withWorldOverrides(flatWorldLandmarks(), {
        0:  { x: 0,    y: 0,   z: 0 },
        5:  { x: 0,    y: 1,   z: 0 },
        9:  { x: -0.5, y: 0.5, z: 0 },  // middle MCP rotated 90° around Z
        17: { x: -1,   y: 0,   z: 0 },
      });
      detector.update(flatLandmarks(), wl2, 16);

      const { w } = detector.rotationDelta;
      // w ≈ cos(θ/2); for 90° rotation w ≈ 0.707, far from 1
      expect(Math.abs(w)).toBeLessThan(0.95);
    });
  });

  // ── Missing / partial landmarks ───────────────────────────────────────────

  describe('missing landmarks', () => {
    it('handles empty landmark arrays gracefully', () => {
      expect(() => detector.update([], [], 16)).not.toThrow();
      expect(detector.isPinching).toBe(false);
      expect(detector.pinchTriggered).toBe(false);
    });

    it('resets rotation delta when landmarks are missing', () => {
      // Establish a previous quaternion
      const wl = withWorldOverrides(flatWorldLandmarks(), {
        0:  { x: 0,   y: 0,   z: 0 },
        5:  { x: 1,   y: 0,   z: 0 },
        9:  { x: 0.5, y: 0.5, z: 0 },
        17: { x: 0,   y: 1,   z: 0 },
      });
      detector.update(flatLandmarks(), wl, 16);

      // Next frame: no landmarks
      detector.update([], [], 16);
      const { x, y, z, w } = detector.rotationDelta;
      expect(x).toBeCloseTo(0);
      expect(y).toBeCloseTo(0);
      expect(z).toBeCloseTo(0);
      expect(w).toBeCloseTo(1);
    });
  });

  // ── reset() ───────────────────────────────────────────────────────────────

  describe('reset()', () => {
    it('clears all state', () => {
      const lmPinch = withPalmSpread(withOverrides(flatLandmarks(), {
        4: { x: 0.50, y: 0.50 },
        8: { x: 0.54, y: 0.50 }, // ratio = 0.10
      }));
      // Three frames to satisfy hold requirement
      detector.update(lmPinch, flatWorldLandmarks(), 16);
      detector.update(lmPinch, flatWorldLandmarks(), 16);
      detector.update(lmPinch, flatWorldLandmarks(), 16);
      expect(detector.isPinching).toBe(true);

      detector.reset();
      expect(detector.isPinching).toBe(false);
      expect(detector.pinchTriggered).toBe(false);
      expect(detector.isOpen).toBe(true);
    });
  });
});
