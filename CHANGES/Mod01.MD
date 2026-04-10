# AR Mode Improvements — Implementation Plan

## Context

The Augmented Chemistry web app (phases 1-5 complete) has a working AR marker-based mode, but it requires all physical markers to be present. The user wants to use AR mode even when some or all markers are absent, with seamless fallbacks. Additionally: video mirroring fix, predefined molecules should be editable, video toggle, keyboard shortcuts, and benzene in the palette.

---

## Step 1: Predefined Molecules Editable in Desktop Mode

**Observation 2** — Currently desktop mode renders library molecules as view-only. Should load into builder for editing, like markerless mode already does.

**File:** `src/main.ts` (lines 507-526)

**Change:** Replace the desktop-mode library callback with `builder.loadPreset(entry.format)`. Remove the `deserializeMolecule()` view-only rendering path. The existing `builder.onChanged` callback (line 62) already renders and updates `currentAtomMeshes` for raycasting, so ghosts and click-to-build will work automatically on loaded presets.

**Simplification:** This eliminates ~20 lines of duplicate molecule rendering logic. The library callback becomes mode-agnostic (same code for desktop and markerless).

---

## Step 2: Toggle Video Background in AR Mode

**Observation 3** — Hide camera feed while keeping marker tracking active.

**Files:**
- `index.html` — Add `<button id="toggle-video-btn" style="display:none">Hide Video</button>` in `#palette-actions` after the AR button
- `src/rendering/SceneManager.ts` — Add:
  - Private field `_savedVideoTexture: THREE.Texture | null`
  - `hideVideoBackground()` — saves current background texture, sets solid color
  - `showVideoBackground()` — restores saved texture
  - `isVideoHidden(): boolean`
- `src/main.ts` — Wire button: show when AR starts, hide when AR stops. On click, toggle hide/show and update button text ("Hide Video" / "Show Video")

**Why this works:** `arManager.processFrame()` reads from the `<video>` element directly, not from `scene.background`. Hiding the background texture has zero impact on marker detection.

---

## Step 3: Video Mirroring Fix

**Observation 1** — On laptops, AR mode falls back to front-facing camera, producing a mirrored video.

**Files:**
- `src/rendering/SceneManager.ts` — Modify `setVideoBackground(video, mirrored?: boolean)`:
  ```typescript
  if (mirrored) {
    tex.repeat.x = -1;
    tex.offset.x = 1;
  }
  ```
  Also update `hideVideoBackground()`/`showVideoBackground()` to preserve the mirrored state.

- `src/main.ts` — After `arManager.init()`, detect the camera facing mode:
  ```typescript
  const track = arManager.video.srcObject?.getVideoTracks()[0];
  const isFrontFacing = track?.getSettings().facingMode === 'user';
  sceneManager.setVideoBackground(arManager.video, isFrontFacing);
  ```

---

## Step 4: Keyboard Shortcuts

**Observation 5** — Unique shortcuts for all elements, benzene, and actions.

**File:** `src/ui/ElementPalette.ts`

**Change:** Replace the first-letter matching in `onKey` with an explicit shortcut map:

| Key | Element | Key | Element |
|-----|---------|-----|---------|
| C | Carbon | Shift+C | Chlorine |
| N | Nitrogen | Shift+N | Sodium |
| O | Oxygen | H | Hydrogen |
| F | Fluorine | B | Bromine |
| L | Lithium | M | Magnesium |
| K | Potassium | 0 | Benzene |

Action shortcuts (wired in `main.ts`):
| Key | Action |
|-----|--------|
| Z (Ctrl/Cmd+Z) | Undo (already exists) |
| R | Reset molecule |
| V | Toggle video (AR mode only) |
| Space | Confirm bond (AR fallback, see Step 7) |

**Implementation:** Build a `Map<string, Element>` keyed by `key` value (with Shift variants using `key.toUpperCase()` + `e.shiftKey` check). Add shortcut hint to button tooltips. Accept optional `onBenzene` callback for the `0` key.

---

## Step 5: Add Benzene to Element Palette

**Observation 4b** — Benzene should be selectable from the palette, not just from the library or AR push-button.

**File:** `src/ui/ElementPalette.ts`

**Change:** After the 11 element buttons, add a "Bz" button styled distinctly (e.g., hexagonal border or different background). On click, call an `onBenzene` callback passed to the constructor.

**File:** `src/main.ts` — Pass benzene callback: `() => builder.loadPreset(BENZENE_STARTER_FORMAT)`

**File:** `index.html` — No change needed; the button is added programmatically to `#element-grid`.

---

## Step 6: AR Fallback Buttons (Push-Button Marker Replacements)

**Observation 4e** — DOM buttons for Benzene, Reset, and Labeling when push-button markers are absent.

