/**
 * Platform — the molecule-assembly surface.  Ports aco_platform.c.
 *
 * Responsibilities:
 *  1. Track the 'platform' AR marker with tranquilizer low-pass smoothing.
 *     Falls back to a fixed position after 30 frames without a visible marker.
 *  2. Position a THREE.Group (moleculeAnchor) at platform-translation × cube-rotation.
 *     The molecule renderer group is reparented under this anchor so the molecule
 *     floats at the physical platform marker, oriented by the cube.
 *  3. Every frame (transport + grabbed element visible): find the closest
 *     unsaturated atom, determine which tetrahedral slot the transport points at,
 *     and show a pulsing ghost sphere at the target bond position.
 *  4. On triggerLink() (canvas tap): add the first atom or bond a new one.
 *
 * All distance calculations happen in molecule-local space (scale 1.0) by
 * inverting the moleculeAnchor matrix to bring the transport position local.
 * The moleculeAnchor's scale factor (MOLECULE_AR_SCALE) maps local units to mm.
 */

import * as THREE from 'three';
import type { Atom } from '@/chemistry/Atom';
import type { MarkerState } from '@/ar/MarkerState';
import type { MoleculeBuilder } from '@/interaction/MoleculeBuilder';
import type { TetraMatrices } from '@/chemistry/TetraGeometry';
import { mat44Multiply } from '@/chemistry/Matrix44';
import {
  AC_ATOM_CONNECTION,
  AC_ATOM_COUNT_CONNECTIONS_OF_BITFIELD,
} from '@/chemistry/constants';
import { getPoolOfPossibleConnections } from '@/chemistry/Bitfield';
import type { Transport } from './Transport';
import type { Cube } from './Cube';

// ── Constants ──────────────────────────────────────────────────────────────

/** Low-pass filter weight — ported from aco_platform.c:227 */
const TRANQUILIZER = 0.9;

/**
 * Normalised distance threshold below which a tetrahedral corner
 * is included in selectionBitField — ported from aco_platform.c:334
 */
const CORNER_DISTANCE_THRESHOLD = 0.3;

/**
 * Multiplier from molecule-local units (bond = 1.7) to AR millimetres.
 * Applied via moleculeAnchor.matrix scale so atom.matrix stays at scale 1.0.
 */
export const MOLECULE_AR_SCALE = 30;

/** Corner slot indices into the 14-entry tetra transform array (bitfields 1,2,4,8). */
const CORNER_INDICES = [0, 1, 3, 7] as const;

/** Absolute-difference tolerance for circle (ring) detection, in mol-local units. */
const CIRCLE_TOLERANCE = 0.1;

const _GHOST_PULSE_STEP = 0.2; // radians per frame

// ── Shared bond-selection utility ─────────────────────────────────────────

export interface BondSlotResult {
  selection: Atom | null;
  selectionBitField: number;
  circlePartner: Atom | null;
}

/**
 * Find the best tetrahedral bond slot for a virtual "transport" at `localPos`
 * (in molecule-local space). Used by both Platform (physical transport) and
 * VirtualTransport (fallback). Returns null selection when no valid slot exists.
 */
export function findBestBondSlot(
  mol: { atoms: Atom[] },
  localPos: { x: number; y: number; z: number },
  tetra: TetraMatrices,
  grabValence: number,
): BondSlotResult {
  const { x: tlx, y: tly, z: tlz } = localPos;

  // 3a: find closest unsaturated atom
  let minDistSq = Infinity;
  let sel: Atom | null = null;
  for (const atom of mol.atoms) {
    if (atom.done) continue;
    const dx = atom.matrix[12] - tlx;
    const dy = atom.matrix[13] - tly;
    const dz = atom.matrix[14] - tlz;
    const dSq = dx * dx + dy * dy + dz * dz;
    if (dSq < minDistSq) { minDistSq = dSq; sel = atom; }
  }
  if (!sel) return { selection: null, selectionBitField: 0, circlePartner: null };

  // 3b: compute squared distances from localPos to each of the 4 tetrahedral corners
  const cornerDistSq = [0, 0, 0, 0];
  const cornerRelDist = [0, 0, 0, 0];
  let maxSq = 0, minSq = Infinity;
  for (let i = 0; i < 4; i++) {
    const cm = mat44Multiply(tetra.transform[sel.language][CORNER_INDICES[i]], sel.matrix);
    const dx = cm[12] - tlx, dy = cm[13] - tly, dz = cm[14] - tlz;
    const dSq = dx * dx + dy * dy + dz * dz;
    cornerDistSq[i] = dSq;
    if (dSq > maxSq) maxSq = dSq;
    if (dSq < minSq) minSq = dSq;
  }

  // 3c: determine selectionBitField
  let bitfield = 0;
  const range = maxSq - minSq;
  if (range > 1e-10) {
    const base = 1.0 / range;
    for (let i = 0; i < 4; i++) {
      cornerRelDist[i] = (cornerDistSq[i] - minSq) * base;
      if (cornerRelDist[i] < CORNER_DISTANCE_THRESHOLD) bitfield |= AC_ATOM_CONNECTION[i];
    }
  } else {
    bitfield = AC_ATOM_CONNECTION[0]; // all equidistant → pick slot 0
  }

  // 3d: validate; fall back to closest valid alternative if needed
  if (!_isValidConnection(sel, bitfield, grabValence)) {
    bitfield = _findBestAlternative(sel, cornerRelDist, grabValence);
  }

  if (bitfield === 0) return { selection: sel, selectionBitField: 0, circlePartner: null };

  // 3e: circle (ring) detection — detect but don't link (disabled in C, line 1040)
  const newMat = mat44Multiply(tetra.transform[sel.language][bitfield - 1], sel.matrix);
  const npx = newMat[12], npy = newMat[13], npz = newMat[14];
  let circlePartner: Atom | null = null;
  for (const atom of mol.atoms) {
    if (
      Math.abs(npx - atom.matrix[12]) < CIRCLE_TOLERANCE &&
      Math.abs(npy - atom.matrix[13]) < CIRCLE_TOLERANCE &&
      Math.abs(npz - atom.matrix[14]) < CIRCLE_TOLERANCE
    ) {
      circlePartner = atom;
      break;
    }
  }

  return { selection: sel, selectionBitField: bitfield, circlePartner };
}

