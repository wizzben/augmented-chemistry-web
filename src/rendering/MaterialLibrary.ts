import * as THREE from 'three';
import { ALL_ELEMENTS, type Element } from '@/chemistry/Element';

/** White emissive intensity applied to an atom mesh when the grabber hand approaches it. */
const HIGHLIGHT_EMISSIVE = 0.28;

export class MaterialLibrary {
  private atomMaterials = new Map<string, THREE.MeshPhongMaterial>();
  private bondMat: THREE.MeshPhongMaterial;
  /**
   * Per-element highlight materials: clones of the base material with an
   * emissive boost. Created lazily on first use, cached for reuse.
   * Owned by this library — disposed in dispose().
   */
  private highlightMaterials = new Map<string, THREE.MeshPhongMaterial>();

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
    this.bondMat = new THREE.MeshPhongMaterial({
      color: new THREE.Color(0.7, 0.7, 0.7),
      specular: new THREE.Color(1.0, 1.0, 1.0),
      shininess: 100,
    });
  }

  getAtomMaterial(element: Element): THREE.MeshPhongMaterial {
    return this.atomMaterials.get(element.symbol)!;
  }

  getBondMaterial(): THREE.MeshPhongMaterial {
    return this.bondMat;
  }

  /**
   * Return a cached clone of the atom material for `element` with a white
   * emissive boost applied — used for hover/approach highlighting in
   * markerless mode. The returned instance is owned by this library.
   */
  getHighlightMaterial(element: Element): THREE.MeshPhongMaterial {
    let hl = this.highlightMaterials.get(element.symbol);
    if (!hl) {
      hl = this.getAtomMaterial(element).clone() as THREE.MeshPhongMaterial;
      hl.emissive.setRGB(HIGHLIGHT_EMISSIVE, HIGHLIGHT_EMISSIVE, HIGHLIGHT_EMISSIVE);
      this.highlightMaterials.set(element.symbol, hl);
    }
    return hl;
  }

  dispose(): void {
    for (const mat of this.atomMaterials.values()) mat.dispose();
    this.bondMat.dispose();
    for (const mat of this.highlightMaterials.values()) mat.dispose();
    this.highlightMaterials.clear();
  }
}
