# Augmented Chemistry Web

A web port of *Augmented Chemistry* — a ~20-year-old C/OpenGL/ARToolKit desktop application for building organic molecules using AR markers — reimplemented in TypeScript, Three.js, and Vite.

## What it does

Build 3D organic molecules interactively in three modes:

| Mode | How it works |
|------|-------------|
| **Standard** | Click atoms in the 3D scene to bond them. Hover for ghost-position previews. |
| **Markerless AR** | Webcam + MediaPipe hand tracking. One hand grabs elements; the other rotates and zooms the molecule. |
| **AR** | Physical printed markers detected via ARToolKit. Each marker maps to an element or control action. Markers are optional — each category degrades gracefully when absent. |

The app recognises completed molecules against a library of 100+ compounds and shows the name in real time. Library molecules can be loaded into the builder for further editing in all three modes.

## Getting started

```bash
npm install
npm run dev        # dev server at localhost:5173
npm run build      # production build → dist/
 ```

Requires a modern browser with WebGL. Markerless AR mode requires camera access (HTTPS or localhost). AR mode additionally requires the ARToolKit marker files in `public/patterns/`.

## AR mode controls

| Key | Element | Key | Element |
|-----|---------|-----|---------|
| `C` | Carbon | `Shift+C` | Chlorine |
| `N` | Nitrogen | `Shift+N` | Sodium |
| `O` | Oxygen | `H` | Hydrogen |
| `F` | Fluorine | `L` | Lithium |
| `B` | Bromine | `M` | Magnesium |
| `K` | Potassium | `0` | Benzene |

Action keys: `R` — reset molecule · `V` — toggle video feed (AR mode) · `Space` — confirm bond (AR mode)

Benzene is also available as a "Bz" button in the element palette.

### Hybrid AR mode (missing markers)

Each physical marker category has an independent software fallback:

| Missing marker | Fallback |
|---------------|---------|
| Platform | Molecule anchors at screen centre after 0.5 s |
| Cube | Mouse drag rotates the molecule |
| Transport | Virtual transport point left of molecule; rotate molecule to pick bond slot, click or Space to bond |
| Element cards | Select elements from the on-screen palette |

All markers can be absent simultaneously — the app works as a mouse/keyboard AR session with the camera feed optionally hidden (`V` key or **Hide Video** button) while tracking continues.

### Video feed

AR mode detects whether the camera is front-facing and unflips the image automatically (front-facing cameras mirror left/right by default). The feed can be hidden at any time — marker tracking is unaffected.

## Markerless AR mode controls

| Hand | Gesture | Action |
|------|---------|--------|
| Left (grabber) | Move finger over element list | Browse elements |
| Left | Pinch over element | Grab that element |
| Left | Pinch over element *(while holding another)* | Switch element |
| Left | Move toward atom, then pinch on ghost | Bond atom |
| Right (rotation) | Pinch and move | Rotate molecule (clutch: hold pinch while moving) |
| Right | Closed fist (no pinch), move up/down | Zoom in/out |

The rotation hand uses a 7-state FSM: it must be detected and ready before a pinch engages the rotation clutch. If tracking is lost mid-rotation, a 300 ms grace window lets you recover before the state resets.

**View presets** (shown in markerless mode): **Reset View**, **Front**, **Side**, **Top** — each smoothly slerps the molecule to the target orientation.

**Simple Mode** (toggle button): shows bond slots for *all* unsaturated atoms at once — aim finger at any ghost sphere and pinch to place. Easier than the proximity-based default.

**Swap Hands** button inverts the grabber/rotation roles and moves the element list to the grabber-hand side.

## Tech stack

- **Three.js** — 3D rendering, molecule geometry, ghost/cursor meshes
- **MediaPipe Tasks Vision** — hand landmark detection (21 points × 2 hands)
- **ARToolKit 5 JS** (`@ar-js-org/artoolkit5-js`) — fiducial marker detection
- **Vite** — dev server and bundler (AR/hand modules dynamically imported)
- **Vitest** — unit tests for chemistry engine and gesture detection

## Project structure

```
src/
  chemistry/     # Pure data layer: elements, atoms, molecules, bonding, comparison
  rendering/     # Three.js scene, molecule renderer, ghost renderer, materials
  hand/          # Markerless mode: hand tracking, gesture detection, UI overlay
  ar/            # AR marker registry, state, detection loop
  objects/       # AR interaction objects (platform, element markers, cube, buttons)
  interaction/   # MoleculeBuilder, DesktopControls
  ui/            # Element palette, info panel, molecule library
  main.ts        # Entry point — wires all modules together
```

## License

GPL-3.0 — see [LICENSE](LICENSE).
