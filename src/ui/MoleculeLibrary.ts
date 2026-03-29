export interface MoleculeEntry {
  names: Record<string, string>;
  format: string;
  formula?: string;
  category?: string;
  sounds?: Record<string, string>;
  infotext?: Record<string, string>;
}

export class MoleculeLibrary {
  private selectedItem: HTMLElement | null = null;

  constructor(
    container: HTMLElement,
    entries: MoleculeEntry[],
    onLoad: (entry: MoleculeEntry) => void,
  ) {
    for (const entry of entries) {
      const name = entry.names.en ?? entry.names.de ?? 'Unknown';
      const item = document.createElement('div');
      item.textContent = `${name}${entry.formula ? ` (${entry.formula})` : ''}`;
      item.style.cssText = [
        'padding:5px 8px',
        'cursor:pointer',
        'border-radius:3px',
        'font-size:12px',
        'white-space:nowrap',
        'overflow:hidden',
        'text-overflow:ellipsis',
      ].join(';');

      item.addEventListener('mouseenter', () => {
        if (item !== this.selectedItem) item.style.background = '#2a2a4e';
      });
      item.addEventListener('mouseleave', () => {
        if (item !== this.selectedItem) item.style.background = '';
      });
      item.addEventListener('click', () => {
        if (this.selectedItem) this.selectedItem.style.background = '';
        this.selectedItem = item;
        item.style.background = '#3a3a6e';
        onLoad(entry);
      });

      container.appendChild(item);
    }
  }
}
