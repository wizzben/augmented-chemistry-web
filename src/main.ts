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
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    builder.undoLastAtom();
  }
});

// ─── AR mode ──────────────────────────────────────────────────────────────
const arBtn           = document.getElementById('ar-btn')           as HTMLButtonElement;
const markerlessBtn   = document.getElementById('markerless-btn')   as HTMLButtonElement;
const swapHandsBtn    = document.getElementById('swap-hands-btn')   as HTMLButtonElement;
const paletteGrid     = document.getElementById('element-grid')!;
const atomGrabListEl  = document.getElementById('atom-grab-list')!;
const handOverlayCanvas = document.getElementById('hand-overlay')   as HTMLCanvasElement;

// Track active AR session so the button can toggle it off
let activeArManager: { dispose(): void } | null = null;
let activeArObjectManager: { update(): void; dispose(): void; triggerLink(): void } | null = null;

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

    // Wire scene for AR
    sceneManager.setVideoBackground(arManager.video);
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
    );
    activeArObjectManager = arObjectManager;

    sceneManager.setOnBeforeRender(() => {
      arManager.processFrame();
      arObjectManager.update();
    });

    activeArManager = arManager;
    arBtn.disabled = false;
    arBtn.textContent = 'Stop AR';
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
} | null = null;
let activeGhostRenderer: { dispose(): void } | null = null;
let markerlessModeActive = false;
let swapHandsActive      = false;

markerlessBtn?.addEventListener('click', async () => {
  if (!sceneManager) return;

  // ── Toggle off ──────────────────────────────────────────────────────────
  if (markerlessModeActive) {
    sceneManager.setOnBeforeRender(null);
    activeHandObjectManager?.dispose();
    activeHandObjectManager = null;
    activeHandManager?.dispose();
    activeHandManager = null;
    activeGhostRenderer?.dispose();
    activeGhostRenderer = null;
    cachedHandOverlay?.clear();
    cachedHandOverlay?.hide();
    cachedAtomGrabList?.hide();
    sceneManager.setMarkerlessMode(false);

    // Restore desktop controls
    desktopControls = new DesktopControls(sceneManager, builder, infoBar);

    paletteGrid.style.display = '';
    swapHandsBtn.style.display = 'none';
    arBtn.disabled = false;
    markerlessBtn.textContent = 'Markerless';
    infoBar.textContent = 'Select an element and click the canvas to start building.';
    markerlessModeActive = false;
    swapHandsActive      = false;
    swapHandsBtn.textContent = 'L=Grab, R=Rotate';
    return;
  }

  // ── Toggle on ───────────────────────────────────────────────────────────
  markerlessBtn.disabled = true;
  markerlessBtn.textContent = 'Starting…';
  arBtn.disabled = true;

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

    // Show markerless UI
    paletteGrid.style.display = 'none';
    cachedAtomGrabList.show();
    cachedHandOverlay.syncSize();
    cachedHandOverlay.show();
    swapHandsBtn.style.display = '';

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
        grabbedColor: el?.color,
        swapHands: swapHandsActive,
      });
    });

    activeHandManager       = handManager;
    activeHandObjectManager = handObjectManager;
    activeGhostRenderer     = ghostRenderer;
    markerlessModeActive    = true;
  } catch (err) {
    console.error('Markerless init failed:', err);
    sceneManager.setMarkerlessMode(false);
    desktopControls = new DesktopControls(sceneManager, builder, infoBar);
    paletteGrid.style.display = '';
    swapHandsBtn.style.display = 'none';
    arBtn.disabled = false;
    markerlessBtn.disabled = false;
    markerlessBtn.textContent = 'Markerless';
    infoBar.textContent = 'Markerless unavailable — check camera permissions and HTTPS';
  }
});

swapHandsBtn?.addEventListener('click', () => {
  swapHandsActive = !swapHandsActive;
  activeHandObjectManager?.setSwapHands(swapHandsActive);
  swapHandsBtn.textContent = swapHandsActive ? 'R=Grab, L=Rotate' : 'L=Grab, R=Rotate';
});

// ─── Library panel (view-only) ────────────────────────────────────────────
const libraryContainer = document.getElementById('library-list')!;
const sortedEntries = libraryEntries.slice().sort((a, b) => {
  const na = a.names.en ?? a.names.de ?? '';
  const nb = b.names.en ?? b.names.de ?? '';
  return na.localeCompare(nb);
});

new MoleculeLibrary(libraryContainer, sortedEntries, (entry) => {
  const name = entry.names.en ?? entry.names.de ?? 'Unknown';

  // ── Markerless mode: load preset into builder for editing ─────────────────
  if (markerlessModeActive) {
    builder.loadPreset(entry.format);
    // builder.onChanged is intercepted by HandObjectManager — it re-renders
    // the molecule under the pivot group automatically.
    infoBar.textContent = `${name}${entry.formula ? ' \u2014 ' + entry.formula : ''} \u2014 ${builder.getMolecule().atoms.length} atoms`;
    recognitionBar.textContent = name;
    recognitionBar.style.color = '#aaa';
    return;
  }

  // ── Desktop mode: view-only rendering ────────────────────────────────────
  if (!sceneManager || !moleculeRenderer) return;

  const viewMol = deserializeMolecule(name, entry.format, {
    formula: entry.formula,
    category: entry.category,
    names: entry.names,
  });

  moleculeRenderer.clear();
  const { group, boundingRadius } = moleculeRenderer.renderMolecule(viewMol);
  sceneManager.add(group);
  sceneManager.fitToMolecule(boundingRadius);

  currentAtomMeshes = [];
  desktopControls?.updateGeometry({ atoms: [], bonds: [], boundingRadius: 0, center: [0, 0, 0] }, []);

  infoBar.textContent = `${name}${entry.formula ? ' \u2014 ' + entry.formula : ''} \u2014 ${viewMol.atoms.length} atoms (view only)`;
  recognitionBar.textContent = name;
  recognitionBar.style.color = '#aaa';
});
