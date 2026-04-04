import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MarkerState } from '@/ar/MarkerState';
import { ElementMarker } from '@/objects/ElementMarker';
import { Transport } from '@/objects/Transport';
import { ELEMENTS_BY_SYMBOL } from '@/chemistry/Element';

const carbon = ELEMENTS_BY_SYMBOL.get('C')!;
const hydrogen = ELEMENTS_BY_SYMBOL.get('H')!;
const mat = new THREE.MeshPhongMaterial();

const ALL_NAMES = ['transport', 'element_C', 'element_H'];

/** Build a MarkerState with transport at (tx,ty,tz) and named elements at their positions. */
function makeState(
  transportPos: [number, number, number] | null,
  elementPositions: Record<string, [number, number, number]> = {},
): MarkerState {
  const state = new MarkerState();
  state.init(ALL_NAMES);

  function addMarker(name: string, pos: [number, number, number]) {
    const arr = new Float64Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      pos[0], pos[1], pos[2], 1,
    ]);
    state.updateMarker(name, 1.0, arr, 0);
  }

  if (transportPos) addMarker('transport', transportPos);
  for (const [name, pos] of Object.entries(elementPositions)) {
    addMarker(name, pos);
  }

  return state;
}

/** Build an ElementMarker at a fixed position by running 10 refreshState frames. */
function buildVisibleElement(
  name: string,
  pos: [number, number, number],
  element = carbon,
): ElementMarker {
  const em = new ElementMarker(name, element, mat);
  const state = makeState(null, { [name]: pos });
  for (let i = 0; i < 10; i++) em.refreshState(state);
  return em;
}

describe('Transport', () => {
  it('not visible when transport marker not detected', () => {
    const t = new Transport();
    t.refreshState(makeState(null), []);
    expect(t.visible).toBe(false);
  });

  it('becomes visible when transport marker detected', () => {
    const t = new Transport();
    t.refreshState(makeState([0, 0, 0]), []);
    expect(t.visible).toBe(true);
  });

  it('grabs nearest visible element within 140.0', () => {
    const t = new Transport();
    const em = buildVisibleElement('element_C', [100, 0, 0]);
    t.refreshState(makeState([0, 0, 0]), [em]);
    expect(t.grabbedElement).toBe(em);
    expect(t.flirt).toBeNull();
  });

  it('sets flirt (not grab) when nearest element is beyond 140.0', () => {
    const t = new Transport();
    const em = buildVisibleElement('element_C', [200, 0, 0]);
    t.refreshState(makeState([0, 0, 0]), [em]);
    expect(t.grabbedElement).toBeNull();
    expect(t.flirt).toBe(em);
    expect(t.distanceToFlirt).toBeCloseTo(200);
  });

  it('sticky: keeps grabbed element when transport moves away', () => {
    const t = new Transport();
    const em = buildVisibleElement('element_C', [100, 0, 0]);

    // First grab it
    t.refreshState(makeState([0, 0, 0]), [em]);
    expect(t.grabbedElement).toBe(em);

    // Now transport moves far away — grabbedElement stays (sticky)
    t.refreshState(makeState([500, 0, 0]), [em]);
    expect(t.grabbedElement).toBe(em);
  });

  it('new grab replaces old when a different element is closer within 140', () => {
    const t = new Transport();
    const emC = buildVisibleElement('element_C', [100, 0, 0]);
    const emH = buildVisibleElement('element_H', [50, 0, 0], hydrogen);

    // Grab C first (only C visible)
    t.refreshState(makeState([0, 0, 0]), [emC]);
    expect(t.grabbedElement).toBe(emC);

    // Now H is also visible and closer — should grab H
    t.refreshState(makeState([0, 0, 0]), [emC, emH]);
    expect(t.grabbedElement).toBe(emH);
  });

  it('skips already-grabbed element in distance scan', () => {
    const t = new Transport();
    const emC = buildVisibleElement('element_C', [50, 0, 0]);
    const emH = buildVisibleElement('element_H', [200, 0, 0], hydrogen);

    // Grab C (closest)
    t.refreshState(makeState([0, 0, 0]), [emC, emH]);
    expect(t.grabbedElement).toBe(emC);

    // Move transport so C is still nearby but now we scan for others.
    // H is beyond grab distance — should appear as flirt, not a new grab
    // C should be skipped (already grabbed)
    t.refreshState(makeState([0, 0, 0]), [emC, emH]);
    expect(t.grabbedElement).toBe(emC); // C stays grabbed (skipped in scan)
    expect(t.flirt).toBe(emH);           // H becomes flirt
  });

  it('no grab and no flirt when no visible elements', () => {
    const t = new Transport();
    t.refreshState(makeState([0, 0, 0]), []);
    expect(t.grabbedElement).toBeNull();
    expect(t.flirt).toBeNull();
  });

  it('invisible elements are skipped', () => {
    const t = new Transport();
    // Create element but never make it visible (0 frames)
    const em = new ElementMarker('element_C', carbon, mat);
    t.refreshState(makeState([0, 0, 0]), [em]);
    expect(t.grabbedElement).toBeNull();
    expect(t.flirt).toBeNull();
  });

  it('flirt is reset each frame (not sticky)', () => {
    const t = new Transport();
    const em = buildVisibleElement('element_C', [200, 0, 0]);

    t.refreshState(makeState([0, 0, 0]), [em]);
    expect(t.flirt).toBe(em);

    // Element disappears
    t.refreshState(makeState([0, 0, 0]), []);
    expect(t.flirt).toBeNull();
  });

  it('browse mode suppresses grab/flirt logic', () => {
    const t = new Transport();
    const em = buildVisibleElement('element_C', [50, 0, 0]);
    t.refreshState(makeState([0, 0, 0]), [em], true /* browseMode */);
    expect(t.visible).toBe(true);
    expect(t.grabbedElement).toBeNull();
    expect(t.flirt).toBeNull();
  });
});
