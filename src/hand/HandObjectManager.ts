/**
 * HandObjectManager — central orchestrator for markerless mode.
 *
 * Owns:
 *  - A pivot THREE.Group that wraps the molecule (rotation + zoom target).
 *  - Its own MoleculeRenderer (intercepts builder.onChanged same pattern as
 *    ArObjectManager, parenting the molecule group under the pivot).
 *  - Two GestureDetectors (rotation hand / grabber hand).
 *  - The grabber state machine: IDLE → BROWSING → GRABBED → APPROACHING → DOCKING.
 *
 * Constructor dependencies are passed in so they can be mocked in tests.
 * Call update(frame) each frame from SceneManager's rAF via setOnBeforeRender().
 * Call dispose() when markerless mode exits.
 */

import * as THREE from 'three';
import type { MoleculeBuilder } from '@/interaction/MoleculeBuilder';
import type { MaterialLibrary } from '@/rendering/MaterialLibrary';
import type { MoleculeGeometryData } from '@/rendering/MoleculeGeometry';
import type { SceneManager } from '@/rendering/SceneManager';
import type { Atom } from '@/chemistry/Atom';
import type { HandFrame } from './HandTracker';
import type { AtomGrabList } from './AtomGrabList';
import { GestureDetector } from './GestureDetector';
import { RotationFSM } from './RotationFSM';
import { MoleculeRenderer } from '@/rendering/MoleculeRenderer';
import { GhostRenderer, type GhostInfo } from '@/rendering/GhostRenderer';
import { computeMoleculeGeometry } from '@/rendering/MoleculeGeometry';
export type { RotationState } from './RotationFSM';

// ── Tuning constants ─────────────────────────────────────────────────────────
const ROTATION_CONFIG = {
  /** Minimum rotation angle (radians, ~1.4°) — smaller deltas are dead-zoned. */
  minRotationAngle: 0.025,
  /** Slerp factor applied each frame: pivotQ → _targetQuaternion. Lower = smoother. */
  smoothingAlpha: 0.3,
};
/** Sensitivity of closed-fist vertical movement to scale change per normalized unit. */
const ZOOM_SENSITIVITY = 2.5;
/** Low-pass weight applied to the raw fist Y each frame (0=frozen, 1=no smoothing). */
const ZOOM_SMOOTH = 0.35;
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 5.0;
/** Screen-space pixel radius within which the grabber finger "approaches" an atom. */
const ATOM_APPROACH_PX = 80;
/** Screen-space pixel radius within which the grabber finger docks to a ghost. */
const GHOST_DOCK_PX = 60;
/** Hysteresis factor: exit-threshold = enter-threshold × this multiplier. */
const HYSTERESIS = 1.5;

// ── State types (exported for HandOverlay) ───────────────────────────────────
export type GrabberState = 'IDLE' | 'BROWSING' | 'GRABBED' | 'APPROACHING' | 'DOCKING';

export class HandObjectManager {
  private readonly _builder: MoleculeBuilder;
  private readonly _scene: THREE.Scene;
  private readonly _camera: THREE.PerspectiveCamera;
  private readonly _canvas: HTMLCanvasElement;
  private readonly _atomGrabList: AtomGrabList;
  private readonly _ghostRenderer: GhostRenderer;

  // ── Pivot group — molecule rotation / zoom ────────────────────────────────
  private readonly _pivotGroup: THREE.Group;

  // ── Own molecule renderer (intercepts builder.onChanged) ──────────────────
  private readonly _renderer: MoleculeRenderer;
  private readonly _savedOnChanged: (geo: MoleculeGeometryData) => void;

  // ── Gesture detectors ─────────────────────────────────────────────────────
  private _detectorRotation = new GestureDetector();
  private _detectorGrabber  = new GestureDetector();
  private _swapHands = false;

  // ── Grabber state machine ─────────────────────────────────────────────────
  grabberState: GrabberState = 'IDLE';
  private _approachingAtom: Atom | null = null;
  private _nearestGhost: GhostInfo | null = null;

  // ── Simple mode (Option D) ─────────────────────────────────────────────────
  /** When true, skips APPROACHING/DOCKING and shows ghosts for all atoms at once. */
  private _simpleMode = false;

  // ── Atom mesh ↔ Atom mapping ───────────────────────────────────────────────
  private _currentAtomMeshes: THREE.Mesh[] = [];
  private readonly _atomMeshToAtom = new Map<THREE.Mesh, Atom>();

  // ── Zoom tracking ─────────────────────────────────────────────────────────
  private _pivotScale = 1.0;
  private _prevFistY: number | null = null;
  private _smoothedFistY: number | null = null;

  // ── Rotation FSM ──────────────────────────────────────────────────────────
  private readonly _fsm = new RotationFSM();
  /** Accumulated target orientation — pivot slerps toward this each frame. */
  private readonly _targetQuaternion = new THREE.Quaternion();

