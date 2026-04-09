# Markerless Hand-Tracking Mode — Implementation Plan

## Context

The Augmented Chemistry web app currently supports desktop mode (mouse/keyboard) and AR mode (ARToolkitX markers). This plan adds a third **markerless mode** that uses **MediaPipe Hand Landmarker** for hand-tracking-based molecule building — no printed markers, no camera feed displayed. The right hand controls molecule rotation/zoom, the left hand grabs atoms and bonds them to the molecule. A hand-swap toggle allows switching roles.

---

## Architecture Overview

A new `src/hand/` module mirrors the AR architecture pattern:

| AR Mode | Markerless Mode |
|---------|-----------------|
| `ArManager` (camera + ARToolkit) | `HandManager` (camera + MediaPipe) |
| `ArObjectManager` (marker-based interaction) | `HandObjectManager` (hand-gesture interaction) |
| `MarkerState` (marker poses) | `GestureDetector` (gesture recognition) |
| `ElementMarker` (physical marker cards) | `AtomGrabList` (DOM overlay atom list) |

Existing modules reused unchanged: `MoleculeBuilder`, `MoleculeRenderer`, `MoleculeGeometry`, `GhostRenderer`, `MaterialLibrary`, `AtomRenderer`, `BondRenderer`, `InfoPanel`, `MoleculeLibrary`.

---

## Substep 1: Install MediaPipe and create HandTracker wrapper

**Goal:** Low-level MediaPipe Hand Landmarker wrapper — no Three.js, no DOM interaction, pure landmark data.

**Create:**
- `src/hand/HandTracker.ts`

**Modify:**
- `package.json` — add `@mediapipe/tasks-vision` dependency

**Details:**
- Use `HandLandmarker` from `@mediapipe/tasks-vision` with `runningMode: 'VIDEO'`, configured for 2 hands
- Load WASM + model files from CDN (`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm`) to avoid bundling large binary assets
- Export interface:
  ```typescript
  interface HandFrame {
    landmarks: NormalizedLandmark[][];   // 0-1 normalized screen coords per hand
    worldLandmarks: Landmark[][];        // metric 3D coords per hand
    handedness: Category[][];            // "Left"/"Right" labels per hand
    timestamp: number;
  }
  ```
- `async init(): Promise<void>` — create HandLandmarker instance
- `detect(video: HTMLVideoElement, timestamp: number): HandFrame` — per-frame detection
- `dispose(): void` — release resources

**Memory action:** no action

---

## Substep 2: Create GestureDetector for pinch, open/closed hand, palm rotation

**Goal:** Interpret raw hand landmarks into high-level gestures.

**Create:**
- `src/hand/GestureDetector.ts`
- `tests/hand/GestureDetector.test.ts`

**Details:**
- One `GestureDetector` instance per hand. `HandObjectManager` creates two.
- **Pinch detection:** Distance between landmark 4 (thumb tip) and landmark 8 (index tip). Thresholds: 0.04 normalized for pinch-on, 0.06 for pinch-off (hysteresis). 300ms cooldown between triggers. Expose `isPinching: boolean` and `pinchTriggered: boolean` (true on falling edge only for one frame).
- **Open/closed hand:** Average distance of fingertips (8, 12, 16, 20) from wrist (0). Threshold with hysteresis (~0.15 open, ~0.10 closed). Expose `isOpen: boolean`.
- **Palm rotation:** From world landmarks: wrist (0), index MCP (5), pinky MCP (17) define a plane. Extract normal + forward direction, build a quaternion. Return delta quaternion from previous frame for smooth rotation.
- **Fingertip position:** Landmark 8 (index tip) in normalized [0,1] coordinates.
- Method: `update(landmarks: NormalizedLandmark[], worldLandmarks: Landmark[], deltaMs: number): void`

**Memory action:** no action

---

## Substep 3: Create HandManager (camera + MediaPipe lifecycle)

**Goal:** Camera initialization, video element, MediaPipe setup — analogous to `ArManager`.

**Create:**
- `src/hand/HandManager.ts`

**Details:**
- `async init(): Promise<void>`:
  - Request camera via `getUserMedia()` with `facingMode: 'user'` (front-facing for hand tracking)
  - Create hidden `<video>` element (video is input to MediaPipe but not displayed)
  - Initialize `HandTracker`
- `processFrame(): HandFrame | null` — call `HandTracker.detect(video, performance.now())`
- `dispose(): void` — stop camera stream, dispose HandTracker
- Follow same lifecycle pattern as `ArManager`: init -> processFrame per frame -> dispose

