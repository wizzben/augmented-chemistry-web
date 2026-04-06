# Augmented Chemistry Web

A web port of *Augmented Chemistry* — a ~20-year-old C/OpenGL/ARToolKit desktop application for building organic molecules using AR markers — reimplemented in TypeScript, Three.js, and Vite.

## What it does

Build 3D organic molecules interactively in three modes:

| Mode | How it works |
|------|-------------|
| **Desktop** | Click atoms in the 3D scene to bond them. Hover for ghost-position previews. |
| **Markerless** | Webcam + MediaPipe hand tracking. Left hand grabs elements, right hand rotates/zooms. |
| **AR markers** | Physical printed markers detected via ARToolKit. Each marker maps to an element or control action. |

The app recognises completed molecules against a library of 100+ compounds and shows the name in real time.

## Getting started

```bash
npm install
npm run dev        # dev server at localhost:5173
npm run build      # production build → dist/
npm run test       # 753 unit tests (~1 s)
```

Requires a modern browser with WebGL. Markerless mode requires camera access (HTTPS or localhost). AR mode additionally requires the ARToolKit marker files in `public/patterns/`.

## Markerless mode controls

| Hand | Gesture | Action |
|------|---------|--------|
| Left (grabber) | Move finger over element list | Browse elements |
| Left | Pinch over element | Grab that element |
| Left | Pinch over element *(while holding another)* | Switch element |
| Left | Move toward atom, then pinch on ghost | Bond atom |
| Right (rotation) | Open palm, move | Rotate molecule |
| Right | Closed fist, move up/down | Zoom in/out |

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