function _isValidConnection(atom: Atom, bitfield: number, grabValence: number): boolean {
  if (bitfield === 0) return false;
  const newCount = AC_ATOM_COUNT_CONNECTIONS_OF_BITFIELD[bitfield];
  const existing = AC_ATOM_COUNT_CONNECTIONS_OF_BITFIELD[atom.bitField];
  return (
    (atom.bitField & bitfield) === 0 &&
    newCount + existing <= atom.element.valence &&
    newCount <= grabValence
  );
}

function _findBestAlternative(atom: Atom, cornerRelDist: number[], grabValence: number): number {
  const pool = getPoolOfPossibleConnections(atom.bitField, atom.element.valence);
  let bestBF = 0;
  let bestDev = Infinity;
  for (let i = 0; i < 14; i++) {
    if (!pool[i]) continue;
    if (AC_ATOM_COUNT_CONNECTIONS_OF_BITFIELD[i + 1] > grabValence) continue;
    let dev = 0;
    for (let j = 0; j < 4; j++) {
      if (AC_ATOM_CONNECTION[j] & (i + 1)) dev += cornerRelDist[j];
    }
    if (dev < bestDev) { bestDev = dev; bestBF = i + 1; }
  }
  return bestBF;
}

// ── Platform ──────────────────────────────────────────────────────────────

export class Platform {
  visible = false;

  /**
   * Platform marker pose matrix after tranquilizer smoothing.
   * Meaningful only when visible === true.
   */
  readonly matrix = new THREE.Matrix4();

  /**
   * Closest unsaturated atom to transport — computed each frame.
   * null when transport is absent or molecule is empty/saturated.
   */
  selection: Atom | null = null;

  /**
   * Tetrahedral slot bitfield for the pending bond — computed each frame.
   * 0 when no valid connection is available.
   */
  selectionBitField = 0;

  /**
   * If the target bond position coincides with an existing atom (ring),
   * this holds that atom.  Circular bonding is disabled (same as C code).
   */
  circlePartner: Atom | null = null;

  /**
   * A THREE.Group whose matrix is platformTranslation × cubeRotation × AR_SCALE.
   * The molecule renderer group and ghost sphere are children of this group,
   * so they live in molecule-local space and inherit the AR transform.
   */
  readonly moleculeAnchor: THREE.Group;

  private readonly _transport: Transport;
  private readonly _cube: Cube;
  private readonly _builder: MoleculeBuilder;
  private readonly _tetra: TetraMatrices;

  private _lastPos = new THREE.Vector3();
  private _hasLastPos = false;

  // Platform fallback state (Step 7a)
  private _fallbackActive = false;
  private _fallbackFrames = 0;

  /** Extra scale applied on top of MOLECULE_AR_SCALE — used for auto-fit. */
  private _moleculeScale = 1.0;

  private readonly _ghostSphere: THREE.Mesh;
  private readonly _ghostMat: THREE.MeshPhongMaterial;
  private _pulseT = 0;

  // Reused every frame to avoid GC pressure
  private readonly _invAnchor = new THREE.Matrix4();
  private readonly _T = new THREE.Matrix4();
  private readonly _R = new THREE.Matrix4();

