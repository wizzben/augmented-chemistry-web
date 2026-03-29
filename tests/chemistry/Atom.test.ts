import { describe, it, expect } from 'vitest';
import { Atom } from '@/chemistry/Atom';
import { getElementBySymbol } from '@/chemistry/Element';

describe('Atom', () => {
  const C = getElementBySymbol('C');
  const H = getElementBySymbol('H');

  it('initializes with correct defaults', () => {
    const atom = new Atom(C, 0);
    expect(atom.element).toBe(C);
    expect(atom.index).toBe(0);
    expect(atom.connection).toEqual([null, null, null, null]);
    expect(atom.bitField).toBe(0);
    expect(atom.done).toBe(false);
    expect(atom.language).toBe(0);
    expect(atom.parole).toBe(0);
    expect(atom.depth).toBe(-1);
    expect(atom.parent).toBe(null);
    expect(atom.connectionFlags).toBe(0);
    expect(atom.matrix).toHaveLength(16);
  });

  it('getConnectionBitField returns 0 for no connections', () => {
    const atom = new Atom(C, 0);
    expect(atom.getConnectionBitField()).toBe(0);
  });

  it('getConnectionBitField reflects connections', () => {
    const a = new Atom(C, 0);
    const b = new Atom(H, 1);
    a.connection[0] = b;
    a.connection[2] = b;
    expect(a.getConnectionBitField()).toBe(5); // 1 + 4
  });

  it('getConnectionBitFieldOfLink finds specific target', () => {
    const a = new Atom(C, 0);
    const b = new Atom(H, 1);
    const c = new Atom(H, 2);
    a.connection[0] = b;
    a.connection[1] = c;
    a.connection[2] = b;
    expect(a.getConnectionBitFieldOfLink(b)).toBe(5); // slots 0 + 2
    expect(a.getConnectionBitFieldOfLink(c)).toBe(2); // slot 1
  });

  it('getNumberOfConnections counts occupied slots', () => {
    const a = new Atom(C, 0);
    expect(a.getNumberOfConnections()).toBe(0);
    a.connection[0] = new Atom(H, 1);
    a.connection[3] = new Atom(H, 2);
    expect(a.getNumberOfConnections()).toBe(2);
  });

  it('getNumberOfConnectionsToAtom counts bonds to specific atom', () => {
    const a = new Atom(C, 0);
    const b = new Atom(H, 1);
    a.connection[0] = b;
    a.connection[1] = b;
    expect(a.getNumberOfConnectionsToAtom(b)).toBe(2);
  });

  it('isSaturated checks valence', () => {
    const h = new Atom(H, 0); // valence 1
    h.bitField = 0;
    expect(h.isSaturated()).toBe(false);
    h.bitField = 1; // 1 connection
    expect(h.isSaturated()).toBe(true);

    const c = new Atom(C, 0); // valence 4
    c.bitField = 7; // 3 connections
    expect(c.isSaturated()).toBe(false);
    c.bitField = 15; // 4 connections
    expect(c.isSaturated()).toBe(true);
  });

  it('updateLookups recomputes bitField and done', () => {
    const a = new Atom(H, 0);
    const b = new Atom(H, 1);
    a.connection[0] = b;
    expect(a.bitField).toBe(0); // stale
    a.updateLookups();
    expect(a.bitField).toBe(1);
    expect(a.done).toBe(true); // H has valence 1
  });
});
