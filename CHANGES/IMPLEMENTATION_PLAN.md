# Augmented Chemistry -- Web Port Implementation Plan

## Context

Augmented Chemistry is a ~20-year-old C/OpenGL/ARToolKit application (~20K lines) for building organic molecules using AR marker-based tangible interfaces. The goal is to port it to a modern web application that:
- Faithfully reproduces the AR experience (camera + printed markers)
- Provides a mouse/touch fallback for desktop use
- Has demo-quality UI
- Preserves the full molecule library and chemistry engine

---

## Technology Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Language | TypeScript (strict) | Type safety, readability |
| Build | Vite | Fast dev, static output |
| 3D | Three.js | Replaces OpenGL; mature, well-documented |
| AR | JSARToolKit5 (`@nicholaset/jsartoolkit5`) | Direct ARToolKit port; same `.patt` format |
| Camera | `getUserMedia` (WebRTC) | Standard browser API |
| UI | Lit (web components) | Lightweight, composable with Three.js canvas |
| Audio | Web Audio API | OGG playback built into browsers |
| i18n | JSON maps keyed by `"en"` / `"de"` | Matches existing XML `lang` attributes |
| Testing | Vitest + Playwright | Unit (chemistry) + E2E (interaction) |

---

## Project Structure

```
augmented-chemistry-web/
  index.html
  vite.config.ts
  tsconfig.json
  package.json
  public/
    patterns/             # 24 .patt files (copied verbatim)
    sounds/events/        # OGG event sounds
    sounds/molecules/     # OGG molecule narrations
  src/
    main.ts               # Entry: boots AR or Desktop mode
    config.ts             # Constants (thresholds, scales, marker defs)
    types.ts              # Shared interfaces

    chemistry/
      Element.ts          # Element type + 11 element definitions
      Atom.ts             # Atom with connection[4], bitfield, matrix
      Molecule.ts         # Atom list, histogram, dipole, formula
      Bonding.ts          # Link/unlink, valence validation, bitfield ops
      MoleculeComparison.ts  # Histogram + DFS tree string + comparison
      MoleculeSerializer.ts  # "C 0,H 0;0a1,1a0" format parse/emit
      TetraGeometry.ts    # AC_TETRA_TRANSFORM[2][14][16] matrices

    ar/
      ArManager.ts        # JSARToolKit5 init, camera, detection loop
      MarkerRegistry.ts   # Load 24 .patt files, name->ID map
      MarkerState.ts      # Per-frame visibility + pose

    objects/
      Cube.ts             # 6-face SLERP rotation (aco_cube.c)
      Platform.ts         # Molecule workspace + bonding (aco_platform.c)
      Transport.ts        # Gripper/picker proximity (aco_transport.c)
      ElementMarker.ts    # Element card with debouncing (aco_element.c)
      PushButton.ts       # State toggle markers (aco_state.c)

    rendering/
      SceneManager.ts     # Three.js scene, camera, renderer
      AtomRenderer.ts     # Sphere meshes (replaces display lists)
      BondRenderer.ts     # Cylinder meshes between atoms
      MoleculeRenderer.ts # DFS traversal rendering
      MaterialLibrary.ts  # Pre-built materials per element

    interaction/
      InputManager.ts     # Unified: AR markers OR mouse/touch
      DesktopControls.ts  # Orbit, element palette, click-to-bond
      ArControls.ts       # Marker-driven interaction

    ui/
      AppShell.ts         # Mode selector, HUD, layout
      MoleculeLibrary.ts  # Molecule browser panel
      ElementPalette.ts   # Desktop: clickable element buttons
      InfoPanel.ts        # Name, formula, recognition
      SettingsPanel.ts    # Language, scales
      AudioManager.ts     # Sound playback

    data/
      molecules.json      # Converted from 100+ XML files
      elements.json       # 11 elements with i18n names
      localization.json   # UI strings

  scripts/
    convert-molecules.ts  # XML -> JSON converter
```

---

## Implementation Phases

### Phase 1: Project Setup + Chemistry Engine (~3 days)
Port the core data structures and algorithms with unit tests. No rendering.

