/**
 * MarkerState — per-frame snapshot of AR marker visibility and poses.
 *
 * ArManager writes to this every frame via beginFrame() + updateMarker().
 * Phase 5 AR objects (Platform, Cube, ElementMarker, Transport) read from it.
 *
 * The 4×4 pose matrices stored here are already in Three.js right-hand
 * coordinate space (converted by arglCameraViewRHf in ArManager).
 */

import * as THREE from 'three';

/** Per-marker state — updated every frame by ArManager */
export interface MarkerPose {
  /** Whether the marker was detected in the most recent frame */
  visible: boolean;
  /** ARToolKit confidence value 0–1 (higher = better match) */
  confidence: number;
  /**
   * 4×4 model-view transform in Three.js right-hand space.
   * Meaningful only when visible === true.
   */
  matrix: THREE.Matrix4;
  /**
   * Frame counter at the last detection — used by Phase 5 objects
   * for temporal smoothing / hysteresis (e.g. the platform's "tranquilizer").
   */
  lastSeenFrame: number;
}

export class MarkerState {
  private poses = new Map<string, MarkerPose>();

  /**
   * Register all marker names. Must be called once before the detection loop.
   * Creates an invisible pose entry for each name.
   */
  init(markerNames: string[]): void {
    for (const name of markerNames) {
      this.poses.set(name, {
        visible: false,
        confidence: 0,
        matrix: new THREE.Matrix4(),
        lastSeenFrame: -1,
      });
    }
  }

  /**
   * Reset all markers to not-visible at the start of each frame.
   * Called by ArManager before detectMarker().
   */
  beginFrame(): void {
    for (const pose of this.poses.values()) {
      pose.visible = false;
    }
  }

  /**
   * Mark a detected marker as visible and store its converted pose matrix.
   * glMatrix is a 16-element column-major Float64Array in Three.js RH space
   * (output of arglCameraViewRHf).
   */
  updateMarker(
    name: string,
    confidence: number,
    glMatrix: Float64Array,
    frameCount: number,
  ): void {
    const pose = this.poses.get(name);
    if (!pose) return;

    pose.visible = true;
    pose.confidence = confidence;
    pose.matrix.fromArray(glMatrix);
    pose.lastSeenFrame = frameCount;
  }

  /**
   * Returns the full MarkerPose for a marker name.
   * Returns undefined if the name was never registered.
   */
  getPose(name: string): MarkerPose | undefined {
    return this.poses.get(name);
  }

  /** Returns true if the marker was detected in the last frame. */
  isVisible(name: string): boolean {
    return this.poses.get(name)?.visible ?? false;
  }

  /**
   * Returns the pose matrix if visible, null otherwise.
   * Convenience for Phase 5: `const m = state.getMatrix('platform'); if (m) ...`
   */
  getMatrix(name: string): THREE.Matrix4 | null {
    const pose = this.poses.get(name);
    return pose?.visible ? pose.matrix : null;
  }

  /** Iterate over all currently visible markers. */
  forEachVisible(callback: (name: string, pose: MarkerPose) => void): void {
    for (const [name, pose] of this.poses) {
      if (pose.visible) callback(name, pose);
    }
  }

  /** Total number of registered markers. */
  get size(): number {
    return this.poses.size;
  }

  /** Number of markers visible in the current frame. */
  get visibleCount(): number {
    let n = 0;
    for (const pose of this.poses.values()) {
      if (pose.visible) n++;
    }
    return n;
  }
}
