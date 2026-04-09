# Quaternion Rotation Refactoring — Implementation Plan

## Context

The current rotation hand in markerless mode applies palm quaternion deltas directly to a pivot group with slerp damping. There is no formal state machine for rotation — the rotation hand simply checks `isOpen` to decide between rotation (open palm) and zoom (closed fist). The spec in `Quaternion.MD` defines a proper 7-state FSM, target quaternion pattern, camera-relative rotation, scale-invariant pinch ratio, and a more stable 4-landmark hand basis.

**Scope:** Rotation hand only. Grabber state machine (IDLE→BROWSING→GRABBED→APPROACHING→DOCKING), zoom, swap-hands, and simple mode remain untouched.

**Decisions:**
- Camera-relative rotation: implement (future-proof, no-op with fixed camera)
- Pinch ratio: change to scale-invariant `||thumbTip - indexTip|| / ||indexMCP - pinkyMCP||`
- Hand basis: update to 4-landmark (wrist, indexMCP, middleMCP, pinkyMCP)

---

## Substep 1: Update Hand Basis to 4-Landmark System

**Goal:** More stable palm quaternion by adding middleMCP as the Y-axis reference.

**Files:**
- `src/hand/HandTracker.ts` — add `MIDDLE_MCP: 9` to `HAND_LANDMARKS` (line 29-38)
- `src/hand/GestureDetector.ts` — rewrite `_updateRotationDelta()` (line 192-230)

**Changes to `_updateRotationDelta()`:**
```
Current (3 landmarks):
  edge1 = indexMCP - wrist
  edge2 = pinkyMCP - wrist
  z = cross(edge1, edge2), x = normalize(edge1), y = cross(z, x)

New (4 landmarks):
  x = normalize(indexMCP - pinkyMCP)
  y' = normalize(middleMCP - wrist)
  z = normalize(cross(x, y'))
  y = normalize(cross(z, x))
```

**Why safe first:** Only `rotationDelta` output changes. Grabber hand never reads `rotationDelta`. `isPinching`/`isOpen` unaffected.

**Test updates:**
- `tests/hand/GestureDetector.test.ts` — rotation delta tests (lines ~236-274) must add landmark index 9 (middleMCP) to `withWorldOverrides` calls.

**Verify:** `npx vitest run tests/hand/GestureDetector.test.ts` — all pass.

**Memory action:** Compress

---

## Substep 2: Change Pinch Detection to Scale-Invariant Ratio

**Goal:** Pinch detection robust across hand sizes and camera distances.

**Files:**
- `src/hand/GestureDetector.ts` — rewrite `_updatePinch()` (line 130-167)

**Changes:**
1. Compute `palmWidth = ||indexMCP - pinkyMCP||` in normalized screen space
2. Guard: if `palmWidth < 0.001`, skip update (degenerate)
3. Compute `ratio = thumbIndexDist / palmWidth`
4. Update constants:
   - `PINCH_ON_THRESHOLD` → ~0.4 (was 0.055)
   - `PINCH_OFF_THRESHOLD` → ~0.6 (was 0.075)
5. All comparisons use `ratio` instead of raw `dist`
6. Update `pinchProgress` to use ratio and new thresholds

**Critical:** Both grabber and rotation hands share `_updatePinch()`. The ratio is scale-invariant, so it should improve both. Thresholds need empirical tuning during testing.

**Test updates:**
- `tests/hand/GestureDetector.test.ts` — all pinch tests (lines ~46-175) must:
  - Set landmarks 5 (indexMCP) and 17 (pinkyMCP) apart for valid denominator
  - Update threshold values in assertions to match new ratio scale
  - `flatLandmarks()` helper gives palmWidth=0, tests must use `withOverrides` to spread MCP landmarks

**Verify:** `npx vitest run tests/hand/GestureDetector.test.ts` + manual browser test at various hand distances.

**Memory action:** Compress

---

## Substep 3: Create Rotation FSM and Target Quaternion Pattern

**Goal:** Replace ad-hoc open-palm rotation with a proper 7-state FSM. Introduce target quaternion + slerp smoothing.

**Files:**
- `src/hand/HandObjectManager.ts`

**New type (near line 51):**
```ts
export type RotationState =
  | 'NO_HAND' | 'HAND_DETECTED' | 'READY'
  | 'GRABBED' | 'ROTATING' | 'RELEASED' | 'TRACKING_LOST';
```

**New config (replace old ROTATION_DAMPING / ROTATION_DEAD_ZONE):**
```ts
const ROTATION_CONFIG = {
  minRotationAngle: 0.025,    // radians (~1.4°, replaces ROTATION_DEAD_ZONE)
  smoothingAlpha: 0.3,        // slerp factor (replaces ROTATION_DAMPING)
  lostTrackingGraceMs: 300,   // hold state before transitioning to NO_HAND
};
```

