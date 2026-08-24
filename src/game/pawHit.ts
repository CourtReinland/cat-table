export type XZ = { x: number; z: number };

/** True when a paw sphere overlaps a prop's XZ disc. */
export function pawHitsProp(
  paw: XZ,
  prop: XZ,
  propRadius: number,
  pawRadius = 0.11,
): boolean {
  const dx = paw.x - prop.x;
  const dz = paw.z - prop.z;
  const r = pawRadius + propRadius;
  return dx * dx + dz * dz <= r * r;
}
