import * as THREE from 'three';
import type { AtomPlacement } from './MoleculeGeometry';
import type { MaterialLibrary } from './MaterialLibrary';

/** Ratio of currentAtomScale/currentTetraScale = 8/20 */
const ATOM_SCALE = 0.4;
const SPHERE_SEGMENTS = 24;
const SPHERE_RINGS = 12;

export class AtomRenderer {
  private sphereGeo: THREE.SphereGeometry;

  constructor() {
    this.sphereGeo = new THREE.SphereGeometry(1.0, SPHERE_SEGMENTS, SPHERE_RINGS);
  }

  createAtomMesh(placement: AtomPlacement, materials: MaterialLibrary): THREE.Mesh {
    const material = materials.getAtomMaterial(placement.atom.element);
    const mesh = new THREE.Mesh(this.sphereGeo, material);
    mesh.scale.setScalar(ATOM_SCALE * placement.atom.element.radius);
    mesh.position.set(
      placement.position[0],
      placement.position[1],
      placement.position[2],
    );
    mesh.userData.atom = placement.atom;
    return mesh;
  }

  dispose(): void {
    this.sphereGeo.dispose();
  }
}