**New private fields:**
- `_rotationState: RotationState = 'NO_HAND'`
- `_targetQuaternion = new THREE.Quaternion()` — target quaternion (replaces direct multiply)
- `_rotationGrabActive = false`
- `_trackingLostTimestamp = 0`

**Rewrite `_processRotationHand()`:**

```
Phase 1: Hand detection
  if (!rotationHandDetected):
    if was GRABBED/ROTATING → TRACKING_LOST (record timestamp)
    if TRACKING_LOST and grace expired → NO_HAND
    else if not TRACKING_LOST → NO_HAND
    return

  if state is NO_HAND or TRACKING_LOST → HAND_DETECTED, return
  if state is HAND_DETECTED → READY

Phase 2: Pinch clutch (uses _detectorRotation.isPinching)
  if READY and isPinching:
    → GRABBED, store _prevHandQ = current hand Q, set grabActive
  if RELEASED:
    → READY
  if (GRABBED or ROTATING) and !isPinching:
    → RELEASED, clear grabActive + prevHandQ

Phase 3: Rotation (only when grabActive)
  compute q_delta = prevHandQ^-1 * currentHandQ
  theta = 2 * acos(clamp(abs(q_delta.w), 0, 1))
  if theta < minRotationAngle → stay GRABBED (dead zone)
  else:
    apply camera-relative transform (substep 4 placeholder for now)
    _targetQuaternion = q_worldDelta * _targetQuaternion, normalize
    → ROTATING
  prevHandQ = currentHandQ

Phase 4: Zoom (preserved, runs when READY + hand closed)
  if state is READY and !det.isOpen → existing zoom logic (unchanged)

Phase 5: Smoothing
  _pivotGroup.quaternion.slerp(_targetQuaternion, smoothingAlpha)
  _pivotGroup.quaternion.normalize()
```

**Key difference from old code:** Old code applied damped delta directly each frame. New code accumulates into `_targetQuaternion` and slerps the render quaternion toward it. This decouples input from rendering.

**Important:** The rotation hand now uses `isPinching` as the clutch (pinch = grab = rotate). Previously it used `isOpen` to decide rotation vs zoom. The new model: pinch = rotation clutch, closed fist (not pinching, in READY state) = zoom. These don't conflict because each hand has its own GestureDetector instance.

**Also update `update()` (line 284-293):** When rotation hand not detected, don't reset detector immediately — let the FSM handle TRACKING_LOST grace period first. Move `_detectorRotation.reset()` to be called only when transitioning out of TRACKING_LOST to NO_HAND.

**Cleanup:**
- Remove `ROTATION_DAMPING` constant (line 30)
- Remove `ROTATION_DEAD_ZONE` constant (line 36)
- Remove old `delta.w < ROTATION_DEAD_ZONE` check
- Remove old `_dampedQ.identity().slerp(delta, ROTATION_DAMPING)` pattern

**Add public getter:**
- `get rotationState(): RotationState`

**Verify:** Manual browser test — pinch to grab, rotate, release. Zoom with closed fist when not pinching. Confirm state transitions.

**Memory action:** Compress

---

## Substep 4: Add Camera-Relative Rotation Transform

**Goal:** Rotation deltas feel natural relative to what's on screen, regardless of camera orientation.

**Files:**
- `src/hand/HandObjectManager.ts` — inside the ROTATING branch from substep 3

**Changes:** After computing `q_delta`, before applying to `_targetQuaternion`:
```ts
const qCam = this._camera.quaternion;
// q_worldDelta = q_cam * q_delta * q_cam^-1
this._qCamScratch.copy(qCam);
this._qCamInvScratch.copy(qCam).invert();
const qWorldDelta = this._qCamScratch.multiply(qDelta).multiply(this._qCamInvScratch).normalize();
this._targetQuaternion.premultiply(qWorldDelta).normalize();
```

**Add scratch quaternions** to avoid allocations:
- `_qCamScratch = new THREE.Quaternion()`
- `_qCamInvScratch = new THREE.Quaternion()`

**Note:** Camera is fixed at (0,0,10) looking at origin → camera quaternion is identity → this is a no-op currently. Correct for future camera movement.

**Verify:** Manual test — behavior unchanged (identity camera). Could add unit test with mocked non-identity camera quaternion.

**Memory action:** Compress

---

## Substep 5: Update Overlay and UI for Rotation States

**Goal:** Show persistent rotation state label and update visual indicators.

**Files:**
- `src/hand/HandOverlay.ts` — add rotation state label rendering
- `src/hand/HandObjectManager.ts` — expose `rotationState` getter (done in substep 3)
- `src/main.ts` — pass rotation state to overlay, update info bar guidance text

**HandOverlay changes:**
1. Add `rotationState?: RotationState` to update opts
2. New method `_drawRotationStateLabel()` — persistent label in overlay corner:
   | State | Label |
   |-------|-------|
   | NO_HAND | No hand detected |
   | HAND_DETECTED | Right hand detected |
   | READY | Ready to rotate |
   | GRABBED | Grab active |
   | ROTATING | Rotating |
   | RELEASED | Released |
   | TRACKING_LOST | Tracking lost |
