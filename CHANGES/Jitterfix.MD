# Jitter Fix: AR Molecule Rendering Stability

## Problem

The molecule renders cleanly in desktop mode but jitters/flickers in AR mode — even when the video background is hidden. Root cause: `Platform._setAnchorMatrix()` is called every frame and unconditionally sets `matrixWorldNeedsUpdate = true` on `moleculeAnchor`, forcing Three.js to recompute world matrices for all descendant meshes. This happens even when inputs haven't meaningfully changed, because:

1. `Cube.rotation.slerp(target, 0.4)` never reaches exact target — quaternion drifts by sub-pixel amounts indefinitely
2. `_setAnchorMatrix` runs every frame including fallback mode with constant `(0, 0, -200)`
3. Auto-scale reads the jittering anchor matrix position each frame, feeding micro-changes back into `_setAnchorMatrix`
4. Molecule group children have `matrixAutoUpdate = true` — Three.js recomputes all their local matrices every frame unnecessarily

## Fix 1 — SLERP snap-to-target

**File:** `src/objects/Cube.ts`

After each `slerp` call in `refreshState`, snap to exact target when within epsilon. Two sites:

```typescript
// Site 1 (no physical cube, mouse fallback):
this.rotation.slerp(this._mouseTargetQuat, SLERP_FRICTION);
if (Math.abs(this.rotation.dot(this._mouseTargetQuat)) >= 1 - 1e-6) {
  this.rotation.copy(this._mouseTargetQuat);
}

// Site 2 (physical cube visible):
this.rotation.slerp(this._newestQuat, SLERP_FRICTION);
if (Math.abs(this.rotation.dot(this._newestQuat)) >= 1 - 1e-6) {
  this.rotation.copy(this._newestQuat);
}
```

When the user drags or the physical cube moves, the dot product drops well below `1 - 1e-6` and SLERP runs normally until reconvergence.

## Fix 2 — Dirty flag on moleculeAnchor matrix

**File:** `src/objects/Platform.ts`

Add fields (initialized so first frame always runs):
```typescript
private _lastAnchorTx = 0;
private _lastAnchorTy = 0;
private _lastAnchorTz = 0;
private _lastAnchorS  = -1;   // -1 = never set, forces first frame
private readonly _lastAnchorQuat = new THREE.Quaternion();
```

Guard `_setAnchorMatrix` — skip matrix recomputation when inputs haven't changed:
```typescript
private _setAnchorMatrix(tx: number, ty: number, tz: number): void {
  const s = MOLECULE_AR_SCALE * this._moleculeScale;
  const q = this._cube.rotation;

  const tChanged = Math.abs(tx - this._lastAnchorTx) > 0.01 ||
                   Math.abs(ty - this._lastAnchorTy) > 0.01 ||
                   Math.abs(tz - this._lastAnchorTz) > 0.01;
  const sChanged = Math.abs(s - this._lastAnchorS) > 1e-5;
  const rChanged = Math.abs(q.dot(this._lastAnchorQuat)) < 1 - 1e-6;

  if (this._lastAnchorS >= 0 && !tChanged && !sChanged && !rChanged) return;

  this._lastAnchorTx = tx; this._lastAnchorTy = ty; this._lastAnchorTz = tz;
  this._lastAnchorS = s;
  this._lastAnchorQuat.copy(q);

  this._T.makeTranslation(tx, ty, tz);
  this._R.makeRotationFromQuaternion(q);
  this._R.elements[0] *= s; this._R.elements[1] *= s; this._R.elements[2]  *= s;
  this._R.elements[4] *= s; this._R.elements[5] *= s; this._R.elements[6]  *= s;
  this._R.elements[8] *= s; this._R.elements[9] *= s; this._R.elements[10] *= s;
  this.moleculeAnchor.matrix.multiplyMatrices(this._T, this._R);
  this.moleculeAnchor.matrixWorldNeedsUpdate = true;
}
```

Translation epsilon: 0.01 mm (sub-pixel at 200 mm depth). Scale epsilon: 1e-5. Rotation epsilon: consistent with Fix 1.

## Fix 3 — Auto-scale threshold guard

**File:** `src/objects/ArObjectManager.ts`

Add field: `private _appliedMoleculeScale = 1.0;`

Replace step 9 in `update()`:
```typescript
if (this._moleculeBoundingRadius > 0) {
  const newScale = this._computeAutoScale();
  if (Math.abs(newScale - this._appliedMoleculeScale) > 0.005) {
    this._appliedMoleculeScale = newScale;
    this.platform.setMoleculeScale(newScale);
  }
}
```

Reset `_appliedMoleculeScale = 1.0` in `dispose()`. The 0.5% threshold prevents micro-changes in anchor position from triggering scale updates, while still allowing genuine rescaling (e.g. large molecule added).

## Fix 4 — Disable matrixAutoUpdate on molecule group

**File:** `src/rendering/MoleculeRenderer.ts`

In `renderMolecule()`, after the group is fully built, before returning:
```typescript
group.matrixAutoUpdate = false;
group.traverse((child) => { child.matrixAutoUpdate = false; });
```

Atom/bond meshes are static within the group (positioned at creation time, never mutated). Safe in all modes: desktop (group rebuilt on every `onChanged`), AR (moleculeAnchor handles the transform), hand-tracking (pivot group handles motion at a higher level).

## Files to modify

| File | Change |
|------|--------|
| `src/objects/Cube.ts` | Fix 1: snap-to-target after each slerp (2 additions) |
| `src/objects/Platform.ts` | Fix 2: 5 new fields + dirty flag guard in `_setAnchorMatrix` |
| `src/objects/ArObjectManager.ts` | Fix 3: 1 new field + threshold guard + dispose reset |
| `src/rendering/MoleculeRenderer.ts` | Fix 4: 2 lines disabling matrixAutoUpdate after group build |

## Verification

1. `npm run test` — all tests pass (no chemistry or rendering logic changes)
2. Desktop mode: build a molecule, verify clean stable rendering (no regression)
3. AR fallback mode (no markers): verify molecule is stable, no jitter
4. Mouse-drag cube rotation: verify smooth rotation still works
5. Large molecule (e.g. benzene): verify auto-scale still triggers when molecule grows
