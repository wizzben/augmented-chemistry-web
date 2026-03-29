import { describe, it, expect } from 'vitest';
import moleculesData from '@/data/molecules.json';
import { deserializeMolecule, serializeMolecule } from '@/chemistry/Serializer';
import { moleculeGetTreeString, moleculeCompareHistogram, moleculeCompareStructure } from '@/chemistry/Comparison';
import { Molecule } from '@/chemistry/Molecule';

interface MoleculeEntry {
  names: Record<string, string>;
  format: string;
  formula: string;
  category: string;
  sounds: Record<string, string>;
  infotext: Record<string, string>;
  sourceFile: string;
}

const entries = moleculesData as MoleculeEntry[];

describe('Integration: all molecules', () => {
  // Deserialize all molecules once
  const molecules: Molecule[] = entries.map((entry) =>
    deserializeMolecule(entry.names.en || entry.names.de || entry.sourceFile, entry.format, {
      formula: entry.formula,
      category: entry.category,
      names: entry.names,
    }),
  );

  it(`loaded ${entries.length} molecules`, () => {
    expect(entries.length).toBe(80);
    expect(molecules).toHaveLength(80);
  });

  describe('deserialization', () => {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const name = entry.names.en || entry.names.de || entry.sourceFile;

      it(`${name}: all atoms saturated`, () => {
        const mol = molecules[i];
        expect(mol.done).toBe(true);
      });

      it(`${name}: atom count matches histogram sum`, () => {
        const mol = molecules[i];
        const histogramSum = mol.histogram.reduce((a, b) => a + b, 0);
        expect(mol.count).toBe(histogramSum);
        expect(mol.atoms.length).toBe(mol.count);
      });
    }
  });

  describe('round-trip serialization', () => {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const name = entry.names.en || entry.names.de || entry.sourceFile;

      it(`${name}: serialize -> deserialize preserves format`, () => {
        const mol = molecules[i];
        const serialized = serializeMolecule(mol);
        expect(serialized).toBe(entry.format);
      });

      it(`${name}: round-trip preserves histogram`, () => {
        const mol = molecules[i];
        const serialized = serializeMolecule(mol);
        const restored = deserializeMolecule('test', serialized);
        expect(moleculeCompareHistogram(mol, restored)).toBe(true);
      });

      it(`${name}: round-trip preserves tree string`, () => {
        const mol = molecules[i];
        const serialized = serializeMolecule(mol);
        const restored = deserializeMolecule('test', serialized);
        const str1 = moleculeGetTreeString(mol);
        const str2 = moleculeGetTreeString(restored);
        expect(str1).toBe(str2);
      });
    }
  });

  describe('self-recognition', () => {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const name = entry.names.en || entry.names.de || entry.sourceFile;

      it(`${name}: recognizes itself in the library`, () => {
        const mol = molecules[i];
        const match = moleculeCompareStructure(mol, molecules);
        expect(match).not.toBe(null);
        // The match should have the same histogram
        expect(moleculeCompareHistogram(mol, match!)).toBe(true);
      });
    }
  });
});