  constructor(
    transport: Transport,
    cube: Cube,
    builder: MoleculeBuilder,
    tetra: TetraMatrices,
    scene: THREE.Scene,
  ) {
    this._transport = transport;
    this._cube = cube;
    this._builder = builder;
    this._tetra = tetra;

    // ── Molecule anchor group ────────────────────────────────────────────────
    this.moleculeAnchor = new THREE.Group();
    this.moleculeAnchor.matrixAutoUpdate = false;
    this.moleculeAnchor.visible = false;
    scene.add(this.moleculeAnchor);

    // ── Ghost sphere (child of anchor — position in mol-local coords) ─────────
    this._ghostMat = new THREE.MeshPhongMaterial({
      color: 0xff6600,
      emissive: new THREE.Color(0, 0, 0),
      transparent: true,
      opacity: 0.85,
    });
    this._ghostSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 10, 10),
      this._ghostMat,
    );
    this._ghostSphere.visible = false;
    this.moleculeAnchor.add(this._ghostSphere);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** aco_platform_03refreshState — call once per frame. */
  refreshState(markerState: MarkerState): void {
    this.selection = null;
    this.selectionBitField = 0;
    this.circlePartner = null;

    // ── Step 1: visibility + tranquilizer smoothing ───────────────────────────
    const pose = markerState.getPose('platform');
    if (pose?.visible) {
      // Marker present — reset fallback state
      this._fallbackFrames = 0;
      this._fallbackActive = false;
      this.visible = true;
      this.moleculeAnchor.visible = true;

      this.matrix.copy(pose.matrix);
      const me = this.matrix.elements;
      if (this._hasLastPos) {
        me[12] += (this._lastPos.x - me[12]) * TRANQUILIZER;
        me[13] += (this._lastPos.y - me[13]) * TRANQUILIZER;
        me[14] += (this._lastPos.z - me[14]) * TRANQUILIZER;
      }
      this._lastPos.set(me[12], me[13], me[14]);
      this._hasLastPos = true;

      this._setAnchorMatrix(me[12], me[13], me[14]);
    } else {
      // Marker absent — activate fallback after 30 frames
      this._fallbackFrames++;
      if (this._fallbackFrames > 30) this._fallbackActive = true;

      if (!this._fallbackActive) {
        this.visible = false;
        this.moleculeAnchor.visible = false;
        this._ghostSphere.visible = false;
        return;
      }

      // Fallback: center molecule in view at fixed depth
      this.visible = true;
      this.moleculeAnchor.visible = true;
      this._setAnchorMatrix(0, 0, -200);
    }

    // ── Step 3: transport interaction ─────────────────────────────────────────
    const mol = this._builder.getMolecule();
    if (mol.atoms.length === 0 || mol.done) {
      this._ghostSphere.visible = false;
      return;
    }
    if (!this._transport.visible || !this._transport.grabbedElement) {
      this._ghostSphere.visible = false;
      return;
    }

    // Transform transport world position → molecule-local space
    this._invAnchor.copy(this.moleculeAnchor.matrix).invert();
    const tLocal = this._transport.getPosition().applyMatrix4(this._invAnchor);

    const grabValence = this._transport.grabbedElement.element.valence;
    const result = findBestBondSlot(mol, tLocal, this._tetra, grabValence);

    this.selection = result.selection;
    this.selectionBitField = result.selectionBitField;
    this.circlePartner = result.circlePartner;

    if (!result.selection || result.selectionBitField === 0) {
      this._ghostSphere.visible = false;
      return;
    }

    // Ghost sphere at target bond position
    const newMat = mat44Multiply(
      this._tetra.transform[result.selection.language][result.selectionBitField - 1],
      result.selection.matrix,
    );
    this._ghostSphere.position.set(newMat[12], newMat[13], newMat[14]);
    this._pulseT += _GHOST_PULSE_STEP;
    const emissive = (Math.sin(this._pulseT) + 1.0) / 9;
    this._ghostMat.emissive.setScalar(emissive);
    this._ghostSphere.visible = true;
  }

  /**
   * aco_platform_05mouseEvent / aco_platform_06linkNow — called on canvas tap.
   * Adds first atom or bonds a new one at the current selection.
   */
  triggerLink(): void {
    if (!this._transport.grabbedElement) return;
    const mol = this._builder.getMolecule();

    if (mol.atoms.length === 0) {
      this._builder.addFirstAtom();
    } else if (this.selection !== null && this.selectionBitField > 0 && this.circlePartner === null) {
      this._builder.linkNow(this.selection, this.selectionBitField);
    }
  }

  /** Set an extra scale factor applied on top of MOLECULE_AR_SCALE (for auto-fit). */
  setMoleculeScale(s: number): void {
    this._moleculeScale = s;
  }

  dispose(): void {
    this.moleculeAnchor.removeFromParent();
    this._ghostSphere.geometry.dispose();
    this._ghostMat.dispose();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Compute moleculeAnchor.matrix = T(tx,ty,tz) × R(cube) × S(MOLECULE_AR_SCALE × _moleculeScale). */
  private _setAnchorMatrix(tx: number, ty: number, tz: number): void {
    const s = MOLECULE_AR_SCALE * this._moleculeScale;
    this._T.makeTranslation(tx, ty, tz);
    this._R.makeRotationFromQuaternion(this._cube.rotation);
    this._R.elements[0] *= s; this._R.elements[1] *= s; this._R.elements[2]  *= s;
    this._R.elements[4] *= s; this._R.elements[5] *= s; this._R.elements[6]  *= s;
    this._R.elements[8] *= s; this._R.elements[9] *= s; this._R.elements[10] *= s;
    this.moleculeAnchor.matrix.multiplyMatrices(this._T, this._R);
    this.moleculeAnchor.matrixWorldNeedsUpdate = true;
  }
}
