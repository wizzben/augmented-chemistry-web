import type { Atom } from '@/chemistry/Atom';
import type { Molecule } from '@/chemistry/Molecule';
import { mat44Multiply, mat44LoadIdentity } from '@/chemistry/Matrix44';
import { moleculeDFSTraversal } from '@/chemistry/Traversal';
import { setTetraMatrices, type TetraMatrices } from '@/chemistry/TetraGeometry';
import { AC_ATOM_COUNT_CONNECTIONS_OF_BITFIELD } from '@/chemistry/constants';

export interface AtomPlacement {
  atom: Atom;
  position: [number, number, number];
}

export interface BondPlacement {
  originAtom: Atom;
  targetAtom: Atom;
  originPos: [number, number, number];
  targetPos: [number, number, number];
  bondOrder: number;
}

export interface MoleculeGeometryData {
  atoms: AtomPlacement[];
  bonds: BondPlacement[];
  boundingRadius: number;
}

/**
 * Compute world-space atom positions and bond placements for a molecule.
 * Port of aco_platform_moleculeCalcMatrices (aco_platform.c:1527-1540).
 *
 * The DFS traversal computes each atom's absolute 4x4 matrix:
 * - Root atom: identity matrix (molecule at origin for desktop mode)
 * - Other atoms: multiply(TETRA_TRANSFORM[origin.language][bitfield-1], origin.matrix)
 *
 * Positions are extracted from matrix[12,13,14] and centered.
 */
export function computeMoleculeGeometry(
  molecule: Molecule,
  tetraMatrices?: TetraMatrices,
): MoleculeGeometryData {
  const tetra = tetraMatrices ?? setTetraMatrices(1.0);
  const atoms: AtomPlacement[] = [];
  const bonds: BondPlacement[] = [];

  moleculeDFSTraversal(molecule, null, (origin, target, connectionBitfield) => {
    if (origin) {
      const transformIdx = connectionBitfield - 1;
      const result = mat44Multiply(
        tetra.transform[origin.language][transformIdx],
        origin.matrix,
      );
      mat44LoadIdentity(target.matrix);
      for (let i = 0; i < 16; i++) target.matrix[i] = result[i];
    } else {
      mat44LoadIdentity(target.matrix);
    }

    const pos: [number, number, number] = [
      target.matrix[12],
      target.matrix[13],
      target.matrix[14],
    ];
    atoms.push({ atom: target, position: pos });

    if (origin) {
      const originPos: [number, number, number] = [
        origin.matrix[12],
        origin.matrix[13],
        origin.matrix[14],
      ];
      const bondOrder = AC_ATOM_COUNT_CONNECTIONS_OF_BITFIELD[connectionBitfield];
      bonds.push({
        originAtom: origin,
        targetAtom: target,
        originPos,
        targetPos: pos,
        bondOrder,
      });
    }
  });

  // Center molecule at origin
  if (atoms.length > 0) {
    let cx = 0, cy = 0, cz = 0;
    for (const a of atoms) {
      cx += a.position[0];
      cy += a.position[1];
      cz += a.position[2];
    }
    cx /= atoms.length;
    cy /= atoms.length;
    cz /= atoms.length;

    for (const a of atoms) {
      a.position[0] -= cx;
      a.position[1] -= cy;
      a.position[2] -= cz;
    }
    for (const b of bonds) {
      b.originPos[0] -= cx;
      b.originPos[1] -= cy;
      b.originPos[2] -= cz;
      b.targetPos[0] -= cx;
      b.targetPos[1] -= cy;
      b.targetPos[2] -= cz;
    }
  }

  // Compute bounding radius
  let boundingRadius = 0;
  for (const a of atoms) {
    const r = Math.sqrt(
      a.position[0] ** 2 + a.position[1] ** 2 + a.position[2] ** 2,
    );
    if (r > boundingRadius) boundingRadius = r;
  }

  return { atoms, bonds, boundingRadius };
}
