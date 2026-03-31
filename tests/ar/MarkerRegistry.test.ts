import { describe, it, expect, vi } from 'vitest';
import {
  MARKER_DEFS,
  MarkerRegistry,
  type ARControllerLike,
} from '@/ar/MarkerRegistry';

describe('MARKER_DEFS', () => {
  it('has exactly 24 entries', () => {
    expect(MARKER_DEFS.length).toBe(24);
  });

  it('all names are unique', () => {
    const names = MARKER_DEFS.map((d) => d.name);
    expect(new Set(names).size).toBe(24);
  });

  it('all pattern file paths are unique', () => {
    const files = MARKER_DEFS.map((d) => d.patternFile);
    expect(new Set(files).size).toBe(24);
  });

  it('all pattern files follow the patterns/*.patt naming convention', () => {
    for (const def of MARKER_DEFS) {
      expect(def.patternFile).toMatch(/^patterns\/[a-zA-Z0-9_]+\.patt$/);
    }
  });

  it('transport marker width is 62mm', () => {
    const def = MARKER_DEFS.find((d) => d.name === 'transport')!;
    expect(def.width).toBe(62.0);
  });

  it('platform marker width is 81mm', () => {
    const def = MARKER_DEFS.find((d) => d.name === 'platform')!;
    expect(def.width).toBe(81.0);
  });

  it('all cube markers are 60mm', () => {
    const cubes = MARKER_DEFS.filter((d) => d.category === 'cube');
    expect(cubes.length).toBe(6);
    for (const c of cubes) expect(c.width).toBe(60.0);
  });

  it('all element markers are 76mm', () => {
    const elements = MARKER_DEFS.filter((d) => d.category === 'element');
    expect(elements.length).toBe(11);
    for (const e of elements) expect(e.width).toBe(76.0);
  });

  it('control markers other than transport/platform are 66mm', () => {
    const controls = MARKER_DEFS.filter(
      (d) => d.category === 'control' && d.name !== 'transport' && d.name !== 'platform',
    );
    for (const c of controls) expect(c.width).toBe(66.0);
  });

  it('includes all 11 expected element markers', () => {
    const expectedSymbols = ['C', 'H', 'O', 'N', 'Br', 'Cl', 'F', 'K', 'Li', 'Mg', 'Na'];
    for (const sym of expectedSymbols) {
      const def = MARKER_DEFS.find((d) => d.name === `element_${sym}`);
      expect(def, `element_${sym} missing`).toBeDefined();
      expect(def!.category).toBe('element');
    }
  });

  it('includes all 6 cube face markers', () => {
    for (let i = 1; i <= 6; i++) {
      const def = MARKER_DEFS.find((d) => d.name === `cubeM_${i}`);
      expect(def, `cubeM_${i} missing`).toBeDefined();
      expect(def!.category).toBe('cube');
    }
  });

  it('all widths are positive numbers', () => {
    for (const def of MARKER_DEFS) {
      expect(def.width).toBeGreaterThan(0);
    }
  });
});

describe('MarkerRegistry', () => {
  function makeMockController(): ARControllerLike {
    let nextId = 0;
    return {
      loadMarker: vi.fn(async (_url: string) => nextId++),
    };
  }

  it('loadAll assigns a unique runtime ID to each marker', async () => {
    const registry = new MarkerRegistry();
    await registry.loadAll(makeMockController());
    expect(registry.isLoaded).toBe(true);
    const ids = MARKER_DEFS.map((d) => registry.getRuntimeId(d.name));
    expect(new Set(ids).size).toBe(24);
  });

  it('getRuntimeId returns undefined for unknown name', async () => {
    const registry = new MarkerRegistry();
    await registry.loadAll(makeMockController());
    expect(registry.getRuntimeId('nonexistent')).toBeUndefined();
  });

  it('getName returns the correct name for a known runtime ID', async () => {
    const registry = new MarkerRegistry();
    await registry.loadAll(makeMockController());
    const id = registry.getRuntimeId('platform')!;
    expect(registry.getName(id)).toBe('platform');
  });

  it('getName returns undefined for an unknown ID', async () => {
    const registry = new MarkerRegistry();
    await registry.loadAll(makeMockController());
    expect(registry.getName(9999)).toBeUndefined();
  });

  it('getDef returns the correct MarkerDef', async () => {
    const registry = new MarkerRegistry();
    await registry.loadAll(makeMockController());
    const def = registry.getDef('platform');
    expect(def?.width).toBe(81.0);
    expect(def?.category).toBe('control');
    expect(def?.patternFile).toBe('patterns/platform.patt');
  });

  it('getDef returns undefined for unknown name', async () => {
    const registry = new MarkerRegistry();
    expect(registry.getDef('no_such_marker')).toBeUndefined();
  });

  it('isLoaded is false before loadAll', () => {
    const registry = new MarkerRegistry();
    expect(registry.isLoaded).toBe(false);
  });

  it('loadAll passes the correct URL to the controller', async () => {
    const controller = makeMockController();
    const registry = new MarkerRegistry();
    await registry.loadAll(controller);
    expect(controller.loadMarker).toHaveBeenCalledWith('/patterns/platform.patt');
    expect(controller.loadMarker).toHaveBeenCalledWith('/patterns/element_C.patt');
    expect(controller.loadMarker).toHaveBeenCalledTimes(24);
  });

  it('round-trip: getName(getRuntimeId(name)) === name for all markers', async () => {
    const registry = new MarkerRegistry();
    await registry.loadAll(makeMockController());
    for (const def of MARKER_DEFS) {
      const id = registry.getRuntimeId(def.name)!;
      expect(registry.getName(id)).toBe(def.name);
    }
  });
});
