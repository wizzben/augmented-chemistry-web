import * as THREE from 'three';
import type { Atom } from '@/chemistry/Atom';
import type { SceneManager } from '@/rendering/SceneManager';
import type { MoleculeGeometryData } from '@/rendering/MoleculeGeometry';
import { GhostRenderer, type GhostInfo } from '@/rendering/GhostRenderer';
import type { MoleculeBuilder } from './MoleculeBuilder';

export class DesktopControls {
  private sceneManager: SceneManager;
  private builder: MoleculeBuilder;
  private ghostRenderer: GhostRenderer;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();

  private atomMeshes: THREE.Mesh[] = [];
  private hoveredAtom: Atom | null = null;
  private ghosts: GhostInfo[] = [];

  constructor(sceneManager: SceneManager, builder: MoleculeBuilder) {
    this.sceneManager = sceneManager;
    this.builder = builder;
    this.ghostRenderer = new GhostRenderer();

    const canvas = sceneManager.renderer.domElement;
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('click', this.onClick);
  }

  /**
   * Called by main.ts whenever the molecule geometry changes.
   * Updates the list of atom meshes used for raycasting.
   */
  updateGeometry(geo: MoleculeGeometryData, atomMeshes: THREE.Mesh[]): void {
    this.atomMeshes = atomMeshes;
    this.hoveredAtom = null;
    this.ghostRenderer.clearGhosts();
    this.ghosts = [];
    // Suppress unused-geo lint (geo could be used for future features)
    void geo;
  }

  private onMouseMove = (event: MouseEvent): void => {
    const canvas = this.sceneManager.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.sceneManager.camera);

    const hits = this.raycaster.intersectObjects(this.atomMeshes);
    const hitAtom: Atom | null = hits.length > 0 ? (hits[0].object.userData.atom as Atom) : null;

    if (hitAtom !== null && hitAtom !== this.hoveredAtom) {
      // Entered a new atom — refresh ghosts for this atom.
      this.hoveredAtom = hitAtom;
      this.ghosts = this.ghostRenderer.showGhosts(hitAtom, this.sceneManager.scene);
      this.sceneManager.controls.enabled = false;
    } else if (hitAtom === null) {
      // Not over any atom — just track that; ghosts stay visible for clicking.
      this.hoveredAtom = null;
    }
  };

  private onClick = (event: MouseEvent): void => {
    const canvas = this.sceneManager.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.sceneManager.camera);

    // Ghost meshes have priority
    const ghostMeshes = this.ghosts.map((g) => g.mesh);
    const ghostHits = this.raycaster.intersectObjects(ghostMeshes);
    if (ghostHits.length > 0) {
      const hitMesh = ghostHits[0].object as THREE.Mesh;
      const ghost = this.ghosts.find((g) => g.mesh === hitMesh);
      if (ghost) {
        this.builder.linkNow(ghost.atom, ghost.connectionBitfield);
      }
      return;
    }

    // Click on empty scene with no atoms — place first atom
    if (this.builder.getMolecule().atoms.length === 0) {
      this.builder.addFirstAtom();
      return;
    }

    // Click on nothing — dismiss ghosts and re-enable orbit.
    this.ghostRenderer.clearGhosts();
    this.ghosts = [];
    this.sceneManager.controls.enabled = true;
  };

  dispose(): void {
    const canvas = this.sceneManager.renderer.domElement;
    canvas.removeEventListener('mousemove', this.onMouseMove);
    canvas.removeEventListener('click', this.onClick);
    this.ghostRenderer.dispose();
    this.sceneManager.controls.enabled = true;
  }
}
