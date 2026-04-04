import { describe, it, expect, vi } from 'vitest';
import { Molecule } from '@/chemistry/Molecule';
import { MoleculeBuilder } from '@/interaction/MoleculeBuilder';

// 6 unsaturated carbons in a ring — matches acmolstarters.dat exactly.
// Each carbon uses slots b/c/d (bitField=14), leaving slot a free for new atoms.
const BENZENE_FORMAT =
  'C 1,C 1,C 1,C 1,C 1,C 1;' +
  '0c1,0b5,0d5,1c0,1b2,1d2,2c3,2b1,2d1,3c2,3b4,3d4,4c5,4b3,4d3,5c4,5d0,5b0';

function makeBuilder() {
  const mol = new Molecule({ name: 'test' });
  const builder = new MoleculeBuilder(mol, []);
  return { mol, builder };
}

describe('MoleculeBuilder.loadPreset', () => {
  it('loads 6 carbons, no hydrogens', () => {
    const { mol, builder } = makeBuilder();
    builder.loadPreset(BENZENE_FORMAT);
    expect(mol.atoms.length).toBe(6);
    expect(mol.atoms.every((a) => a.element.symbol === 'C')).toBe(true);
  });

  it('preserves language=1 on all ring carbons', () => {
    const { mol, builder } = makeBuilder();
    builder.loadPreset(BENZENE_FORMAT);
    expect(mol.atoms.every((a) => a.language === 1)).toBe(true);
  });

  it('each carbon uses exactly 3 connection slots (b/c/d), leaving slot a free', () => {
    const { mol, builder } = makeBuilder();
    builder.loadPreset(BENZENE_FORMAT);
    for (const atom of mol.atoms) {
      const filled = atom.connection.filter((x) => x !== null);
      expect(filled.length).toBe(3);
      expect(atom.connection[0]).toBeNull(); // slot a is free
    }
  });

  it('atoms are unsaturated (done=false) so new atoms can be bonded', () => {
    const { mol, builder } = makeBuilder();
    builder.loadPreset(BENZENE_FORMAT);
    expect(mol.atoms.every((a) => !a.done)).toBe(true);
  });

  it('fires onChanged exactly once', () => {
    const { builder } = makeBuilder();
    const changed = vi.fn();
    builder.onChanged = changed;
    builder.loadPreset(BENZENE_FORMAT);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('replaces an existing molecule without accumulating atoms', () => {
    const { mol, builder } = makeBuilder();
    builder.loadPreset(BENZENE_FORMAT);
    builder.loadPreset(BENZENE_FORMAT);
    expect(mol.atoms.length).toBe(6);
  });
});
