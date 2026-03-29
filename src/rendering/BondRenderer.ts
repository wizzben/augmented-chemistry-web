import * as THREE from 'three';
import type { BondPlacement } from './MoleculeGeometry';

/** Ratio of stick radius / tetraScale = 3.0 / 20.0 */
const BOND_RADIUS = 0.15;
const CYLINDER_SEGMENTS = 10;

const _origin = new THREE.Vector3();
const _target = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();

export class BondRenderer {
  private cylinderGeo: THREE.CylinderGeometry;

  constructor() {
    // Unit-height cylinder along Y-axis
    this.cylinderGeo = new THREE.CylinderGeometry(
      BOND_RADIUS, BOND_RADIUS, 1.0, CYLINDER_SEGMENTS, 1,
    );
  }

  createBondMesh(bond: BondPlacement, material: THREE.Material): THREE.Mesh {
    _origin.set(bond.originPos[0], bond.originPos[1], bond.originPos[2]);
    _target.set(bond.targetPos[0], bond.targetPos[1], bond.targetPos[2]);
    _dir.subVectors(_target, _origin);
    const length = _dir.length();
    _dir.normalize();

    _mid.addVectors(_origin, _target).multiplyScalar(0.5);

    const mesh = new THREE.Mesh(this.cylinderGeo, material);
    mesh.position.copy(_mid);
    mesh.scale.set(1, length, 1);

    // Rotate from Y-axis to bond direction
    _quat.setFromUnitVectors(_yAxis, _dir);
    mesh.quaternion.copy(_quat);

    return mesh;
  }

  dispose(): void {
    this.cylinderGeo.dispose();
  }
}
