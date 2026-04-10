import moleculesData from '@/data/molecules.json';
import { deserializeMolecule } from '@/chemistry/Serializer';
import { Molecule } from '@/chemistry/Molecule';
import { SceneManager } from '@/rendering/SceneManager';
import { MoleculeRenderer } from '@/rendering/MoleculeRenderer';
import { MaterialLibrary } from '@/rendering/MaterialLibrary';
import { MoleculeBuilder } from '@/interaction/MoleculeBuilder';
import { DesktopControls } from '@/interaction/DesktopControls';
import { ElementPalette } from '@/ui/ElementPalette';
import { InfoPanel } from '@/ui/InfoPanel';
import { MoleculeLibrary, type MoleculeEntry } from '@/ui/MoleculeLibrary';
import type { MoleculeGeometryData } from '@/rendering/MoleculeGeometry';
import * as THREE from 'three';

// ─── Pre-load library molecules for recognition ───────────────────────────
const libraryEntries = moleculesData as MoleculeEntry[];

/**
 * Benzene ring starter — 6 unsaturated carbons, slot a free on every carbon.
 * Ported from acmolstarters.dat (the C app's separate preset file).
 */
const BENZENE_STARTER_FORMAT =
  'C 1,C 1,C 1,C 1,C 1,C 1;' +
  '0c1,0b5,0d5,1c0,1b2,1d2,2c3,2b1,2d1,3c2,3b4,3d4,4c5,4b3,4d3,5c4,5d0,5b0';

const libraryMolecules: Molecule[] = libraryEntries.map((entry) => {
  const name = entry.names.en ?? entry.names.de ?? 'Unknown';
  return deserializeMolecule(name, entry.format, {
    formula: entry.formula,
    category: entry.category,
    names: entry.names,
  });
});

// ─── Building molecule (starts empty) ─────────────────────────────────────
const buildMolecule = new Molecule({ name: 'Building' });

// ─── Scene setup ──────────────────────────────────────────────────────────
const container = document.getElementById('app')!;
const infoBar = document.getElementById('info-bar')!;
const recognitionBar = document.getElementById('recognition-bar')!;

let sceneManager: SceneManager | null = null;
let moleculeRenderer: MoleculeRenderer | null = null;
let desktopControls: DesktopControls | null = null;

try {
  sceneManager = new SceneManager(container);
  moleculeRenderer = new MoleculeRenderer();
} catch (e) {
  infoBar.textContent = 'WebGL not available';
  console.error('Failed to initialize WebGL:', e);
}

// Track atom meshes for raycasting
let currentAtomMeshes: THREE.Mesh[] = [];

// ─── Builder ──────────────────────────────────────────────────────────────
const infoPanel = new InfoPanel(infoBar);
const builder = new MoleculeBuilder(buildMolecule, libraryMolecules);

builder.onChanged = (geo: MoleculeGeometryData) => {
  if (!sceneManager || !moleculeRenderer) return;

  moleculeRenderer.clear();
  if (geo.atoms.length > 0) {
    const { group, boundingRadius, atomMeshes } = moleculeRenderer.renderMolecule(buildMolecule);
    sceneManager.add(group);
    if (boundingRadius > 0) sceneManager.fitToMolecule(boundingRadius);
    currentAtomMeshes = atomMeshes;
  } else {
    currentAtomMeshes = [];
  }

  desktopControls?.updateGeometry(geo, currentAtomMeshes);
  infoPanel.update(buildMolecule, null);
};

builder.onRecognized = (recognized) => {
  infoPanel.update(buildMolecule, recognized);
  if (recognized) {
    const name = recognized.names?.en ?? recognized.names?.de ?? recognized.name;
    recognitionBar.textContent = `Recognized: ${name}`;
    recognitionBar.style.color = '#4caf50';
  } else if (buildMolecule.atoms.length > 0) {
    recognitionBar.textContent = `Building\u2026 ${buildMolecule.atoms.length} atom${buildMolecule.atoms.length !== 1 ? 's' : ''}`;
    recognitionBar.style.color = '#aaa';
  } else {
    recognitionBar.textContent = '\u2014';
    recognitionBar.style.color = '#aaa';
  }
};

