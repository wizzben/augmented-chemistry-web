/**
 * VirtualTransport — fallback interaction when the physical transport marker is absent.
 *
 * The virtual transport is a fixed point in WORLD space, offset to the LEFT of the
 * molecule centre (−X). Because moleculeAnchor.matrix changes as the cube rotates,
 * transforming that world point into mol-local space each frame means different atoms
 * / bond slots become "nearest" as the user rotates the molecule.
 *
 * Visuals: ghost spheres for all valid bond slots; the winning slot's ghost is made
 * to glow with a pulsing emissive by cloning its material.
 */

import * as THREE from 'three';
import type { Atom } from '@/chemistry/Atom';
import type { MoleculeBuilder } from '@/interaction/MoleculeBuilder';
import type { TetraMatrices } from '@/chemistry/TetraGeometry';
import { GhostRenderer } from '@/rendering/GhostRenderer';
import { findBestBondSlot } from './Platform';

/** World-space offset (AR mm) from molecule centre to virtual transport — left side. */
const WORLD_OFFSET_MM = -80;

const PULSE_STEP = 0.15; // radians per frame

export class VirtualTransport {
  private _active = false;
  private _selection: Atom | null = null;
  private _selectionBitField = 0;
  private _circlePartner: Atom | null = null;
  private _pulseT = 0;

  private readonly _ghostRenderer: GhostRenderer;
  private readonly _moleculeAnchor: THREE.Group;
  private readonly _tetra: TetraMatrices;

  // Cloned material on the winning ghost — lets us pulse emissive without
  // affecting the other ghosts that share the same GhostRenderer material.
  private _glowMat: THREE.MeshPhongMaterial | null = null;
  private _glowMesh: THREE.Mesh | null = null;
  private _glowOrigMat: THREE.MeshPhongMaterial | null = null;

  // Reused per-frame buffers
  private readonly _invAnchor = new THREE.Matrix4();
  private readonly _vtWorld = new THREE.Vector3();

  constructor(tetra: TetraMatrices, moleculeAnchor: THREE.Group) {
    this._tetra = tetra;
    this._moleculeAnchor = moleculeAnchor;
    this._ghostRenderer = new GhostRenderer(tetra);
  }

  get isActive(): boolean { return this._active; }

  setActive(active: boolean): void {
    if (!active && this._active) {
      this._clearGlow();
      this._ghostRenderer.clearGhosts();
      this._selection = null;
      this._selectionBitField = 0;
    }
    this._active = active;
  }

  /** Call after builder.onChanged to force ghost rebuild on next update(). */
  notifyMoleculeChanged(): void {
    this._clearGlow();
    this._ghostRenderer.clearGhosts();
    this._selection = null;
    this._selectionBitField = 0;
  }

  /** Call once per frame when active. */
  update(builder: MoleculeBuilder): void {
    if (!this._active) return;
    const el = builder.getCurrentElement();
    const mol = builder.getMolecule();

    if (!el || mol.done) {
      this._clearGlow();
      if (this._selection !== null) {
        this._ghostRenderer.clearGhosts();
        this._selection = null;
        this._selectionBitField = 0;
      }
      return;
    }

    if (mol.atoms.length === 0) {
      // READY — no ghosts yet; confirm() will place the first atom
      if (this._selection !== null) {
        this._clearGlow();
        this._ghostRenderer.clearGhosts();
        this._selection = null;
        this._selectionBitField = 0;
      }
      return;
    }

    // TARGETING — compute virtual transport in mol-local space each frame
    const me = this._moleculeAnchor.matrix.elements;
    this._vtWorld.set(me[12] + WORLD_OFFSET_MM, me[13], me[14]);
    this._invAnchor.copy(this._moleculeAnchor.matrix).invert();
    const vtLocal = this._vtWorld.applyMatrix4(this._invAnchor);

    const result = findBestBondSlot(mol, vtLocal, this._tetra, el.valence);

    if (result.selection !== this._selection || result.selectionBitField !== this._selectionBitField) {
      this._selection = result.selection;
      this._selectionBitField = result.selectionBitField;
      this._circlePartner = result.circlePartner;
      this._clearGlow();
      this._ghostRenderer.clearGhosts();

      if (result.selection && result.selectionBitField > 0) {
        this._ghostRenderer.showGhosts(result.selection, this._moleculeAnchor);
        this._applyGlow(result.selectionBitField);
      }
    }

    // Pulse the winning ghost every frame
    if (this._glowMat) {
      this._pulseT += PULSE_STEP;
      const p = (Math.sin(this._pulseT) + 1.0) / 2; // 0..1
      this._glowMat.emissive.setScalar(0.2 + p * 0.6); // 0.2..0.8
    }
  }

  /** Place first atom or bond at the currently highlighted slot. */
  confirm(builder: MoleculeBuilder): void {
    if (!this._active) return;
    const mol = builder.getMolecule();
    if (mol.atoms.length === 0) {
      builder.addFirstAtom();
    } else if (this._selection && this._selectionBitField > 0 && this._circlePartner === null) {
      builder.linkNow(this._selection, this._selectionBitField);
    }
  }

  dispose(): void {
    this._clearGlow();
    this._ghostRenderer.clearGhosts();
    this._ghostRenderer.dispose();
  }

  // ── Private ───────────────────────────────────────────────────────────────

  /** Clone the winning ghost's material so we can animate emissive independently. */
  private _applyGlow(selectionBitField: number): void {
    const winning = this._ghostRenderer.getGhosts().find(
      (g) => g.connectionBitfield === selectionBitField,
    );
    if (!winning) return;
    this._glowOrigMat = winning.mesh.material as THREE.MeshPhongMaterial;
    this._glowMat = this._glowOrigMat.clone();
    winning.mesh.material = this._glowMat;
    this._glowMesh = winning.mesh;
  }

  /** Restore the winning ghost's original material and dispose the clone. */
  private _clearGlow(): void {
    if (this._glowMesh && this._glowOrigMat) {
      this._glowMesh.material = this._glowOrigMat;
      this._glowMesh = null;
      this._glowOrigMat = null;
    }
    if (this._glowMat) {
      this._glowMat.dispose();
      this._glowMat = null;
    }
  }
}