**Memory action:** compact (completed hand tracking foundation — 3 new files)

---

## Substep 4: Create AtomGrabList DOM overlay

**Goal:** Vertical list of large grabbable atom elements on the left side of the canvas.

**Create:**
- `src/hand/AtomGrabList.ts`

**Modify:**
- `index.html` — add `<div id="atom-grab-list">` inside `#canvas-panel`, add CSS

**Details:**
- Absolutely positioned inside `#canvas-panel`, left edge, `z-index` above 3D canvas
- Each atom: colored circle, 64px diameter, 8px gap, element symbol centered
- All 11 elements displayed top-to-bottom (total ~792px; scrolls or scales on short viewports)
- `data-element` attribute on each circle for identification
- Public API:
  - `highlightElement(el: Element | null): void` — thick white border + scale-up
  - `getElementAtScreenPos(x: number, y: number): Element | null` — hit-test against bounding rects
  - `show(): void` / `hide(): void` — toggle visibility
  - `dispose(): void`
- Hidden by default, shown only when markerless mode is active
- CSS: `pointer-events: none` (interaction is via hand tracking, not mouse)

**Memory action:** no action

---

## Substep 5: Create HandObjectManager — the main orchestrator

**Goal:** Central class that processes hand data each frame, manages molecule rotation/zoom (right hand), atom grabbing and bonding (left hand).

**Create:**
- `src/hand/HandObjectManager.ts`

**Details:**

**Left hand (grabber) state machine:**
```
IDLE -> finger near atom list -> BROWSING (atom highlights)
     -> pinch on highlighted atom -> GRABBED (element selected)
     -> finger near unsaturated atom -> APPROACHING (ghosts shown)
     -> finger near ghost -> DOCKING (ghost highlighted)
     -> pinch on highlighted ghost -> BONDED (bond created)
     -> back to IDLE
```

**Right hand (rotation/zoom) per frame:**
1. Detect open/closed via `GestureDetector.isOpen`
2. Open hand: apply palm rotation delta quaternion to molecule pivot group's `quaternion` (with 0.3 damping factor to smooth jitter)
3. Closed fist: track vertical fist movement, map to scale factor on molecule pivot group (clamp 0.2–5.0, exponential smoothing)
4. Molecule position stays fixed at origin — hand position never moves it

**Left hand (grabber) per frame:**
1. Get index fingertip position from `GestureDetector` in normalized coords
2. Convert to pixel coords using canvas dimensions
3. Per state:
   - IDLE/BROWSING: `AtomGrabList.getElementAtScreenPos()` for highlight
   - GRABBED: project unsaturated atom meshes to screen via `camera.project()`, find nearest to fingertip
   - APPROACHING: show ghosts via existing `GhostRenderer.showGhosts()`, find nearest ghost to fingertip
   - DOCKING: on pinch, call `builder.linkNow(ghost.atom, ghost.connectionBitfield)`

**Molecule rendering:**
- Create a pivot group at `(0, 0, 0)` as child of scene
- Molecule renderer's group is child of pivot group
- Hand rotation applies to `pivotGroup.quaternion`, zoom to `pivotGroup.scale`
- Intercept `builder.onChanged` callback (same pattern as `ArObjectManager`) to manage rendering

**Hand swap:**
- `swapHands: boolean` flag. Before processing, swap which detected hand ("Left"/"Right") maps to "rotation" vs "grabber" role.
- `setSwapHands(v: boolean): void`

**Constructor dependencies:** `MoleculeBuilder`, `SceneManager`, `MaterialLibrary`, `AtomGrabList`, `GhostRenderer`

**Memory action:** compact (largest single module complete)

---

## Substep 6: Create HandOverlay for visual feedback

**Goal:** 2D canvas overlay showing hand skeleton, fingertip cursor, and grabbed element indicator.

**Create:**
- `src/hand/HandOverlay.ts`

**Modify:**
- `index.html` — add `<canvas id="hand-overlay">` inside `#canvas-panel`, CSS for absolute positioning over 3D canvas

**Details:**
- 2D `<canvas>` overlay (standard MediaPipe visualization approach)
- Draw hand skeleton: 21 landmarks with standard connections, different colors for left/right hand
- Fingertip cursor: larger dot on index tip of grabber hand
- Grabbed element indicator: colored circle (element color) following index fingertip when element is grabbed
- Approaching indicator: line from fingertip to nearest atom's projected screen position
- Mirror horizontally for front-facing camera (movements feel natural)
- `update(handFrame: HandFrame, state: GrabberState): void` — called per frame from HandObjectManager
- `clear(): void`, `show(): void`, `hide(): void`, `dispose(): void`

