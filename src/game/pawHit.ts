import { PAW_HIT_RADIUS, PAW_PLAY_REACH } from './sukiGlb.ts';

export type XZ = { x: number; z: number };

/** True when a paw sphere overlaps a prop's XZ disc. */
export function pawHitsProp(
  paw: XZ,
  prop: XZ,
  propRadius: number,
  pawRadius = PAW_HIT_RADIUS,
): boolean {
  const dx = paw.x - prop.x;
  const dz = paw.z - prop.z;
  const r = pawRadius + propRadius;
  return dx * dx + dz * dz <= r * r;
}

/**
 * Committed swipe: smashables in a disc around the cat
 * (`playReach + propRadius`). Facing capsules miss a plant that sits
 * beside the cat after WASD. Paw-bone origins are not the hit volume.
 */
export function swipeHitsProp(
  cat: XZ,
  prop: XZ,
  propRadius: number,
  playReach = PAW_PLAY_REACH,
): boolean {
  const dx = cat.x - prop.x;
  const dz = cat.z - prop.z;
  const r = playReach + propRadius;
  return dx * dx + dz * dz <= r * r;
}
