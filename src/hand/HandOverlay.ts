/**
 * HandOverlay — 2D canvas overlay for markerless mode visual feedback.
 *
 * Draws:
 *  - Hand skeleton: 21 landmarks + standard connections, coloured by role
 *  - Fingertip cursor: larger dot on grabber-hand index tip
 *  - Grabbed element indicator: coloured circle on fingertip while element is held
 *  - Mirrored horizontally (front-facing camera: movements feel natural)
 *
 * Usage:
 *   const overlay = new HandOverlay(document.getElementById('hand-overlay') as HTMLCanvasElement);
 *   overlay.syncSize();   // once after layout stabilises, again on window resize
 *   overlay.show();
 *   // each frame:
 *   overlay.update(frame, grabberState, { grabbedColor: el.color, swapHands: false });
 *   // teardown:
 *   overlay.dispose();
 */

import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { HandFrame } from './HandTracker';
import type { GrabberState } from './HandObjectManager';

// MediaPipe standard hand connections (landmark index pairs).
// https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker#models
const HAND_CONNECTIONS: readonly [number, number][] = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index finger
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle finger
  [5, 9], [9, 10], [10, 11], [11, 12],
  // Ring finger
  [9, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [13, 17], [17, 18], [18, 19], [19, 20],
  // Palm base
  [0, 17], [0, 9],
];

// Landmark 8 = index fingertip (central to grab interactions)
const INDEX_TIP = 8;

// Per-role colours
const COLOR_GRABBER_SKELETON  = 'rgba(80, 230, 160, 0.85)';  // teal-green
const COLOR_ROTATION_SKELETON = 'rgba(80, 160, 255, 0.70)';  // soft blue
const COLOR_JOINT             = 'rgba(255, 255, 255, 0.85)'; // white joints

export class HandOverlay {
  private readonly _canvas: HTMLCanvasElement;
  private readonly _ctx: CanvasRenderingContext2D;
  /** CSS width used as coordinate space after syncSize(). */
  private _cssW = 0;
  /** CSS height used as coordinate space after syncSize(). */
  private _cssH = 0;

  constructor(canvas: HTMLCanvasElement) {
    this._canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('HandOverlay: cannot get 2D canvas context');
    this._ctx = ctx;
  }

  /**
   * Sync the canvas buffer resolution to its current CSS layout size.
   * Scales the context by devicePixelRatio so all draw calls use CSS pixels.
   * Call once after layout stabilises and again on window resize.
   */
  syncSize(): void {
    const rect = this._canvas.getBoundingClientRect();
    const dpr  = window.devicePixelRatio || 1;
    this._cssW = rect.width;
    this._cssH = rect.height;
    this._canvas.width  = Math.round(rect.width  * dpr);
    this._canvas.height = Math.round(rect.height * dpr);
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // replaces resetTransform + scale
  }

  /**
   * Draw one frame.
   *
   * @param frame        - Hand landmarks from HandTracker.detect()
   * @param state        - Current grabber state from HandObjectManager
   * @param opts.grabbedColor  - Element color { r,g,b in [0,1] } to tint the fingertip circle
   * @param opts.swapHands     - When true, Right hand is grabber (default Left=grabber)
   */
  update(
    frame: HandFrame,
    state: GrabberState,
    opts?: {
      grabbedColor?: { r: number; g: number; b: number };
      swapHands?: boolean;
    },
  ): void {
    this.clear();

    const w = this._cssW;
    const h = this._cssH;
    if (w === 0 || h === 0) return;

    const swapHands  = opts?.swapHands  ?? false;
    const grabbed    = opts?.grabbedColor;

    for (let i = 0; i < frame.landmarks.length; i++) {
      const lm    = frame.landmarks[i];
      const label = frame.handedness[i]?.[0]?.categoryName; // 'Left' | 'Right'

      // Default: Left hand = grabber, Right hand = rotation. Swap flag inverts this.
      const isGrabber = swapHands ? label === 'Right' : label === 'Left';
      const skeletonColor = isGrabber ? COLOR_GRABBER_SKELETON : COLOR_ROTATION_SKELETON;

      this._drawSkeleton(lm, w, h, skeletonColor);
      this._drawJoints(lm, w, h);
      this._drawFingertip(lm, w, h, isGrabber, state, grabbed);
    }
  }

  clear(): void {
    this._ctx.clearRect(0, 0, this._cssW, this._cssH);
  }

  show(): void {
    this._canvas.style.display = 'block';
  }

  hide(): void {
    this._canvas.style.display = 'none';
  }

  dispose(): void {
    this.clear();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Convert a normalised landmark to mirrored CSS pixel coords. */
  private _px(lm: NormalizedLandmark, w: number, h: number): [number, number] {
    return [(1 - lm.x) * w, lm.y * h];
  }

  private _drawSkeleton(
    lm: NormalizedLandmark[],
    w: number,
    h: number,
    color: string,
  ): void {
    const ctx = this._ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2.5;
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      const [ax, ay] = this._px(lm[a], w, h);
      const [bx, by] = this._px(lm[b], w, h);
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
    }
    ctx.stroke();
  }

  private _drawJoints(lm: NormalizedLandmark[], w: number, h: number): void {
    const ctx = this._ctx;
    ctx.fillStyle = COLOR_JOINT;
    for (const pt of lm) {
      const [x, y] = this._px(pt, w, h);
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private _drawFingertip(
    lm: NormalizedLandmark[],
    w: number,
    h: number,
    isGrabber: boolean,
    state: GrabberState,
    grabbedColor: { r: number; g: number; b: number } | undefined,
  ): void {
    const ctx = this._ctx;
    const [tipX, tipY] = this._px(lm[INDEX_TIP], w, h);

    if (!isGrabber) {
      // Rotation hand: subtle small ring
      ctx.strokeStyle = COLOR_ROTATION_SKELETON;
      ctx.lineWidth   = 2;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(tipX, tipY, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }

    // Grabber hand
    if (state === 'GRABBED' || state === 'APPROACHING' || state === 'DOCKING') {
      // Show element colour circle at fingertip
      if (grabbedColor) {
        const { r, g, b } = grabbedColor;
        const hex = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
        ctx.globalAlpha = 0.75;
        ctx.fillStyle   = hex;
        ctx.beginPath();
        ctx.arc(tipX, tipY, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = 2.5;
        ctx.beginPath();
        ctx.arc(tipX, tipY, 18, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // Fallback: bright green ring
        ctx.strokeStyle = COLOR_GRABBER_SKELETON;
        ctx.lineWidth   = 3;
        ctx.beginPath();
        ctx.arc(tipX, tipY, 15, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else {
      // IDLE or BROWSING: cursor circle (pulsing would need animation, static for now)
      ctx.strokeStyle = COLOR_GRABBER_SKELETON;
      ctx.lineWidth   = 2.5;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(tipX, tipY, 12, 0, Math.PI * 2);
      ctx.stroke();
      // Small fill dot
      ctx.fillStyle   = COLOR_GRABBER_SKELETON;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(tipX, tipY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}