// ─── Desktop controls ─────────────────────────────────────────────────────
if (sceneManager) {
  desktopControls = new DesktopControls(sceneManager, builder, infoBar);
}

// ─── Element palette ──────────────────────────────────────────────────────
const paletteContainer = document.getElementById('element-grid')!;
const palette = new ElementPalette(paletteContainer, (el) => {
  builder.setElement(el);
}, () => {
  builder.loadPreset(BENZENE_STARTER_FORMAT);
});

// Select Carbon by default
import { ALL_ELEMENTS } from '@/chemistry/Element';
const defaultElement = ALL_ELEMENTS.find((e) => e.symbol === 'C') ?? ALL_ELEMENTS[0];
palette.setSelected(defaultElement);
builder.setElement(defaultElement);

// ─── Undo / Reset ─────────────────────────────────────────────────────────
document.getElementById('undo-btn')!.addEventListener('click', () => builder.undoLastAtom());
document.getElementById('reset-btn')!.addEventListener('click', () => {
  builder.reset();
  recognitionBar.textContent = '\u2014';
  recognitionBar.style.color = '#aaa';
  if (sceneManager) sceneManager.fitToMolecule(5);
});

document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    builder.undoLastAtom();
    return;
  }
  if (e.key === 'r' || e.key === 'R') {
    builder.reset();
    recognitionBar.textContent = '\u2014';
    recognitionBar.style.color = '#aaa';
    if (sceneManager) sceneManager.fitToMolecule(5);
    return;
  }
  if (e.key === ' ' && activeArObjectManager) {
    e.preventDefault();
    activeArObjectManager.triggerLink();
    return;
  }
  if ((e.key === 'v' || e.key === 'V') && activeArManager && sceneManager) {
    const toggleVideoBtn = document.getElementById('toggle-video-btn') as HTMLButtonElement;
    if (sceneManager.isVideoHidden()) {
      sceneManager.showVideoBackground();
      toggleVideoBtn.textContent = 'Hide Video';
    } else {
      sceneManager.hideVideoBackground();
      toggleVideoBtn.textContent = 'Show Video';
    }
  }
});

// ─── AR mode ──────────────────────────────────────────────────────────────
const arBtn           = document.getElementById('ar-btn')           as HTMLButtonElement;
const markerlessBtn   = document.getElementById('markerless-btn')   as HTMLButtonElement;
const swapHandsBtn    = document.getElementById('swap-hands-btn')   as HTMLButtonElement;
const simpleModeBtn   = document.getElementById('simple-mode-btn')  as HTMLButtonElement;
const viewResetBtn    = document.getElementById('view-reset-btn')   as HTMLButtonElement;
const viewFrontBtn    = document.getElementById('view-front-btn')   as HTMLButtonElement;
const viewSideBtn     = document.getElementById('view-side-btn')    as HTMLButtonElement;
const viewTopBtn      = document.getElementById('view-top-btn')     as HTMLButtonElement;
const paletteGrid     = document.getElementById('element-grid')!;
const atomGrabListEl  = document.getElementById('atom-grab-list')!;
const handOverlayCanvas = document.getElementById('hand-overlay')   as HTMLCanvasElement;

// Track active AR session so the button can toggle it off
let activeArManager: { dispose(): void } | null = null;
let activeArObjectManager: { update(): void; dispose(): void; triggerLink(): void } | null = null;

const toggleVideoBtn = document.getElementById('toggle-video-btn') as HTMLButtonElement;
const arBenzeneBtn   = document.getElementById('ar-benzene-btn')   as HTMLButtonElement;
const arLabelBtn     = document.getElementById('ar-label-btn')     as HTMLButtonElement;