**File:** `index.html` — Add button group in `#palette-actions`:
```html
<button class="action-btn" id="ar-benzene-btn" style="display:none">Benzene</button>
<button class="action-btn" id="ar-label-btn" style="display:none">Labels</button>
```
(Reset button already exists globally; benzene also available in palette from Step 5.)

**File:** `src/main.ts` — Show these buttons when AR starts, hide when AR stops. Wire `ar-benzene-btn` to `builder.loadPreset(BENZENE_STARTER_FORMAT)`. Wire `ar-label-btn` to the labeling stub (ready for Phase 6).

**Simplification:** Since benzene is now in the palette (Step 5) and reset already exists, the only truly new button is Labels. The AR-specific benzene button is optional/redundant but keeps it visible alongside other AR controls.

---

## Step 7: Hybrid AR Mode — Marker Fallback System

**Observation 4** — The core feature. Each marker category gets independent fallback logic when its physical markers are absent.

### 7a. Platform Fallback (No Platform Marker)

**File:** `src/objects/Platform.ts`

When the platform marker is not detected, position the molecule anchor at a fixed point in front of the camera instead of returning early.

**Changes:**
- Add `_fallbackActive: boolean` flag and `_fallbackFrames: number` counter
- In `refreshState()`, when `pose?.visible` is false:
  - Increment `_fallbackFrames`; if > 30 frames (~0.5s), activate fallback
  - Set `moleculeAnchor.matrix` to `T(0, 0, -200) * R(cube) * S(MOLECULE_AR_SCALE)` — centered in view
  - Set `visible = true`, `moleculeAnchor.visible = true`
  - Continue to the transport interaction logic (steps 3a-3e) using the virtual transport position
- When marker reappears, deactivate fallback smoothly (tranquilizer handles the transition)

### 7b. Cube Fallback (No Cube Marker — Mouse Rotation)

**File:** `src/objects/Cube.ts`

When no cube face is detected, allow mouse drag to rotate the molecule.

**Changes:**
- Add `enableMouseFallback(canvas: HTMLCanvasElement)` / `disableMouseFallback()`
- Mouse event listeners on canvas:
  - `mousedown` (left button only) → record start position, set `_dragging = true`
  - `mousemove` → if dragging, compute delta angles: `dx → Y-axis rotation`, `dy → X-axis rotation`. Apply to `rotation` quaternion with same SLERP smoothing (friction 0.4)
  - `mouseup` → `_dragging = false`
- Only active when `visibleFaces.length === 0` (no physical cube detected)
- When physical cube reappears, mouse rotation is ignored and physical rotation takes over seamlessly (SLERP smoothing handles transition)
- Must distinguish click from drag (use `DRAG_THRESHOLD_PX = 5`) to avoid interfering with bond placement clicks (Step 7c)

### 7c. Transport Fallback (No Transport Marker — Auto-Place + Rotate)

**Observation 4c detail:** When element is selected from palette and no transport marker is present, a virtual "transport" appears at a fixed position near the molecule. The nearest bond slot is highlighted. The user rotates the molecule to bring different slots near the virtual transport, then clicks or presses Space to confirm.

**New file:** `src/objects/VirtualTransport.ts`

This class manages the virtual transport when the physical transport marker is absent:

```
State: INACTIVE | READY | TARGETING
- INACTIVE: No element selected or transport marker is present
- READY: Element selected, no atoms in molecule → click places first atom
- TARGETING: Element selected, atoms exist → show ghosts, highlight nearest slot
```

**Core logic (runs each frame when active):**
1. Define virtual transport position in molecule-local space at a fixed offset (e.g., `(2.5, 0, 0)` — one bond-length away from center along X-axis)
2. Reuse Platform's bond-selection algorithm (steps 3a-3e from `Platform.refreshState`):
   - Find nearest unsaturated atom to virtual transport position
   - Compute tetrahedral corner distances
   - Select best slot → `selectionBitField`
3. Show ghosts via `GhostRenderer.showGhosts(atom, parent)` as children of `moleculeAnchor`
4. Highlight the selected ghost (emissive boost on the nearest ghost sphere)
5. On click or Space: call `builder.linkNow(atom, selectionBitField)` or `builder.addFirstAtom()`

**Refactor opportunity:** Extract the bond-selection algorithm from `Platform.refreshState()` (lines 200-277) into a shared utility function `findBestBondSlot(mol, transportLocalPos, tetra)` that both `Platform` and `VirtualTransport` can call. This eliminates code duplication.

**File changes:**
- `src/objects/Platform.ts` — Extract bond selection logic into importable function
- `src/rendering/GhostRenderer.ts` — Change `showGhosts(atom, scene)` to accept `parent: THREE.Object3D` instead of `scene: THREE.Scene` so ghosts can be children of `moleculeAnchor`
- `src/main.ts` — Wire Space key and canvas click to `VirtualTransport.confirm()` when active

