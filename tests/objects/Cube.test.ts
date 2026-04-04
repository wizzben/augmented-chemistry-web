import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MarkerState } from '@/ar/MarkerState';
import { Cube, AC_CUBE_TRANSFORM } from '@/objects/Cube';

const CUBE_NAMES = ['cubeM_1','cubeM_2','cubeM_3','cubeM_4','cubeM_5','cubeM_6'];

/** Make a MarkerState with some cube faces visible. */
function makeState(
  visibleFaces: number[],
  posePerFace: Partial<Record<number, THREE.Matrix4>> = {},
): MarkerState {
  const state = new MarkerState();
  state.init(CUBE_NAMES);
  for (const fi of visibleFaces) {
    const mat = posePerFace[fi] ?? new THREE.Matrix4();
    const arr = new Float64Array(mat.elements);
    state.updateMarker(CUBE_NAMES[fi], 1.0, arr, 0);
  }
  return state;
}

/** Identity matrix with given translation. */
function identityAt(tx: number, ty: number, tz: number): THREE.Matrix4 {
  return new THREE.Matrix4().setPosition(tx, ty, tz);
}

describe('AC_CUBE_TRANSFORM', () => {
  it('face 0 matches aco_cube.c row 0', () => {
    const e = AC_CUBE_TRANSFORM[0].elements;
    // Column-major: [1,0,0,0, 0,0,-1,0, 0,1,0,0, 0,0,0,1]
    expect(e[0]).toBeCloseTo(1);  expect(e[1]).toBeCloseTo(0);
    expect(e[2]).toBeCloseTo(0);  expect(e[3]).toBeCloseTo(0);
    expect(e[4]).toBeCloseTo(0);  expect(e[5]).toBeCloseTo(0);
    expect(e[6]).toBeCloseTo(-1); expect(e[7]).toBeCloseTo(0);
    expect(e[8]).toBeCloseTo(0);  expect(e[9]).toBeCloseTo(1);
    expect(e[10]).toBeCloseTo(0); expect(e[11]).toBeCloseTo(0);
    expect(e[12]).toBeCloseTo(0); expect(e[13]).toBeCloseTo(0);
    expect(e[14]).toBeCloseTo(0); expect(e[15]).toBeCloseTo(1);
  });

  it('face 4 is identity rotation (top face)', () => {
    const e = AC_CUBE_TRANSFORM[4].elements;
    // [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]
    expect(e[0]).toBeCloseTo(1); expect(e[5]).toBeCloseTo(1); expect(e[10]).toBeCloseTo(1);
    expect(e[12]).toBeCloseTo(0); expect(e[13]).toBeCloseTo(0); expect(e[14]).toBeCloseTo(0);
  });

  it('face 5 matches aco_cube.c row 5', () => {
    const e = AC_CUBE_TRANSFORM[5].elements;
    // [1,0,0,0, 0,-1,0,0, 0,0,-1,0, 0,0,0,1]
    expect(e[0]).toBeCloseTo(1);  expect(e[5]).toBeCloseTo(-1); expect(e[10]).toBeCloseTo(-1);
  });

  it('has 6 entries', () => {
    expect(AC_CUBE_TRANSFORM).toHaveLength(6);
  });
});

describe('Cube', () => {
  it('starts not visible, posIsValid=0', () => {
    const cube = new Cube();
    expect(cube.visible).toBe(false);
    expect(cube.posIsValid).toBe(0);
  });

  it('stays not visible when no faces detected', () => {
    const cube = new Cube();
    cube.refreshState(makeState([]));
    expect(cube.visible).toBe(false);
  });

  it('decrements posIsValid when not visible (stops at 0)', () => {
    const cube = new Cube();
    // Make visible first to set posIsValid=5
    cube.refreshState(makeState([0], { 0: identityAt(1, 2, 3) }));
    expect(cube.posIsValid).toBe(5);

    cube.refreshState(makeState([]));
    expect(cube.posIsValid).toBe(4);
    cube.refreshState(makeState([]));
    expect(cube.posIsValid).toBe(3);

    // Run down to 0, then stays at 0
    for (let i = 0; i < 10; i++) cube.refreshState(makeState([]));
    expect(cube.posIsValid).toBe(0);
  });

  it('becomes visible when a face is detected; sets posIsValid=5', () => {
    const cube = new Cube();
    cube.refreshState(makeState([2], { 2: identityAt(5, 6, 7) }));
    expect(cube.visible).toBe(true);
    expect(cube.posIsValid).toBe(5);
  });

  it('single face visible → selected as master; position extracted from raw matrix', () => {
    const cube = new Cube();
    cube.refreshState(makeState([3], { 3: identityAt(10, 20, 30) }));
    expect(cube.position.x).toBeCloseTo(10);
    expect(cube.position.y).toBeCloseTo(20);
    expect(cube.position.z).toBeCloseTo(30);
  });

  it('SLERP: orientation changes gradually between frames (not instant jump)', () => {
    const cube = new Cube();

    // Start with face 0 at identity rotation
    cube.refreshState(makeState([0], { 0: new THREE.Matrix4() }));
    const q0 = cube.rotation.clone();

    // Now feed face 4 (identity transform) — after one SLERP step the quaternion
    // should move from q0 toward the new orientation but not fully arrive
    const rotated = new THREE.Matrix4().makeRotationY(Math.PI / 2);
    cube.refreshState(makeState([0], { 0: rotated }));
    const q1 = cube.rotation.clone();

    // q1 should differ from q0 but not equal the fully-rotated target
    const fullTarget = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().copy(AC_CUBE_TRANSFORM[0]).multiply(rotated),
    );
    expect(q1.angleTo(q0)).toBeGreaterThan(0.001);
    expect(q1.angleTo(fullTarget)).toBeGreaterThan(0.001);
  });

  it('with multiple visible faces, still selects one master (no crash)', () => {
    const cube = new Cube();
    // Provide positions so the angle formula doesn't divide by zero
    const p0 = identityAt(0, 0, 100);
    const p1 = identityAt(0, 0, 100);
    cube.refreshState(makeState([0, 1], { 0: p0, 1: p1 }));
    expect(cube.visible).toBe(true);
  });
});
