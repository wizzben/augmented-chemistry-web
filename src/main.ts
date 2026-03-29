import moleculesData from '@/data/molecules.json';
import { deserializeMolecule } from '@/chemistry/Serializer';
import { Molecule } from '@/chemistry/Molecule';
import { SceneManager } from '@/rendering/SceneManager';
import { MoleculeRenderer } from '@/rendering/MoleculeRenderer';
import { MoleculeBuilder } from '@/interaction/MoleculeBuilder';
import { DesktopControls } from '@/interaction/DesktopControls';
import { ElementPalette } from '@/ui/ElementPalette';
import { InfoPanel } from '@/ui/InfoPanel';
import { MoleculeLibrary, type MoleculeEntry } from '@/ui/MoleculeLibrary';
import type { MoleculeGeometryData } from '@/rendering/MoleculeGeometry';
import * as THREE from 'three';

// ─── Pre-load library molecules for recognition ───────────────────────────
const libraryEntries = moleculesData as MoleculeEntry[];

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
  desktopControls = new DesktopControls(sceneManager, builder);
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

// ─── Library panel (view-only) ────────────────────────────────────────────
const libraryContainer = document.getElementById('library-list')!;
const sortedEntries = libraryEntries.slice().sort((a, b) => {
  const na = a.names.en ?? a.names.de ?? '';
  const nb = b.names.en ?? b.names.de ?? '';
  return na.localeCompare(nb);
});

new MoleculeLibrary(libraryContainer, sortedEntries, (entry) => {
  if (!sceneManager || !moleculeRenderer) return;

  const name = entry.names.en ?? entry.names.de ?? 'Unknown';
  const viewMol = deserializeMolecule(name, entry.format, {
    formula: entry.formula,
    category: entry.category,
    names: entry.names,
  });

  // Show library molecule in view-only mode (replace builder's rendered group temporarily)
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
