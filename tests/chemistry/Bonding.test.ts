import { describe, it, expect } from 'vitest';
import { Atom } from '@/chemistry/Atom';
import { atomLink, atomUnlink, atomTryLinkWithElement, LinkResult } from '@/chemistry/Bonding';
import { getElementBySymbol } from '@/chemistry/Element';

describe('Bonding', () => {
  const C = getElementBySymbol('C');
  const H = getElementBySymbol('H');
  const O = getElementBySymbol('O');

  describe('atomLink', () => {
    it('creates a single bond (slot 0)', () => {
      const a = new Atom(C, 0);
      const b = new Atom(H, 1);
      const result = atomLink(a, b, 0x1); // slot 0
      expect(result).toBe(LinkResult.OK);
      expect(a.connection[0]).toBe(b);
      expect(b.connection[0]).toBe(a);
      // Other slots unchanged
      expect(a.connection[1]).toBe(null);
      expect(b.connection[1]).toBe(null);
    });

    it('creates a double bond (slots 0+1)', () => {
      const a = new Atom(O, 0);
      const b = new Atom(O, 1);
      const result = atomLink(a, b, 0x3); // slots 0 + 1
      expect(result).toBe(LinkResult.OK);
      expect(a.connection[0]).toBe(b);
      expect(a.connection[1]).toBe(b);
      expect(b.connection[0]).toBe(a);
      expect(b.connection[1]).toBe(a);
    });

    it('uses symmetric slot indices', () => {
      const a = new Atom(C, 0);
      const b = new Atom(H, 1);
      atomLink(a, b, 0x4); // slot 2
      expect(a.connection[2]).toBe(b);
      expect(b.connection[2]).toBe(a);
    });

    it('rejects overlapping slots on atom A', () => {
      const a = new Atom(C, 0);
      const b = new Atom(H, 1);
      const c = new Atom(H, 2);
      atomLink(a, b, 0x1);
      const result = atomLink(a, c, 0x1); // slot 0 already taken
      expect(result).toBe(LinkResult.ATOM_A_INVALID_COMBO);
    });

    it('rejects overlapping slots on atom B', () => {
      const a = new Atom(C, 0);
      const b = new Atom(H, 1);
      const c = new Atom(C, 2);
      atomLink(b, a, 0x1);
      // b's slot 0 is now taken
      const result = atomLink(c, b, 0x1);
      expect(result).toBe(LinkResult.ATOM_B_INVALID_COMBO);
    });

    it('rejects when atom A exceeds valence', () => {
      const h1 = new Atom(H, 0);
      const h2 = new Atom(H, 1);
      atomLink(h1, h2, 0x1); // H is now full (valence 1)
      const h3 = new Atom(H, 2);
      const result = atomLink(h1, h3, 0x2);
      expect(result).toBe(LinkResult.ATOM_A_EXCEEDS_VALENCE);
    });

    it('rejects when atom B exceeds valence', () => {
      const h1 = new Atom(H, 0);
      const h2 = new Atom(H, 1);
      atomLink(h1, h2, 0x1);
      const c = new Atom(C, 2);
      const result = atomLink(c, h1, 0x2);
      expect(result).toBe(LinkResult.ATOM_B_EXCEEDS_VALENCE);
    });
  });

  describe('atomUnlink', () => {
    it('removes all connections between two atoms', () => {
      const a = new Atom(O, 0);
      const b = new Atom(O, 1);
      atomLink(a, b, 0x3); // double bond
      atomUnlink(a, b);
      expect(a.connection[0]).toBe(null);
      expect(a.connection[1]).toBe(null);
      expect(b.connection[0]).toBe(null);
      expect(b.connection[1]).toBe(null);
    });

    it('does not affect other connections', () => {
      const a = new Atom(C, 0);
      const b = new Atom(H, 1);
      const c = new Atom(H, 2);
      atomLink(a, b, 0x1);
      atomLink(a, c, 0x2);
      atomUnlink(a, b);
      expect(a.connection[0]).toBe(null);
      expect(a.connection[1]).toBe(c);
    });
  });

  describe('atomTryLinkWithElement', () => {
    it('returns 1 for valid link', () => {
      const a = new Atom(C, 0);
      expect(atomTryLinkWithElement(a, H, 0x1)).toBe(1);
    });

    it('returns -1 for slot conflict', () => {
      const a = new Atom(C, 0);
      const b = new Atom(H, 1);
      atomLink(a, b, 0x1);
      expect(atomTryLinkWithElement(a, H, 0x1)).toBe(-1);
    });

    it('returns -2 when atom exceeds valence', () => {
      const h = new Atom(H, 0);
      const other = new Atom(H, 1);
      atomLink(h, other, 0x1); // H is full
      expect(atomTryLinkWithElement(h, C, 0x2)).toBe(-2);
    });

    it('returns -3 when element cannot take that many connections', () => {
      const a = new Atom(C, 0);
      // Try double bond with H (valence 1)
      expect(atomTryLinkWithElement(a, H, 0x3)).toBe(-3);
    });
  });
});
