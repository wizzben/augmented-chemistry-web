import { describe, it, expect } from 'vitest';
import { serializeMolecule, deserializeMolecule } from '@/chemistry/Serializer';
import { Molecule } from '@/chemistry/Molecule';
import { getElementBySymbol } from '@/chemistry/Element';

describe('Serializer', () => {
  const C = getElementBySymbol('C');
  const H = getElementBySymbol('H');
  const O = getElementBySymbol('O');
  const Cl = getElementBySymbol('Cl');

  describe('serializeMolecule', () => {
    it('serializes Cl2', () => {
      const mol = new Molecule({ name: 'Chlorgas' });
      const cl1 = mol.addAtom(Cl);
      const cl2 = mol.addAtom(Cl, cl1, 0x2); // slot 1
      mol.resetAllLookups();
      const str = serializeMolecule(mol);
      expect(str).toBe('Cl 0,Cl 0;0b1,1b0');
    });

    it('serializes water', () => {
      const mol = new Molecule({ name: 'Water' });
      const o = mol.addAtom(O);
      const h1 = mol.addAtom(H);
      const h2 = mol.addAtom(H);
      // O connects to H1 at slot 0, H2 at slot 3
      o.connection[0] = h2;
      h2.connection[0] = o;
      o.connection[3] = h1;
      h1.connection[3] = o;
      mol.resetAllLookups();
      const str = serializeMolecule(mol);
      expect(str).toBe('O 0,H 0,H 0;0a2,0d1,1d0,2a0');
    });
  });

  describe('deserializeMolecule', () => {
    it('deserializes Cl2', () => {
      const mol = deserializeMolecule('Chlorgas', 'Cl 0,Cl 0;0b1,1b0');
      expect(mol.atoms).toHaveLength(2);
      expect(mol.atoms[0].element).toBe(Cl);
      expect(mol.atoms[1].element).toBe(Cl);
      expect(mol.atoms[0].connection[1]).toBe(mol.atoms[1]);
      expect(mol.atoms[1].connection[1]).toBe(mol.atoms[0]);
      expect(mol.done).toBe(true);
    });

    it('deserializes water', () => {
      const mol = deserializeMolecule('Wasser', 'O 0,H 0,H 0;0a2,0d1,1d0,2a0');
      expect(mol.atoms).toHaveLength(3);
      expect(mol.atoms[0].element).toBe(O);
      expect(mol.atoms[1].element).toBe(H);
      expect(mol.atoms[2].element).toBe(H);
      expect(mol.done).toBe(true);
      expect(mol.histogram[O.index]).toBe(1);
      expect(mol.histogram[H.index]).toBe(2);
    });

    it('deserializes methane', () => {
      const mol = deserializeMolecule('Methan', 'C 0,H 0,H 0,H 0,H 0;0a4,0b2,0c1,0d3,1c0,2b0,3d0,4a0');
      expect(mol.atoms).toHaveLength(5);
      expect(mol.atoms[0].element).toBe(C);
      expect(mol.done).toBe(true);
      expect(mol.histogram[C.index]).toBe(1);
      expect(mol.histogram[H.index]).toBe(4);
    });

    it('preserves language field', () => {
      // Benzene-style atom with language=1
      const mol = deserializeMolecule('test', 'C 1,C 1;0a1,1a0');
      expect(mol.atoms[0].language).toBe(1);
      expect(mol.atoms[1].language).toBe(1);
    });

    it('handles metadata', () => {
      const mol = deserializeMolecule('Wasser', 'O 0,H 0,H 0;0a2,0d1,1d0,2a0', {
        formula: 'H2O',
        category: 'umwelt',
      });
      expect(mol.formula).toBe('H2O');
      expect(mol.category).toBe('umwelt');
    });
  });

  describe('round-trip', () => {
    it('round-trips Cl2', () => {
      const original = 'Cl 0,Cl 0;0b1,1b0';
      const mol = deserializeMolecule('Chlorgas', original);
      expect(serializeMolecule(mol)).toBe(original);
    });

    it('round-trips water', () => {
      const original = 'O 0,H 0,H 0;0a2,0d1,1d0,2a0';
      const mol = deserializeMolecule('Wasser', original);
      expect(serializeMolecule(mol)).toBe(original);
    });

    it('round-trips methane', () => {
      const original = 'C 0,H 0,H 0,H 0,H 0;0a4,0b2,0c1,0d3,1c0,2b0,3d0,4a0';
      const mol = deserializeMolecule('Methan', original);
      expect(serializeMolecule(mol)).toBe(original);
    });

    it('round-trips ethanol', () => {
      const original = 'C 0,H 0,H 0,C 0,O 0,H 0,H 0,H 0,H 0;0a3,0b2,0c1,0d4,1c0,2b0,3a0,3b6,3c5,3d7,4a8,4d0,5c3,6b3,7d3,8a4';
      const mol = deserializeMolecule('Ethanol', original);
      expect(serializeMolecule(mol)).toBe(original);
    });

    it('round-trips HCN (triple bond)', () => {
      const original = 'C 0,H 0,N 0;0a2,0b2,0c1,0d2,1c0,2a0,2b0,2d0';
      const mol = deserializeMolecule('Blausaeure', original);
      expect(serializeMolecule(mol)).toBe(original);
    });
  });
});
