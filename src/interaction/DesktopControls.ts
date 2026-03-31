import * as THREE from 'three';
import type { Atom } from '@/chemistry/Atom';
import type { SceneManager } from '@/rendering/SceneManager';
import type { MoleculeGeometryData } from '@/rendering/MoleculeGeometry';
import { GhostRenderer, type GhostInfo } from '@/rendering/GhostRenderer';
import { AC_ATOM_COUNT_CONNECTIONS_OF_BITFIELD } from '@/chemistry/constants';
import type { MoleculeBuilder } from './MoleculeBuilder';

const DRAG_THRESHOLD_PX = 5;

export class DesktopControls {
  private sceneManager: SceneManager;
  private builder: MoleculeBuilder;
  private infoBar: HTMLElement;
  private ghostRenderer: GhostRenderer;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();

  private atomMeshes: THREE.Mesh[] = [];
  private hoveredAtom: Atom | null = null;
  private ghosts: GhostInfo[] = [];

  // Track mousedown position to distinguish click from orbit drag
  private mouseDownX = 0;
  private mouseDownY = 0;

  constructor(sceneManager: SceneManager, builder: MoleculeBuilder, infoBar: HTMLElement) {
    this.sceneManager = sceneManager;
    this.builder = builder;
    this.infoBar = infoBar;
    this.ghostRenderer = new GhostRenderer();

    const canvas = sceneManager.renderer.domElement;
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mousedown', this.onMouseDown);
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
    } else if (hitAtom === null) {
      this.hoveredAtom = null;
    }

    // Ghost hover: scale highlight + info bar
    const ghostMeshes = this.ghosts.map((g) => g.mesh);
    const ghostHit = this.raycaster.intersectObjects(ghostMeshes)[0] ?? null;

    for (const g of this.ghosts) g.mesh.scale.setScalar(1.0);

    if (ghostHit) {
      ghostHit.object.scale.setScalar(1.3);
      const ghost = this.ghosts.find((g) => g.mesh === ghostHit.object);
      if (ghost) {
        const bondOrder = AC_ATOM_COUNT_CONNECTIONS_OF_BITFIELD[ghost.connectionBitfield];
        const bondLabel = bondOrder === 1 ? 'Single bond' : bondOrder === 2 ? 'Double bond' : 'Triple bond';
        const elName = this.builder.getCurrentElement()?.name ?? 'atom';
        this.infoBar.textContent = `${bondLabel} \u2014 click to place ${elName}`;
      }
    } else if (this.ghosts.length > 0) {
      this.infoBar.textContent = 'Hover a ghost sphere to select bond type';
    }
  };

  private onMouseDown = (event: MouseEvent): void => {
    this.mouseDownX = event.clientX;
    this.mouseDownY = event.clientY;
  };

  private onClick = (event: MouseEvent): void => {
    // Ignore if the mouse was dragged (orbit/pan gesture).
    const dx = event.clientX - this.mouseDownX;
    const dy = event.clientY - this.mouseDownY;
    if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;

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

    // Click on nothing — dismiss ghosts.
    this.ghostRenderer.clearGhosts();
    this.ghosts = [];
  };

  dispose(): void {
    const canvas = this.sceneManager.renderer.domElement;
    canvas.removeEventListener('mousemove', this.onMouseMove);
    canvas.removeEventListener('mousedown', this.onMouseDown);
    canvas.removeEventListener('click', this.onClick);
    this.ghostRenderer.dispose();
  }
}
