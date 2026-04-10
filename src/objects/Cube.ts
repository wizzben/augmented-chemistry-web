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
const DRAG_THRESHOLD_PX = 5;
const MOUSE_SENSITIVITY = 0.005; // radians per pixel

const _AXIS_X = new THREE.Vector3(1, 0, 0);
const _AXIS_Y = new THREE.Vector3(0, 1, 0);

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

  // ── Mouse fallback rotation (Step 7b) ─────────────────────────────────────
  private _canvas: HTMLCanvasElement | null = null;
  private _dragging = false;
  private _dragMoved = false;
  private _dragStartX = 0;
  private _dragStartY = 0;
  private readonly _mouseTargetQuat = new THREE.Quaternion();

  enableMouseFallback(canvas: HTMLCanvasElement): void {
    this._canvas = canvas;
    this._mouseTargetQuat.copy(this.rotation);
    canvas.addEventListener('mousedown', this._onMouseDown);
    canvas.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('mouseup', this._onMouseUp);
  }

  disableMouseFallback(): void {
    if (!this._canvas) return;
    this._canvas.removeEventListener('mousedown', this._onMouseDown);
    this._canvas.removeEventListener('mousemove', this._onMouseMove);
    this._canvas.removeEventListener('mouseup', this._onMouseUp);
    this._canvas = null;
    this._dragging = false;
  }

  private readonly _onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return;
    this._dragging = true;
    this._dragMoved = false;
    this._dragStartX = e.clientX;
    this._dragStartY = e.clientY;
  };

  private readonly _onMouseMove = (e: MouseEvent): void => {
    if (!this._dragging || this.visible) return; // only when no physical cube
    const dx = e.clientX - this._dragStartX;
    const dy = e.clientY - this._dragStartY;
    if (!this._dragMoved) {
      if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD_PX) return;
      this._dragMoved = true;
    }
    const qY = new THREE.Quaternion().setFromAxisAngle(_AXIS_Y, dx * MOUSE_SENSITIVITY);
    const qX = new THREE.Quaternion().setFromAxisAngle(_AXIS_X, dy * MOUSE_SENSITIVITY);
    this._mouseTargetQuat.premultiply(qY).multiply(qX).normalize();
    this._dragStartX = e.clientX;
    this._dragStartY = e.clientY;
  };

  private readonly _onMouseUp = (): void => {
    this._dragging = false;
  };

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
      // Apply mouse-driven rotation when no physical cube is detected
      this.rotation.slerp(this._mouseTargetQuat, SLERP_FRICTION);
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

    // newestMatrix = masterPose.matrix * AC_CUBE_TRANSFORM[masterFace]
    // The original C code's achlp_matrix44_02multiply(A,B,R) computes R=B*A
    // in column-major, so the pose is pre-multiplied by the cube correction.
    const newestMatrix = new THREE.Matrix4()
      .copy(masterPose.matrix)
      .multiply(AC_CUBE_TRANSFORM[masterFace]);

    // Zero the translation — rotation only
    newestMatrix.elements[12] = 0;
    newestMatrix.elements[13] = 0;
    newestMatrix.elements[14] = 0;

    // SLERP smoothing (aco_cube.c:244-256)
    this._newestQuat.setFromRotationMatrix(newestMatrix);
    this.rotation.slerp(this._newestQuat, SLERP_FRICTION);
    // Keep mouse target in sync so fallback starts from current physical orientation
    this._mouseTargetQuat.copy(this.rotation);

    // Compose final matrix from smoothed rotation + position
    this.matrix.compose(this.position, this.rotation, _UNIT_SCALE);
  }
}

const _UNIT_SCALE = new THREE.Vector3(1, 1, 1);
