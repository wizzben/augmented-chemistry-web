/**
 * Cube — tracks the physical AR cube (6 face markers).
 * Ports aco_cube.c.
 *
 * Selects the best visible face each frame, applies the face-to-cube
 * coordinate transform, and SLERP-smooths the resulting orientation.
 * Exposes `matrix` and `rotation` for Platform to orient the molecule.
 *
 * The Cube renders no mesh — the physical cube is visible to the user.
 */

import * as THREE from 'three';
import type { MarkerState } from '@/ar/MarkerState';

// AC_CUBE_TRANSFORM[6][16] — column-major rotation matrices, one per face.
// Ported verbatim from aco_cube.c:61-68.
const AC_CUBE_TRANSFORM: readonly THREE.Matrix4[] = [
  new THREE.Matrix4().fromArray([ 1, 0, 0, 0,  0, 0,-1, 0,  0, 1, 0, 0,  0, 0, 0, 1]),
  new THREE.Matrix4().fromArray([ 0, 0, 1, 0,  1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 0, 1]),
  new THREE.Matrix4().fromArray([-1, 0, 0, 0,  0, 0, 1, 0,  0, 1, 0, 0,  0, 0, 0, 1]),
  new THREE.Matrix4().fromArray([ 0, 0,-1, 0, -1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 0, 1]),
  new THREE.Matrix4().fromArray([ 1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0, 0, 0, 1]),
  new THREE.Matrix4().fromArray([ 1, 0, 0, 0,  0,-1, 0, 0,  0, 0,-1, 0,  0, 0, 0, 1]),
];

export { AC_CUBE_TRANSFORM };

const SLERP_FRICTION = 0.4;   // aco_cube.c:118
const RAD_45 = Math.PI / 4;   // aco_cube.c:58

/** Logical names for the six cube face markers, face index 0–5. */
const CUBE_MARKER_NAMES = [
  'cubeM_1', 'cubeM_2', 'cubeM_3',
  'cubeM_4', 'cubeM_5', 'cubeM_6',
];

export class Cube {
  visible = false;
  /**
   * Countdown from 5 to 0 after the cube disappears; lets dependents
   * keep using the last known position for a few frames.
   */
  posIsValid = 0;

  /** Smoothed position (translation only, from the master face). */
  readonly position = new THREE.Vector3();
  /** SLERP-smoothed rotation quaternion. */
  readonly rotation = new THREE.Quaternion();
  /**
   * Combined matrix: rotation (smoothed) + position.
   * Used by Platform to orient the molecule.
   */
  readonly matrix = new THREE.Matrix4();

  private readonly _newestQuat = new THREE.Quaternion();

  /** aco_cube_03refreshState — call once per frame. */
  refreshState(markerState: MarkerState): void {
    // Collect visible face indices (aco_cube.c:192-207)
    const visibleFaces: number[] = [];
    for (let i = 0; i < 6; i++) {
      if (markerState.isVisible(CUBE_MARKER_NAMES[i])) {
        visibleFaces.push(i);
      }
    }

    if (visibleFaces.length === 0) {
      this.visible = false;
      if (this.posIsValid > 0) this.posIsValid--;
      return;
    }

    this.visible = true;
    this.posIsValid = 5;

    // Master face selection (aco_cube.c:212-234)
    let masterFace: number;
    if (visibleFaces.length === 1) {
      masterFace = visibleFaces[0];
    } else {
      // For each visible face: compute angle between camera Z-axis and position
      // vector. Port of: angle = acos(dot([-m[8],-m[9],-m[10]], pos) / |pos|)
      let bestFace = visibleFaces[0];
      let bestAngle = Infinity;
      for (const fi of visibleFaces) {
        const pose = markerState.getPose(CUBE_MARKER_NAMES[fi])!;
        const m = pose.matrix.elements;
        const dot = -m[8] * m[12] + -m[9] * m[13] + -m[10] * m[14];
        const len = Math.sqrt(m[12] * m[12] + m[13] * m[13] + m[14] * m[14]);
        const angle = Math.acos(dot / len);
        if (angle - RAD_45 < bestAngle - RAD_45) {
          bestFace = fi;
          bestAngle = angle;
        }
      }
      masterFace = bestFace;
    }

    // Compute orientation (aco_cube.c:237-242)
    const masterPose = markerState.getPose(CUBE_MARKER_NAMES[masterFace])!;
    const me = masterPose.matrix.elements;

    // Extract position from raw marker matrix before applying cube transform
    this.position.set(me[12], me[13], me[14]);

    // newestMatrix = AC_CUBE_TRANSFORM[masterFace] * masterPose.matrix
    const newestMatrix = new THREE.Matrix4()
      .copy(AC_CUBE_TRANSFORM[masterFace])
      .multiply(masterPose.matrix);

    // Zero the translation — rotation only
    newestMatrix.elements[12] = 0;
    newestMatrix.elements[13] = 0;
    newestMatrix.elements[14] = 0;

    // SLERP smoothing (aco_cube.c:244-256)
    this._newestQuat.setFromRotationMatrix(newestMatrix);
    this.rotation.slerp(this._newestQuat, SLERP_FRICTION);

    // Compose final matrix from smoothed rotation + position
    this.matrix.compose(this.position, this.rotation, _UNIT_SCALE);
  }
}

const _UNIT_SCALE = new THREE.Vector3(1, 1, 1);
