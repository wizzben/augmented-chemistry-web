import * as THREE from 'three';
import type { Atom } from '@/chemistry/Atom';
import { mat44Multiply } from '@/chemistry/Matrix44';
import { setTetraMatrices, type TetraMatrices } from '@/chemistry/TetraGeometry';
import { AC_ATOM_COUNT_CONNECTIONS_OF_BITFIELD } from '@/chemistry/constants';
import { getPoolOfPossibleConnections } from '@/chemistry/Bitfield';

export interface GhostInfo {
  mesh: THREE.Mesh;
  atom: Atom;
  connectionBitfield: number;
}

// Small dots — raycasted for interaction (shared geometry, instance-owned materials)
const GHOST_GEOMETRY = new THREE.SphereGeometry(0.1, 8, 6);

// Corner slot indices in the 14-entry transform array (bitfields 1,2,4,8 → indices 0,1,3,7)
const CORNER_INDICES = [0, 1, 3, 7] as const;
// All 6 edges of a tetrahedron (pairs of corner indices into CORNER_INDICES)
const TETRA_EDGES = [[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]] as const;

export class GhostRenderer {
  private ghosts: GhostInfo[] = [];
  private wireframe: THREE.LineSegments | null = null;
  private wireframeGeo: THREE.BufferGeometry | null = null;
  private tetra: TetraMatrices;

  // Per-instance materials so dispose() doesn't break other GhostRenderer instances.
  private readonly _ghostMaterials: THREE.MeshPhongMaterial[];
  private readonly _wireframeMat: THREE.LineBasicMaterial;

  constructor(tetra?: TetraMatrices) {
    this.tetra = tetra ?? setTetraMatrices(1.0);
    this._ghostMaterials = [
      new THREE.MeshPhongMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.8, depthWrite: false }),
      new THREE.MeshPhongMaterial({ color: 0xdddd00, transparent: true, opacity: 0.8, depthWrite: false }),
      new THREE.MeshPhongMaterial({ color: 0x00ccdd, transparent: true, opacity: 0.8, depthWrite: false }),
    ];
    this._wireframeMat = new THREE.LineBasicMaterial({ color: 0x4466aa, transparent: true, opacity: 0.35 });
  }

  /**
   * Show a wireframe tetrahedron + small bond-order dots at all valid positions.
   * Returns GhostInfo list so DesktopControls can raycast against the dots.
   */
  showGhosts(atom: Atom, scene: THREE.Scene): GhostInfo[] {
    this.clearGhosts();

    if (atom.done) return this.ghosts;

    // ── Wireframe tetrahedron ────────────────────────────────────────────────
    const corners = CORNER_INDICES.map((idx) => {
      const wm = mat44Multiply(this.tetra.transform[atom.language][idx], atom.matrix);
      return new THREE.Vector3(wm[12], wm[13], wm[14]);
    });

    const positions = new Float32Array(TETRA_EDGES.length * 2 * 3);
    let offset = 0;
    for (const [a, b] of TETRA_EDGES) {
      positions[offset++] = corners[a].x;
      positions[offset++] = corners[a].y;
      positions[offset++] = corners[a].z;
      positions[offset++] = corners[b].x;
      positions[offset++] = corners[b].y;
      positions[offset++] = corners[b].z;
    }
    this.wireframeGeo = new THREE.BufferGeometry();
    this.wireframeGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.wireframe = new THREE.LineSegments(this.wireframeGeo, this._wireframeMat);
    scene.add(this.wireframe);

    // ── Bond-position dots ───────────────────────────────────────────────────
    const pool = getPoolOfPossibleConnections(atom.getConnectionBitField(), atom.element.valence);

    for (let i = 0; i < 14; i++) {
      if (!pool[i]) continue;

      const candidateBitfield = i + 1; // 1..14
      const bondOrder = AC_ATOM_COUNT_CONNECTIONS_OF_BITFIELD[candidateBitfield]; // 1, 2, or 3
      const worldMatrix = mat44Multiply(this.tetra.transform[atom.language][i], atom.matrix);

      const mesh = new THREE.Mesh(GHOST_GEOMETRY, this._ghostMaterials[bondOrder - 1]);
      mesh.position.set(worldMatrix[12], worldMatrix[13], worldMatrix[14]);
      scene.add(mesh);

      this.ghosts.push({ mesh, atom, connectionBitfield: candidateBitfield });
    }

    return this.ghosts;
  }

  clearGhosts(): void {
    for (const g of this.ghosts) {
      g.mesh.removeFromParent();
    }
    this.ghosts = [];

    if (this.wireframe) {
      this.wireframe.removeFromParent();
      this.wireframe = null;
    }
    if (this.wireframeGeo) {
      this.wireframeGeo.dispose();
      this.wireframeGeo = null;
    }
  }

  /**
   * Add bond-position dots for one atom WITHOUT clearing existing ghosts or
   * adding a wireframe tetrahedron. Used by Option D (simple mode) to display
   * every unsaturated atom's valid bond positions simultaneously.
   */
  addGhostsForAtom(atom: Atom, scene: THREE.Scene): void {
    if (atom.done) return;

    const pool = getPoolOfPossibleConnections(atom.getConnectionBitField(), atom.element.valence);

    for (let i = 0; i < 14; i++) {
      if (!pool[i]) continue;

      const candidateBitfield = i + 1;
      const bondOrder = AC_ATOM_COUNT_CONNECTIONS_OF_BITFIELD[candidateBitfield];
      const worldMatrix = mat44Multiply(this.tetra.transform[atom.language][i], atom.matrix);

      const mesh = new THREE.Mesh(GHOST_GEOMETRY, this._ghostMaterials[bondOrder - 1]);
      mesh.position.set(worldMatrix[12], worldMatrix[13], worldMatrix[14]);
      scene.add(mesh);

      this.ghosts.push({ mesh, atom, connectionBitfield: candidateBitfield });
    }
  }

  getGhosts(): GhostInfo[] {
    return this.ghosts;
  }

  dispose(): void {
    this.clearGhosts();
    for (const mat of this._ghostMaterials) mat.dispose();
    this._wireframeMat.dispose();
  }
}