  // ── Rotation hand overlay state (read by HandOverlay) ─────────────────────
  private _rotationHandDetected = false;
  private _zoomDirection: 'in' | 'out' | 'none' = 'none';

  // ── Atom approach highlight ────────────────────────────────────────────────
  private readonly _materialLibrary: MaterialLibrary;
  private _highlightedMesh: THREE.Mesh | null = null;
  private _originalMaterial: THREE.Material | null = null;

  // ── Grabbed element sphere (follows fingertip while element is held) ───────
  private readonly _grabbedSphere: THREE.Mesh;
  private readonly _grabbedSphereMat: THREE.MeshPhongMaterial;

  // ── Cursor ring (billboard torus, always visible when hand detected) ───────
  private readonly _cursorRing: THREE.Mesh;
  private readonly _cursorRingMat: THREE.MeshPhongMaterial;

  // ── Grabber hand presence & animation ─────────────────────────────────────
  private _grabberHandDetected = false;
  private _totalTimeMs = 0;

  // ── Hovered element color (BROWSING state tint) ────────────────────────────
  private _hoveredElementColor: { r: number; g: number; b: number } | null = null;

  // ── Targeting line (cursor → nearest atom / ghost) ────────────────────────
  private readonly _targetLineGeom: THREE.BufferGeometry;
  private readonly _targetLineDashedMat: THREE.LineDashedMaterial;
  private readonly _targetLineSolidMat: THREE.LineBasicMaterial;
  private readonly _targetLine: THREE.Line;
  /** Scratch vector — world position of the line's target end each frame. */
  private readonly _targetLineAtomPos = new THREE.Vector3();
  /** Nearest unsaturated atom mesh this frame (set in _stateGrabbed, cleared before switch). */
  private _nearestAtomMesh: THREE.Mesh | null = null;
  /** Screen-space distance to _nearestAtomMesh (px). */
  private _nearestAtomScreenDist = Infinity;

  // ── Reusable Three.js scratch objects (avoid per-frame allocations) ────────
  private readonly _worldPos = new THREE.Vector3();
  private readonly _ndc      = new THREE.Vector3();
  private readonly _raycaster = new THREE.Raycaster();
  private readonly _zeroPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private readonly _planeHit  = new THREE.Vector3();
  /** Scratch quaternions for camera-relative rotation transform (substep 4). */
  private readonly _qCamScratch    = new THREE.Quaternion();
  private readonly _qCamInvScratch = new THREE.Quaternion();

  // ── Frame timing ──────────────────────────────────────────────────────────
  private _lastTimestamp = -1;

