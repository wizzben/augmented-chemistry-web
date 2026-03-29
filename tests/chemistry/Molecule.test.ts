import { describe, it, expect } from 'vitest';
import { Molecule } from '@/chemistry/Molecule';
import { getElementBySymbol } from '@/chemistry/Element';

describe('Molecule', () => {
  const C = getElementBySymbol('C');
  const H = getElementBySymbol('H');
  const O = getElementBySymbol('O');

  it('initializes with correct defaults', () => {
    const mol = new Molecule({ name: 'test' });
    expect(mol.name).toBe('test');
    expect(mol.atoms).toHaveLength(0);
    expect(mol.histogram).toHaveLength(16);
    expect(mol.histogram.every((v) => v === 0)).toBe(true);
    expect(mol.done).toBe(false);
    expect(mol.count).toBe(0);
  });

  describe('addAtom', () => {
    it('adds an atom and assigns index', () => {
      const mol = new Molecule({ name: 'test' });
      const a = mol.addAtom(C);
      expect(a.element).toBe(C);
      expect(a.index).toBe(0);
      expect(mol.atoms).toHaveLength(1);

      const b = mol.addAtom(H);
      expect(b.index).toBe(1);
      expect(mol.atoms).toHaveLength(2);
    });

    it('bonds to linkAtom when provided', () => {
      const mol = new Molecule({ name: 'test' });
      const c = mol.addAtom(C);
      const h = mol.addAtom(H, c, 0x1);
      expect(c.connection[0]).toBe(h);
      expect(h.connection[0]).toBe(c);
    });

    it('throws on invalid link', () => {
      const mol = new Molecule({ name: 'test' });
      const h1 = mol.addAtom(H);
      const h2 = mol.addAtom(H, h1, 0x1);
      // h1 is now full (valence 1), trying to link another
      expect(() => mol.addAtom(H, h1, 0x2)).toThrow();
      // Failed atom should not be in the array
      expect(mol.atoms).toHaveLength(2);
    });
  });

  describe('removeAtom', () => {
    it('removes atom and clears connections (same-index rule)', () => {
      const mol = new Molecule({ name: 'test' });
      const c = mol.addAtom(C);
      const h = mol.addAtom(H, c, 0x1);
      mol.removeAtom(h);
      expect(mol.atoms).toHaveLength(1);
      expect(c.connection[0]).toBe(null); // same index 0 cleared
    });

    it('reindexes remaining atoms', () => {
      const mol = new Molecule({ name: 'test' });
      mol.addAtom(C);
      const b = mol.addAtom(H);
      const c = mol.addAtom(H);
      mol.removeAtom(b);
      expect(mol.atoms).toHaveLength(2);
      expect(mol.atoms[0].index).toBe(0);
      expect(mol.atoms[1].index).toBe(1);
      expect(mol.atoms[1]).toBe(c);
    });
  });

  describe('getAtom', () => {
    it('returns atom by index', () => {
      const mol = new Molecule({ name: 'test' });
      const a = mol.addAtom(C);
      const b = mol.addAtom(H);
      expect(mol.getAtom(0)).toBe(a);
      expect(mol.getAtom(1)).toBe(b);
      expect(mol.getAtom(5)).toBe(null);
    });
  });

  describe('getAtomOfElement', () => {
    it('finds first atom of element', () => {
      const mol = new Molecule({ name: 'test' });
      mol.addAtom(C);
      const h = mol.addAtom(H);
      mol.addAtom(H);
      expect(mol.getAtomOfElement(H)).toBe(h);
    });

    it('finds from startAt', () => {
      const mol = new Molecule({ name: 'test' });
      mol.addAtom(H);
      const h2 = mol.addAtom(H);
      expect(mol.getAtomOfElement(H, 1)).toBe(h2);
    });

    it('returns null when not found', () => {
      const mol = new Molecule({ name: 'test' });
      mol.addAtom(C);
      expect(mol.getAtomOfElement(O)).toBe(null);
    });
  });

  describe('getHungryAtom', () => {
    it('finds unsaturated atom', () => {
      const mol = new Molecule({ name: 'test' });
      const c = mol.addAtom(C); // valence 4, 0 connections
      expect(mol.getHungryAtom()).toBe(c);
    });

    it('skips saturated atoms', () => {
      const mol = new Molecule({ name: 'test' });
      const h1 = mol.addAtom(H);
      const h2 = mol.addAtom(H, h1, 0x1);
      const c = mol.addAtom(C);
      // h1 and h2 are saturated (valence 1, 1 connection each)
      expect(mol.getHungryAtom()).toBe(c);
    });

    it('returns null when all saturated', () => {
      const mol = new Molecule({ name: 'test' });
      const h1 = mol.addAtom(H);
      mol.addAtom(H, h1, 0x1);
      expect(mol.getHungryAtom()).toBe(null);
    });
  });

  describe('resetAllLookups', () => {
    it('updates bitField and done for all atoms', () => {
      const mol = new Molecule({ name: 'test' });
      const h1 = mol.addAtom(H);
      const h2 = mol.addAtom(H, h1, 0x1);
      // bitFields are stale (0), done is false
      expect(h1.bitField).toBe(0);
      mol.resetAllLookups();
      expect(h1.bitField).toBe(1);
      expect(h1.done).toBe(true);
      expect(h2.bitField).toBe(1);
      expect(h2.done).toBe(true);
      expect(mol.done).toBe(true);
    });

    it('sets molecule.done false if any atom unsaturated', () => {
      const mol = new Molecule({ name: 'test' });
      mol.addAtom(C);
      mol.resetAllLookups();
      expect(mol.done).toBe(false);
    });
  });

  describe('computeHistogram', () => {
    it('counts atoms by element index', () => {
      const mol = new Molecule({ name: 'methane' });
      mol.addAtom(C);
      mol.addAtom(H);
      mol.addAtom(H);
      mol.addAtom(H);
      mol.addAtom(H);
      mol.computeHistogram();
      expect(mol.histogram[C.index]).toBe(1); // C index = 0
      expect(mol.histogram[H.index]).toBe(4); // H index = 5
      expect(mol.count).toBe(5);
    });
  });

  describe('resetAtomIndices', () => {
    it('renumbers atoms sequentially', () => {
      const mol = new Molecule({ name: 'test' });
      const a = mol.addAtom(C);
      const b = mol.addAtom(H);
      a.index = 99;
      b.index = 42;
      mol.resetAtomIndices();
      expect(a.index).toBe(0);
      expect(b.index).toBe(1);
      expect(mol.count).toBe(2);
    });
  });

  describe('freeAllAtoms', () => {
    it('clears all atoms', () => {
      const mol = new Molecule({ name: 'test' });
      mol.addAtom(C);
      mol.addAtom(H);
      mol.freeAllAtoms();
      expect(mol.atoms).toHaveLength(0);
      expect(mol.count).toBe(0);
      expect(mol.done).toBe(false);
    });
  });
});
