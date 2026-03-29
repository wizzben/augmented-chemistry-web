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
  const visited = new Set<Atom>();
  const atomPositions = new Map<Atom, [number, number, number]>();

  moleculeDFSTraversal(molecule, null, (origin, target, connectionBitfield) => {
    // Guard: don't overwrite matrix for already-visited atoms (ring back-edges).
    // Port of the parole check in aco_platform_moleculeCalcMatrices (line 1532).
    if (!visited.has(target)) {
      if (origin) {
        const transformIdx = connectionBitfield - 1;
        const result = mat44Multiply(
          tetra.transform[origin.language][transformIdx],
          origin.matrix,
        );
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
      atomPositions.set(target, pos);
      visited.add(target);
    }

    // Always record bonds (including ring-closing bonds)
    if (origin) {
      const originPos = atomPositions.get(origin)!;
      const targetPos = atomPositions.get(target)!;
      const bondOrder = AC_ATOM_COUNT_CONNECTIONS_OF_BITFIELD[connectionBitfield];
      bonds.push({
        originAtom: origin,
        targetAtom: target,
        originPos,
        targetPos,
        bondOrder,
      });
    }
  });

  // Center molecule at origin.
  // Bond positions share the same tuple references as atom positions,
  // so centering atoms automatically centers bonds too.
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
