/**
 * ArObjectManager — orchestrates all Phase 5 AR interaction objects.
 *
 * Owns and updates: 11 ElementMarkers, 1 Cube, 1 Transport, 5 PushButtons, 1 Platform.
 * Also owns an AR-specific MoleculeRenderer and overrides builder.onChanged so the
 * molecule group is parented under Platform.moleculeAnchor rather than the scene root.
 *
 * Call update() once per frame after arManager.processFrame().
 * Call triggerLink() on canvas tap (AR mode active).
 * Call dispose() when AR mode is exited.
 */

import * as THREE from 'three';
import type { MarkerState } from '@/ar/MarkerState';
import type { MoleculeBuilder } from '@/interaction/MoleculeBuilder';
import type { MaterialLibrary } from '@/rendering/MaterialLibrary';
import { MoleculeRenderer } from '@/rendering/MoleculeRenderer';
import { setTetraMatrices } from '@/chemistry/TetraGeometry';
import { computeMoleculeGeometry } from '@/rendering/MoleculeGeometry';
import { ELEMENTS_BY_SYMBOL } from '@/chemistry/Element';
import { ElementMarker } from './ElementMarker';
import { Cube } from './Cube';
import { Transport } from './Transport';
import { PushButton } from './PushButton';
import { Platform } from './Platform';
import type { MoleculeGeometryData } from '@/rendering/MoleculeGeometry';

/** Distance threshold beyond which the flirt arrow is hidden. */
const FLIRT_ARROW_MAX_DISTANCE = 300;

/** [markerName, elementSymbol] pairs — 11 element markers. */
const ELEMENT_MARKER_DEFS: [string, string][] = [
  ['element_C',  'C'],
  ['element_H',  'H'],
  ['element_O',  'O'],
  ['element_N',  'N'],
  ['element_Br', 'Br'],
  ['element_Cl', 'Cl'],
  ['element_F',  'F'],
  ['element_K',  'K'],
  ['element_Li', 'Li'],
  ['element_Mg', 'Mg'],
  ['element_Na', 'Na'],
];

export class ArObjectManager {
  private markerState: MarkerState;
  private builder: MoleculeBuilder;
  private scene: THREE.Scene;

  readonly elementMarkers: ElementMarker[];
  readonly cube: Cube;
  readonly transport: Transport;
  readonly pushButtons: PushButton[];
  readonly platform: Platform;

  /** Whether browse mode is active (set by the 'browser' PushButton). */
  browseMode = false;

  // ── AR molecule renderer ───────────────────────────────────────────────────
  private _arRenderer: MoleculeRenderer;
  /** builder.onChanged before we overrode it — restored on dispose. */
  private _savedOnChanged: (geo: MoleculeGeometryData) => void;

  // ── Three.js overlay meshes ────────────────────────────────────────────────
  private arrowGroup: THREE.Group;
  private grabbedSphere: THREE.Mesh;
  private grabbedSphereMat: THREE.MeshPhongMaterial;

  constructor(
    markerState: MarkerState,
    builder: MoleculeBuilder,
    scene: THREE.Scene,
    materialLibrary: MaterialLibrary,
    /** Optional: called when the benzene push-button is toggled on. */
    onBenzene?: () => void,
  ) {
    this.markerState = markerState;
    this.builder = builder;
    this.scene = scene;

    // ── Element markers ────────────────────────────────────────────────────
    this.elementMarkers = ELEMENT_MARKER_DEFS.map(([name, sym]) => {
      const el = ELEMENTS_BY_SYMBOL.get(sym)!;
      const mat = materialLibrary.getAtomMaterial(el);
      const em = new ElementMarker(name, el, mat);
      scene.add(em.mesh);
      return em;
    });

    // ── Cube ───────────────────────────────────────────────────────────────
    this.cube = new Cube();

    // ── Transport ──────────────────────────────────────────────────────────
    this.transport = new Transport();

    // ── Platform ───────────────────────────────────────────────────────────
    const tetra = setTetraMatrices(1.0);
    this.platform = new Platform(this.transport, this.cube, builder, tetra, scene);

    // ── Push buttons ──────────────────────────────────────────────────────
    this.pushButtons = [
      new PushButton('labeling', false, (_v) => {
        // Stub: atom label toggle (Phase 6)
      }),
      new PushButton('el_negativity', false, (_v) => {
        // Stub: electronegativity display toggle (Phase 6)
      }),
      new PushButton('browser', true, (v) => {
        this.browseMode = v;
      }),
      new PushButton('empty', true, (v) => {
        if (v) builder.reset();
      }),
      new PushButton('benzene', true, (v) => {
        if (v) onBenzene?.();
      }),
    ];

    // ── Flirt arrow ────────────────────────────────────────────────────────
    this.arrowGroup = this._buildArrow();
    this.arrowGroup.visible = false;
    scene.add(this.arrowGroup);

    // ── Grabbed element sphere ─────────────────────────────────────────────
    this.grabbedSphereMat = new THREE.MeshPhongMaterial({ color: 0xffffff });
    this.grabbedSphere = new THREE.Mesh(
      new THREE.SphereGeometry(20, 16, 12),
      this.grabbedSphereMat,
    );
    this.grabbedSphere.visible = false;
    this.grabbedSphere.matrixAutoUpdate = false;
    scene.add(this.grabbedSphere);

    // ── AR molecule renderer ───────────────────────────────────────────────
    // Intercept builder.onChanged so molecule groups go under moleculeAnchor.
    this._arRenderer = new MoleculeRenderer();
    this._savedOnChanged = builder.onChanged;

    builder.onChanged = (geo: MoleculeGeometryData) => {
      this._arRenderer.clear(); // removes old group from moleculeAnchor
      if (geo.atoms.length > 0) {
        const { group } = this._arRenderer.renderMolecule(builder.getMolecule());
        this.platform.moleculeAnchor.add(group);
      }
    };

    // Render existing molecule (if any) immediately under moleculeAnchor
    const mol = builder.getMolecule();
    if (mol.atoms.length > 0) {
      const geo = computeMoleculeGeometry(mol);
      builder.onChanged(geo);
    }
  }