toggleVideoBtn?.addEventListener('click', () => {
  if (!sceneManager) return;
  if (sceneManager.isVideoHidden()) {
    sceneManager.showVideoBackground();
    toggleVideoBtn.textContent = 'Hide Video';
  } else {
    sceneManager.hideVideoBackground();
    toggleVideoBtn.textContent = 'Show Video';
  }
});

arBenzeneBtn?.addEventListener('click', () => { builder.loadPreset(BENZENE_STARTER_FORMAT); });
arLabelBtn?.addEventListener('click', () => { /* TODO: labeling (Phase 6) */ });

arBtn?.addEventListener('click', async () => {
  if (!sceneManager) return;

  // ── Toggle off ────────────────────────────────────────────────────────
  if (activeArManager) {
    sceneManager.setOnBeforeRender(null);
    activeArObjectManager?.dispose();
    activeArObjectManager = null;
    activeArManager.dispose();
    activeArManager = null;
    sceneManager.setArMode(false);
    arBtn.textContent = 'Start AR';
    markerlessBtn.disabled = false;
    toggleVideoBtn.style.display = 'none';
    toggleVideoBtn.textContent = 'Hide Video';
    arBenzeneBtn.style.display = 'none';
    arLabelBtn.style.display = 'none';
    infoBar.textContent = '';
    return;
  }

  // ── Toggle on ─────────────────────────────────────────────────────────
  arBtn.disabled = true;
  arBtn.textContent = 'Starting…';
  markerlessBtn.disabled = true;

  try {
    // Dynamic import keeps the AR library out of the desktop bundle
    const [
      { MarkerRegistry },
      { MarkerState },
      { ArManager },
      { ArObjectManager },
    ] = await Promise.all([
      import('@/ar/MarkerRegistry'),
      import('@/ar/MarkerState'),
      import('@/ar/ArManager'),
      import('@/objects/ArObjectManager'),
    ]);

    const registry = new MarkerRegistry();
    const markerState = new MarkerState();
    const arManager = new ArManager(registry, markerState);

    await arManager.init();

    // Mirror unless we explicitly got a rear-facing camera.
    // On laptops, facingMode is '' or 'user'; 'environment' only on mobile rear cam.
    const track = arManager.video.srcObject instanceof MediaStream
      ? arManager.video.srcObject.getVideoTracks()[0]
      : null;
    const isFrontFacing = track?.getSettings().facingMode !== 'environment';

    // Wire scene for AR
    sceneManager.setVideoBackground(arManager.video, isFrontFacing);
    const proj = arManager.getProjectionMatrix();
    if (proj) sceneManager.setArProjectionMatrix(proj);
    const vw = arManager.video.videoWidth || 640;
    const vh = arManager.video.videoHeight || 480;
    sceneManager.setArMode(true, vw / vh);

    const materialLibrary = new MaterialLibrary();
    const arObjectManager = new ArObjectManager(
      markerState,
      builder,
      sceneManager.scene,
      materialLibrary,
      () => { builder.loadPreset(BENZENE_STARTER_FORMAT); },
      sceneManager.renderer.domElement,
      sceneManager.camera,
    );
    activeArObjectManager = arObjectManager;

    sceneManager.setOnBeforeRender(() => {
      arManager.processFrame();
      arObjectManager.update();
    });

    activeArManager = arManager;
    arBtn.disabled = false;
    arBtn.textContent = 'Stop AR';
    toggleVideoBtn.style.display = '';
    arBenzeneBtn.style.display = '';
    arLabelBtn.style.display = '';
    // markerlessBtn stays disabled while AR is active
    infoBar.textContent = 'AR mode — tap canvas to add atoms';
  } catch (err) {
    console.error('AR init failed:', err);
    arBtn.disabled = false;
    arBtn.textContent = 'Start AR';
    markerlessBtn.disabled = false;
    infoBar.textContent = 'AR unavailable — check camera permissions and HTTPS';
  }
});

