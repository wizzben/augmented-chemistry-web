import { describe, it, expect, vi } from 'vitest';
import { MarkerState } from '@/ar/MarkerState';
import { PushButton } from '@/objects/PushButton';

const MARKER = 'browser';

function makeState(visible: boolean): MarkerState {
  const state = new MarkerState();
  state.init([MARKER]);
  if (visible) {
    state.updateMarker(MARKER, 1.0, new Float64Array(16).fill(0).map((_, i) => (i % 5 === 0 ? 1 : 0)), 0);
  }
  return state;
}

/** Advance a PushButton N frames with the given visibility. */
function advanceFrames(btn: PushButton, n: number, visible: boolean, platformVisible = true) {
  const state = makeState(visible);
  for (let i = 0; i < n; i++) btn.refreshState(state, platformVisible);
}

describe('PushButton', () => {
  it('starts at value=false', () => {
    const btn = new PushButton(MARKER, false);
    expect(btn.value).toBe(false);
  });

  describe('bidirectional fuzzy debounce', () => {
    it('turns on after 10 visible frames', () => {
      const btn = new PushButton(MARKER, false);
      advanceFrames(btn, 9, true);
      expect(btn.value).toBe(false);
      advanceFrames(btn, 1, true);
      expect(btn.value).toBe(true);
    });

    it('turns off gradually — takes 10 hidden frames', () => {
      const btn = new PushButton(MARKER, false);
      advanceFrames(btn, 10, true);
      expect(btn.value).toBe(true);

      // 9 hidden frames: still true
      advanceFrames(btn, 9, false);
      expect(btn.value).toBe(true);

      // 10th hidden frame: turns false
      advanceFrames(btn, 1, false);
      expect(btn.value).toBe(false);
    });

    it('single hidden frame does not immediately turn off', () => {
      const btn = new PushButton(MARKER, false);
      advanceFrames(btn, 10, true);
      advanceFrames(btn, 1, false);
      expect(btn.value).toBe(true);
    });
  });

  describe('edge detection / onToggle callback', () => {
    it('fires callback once on rising edge', () => {
      const cb = vi.fn();
      const btn = new PushButton(MARKER, false, cb);
      advanceFrames(btn, 10, true);
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith(true);
    });

    it('fires callback once on falling edge', () => {
      const cb = vi.fn();
      const btn = new PushButton(MARKER, false, cb);
      advanceFrames(btn, 10, true);
      cb.mockClear();
      advanceFrames(btn, 10, false);
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith(false);
    });

    it('does not fire when value is unchanged mid-debounce', () => {
      const cb = vi.fn();
      const btn = new PushButton(MARKER, false, cb);
      // 9 frames — value stays false, no callback
      advanceFrames(btn, 9, true);
      expect(cb).not.toHaveBeenCalled();
    });

    it('fires exactly once even if many extra frames pass while true', () => {
      const cb = vi.fn();
      const btn = new PushButton(MARKER, false, cb);
      advanceFrames(btn, 30, true);
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  describe('platformAddict', () => {
    it('platformAddict=false: platform visibility does not matter', () => {
      const btn = new PushButton(MARKER, false);
      advanceFrames(btn, 10, true, false /* platformVisible=false */);
      expect(btn.value).toBe(true);
    });

    it('platformAddict=true: value forced false when platform not visible', () => {
      const btn = new PushButton(MARKER, true);
      advanceFrames(btn, 10, true, false /* platformVisible=false */);
      expect(btn.value).toBe(false);
    });

    it('platformAddict=true: value is true when platform is visible', () => {
      const btn = new PushButton(MARKER, true);
      advanceFrames(btn, 10, true, true /* platformVisible=true */);
      expect(btn.value).toBe(true);
    });

    it('platformAddict=true: callback not fired when platform absent suppresses value', () => {
      const cb = vi.fn();
      const btn = new PushButton(MARKER, true, cb);
      // Marker visible, platform not — value stays false → no edge
      advanceFrames(btn, 10, true, false);
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('reset()', () => {
    it('clears value and confirmed, suppresses spurious callback on next frame', () => {
      const cb = vi.fn();
      const btn = new PushButton(MARKER, false, cb);
      advanceFrames(btn, 10, true);
      cb.mockClear();

      btn.reset();
      expect(btn.value).toBe(false);

      // After reset, first hidden frame should not fire (confirmed also reset to false)
      advanceFrames(btn, 1, false);
      expect(cb).not.toHaveBeenCalled();
    });
  });
});
