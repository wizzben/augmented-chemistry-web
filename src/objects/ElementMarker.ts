/**
 * ElementMarker — one instance per element AR marker (11 total).
 * Ports aco_element.c.
 *
 * Tracks visibility via FuzzyBoolean (requires 10 consecutive detected frames).
 * Owns a Three.js sphere mesh positioned at the marker in world space.
 */

import * as THREE from 'three';
import type { Element } from '@/chemistry/Element';
import type { MarkerState } from '@/ar/MarkerState';
import { FuzzyBoolean } from './FuzzyBoolean';

export class ElementMarker {
  readonly markerName: string;
  readonly element: Element;
  readonly mesh: THREE.Mesh;

  private fuzzy = new FuzzyBoolean(false);
  visible = false;
  /** Current marker pose in Three.js world space (meaningful only when visible). */
  readonly matrix = new THREE.Matrix4();

  constructor(markerName: string, element: Element, material: THREE.Material) {
    this.markerName = markerName;
    this.element = element;

    const geometry = new THREE.SphereGeometry(element.radius * 30, 16, 12);
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.matrixAutoUpdate = false;
    this.mesh.visible = false;
  }

  /** aco_element_03refreshState — call once per frame. */
  refreshState(markerState: MarkerState): void {
    const pose = markerState.getPose(this.markerName);

    if (!pose?.visible) {
      this.fuzzy.reset();
      this.visible = false;
      this.mesh.visible = false;
      return;
    }

    this.fuzzy.update(true);
    if (this.fuzzy.value) {
      this.visible = true;
      this.matrix.copy(pose.matrix);
      this.mesh.matrix.copy(this.matrix);
      this.mesh.visible = true;
    }
  }

  /** Extract translation from the current pose matrix. */
  getPosition(): THREE.Vector3 {
    const e = this.matrix.elements;
    return new THREE.Vector3(e[12], e[13], e[14]);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
  }
}
