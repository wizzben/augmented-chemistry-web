/**
 * FuzzyBoolean — debounce primitive for AR marker visibility.
 *
 * Extracted from the identical pattern in aco_element.c:181-187
 * and aco_state.c:177-194.
 *
 * bidirectional=false (ElementMarker): counter increments toward THRESHOLD
 *   when visible; resets to 0 immediately when not visible.
 * bidirectional=true (PushButton): counter increments when visible, decrements
 *   when not visible; value flips only at the thresholds 0 and THRESHOLD.
 */

const THRESHOLD = 10; // FUZZY_BOOLEAN_TRUE from aco_element.c:71

export class FuzzyBoolean {
  private counter = 0;
  private _value = false;
  private readonly bidirectional: boolean;

  constructor(bidirectional = false) {
    this.bidirectional = bidirectional;
  }

  update(rawVisible: boolean): void {
    if (rawVisible) {
      if (this.counter < THRESHOLD) this.counter++;
      // Latch on when threshold reached
      if (this.counter >= THRESHOLD) this._value = true;
    } else if (this.bidirectional) {
      // Decrement gradually; latch off only when counter reaches 0
      if (this.counter > 0) this.counter--;
      if (this.counter === 0) this._value = false;
    } else {
      // Unidirectional: immediate reset
      this.counter = 0;
      this._value = false;
    }
  }

  get value(): boolean {
    return this._value;
  }

  reset(): void {
    this.counter = 0;
    this._value = false;
  }
}