### 7d. Element Marker Fallback (Palette Selection Persists)

**File:** `src/objects/ArObjectManager.ts` (line 176-178)

When the physical transport is not visible, skip the element sync (`builder.setElement(transport.grabbedElement.element)`). This allows the palette selection to persist and drive the VirtualTransport.

**Change:** Wrap line 176-178 in `if (transport.visible && transport.grabbedElement)`.

This is already the current condition check, so verify it doesn't override palette selection when transport is invisible. Currently it doesn't (the guard is already there), so this may need no change — just verification.

### 7e. Integration in ArObjectManager

**File:** `src/objects/ArObjectManager.ts`

**Constructor changes:**
- Accept `canvas: HTMLCanvasElement` parameter
- Create `VirtualTransport` instance
- Call `cube.enableMouseFallback(canvas)`

**`update()` changes (after existing steps 1-7):**
```
// Step 8: Fallback states
const cubeAbsent = !this.cube.visible && this.cube.posIsValid === 0;
const transportAbsent = !this.transport.visible;

// Step 9: Virtual transport
if (transportAbsent && this.builder.getCurrentElement()) {
  this._virtualTransport.setActive(true);
  this._virtualTransport.update(this.platform, this.builder);
} else {
  this._virtualTransport.setActive(false);
}
```

**`triggerLink()` changes:**
- If `_virtualTransport` is active and has a valid selection, call `_virtualTransport.confirm()` instead of `platform.triggerLink()`

**`dispose()` changes:**
- Dispose `VirtualTransport`
- Call `cube.disableMouseFallback()`

### 7f. Canvas Click + Space Key Wiring

**File:** `src/main.ts`

The existing canvas click handler (line 225-229) calls `activeArObjectManager.triggerLink()`. This already works — `triggerLink()` will delegate to VirtualTransport when appropriate (see 7e).

Add Space key handler:
```typescript
document.addEventListener('keydown', (e) => {
  if (e.key === ' ' && activeArObjectManager) {
    e.preventDefault();
    activeArObjectManager.triggerLink();
  }
});
```

---

## Step 8: Pass Canvas to ArObjectManager

**File:** `src/main.ts` (AR toggle-on block, ~line 195)

Pass `sceneManager.renderer.domElement` (the canvas) to `ArObjectManager` constructor so Cube can attach mouse listeners for fallback rotation.

---

## Simplification Opportunities

1. **Library callback unification** (Step 1): Eliminate 20 lines of view-only rendering; both modes use `builder.loadPreset()`
2. **Bond selection extraction** (Step 7c): Extract `Platform.refreshState` lines 200-277 into a shared `findBestBondSlot()` utility, reducing duplication between `Platform` and `VirtualTransport`
3. **GhostRenderer parent parameter** (Step 7c): Generalize from `THREE.Scene` to `THREE.Object3D` — a one-line type change that enables reuse in AR context
4. **Keyboard shortcut map** (Step 4): Replace fragile first-letter loop with explicit map — clearer, no conflicts, easier to extend

---

## Files Summary

| File | Action | Steps |
|------|--------|-------|
| `src/main.ts` | Modify | 1, 2, 3, 4, 5, 6, 7f, 8 |
| `src/rendering/SceneManager.ts` | Modify | 2, 3 |
| `src/objects/ArObjectManager.ts` | Modify | 7d, 7e, 8 |
| `src/objects/Platform.ts` | Modify | 7a, 7c (extract) |
| `src/objects/Cube.ts` | Modify | 7b |
| `src/objects/VirtualTransport.ts` | **New** | 7c |
| `src/ui/ElementPalette.ts` | Modify | 4, 5 |
| `src/rendering/GhostRenderer.ts` | Modify | 7c (parent type) |
| `index.html` | Modify | 2, 6 |

---

## Verification

1. **Desktop mode:** Click library molecule → loads in builder, rotatable, ghosts on hover, click to extend
2. **AR mode (all markers):** Existing behavior unchanged — regression test
3. **AR mode (hide video):** Click toggle → dark background, markers still tracked
4. **AR mode (no platform):** Molecule appears at screen center after ~0.5s
5. **AR mode (no cube):** Mouse drag rotates molecule smoothly
6. **AR mode (no transport):** Select element from palette → ghosts shown, nearest slot highlighted, rotate molecule to pick slot, click/Space to bond
7. **AR mode (no markers at all):** Full interaction via palette + mouse + click — camera can be on or off
8. **AR mode (marker reappears):** Smooth transition from fallback to marker-driven
9. **Keyboard shortcuts:** All element keys work, Shift variants for Cl/Na, 0 for benzene, R for reset, V for video toggle, Space for bond confirm
10. **Tests:** `npm run test` — all 767+ tests pass, `npm run build` succeeds
