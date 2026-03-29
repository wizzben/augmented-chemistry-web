import {
  AC_ATOM_MAX_CONNECTIONS,
  AC_ATOM_CONNECTION,
  AC_ATOM_COUNT_CONNECTIONS_OF_BITFIELD,
} from './constants';

/**
 * Compute the connection bitfield for an atom's connections array.
 * Port of ac_structures_23atomGetConnectionBitField
 */
export function getConnectionBitField(connections: ReadonlyArray<unknown | null>): number {
  let bitfield = 0;
  for (let i = 0; i < AC_ATOM_MAX_CONNECTIONS; i++) {
    if (connections[i] != null) {
      bitfield += AC_ATOM_CONNECTION[i];
    }
  }
  return bitfield;
}

/**
 * Compute the bitfield for connections from `connections` that point to `target`.
 * Port of ac_structures_24atomGetCConnectionBitFieldOfLink
 */
export function getConnectionBitFieldOfLink(
  connections: ReadonlyArray<unknown | null>,
  target: unknown,
): number {
  let bitfield = 0;
  for (let i = 0; i < AC_ATOM_MAX_CONNECTIONS; i++) {
    if (connections[i] === target) {
      bitfield += AC_ATOM_CONNECTION[i];
    }
  }
  return bitfield;
}

/**
 * Count the number of set bits in a connection bitfield using the lookup table.
 * Port of ac_structures_27atomGetNumberOfConnectionsByBitField
 */
export function getNumberOfConnectionsByBitField(bitfield: number): number {
  return AC_ATOM_COUNT_CONNECTIONS_OF_BITFIELD[bitfield];
}

/**
 * For each possible bitfield combination (1-14), determine if it can be added
 * to the atom's current connections without exceeding valence.
 * Returns boolean[14] where index i corresponds to bitfield value i+1.
 * Port of ac_structures_28atomGetPoolOfPossibleConnections
 */
export function getPoolOfPossibleConnections(
  currentBitfield: number,
  valence: number,
): boolean[] {
  const currentCount = getNumberOfConnectionsByBitField(currentBitfield);
  const pool: boolean[] = new Array(14);
  for (let i = 0; i < 14; i++) {
    const candidate = i + 1; // bitfield values 1..14
    const candidateCount = getNumberOfConnectionsByBitField(candidate);
    // No overlap with existing connections AND total doesn't exceed valence
    pool[i] = (currentBitfield & candidate) === 0 &&
              candidateCount + currentCount <= valence;
  }
  return pool;
}
