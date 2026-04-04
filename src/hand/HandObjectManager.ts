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
import { MoleculeRenderer } from '@/rendering/MoleculeRenderer';
import { GhostRenderer, type GhostInfo } from '@/rendering/GhostRenderer';
import { computeMoleculeGeometry } from '@/rendering/MoleculeGeometry';

// ── Tuning constants ─────────────────────────────────────────────────────────
/** Fraction (0–1) of the palm rotation delta applied each frame. Lower = smoother. */
const ROTATION_DAMPING = 0.3;
/** Sensitivity of closed-fist vertical movement to scale change per normalized unit. */
const ZOOM_SENSITIVITY = 2.5;
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 5.0;
/** Screen-space pixel radius within which the grabber finger "approaches" an atom. */
const ATOM_APPROACH_PX = 80;
/** Screen-space pixel radius within which the grabber finger docks to a ghost. */
const GHOST_DOCK_PX = 60;
/** Hysteresis factor: exit-threshold = enter-threshold × this multiplier. */
const HYSTERESIS = 1.5;

// ── State type (exported for HandOverlay) ────────────────────────────────────
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

  // ── Atom mesh ↔ Atom mapping ───────────────────────────────────────────────
  private _currentAtomMeshes: THREE.Mesh[] = [];
  private readonly _atomMeshToAtom = new Map<THREE.Mesh, Atom>();

  // ── Zoom tracking ─────────────────────────────────────────────────────────
  private _pivotScale = 1.0;
  private _prevFistY: number | null = null;

  // ── Grabbed element sphere (follows fingertip while element is held) ───────
  private readonly _grabbedSphere: THREE.Mesh;
  private readonly _grabbedSphereMat: THREE.MeshPhongMaterial;

  // ── Reusable Three.js scratch objects (avoid per-frame allocations) ────────
  private readonly _dampedQ  = new THREE.Quaternion();
  private readonly _worldPos = new THREE.Vector3();
  private readonly _ndc      = new THREE.Vector3();
  private readonly _raycaster = new THREE.Raycaster();
  private readonly _zeroPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private readonly _planeHit  = new THREE.Vector3();

  // ── Frame timing ──────────────────────────────────────────────────────────
  private _lastTimestamp = -1;

  constructor(
    builder: MoleculeBuilder,
    sceneManager: SceneManager,
    /** Unused in this substep but present for symmetry with ArObjectManager. */
    _materialLibrary: MaterialLibrary,
    atomGrabList: AtomGrabList,
    ghostRenderer: GhostRenderer,
  ) {
    this._builder      = builder;
    this._scene        = sceneManager.scene;
    this._camera       = sceneManager.camera;
    this._canvas       = sceneManager.renderer.domElement;
    this._atomGrabList = atomGrabList;
    this._ghostRenderer = ghostRenderer;

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

    // ── Intercept builder.onChanged ────────────────────────────────────────
    this._savedOnChanged = builder.onChanged;

    builder.onChanged = (geo: MoleculeGeometryData) => {
      // Clear ghosts before re-rendering (ghost meshes are pivotGroup children)
      this._ghostRenderer.clearGhosts();
      this._approachingAtom = null;
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

    // Update gesture detectors (reset if hand not present)
    if (rotLm && rotWl) {
      this._detectorRotation.update(rotLm, rotWl, elapsedMs);
    } else {
      this._detectorRotation.reset();
      this._prevFistY = null;
    }

    if (grabLm && grabWl) {
      this._detectorGrabber.update(grabLm, grabWl, elapsedMs);
    } else {
      this._detectorGrabber.reset();
    }

    this._processRotationHand();
    this._processGrabberHand();
  }

  setSwapHands(v: boolean): void {
    this._swapHands = v;
    this._detectorRotation.reset();
    this._detectorGrabber.reset();
    this._prevFistY = null;
  }

  dispose(): void {
    // Restore original builder.onChanged
    this._builder.onChanged = this._savedOnChanged;

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

    // Clean up grabbed sphere
    this._scene.remove(this._grabbedSphere);
    this._grabbedSphere.geometry.dispose();
    this._grabbedSphereMat.dispose();

    // Clear UI state
    this._atomGrabList.highlightElement(null);
    this._detectorRotation.reset();
    this._detectorGrabber.reset();
  }

  // ── Private: rotation / zoom hand ─────────────────────────────────────────

  private _processRotationHand(): void {
    const det = this._detectorRotation;

    if (det.isOpen) {
      this._prevFistY = null;

      // Apply a fraction of the rotation delta (damping reduces jitter).
      // Skip near-identity deltas to avoid drift when hand is held still.
      const delta = det.rotationDelta;
      if (delta.w < 0.9999) {
        // Slerp: identity → delta, factor = ROTATION_DAMPING
        this._dampedQ.identity().slerp(delta, ROTATION_DAMPING);
        this._pivotGroup.quaternion.multiply(this._dampedQ).normalize();
      }
    } else {
      // Closed fist: vertical movement → scale
      const tipY = det.indexTip.y;
      if (tipY > 0 && this._prevFistY !== null) {
        // Moving fist up (y decreasing) → zoom in; down → zoom out
        const yDelta = this._prevFistY - tipY;
        const multiplier = 1 + yDelta * ZOOM_SENSITIVITY;
        this._pivotScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this._pivotScale * multiplier));
        this._pivotGroup.scale.setScalar(this._pivotScale);
      }
      this._prevFistY = tipY;
    }
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

    switch (this.grabberState) {
      case 'IDLE':
      case 'BROWSING':
        this._stateIdleBrowsing(det, tipPageX, tipPageY);
        break;
      case 'GRABBED':
        this._stateGrabbed(det, tipScreenX, tipScreenY);
        break;
      case 'APPROACHING':
        this._stateApproaching(det, tipScreenX, tipScreenY);
        break;
      case 'DOCKING':
        this._stateDocking(det, tipScreenX, tipScreenY);
        break;
    }

    this._updateGrabbedSphere(tipScreenX, tipScreenY);
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
      if (det.pinchTriggered) {
        this._builder.setElement(el);
        this._grabbedSphereMat.color.setRGB(el.color.r, el.color.g, el.color.b);
        this.grabberState = 'GRABBED';
        this._atomGrabList.highlightElement(null);
      }
    } else if (this.grabberState === 'BROWSING') {
      this.grabberState = 'IDLE';
    }
  }

  private _stateGrabbed(
    det: GestureDetector,
    tipScreenX: number,
    tipScreenY: number,
  ): void {
    const mol = this._builder.getMolecule();

    // Empty molecule: pinch anywhere to place the first atom
    if (mol.atoms.length === 0) {
      if (det.pinchTriggered) {
        this._builder.addFirstAtom();
        // builder.onChanged fires: state stays GRABBED, mesh map is rebuilt
      }
      return;
    }

    // Find the closest unsaturated atom mesh within threshold
    let nearestAtom: Atom | null = null;
    let nearestDist = Infinity;

    for (const mesh of this._currentAtomMeshes) {
      const atom = this._atomMeshToAtom.get(mesh);
      if (!atom || atom.done) continue;

      const d = this._meshScreenDist(mesh, tipScreenX, tipScreenY);
      if (d < nearestDist) { nearestDist = d; nearestAtom = atom; }
    }

    if (nearestAtom !== null && nearestDist < ATOM_APPROACH_PX) {
      this._approachingAtom = nearestAtom;
      // Ghosts are placed in pivotGroup local space via cast (runtime-safe since
      // THREE.Group.add === THREE.Object3D.add, which THREE.Scene also uses).
      this._ghostRenderer.showGhosts(nearestAtom, this._pivotGroup as unknown as THREE.Scene);
      this.grabberState = 'APPROACHING';
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

  /** Position the grabbed-element sphere at the fingertip (unprojected to z=0 plane). */
  private _updateGrabbedSphere(tipScreenX: number, tipScreenY: number): void {
    if (this.grabberState === 'IDLE' || this.grabberState === 'BROWSING') {
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

    if (this._raycaster.ray.intersectPlane(this._zeroPlane, this._planeHit)) {
      this._grabbedSphere.position.copy(this._planeHit);
      this._grabbedSphere.visible = true;
    }
  }
}
