import { Atom } from './Atom';
import { atomLink } from './Bonding';
import type { Element } from './Element';
import { AC_ATOM_MAX_CONNECTIONS, HISTOGRAM_SIZE } from './constants';

export interface MoleculeData {
  name: string;
  formula?: string;
  soundfile?: string;
  category?: string;
  infotext?: string;
  names?: Record<string, string>;
}

export class Molecule {
  name: string;
  formula: string;
  soundfile: string;
  category: string;
  infotext: string;
  names: Record<string, string>;
  atoms: Atom[];
  histogram: number[];
  done: boolean;
  count: number;

  constructor(data: MoleculeData) {
    this.name = data.name;
    this.formula = data.formula ?? '';
    this.soundfile = data.soundfile ?? '';
    this.category = data.category ?? '';
    this.infotext = data.infotext ?? '';
    this.names = data.names ?? {};
    this.atoms = [];
    this.histogram = new Array(HISTOGRAM_SIZE).fill(0);
    this.done = false;
    this.count = 0;
  }

  /**
   * Create a new atom, add it to this molecule, optionally bond it.
   * Port of ac_structures_21atomInit
   */
  addAtom(element: Element, linkAtom?: Atom, connectionBitfield?: number): Atom {
    const atom = new Atom(element, this.atoms.length);
    this.atoms.push(atom);

    if (linkAtom && connectionBitfield) {
      const ret = atomLink(atom, linkAtom, connectionBitfield);
      if (ret !== 1) {
        // Remove the atom we just added on link failure
        this.atoms.pop();
        throw new Error(`atomLink failed with code ${ret}`);
      }
    }

    return atom;
  }

  /**
   * Remove an atom, clearing its connections (same-index rule).
   * Port of ac_structures_22atomFree
   */
  removeAtom(atom: Atom): void {
    // Clear connections: a.connection[i].connection[i] = null (same index!)
    for (let i = 0; i < AC_ATOM_MAX_CONNECTIONS; i++) {
      if (atom.connection[i]) {
        atom.connection[i]!.connection[i] = null;
      }
    }

    // Remove from array
    const idx = this.atoms.indexOf(atom);
    if (idx !== -1) {
      this.atoms.splice(idx, 1);
      this.resetAtomIndices();
    }
  }

  /** Get atom by index. Port of ac_structures_41moleculeGetAtom */
  getAtom(index: number): Atom | null {
    return this.atoms[index] ?? null;
  }

  /**
   * Find first atom of given element, starting from startAt index.
   * Port of ac_structures_42moleculeGetAtomOfElement
   */
  getAtomOfElement(element: Element, startAt = 0): Atom | null {
    for (let i = startAt; i < this.atoms.length; i++) {
      if (this.atoms[i].element === element) {
        return this.atoms[i];
      }
    }
    return null;
  }

  /**
   * Find first unsaturated atom (connections < valence).
   * Port of ac_structures_44moleculeGetHungryAtom
   */
  getHungryAtom(startAt = 0): Atom | null {
    for (let i = startAt; i < this.atoms.length; i++) {
      if (this.atoms[i].getNumberOfConnections() < this.atoms[i].element.valence) {
        return this.atoms[i];
      }
    }
    return null;
  }

  /**
   * Recompute bitField and done for all atoms, and molecule.done.
   * Port of ac_structures_46moleculeResetAllLookups
   */
  resetAllLookups(): void {
    this.done = true;
    for (const atom of this.atoms) {
      atom.updateLookups();
      if (!atom.done) {
        this.done = false;
      }
    }
  }

  /**
   * Recompute histogram and count.
   * Port of ac_structures_50moleculeGetElementHistogram
   */
  computeHistogram(): void {
    this.histogram.fill(0);
    this.count = 0;
    for (const atom of this.atoms) {
      this.count++;
      this.histogram[atom.element.index]++;
    }
  }

  /**
   * Set atom.index = position in array.
   * Port of ac_structures_52moleculeResetAtomIndices
   */
  resetAtomIndices(): void {
    for (let i = 0; i < this.atoms.length; i++) {
      this.atoms[i].index = i;
    }
    this.count = this.atoms.length;
  }

  /** Remove all atoms. Port of ac_structures_45moleculeFreeAllAtoms */
  freeAllAtoms(): void {
    this.atoms = [];
    this.count = 0;
    this.done = false;
  }
}
