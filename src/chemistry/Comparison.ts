import { Atom } from './Atom';
import type { Molecule } from './Molecule';
import { AC_ATOM_MAX_CONNECTIONS, AC_ATOM_CONNECTION, HISTOGRAM_SIZE } from './constants';

let globalParole = 0;

/**
 * Internal recursive tree string builder.
 * Port of ac_structures_62internTreeStringSentinel
 */
function internTreeStringSentinel(
  origin: Atom | null,
  target: Atom,
  parts: string[],
  idString: string,
  depth: number,
): void {
  // Append this node's identifier
  parts.push(idString);

  // If already visited, this closes a circular structure — return
  if (target.parole === globalParole) {
    return;
  }

  // Mark visited
  target.parole = globalParole;
  target.depth = depth;

  // Compute foreign connections (not going back to origin)
  let myConnections = 0;
  if (origin) {
    myConnections = origin.getConnectionBitFieldOfLink(target);
  }
  let foreignConnections = target.bitField ^ myConnections;

  if (!foreignConnections) return;

  // Build sorted list of valid links
  interface ValidLink {
    key: string;
    atom: Atom | null;
  }

  const validLinks: ValidLink[] = [];
  let numberOfValidLinks = 0;

  for (let i = 0; i < AC_ATOM_MAX_CONNECTIONS; i++) {
    if (foreignConnections & AC_ATOM_CONNECTION[i]) {
      const neighbor = target.connection[i]!;
      const specificFC = target.getConnectionBitFieldOfLink(neighbor);
      foreignConnections ^= specificFC;

      // Count bond multiplicity
      const val = target.getNumberOfConnectionsToAtom(neighbor);
      const bondChar = val === 1 ? 'a' : val === 2 ? 'b' : 'c';

      if (neighbor.parole !== globalParole) {
        // Unvisited: add as a valid link to recurse into
        validLinks.push({
          key: `${depth + 1}${bondChar}${neighbor.element.symbol}`,
          atom: neighbor,
        });
        numberOfValidLinks++;
      } else {
        // Already visited: circular closure — append directly to string
        const circularKey = `&(${depth + 1}>${neighbor.depth}${bondChar}${neighbor.element.symbol})`;
        parts.push(circularKey);
      }
    }
  }

  if (numberOfValidLinks === 0) return;

  if (numberOfValidLinks === 1) {
    // Single branch — no sorting needed
    internTreeStringSentinel(target, validLinks[0].atom!, parts, validLinks[0].key, depth + 1);
  } else {
    // Multiple branches — selection sort by key, recurse in order
    while (true) {
      // Find first non-null entry
      let k = 0;
      while (k < numberOfValidLinks && validLinks[k].atom === null) {
        k++;
      }
      if (k >= numberOfValidLinks) return;

      // Find minimum key among remaining
      for (let i = k + 1; i < numberOfValidLinks; i++) {
        if (validLinks[i].atom && validLinks[k].key > validLinks[i].key) {
          k = i;
        }
      }

      // Recurse if not yet visited (may have been visited by earlier recursive call)
      if (validLinks[k].atom!.parole !== globalParole) {
        internTreeStringSentinel(target, validLinks[k].atom!, parts, validLinks[k].key, depth + 1);
      }
      validLinks[k].atom = null;
    }
  }
}

/**
 * Generate a canonical tree string for molecule comparison.
 * Port of ac_structures_49moleculeGetTreeString
 */
export function moleculeGetTreeString(molecule: Molecule, startAt?: Atom): string {
  if (molecule.atoms.length === 0) return '';

  const start = startAt ?? molecule.atoms[0];

  // Advance parole
  const first = molecule.atoms[0];
  globalParole = first.parole > 32000 ? 1 : first.parole + 1;

  const parts: string[] = [];
  internTreeStringSentinel(null, start, parts, start.element.symbol, 0);
  return parts.join('');
}

/**
 * Compare element histograms of two molecules.
 * Port of ac_structures_51moleculeCompareElementHistogram
 */
export function moleculeCompareHistogram(a: Molecule, b: Molecule): boolean {
  for (let i = 0; i < HISTOGRAM_SIZE; i++) {
    if (a.histogram[i] !== b.histogram[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Find a matching molecule in the library.
 * Port of ac_structures_47moleculeCompareStructure
 *
 * Returns the matching library molecule, or null if not found.
 */
export function moleculeCompareStructure(
  molecule: Molecule,
  library: Molecule[],
): Molecule | null {
  // Must be saturated (no hungry atoms)
  if (molecule.getHungryAtom() !== null) {
    return null;
  }

  const testString = moleculeGetTreeString(molecule);

  for (const preset of library) {
    // Quick histogram pre-filter
    if (!moleculeCompareHistogram(molecule, preset)) {
      continue;
    }

    // Try each atom of matching element type as start point
    const startElement = molecule.atoms[0].element;
    let searchIdx = 0;
    while (true) {
      const aPtr = preset.getAtomOfElement(startElement, searchIdx);
      if (!aPtr) break;
      const cmpString = moleculeGetTreeString(preset, aPtr);
      if (testString === cmpString) {
        return preset;
      }
      searchIdx = aPtr.index + 1;
    }
  }

  return null;
}
