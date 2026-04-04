import type { Atom } from '@/chemistry/Atom';
import type { Element } from '@/chemistry/Element';
import type { Molecule } from '@/chemistry/Molecule';
import { moleculeCompareStructure } from '@/chemistry/Comparison';
import { computeMoleculeGeometry, type MoleculeGeometryData } from '@/rendering/MoleculeGeometry';
import { deserializeMolecule } from '@/chemistry/Serializer';

export class MoleculeBuilder {
  private molecule: Molecule;
  private currentElement: Element | null = null;
  private library: Molecule[];
  private atomHistory: Atom[] = [];

  onChanged: (geo: MoleculeGeometryData) => void = () => {};
  onRecognized: (mol: Molecule | null) => void = () => {};

  constructor(molecule: Molecule, library: Molecule[]) {
    this.molecule = molecule;
    this.library = library;
  }

  setElement(el: Element): void {
    this.currentElement = el;
  }

  getCurrentElement(): Element | null {
    return this.currentElement;
  }

  getMolecule(): Molecule {
    return this.molecule;
  }

  /**
   * Add the first atom (when molecule is empty).
   * Port of the first-atom placement in aco_platform_06linkNow.
   */
  addFirstAtom(): void {
    if (!this.currentElement) return;
    if (this.molecule.atoms.length > 0) return;

    const atom = this.molecule.addAtom(this.currentElement);
    this.atomHistory.push(atom);
    this._structureDidChange();
  }

  /**
   * Bond a new atom of the current element at the given slot on the target atom.
   * Port of aco_platform_06linkNow (aco_platform.c:1006-1048).
   */
  linkNow(atom: Atom, connectionBitfield: number): void {
    if (!this.currentElement) return;
    if (atom.done) return;
    if (this.molecule.done) return;

    const newAtom = this.molecule.addAtom(this.currentElement, atom, connectionBitfield);
    this.atomHistory.push(newAtom);
    this._structureDidChange();
  }

  /**
   * Remove the last added atom.
   * Port of aco_platform_07undoLastAtom (aco_platform.c:1071-1080).
   */
  undoLastAtom(): void {
    if (this.atomHistory.length === 0) return;
    const last = this.atomHistory.pop()!;
    this.molecule.removeAtom(last);
    this._structureDidChange();
  }

  /**
   * Replace the current molecule with a pre-built preset.
   * Port of ac_main.c:836 — moleculeClone(AC_MOLECULE_BENZENE).
   */
  loadPreset(formatString: string): void {
    // Clear current atoms
    while (this.molecule.atoms.length > 0) {
      this.molecule.removeAtom(this.molecule.atoms[this.molecule.atoms.length - 1]);
    }
    this.atomHistory = [];

    // Deserialize into a temporary molecule, then copy into this.molecule in place
    const temp = deserializeMolecule('preset', formatString);
    const atomMap = new Map<Atom, Atom>();
    for (const src of temp.atoms) {
      const dst = this.molecule.addAtom(src.element);
      dst.language = src.language;
      atomMap.set(src, dst);
    }
    for (const src of temp.atoms) {
      const dst = atomMap.get(src)!;
      for (let i = 0; i < 4; i++) {
        if (src.connection[i]) dst.connection[i] = atomMap.get(src.connection[i])!;
      }
    }

    this._structureDidChange();
  }

  /**
   * Clear the molecule and start fresh.
   */
  reset(): void {
    // Remove atoms in reverse order to cleanly unlink
    while (this.molecule.atoms.length > 0) {
      this.molecule.removeAtom(this.molecule.atoms[this.molecule.atoms.length - 1]);
    }
    this.atomHistory = [];
    this._structureDidChange();
  }

  private _structureDidChange(): void {
    this.molecule.resetAllLookups();
    this.molecule.computeHistogram();

    let recognized: Molecule | null = null;
    if (this.molecule.done && this.molecule.atoms.length > 0) {
      recognized = moleculeCompareStructure(this.molecule, this.library);
    }
    this.onRecognized(recognized);

    if (this.molecule.atoms.length > 0) {
      const geo = computeMoleculeGeometry(this.molecule);
      this.onChanged(geo);
    } else {
      // Empty molecule: emit empty geometry
      this.onChanged({ atoms: [], bonds: [], boundingRadius: 0, center: [0, 0, 0] });
    }
  }
}
