import type { Element } from './Element';
import { AC_ATOM_MAX_CONNECTIONS, AC_ATOM_CONNECTION, AC_ATOM_COUNT_CONNECTIONS_OF_BITFIELD } from './constants';
import { mat44Identity } from './Matrix44';

export class Atom {
  element: Element;
  connection: (Atom | null)[];
  connectionFlags: number;
  language: number;
  matrix: number[];
  parole: number;
  depth: number;
  parent: Atom | null;
  index: number;
  bitField: number;
  done: boolean;

  constructor(element: Element, index: number) {
    this.element = element;
    this.connection = [null, null, null, null];
    this.connectionFlags = 0;
    this.language = 0;
    this.matrix = mat44Identity();
    this.parole = 0;
    this.depth = -1;
    this.parent = null;
    this.index = index;
    this.bitField = 0;
    this.done = false;
  }

  /** Compute bitfield from current connections. Port of ac_structures_23 */
  getConnectionBitField(): number {
    let bf = 0;
    for (let i = 0; i < AC_ATOM_MAX_CONNECTIONS; i++) {
      if (this.connection[i] != null) {
        bf += AC_ATOM_CONNECTION[i];
      }
    }
    return bf;
  }

  /** Bitfield for connections pointing to a specific atom. Port of ac_structures_24 */
  getConnectionBitFieldOfLink(other: Atom): number {
    let bf = 0;
    for (let i = 0; i < AC_ATOM_MAX_CONNECTIONS; i++) {
      if (this.connection[i] === other) {
        bf += AC_ATOM_CONNECTION[i];
      }
    }
    return bf;
  }

  /** Total number of occupied connection slots. Port of ac_structures_26 */
  getNumberOfConnections(): number {
    let count = 0;
    for (let i = 0; i < AC_ATOM_MAX_CONNECTIONS; i++) {
      if (this.connection[i] != null) count++;
    }
    return count;
  }

  /** Count connections to a specific atom (1=single, 2=double, 3=triple). Port of ac_structures_25 */
  getNumberOfConnectionsToAtom(other: Atom): number {
    let count = 0;
    for (let i = 0; i < AC_ATOM_MAX_CONNECTIONS; i++) {
      if (this.connection[i] === other) count++;
    }
    return count;
  }

  /** Whether all valence slots are filled */
  isSaturated(): boolean {
    return AC_ATOM_COUNT_CONNECTIONS_OF_BITFIELD[this.bitField] >= this.element.valence;
  }

  /** Recompute bitField and done from current connections */
  updateLookups(): void {
    this.bitField = this.getConnectionBitField();
    this.done = this.isSaturated();
  }
}
