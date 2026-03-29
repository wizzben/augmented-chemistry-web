import { describe, it, expect } from 'vitest';
import {
  getConnectionBitField,
  getConnectionBitFieldOfLink,
  getNumberOfConnectionsByBitField,
  getPoolOfPossibleConnections,
} from '@/chemistry/Bitfield';

describe('Bitfield', () => {
  describe('getConnectionBitField', () => {
    it('returns 0 for empty connections', () => {
      expect(getConnectionBitField([null, null, null, null])).toBe(0);
    });

    it('returns correct bitfield for single connection', () => {
      const obj = {};
      expect(getConnectionBitField([obj, null, null, null])).toBe(1);
      expect(getConnectionBitField([null, obj, null, null])).toBe(2);
      expect(getConnectionBitField([null, null, obj, null])).toBe(4);
      expect(getConnectionBitField([null, null, null, obj])).toBe(8);
    });

    it('returns correct bitfield for multiple connections', () => {
      const a = {}, b = {};
      expect(getConnectionBitField([a, b, null, null])).toBe(3);
      expect(getConnectionBitField([a, null, b, null])).toBe(5);
      expect(getConnectionBitField([a, b, a, b])).toBe(15);
    });
  });

  describe('getConnectionBitFieldOfLink', () => {
    it('returns 0 when target not found', () => {
      const a = {}, b = {};
      expect(getConnectionBitFieldOfLink([a, a, null, null], b)).toBe(0);
    });

    it('returns bitfield for single bond to target', () => {
      const a = {}, b = {};
      expect(getConnectionBitFieldOfLink([b, null, null, null], b)).toBe(1);
      expect(getConnectionBitFieldOfLink([a, b, null, null], b)).toBe(2);
    });

    it('returns bitfield for double bond to target', () => {
      const a = {}, b = {};
      expect(getConnectionBitFieldOfLink([b, b, null, null], b)).toBe(3);
    });
  });

  describe('getNumberOfConnectionsByBitField', () => {
    it('matches popcount for all 16 values', () => {
      const expected = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];
      for (let i = 0; i < 16; i++) {
        expect(getNumberOfConnectionsByBitField(i)).toBe(expected[i]);
      }
    });
  });

  describe('getPoolOfPossibleConnections', () => {
    it('empty atom with valence 4 allows all single-slot combos', () => {
      const pool = getPoolOfPossibleConnections(0, 4);
      expect(pool).toHaveLength(14);
      // All combos with count <= 4 are allowed
      expect(pool[0]).toBe(true);  // bf 1 (1 slot)
      expect(pool[1]).toBe(true);  // bf 2 (1 slot)
      expect(pool[2]).toBe(true);  // bf 3 (2 slots)
      expect(pool[13]).toBe(true); // bf 14 (3 slots) -- 3 <= 4
    });

    it('empty atom with valence 1 allows only single-slot combos', () => {
      const pool = getPoolOfPossibleConnections(0, 1);
      // Only bitfields with exactly 1 bit set: 1,2,4,8 (indices 0,1,3,7)
      expect(pool[0]).toBe(true);  // bf 1
      expect(pool[1]).toBe(true);  // bf 2
      expect(pool[2]).toBe(false); // bf 3 (2 bits)
      expect(pool[3]).toBe(true);  // bf 4
      expect(pool[7]).toBe(true);  // bf 8
    });

    it('atom with slot 0 occupied rejects overlapping combos', () => {
      const pool = getPoolOfPossibleConnections(1, 4); // slot 0 used
      expect(pool[0]).toBe(false); // bf 1 overlaps with slot 0
      expect(pool[1]).toBe(true);  // bf 2 (slot 1 only)
      expect(pool[2]).toBe(false); // bf 3 (slots 0+1, overlaps)
    });

    it('fully occupied atom allows nothing', () => {
      const pool = getPoolOfPossibleConnections(15, 4);
      expect(pool.every((v) => v === false)).toBe(true);
    });
  });
});