// ─── AR tap-to-bond ───────────────────────────────────────────────────────
// Canvas tap calls platform.triggerLink() when AR mode is active.
container.addEventListener('click', () => {
  if (activeArObjectManager) {
    activeArObjectManager.triggerLink();
  }
});

// ─── Markerless mode ──────────────────────────────────────────────────────
// Cached DOM objects (created once on first activation, reused thereafter).
let cachedAtomGrabList: import('@/hand/AtomGrabList').AtomGrabList | null = null;
let cachedHandOverlay:  import('@/hand/HandOverlay').HandOverlay   | null = null;

// Active-session objects (null when markerless is off).
let activeHandManager: { processFrame(): import('@/hand/HandTracker').HandFrame | null; dispose(): void } | null = null;
let activeHandObjectManager: {
  update(f: import('@/hand/HandTracker').HandFrame): void;
  dispose(): void;
  grabberState: import('@/hand/HandObjectManager').GrabberState;
  setSwapHands(v: boolean): void;
  setSimpleMode(v: boolean): void;
  readonly simpleMode: boolean;
  readonly grabberHandDetected: boolean;
  readonly rotationHandDetected: boolean;
  readonly firstAtomMode: boolean;
  readonly pinchProgress: number;
  readonly pinchTriggered: boolean;
  readonly rotationIsOpen: boolean;
  readonly rotationSignedAngleRad: number;
  readonly zoomDirection: 'in' | 'out' | 'none';
  readonly rotationState: import('@/hand/HandObjectManager').RotationState;
} | null = null;
let activeGhostRenderer: { dispose(): void } | null = null;
let markerlessModeActive = false;
let swapHandsActive      = false;
let simpleModeActive     = false;

