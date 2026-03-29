import * as THREE from 'three';
import type { Molecule } from '@/chemistry/Molecule';
import { computeMoleculeGeometry } from './MoleculeGeometry';
import { MaterialLibrary } from './MaterialLibrary';
import { AtomRenderer } from './AtomRenderer';
import { BondRenderer } from './BondRenderer';

export class MoleculeRenderer {
  private group: THREE.Group | null = null;
  private materialLibrary: MaterialLibrary;
  private atomRenderer: AtomRenderer;
  private bondRenderer: BondRenderer;

  constructor() {
    this.materialLibrary = new MaterialLibrary();
    this.atomRenderer = new AtomRenderer();
    this.bondRenderer = new BondRenderer();
  }

  renderMolecule(molecule: Molecule): { group: THREE.Group; boundingRadius: number } {
    this.clear();

    const geo = computeMoleculeGeometry(molecule);
    const group = new THREE.Group();

    const bondMaterial = this.materialLibrary.getBondMaterial();

    for (const atomPlacement of geo.atoms) {
      const mesh = this.atomRenderer.createAtomMesh(atomPlacement, this.materialLibrary);
      group.add(mesh);
    }

    for (const bondPlacement of geo.bonds) {
      const mesh = this.bondRenderer.createBondMesh(bondPlacement, bondMaterial);
      group.add(mesh);
    }

    this.group = group;
    return { group, boundingRadius: geo.boundingRadius };
  }

  clear(): void {
    if (this.group) {
      this.group.removeFromParent();
      this.group = null;
    }
  }

  dispose(): void {
    this.clear();
    this.materialLibrary.dispose();
    this.atomRenderer.dispose();
    this.bondRenderer.dispose();
  }
}