**Files to port from:**
- `ac/src/ac_structures.c` (3362 lines) -- atoms, molecules, bonding, comparison
- `ac/src/ac_main.c` lines 407-422 -- element definitions table
- `ac/src/ac_molecules.c` -- molecule XML loading (becomes JSON loader)

**Key work:**
1. Create Vite + TypeScript project
2. Port `Element`, `Atom`, `Molecule` types
3. Port all bitfield operations and bonding logic (link/unlink/validate)
4. Port serialization format: `"C 0,H 0,H 0;0a1,0b2,1a0,2b0"`
5. Port molecule comparison: histogram pre-filter + DFS tree string + strcmp
6. Port `SetTetraMatrices()` -- the `AC_TETRA_TRANSFORM[2][14][16]` array
7. Write `convert-molecules.ts` script, produce `molecules.json`
8. Unit tests: deserialize all 100+ molecules, round-trip serialization, verify recognition

**Critical constants to preserve exactly:**
- `CONNECTION_BITS = [0x1, 0x2, 0x4, 0x8]`
- `COUNT_CONNECTIONS_OF_BITFIELD = [0,1,1,2,1,2,2,3,1,2,2,3,2,3,3,4]`
- `TETRA_DIST_1 = 1.7`, `TETRA_ANGLE_VV = 109.4712206`
- Element index values (non-sequential: C=0, O=1, Br=2, Cl=3, F=4, H=5, Li=6, Mg=7, N=8, Na=9, K=10)

### Phase 2: 3D Rendering -- Desktop Mode (~3 days)
Render molecules in Three.js with mouse orbit controls.

**Files to port from:**
- `ac/src/ac_graphics.c` -- sphere rendering, materials, display modes
- `achlp/src/achlp_matrix44.c` -- matrix math (mostly replaced by Three.js built-ins)

**Key work:**
1. `SceneManager.ts` -- Three.js scene, camera, renderer, lighting
2. `AtomRenderer.ts` -- `SphereGeometry(radius, 24, 12)` + `MeshPhongMaterial` per element
3. `BondRenderer.ts` -- `CylinderGeometry` between atoms
4. `MoleculeRenderer.ts` -- DFS traversal, apply tetrahedral transform matrices
5. `MaterialLibrary.ts` -- 11 element colors from original definitions
6. Three.js `OrbitControls` for rotation/zoom
7. Display modes: standard spheres, electronegativity coloring, atom labels

### Phase 3: Desktop Interaction (~3 days)
Build molecules with mouse/touch. No AR yet.

**Files to port from:**
- `aco/src/aco_platform.c` -- core interaction logic (simplified for desktop)

**Key work:**
1. `ElementPalette.ts` -- 11 clickable element buttons
2. `DesktopControls.ts` -- click atom to select, click direction to bond
3. `Platform.ts` core: `linkNow()`, `undoLastAtom()`, `assignMolecule()`
4. Molecule recognition: on saturation, compare against library
5. `MoleculeLibrary.ts` -- browser panel with all molecules
6. `InfoPanel.ts` -- show name, formula, recognition result

### Phase 4: AR Camera + Marker Detection (~3 days)
Get markers detected from camera feed.

**Files to port from:**
- `ac/src/ac_marker.c` -- marker loading
- `ac/src/ac_display.c` -- video capture, AR setup
- `achlp/src/achlp_matrix44.c` -- `para2glf()` coordinate conversion

**Key work:**
1. `ArManager.ts` -- JSARToolKit5 init, camera `getUserMedia`, detection loop
2. `MarkerRegistry.ts` -- load all 24 `.patt` files (same format as original)
3. `MarkerState.ts` -- per-frame visibility + 4x4 pose matrix
4. Camera feed as Three.js `VideoTexture` background
5. AR projection matrix from camera parameters
6. Test: single marker (platform) renders a sphere at correct position
7. Verify coordinate system: ARToolKit `trans[3][4]` -> Three.js `Matrix4`

