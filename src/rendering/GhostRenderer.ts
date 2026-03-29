import * as THREE from 'three';
import type { Atom } from '@/chemistry/Atom';
import { mat44Multiply } from '@/chemistry/Matrix44';
import { setTetraMatrices, type TetraMatrices } from '@/chemistry/TetraGeometry';
import { AC_ATOM_CONNECTION, AC_ATOM_MAX_CONNECTIONS } from '@/chemistry/constants';

export interface GhostInfo {
  mesh: THREE.Mesh;
  atom: Atom;
  connectionBitfield: number;
}

const GHOST_GEOMETRY = new THREE.SphereGeometry(0.3, 16, 8);
const GHOST_MATERIAL = new THREE.MeshPhongMaterial({
  color: 0xaaaaaa,
  transparent: true,
  opacity: 0.5,
  depthWrite: false,
});

export class GhostRenderer {
  private ghosts: GhostInfo[] = [];
  private tetra: TetraMatrices;

  constructor(tetra?: TetraMatrices) {
    this.tetra = tetra ?? setTetraMatrices(1.0);
  }

  /**
   * Show ghost spheres at all free bond slots of the given atom.
   * Returns the GhostInfo list so DesktopControls can raycast against them.
   */
  showGhosts(atom: Atom, scene: THREE.Scene): GhostInfo[] {
    this.clearGhosts();

    for (let i = 0; i < AC_ATOM_MAX_CONNECTIONS; i++) {
      if (atom.connection[i] !== null) continue;

      const slotBitfield = AC_ATOM_CONNECTION[i]; // 0x1, 0x2, 0x4, or 0x8
      const transformIdx = slotBitfield - 1;
      const worldMatrix = mat44Multiply(
        this.tetra.transform[atom.language][transformIdx],
        atom.matrix,
      );

      const mesh = new THREE.Mesh(GHOST_GEOMETRY, GHOST_MATERIAL);
      mesh.position.set(worldMatrix[12], worldMatrix[13], worldMatrix[14]);
      scene.add(mesh);

      this.ghosts.push({ mesh, atom, connectionBitfield: slotBitfield });
    }

    return this.ghosts;
  }

  clearGhosts(): void {
    for (const g of this.ghosts) {
      g.mesh.removeFromParent();
    }
    this.ghosts = [];
  }

  getGhosts(): GhostInfo[] {
    return this.ghosts;
  }

  dispose(): void {
    this.clearGhosts();
  }
}
