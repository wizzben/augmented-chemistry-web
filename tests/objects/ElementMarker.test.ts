import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MarkerState } from '@/ar/MarkerState';
import { ElementMarker } from '@/objects/ElementMarker';
import { ELEMENTS_BY_SYMBOL } from '@/chemistry/Element';

const MARKER_NAME = 'element_C';
const carbon = ELEMENTS_BY_SYMBOL.get('C')!;
const material = new THREE.MeshPhongMaterial();

/** Build a MarkerState with a single marker, optionally visible at a given pose. */
function makeState(visible: boolean, tx = 0, ty = 0, tz = 0): MarkerState {
  const state = new MarkerState();
  state.init([MARKER_NAME]);
  if (visible) {
    // Column-major identity with translation (tx,ty,tz)
    const arr = new Float64Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      tx, ty, tz, 1,
    ]);
    state.updateMarker(MARKER_NAME, 1.0, arr, 0);
  }
  return state;
}

describe('ElementMarker', () => {
  it('starts not visible', () => {
    const em = new ElementMarker(MARKER_NAME, carbon, material);
    expect(em.visible).toBe(false);
    expect(em.mesh.visible).toBe(false);
  });

  it('not visible after fewer than 10 consecutive detected frames', () => {
    const em = new ElementMarker(MARKER_NAME, carbon, material);
    const state = makeState(true);
    for (let i = 0; i < 9; i++) em.refreshState(state);
    expect(em.visible).toBe(false);
  });

  it('becomes visible after 10 consecutive detected frames', () => {
    const em = new ElementMarker(MARKER_NAME, carbon, material);
    const state = makeState(true);
    for (let i = 0; i < 10; i++) em.refreshState(state);
    expect(em.visible).toBe(true);
    expect(em.mesh.visible).toBe(true);
  });

  it('returns to not-visible immediately when marker disappears', () => {
    const em = new ElementMarker(MARKER_NAME, carbon, material);
    const onState = makeState(true);
    for (let i = 0; i < 10; i++) em.refreshState(onState);
    expect(em.visible).toBe(true);

    const offState = makeState(false);
    em.refreshState(offState);
    expect(em.visible).toBe(false);
    expect(em.mesh.visible).toBe(false);
  });

  it('re-acquires visibility after reappearing (fuzzy resets on disappear)', () => {
    const em = new ElementMarker(MARKER_NAME, carbon, material);
    const onState = makeState(true);
    for (let i = 0; i < 10; i++) em.refreshState(onState);
    em.refreshState(makeState(false));
    // Must accumulate 10 more frames
    for (let i = 0; i < 9; i++) em.refreshState(onState);
    expect(em.visible).toBe(false);
    em.refreshState(onState);
    expect(em.visible).toBe(true);
  });

  it('getPosition() returns correct translation from marker matrix', () => {
    const em = new ElementMarker(MARKER_NAME, carbon, material);
    const state = makeState(true, 10, 20, 30);
    for (let i = 0; i < 10; i++) em.refreshState(state);

    const pos = em.getPosition();
    expect(pos.x).toBeCloseTo(10);
    expect(pos.y).toBeCloseTo(20);
    expect(pos.z).toBeCloseTo(30);
  });

  it('handles missing marker name gracefully (no crash)', () => {
    const em = new ElementMarker('element_C', carbon, material);
    const state = new MarkerState();
    state.init(['element_H']); // element_C not registered
    expect(() => em.refreshState(state)).not.toThrow();
    expect(em.visible).toBe(false);
  });
});