  constructor(
    builder: MoleculeBuilder,
    sceneManager: SceneManager,
    materialLibrary: MaterialLibrary,
    atomGrabList: AtomGrabList,
    ghostRenderer: GhostRenderer,
  ) {
    this._builder         = builder;
    this._scene           = sceneManager.scene;
    this._camera          = sceneManager.camera;
    this._canvas          = sceneManager.renderer.domElement;
    this._atomGrabList    = atomGrabList;
    this._ghostRenderer   = ghostRenderer;
    this._materialLibrary = materialLibrary;

    // ── Pivot group ────────────────────────────────────────────────────────
    this._pivotGroup = new THREE.Group();
    this._scene.add(this._pivotGroup);

    // ── Grabbed element sphere ─────────────────────────────────────────────
    this._grabbedSphereMat = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.75,
    });
    this._grabbedSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 16, 12),
      this._grabbedSphereMat,
    );
    this._grabbedSphere.visible = false;
    this._scene.add(this._grabbedSphere);

    // ── Cursor ring (billboard torus, always visible when grabber hand is detected)
    this._cursorRingMat = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
    this._cursorRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.35, 0.045, 8, 32),
      this._cursorRingMat,
    );
    this._cursorRing.visible = false;
    this._scene.add(this._cursorRing);

    // ── Targeting line ─────────────────────────────────────────────────────
    // Two-point BufferGeometry shared by both dashed and solid materials.
    const linePositions = new Float32Array(6); // point A (xyz) + point B (xyz)
    this._targetLineGeom = new THREE.BufferGeometry();
    this._targetLineGeom.setAttribute(
      'position',
      new THREE.BufferAttribute(linePositions, 3),
    );
    this._targetLineDashedMat = new THREE.LineDashedMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
      dashSize: 0.15,
      gapSize: 0.10,
    });
    this._targetLineSolidMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
    });
    this._targetLine = new THREE.Line(this._targetLineGeom, this._targetLineDashedMat);
    this._targetLine.visible = false;
    this._scene.add(this._targetLine);

    // ── Own molecule renderer ──────────────────────────────────────────────
    this._renderer = new MoleculeRenderer();

    // ── Intercept builder.onChanged ────────────────────────────────────────
    this._savedOnChanged = builder.onChanged;

    builder.onChanged = (geo: MoleculeGeometryData) => {
      // Clear ghosts before re-rendering (ghost meshes are pivotGroup children)
      this._ghostRenderer.clearGhosts();
      this._setAtomHighlight(null); // mesh is about to be replaced; clear before rebuild
      this._approachingAtom = null;
      this._nearestGhost = null;
      // After placement (APPROACHING/DOCKING) return to GRABBED so the same
      // element stays loaded and the user can keep bonding without re-picking.
      if (this.grabberState === 'APPROACHING' || this.grabberState === 'DOCKING') {
        this.grabberState = 'GRABBED';
      }

      this._renderer.clear();
      this._atomMeshToAtom.clear();
      this._currentAtomMeshes = [];

      if (geo.atoms.length > 0) {
        const { group, atomMeshes } = this._renderer.renderMolecule(builder.getMolecule());
        this._pivotGroup.add(group);
        for (let i = 0; i < atomMeshes.length; i++) {
          this._atomMeshToAtom.set(atomMeshes[i], geo.atoms[i].atom);
        }
        this._currentAtomMeshes = atomMeshes;
      }
    };

    // Clear any molecule the desktop renderer has in the scene, then render
    // the current molecule under our pivot group.
    this._savedOnChanged({ atoms: [], bonds: [], boundingRadius: 0, center: [0, 0, 0] });
    const mol = builder.getMolecule();
    if (mol.atoms.length > 0) {
      const geo = computeMoleculeGeometry(mol);
      builder.onChanged(geo);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Process one hand frame. Call from SceneManager.setOnBeforeRender() after
   * HandManager.processFrame() returns a non-null HandFrame.
   */
  update(frame: HandFrame): void {
    const elapsedMs = this._lastTimestamp >= 0
      ? frame.timestamp - this._lastTimestamp
      : 0;
    this._lastTimestamp = frame.timestamp;
    this._totalTimeMs += elapsedMs;

    // ── Assign hand roles ──────────────────────────────────────────────────
    // MediaPipe label "Left"/"Right" = user's actual hand.
    // Default: Right = rotation, Left = grabber. Swap flag inverts this.
    let rotLm:   typeof frame.landmarks[0]       | null = null;
    let rotWl:   typeof frame.worldLandmarks[0]  | null = null;
    let grabLm:  typeof frame.landmarks[0]       | null = null;
    let grabWl:  typeof frame.worldLandmarks[0]  | null = null;

    for (let i = 0; i < frame.handedness.length; i++) {
      const label = frame.handedness[i][0]?.categoryName; // 'Left' | 'Right'
      const isRotation = this._swapHands ? label === 'Left' : label === 'Right';
      if (isRotation) {
        rotLm  = frame.landmarks[i];
        rotWl  = frame.worldLandmarks[i];
      } else {
        grabLm = frame.landmarks[i];
        grabWl = frame.worldLandmarks[i];
      }
    }

    // Update gesture detectors.
    // Rotation detector: always update (empty arrays → graceful no-op; FSM handles reset timing).
    // Grabber detector: reset immediately when hand is absent.
    this._rotationHandDetected = !!(rotLm && rotWl);
    this._detectorRotation.update(rotLm ?? [], rotWl ?? [], elapsedMs);

    this._grabberHandDetected = !!(grabLm && grabWl);
    if (grabLm && grabWl) {
      this._detectorGrabber.update(grabLm, grabWl, elapsedMs);
    } else {
      this._detectorGrabber.reset();
    }

    this._processRotationHand(elapsedMs);
    this._processGrabberHand();
  }

  setSwapHands(v: boolean): void {
    this._swapHands = v;
    this._detectorRotation.reset();
    this._detectorGrabber.reset();
    this._fsm.reset();
    this._prevFistY = null;
    this._smoothedFistY = null;
    this._zoomDirection = 'none';
  }

  /** Reset molecule orientation to identity. */
  resetOrientation(): void {
    this._targetQuaternion.identity();
  }

  /**
   * Snap the molecule to a named view preset.
   * The pivot slerps to the target over the next few frames.
   */
  setViewPreset(view: 'front' | 'side' | 'top'): void {
    switch (view) {
      case 'front':
        this._targetQuaternion.set(0, 0, 0, 1);
        break;
      case 'side':
        // 90° around Y: q = (0, sin(π/4), 0, cos(π/4))
        this._targetQuaternion.set(0, Math.SQRT1_2, 0, Math.SQRT1_2);
        break;
      case 'top':
        // -90° around X: q = (sin(-π/4), 0, 0, cos(π/4))
        this._targetQuaternion.set(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);
        break;
    }
  }

  /** Toggle Option D (simple mode): show all ghosts at once, direct pinch-to-place. */
  setSimpleMode(v: boolean): void {
    this._simpleMode = v;
    // Clear any in-progress APPROACHING/DOCKING state when switching modes.
    this._ghostRenderer.clearGhosts();
    this._nearestGhost    = null;
    this._approachingAtom = null;
    if (this.grabberState === 'APPROACHING' || this.grabberState === 'DOCKING') {
      this.grabberState = 'GRABBED';
    }
  }

  /** True when Option D (simple mode) is active. */
  get simpleMode(): boolean { return this._simpleMode; }

  /** True when the grabber hand is tracked this frame. */
  get grabberHandDetected(): boolean { return this._grabberHandDetected; }

  /**
   * True when the user has grabbed an element but the molecule is still empty —
   * the next pinch will place the first atom. Used by HandOverlay to show the
   * placement hint text.
   */
  get firstAtomMode(): boolean {
    return this.grabberState === 'GRABBED' && this._currentAtomMeshes.length === 0;
  }

  /** Pinch progress [0,1] for the grabber hand — used by HandOverlay for the arc indicator. */
  get pinchProgress(): number { return this._detectorGrabber.pinchProgress; }

  /** True for exactly one frame when a new grabber-hand pinch fires. */
  get pinchTriggered(): boolean { return this._detectorGrabber.pinchTriggered; }

  /** True when the rotation hand is tracked this frame. */
  get rotationHandDetected(): boolean { return this._rotationHandDetected; }

  /** Current rotation FSM state. */
  get rotationState(): RotationState { return this._fsm.state; }

  /** True when the rotation hand is open (palm extended = rotating mode). */
  get rotationIsOpen(): boolean { return this._detectorRotation.isOpen; }

  /**
   * Signed rotation magnitude in radians applied this frame.
   * Positive = counterclockwise (y-axis up), negative = clockwise.
   * 0 when the hand is still or inside the dead zone.
   */
  get rotationSignedAngleRad(): number {
    const d = this._detectorRotation.rotationDelta;
    const angle = 2 * Math.acos(Math.min(1, Math.abs(d.w)));
    if (angle < 0.001) return 0;
    return angle * (d.y >= 0 ? 1 : -1);
  }

  /** Current zoom direction from closed-fist vertical movement. */
  get zoomDirection(): 'in' | 'out' | 'none' { return this._zoomDirection; }

  dispose(): void {
    // Restore original builder.onChanged
    this._builder.onChanged = this._savedOnChanged;

    // Clear approach highlight before meshes are destroyed
    this._setAtomHighlight(null);

    // Clear markerless rendering and re-render under desktop molecule renderer
    this._ghostRenderer.clearGhosts();
    this._renderer.dispose();            // removes molecule group from pivotGroup
    this._scene.remove(this._pivotGroup);

    // Re-render current molecule via original (desktop) handler
    const mol = this._builder.getMolecule();
    const geo = mol.atoms.length > 0
      ? computeMoleculeGeometry(mol)
      : { atoms: [], bonds: [], boundingRadius: 0, center: [0, 0, 0] as [number,number,number] };
    this._savedOnChanged(geo);

    // Clean up grabbed sphere and cursor ring
    this._scene.remove(this._grabbedSphere);
    this._grabbedSphere.geometry.dispose();
    this._grabbedSphereMat.dispose();
    this._scene.remove(this._cursorRing);
    this._cursorRing.geometry.dispose();
    this._cursorRingMat.dispose();
    this._scene.remove(this._targetLine);
    this._targetLineGeom.dispose();
    this._targetLineDashedMat.dispose();
    this._targetLineSolidMat.dispose();

    // Clear UI state
    this._atomGrabList.highlightElement(null);
    this._detectorRotation.reset();
    this._detectorGrabber.reset();
  }

  // ── Private: rotation / zoom hand ─────────────────────────────────────────

  private _processRotationHand(elapsedMs: number): void {
    const det = this._detectorRotation;
    const delta = det.rotationDelta;
    const theta = 2 * Math.acos(Math.min(1, Math.abs(delta.w)));

    // ── Delegate FSM transitions ───────────────────────────────────────────────
    this._fsm.update({
      handDetected: this._rotationHandDetected,
      isPinching: det.isPinching,
      deltaAngle: theta,
      elapsedMs,
    });

    // Reset GestureDetector when the FSM fully loses the hand
    if (!this._rotationHandDetected && this._fsm.state === 'NO_HAND') {
      det.reset();
    }

    // ── Phase 3: Rotation (pinch clutch active, delta above dead zone) ─────────
    if (this._fsm.grabActive && theta >= ROTATION_CONFIG.minRotationAngle) {
      // Camera-relative rotation: q_worldDelta = qCam * qDelta * qCam^-1
      // With the current fixed camera (identity quaternion) this is a no-op,
      // but correctly handles any future camera movement.
      this._qCamScratch.copy(this._camera.quaternion);
      this._qCamInvScratch.copy(this._camera.quaternion).invert();
      const qWorldDelta = this._qCamScratch.multiply(delta).multiply(this._qCamInvScratch).normalize();
      this._targetQuaternion.premultiply(qWorldDelta).normalize();
    }

    // ── Phase 4: Zoom (READY + closed fist, no pinch) ─────────────────────────
    if (this._fsm.state === 'READY' && !det.isOpen) {
      const rawY = det.indexTip.y;
      if (rawY > 0) {
        this._smoothedFistY = this._smoothedFistY === null
          ? rawY
          : this._smoothedFistY + (rawY - this._smoothedFistY) * ZOOM_SMOOTH;
        if (this._prevFistY !== null) {
          const yDelta = this._prevFistY - this._smoothedFistY;
          const multiplier = 1 + yDelta * ZOOM_SENSITIVITY;
          this._pivotScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this._pivotScale * multiplier));
          this._pivotGroup.scale.setScalar(this._pivotScale);
          // Dead-zone of 0.002 suppresses jitter artefacts in the zoom indicator
          this._zoomDirection = yDelta > 0.002 ? 'in' : yDelta < -0.002 ? 'out' : 'none';
        } else {
          this._zoomDirection = 'none';
        }
        this._prevFistY = this._smoothedFistY;
      } else {
        this._zoomDirection = 'none';
      }
    } else {
      this._prevFistY = null;
      this._smoothedFistY = null;
      this._zoomDirection = 'none';
    }

    // ── Phase 5: Smoothing ────────────────────────────────────────────────────
    this._pivotGroup.quaternion.slerp(this._targetQuaternion, ROTATION_CONFIG.smoothingAlpha).normalize();
  }

  // ── Private: grabber state machine ────────────────────────────────────────

  private _processGrabberHand(): void {
    const det = this._detectorGrabber;

    // Fingertip screen coordinates.
    // MediaPipe x is raw (not mirrored). With facingMode:'user', the user's left
    // hand is on the right side of the raw video, so we mirror x for display.
    const cw = this._canvas.clientWidth;
    const ch = this._canvas.clientHeight;
    const canvasRect = this._canvas.getBoundingClientRect();
    const mirroredX = 1 - det.indexTip.x;

    const tipScreenX = mirroredX * cw;                  // canvas-relative pixels
    const tipScreenY = det.indexTip.y * ch;
    const tipPageX   = canvasRect.left + tipScreenX;    // page-space pixels (for DOM rect check)
    const tipPageY   = canvasRect.top  + tipScreenY;

    // Reset per-frame nearest-atom tracking (set inside _stateGrabbed)
    this._nearestAtomMesh = null;
    this._nearestAtomScreenDist = Infinity;

    switch (this.grabberState) {
      case 'IDLE':
      case 'BROWSING':
        this._stateIdleBrowsing(det, tipPageX, tipPageY);
        break;
      case 'GRABBED':
        this._stateGrabbed(det, tipPageX, tipPageY, tipScreenX, tipScreenY);
        break;
      case 'APPROACHING':
        this._stateApproaching(det, tipScreenX, tipScreenY);
        break;
      case 'DOCKING':
        this._stateDocking(det, tipScreenX, tipScreenY);
        break;
    }

    this._updateCursor(tipScreenX, tipScreenY);
    this._updateTargetLine();
  }

  private _stateIdleBrowsing(
    det: GestureDetector,
    tipPageX: number,
    tipPageY: number,
  ): void {
    const el = this._atomGrabList.getElementAtScreenPos(tipPageX, tipPageY);
    this._atomGrabList.highlightElement(el);

    if (el !== null) {
      this.grabberState = 'BROWSING';
      this._hoveredElementColor = el.color;
      if (det.pinchTriggered) {
        this._builder.setElement(el);
        this._grabbedSphereMat.color.setRGB(el.color.r, el.color.g, el.color.b);
        this.grabberState = 'GRABBED';
        this._hoveredElementColor = null;
        this._atomGrabList.highlightElement(null);
      }
    } else {
      this._hoveredElementColor = null;
      if (this.grabberState === 'BROWSING') {
        this.grabberState = 'IDLE';
      }
    }
  }

  private _stateGrabbed(
    det: GestureDetector,
    tipPageX: number,
    tipPageY: number,
    tipScreenX: number,
    tipScreenY: number,
  ): void {
    // ── Allow element switching while an element is already loaded ─────────────
    // If the finger is over the atom grab list, highlight it and let the user
    // pinch to swap to a different element without going back to IDLE first.
    const listEl = this._atomGrabList.getElementAtScreenPos(tipPageX, tipPageY);
    if (listEl !== null) {
      this._atomGrabList.highlightElement(listEl);
      this._hoveredElementColor = listEl.color;
      if (det.pinchTriggered) {
        this._builder.setElement(listEl);
        this._grabbedSphereMat.color.setRGB(listEl.color.r, listEl.color.g, listEl.color.b);
        this._atomGrabList.highlightElement(null);
        this._hoveredElementColor = null;
      }
      return; // Don't look for nearby atoms while the finger is over the list
    }
    // Finger is not over the list — clear any list highlight left from above
    this._atomGrabList.highlightElement(null);
    this._hoveredElementColor = null;

    const mol = this._builder.getMolecule();

    // Empty molecule: pinch anywhere to place the first atom (both modes)
    if (mol.atoms.length === 0) {
      this._setAtomHighlight(null);
      if (det.pinchTriggered) {
        this._builder.addFirstAtom();
        // builder.onChanged fires: state reset to IDLE (fix a)
      }
      return;
    }

    // ── Option D (simple mode): show all ghosts, direct pinch-to-place ────────
    if (this._simpleMode) {
      this._setAtomHighlight(null);

      // Rebuild ghost list whenever it was cleared (e.g. after each placement)
      if (this._ghostRenderer.getGhosts().length === 0) {
        for (const mesh of this._currentAtomMeshes) {
          const atom = this._atomMeshToAtom.get(mesh);
          if (atom && !atom.done) {
            this._ghostRenderer.addGhostsForAtom(atom, this._pivotGroup);
          }
        }
      }

      // Find nearest ghost to fingertip
      let nearestGhost: GhostInfo | null = null;
      let nearestDist = Infinity;
      for (const ghost of this._ghostRenderer.getGhosts()) {
        const d = this._meshScreenDist(ghost.mesh, tipScreenX, tipScreenY);
        if (d < nearestDist) { nearestDist = d; nearestGhost = ghost; }
      }
      this._nearestGhost = nearestDist < GHOST_DOCK_PX ? nearestGhost : null;

      if (this._nearestGhost !== null && det.pinchTriggered) {
        this._builder.linkNow(this._nearestGhost.atom, this._nearestGhost.connectionBitfield);
        // builder.onChanged fires: ghosts cleared, state reset to IDLE (fix a)
      }
      return;
    }

    // ── Option A: approach-then-dock ──────────────────────────────────────────

    // Find the closest unsaturated atom mesh within threshold
    let nearestMesh: THREE.Mesh | null = null;
    let nearestAtom: Atom | null = null;
    let nearestDist = Infinity;

    for (const mesh of this._currentAtomMeshes) {
      const atom = this._atomMeshToAtom.get(mesh);
      if (!atom || atom.done) continue;

      const d = this._meshScreenDist(mesh, tipScreenX, tipScreenY);
      if (d < nearestDist) { nearestDist = d; nearestAtom = atom; nearestMesh = mesh; }
    }

    // Save for targeting line (shown at 2× the approach threshold)
    this._nearestAtomMesh = nearestMesh;
    this._nearestAtomScreenDist = nearestDist;

    if (nearestAtom !== null && nearestDist < ATOM_APPROACH_PX) {
      // Highlight the atom the grabber finger is approaching
      this._setAtomHighlight(nearestMesh);
      this._approachingAtom = nearestAtom;
      this._ghostRenderer.showGhosts(nearestAtom, this._pivotGroup);
      this.grabberState = 'APPROACHING';
    } else {
      // No atom nearby — clear any lingering highlight
      this._setAtomHighlight(null);
    }
  }

  private _stateApproaching(
    det: GestureDetector,
    tipScreenX: number,
    tipScreenY: number,
  ): void {
    // If finger moved far from the approaching atom, clear ghosts and retreat
    if (this._approachingAtom !== null) {
      const approachMesh = this._meshForAtom(this._approachingAtom);
      if (approachMesh !== null) {
        const d = this._meshScreenDist(approachMesh, tipScreenX, tipScreenY);
        if (d > ATOM_APPROACH_PX * HYSTERESIS) {
          this._ghostRenderer.clearGhosts();
          this._setAtomHighlight(null);
          this._approachingAtom = null;
          this.grabberState = 'GRABBED';
          return;
        }
      }
    }

    // Find nearest ghost within dock threshold
    let nearestGhost: GhostInfo | null = null;
    let nearestDist = Infinity;

    for (const ghost of this._ghostRenderer.getGhosts()) {
      const d = this._meshScreenDist(ghost.mesh, tipScreenX, tipScreenY);
      if (d < nearestDist) { nearestDist = d; nearestGhost = ghost; }
    }

    if (nearestGhost !== null && nearestDist < GHOST_DOCK_PX) {
      this._nearestGhost = nearestGhost;
      this.grabberState = 'DOCKING';
    } else {
      this._nearestGhost = null;
    }
  }

  private _stateDocking(
    det: GestureDetector,
    tipScreenX: number,
    tipScreenY: number,
  ): void {
    // Re-find the nearest ghost (the closest one may have changed)
    let nearestGhost: GhostInfo | null = null;
    let nearestDist = Infinity;

    for (const ghost of this._ghostRenderer.getGhosts()) {
      const d = this._meshScreenDist(ghost.mesh, tipScreenX, tipScreenY);
      if (d < nearestDist) { nearestDist = d; nearestGhost = ghost; }
    }

    if (nearestGhost === null || nearestDist > GHOST_DOCK_PX * HYSTERESIS) {
      this._nearestGhost = null;
      this.grabberState = 'APPROACHING';
      return;
    }

    this._nearestGhost = nearestGhost;

    if (det.pinchTriggered) {
      // Bond the held element at this ghost position.
      // builder.onChanged fires: ghosts cleared, state reset to GRABBED.
      this._builder.linkNow(nearestGhost.atom, nearestGhost.connectionBitfield);
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Project mesh world position to screen and return distance to (sx, sy). */
  private _meshScreenDist(mesh: THREE.Mesh, sx: number, sy: number): number {
    mesh.getWorldPosition(this._worldPos);
    this._ndc.copy(this._worldPos).project(this._camera);
    const mx = ((this._ndc.x + 1) / 2) * this._canvas.clientWidth;
    const my = ((-this._ndc.y + 1) / 2) * this._canvas.clientHeight;
    return Math.hypot(sx - mx, sy - my);
  }

  /** Reverse-lookup: find the mesh that corresponds to the given atom. O(n) but n ≪ 50. */
  private _meshForAtom(atom: Atom): THREE.Mesh | null {
    for (const [mesh, a] of this._atomMeshToAtom) {
      if (a === atom) return mesh;
    }
    return null;
  }

  /**
   * Apply or clear the emissive highlight on an atom mesh.
   * - Restores the previous mesh's original material before switching.
   * - Pass `null` to clear any current highlight.
   * - Uses `_materialLibrary.getHighlightMaterial()` so the highlight
   *   material is owned and disposed by the library, not here.
   */
  private _setAtomHighlight(mesh: THREE.Mesh | null): void {
    if (mesh === this._highlightedMesh) return; // no-op if nothing changed

    // Restore the previous highlighted mesh to its original material
    if (this._highlightedMesh !== null && this._originalMaterial !== null) {
      this._highlightedMesh.material = this._originalMaterial;
      this._originalMaterial  = null;
    }
    this._highlightedMesh = mesh;

    // Apply highlight to the new mesh
    if (mesh !== null) {
      const atom = this._atomMeshToAtom.get(mesh);
      if (atom) {
        this._originalMaterial = mesh.material as THREE.Material;
        mesh.material = this._materialLibrary.getHighlightMaterial(atom.element);
      }
    }
  }

  /**
   * Draw (or hide) the targeting line connecting the 3D cursor to its target:
   *
   * - GRABBED + atom within 2× approach threshold → dashed white line to nearest unsaturated atom
   * - APPROACHING → solid element-colored line to the approaching atom
   * - DOCKING     → solid element-colored line to the nearest ghost sphere
   * - All other states → line hidden
   *
   * Must be called after both the state machine and _updateCursor() have run
   * (relies on _planeHit being fresh and _nearestAtomMesh / _nearestGhost up-to-date).
   */
  private _updateTargetLine(): void {
    const state = this.grabberState;

    // Determine target world position
    let targetPos: THREE.Vector3 | null = null;

    if (state === 'GRABBED') {
      if (this._simpleMode) {
        // Simple mode: solid line to nearest ghost when in range
        if (this._nearestGhost !== null) {
          this._nearestGhost.mesh.getWorldPosition(this._targetLineAtomPos);
          targetPos = this._targetLineAtomPos;
        }
      } else if (this._nearestAtomMesh !== null &&
          this._nearestAtomScreenDist < ATOM_APPROACH_PX * 2) {
        this._nearestAtomMesh.getWorldPosition(this._targetLineAtomPos);
        targetPos = this._targetLineAtomPos;
      }
    } else if (state === 'APPROACHING') {
      const mesh = this._approachingAtom ? this._meshForAtom(this._approachingAtom) : null;
      if (mesh) {
        mesh.getWorldPosition(this._targetLineAtomPos);
        targetPos = this._targetLineAtomPos;
      }
    } else if (state === 'DOCKING') {
      if (this._nearestGhost) {
        this._nearestGhost.mesh.getWorldPosition(this._targetLineAtomPos);
        targetPos = this._targetLineAtomPos;
      }
    }

    if (!targetPos || !this._grabberHandDetected) {
      this._targetLine.visible = false;
      return;
    }

    // Update the two-point geometry (cursor → target)
    const attr = this._targetLineGeom.getAttribute('position') as THREE.BufferAttribute;
    const cursor = this._planeHit; // populated by _updateCursor earlier this frame
    attr.setXYZ(0, cursor.x, cursor.y, cursor.z);
    attr.setXYZ(1, targetPos.x, targetPos.y, targetPos.z);
    attr.needsUpdate = true;

    if (state === 'GRABBED' && !this._simpleMode) {
      // Option A dashed white: computeLineDistances() is required for dashes to render
      this._targetLine.material = this._targetLineDashedMat;
      this._targetLine.computeLineDistances();
    } else {
      // Solid, tinted with the grabbed element's color
      this._targetLineSolidMat.color.copy(this._grabbedSphereMat.color);
      this._targetLine.material = this._targetLineSolidMat;
    }

    this._targetLine.visible = true;
  }

  /**
   * Position and style the 3D cursor (ring + sphere) at the fingertip.
   *
   * The cursor ring is visible whenever the grabber hand is detected.
   * The filled sphere is visible only in GRABBED / APPROACHING / DOCKING states.
   * Both are unprojected from screen coords to the z=0 plane of the 3D scene.
   */
  private _updateCursor(tipScreenX: number, tipScreenY: number): void {
    if (!this._grabberHandDetected) {
      this._cursorRing.visible   = false;
      this._grabbedSphere.visible = false;
      return;
    }

    // Convert screen coords → NDC → ray → intersect z=0 plane
    this._raycaster.setFromCamera(
      new THREE.Vector2(
        (tipScreenX / this._canvas.clientWidth)  * 2 - 1,
        -(tipScreenY / this._canvas.clientHeight) * 2 + 1,
      ),
      this._camera,
    );

    if (!this._raycaster.ray.intersectPlane(this._zeroPlane, this._planeHit)) {
      this._cursorRing.visible   = false;
      this._grabbedSphere.visible = false;
      return;
    }

    const pos   = this._planeHit;
    const state = this.grabberState;

    // ── Cursor ring: always visible, billboarded to face camera ───────────────
    this._cursorRing.position.copy(pos);
    this._cursorRing.quaternion.copy(this._camera.quaternion);
    this._cursorRing.visible = true;

    // ── State-based appearance ────────────────────────────────────────────────
    if (state === 'IDLE') {
      this._cursorRingMat.color.setRGB(1, 1, 1);
      this._cursorRingMat.opacity = 0.6;
      this._cursorRing.scale.setScalar(1);
      this._grabbedSphere.visible = false;
    } else if (state === 'BROWSING') {
      if (this._hoveredElementColor) {
        const { r, g, b } = this._hoveredElementColor;
        this._cursorRingMat.color.setRGB(r, g, b);
      } else {
        this._cursorRingMat.color.setRGB(1, 1, 1);
      }
      this._cursorRingMat.opacity = 0.9;
      this._cursorRing.scale.setScalar(1);
      this._grabbedSphere.visible = false;
    } else if (state === 'GRABBED') {
      if (this._currentAtomMeshes.length === 0) {
        // First-atom mode: gentle pulse on both ring and sphere so the user can
        // see where to pinch. Slower frequency and lower opacity than APPROACHING
        // to give a calm "waiting" feel rather than urgency.
        const pulse = 1 + 0.12 * Math.sin(this._totalTimeMs * 0.003);
        this._cursorRingMat.color.setRGB(1, 1, 1);
        this._cursorRingMat.opacity = 0.65;
        this._cursorRing.scale.setScalar(pulse);
        this._grabbedSphere.position.copy(pos);
        this._grabbedSphere.scale.setScalar(1.333 * pulse);
        this._grabbedSphereMat.opacity = 0.55; // more ghost-like
        this._grabbedSphere.visible = true;
      } else if (this._simpleMode && this._nearestGhost !== null) {
        // Simple mode: ghost within dock range → green "ready to place" signal
        this._cursorRingMat.color.setRGB(0.15, 1, 0.3);
        this._cursorRingMat.opacity = 0.9;
        this._cursorRing.scale.setScalar(1);
        this._grabbedSphere.position.copy(pos);
        this._grabbedSphere.scale.setScalar(1.333);
        this._grabbedSphereMat.opacity = 0.85;
        this._grabbedSphere.visible = true;
      } else {
        this._cursorRingMat.color.setRGB(1, 1, 1);
        this._cursorRingMat.opacity = 0.8;
        this._cursorRing.scale.setScalar(1);
        this._grabbedSphere.position.copy(pos);
        // 0.4 / 0.3 ≈ 1.333: plan calls for slightly larger sphere in GRABBED
        this._grabbedSphere.scale.setScalar(1.333);
        this._grabbedSphereMat.opacity = 0.75;
        this._grabbedSphere.visible = true;
      }
    } else if (state === 'APPROACHING') {
      // Pulse both ring and sphere to signal "getting close"
      const pulse = 1 + 0.18 * Math.sin(this._totalTimeMs * 0.006);
      this._cursorRingMat.color.setRGB(1, 1, 1);
      this._cursorRingMat.opacity = 0.8;
      this._cursorRing.scale.setScalar(pulse);
      this._grabbedSphere.position.copy(pos);
      this._grabbedSphere.scale.setScalar(1.333 * pulse);
      this._grabbedSphereMat.opacity = 0.75;
      this._grabbedSphere.visible = true;
    } else {
      // DOCKING: green tint signals "ready to place"
      this._cursorRingMat.color.setRGB(0.15, 1, 0.3);
      this._cursorRingMat.opacity = 0.9;
      this._cursorRing.scale.setScalar(1);
      this._grabbedSphere.position.copy(pos);
      this._grabbedSphere.scale.setScalar(1.333);
      this._grabbedSphereMat.opacity = 0.85;
      this._grabbedSphere.visible = true;
    }
  }
}
