import { Atom } from './Atom';
import { Molecule, type MoleculeData } from './Molecule';
import { getElementBySymbol } from './Element';
import { AC_ATOM_MAX_CONNECTIONS } from './constants';

/**
 * Serialize a molecule to the internal format string.
 * Format: "C 0,H 0,H 0;0a1,0b2,1a0,2b0"
 * Port of ac_structures_53moleculeSerialize
 */
export function serializeMolecule(molecule: Molecule): string {
  molecule.resetAtomIndices();

  // Part 1: atoms
  const atomParts: string[] = [];
  for (const atom of molecule.atoms) {
    atomParts.push(`${atom.element.symbol} ${atom.language}`);
  }

  // Part 2: connections
  const connParts: string[] = [];
  for (const atom of molecule.atoms) {
    for (let i = 0; i < AC_ATOM_MAX_CONNECTIONS; i++) {
      if (atom.connection[i]) {
        connParts.push(`${atom.index}${String.fromCharCode(97 + i)}${atom.connection[i]!.index}`);
      }
    }
  }

  return atomParts.join(',') + ';' + connParts.join(',');
}

/**
 * Deserialize a molecule from the internal format string.
 * Port of ac_structures_54moleculeDeserialize
 */
export function deserializeMolecule(
  name: string,
  formatString: string,
  data?: Partial<MoleculeData>,
): Molecule {
  const molecule = new Molecule({
    name,
    formula: data?.formula,
    soundfile: data?.soundfile,
    category: data?.category,
    infotext: data?.infotext,
    names: data?.names,
  });

  if (formatString.length <= 1) {
    return molecule;
  }

  const semicolonIdx = formatString.indexOf(';');
  if (semicolonIdx === -1) {
    throw new Error(`Invalid format string: no semicolon found`);
  }

  const atomsPart = formatString.substring(0, semicolonIdx);
  const bondsPart = formatString.substring(semicolonIdx + 1);

  // Parse atoms
  const atomTokens = atomsPart.split(',');
  const atoms: Atom[] = [];
  for (const token of atomTokens) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    const spaceIdx = trimmed.lastIndexOf(' ');
    const symbol = trimmed.substring(0, spaceIdx);
    const language = parseInt(trimmed.substring(spaceIdx + 1), 10);
    const element = getElementBySymbol(symbol);
    const atom = molecule.addAtom(element);
    atom.language = language;
    atoms.push(atom);
  }

  // Parse bonds
  if (bondsPart.length > 0) {
    const bondTokens = bondsPart.split(',');
    for (const token of bondTokens) {
      const trimmed = token.trim();
      if (!trimmed) continue;
      // Parse "originIdx{letter}targetIdx"
      // Find the letter (a-d) that separates origin from target
      let letterIdx = -1;
      for (let i = 0; i < trimmed.length; i++) {
        const ch = trimmed.charCodeAt(i);
        if (ch >= 97 && ch <= 100) { // a-d
          letterIdx = i;
          break;
        }
      }
      if (letterIdx === -1) continue;

      const originIdx = parseInt(trimmed.substring(0, letterIdx), 10);
      const connectionSlot = trimmed.charCodeAt(letterIdx) - 97;
      const targetIdx = parseInt(trimmed.substring(letterIdx + 1), 10);

      atoms[originIdx].connection[connectionSlot] = atoms[targetIdx];
    }
  }

  molecule.resetAllLookups();
  molecule.computeHistogram();

  return molecule;
}
