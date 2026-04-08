# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Web port of Augmented Chemistry, a ~20-year-old C/OpenGL/ARToolKit application for building organic molecules using AR markers. Ported to TypeScript/Three.js/Vite. See `IMPLEMENTATION_PLAN.md` for the full 7-phase plan; phases 1–5 are complete. Markerless mode visual feedback and interaction robustness improvements are also complete (see `Optimize_markerless.MD`). The markerless rotation subsystem has been refactored with a 7-state FSM, scale-invariant pinch detection, camera-relative rotation, and view preset buttons (see `Quaternation_Implementation.MD`).

The original C source lives in `../etc/` (sibling directory). Key reference files: `ac/src/ac_structures.c` (chemistry engine), `ac/src/ac_main.c` (element definitions, marker detection loop), `ac/src/ac_graphics.c` (rendering), `etc/data/acmarkerdata.dat` (marker widths).

## Commands

```bash
npm run dev          # Vite dev server (localhost:5173)
npm run build        # tsc && vite build (tsc has pre-existing errors in scripts/ and test files, vite build succeeds)
npm run test         # vitest run (767 tests, ~1s)
npm run test:watch   # vitest in watch mode
npx vitest run tests/ar/          # run tests for one directory
npx vitest run tests/ar/MarkerRegistry.test.ts  # run a single test file
```

Note: `tsc` reports pre-existing errors in `scripts/convert-molecules.ts` (missing node types) and some test files (unused vars). These don't affect `vite build` which uses esbuild for transpilation.

## Architecture

### Module layers (bottom to top)

**`src/chemistry/`** - Pure data layer, no DOM or Three.js dependencies. Ported from `ac_structures.c`.
- `Element.ts` - 11 elements with non-sequential indices (C=0, O=1, Br=2, ..., K=10). Indices must match original exactly.
- `Atom.ts` - Atom with 4 connection slots, bitfield tracking, 4x4 transform matrix
- `Molecule.ts` - Atom list + 16-slot histogram for fast comparison pre-filtering
- `Bonding.ts` - Link/unlink atoms, valence validation, bitfield operations
- `Comparison.ts` - Histogram pre-filter then DFS tree-string comparison for molecule recognition
- `Serializer.ts` - Format: `"C 0,H 0;0a1,1a0"` (atoms;connections)
- `TetraGeometry.ts` - `AC_TETRA_TRANSFORM[2][14][16]` matrices for tetrahedral atom placement
- `constants.ts` - Critical constants: `CONNECTION_BITS`, `COUNT_CONNECTIONS_OF_BITFIELD`, `TETRA_DIST_1 = 1.7`

