/**
 * Transport — the "grabber" AR marker that picks up element markers.
 * Ports aco_transport.c.
 *
 * Single instance using the 'transport' marker. Each frame it finds the
 * nearest visible ElementMarker:
 *   - within GRAB_DISTANCE → sticky grab (grabbedElement)
 *   - beyond GRAB_DISTANCE → flirt (arrow points toward it)
 *
 * Sticky grab: once grabbed, an element stays grabbed until the transport
 * moves within GRAB_DISTANCE of a different element.
 */

import * as THREE from 'three';
import type { MarkerState } from '@/ar/MarkerState';
import type { ElementMarker } from './ElementMarker';

const GRAB_DISTANCE = 140.0; // aco_transport.c:256

export class Transport {
  visible = false;
  readonly matrix = new THREE.Matrix4();

  /** Currently grabbed element (sticky — does not release on distance increase). */
  grabbedElement: ElementMarker | null = null;
  /** Nearest visible element beyond GRAB_DISTANCE (changes every frame). */
  flirt: ElementMarker | null = null;
  distanceToFlirt = 0;

  /**
   * aco_transport_03refreshState — call once per frame.
   * @param browseMode When true, grab/flirt logic is skipped (browse mode active).
   */
  refreshState(
    markerState: MarkerState,
    elements: ElementMarker[],
    browseMode = false,
  ): void {
    const pose = markerState.getPose('transport');

    if (!pose?.visible) {
      this.visible = false;
      return;
    }

    this.visible = true;
    this.matrix.copy(pose.matrix);

    if (browseMode) {
      this.flirt = null;
      return;
    }

    // Extract transport world position from matrix (column-major [12,13,14])
    const me = this.matrix.elements;
    const tx = me[12], ty = me[13], tz = me[14];

    // Find nearest visible element, skipping the already-grabbed one
    let minDist = Infinity;
    let minElement: ElementMarker | null = null;

    for (const el of elements) {
      if (!el.visible) continue;
      if (el === this.grabbedElement) continue;

      const ep = el.getPosition();
      const dx = tx - ep.x, dy = ty - ep.y, dz = tz - ep.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist < minDist) {
        minDist = dist;
        minElement = el;
      }
    }

    // Reset flirt each frame (not sticky)
    this.flirt = null;

    if (minElement !== null) {
      if (minDist < GRAB_DISTANCE) {
        // Grab — sticky until a different element is closer
        this.grabbedElement = minElement;
      } else {
        // Flirt — too far to grab
        this.flirt = minElement;
        this.distanceToFlirt = minDist;
      }
    }
  }

  /** Transport world position extracted from the pose matrix. */
  getPosition(): THREE.Vector3 {
    const e = this.matrix.elements;
    return new THREE.Vector3(e[12], e[13], e[14]);
  }
}
