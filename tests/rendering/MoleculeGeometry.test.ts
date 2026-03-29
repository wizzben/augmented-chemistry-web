import { describe, it, expect } from 'vitest';
import { computeMoleculeGeometry } from '@/rendering/MoleculeGeometry';
import { deserializeMolecule } from '@/chemistry/Serializer';

describe('computeMoleculeGeometry', () => {
  it('computes Water (H2O): 3 atoms, 2 bonds, all bond order 1', () => {
    const mol = deserializeMolecule('Wasser', 'O 0,H 0,H 0;0a2,0d1,1d0,2a0');
    const geo = computeMoleculeGeometry(mol);

    expect(geo.atoms).toHaveLength(3);
    expect(geo.bonds).toHaveLength(2);

    // All bonds are single bonds
    for (const bond of geo.bonds) {
      expect(bond.bondOrder).toBe(1);
    }
  });

  it('computes Methane (CH4): 5 atoms, 4 bonds', () => {
    const mol = deserializeMolecule(
      'Methan',
      'C 0,H 0,H 0,H 0,H 0;0a4,0b2,0c1,0d3,1c0,2b0,3d0,4a0',
    );
    const geo = computeMoleculeGeometry(mol);

    expect(geo.atoms).toHaveLength(5);
    expect(geo.bonds).toHaveLength(4);

    for (const bond of geo.bonds) {
      expect(bond.bondOrder).toBe(1);
    }
  });

  it('computes Ethyne (C2H2): triple bond between carbons', () => {
    const mol = deserializeMolecule(
      'Ethyne',
      'C 0,C 0,H 0,H 0;0a1,0b1,0c1,0d3,1a0,1b0,1c0,1d2,2d1,3d0',
    );
    const geo = computeMoleculeGeometry(mol);

    expect(geo.atoms).toHaveLength(4);
    expect(geo.bonds).toHaveLength(3);

    // Find the C-C bond (both atoms are carbon, index 0)
    const ccBond = geo.bonds.find(
      (b) => b.originAtom.element.symbol === 'C' && b.targetAtom.element.symbol === 'C',
    );
    expect(ccBond).toBeDefined();
    expect(ccBond!.bondOrder).toBe(3);

    // C-H bonds are single
    const chBonds = geo.bonds.filter(
      (b) => b.originAtom.element.symbol !== b.targetAtom.element.symbol,
    );
    expect(chBonds).toHaveLength(2);
    for (const bond of chBonds) {
      expect(bond.bondOrder).toBe(1);
    }
  });

  it('handles benzene-language atoms (Chlorobenzene)', () => {
    const mol = deserializeMolecule(
      'Chlorobenzene',
      'C 1,C 1,C 1,C 1,C 1,C 1,Cl 0,H 0,H 0,H 0,H 0,H 0;0a9,0b5,0c1,0d5,1a7,1b2,1c0,1d2,2a6,2b1,2c3,2d1,3a8,3b4,3c2,3d4,4a10,4b3,4c5,4d3,5a11,5b0,5c4,5d0,6a2,7a1,8a3,9a0,10a4,11a5',
    );
    const geo = computeMoleculeGeometry(mol);

    // Chlorobenzene has 12 atoms; DFS may visit ring atoms multiple times
    expect(geo.atoms.length).toBeGreaterThanOrEqual(12);
    // No NaN positions
    for (const a of geo.atoms) {
      expect(Number.isNaN(a.position[0])).toBe(false);
      expect(Number.isNaN(a.position[1])).toBe(false);
      expect(Number.isNaN(a.position[2])).toBe(false);
    }
    expect(geo.bonds.length).toBeGreaterThan(0);
  });

  it('centers molecule at origin', () => {
    const mol = deserializeMolecule(
      'Methan',
      'C 0,H 0,H 0,H 0,H 0;0a4,0b2,0c1,0d3,1c0,2b0,3d0,4a0',
    );
    const geo = computeMoleculeGeometry(mol);

    let cx = 0, cy = 0, cz = 0;
    for (const a of geo.atoms) {
      cx += a.position[0];
      cy += a.position[1];
      cz += a.position[2];
    }
    cx /= geo.atoms.length;
    cy /= geo.atoms.length;
    cz /= geo.atoms.length;

    expect(Math.abs(cx)).toBeLessThan(1e-6);
    expect(Math.abs(cy)).toBeLessThan(1e-6);
    expect(Math.abs(cz)).toBeLessThan(1e-6);
  });

  it('bounding radius encompasses all atoms', () => {
    const mol = deserializeMolecule(
      'Methan',
      'C 0,H 0,H 0,H 0,H 0;0a4,0b2,0c1,0d3,1c0,2b0,3d0,4a0',
    );
    const geo = computeMoleculeGeometry(mol);

    expect(geo.boundingRadius).toBeGreaterThan(0);
    for (const a of geo.atoms) {
      const r = Math.sqrt(a.position[0] ** 2 + a.position[1] ** 2 + a.position[2] ** 2);
      expect(r).toBeLessThanOrEqual(geo.boundingRadius + 1e-10);
    }
  });

  it('bond positions match atom positions', () => {
    const mol = deserializeMolecule('Wasser', 'O 0,H 0,H 0;0a2,0d1,1d0,2a0');
    const geo = computeMoleculeGeometry(mol);

    for (const bond of geo.bonds) {
      // Origin position should match an atom position
      const originAtomPlacement = geo.atoms.find((a) => a.atom === bond.originAtom);
      expect(originAtomPlacement).toBeDefined();
      expect(bond.originPos[0]).toBeCloseTo(originAtomPlacement!.position[0], 10);
      expect(bond.originPos[1]).toBeCloseTo(originAtomPlacement!.position[1], 10);
      expect(bond.originPos[2]).toBeCloseTo(originAtomPlacement!.position[2], 10);

      // Target position should match an atom position
      const targetAtomPlacement = geo.atoms.find((a) => a.atom === bond.targetAtom);
      expect(targetAtomPlacement).toBeDefined();
      expect(bond.targetPos[0]).toBeCloseTo(targetAtomPlacement!.position[0], 10);
      expect(bond.targetPos[1]).toBeCloseTo(targetAtomPlacement!.position[1], 10);
      expect(bond.targetPos[2]).toBeCloseTo(targetAtomPlacement!.position[2], 10);
    }
  });

  it('single atom molecule returns 1 atom, 0 bonds', () => {
    const mol = deserializeMolecule('single', 'C 0;');
    const geo = computeMoleculeGeometry(mol);

    expect(geo.atoms).toHaveLength(1);
    expect(geo.bonds).toHaveLength(0);
    expect(geo.boundingRadius).toBe(0);
  });

  it('atoms have non-zero distances between them', () => {
    const mol = deserializeMolecule('Wasser', 'O 0,H 0,H 0;0a2,0d1,1d0,2a0');
    const geo = computeMoleculeGeometry(mol);

    for (const bond of geo.bonds) {
      const dx = bond.targetPos[0] - bond.originPos[0];
      const dy = bond.targetPos[1] - bond.originPos[1];
      const dz = bond.targetPos[2] - bond.originPos[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      expect(dist).toBeGreaterThan(0.5);
    }
  });
});
