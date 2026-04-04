import { describe, it, expect } from 'vitest';
import { FuzzyBoolean } from '@/objects/FuzzyBoolean';

describe('FuzzyBoolean', () => {
  describe('unidirectional (default)', () => {
    it('starts at false', () => {
      expect(new FuzzyBoolean().value).toBe(false);
    });

    it('9 visible updates → still false; 10th → true', () => {
      const fb = new FuzzyBoolean();
      for (let i = 0; i < 9; i++) fb.update(true);
      expect(fb.value).toBe(false);
      fb.update(true);
      expect(fb.value).toBe(true);
    });

    it('a single not-visible resets to false immediately', () => {
      const fb = new FuzzyBoolean();
      for (let i = 0; i < 10; i++) fb.update(true);
      expect(fb.value).toBe(true);
      fb.update(false);
      expect(fb.value).toBe(false);
    });

    it('counter does not exceed threshold (extra updates stay true)', () => {
      const fb = new FuzzyBoolean();
      for (let i = 0; i < 20; i++) fb.update(true);
      expect(fb.value).toBe(true);
      fb.update(false);
      expect(fb.value).toBe(false);
    });
  });

  describe('bidirectional', () => {
    it('starts at false', () => {
      expect(new FuzzyBoolean(true).value).toBe(false);
    });

    it('reaches true after 10 visible updates', () => {
      const fb = new FuzzyBoolean(true);
      for (let i = 0; i < 10; i++) fb.update(true);
      expect(fb.value).toBe(true);
    });

    it('decrements gradually — takes 10 frames to go false→true→false', () => {
      const fb = new FuzzyBoolean(true);
      for (let i = 0; i < 10; i++) fb.update(true);
      expect(fb.value).toBe(true);

      // 9 not-visible updates should still be true (counter drops to 1)
      for (let i = 0; i < 9; i++) {
        fb.update(false);
        expect(fb.value).toBe(true);
      }
      // 10th not-visible → counter hits 0 → false
      fb.update(false);
      expect(fb.value).toBe(false);
    });

    it('single not-visible does not immediately reset', () => {
      const fb = new FuzzyBoolean(true);
      for (let i = 0; i < 10; i++) fb.update(true);
      fb.update(false);
      expect(fb.value).toBe(true);
    });
  });

  describe('reset()', () => {
    it('sets counter to 0, making value false', () => {
      const fb = new FuzzyBoolean();
      for (let i = 0; i < 10; i++) fb.update(true);
      expect(fb.value).toBe(true);
      fb.reset();
      expect(fb.value).toBe(false);
    });

    it('next visible update after reset starts from 0', () => {
      const fb = new FuzzyBoolean();
      for (let i = 0; i < 10; i++) fb.update(true);
      fb.reset();
      fb.update(true);
      expect(fb.value).toBe(false); // only 1 frame, needs 10
    });
  });
});
