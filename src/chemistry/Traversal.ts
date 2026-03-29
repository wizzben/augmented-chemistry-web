import { Atom } from './Atom';
import type { Molecule } from './Molecule';
import { AC_ATOM_MAX_CONNECTIONS, AC_ATOM_CONNECTION } from './constants';

let globalParole = 0;

function nextParole(molecule: Molecule): number {
  const first = molecule.atoms[0];
  if (!first) return 1;
  globalParole = first.parole > 32000 ? 1 : first.parole + 1;
  return globalParole;
}

export type TraversalAction = (
  origin: Atom | null,
  target: Atom,
  connectionBitfield: number,
) => void;

/**
 * Internal recursive DFS traversal.
 * Port of ac_structures_60internMoleculeDFSTravel
 */
function internDFSTravel(
  origin: Atom | null,
  target: Atom,
  action: TraversalAction,
): void {
  let myConnections = 0;
  if (origin) {
    myConnections = origin.getConnectionBitFieldOfLink(target);
  }

  action(origin, target, myConnections);

  if (target.parole === globalParole) {
    return;
  }
  target.parole = globalParole;

  let foreignConnections = target.bitField ^ myConnections;
  if (foreignConnections === 0) {
    return;
  }

  for (let i = 0; i < AC_ATOM_MAX_CONNECTIONS; i++) {
    if (foreignConnections & AC_ATOM_CONNECTION[i]) {
      const specificFC = target.getConnectionBitFieldOfLink(target.connection[i]!);
      foreignConnections ^= specificFC;
      internDFSTravel(target, target.connection[i]!, action);
    }
  }
}

/**
 * Public DFS traversal interface.
 * Port of ac_structures_48moleculeDFSTraversal
 */
export function moleculeDFSTraversal(
  molecule: Molecule,
  startAt: Atom | null,
  action: TraversalAction,
): void {
  if (molecule.atoms.length === 0) return;
  if (!startAt) {
    startAt = molecule.atoms[0];
  }
  nextParole(molecule);
  internDFSTravel(null, startAt, action);
}

/**
 * Internal recursive circular path detection.
 * Port of ac_structures_61interMoleculeDetectCircularPaths
 */
function internDetectCircularPaths(origin: Atom | null, target: Atom): void {
  let myConnections = 0;
  if (origin) {
    myConnections = origin.getConnectionBitFieldOfLink(target);
  }

  target.parent = origin;
  target.parole = globalParole;
  target.connectionFlags = 0;

  let foreignConnections = target.bitField ^ myConnections;

  if (foreignConnections) {
    for (let i = 0; i < AC_ATOM_MAX_CONNECTIONS; i++) {
      if (foreignConnections & AC_ATOM_CONNECTION[i]) {
        const neighbor = target.connection[i]!;
        const specificFC = target.getConnectionBitFieldOfLink(neighbor);
        foreignConnections ^= specificFC;

        if (neighbor.parole !== globalParole) {
          internDetectCircularPaths(target, neighbor);
        } else {
          // Circular path detected — trace back through parents
          neighbor.connectionFlags |= specificFC;
          target.connectionFlags |= specificFC;

          let bPtr: Atom | null = target;
          let aPtr: Atom | null = target.parent;
          while (bPtr !== neighbor) {
            if (!aPtr) break;
            const backFC = aPtr.getConnectionBitFieldOfLink(bPtr!);
            aPtr.connectionFlags |= backFC;
            bPtr!.connectionFlags |= backFC;
            bPtr = aPtr;
            aPtr = aPtr.parent;
          }
        }
      }
    }
  }
}

/**
 * Detect circular paths in a molecule, setting connectionFlags on ring atoms.
 * Port of ac_structures_48moleculeDetectCircularPaths
 */
export function moleculeDetectCircularPaths(molecule: Molecule): void {
  if (molecule.atoms.length === 0) return;
  nextParole(molecule);
  internDetectCircularPaths(null, molecule.atoms[0]);
}