**`src/rendering/`** - Three.js rendering. Depends on chemistry layer.
- `SceneManager.ts` - Scene, camera, renderer, OrbitControls, AR mode switching, render loop
- `MoleculeGeometry.ts` - DFS traversal applying tetrahedral transforms to compute 3D positions
- `MoleculeRenderer.ts` - Owns a Three.js Group, clears/rebuilds on molecule changes
- `AtomRenderer.ts` / `BondRenderer.ts` - Sphere and cylinder mesh creation
- `MaterialLibrary.ts` - Pre-built MeshPhongMaterial per element color
- `GhostRenderer.ts` - Renders translucent ghost spheres at valid bond positions. `showGhosts(atom, scene)` clears and shows ghosts + wireframe for one atom (Option A). `addGhostsForAtom(atom, scene)` accumulates ghosts without clearing (used by Option D simple mode to show all atoms' slots simultaneously). `clearGhosts()` removes all ghost meshes.

**`src/hand/`** - Markerless AR (webcam hand-tracking) mode. MediaPipe-based, dynamically imported.
- `HandTracker.ts` - Wraps MediaPipe HandLandmarker; exposes `HandFrame` (21 landmarks × 2 hands)
- `HandManager.ts` - Camera init (`getUserMedia`), per-frame `processFrame()` calls HandTracker
- `GestureDetector.ts` - Per-hand state machine: scale-invariant pinch (ratio = thumbIndexDist / palmWidth, 3-frame confirmation hold, progress [0,1]), open/closed detection, palm rotation delta quaternion via 4-landmark basis (wrist, indexMCP, middleMCP, pinkyMCP), index-tip position
- `RotationFSM.ts` - Pure (no Three.js) 7-state FSM for the rotation hand: `NO_HAND → HAND_DETECTED → READY → GRABBED → ROTATING → RELEASED`. Handles TRACKING_LOST grace period (300 ms). Owned by HandObjectManager; delegates all quaternion math back to the owner.
- `HandObjectManager.ts` - Central markerless orchestrator. Owns the pivot `THREE.Group` (rotation/zoom), intercepts `builder.onChanged`, drives the grabber state machine (`IDLE → BROWSING → GRABBED → APPROACHING → DOCKING`), manages the 3D cursor ring+sphere and targeting line. Applies camera-relative rotation via `_targetQuaternion` + per-frame slerp smoothing. Exposes `resetOrientation()` and `setViewPreset('front'|'side'|'top')`. Supports two interaction modes: Option A (proximity-based APPROACHING/DOCKING) and Option D / simple mode (all ghosts shown simultaneously, direct pinch-to-place).
- `HandOverlay.ts` - 2D canvas overlay: hand skeletons, fingertip cursors, pinch-progress arc, rotation/zoom indicators, rotation FSM state label, hand-not-detected hints, first-atom placement hint
- `AtomGrabList.ts` - Vertical DOM strip of 11 element circles; `setSide('left'|'right')` repositions it to the grabber-hand side when swap-hands is active. Hit-tested via `getBoundingClientRect()` each frame.

**`src/ar/`** - AR marker detection via `@ar-js-org/artoolkit5-js`. Dynamically imported to keep out of desktop bundle.
- `MarkerRegistry.ts` - 24 marker definitions from `acmarkerdata.dat` (7 control, 6 cube, 11 element). Loads `.patt` files into ARController.
- `MarkerState.ts` - Per-frame marker visibility and pose matrices. API for Phase 5 AR objects.
- `ArManager.ts` - Camera init, ARController setup, per-frame detection loop. Coordinate pipeline: `getTransMatSquare() -> transMatToGLMat() -> arglCameraViewRHf() -> THREE.Matrix4.fromArray()`

**`src/objects/`** - Phase 5 AR interaction objects, each tied to a physical marker.
- `ArObjectManager.ts` - Registers all AR objects, drives their `update(markerState)` each frame
- `Platform.ts` - The base platform marker; owns the molecule scene position
- `ElementMarker.ts` - One of 11 element markers; selecting it sets the active element
- `Cube.ts` - 6-face cube marker; each face maps to a bond-slot action
- `PushButton.ts` / `Transport.ts` - Control markers (undo, clear, load molecule)
- `FuzzyBoolean.ts` - Hysteresis helper used by AR objects to debounce marker visibility

**`src/interaction/`** - User input handling.
- `MoleculeBuilder.ts` - Click-to-build molecule logic, undo, recognition against library
- `DesktopControls.ts` - Raycasting for atom clicks, hover highlighting, ghost atom preview

**`src/ui/`** - DOM-based UI panels.
- `ElementPalette.ts` - Element selection grid (left panel)
- `InfoPanel.ts` - Molecule info display (bottom bar)
- `MoleculeLibrary.ts` - Scrollable molecule list (right panel)

**`src/main.ts`** - Entry point. Wires all modules together. AR mode is toggled via dynamic import.

### Data flow

1. `molecules.json` (pre-converted from XML) -> `deserializeMolecule()` -> library of `Molecule` objects
2. **Standard mode:** user clicks canvas -> `DesktopControls` raycasts -> `MoleculeBuilder.addAtom()` -> modifies `Molecule`
3. **Markerless AR:** `HandManager.processFrame()` -> `HandObjectManager.update(frame)` -> grabber state machine -> `MoleculeBuilder.addFirstAtom()` / `linkNow()` -> modifies `Molecule`. After each bond, the grabber returns to GRABBED (same element stays loaded). Hovering the atom list while GRABBED allows pinch-switching to a different element without going through IDLE. Rotation: `RotationFSM.update()` drives state; when `grabActive` and delta > dead zone, camera-relative `_targetQuaternion` is updated; pivot slerps toward it each frame.
4. **AR mode:** `ArManager` detection loop -> `MarkerState` -> `ArObjectManager.update()` -> `ElementMarker` / `Cube` -> `MoleculeBuilder`
5. `MoleculeBuilder.onChanged` callback -> `MoleculeGeometry.computeMoleculeGeometry()` -> `MoleculeRenderer.renderMolecule()` -> Three.js scene
6. `MoleculeBuilder` compares building molecule against library via `moleculeCompareStructure()` -> `onRecognized` callback

### AR coordinate pipeline

ARToolKit produces left-handed matrices. The conversion chain for Three.js (right-handed):
```
ARToolKit detection -> getTransMatSquare() -> transMatToGLMat() (4x4 GL, left-hand)
  -> arglCameraViewRHf() (4x4 right-hand) -> THREE.Matrix4.fromArray() (column-major)
```

The AR camera must stay at origin `(0,0,0)` — `OrbitControls.update()` is skipped in AR mode because `minDistance` clamping pushes the camera off origin.

## Key conventions

- Import alias: `@/` maps to `src/` (configured in both `tsconfig.json` and `vite.config.ts`)
- Tests mirror source structure: `src/chemistry/Atom.ts` -> `tests/chemistry/Atom.test.ts`
- Test framework: Vitest with `{ globals: true }`. Import `describe, it, expect` from `vitest`.
- Chemistry constants must match the original C code exactly. Element indices are non-sequential.
- Marker widths in `MarkerRegistry.ts` must match `etc/data/acmarkerdata.dat` exactly (e.g., platform=81mm, cubes=60mm, elements=76mm).
- Markerless mode: MediaPipe normalised coords have x mirrored for display (`mirroredX = 1 - lm.x`) because `facingMode: 'user'` flips left/right. `HandOverlay._px()` applies this; `HandObjectManager` does it manually for the fingertip screen position.
- `HandObjectManager` intercepts `builder.onChanged` during markerless mode and restores it on `dispose()`. The grabber state machine (`IDLE → BROWSING → GRABBED → APPROACHING → DOCKING`) is driven by `_processGrabberHand()` each frame. After a bond is placed (from APPROACHING or DOCKING), state returns to GRABBED with the same element still loaded.
- **Rotation FSM** (`RotationFSM`, 7 states): `NO_HAND → HAND_DETECTED → READY → GRABBED → ROTATING → RELEASED`. Pinch engages the rotation clutch (GRABBED); delta above 0.025 rad advances to ROTATING. If the hand disappears while grabbing, FSM enters TRACKING_LOST and waits 300 ms before resetting to NO_HAND. `HandObjectManager._processRotationHand()` calls `_fsm.update()`, applies camera-relative quaternion delta when `_fsm.grabActive` is true, then slerps the pivot toward `_targetQuaternion` (alpha 0.3) every frame.
- **Camera-relative rotation**: `q_worldDelta = qCam × qDelta × qCam⁻¹` is applied to `_targetQuaternion`. With the current fixed camera this is a no-op, but correctly handles future camera movement.
- **View presets**: `resetOrientation()` sets `_targetQuaternion` to identity; `setViewPreset('front'|'side'|'top')` sets it to the corresponding orientation quaternion. The pivot slerps smoothly to the new target over the next several frames.
- Pinch detection uses a 3-frame confirmation hold (`PINCH_HOLD_FRAMES = 3`) to suppress jitter. The scale-invariant pinch ratio `= thumbIndexDist / palmWidth` replaces the old raw-distance threshold, making detection robust at different hand sizes and camera distances.
- **Option D / Simple Mode** (`_simpleMode` flag, toggled via "Simple Mode" button in UI): skips APPROACHING/DOCKING entirely. In GRABBED state with atoms, calls `GhostRenderer.addGhostsForAtom()` for every unsaturated atom to show all bond slots simultaneously. Nearest ghost within `GHOST_DOCK_PX` is the pinch target. After placement, ghosts are cleared by `builder.onChanged` and rebuilt next frame.
- **Swap Hands** (`setSwapHands(v)`): swaps which MediaPipe hand label drives grabber vs. rotation. Also calls `AtomGrabList.setSide('right'|'left')` to move the element strip to the grabber-hand side of the canvas.

## Static assets

- `public/patterns/` - 24 ARToolKit `.patt` files
- `public/accamerapara.dat` - ARToolKit camera calibration file (from original ~2003 hardware)
- `src/data/molecules.json` - 100+ molecules converted from XML via `npm run convert-molecules`