markerlessBtn?.addEventListener('click', async () => {
  if (!sceneManager) return;

  // ── Toggle off ──────────────────────────────────────────────────────────
  if (markerlessModeActive) {
    markerlessModeActive = false; // prevent library callback from branching wrong path

    sceneManager.setOnBeforeRender(null);
    activeHandObjectManager?.dispose();
    activeHandObjectManager = null;
    activeHandManager?.dispose();
    activeHandManager = null;
    activeGhostRenderer?.dispose();
    activeGhostRenderer = null;
    cachedHandOverlay?.clear();
    cachedHandOverlay?.hide();
    sceneManager.setMarkerlessMode(false);

    // Restore desktop controls and pass current atom meshes so raycasting works
    desktopControls = new DesktopControls(sceneManager, builder, infoBar);
    if (currentAtomMeshes.length > 0) {
      desktopControls.updateGeometry(
        { atoms: [], bonds: [], boundingRadius: 0, center: [0, 0, 0] as [number, number, number] },
        currentAtomMeshes,
      );
    }

    // Fade out atom grab list, then fully hide after transition
    atomGrabListEl.style.opacity = '0';
    const grabListRef = cachedAtomGrabList;
    setTimeout(() => { grabListRef?.hide(); }, 220);

    // Fade in palette grid
    paletteGrid.style.display = '';
    requestAnimationFrame(() => { paletteGrid.style.opacity = '1'; });

    swapHandsBtn.style.display  = 'none';
    simpleModeBtn.style.display = 'none';
    viewResetBtn.style.display  = 'none';
    viewFrontBtn.style.display  = 'none';
    viewSideBtn.style.display   = 'none';
    viewTopBtn.style.display    = 'none';
    arBtn.disabled = false;
    markerlessBtn.textContent = 'Markerless';
    infoBar.textContent = 'Select an element and click the canvas to start building.';
    swapHandsActive      = false;
    simpleModeActive     = false;
    swapHandsBtn.textContent  = 'L=Grab, R=Rotate';
    cachedAtomGrabList?.setSide('left');
    simpleModeBtn.textContent = 'Simple Mode: Off';
    return;
  }

  // ── Toggle on ───────────────────────────────────────────────────────────
  markerlessBtn.disabled = true;
  markerlessBtn.textContent = 'Starting…';
  arBtn.disabled = true;

  // Fade palette out immediately — gives visual feedback during camera init (~3 s)
  paletteGrid.style.opacity = '0';

  try {
    // Dynamic imports keep these modules out of the desktop bundle
    const [
      { HandManager },
      { HandObjectManager },
      { AtomGrabList },
      { HandOverlay },
      { GhostRenderer },
      { MaterialLibrary },
    ] = await Promise.all([
      import('@/hand/HandManager'),
      import('@/hand/HandObjectManager'),
      import('@/hand/AtomGrabList'),
      import('@/hand/HandOverlay'),
      import('@/rendering/GhostRenderer'),
      import('@/rendering/MaterialLibrary'),
    ]);

    // Dispose desktop controls — hand gestures control rotation instead
    desktopControls?.dispose();
    desktopControls = null;

    const handManager = new HandManager();
    await handManager.init();

    sceneManager.setMarkerlessMode(true);

    // Build (or reuse) the persistent DOM overlay objects
    if (!cachedAtomGrabList) cachedAtomGrabList = new AtomGrabList(atomGrabListEl);
    if (!cachedHandOverlay)  cachedHandOverlay  = new HandOverlay(handOverlayCanvas);

    const ghostRenderer   = new GhostRenderer();
    const materialLibrary = new MaterialLibrary();

    const handObjectManager = new HandObjectManager(
      builder,
      sceneManager,
      materialLibrary,
      cachedAtomGrabList,
      ghostRenderer,
    );

    // Complete palette hide (opacity already 0 from before the await)
    paletteGrid.style.display = 'none';

    // Fade in atom grab list: set opacity 0, show (display:flex), then rAF → opacity 1
    atomGrabListEl.style.opacity = '0';
    cachedAtomGrabList.show();
    requestAnimationFrame(() => { atomGrabListEl.style.opacity = '1'; });

    cachedHandOverlay.syncSize();
    cachedHandOverlay.show();
    swapHandsBtn.style.display   = '';
    simpleModeBtn.style.display  = '';
    viewResetBtn.style.display   = '';
    viewFrontBtn.style.display   = '';
    viewSideBtn.style.display    = '';
    viewTopBtn.style.display     = '';

    markerlessBtn.disabled = false;
    markerlessBtn.textContent = 'Stop Markerless';
    infoBar.textContent = 'Markerless — left hand grabs atoms, right hand rotates';

    sceneManager.setOnBeforeRender(() => {
      const frame = handManager.processFrame();
      if (!frame) {
        cachedHandOverlay?.clear();
        return;
      }
      handObjectManager.update(frame);
      const el = builder.getCurrentElement();
      cachedHandOverlay!.update(frame, handObjectManager.grabberState, {
        grabbedColor:          el?.color,
        swapHands:             swapHandsActive,
        pinchProgress:         handObjectManager.pinchProgress,
        pinchTriggered:        handObjectManager.pinchTriggered,
        grabberHandDetected:   handObjectManager.grabberHandDetected,
        firstAtomMode:         handObjectManager.firstAtomMode,
        rotationIsOpen:        handObjectManager.rotationIsOpen,
        rotationSignedAngle:   handObjectManager.rotationSignedAngleRad,
        zoomDirection:         handObjectManager.zoomDirection,
        rotationState:         handObjectManager.rotationState,
      });

      // Step-by-step guidance: tell the user what to do next.
      const gSeen        = handObjectManager.grabberHandDetected;
      const rSeen        = handObjectManager.rotationHandDetected;
      const grabberHand  = swapHandsActive ? 'right' : 'left';
      const rotHand      = swapHandsActive ? 'left' : 'right';
      const gs           = handObjectManager.grabberState;
      const rotState     = handObjectManager.rotationState;
      let guidance: string;

      if (!gSeen && !rSeen) {
        guidance = 'Show your hands to the camera';
      } else if (!gSeen) {
        // Only rotation hand visible — give rotation-specific guidance
        if (rotState === 'READY') {
          guidance = `${rotHand} hand ready — pinch to rotate, fist to zoom`;
        } else {
          guidance = `Show ${grabberHand} hand to grab atoms`;
        }
      } else if (gs === 'IDLE') {
        guidance = 'Move finger over element list to pick';
      } else if (gs === 'BROWSING') {
        guidance = `Pinch to grab ${el?.symbol ?? 'element'}`;
      } else if (gs === 'GRABBED') {
        if (handObjectManager.firstAtomMode) {
          guidance = 'Pinch anywhere to place first atom';
        } else if (handObjectManager.simpleMode) {
          guidance = 'Move finger over a bond position and pinch';
        } else {
          guidance = 'Move toward an atom to bond';
        }
      } else if (gs === 'APPROACHING') {
        guidance = 'Move closer to a bond position';
      } else {
        // DOCKING
        guidance = `Pinch to place ${el?.symbol ?? 'atom'}`;
      }
      infoBar.textContent = guidance;
    });

    activeHandManager       = handManager;
    activeHandObjectManager = handObjectManager;
    activeGhostRenderer     = ghostRenderer;
    markerlessModeActive    = true;
  } catch (err) {
    console.error('Markerless init failed:', err);
    sceneManager.setMarkerlessMode(false);
    if (!desktopControls) desktopControls = new DesktopControls(sceneManager, builder, infoBar);
    // Restore palette
    paletteGrid.style.display = '';
    requestAnimationFrame(() => { paletteGrid.style.opacity = '1'; });
    swapHandsBtn.style.display  = 'none';
    viewResetBtn.style.display  = 'none';
    viewFrontBtn.style.display  = 'none';
    viewSideBtn.style.display   = 'none';
    viewTopBtn.style.display    = 'none';
    arBtn.disabled = false;
    markerlessBtn.disabled = false;
    markerlessBtn.textContent = 'Markerless';
    infoBar.textContent = 'Markerless unavailable — check camera permissions and HTTPS';
  }
});

