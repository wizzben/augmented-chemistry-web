export interface ElementColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface Element {
  readonly name: string;
  readonly symbol: string;
  readonly index: number;
  readonly valence: number;
  readonly protons: number;
  readonly neutrons: number;
  readonly electrons: number;
  readonly radius: number;
  readonly electronegativity: number;
  readonly color: ElementColor;
}

/**
 * All 11 elements, in the same order as ac_main.c elementDefs[].
 * Index values are non-sequential and must be preserved exactly.
 */
export const ALL_ELEMENTS: readonly Element[] = Object.freeze([
  // name            sym   idx  val  p   n   e   rad  eln   color
  { name: 'Kohlenstoff', symbol: 'C',  index: 0,  valence: 4, protons: 6,  neutrons: 6,  electrons: 4, radius: 1.0, electronegativity: 2.5, color: { r: 0.1, g: 0.1, b: 0.1, a: 1.0 } },
  { name: 'Stickstoff',  symbol: 'N',  index: 8,  valence: 3, protons: 7,  neutrons: 7,  electrons: 5, radius: 1.0, electronegativity: 3.1, color: { r: 0.0, g: 0.0, b: 1.0, a: 1.0 } },
  { name: 'Magnesium',   symbol: 'Mg', index: 7,  valence: 2, protons: 12, neutrons: 12, electrons: 2, radius: 1.0, electronegativity: 1.2, color: { r: 0.8, g: 0.5, b: 0.0, a: 1.0 } },
  { name: 'Sauerstoff',  symbol: 'O',  index: 1,  valence: 2, protons: 8,  neutrons: 8,  electrons: 6, radius: 1.0, electronegativity: 3.5, color: { r: 1.0, g: 0.0, b: 0.0, a: 1.0 } },
  { name: 'Wasserstoff', symbol: 'H',  index: 5,  valence: 1, protons: 1,  neutrons: 1,  electrons: 1, radius: 0.8, electronegativity: 2.2, color: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 } },
  { name: 'Lithium',     symbol: 'Li', index: 6,  valence: 1, protons: 3,  neutrons: 3,  electrons: 1, radius: 1.0, electronegativity: 1.0, color: { r: 0.7, g: 0.7, b: 0.7, a: 1.0 } },
  { name: 'Fluor',       symbol: 'F',  index: 4,  valence: 1, protons: 9,  neutrons: 9,  electrons: 7, radius: 1.0, electronegativity: 4.1, color: { r: 0.5, g: 0.5, b: 1.0, a: 1.0 } },
  { name: 'Natrium',     symbol: 'Na', index: 9,  valence: 1, protons: 11, neutrons: 11, electrons: 1, radius: 1.0, electronegativity: 1.0, color: { r: 0.6, g: 0.6, b: 0.0, a: 1.0 } },
  { name: 'Chlor',       symbol: 'Cl', index: 3,  valence: 1, protons: 17, neutrons: 17, electrons: 7, radius: 1.0, electronegativity: 2.8, color: { r: 0.0, g: 1.0, b: 0.0, a: 1.0 } },
  { name: 'Kalium',      symbol: 'K',  index: 10, valence: 1, protons: 19, neutrons: 19, electrons: 1, radius: 1.0, electronegativity: 0.9, color: { r: 0.5, g: 0.0, b: 1.0, a: 1.0 } },
  { name: 'Brom',        symbol: 'Br', index: 2,  valence: 1, protons: 35, neutrons: 35, electrons: 7, radius: 1.0, electronegativity: 2.7, color: { r: 0.6, g: 0.3, b: 0.0, a: 1.0 } },
]);

/** Lookup element by chemical symbol */
export const ELEMENTS_BY_SYMBOL: ReadonlyMap<string, Element> = new Map(
  ALL_ELEMENTS.map((el) => [el.symbol, el])
);

/** Lookup element by histogram index */
export const ELEMENTS_BY_INDEX: ReadonlyMap<number, Element> = new Map(
  ALL_ELEMENTS.map((el) => [el.index, el])
);

export function getElementBySymbol(symbol: string): Element {
  const el = ELEMENTS_BY_SYMBOL.get(symbol);
  if (!el) throw new Error(`Unknown element symbol: ${symbol}`);
  return el;
}

export function getElementByIndex(index: number): Element {
  const el = ELEMENTS_BY_INDEX.get(index);
  if (!el) throw new Error(`Unknown element index: ${index}`);
  return el;
}