**Memory action:** no action

---

## Substep 7: Wire markerless mode into main.ts and SceneManager

**Goal:** Add "Markerless" toggle button, wire full lifecycle, integrate with existing module graph.

**Modify:**
- `src/main.ts` — markerless button handler, dynamic imports, per-frame wiring, mode exclusivity
- `src/rendering/SceneManager.ts` — add `setMarkerlessMode(enabled: boolean)` method
- `index.html` — add `#markerless-btn` and `#swap-hands-btn` buttons in `#palette-actions`

**Details:**

**SceneManager.setMarkerlessMode(enabled):**
- Disables `OrbitControls` (hand controls rotation)
- Keeps solid background (no video texture — this is the key difference from AR mode)
- Keeps camera at `(0, 0, 10)` looking at origin (normal desktop perspective)
- Does NOT change projection matrix (no AR calibration needed)
- On disable: re-enable OrbitControls, restore camera position

**main.ts wiring (mirrors AR toggle pattern at lines 127-207):**
```typescript
let activeHandManager: { processFrame(): HandFrame | null; dispose(): void } | null = null;
let activeHandObjectManager: { update(frame: HandFrame): void; dispose(): void } | null = null;
let markerlessModeActive = false;

markerlessBtn.addEventListener('click', async () => {
  if (activeHandManager) {
    // Toggle off: dispose, restore desktop mode
    sceneManager.setOnBeforeRender(null);
    activeHandObjectManager.dispose();
    activeHandManager.dispose();
    sceneManager.setMarkerlessMode(false);
    markerlessModeActive = false;
    return;
  }
  // Toggle on: dynamic import, init, wire
  const { HandManager } = await import('@/hand/HandManager');
  const { HandObjectManager } = await import('@/hand/HandObjectManager');
  // ... init, wire sceneManager.setOnBeforeRender(), etc.
  markerlessModeActive = true;
});
```

**Mode exclusivity:**
- AR and markerless are mutually exclusive. When one is active, the other button is disabled.
- Desktop controls are disposed/restored on mode transitions.

**UI changes on mode enter:**
- Hide element palette grid (atoms are in AtomGrabList now)
- Show AtomGrabList overlay
- Show HandOverlay canvas
- Show swap-hands button
- Update info bar text

**Memory action:** compact (major integration milestone)

---

## Substep 8: Integrate MoleculeLibrary preloading in markerless mode

**Goal:** Clicking a library molecule in markerless mode loads it into the builder for editing.

**Modify:**
- `src/main.ts` — modify `MoleculeLibrary` callback (lines 225-247) to branch on `markerlessModeActive`

**Details:**
- When `markerlessModeActive` is true and a library entry is clicked:
  - Call `builder.loadPreset(entry.format)` — replaces current building molecule
  - The `builder.onChanged` callback (intercepted by HandObjectManager) handles re-rendering
  - Update info bar and recognition bar with molecule name
- When `markerlessModeActive` is false: existing view-only behavior unchanged

**Memory action:** no action

---

## Substep 9: Add hand-swap toggle and polish mode transitions

**Goal:** Swap-hands button, visual mode indicators, clean transitions.

**Modify:**
- `src/main.ts` — swap button handler calls `handObjectManager.setSwapHands()`
- `src/hand/HandObjectManager.ts` — `setSwapHands()` method
- `index.html` — CSS for swap button visibility, mode transition animations

**Details:**
- Swap button label shows current assignment: "L=Grab, R=Rotate" / "R=Grab, L=Rotate"
- Swap button only visible when markerless mode is active
- When entering markerless mode: fade-out element palette, fade-in atom grab list
- When exiting: reverse
- AR button disabled when markerless active; markerless button disabled when AR active
- Clear molecule and reset state on mode exit (or optionally preserve — user preference)

**Memory action:** no action

---

## Substep 10: Refine rotation, zoom, and atom highlight visuals

**Goal:** Smooth rotation/zoom behavior, atom highlighting when grabber hand approaches.

**Modify:**
- `src/hand/HandObjectManager.ts` — refine rotation damping, zoom smoothing, dead zones
- `src/rendering/MaterialLibrary.ts` — add highlight material support (emissive boost)

**Details:**