swapHandsBtn?.addEventListener('click', () => {
  swapHandsActive = !swapHandsActive;
  activeHandObjectManager?.setSwapHands(swapHandsActive);
  cachedAtomGrabList?.setSide(swapHandsActive ? 'right' : 'left');
  swapHandsBtn.textContent = swapHandsActive ? 'R=Grab, L=Rotate' : 'L=Grab, R=Rotate';
});

simpleModeBtn?.addEventListener('click', () => {
  simpleModeActive = !simpleModeActive;
  activeHandObjectManager?.setSimpleMode(simpleModeActive);
  simpleModeBtn.textContent = simpleModeActive ? 'Simple Mode: On' : 'Simple Mode: Off';
});

viewResetBtn?.addEventListener('click', () => { activeHandObjectManager?.resetOrientation(); });
viewFrontBtn?.addEventListener('click', () => { activeHandObjectManager?.setViewPreset('front'); });
viewSideBtn?.addEventListener('click',  () => { activeHandObjectManager?.setViewPreset('side'); });
viewTopBtn?.addEventListener('click',   () => { activeHandObjectManager?.setViewPreset('top'); });

// ─── Library panel (view-only) ────────────────────────────────────────────
const libraryContainer = document.getElementById('library-list')!;
const sortedEntries = libraryEntries.slice().sort((a, b) => {
  const na = a.names.en ?? a.names.de ?? '';
  const nb = b.names.en ?? b.names.de ?? '';
  return na.localeCompare(nb);
});

new MoleculeLibrary(libraryContainer, sortedEntries, (entry) => {
  const name = entry.names.en ?? entry.names.de ?? 'Unknown';
  builder.loadPreset(entry.format);
  recognitionBar.textContent = name;
  recognitionBar.style.color = '#aaa';
  infoBar.textContent = `${name}${entry.formula ? ' \u2014 ' + entry.formula : ''} \u2014 ${builder.getMolecule().atoms.length} atoms`;
});