  /** Call once per frame after arManager.processFrame(). */
  update(): void {
    const { markerState, builder, transport, cube, elementMarkers, pushButtons, platform } = this;

    // 1. Element markers
    for (const em of elementMarkers) em.refreshState(markerState);

    // 2. Cube
    cube.refreshState(markerState);

    // 3. Transport
    transport.refreshState(markerState, elementMarkers, this.browseMode);

    // 4. Push buttons — pass platform visibility
    for (const btn of pushButtons) btn.refreshState(markerState, platform.visible);

    // 5. Platform
    platform.refreshState(markerState);

    // 6. Sync grabbed element → builder current element
    if (transport.grabbedElement) {
      builder.setElement(transport.grabbedElement.element);
    }

    // 7. Update Three.js mesh visibilities
    this._updateTransportMeshes();
  }

  /** Call on canvas tap when AR mode is active. */
  triggerLink(): void {
    this.platform.triggerLink();
  }

  dispose(): void {
    // Restore original builder.onChanged
    this.builder.onChanged = this._savedOnChanged;

    // Clean up AR renderer
    this._arRenderer.dispose();

    // Re-render current molecule into desktop scene via original handler
    const mol = this.builder.getMolecule();
    if (mol.atoms.length > 0) {
      const geo = computeMoleculeGeometry(mol);
      this._savedOnChanged(geo);
    }

    // Platform
    this.platform.dispose();

    // Element markers
    for (const em of this.elementMarkers) {
      this.scene.remove(em.mesh);
      em.dispose();
    }

    // Arrow + grabbed sphere
    this.scene.remove(this.arrowGroup);
    this._disposeGroup(this.arrowGroup);
    this.scene.remove(this.grabbedSphere);
    this.grabbedSphere.geometry.dispose();
    this.grabbedSphereMat.dispose();

    for (const btn of this.pushButtons) btn.reset();
    this.browseMode = false;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _updateTransportMeshes(): void {
    const { transport } = this;

    if (!transport.visible) {
      this.arrowGroup.visible = false;
      this.grabbedSphere.visible = false;
      return;
    }

    const tPos = transport.getPosition();

    // Flirt arrow
    if (transport.flirt && transport.distanceToFlirt < FLIRT_ARROW_MAX_DISTANCE) {
      const fPos = transport.flirt.getPosition();
      this.arrowGroup.position.copy(tPos);
      this.arrowGroup.lookAt(fPos);
      this.arrowGroup.visible = true;
    } else {
      this.arrowGroup.visible = false;
    }

    // Grabbed element sphere
    if (transport.grabbedElement) {
      this.grabbedSphere.matrix.copy(transport.matrix);
      this.grabbedSphere.matrixWorldNeedsUpdate = true;
      const elColor = transport.grabbedElement.element.color;
      this.grabbedSphereMat.color.setRGB(elColor.r, elColor.g, elColor.b);
      this.grabbedSphere.visible = true;
    } else {
      this.grabbedSphere.visible = false;
    }
  }

  private _buildArrow(): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshPhongMaterial({ color: 0xff3300 });

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 100, 12), mat);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = 50;
    group.add(shaft);

    const tip = new THREE.Mesh(new THREE.ConeGeometry(6, 20, 12), mat);
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 110;
    group.add(tip);

    return group;
  }

  private _disposeGroup(group: THREE.Group): void {
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }
}
