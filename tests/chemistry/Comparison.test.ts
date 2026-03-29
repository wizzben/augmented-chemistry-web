import { describe, it, expect } from 'vitest';
import { moleculeGetTreeString, moleculeCompareHistogram, moleculeCompareStructure } from '@/chemistry/Comparison';
import { deserializeMolecule } from '@/chemistry/Serializer';

describe('Comparison', () => {
  describe('moleculeGetTreeString', () => {
    it('generates string for Cl2', () => {
      const mol = deserializeMolecule('Chlorgas', 'Cl 0,Cl 0;0b1,1b0');
      const str = moleculeGetTreeString(mol);
      expect(str).toBeTruthy();
      expect(str.length).toBeGreaterThan(0);
    });

    it('generates consistent string for same molecule', () => {
      const mol = deserializeMolecule('Methan', 'C 0,H 0,H 0,H 0,H 0;0a4,0b2,0c1,0d3,1c0,2b0,3d0,4a0');
      const str1 = moleculeGetTreeString(mol);
      const str2 = moleculeGetTreeString(mol);
      expect(str1).toBe(str2);
    });

    it('different start atoms on preset give same string for methane', () => {
      // In methane, starting from C gives one string, starting from H gives another
      const mol = deserializeMolecule('Methan', 'C 0,H 0,H 0,H 0,H 0;0a4,0b2,0c1,0d3,1c0,2b0,3d0,4a0');
      // Starting from any H should give the same string (all H equivalent)
      const strH1 = moleculeGetTreeString(mol, mol.atoms[1]);
      const strH2 = moleculeGetTreeString(mol, mol.atoms[2]);
      expect(strH1).toBe(strH2);
    });
  });

  describe('moleculeCompareHistogram', () => {
    it('returns true for identical histograms', () => {
      const a = deserializeMolecule('a', 'C 0,H 0,H 0,H 0,H 0;0a4,0b2,0c1,0d3,1c0,2b0,3d0,4a0');
      const b = deserializeMolecule('b', 'C 0,H 0,H 0,H 0,H 0;0a4,0b2,0c1,0d3,1c0,2b0,3d0,4a0');
      expect(moleculeCompareHistogram(a, b)).toBe(true);
    });

    it('returns false for different histograms', () => {
      const a = deserializeMolecule('a', 'C 0,H 0,H 0,H 0,H 0;0a4,0b2,0c1,0d3,1c0,2b0,3d0,4a0');
      const b = deserializeMolecule('b', 'O 0,H 0,H 0;0a2,0d1,1d0,2a0');
      expect(moleculeCompareHistogram(a, b)).toBe(false);
    });
  });

  describe('moleculeCompareStructure', () => {
    it('finds matching molecule in library', () => {
      const methane = deserializeMolecule('Methan', 'C 0,H 0,H 0,H 0,H 0;0a4,0b2,0c1,0d3,1c0,2b0,3d0,4a0');
      const water = deserializeMolecule('Wasser', 'O 0,H 0,H 0;0a2,0d1,1d0,2a0');
      const library = [methane, water];

      // Build a test methane with different connection slots
      const test = deserializeMolecule('test', 'C 0,H 0,H 0,H 0,H 0;0a1,0b2,0c3,0d4,1a0,2b0,3c0,4d0');
      const match = moleculeCompareStructure(test, library);
      expect(match).toBe(methane);
    });

    it('returns null for unsaturated molecule', () => {
      const library = [
        deserializeMolecule('Methan', 'C 0,H 0,H 0,H 0,H 0;0a4,0b2,0c1,0d3,1c0,2b0,3d0,4a0'),
      ];
      // Incomplete methane (only 3 H)
      const mol = deserializeMolecule('partial', 'C 0,H 0,H 0,H 0;0a1,0b2,0c3,1a0,2b0,3c0');
      const match = moleculeCompareStructure(mol, library);
      expect(match).toBe(null);
    });

    it('returns null when no match exists', () => {
      const water = deserializeMolecule('Wasser', 'O 0,H 0,H 0;0a2,0d1,1d0,2a0');
      const library = [water];
      const methane = deserializeMolecule('Methan', 'C 0,H 0,H 0,H 0,H 0;0a4,0b2,0c1,0d3,1c0,2b0,3d0,4a0');
      expect(moleculeCompareStructure(methane, library)).toBe(null);
    });

    it('self-recognizes water', () => {
      const water = deserializeMolecule('Wasser', 'O 0,H 0,H 0;0a2,0d1,1d0,2a0');
      expect(moleculeCompareStructure(water, [water])).toBe(water);
    });

    it('self-recognizes Cl2', () => {
      const cl2 = deserializeMolecule('Chlorgas', 'Cl 0,Cl 0;0b1,1b0');
      expect(moleculeCompareStructure(cl2, [cl2])).toBe(cl2);
    });

    it('self-recognizes ethanol', () => {
      const ethanol = deserializeMolecule('Ethanol',
        'C 0,H 0,H 0,C 0,O 0,H 0,H 0,H 0,H 0;0a3,0b2,0c1,0d4,1c0,2b0,3a0,3b6,3c5,3d7,4a8,4d0,5c3,6b3,7d3,8a4');
      expect(moleculeCompareStructure(ethanol, [ethanol])).toBe(ethanol);
    });
  });
});