**ARToolKit API mapping:**
- `arVideoGetImage()` -> `ARController.process(video)`
- `arDetectMarker()` -> `ARController.detectMarker()`
- `arGetTransMat()` -> `ARController.getTransMatSquare()`
- `arLoadPatt()` -> `ARController.loadMarker(url)`

### Phase 5: AR Objects -- Cube, Transport, Elements (~4 days)
Full AR interaction with physical markers.

**Files to port from:**
- `aco/src/aco_cube.c` (260 lines) -- cube SLERP rotation
- `aco/src/aco_transport.c` -- gripper proximity
- `aco/src/aco_element.c` -- element marker debouncing
- `aco/src/aco_platform.c` -- full AR interaction logic
- `aco/src/aco_state.c` -- state buttons

**Key work:**
1. `Cube.ts` -- 6-marker fusion, master face selection (45 deg heuristic), SLERP (friction=0.4)
   - `AC_CUBE_TRANSFORM[6][16]` constant arrays ported verbatim
   - Three.js `Quaternion.slerp()` replaces custom SLERP
2. `ElementMarker.ts` -- fuzzy boolean debouncing (0-10 counter)
3. `Transport.ts` -- pickup distance < 140.0, flirt state
4. `Platform.ts` full AR logic: tranquilizer smoothing (0.9), selection, tetrahedral corner distances
5. `PushButton.ts` -- state toggles (labeling, elNeg, browse, reset, benzene)
6. `InputManager.ts` -- unified API switching between AR and desktop mode

### Phase 6: UI Polish + Audio (~2 days)
1. `AppShell.ts` -- mode selector (AR/Desktop), responsive layout
2. `SettingsPanel.ts` -- language, atom scale, bond length sliders
3. i18n: English default, German second
4. `AudioManager.ts` -- pickup sounds, molecule completion sounds
5. Visual feedback: selection highlighting, bond preview arrows
6. Camera permission handling with graceful fallback to desktop

### Phase 7: Testing + Optimization (~2 days)
1. Unit tests: every chemistry function
2. Integration: deserialize all molecules, verify recognition
3. E2E (Playwright): desktop mode molecule building workflow
4. Performance: ensure 30fps; geometry instancing for atoms
5. AR optimization: half-resolution detection, Web Worker for detection loop

---

## Data Migration

| Source | Target | Method |
|--------|--------|--------|
| `etc/data/patterns/*.patt` (24 files) | `public/patterns/` | Copy verbatim (same format) |
| `etc/data/library/*.xml` (100+ files) | `src/data/molecules.json` | Node script parses XML |
| `etc/sound/**/*.ogg` | `public/sounds/` | Copy verbatim |
| Element defs in `ac_main.c` | `src/data/elements.json` | Manual extraction |
| `etc/skins/*.tga` | Not needed | Replaced by CSS/HTML |
| `acgui/` (4000 lines) | Not needed | Replaced by Lit web components |
| `achlp/src/achlp_dlist.c` | Not needed | TypeScript arrays |
| `achlp/src/achlp_matrix44.c` | Mostly not needed | Three.js math; port `para2glf` only |

---

## Key Risks

1. **Pattern file compatibility** -- JSARToolKit5 uses same format, but detection quality may differ. Mitigation: test early in Phase 4; regenerate patterns if needed.
2. **Coordinate system mismatch** -- ARToolKit -> Three.js needs the same `para2glf()` conversion. Mitigation: test with single marker first, verify position/orientation.
3. **Multi-marker performance** -- 24 markers is demanding. Mitigation: half-resolution detection; Web Worker; in practice only 1-3 visible at a time.
4. **Camera access** -- Requires HTTPS + user permission. Mitigation: desktop mode fallback.

---

## Verification

- **Chemistry engine**: All 100+ molecules deserialize, serialize round-trip, and recognized molecules match
- **3D rendering**: Visual comparison with original screenshots (if available)
- **AR**: Print markers, test detection at 30cm-100cm distance, verify 3D overlay alignment
- **Desktop mode**: Build Water, Methane, Ethanol step-by-step, verify recognition
- **Performance**: Sustain 30fps on mid-range laptop (Chrome)
