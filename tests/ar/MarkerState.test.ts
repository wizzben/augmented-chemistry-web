import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MarkerState } from '@/ar/MarkerState';
import { MARKER_DEFS } from '@/ar/MarkerRegistry';

const ALL_NAMES = MARKER_DEFS.map((d) => d.name);

describe('MarkerState', () => {
  it('size is 0 before init', () => {
    const state = new MarkerState();
    expect(state.size).toBe(0);
  });

  it('init registers all provided names', () => {
    const state = new MarkerState();
    state.init(ALL_NAMES);
    expect(state.size).toBe(24);
  });

  it('all markers are not visible after init', () => {
    const state = new MarkerState();
    state.init(ALL_NAMES);
    for (const name of ALL_NAMES) {
      expect(state.isVisible(name)).toBe(false);
    }
  });

  it('getPose returns an entry for each registered name', () => {
    const state = new MarkerState();
    state.init(ALL_NAMES);
    for (const name of ALL_NAMES) {
      expect(state.getPose(name)).toBeDefined();
    }
  });

  it('getPose returns undefined for unregistered names', () => {
    const state = new MarkerState();
    state.init(ALL_NAMES);
    expect(state.getPose('not_a_real_marker')).toBeUndefined();
  });

  it('getMatrix returns null when marker is not visible', () => {
    const state = new MarkerState();
    state.init(ALL_NAMES);
    expect(state.getMatrix('platform')).toBeNull();
  });

  it('beginFrame resets all markers to not visible', () => {
    const state = new MarkerState();
    state.init(ALL_NAMES);
    // Mark some as visible
    const identity = new Float64Array(16);
    identity[0] = identity[5] = identity[10] = identity[15] = 1;
    state.updateMarker('platform', 0.9, identity, 1);
    state.updateMarker('element_C', 0.8, identity, 1);
    expect(state.isVisible('platform')).toBe(true);
    // Now reset
    state.beginFrame();
    expect(state.isVisible('platform')).toBe(false);
    expect(state.isVisible('element_C')).toBe(false);
  });

  it('updateMarker sets visible=true and stores confidence', () => {
    const state = new MarkerState();
    state.init(['platform']);
    const identity = new Float64Array(16);
    identity[0] = identity[5] = identity[10] = identity[15] = 1;
    state.updateMarker('platform', 0.95, identity, 42);
    const pose = state.getPose('platform')!;
    expect(pose.visible).toBe(true);
    expect(pose.confidence).toBe(0.95);
    expect(pose.lastSeenFrame).toBe(42);
  });

  it('updateMarker stores the matrix correctly via THREE.Matrix4.fromArray', () => {
    const state = new MarkerState();
    state.init(['platform']);
    // A translation matrix: x=1, y=2, z=3 in column-major layout
    const glMat = new Float64Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      1, 2, 3, 1,
    ]);
    state.updateMarker('platform', 1.0, glMat, 1);
    const m = state.getMatrix('platform')!;
    expect(m).toBeInstanceOf(THREE.Matrix4);
    // THREE.Matrix4.fromArray is column-major, so elements[12,13,14] = tx,ty,tz
    expect(m.elements[12]).toBeCloseTo(1);
    expect(m.elements[13]).toBeCloseTo(2);
    expect(m.elements[14]).toBeCloseTo(3);
  });

  it('getMatrix returns the matrix object when visible', () => {
    const state = new MarkerState();
    state.init(['platform']);
    const identity = new Float64Array(16);
    identity[0] = identity[5] = identity[10] = identity[15] = 1;
    state.updateMarker('platform', 0.9, identity, 1);
    expect(state.getMatrix('platform')).toBeInstanceOf(THREE.Matrix4);
  });

  it('getMatrix returns null after beginFrame', () => {
    const state = new MarkerState();
    state.init(['platform']);
    const identity = new Float64Array(16);
    identity[0] = identity[5] = identity[10] = identity[15] = 1;
    state.updateMarker('platform', 0.9, identity, 1);
    state.beginFrame();
    expect(state.getMatrix('platform')).toBeNull();
  });

  it('forEachVisible only iterates visible markers', () => {
    const state = new MarkerState();
    state.init(ALL_NAMES);
    const identity = new Float64Array(16);
    identity[0] = identity[5] = identity[10] = identity[15] = 1;
    state.updateMarker('platform', 0.9, identity, 1);
    state.updateMarker('element_C', 0.7, identity, 1);

    const seen: string[] = [];
    state.forEachVisible((name) => seen.push(name));
    expect(seen).toHaveLength(2);
    expect(seen).toContain('platform');
    expect(seen).toContain('element_C');
  });

  it('forEachVisible passes the pose to the callback', () => {
    const state = new MarkerState();
    state.init(['platform']);
    const identity = new Float64Array(16);
    identity[0] = identity[5] = identity[10] = identity[15] = 1;
    state.updateMarker('platform', 0.85, identity, 5);

    state.forEachVisible((_name, pose) => {
      expect(pose.visible).toBe(true);
      expect(pose.confidence).toBe(0.85);
      expect(pose.lastSeenFrame).toBe(5);
    });
  });

  it('visibleCount reflects the number of visible markers', () => {
    const state = new MarkerState();
    state.init(ALL_NAMES);
    expect(state.visibleCount).toBe(0);
    const identity = new Float64Array(16);
    identity[0] = identity[5] = identity[10] = identity[15] = 1;
    state.updateMarker('platform', 0.9, identity, 1);
    state.updateMarker('cubeM_1', 0.8, identity, 1);
    state.updateMarker('element_H', 0.7, identity, 1);
    expect(state.visibleCount).toBe(3);
    state.beginFrame();
    expect(state.visibleCount).toBe(0);
  });

  it('updateMarker on unregistered name is a no-op', () => {
    const state = new MarkerState();
    state.init(['platform']);
    const identity = new Float64Array(16);
    identity[0] = identity[5] = identity[10] = identity[15] = 1;
    // Should not throw
    expect(() => state.updateMarker('ghost_marker', 0.9, identity, 1)).not.toThrow();
    expect(state.visibleCount).toBe(0);
  });
});
