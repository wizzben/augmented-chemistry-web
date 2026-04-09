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
import type { GrabberState, RotationState } from './HandObjectManager';

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
  /** Frames remaining in the post-pinch green flash animation (counts down from 2). */
  private _flashFramesLeft = 0;
  /** Timestamp (performance.now()) when the rotation hand was last seen in a frame. */
  private _rotationHandLastSeenMs = 0;
  /** Current opacity of the "show rotation hand" hint (0 = hidden, 1 = fully visible). */
  private _rotationHintOpacity = 0;
  /** Timestamp (performance.now()) when the grabber hand was last seen in a frame. */
  private _grabberHandLastSeenMs = 0;
  /** Current opacity of the "show grabber hand" hint (0 = hidden, 1 = fully visible). */
  private _grabberHintOpacity = 0;

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
   * @param opts.grabbedColor          - Element color { r,g,b in [0,1] } to tint the fingertip circle
   * @param opts.swapHands             - When true, Right hand is grabber (default Left=grabber)
   * @param opts.pinchProgress         - Grabber-hand pinch progress [0,1] for the closing-arc indicator
   * @param opts.pinchTriggered        - True on the frame a new pinch fires (triggers 2-frame flash)
   * @param opts.grabberHandDetected   - True when the grabber hand is tracked this frame
   * @param opts.firstAtomMode         - True when element grabbed but molecule is empty (show placement hint)
   * @param opts.rotationIsOpen        - True when the rotation hand is open (rotating mode)
   * @param opts.rotationSignedAngle   - Signed rotation magnitude in radians this frame
   * @param opts.zoomDirection         - 'in' | 'out' | 'none' — active zoom direction
   * @param opts.rotationState         - Current rotation FSM state from HandObjectManager
   */
  update(
    frame: HandFrame,
    state: GrabberState,
    opts?: {
      grabbedColor?: { r: number; g: number; b: number };
      swapHands?: boolean;
      pinchProgress?: number;
      pinchTriggered?: boolean;
      grabberHandDetected?: boolean;
      firstAtomMode?: boolean;
      rotationIsOpen?: boolean;
      rotationSignedAngle?: number;
      zoomDirection?: 'in' | 'out' | 'none';
      rotationState?: RotationState;
    },
  ): void {
    this.clear();

    const w = this._cssW;
    const h = this._cssH;
    if (w === 0 || h === 0) return;

    const nowMs              = performance.now();
    const swapHands          = opts?.swapHands            ?? false;
    const grabbed            = opts?.grabbedColor;
    const pinchProgress      = opts?.pinchProgress        ?? 0;
    const pinchTriggered     = opts?.pinchTriggered        ?? false;
    const grabberHandSeen    = opts?.grabberHandDetected   ?? false;
    const firstAtomMode      = opts?.firstAtomMode         ?? false;
    const rotIsOpen          = opts?.rotationIsOpen        ?? true;
    const rotAngle           = opts?.rotationSignedAngle   ?? 0;
    const zoomDir            = opts?.zoomDirection         ?? 'none';
    const rotationState      = opts?.rotationState;

    // Manage flash countdown: a pinch trigger starts a 2-frame green flash.
    if (pinchTriggered) {
      this._flashFramesLeft = 2;
    } else if (this._flashFramesLeft > 0) {
      this._flashFramesLeft--;
    }

    let rotationHandSeen = false;

    for (let i = 0; i < frame.landmarks.length; i++) {
      const lm    = frame.landmarks[i];
      const label = frame.handedness[i]?.[0]?.categoryName; // 'Left' | 'Right'

      // Default: Left hand = grabber, Right hand = rotation. Swap flag inverts this.
      const isGrabber = swapHands ? label === 'Right' : label === 'Left';
      const skeletonColor = isGrabber ? COLOR_GRABBER_SKELETON : COLOR_ROTATION_SKELETON;

      this._drawSkeleton(lm, w, h, skeletonColor);
      this._drawJoints(lm, w, h);
      this._drawFingertip(lm, w, h, isGrabber, state, grabbed);

      if (isGrabber) {
        this._drawPinchArc(lm, w, h, pinchProgress, this._flashFramesLeft > 0);
        if (firstAtomMode) this._drawFirstAtomHint(lm, w, h);
      } else {
        rotationHandSeen = true;
        this._drawRotationIndicator(lm, w, h, rotIsOpen, rotAngle, zoomDir, rotationState);
      }
    }

    this._drawGrabberHint(h, nowMs, grabberHandSeen, swapHands);
    this._drawRotationHint(w, h, nowMs, rotationHandSeen, swapHands);
    if (rotationState !== undefined && rotationState !== 'NO_HAND') {
      this._drawRotationStateLabel(rotationState, w, h, swapHands);
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

  /**
   * Draw a rotation arc or zoom arrows near the wrist of the rotation hand.
   *
   * - Open palm (rotating): a curved arrow whose sweep = rotation magnitude ×12,
   *   direction = CW for negative signed angle, CCW for positive.
   *   Only drawn when the rotation exceeds the dead zone.
   * - Closed fist (zooming): two vertical arrows (↑ ↓). The active direction is
   *   bright; the inactive is dim. A small label "+" / "−" confirms direction.
   */
  private _drawRotationIndicator(
    lm: NormalizedLandmark[],
    w: number,
    h: number,
    isOpen: boolean,
    signedAngle: number,
    zoomDir: 'in' | 'out' | 'none',
    rotationState: RotationState | undefined,
  ): void {
    const ctx = this._ctx;
    // Anchor near the wrist (landmark 0)
    const [wx, wy] = this._px(lm[0], w, h);

    if (rotationState === 'ROTATING') {
      // ── Rotation arc (only when angle is above visible threshold) ───────────
      const mag = Math.abs(signedAngle);
      if (mag < 0.005) return;

      const radius     = 38;
      const sweep      = Math.min(mag * 14, Math.PI * 1.6); // scale for visibility
      const startAngle = -Math.PI / 2;                       // 12 o'clock
      // positive signedAngle = CCW in math, but canvas Y is flipped → CW on screen
      const ccw        = signedAngle > 0;
      const endAngle   = startAngle + (ccw ? -sweep : sweep);

      ctx.strokeStyle = COLOR_ROTATION_SKELETON;
      ctx.lineWidth   = 2.5;
      ctx.globalAlpha = Math.min(1, 0.5 + mag * 20); // brighten with speed
      ctx.beginPath();
      ctx.arc(wx, wy, radius, startAngle, endAngle, ccw);
      ctx.stroke();

      // Arrowhead at the end of the arc
      const ex = wx + radius * Math.cos(endAngle);
      const ey = wy + radius * Math.sin(endAngle);
      const tangent = endAngle + (ccw ? -Math.PI / 2 : Math.PI / 2);
      const sz = 7;
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(tangent);
      ctx.fillStyle = COLOR_ROTATION_SKELETON;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-sz / 2, sz);
      ctx.lineTo(sz / 2, sz);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    } else if (rotationState === 'READY' && !isOpen) {
      // ── Zoom arrows (READY + closed fist) ───────────────────────────────────
      const arrowH = 22;
      const arrowW = 10;
      const gap    = 8;           // vertical gap between the two arrows
      const upY    = wy - gap / 2 - arrowH;  // tip of the up arrow
      const downY  = wy + gap / 2;            // tip of the down arrow

      const drawArrow = (tipX: number, tipY: number, pointsUp: boolean, active: boolean) => {
        ctx.fillStyle   = COLOR_ROTATION_SKELETON;
        ctx.globalAlpha = active ? 0.95 : 0.25;
        ctx.beginPath();
        if (pointsUp) {
          ctx.moveTo(tipX,           tipY);
          ctx.lineTo(tipX - arrowW / 2, tipY + arrowH);
          ctx.lineTo(tipX + arrowW / 2, tipY + arrowH);
        } else {
          ctx.moveTo(tipX,           tipY + arrowH);
          ctx.lineTo(tipX - arrowW / 2, tipY);
          ctx.lineTo(tipX + arrowW / 2, tipY);
        }
        ctx.closePath();
        ctx.fill();
      };

      drawArrow(wx, upY,   true,  zoomDir === 'in');
      drawArrow(wx, downY, false, zoomDir === 'out');

      // Label
      if (zoomDir !== 'none') {
        ctx.fillStyle   = COLOR_ROTATION_SKELETON;
        ctx.globalAlpha = 0.9;
        ctx.font        = 'bold 13px sans-serif';
        ctx.textAlign   = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(zoomDir === 'in' ? '+' : '−', wx + 18, wy);
      }

      ctx.globalAlpha  = 1;
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'alphabetic';
    } else if (rotationState === 'READY' && isOpen) {
      // ── Subtle ready ring (READY + open palm) ───────────────────────────────
      ctx.strokeStyle = COLOR_ROTATION_SKELETON;
      ctx.lineWidth   = 1.5;
      ctx.globalAlpha = 0.35;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(wx, wy, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    // All other states: no indicator
  }

  /**
   * Show a translucent hint when the grabber hand has been absent for ≥1 s.
   * Positioned at the left-center edge of the overlay. Fades in over 300 ms,
   * fades out quickly when the hand reappears.
   */
  private _drawGrabberHint(
    h: number,
    nowMs: number,
    grabberHandSeen: boolean,
    swapHands: boolean,
  ): void {
    if (grabberHandSeen) this._grabberHandLastSeenMs = nowMs;

    const missingMs = nowMs - this._grabberHandLastSeenMs;
    const target = grabberHandSeen ? 0 : Math.min(1, Math.max(0, (missingMs - 1000) / 300));
    this._grabberHintOpacity += (target - this._grabberHintOpacity) *
      (target > this._grabberHintOpacity ? 0.06 : 0.4);

    if (this._grabberHintOpacity < 0.02) return;

    const hand = swapHands ? 'right' : 'left';
    const text = `✋  Show ${hand} hand`;

    const ctx = this._ctx;
    ctx.save();
    ctx.globalAlpha  = this._grabberHintOpacity;
    ctx.font         = '14px sans-serif';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';

    const pad = 10;
    const tw  = ctx.measureText(text).width;
    const lx  = pad;
    const ly  = h / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.50)';
    ctx.beginPath();
    ctx.roundRect(lx - 4, ly - 14, tw + pad * 2, 28, 6);
    ctx.fill();

    ctx.fillStyle = COLOR_GRABBER_SKELETON;
    ctx.fillText(text, lx + pad / 2, ly);
    ctx.restore();
  }

  /**
   * Show a translucent hint when the rotation hand has been absent for ≥1 s.
   * Positioned at the right-center edge of the overlay. Fades in over 300 ms,
   * fades out quickly when the hand reappears.
   */
  private _drawRotationHint(
    w: number,
    h: number,
    nowMs: number,
    rotHandSeen: boolean,
    swapHands: boolean,
  ): void {
    if (rotHandSeen) this._rotationHandLastSeenMs = nowMs;

    const missingMs = nowMs - this._rotationHandLastSeenMs;
    const target = rotHandSeen ? 0 : Math.min(1, Math.max(0, (missingMs - 1000) / 300));
    this._rotationHintOpacity += (target - this._rotationHintOpacity) *
      (target > this._rotationHintOpacity ? 0.06 : 0.4);

    if (this._rotationHintOpacity < 0.02) return;

    const hand = swapHands ? 'left' : 'right';
    const text = `✋  Show ${hand} hand to rotate`;

    const ctx = this._ctx;
    ctx.save();
    ctx.globalAlpha  = this._rotationHintOpacity;
    ctx.font         = '14px sans-serif';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';

    const pad = 10;
    const tw  = ctx.measureText(text).width;
    const rx  = w - pad;
    const ry  = h / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.50)';
    ctx.beginPath();
    ctx.roundRect(rx - tw - pad * 2, ry - 14, tw + pad * 2, 28, 6);
    ctx.fill();

    ctx.fillStyle = COLOR_ROTATION_SKELETON;
    ctx.fillText(text, rx - pad / 2, ry);
    ctx.restore();
  }

  /**
   * Draw a persistent rotation FSM state label in the top-right corner.
   * Only called when rotationState is not NO_HAND.
   */
  private _drawRotationStateLabel(
    rotationState: RotationState,
    w: number,
    _h: number,
    swapHands: boolean,
  ): void {
    const rotHand = swapHands ? 'Left' : 'Right';
    const labels: Record<RotationState, string> = {
      NO_HAND:       'No hand detected',
      HAND_DETECTED: `${rotHand} hand detected`,
      READY:         'Ready to rotate',
      GRABBED:       'Grab active',
      ROTATING:      'Rotating',
      RELEASED:      'Released',
      TRACKING_LOST: 'Tracking lost',
    };
    const text = labels[rotationState];

    const ctx = this._ctx;
    ctx.save();
    ctx.font         = '12px sans-serif';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';

    const pad = 10;
    const tw  = ctx.measureText(text).width;
    const rx  = w - pad;
    const ry  = pad + 14;

    ctx.fillStyle   = 'rgba(0,0,0,0.50)';
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.roundRect(rx - tw - pad * 2, ry - 10, tw + pad * 2, 20, 4);
    ctx.fill();

    ctx.fillStyle   = COLOR_ROTATION_SKELETON;
    ctx.globalAlpha = 1.0;
    ctx.fillText(text, rx - pad / 2, ry);
    ctx.restore();
  }

  /**
   * Draw "Pinch to place first atom" label above the grabber-hand index fingertip.
   * Only shown when the user has grabbed an element but no atoms exist yet.
   */
  private _drawFirstAtomHint(
    lm: NormalizedLandmark[],
    w: number,
    h: number,
  ): void {
    const ctx = this._ctx;
    const [tipX, tipY] = this._px(lm[INDEX_TIP], w, h);

    const text    = 'Pinch to place first atom';
    const pad     = 8;
    const offsetY = 46; // px above the fingertip circle (which is r=26 + pinch arc r=26)

    ctx.save();
    ctx.font         = '12px sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';

    const tw = ctx.measureText(text).width;
    const bx = tipX - tw / 2 - pad;
    const by = tipY - offsetY - 20;

    // Pill background
    ctx.fillStyle   = 'rgba(0,0,0,0.50)';
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.roundRect(bx, by, tw + pad * 2, 22, 5);
    ctx.fill();

    // Label text
    ctx.fillStyle   = COLOR_GRABBER_SKELETON;
    ctx.globalAlpha = 1.0;
    ctx.fillText(text, tipX, tipY - offsetY);

    // Small downward pointer from pill to fingertip area
    ctx.strokeStyle = COLOR_GRABBER_SKELETON;
    ctx.lineWidth   = 1.5;
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(tipX, tipY - offsetY + 2);
    ctx.lineTo(tipX, tipY - 32);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }

  /**
   * Draw a closing arc around the grabber-hand index fingertip to show how
   * close the user is to triggering a pinch.
   *
   * - Arc sweeps clockwise from the top, 0° (progress=0) to 360° (progress=1).
   * - Color transitions from white to bright green as progress increases.
   * - When `flash` is true (2 frames after a pinch fires), the arc is fully
   *   green and at full opacity regardless of progress.
   */
  private _drawPinchArc(
    lm: NormalizedLandmark[],
    w: number,
    h: number,
    progress: number,
    flash: boolean,
  ): void {
    // Only draw when there is something to show
    if (progress <= 0.01 && !flash) return;

    const ctx = this._ctx;
    const [tipX, tipY] = this._px(lm[INDEX_TIP], w, h);

    const arcRadius  = 26;                     // outside the 18px fingertip circle
    const startAngle = -Math.PI / 2;           // 12 o'clock
    const endAngle   = startAngle + (flash ? Math.PI * 2 : Math.PI * 2 * progress);

    if (flash) {
      // Solid green flash
      ctx.strokeStyle = 'rgb(60, 255, 100)';
      ctx.globalAlpha = 1.0;
    } else {
      // Interpolate white → bright green as progress increases
      const r = Math.round(255 - 195 * progress);  // 255 → 60
      const g = 255;
      const b = Math.round(255 - 155 * progress);  // 255 → 100
      ctx.strokeStyle = `rgb(${r},${g},${b})`;
      ctx.globalAlpha = 0.35 + 0.65 * progress;    // 35% → 100%
    }

    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(tipX, tipY, arcRadius, startAngle, endAngle, false);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Faint guide circle (full 360°) so the user can see where the arc is going
    if (!flash && progress < 0.95) {
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(tipX, tipY, arcRadius, 0, Math.PI * 2);
      ctx.stroke();
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