**Rotation refinement:**
- Apply only 0.3 of frame-to-frame delta quaternion (damping)
- Dead zone: ignore small rotations below a threshold to prevent jitter
- When right hand disappears: freeze at current rotation (no spring-back)

**Zoom refinement:**
- Track closed-fist vertical movement delta per frame
- Map to scale multiplier with exponential smoothing (factor 0.1)
- Clamp scale between 0.2 and 5.0
- When fist disappears: freeze at current scale

**Atom highlighting:**
- When grabber fingertip is near an unsaturated atom: boost atom mesh's `material.emissive` (e.g., white at 0.3 intensity)
- Restore on un-hover
- Track currently highlighted atom to avoid redundant material changes

**Grabbed atom visual:**
- Semi-transparent sphere following index fingertip in 3D space
- Unproject 2D fingertip position to 3D point on z=0 plane
- Colored by grabbed element

**Memory action:** compact (all feature logic complete)

---

## Substep 11: Write tests

**Goal:** Unit tests for gesture detection, state machine, and atom list hit testing.

**Create:**
- `tests/hand/GestureDetector.test.ts` (if not already created in substep 2)
- `tests/hand/HandObjectManager.test.ts`
- `tests/hand/AtomGrabList.test.ts`

**Details:**
- `GestureDetector`: synthetic landmark sequences for pinch (rising/falling edge), open/closed hand, cooldown timer. Verify hysteresis thresholds.
- `HandObjectManager`: mock `MoleculeBuilder` and `HandFrame` data. Test state machine transitions: IDLE -> BROWSING -> GRABBED -> APPROACHING -> DOCKING -> BONDED. Test hand swap flag.
- `AtomGrabList`: mock DOM bounding rects, test `getElementAtScreenPos()` returns correct element.

**Memory action:** clear context (major milestone — all markerless mode code complete)

---

## Substep 12: End-to-end manual testing and bug fixes

**Goal:** Manual testing of the full workflow on real hardware.

**No new files.** Bug fixes as discovered.

**Test matrix:**
- Start markerless mode, verify camera permission prompt appears
- Verify hand skeleton overlay renders correctly
- Grab element from atom list with left hand pinch
- Rotate molecule with open right hand
- Zoom molecule with closed right fist
- Approach molecule atom, verify ghost spheres appear
- Dock at ghost, pinch to bond
- Preload molecule from library sidebar
- Swap hands, repeat workflow with reversed roles
- Toggle markerless off, verify desktop mode restores correctly
- Verify AR mode and markerless mode are mutually exclusive
- Test on Chrome, Firefox, Safari (Safari may need WebGL2 checks)
- Test on different screen sizes (atom list scaling)

**Memory action:** clear context (fresh session for debugging)

---

## File Summary

**New files (8-10):**

| File | Purpose |
|------|---------|
| `src/hand/HandTracker.ts` | MediaPipe Hand Landmarker wrapper |
| `src/hand/GestureDetector.ts` | Pinch, open/closed, palm rotation detection |
| `src/hand/HandManager.ts` | Camera + MediaPipe lifecycle |
| `src/hand/AtomGrabList.ts` | DOM overlay of grabbable atoms |
| `src/hand/HandObjectManager.ts` | Main orchestrator (state machine, rotation, bonding) |
| `src/hand/HandOverlay.ts` | 2D canvas overlay for hand skeleton + cursor |
| `tests/hand/GestureDetector.test.ts` | Gesture detection unit tests |
| `tests/hand/HandObjectManager.test.ts` | State machine unit tests |
| `tests/hand/AtomGrabList.test.ts` | Hit-testing unit tests |

**Modified files (4):**

| File | Changes |
|------|---------|
| `package.json` | Add `@mediapipe/tasks-vision` |
| `index.html` | Add buttons, overlay containers, CSS |
| `src/main.ts` | Markerless toggle, dynamic imports, library preload branching, mode exclusivity |
| `src/rendering/SceneManager.ts` | Add `setMarkerlessMode()` method |

---

## Verification

After completing all substeps, verify end-to-end:

1. `npm run test` — all existing 730+ tests still pass, new hand tests pass
2. `npm run build` — vite build succeeds (tsc errors in scripts/ are pre-existing)
3. `npm run dev` — manual testing:
   - Desktop mode works unchanged (mouse rotation, click-to-build)
   - Markerless mode activates, camera initializes, hands are tracked
   - Full grab-rotate-dock-bond workflow works with real hands
   - Library preloading works in markerless mode
   - Hand swap toggle works
   - Mode transitions are clean (desktop <-> markerless, no conflicts with AR)
