import { ALL_ELEMENTS, type Element } from '@/chemistry/Element';

function toHex(c: { r: number; g: number; b: number }): string {
  const r = Math.round(c.r * 255).toString(16).padStart(2, '0');
  const g = Math.round(c.g * 255).toString(16).padStart(2, '0');
  const b = Math.round(c.b * 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

function textColor(c: { r: number; g: number; b: number }): string {
  const luminance = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

/**
 * Vertical DOM overlay showing 11 grabbable atom circles on the left edge of
 * the canvas panel. Used in markerless mode — interaction is via hand tracking,
 * not mouse (pointer-events: none on the container).
 *
 * Requires `<div id="atom-grab-list">` inside `#canvas-panel` in index.html.
 *
 * Usage:
 *   const list = new AtomGrabList(document.getElementById('atom-grab-list')!);
 *   list.show();
 *   // each frame:
 *   const el = list.getElementAtScreenPos(fingertipX, fingertipY);
 *   list.highlightElement(el);
 *   // teardown:
 *   list.dispose();
 */
export class AtomGrabList {
  private readonly container: HTMLElement;
  private readonly circles = new Map<Element, HTMLElement>();
  private highlighted: Element | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this._build();
  }

  private _build(): void {
    for (const el of ALL_ELEMENTS) {
      const circle = document.createElement('div');
      circle.className = 'atom-grab-item';
      circle.dataset['element'] = el.symbol;

      const bg = toHex(el.color);
      const fg = textColor(el.color);

      circle.style.cssText = [
        `background:${bg}`,
        `color:${fg}`,
        'width:64px',
        'height:64px',
        'border-radius:50%',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'font-size:20px',
        'font-weight:bold',
        'border:3px solid transparent',
        'transition:transform 0.1s, border-color 0.1s',
        'flex-shrink:0',
        'user-select:none',
      ].join(';');

      circle.textContent = el.symbol;
      this.container.appendChild(circle);
      this.circles.set(el, circle);
    }
  }

  /**
   * Highlight the given element circle with a thick white border and scale-up.
   * Pass null to clear any current highlight.
   */
  highlightElement(el: Element | null): void {
    if (this.highlighted === el) return;

    if (this.highlighted) {
      const prev = this.circles.get(this.highlighted);
      if (prev) {
        prev.style.borderColor = 'transparent';
        prev.style.transform = '';
      }
    }

    this.highlighted = el;

    if (el) {
      const circle = this.circles.get(el);
      if (circle) {
        circle.style.borderColor = '#ffffff';
        circle.style.transform = 'scale(1.15)';
      }
    }
  }

  /**
   * Hit-test a screen position (page-space pixels) against each circle's
   * bounding rect. Returns the Element whose circle contains (x, y), or null.
   *
   * Works despite pointer-events: none — getBoundingClientRect() reads layout
   * geometry regardless of pointer-event settings.
   */
  getElementAtScreenPos(x: number, y: number): Element | null {
    for (const [el, circle] of this.circles) {
      const rect = circle.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return el;
      }
    }
    return null;
  }

  show(): void {
    this.container.style.display = 'flex';
  }

  hide(): void {
    this.container.style.display = 'none';
  }

  dispose(): void {
    this.container.innerHTML = '';
    this.circles.clear();
    this.highlighted = null;
  }
}
