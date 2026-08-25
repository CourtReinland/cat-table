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

/** Squared distance from point P to segment AB on XZ. */
export function distPointSeg2(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const ab2 = abx * abx + abz * abz;
  const t = ab2 < 1e-12 ? 0 : Math.max(0, Math.min(1, (apx * abx + apz * abz) / ab2));
  const dx = ax + abx * t - px;
  const dz = az + abz * t - pz;
  return dx * dx + dz * dz;
}

/**
 * Committed-swipe contact. Sphere at the sampled paw, plus a short capsule
 * that only extends forward when that paw is short of play reach (GLB bone
 * origins sit in the chest after tame). A paw already at/past play reach
 * stays a sphere — no long body-forward cone.
 */
export function swipeHitsProp(
  paw: XZ,
  prop: XZ,
  propRadius: number,
  facing: XZ,
  origin: XZ,
  pawRadius = PAW_HIT_RADIUS,
  playReach = PAW_PLAY_REACH,
): boolean {
  const len = Math.hypot(facing.x, facing.z) || 1;
  const nx = facing.x / len;
  const nz = facing.z / len;
  const along = (paw.x - origin.x) * nx + (paw.z - origin.z) * nz;
  const tipDist = Math.max(along, playReach);
  const tip = { x: origin.x + nx * tipDist, z: origin.z + nz * tipDist };
  const r = pawRadius + propRadius;
  return distPointSeg2(prop.x, prop.z, paw.x, paw.z, tip.x, tip.z) <= r * r;
}
