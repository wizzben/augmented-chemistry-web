/**
 * PushButton — a control AR marker that toggles a boolean state.
 * Ports aco_state.c (aco_state_03pushbuttonRefreshState).
 *
 * Uses a bidirectional FuzzyBoolean for hysteresis: the button must be
 * held in view for 10 frames to turn on, and hidden for 10 frames to
 * turn off. platformAddict buttons also require the platform to be visible.
 *
 * Fires onToggle exactly once per state change (edge detection via `confirmed`).
 */

import type { MarkerState } from '@/ar/MarkerState';
import { FuzzyBoolean } from './FuzzyBoolean';

export class PushButton {
  readonly markerName: string;
  /** Whether this button requires the platform marker to be visible. */
  readonly platformAddict: boolean;
  /** Callback fired on every rising/falling edge. */
  onToggle: (value: boolean) => void;

  private fuzzy = new FuzzyBoolean(true);
  value = false;
  private confirmed = false;

  constructor(
    markerName: string,
    platformAddict: boolean,
    onToggle: (value: boolean) => void = () => {},
  ) {
    this.markerName = markerName;
    this.platformAddict = platformAddict;
    this.onToggle = onToggle;
  }

  /** aco_state_03pushbuttonRefreshState — call once per frame. */
  refreshState(markerState: MarkerState, platformVisible: boolean): void {
    // 1. Update bidirectional fuzzy
    this.fuzzy.update(markerState.isVisible(this.markerName));
    this.value = this.fuzzy.value;

    // 2. Platform addicts require the platform to be visible
    if (this.platformAddict && !platformVisible) {
      this.value = false;
    }

    // 3. Edge detection — fire callback only on state change
    if (this.value !== this.confirmed) {
      this.confirmed = this.value;
      this.onToggle(this.value);
    }
  }

  reset(): void {
    this.fuzzy.reset();
    this.value = false;
    this.confirmed = false;
  }
}
