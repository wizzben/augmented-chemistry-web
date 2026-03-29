import type { Molecule } from '@/chemistry/Molecule';

export class InfoPanel {
  private el: HTMLElement;

  constructor(el: HTMLElement) {
    this.el = el;
  }

  update(molecule: Molecule, recognized: Molecule | null): void {
    if (molecule.atoms.length === 0) {
      this.el.textContent = 'Select an element and click the canvas to start building.';
      return;
    }

    if (recognized) {
      const name = recognized.names?.en ?? recognized.names?.de ?? recognized.name;
      const formula = recognized.formula ? ` \u2014 ${recognized.formula}` : '';
      this.el.textContent = `${name}${formula} \u2014 ${molecule.atoms.length} atoms`;
    } else {
      const saturated = molecule.done ? ' (saturated, unknown)' : '';
      this.el.textContent = `Building\u2026 ${molecule.atoms.length} atom${molecule.atoms.length !== 1 ? 's' : ''}${saturated}`;
    }
  }

  setText(text: string): void {
    this.el.textContent = text;
  }
}
