/**
 * GS-PROP-PHYS — mass-scaled arcade shove.
 * Heavier smashables (plant, laptop) take more committed contact; they
 * never freeze. Immovable is scenery-only, not a mass stand-in.
 */

/** Horizontal accel (m/s²) at the current swipe phase. */
export function contactAccel(swing: number, mass: number): number {
  return (swing * 7.0) / Math.max(0.25, mass);
}

/** Impulse scale for a one-shot body bump / kick. */
export function kickScale(power: number, mass: number): number {
  return power / (Math.max(0.25, mass) * 1.35);
}

export function isSmashable(immovable?: boolean): boolean {
  return !immovable;
}
