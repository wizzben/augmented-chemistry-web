import { describe, it, expect } from 'vitest';
import {
  ALL_ELEMENTS,
  ELEMENTS_BY_SYMBOL,
  ELEMENTS_BY_INDEX,
  getElementBySymbol,
  getElementByIndex,
} from '@/chemistry/Element';

describe('Element', () => {
  it('has exactly 11 elements', () => {
    expect(ALL_ELEMENTS).toHaveLength(11);
  });

  it('all symbols are unique', () => {
    const symbols = ALL_ELEMENTS.map((el) => el.symbol);
    expect(new Set(symbols).size).toBe(11);
  });

  it('all indices are unique', () => {
    const indices = ALL_ELEMENTS.map((el) => el.index);
    expect(new Set(indices).size).toBe(11);
  });

  it('has correct non-sequential index mapping', () => {
    expect(getElementBySymbol('C').index).toBe(0);
    expect(getElementBySymbol('O').index).toBe(1);
    expect(getElementBySymbol('Br').index).toBe(2);
    expect(getElementBySymbol('Cl').index).toBe(3);
    expect(getElementBySymbol('F').index).toBe(4);
    expect(getElementBySymbol('H').index).toBe(5);
    expect(getElementBySymbol('Li').index).toBe(6);
    expect(getElementBySymbol('Mg').index).toBe(7);
    expect(getElementBySymbol('N').index).toBe(8);
    expect(getElementBySymbol('Na').index).toBe(9);
    expect(getElementBySymbol('K').index).toBe(10);
  });

  it('has correct valences', () => {
    expect(getElementBySymbol('C').valence).toBe(4);
    expect(getElementBySymbol('N').valence).toBe(3);
    expect(getElementBySymbol('O').valence).toBe(2);
    expect(getElementBySymbol('Mg').valence).toBe(2);
    expect(getElementBySymbol('H').valence).toBe(1);
    expect(getElementBySymbol('Li').valence).toBe(1);
    expect(getElementBySymbol('F').valence).toBe(1);
    expect(getElementBySymbol('Na').valence).toBe(1);
    expect(getElementBySymbol('Cl').valence).toBe(1);
    expect(getElementBySymbol('K').valence).toBe(1);
    expect(getElementBySymbol('Br').valence).toBe(1);
  });

  it('hydrogen has smaller radius than others', () => {
    expect(getElementBySymbol('H').radius).toBe(0.8);
    for (const el of ALL_ELEMENTS) {
      if (el.symbol !== 'H') {
        expect(el.radius).toBe(1.0);
      }
    }
  });

  it('fluorine has highest electronegativity', () => {
    const f = getElementBySymbol('F');
    for (const el of ALL_ELEMENTS) {
      expect(f.electronegativity).toBeGreaterThanOrEqual(el.electronegativity);
    }
    expect(f.electronegativity).toBe(4.1);
  });

  it('potassium has lowest electronegativity', () => {
    const k = getElementBySymbol('K');
    for (const el of ALL_ELEMENTS) {
      expect(k.electronegativity).toBeLessThanOrEqual(el.electronegativity);
    }
    expect(k.electronegativity).toBe(0.9);
  });

  it('lookup by symbol works for all elements', () => {
    expect(ELEMENTS_BY_SYMBOL.size).toBe(11);
    for (const el of ALL_ELEMENTS) {
      expect(ELEMENTS_BY_SYMBOL.get(el.symbol)).toBe(el);
    }
  });

  it('lookup by index works for all elements', () => {
    expect(ELEMENTS_BY_INDEX.size).toBe(11);
    for (const el of ALL_ELEMENTS) {
      expect(ELEMENTS_BY_INDEX.get(el.index)).toBe(el);
    }
  });

  it('getElementBySymbol throws for unknown symbol', () => {
    expect(() => getElementBySymbol('X')).toThrow('Unknown element symbol: X');
  });

  it('getElementByIndex throws for unknown index', () => {
    expect(() => getElementByIndex(99)).toThrow('Unknown element index: 99');
  });

  it('has correct colors for key elements', () => {
    expect(getElementBySymbol('C').color).toEqual({ r: 0.1, g: 0.1, b: 0.1, a: 1.0 });
    expect(getElementBySymbol('O').color).toEqual({ r: 1.0, g: 0.0, b: 0.0, a: 1.0 });
    expect(getElementBySymbol('H').color).toEqual({ r: 1.0, g: 1.0, b: 1.0, a: 1.0 });
    expect(getElementBySymbol('N').color).toEqual({ r: 0.0, g: 0.0, b: 1.0, a: 1.0 });
    expect(getElementBySymbol('Cl').color).toEqual({ r: 0.0, g: 1.0, b: 0.0, a: 1.0 });
  });
});
