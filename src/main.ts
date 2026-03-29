import moleculesData from '@/data/molecules.json';
import { deserializeMolecule } from '@/chemistry/Serializer';
import { SceneManager } from '@/rendering/SceneManager';
import { MoleculeRenderer } from '@/rendering/MoleculeRenderer';

interface MoleculeEntry {
  names: Record<string, string>;
  format: string;
  formula?: string;
  category?: string;
  sounds?: Record<string, string>;
  infotext?: Record<string, string>;
}

const container = document.getElementById('app')!;
const selector = document.getElementById('molecule-selector') as HTMLSelectElement;
const info = document.getElementById('info')!;

// Sort molecules alphabetically by English name
const entries = (moleculesData as MoleculeEntry[]).slice().sort((a, b) => {
  const nameA = a.names.en ?? a.names.de ?? '';
  const nameB = b.names.en ?? b.names.de ?? '';
  return nameA.localeCompare(nameB);
});

// Populate dropdown first (no WebGL needed)
for (let i = 0; i < entries.length; i++) {
  const entry = entries[i];
  const name = entry.names.en ?? entry.names.de ?? `Molecule ${i}`;
  const option = document.createElement('option');
  option.value = String(i);
  option.textContent = `${name}${entry.formula ? ` (${entry.formula})` : ''}`;
  selector.appendChild(option);
}

// Initialize 3D (may fail in headless browsers without WebGL)
let sceneManager: SceneManager | null = null;
let moleculeRenderer: MoleculeRenderer | null = null;

try {
  sceneManager = new SceneManager(container);
  moleculeRenderer = new MoleculeRenderer();
} catch (e) {
  info.textContent = 'WebGL not available';
  console.error('Failed to initialize WebGL:', e);
}

function loadMolecule(index: number): void {
  const entry = entries[index];
  const name = entry.names.en ?? entry.names.de ?? 'Unknown';

  const molecule = deserializeMolecule(name, entry.format, {
    formula: entry.formula,
    category: entry.category,
    names: entry.names,
  });

  info.textContent = `${name}${entry.formula ? ' \u2014 ' + entry.formula : ''} \u2014 ${molecule.atoms.length} atoms`;

  if (!sceneManager || !moleculeRenderer) return;

  moleculeRenderer.clear();
  const { group, boundingRadius } = moleculeRenderer.renderMolecule(molecule);
  sceneManager.add(group);
  sceneManager.fitToMolecule(boundingRadius);
}

// Select Water by default, or first molecule
const waterIndex = entries.findIndex(
  (e) => e.names.en?.toLowerCase().includes('water') || e.names.de?.toLowerCase() === 'wasser',
);
const defaultIndex = waterIndex >= 0 ? waterIndex : 0;
selector.value = String(defaultIndex);
loadMolecule(defaultIndex);

selector.addEventListener('change', () => {
  loadMolecule(Number(selector.value));
});