3. Update `_drawRotationIndicator()`:
   - Show rotation arc when state is `ROTATING`
   - Show zoom arrows when state is `READY` and hand is closed
   - Show subtle ready indicator when `READY` and hand is open

**main.ts changes (lines ~391-420):**
- Pass `handObjectManager.rotationState` in overlay update call
- Update info bar text to incorporate rotation-state-aware guidance
- Grabber guidance takes priority when grabber is in active state

**Verify:** Manual visual test — state label appears, transitions correctly, rotation arc and zoom arrows appear at right times.

**Memory action:** Compress

---

## Substep 6: Add View Preset Buttons

**Goal:** Reset orientation, Front, Side, Top view buttons as specified.

**Files:**
- `index.html` — add 4 buttons (hidden by default, shown in markerless mode)
- `src/hand/HandObjectManager.ts` — add public methods:
  - `resetOrientation()` → sets `_targetQuaternion` to identity
  - `setViewPreset(view: 'front' | 'side' | 'top')` → sets `_targetQuaternion`:
    - Front: identity `(0, 0, 0, 1)`
    - Side: 90° around Y `(0, sin(π/4), 0, cos(π/4))`
    - Top: -90° around X `(sin(-π/4), 0, 0, cos(-π/4))`
- `src/main.ts` — button click handlers, show/hide with markerless mode

**Verify:** Manual test — click each button, molecule smoothly slerps to target orientation.

**Memory action:** Compress

---

## Substep 7: Extract RotationFSM, Add Tests, Final Cleanup

**Goal:** Testable FSM, new tests, remove dead code.

### 7a: Extract RotationFSM class

Create `src/hand/RotationFSM.ts` — pure logic class (no Three.js scene dependencies):
```ts
export class RotationFSM {
  state: RotationState = 'NO_HAND';
  grabActive = false;

  update(input: {
    handDetected: boolean;
    isPinching: boolean;
    deltaAngle: number;
    elapsedMs: number;
  }): void { /* FSM transitions */ }

  reset(): void { /* ... */ }
}
```

`HandObjectManager` delegates FSM transitions to this class, keeps quaternion math.

### 7b: Add tests

Create `tests/hand/RotationFSM.test.ts`:
- NO_HAND → HAND_DETECTED when hand appears
- HAND_DETECTED → READY on next frame
- READY → GRABBED when pinch engages
- GRABBED → ROTATING when delta exceeds dead zone
- ROTATING → RELEASED when pinch releases
- RELEASED → READY on next frame
- GRABBED/ROTATING → TRACKING_LOST when hand disappears
- TRACKING_LOST → NO_HAND after grace period expires
- Dead zone: stay in GRABBED when delta is tiny
- Grace period: stay in TRACKING_LOST during grace window

### 7c: Cleanup

- Remove `ROTATION_DAMPING` and `ROTATION_DEAD_ZONE` if not already removed in substep 3
- Remove old `_dampedQ` scratch quaternion if no longer used
- Remove any stale `rotationIsOpen`-type getters that are no longer consumed
- Verify `_zoomDirection` getter is still needed by HandOverlay; if overlay now uses `rotationState`, consider simplifying
- Clean up unused imports across modified files
- Run `npx vitest run` — all 753+ tests pass + new RotationFSM tests

### 7d: Update spec types (optional)

If desired, create `src/hand/RotationTypes.ts` with the types from the spec (`HandTrackingFrame`, `RotationControlFrame`, `RotationConfig`). These serve as documentation/contract types. Only create if they are consumed by actual code; otherwise skip to avoid dead code.

**Verify:** `npx vitest run` — full test suite passes.

**Memory action:** Clear (refactoring complete)

---

## Dependency Graph

```
Substep 1 (hand basis) ──┐
                          ├── Substep 3 (FSM + target Q) ── Substep 4 (camera-relative)
Substep 2 (pinch ratio) ─┘         │
                                    ├── Substep 5 (overlay/UI)
                                    ├── Substep 6 (view presets)
                                    └── Substep 7 (extract, tests, cleanup)
```

Substeps 1 and 2 are independent. Substeps 3-7 are sequential.

---

## Risk Notes

1. **Pinch thresholds (substep 2):** Ratio thresholds (~0.4/~0.6) are estimates. Affects both hands. Needs empirical tuning.
2. **Zoom coexistence (substep 3):** Zoom triggers on READY + closed fist. Pinch triggers GRABBED. These use different gestures (`isPinching` vs `!isOpen`), so no conflict — but must verify closed-fist-while-slightly-pinching edge case.
3. **Tracking grace period (substep 3):** Currently `update()` resets the detector immediately when hand not found (line 289). Must defer reset until FSM exits TRACKING_LOST.
