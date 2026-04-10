import type { Element } from '@/chemistry/Element';
import { ALL_ELEMENTS, ELEMENTS_BY_SYMBOL } from '@/chemistry/Element';

function toHex(c: { r: number; g: number; b: number }): string {
  const r = Math.round(c.r * 255).toString(16).padStart(2, '0');
  const g = Math.round(c.g * 255).toString(16).padStart(2, '0');
  const b = Math.round(c.b * 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

// Pick text color that contrasts with background
function textColor(c: { r: number; g: number; b: number }): string {
  const luminance = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

// Explicit shortcut map: e.key value → element symbol
// Lowercase = plain key, uppercase = Shift+key
const SHORTCUT_MAP = new Map<string, string>([
  ['c', 'C'],   // Carbon
  ['C', 'Cl'],  // Shift+C → Chlorine
  ['n', 'N'],   // Nitrogen
  ['N', 'Na'],  // Shift+N → Sodium
  ['o', 'O'],   // Oxygen
  ['h', 'H'],   // Hydrogen
  ['f', 'F'],   // Fluorine
  ['l', 'Li'],  // Lithium
  ['k', 'K'],   // Potassium
  ['b', 'Br'],  // Bromine
  ['m', 'Mg'],  // Magnesium
]);

export class ElementPalette {
  private buttons = new Map<Element, HTMLButtonElement>();
  private selected: Element | null = null;
  private onSelect: (el: Element) => void;
  private onBenzene: (() => void) | undefined;

  constructor(container: HTMLElement, onSelect: (el: Element) => void, onBenzene?: () => void) {
    this.onSelect = onSelect;
    this.onBenzene = onBenzene;

    for (const el of ALL_ELEMENTS) {
      const btn = document.createElement('button');
      btn.textContent = el.symbol;
      btn.title = `${el.name} (${el.symbol})`;
      const bg = toHex(el.color);
      btn.style.cssText = [
        `background:${bg}`,
        `color:${textColor(el.color)}`,
        'border:2px solid transparent',
        'border-radius:4px',
        'padding:6px 4px',
        'font-size:13px',
        'font-weight:bold',
        'cursor:pointer',
        'width:40px',
      ].join(';');

      btn.addEventListener('click', () => {
        this.setSelected(el);
        this.onSelect(el);
      });

      container.appendChild(btn);
      this.buttons.set(el, btn);
    }

    // Benzene button (Step 5)
    if (onBenzene) {
      const bzBtn = document.createElement('button');
      bzBtn.textContent = 'Bz';
      bzBtn.title = 'Benzene (0)';
      bzBtn.style.cssText = [
        'background:#1a1a4e',
        'color:#aaf',
        'border:2px solid #446',
        'border-radius:4px',
        'padding:6px 4px',
        'font-size:13px',
        'font-weight:bold',
        'cursor:pointer',
        'width:40px',
      ].join(';');
      bzBtn.addEventListener('click', () => {
        this.setSelected(null);
        onBenzene();
      });
      container.appendChild(bzBtn);
    }

    document.addEventListener('keydown', this.onKey);
  }

  setSelected(el: Element | null): void {
    if (this.selected) {
      const prev = this.buttons.get(this.selected);
      if (prev) prev.style.borderColor = 'transparent';
    }
    this.selected = el;
    if (el) {
      const btn = this.buttons.get(el);
      if (btn) btn.style.borderColor = '#ffffff';
    }
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.key === '0' && this.onBenzene) {
      this.setSelected(null);
      this.onBenzene();
      return;
    }
    const symbol = SHORTCUT_MAP.get(e.key);
    if (!symbol) return;
    const el = ELEMENTS_BY_SYMBOL.get(symbol);
    if (el) {
      this.setSelected(el);
      this.onSelect(el);
    }
  };

  dispose(): void {
    document.removeEventListener('keydown', this.onKey);
  }
}
