import { Atom } from './Atom';
import type { Element } from './Element';
import { AC_ATOM_MAX_CONNECTIONS, AC_ATOM_CONNECTION } from './constants';

export const enum LinkResult {
  OK = 1,
  ATOM_NOT_FOUND = -1,
  ATOM_A_INVALID_COMBO = -2,
  ATOM_B_INVALID_COMBO = -3,
  ATOM_A_EXCEEDS_VALENCE = -4,
  ATOM_B_EXCEEDS_VALENCE = -5,
}

/**
 * Create bidirectional bonds between two atoms.
 * Uses the same slot indices for both atoms (symmetric).
 * Port of ac_structures_29atomLinkwithAtom
 */
export function atomLink(a: Atom, b: Atom, connections: number): LinkResult {
  // Slot overlap check
  if ((a.getConnectionBitField() & connections) !== 0) {
    return LinkResult.ATOM_A_INVALID_COMBO;
  }
  if ((b.getConnectionBitField() & connections) !== 0) {
    return LinkResult.ATOM_B_INVALID_COMBO;
  }

  // Count new connections
  let n = 0;
  for (let i = 0; i < AC_ATOM_MAX_CONNECTIONS; i++) {
    if ((connections & AC_ATOM_CONNECTION[i]) !== 0) {
      n++;
    }
  }

  // Valence check
  if (a.getNumberOfConnections() + n > a.element.valence) {
    return LinkResult.ATOM_A_EXCEEDS_VALENCE;
  }
  if (b.getNumberOfConnections() + n > b.element.valence) {
    return LinkResult.ATOM_B_EXCEEDS_VALENCE;
  }

  // Create connections
  for (let i = 0; i < AC_ATOM_MAX_CONNECTIONS; i++) {
    if ((connections & AC_ATOM_CONNECTION[i]) !== 0) {
      a.connection[i] = b;
      b.connection[i] = a;
    }
  }

  return LinkResult.OK;
}

/**
 * Validate whether an atom can accept a bond with a given element.
 * Port of ac_structures_30atomTryLinkWithElement
 *
 * Returns 1 if ok, -1 if slots conflict, -2 if atom exceeds valence,
 * -3 if element can't take that many connections.
 */
export function atomTryLinkWithElement(
  atom: Atom,
  element: Element,
  connections: number,
): number {
  if ((atom.getConnectionBitField() & connections) !== 0) {
    return -1;
  }

  let n = 0;
  for (let i = 0; i < AC_ATOM_MAX_CONNECTIONS; i++) {
    if ((connections & AC_ATOM_CONNECTION[i]) !== 0) {
      n++;
    }
  }

  if (atom.getNumberOfConnections() + n > atom.element.valence) {
    return -2;
  }
  if (n > element.valence) {
    return -3;
  }

  return 1;
}

/**
 * Remove all connections between two atoms (both directions).
 * Port of ac_structures_31atomUnlink
 */
export function atomUnlink(a: Atom, b: Atom): void {
  for (let i = 0; i < AC_ATOM_MAX_CONNECTIONS; i++) {
    if (a.connection[i] === b) {
      a.connection[i] = null;
    }
    if (b.connection[i] === a) {
      b.connection[i] = null;
    }
  }
}
