/**
 * Convert molecule XML files from etc/data/library/ to src/data/molecules.json
 *
 * Usage: npx tsx scripts/convert-molecules.ts
 */

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface MoleculeEntry {
  names: Record<string, string>;
  format: string;
  formula: string;
  category: string;
  sounds: Record<string, string>;
  infotext: Record<string, string>;
  sourceFile: string;
}

const LIBRARY_DIR = join(__dirname, '..', '..', 'etc', 'data', 'library');
const OUTPUT_FILE = join(__dirname, '..', 'src', 'data', 'molecules.json');

/**
 * Simple XML parser for the molecule format.
 * The XML is very regular so we use regex rather than a full parser.
 */
function parseMoleculeXml(xml: string): MoleculeEntry | null {
  const names: Record<string, string> = {};
  const sounds: Record<string, string> = {};
  const infotext: Record<string, string> = {};

  // Extract <name lang="xx">value</name>
  const nameRegex = /<name\s+lang="(\w+)">(.*?)<\/name>/gs;
  for (const match of xml.matchAll(nameRegex)) {
    names[match[1]] = match[2].trim();
  }

  // Extract <format>value</format>
  const formatMatch = xml.match(/<format>(.*?)<\/format>/s);
  const format = formatMatch ? formatMatch[1].trim() : '';

  // Extract <formula>value</formula>
  const formulaMatch = xml.match(/<formula>(.*?)<\/formula>/s);
  const formula = formulaMatch ? formulaMatch[1].trim() : '';

  // Extract <category>value</category>
  const categoryMatch = xml.match(/<category>(.*?)<\/category>/s);
  const category = categoryMatch ? categoryMatch[1].trim() : '';

  // Extract <sound lang="xx">value</sound>
  const soundRegex = /<sound\s+lang="(\w+)">(.*?)<\/sound>/gs;
  for (const match of xml.matchAll(soundRegex)) {
    sounds[match[1]] = match[2].trim();
  }

  // Extract <infotext lang="xx">value</infotext>
  const infotextRegex = /<infotext\s+lang="(\w+)">([\s\S]*?)<\/infotext>/g;
  for (const match of xml.matchAll(infotextRegex)) {
    const text = match[2].trim();
    if (text) {
      infotext[match[1]] = text;
    }
  }

  if (!format) {
    return null;
  }

  return { names, format, formula, category, sounds, infotext, sourceFile: '' };
}

// Main
const files = readdirSync(LIBRARY_DIR)
  .filter((f) => f.endsWith('.xml'))
  .sort();

const molecules: MoleculeEntry[] = [];
let errors = 0;

for (const file of files) {
  const xml = readFileSync(join(LIBRARY_DIR, file), 'latin1');
  const entry = parseMoleculeXml(xml);
  if (entry) {
    entry.sourceFile = file;
    molecules.push(entry);
  } else {
    console.error(`Skipping ${file}: no format found`);
    errors++;
  }
}

writeFileSync(OUTPUT_FILE, JSON.stringify(molecules, null, 2) + '\n');
console.log(`Converted ${molecules.length} molecules to ${OUTPUT_FILE}`);
if (errors > 0) {
  console.log(`${errors} files skipped`);
}
