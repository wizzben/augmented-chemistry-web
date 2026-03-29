import type { Element } from '@/chemistry/Element';
import { ALL_ELEMENTS } from '@/chemistry/Element';

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

export class ElementPalette {
  private buttons = new Map<Element, HTMLButtonElement>();
  private selected: Element | null = null;
  private onSelect: (el: Element) => void;

  constructor(container: HTMLElement, onSelect: (el: Element) => void) {
    this.onSelect = onSelect;

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

    // Keyboard shortcuts: first letter of symbol (C, N, O, H, …)
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
    const key = e.key.toUpperCase();
    for (const el of ALL_ELEMENTS) {
      if (el.symbol[0].toUpperCase() === key) {
        this.setSelected(el);
        this.onSelect(el);
        break;
      }
    }
  };

  dispose(): void {
    document.removeEventListener('keydown', this.onKey);
  }
}
