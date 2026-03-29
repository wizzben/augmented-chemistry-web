import { describe, it, expect } from 'vitest';
import { moleculeDFSTraversal, moleculeDetectCircularPaths } from '@/chemistry/Traversal';
import { deserializeMolecule } from '@/chemistry/Serializer';
import { Atom } from '@/chemistry/Atom';

describe('Traversal', () => {
  describe('moleculeDFSTraversal', () => {
    it('visits all atoms in Cl2', () => {
      const mol = deserializeMolecule('Chlorgas', 'Cl 0,Cl 0;0b1,1b0');
      const visited: Array<{ origin: Atom | null; target: Atom }> = [];
      moleculeDFSTraversal(mol, null, (origin, target) => {
        visited.push({ origin, target });
      });
      expect(visited).toHaveLength(2);
      expect(visited[0].origin).toBe(null);
      expect(visited[0].target).toBe(mol.atoms[0]);
      expect(visited[1].origin).toBe(mol.atoms[0]);
      expect(visited[1].target).toBe(mol.atoms[1]);
    });

    it('visits all atoms in methane', () => {
      const mol = deserializeMolecule('Methan', 'C 0,H 0,H 0,H 0,H 0;0a4,0b2,0c1,0d3,1c0,2b0,3d0,4a0');
      const targets: Atom[] = [];
      moleculeDFSTraversal(mol, null, (_origin, target) => {
        targets.push(target);
      });
      expect(targets).toHaveLength(5); // C + 4 H
      expect(targets[0].element.symbol).toBe('C');
    });

    it('visits all atoms in ethanol (branched)', () => {
      const mol = deserializeMolecule('Ethanol',
        'C 0,H 0,H 0,C 0,O 0,H 0,H 0,H 0,H 0;0a3,0b2,0c1,0d4,1c0,2b0,3a0,3b6,3c5,3d7,4a8,4d0,5c3,6b3,7d3,8a4');
      const targets: Atom[] = [];
      moleculeDFSTraversal(mol, null, (_origin, target) => {
        targets.push(target);
      });
      expect(targets).toHaveLength(9); // all atoms visited exactly once
    });

    it('provides correct connection bitfield', () => {
      const mol = deserializeMolecule('Chlorgas', 'Cl 0,Cl 0;0b1,1b0');
      const bitfields: number[] = [];
      moleculeDFSTraversal(mol, null, (_origin, _target, bf) => {
        bitfields.push(bf);
      });
      expect(bitfields[0]).toBe(0); // first call has no origin
      expect(bitfields[1]).toBe(2); // slot 1 (0x2)
    });
  });

  describe('moleculeDetectCircularPaths', () => {
    it('sets no flags on acyclic molecule', () => {
      const mol = deserializeMolecule('Methan', 'C 0,H 0,H 0,H 0,H 0;0a4,0b2,0c1,0d3,1c0,2b0,3d0,4a0');
      mol.resetAllLookups();
      moleculeDetectCircularPaths(mol);
      for (const atom of mol.atoms) {
        expect(atom.connectionFlags).toBe(0);
      }
    });

    it('detects ring in benzene-like structure', () => {
      // Simple 3-atom ring: A-B-C-A
      // Use Mg (valence 2) for a simple ring
      const mol = deserializeMolecule('ring',
        'Mg 0,Mg 0,Mg 0;0a1,0b2,1a0,1b2,2a1,2b0');
      mol.resetAllLookups();
      moleculeDetectCircularPaths(mol);
      // All atoms should have non-zero connectionFlags
      for (const atom of mol.atoms) {
        expect(atom.connectionFlags).not.toBe(0);
      }
    });
  });
});
