import * as THREE from 'three';
import { ALL_ELEMENTS, type Element } from '@/chemistry/Element';

export class MaterialLibrary {
  private atomMaterials = new Map<string, THREE.MeshPhongMaterial>();
  private bondMat: THREE.MeshPhongMaterial;

  constructor() {
    // Create per-element atom materials matching ac_graphics.c:80-83
    for (const el of ALL_ELEMENTS) {
      const mat = new THREE.MeshPhongMaterial({
        color: new THREE.Color(el.color.r, el.color.g, el.color.b),
        specular: new THREE.Color(1.0, 1.0, 1.0),
        shininess: 20,
      });
      this.atomMaterials.set(el.symbol, mat);
    }

    // Bond material: gray with high shininess (aco_platform.c:1676-1678)
    // polygonOffset pushes bonds slightly behind atoms in the depth buffer,
    // eliminating z-fighting where the cylinder intersects the sphere.
    this.bondMat = new THREE.MeshPhongMaterial({
      color: new THREE.Color(0.7, 0.7, 0.7),
      specular: new THREE.Color(1.0, 1.0, 1.0),
      shininess: 100,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
  }

  getAtomMaterial(element: Element): THREE.MeshPhongMaterial {
    return this.atomMaterials.get(element.symbol)!;
  }

  getBondMaterial(): THREE.MeshPhongMaterial {
    return this.bondMat;
  }

  dispose(): void {
    for (const mat of this.atomMaterials.values()) mat.dispose();
    this.bondMat.dispose();
  }
}
