/**
 * Prop groups are authored with origin at the bottom centre.
 * Physics used to rest at topY + halfH (centre-origin), which hovered every
 * mug/plant by half its height. Snap to the counter plane instead.
 */
export function counterRestY(topY: number): number {
  return topY;
}

/** True when a bottom-origin body has reached the counter from above. */
export function hitCounter(posY: number, topY: number, velY: number): boolean {
  return posY <= topY && velY < 0 && topY > 0.05;
}
