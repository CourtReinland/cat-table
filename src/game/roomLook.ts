/**
 * Night apartment look contracts (GS-ROOM-LIGHT).
 *
 * Title key art (`public/assets/ui/title-keyart.jpg`) is the color script:
 * dusty lived-in night kitchen, readable silhouettes, deep purple/black with
 * warm practicals (window city, lamp, left-side warmth), punchy matte hero
 * objects — not bloom soup or PBR chrome.
 *
 * Shared by Apartment, Props, Textures, Engine, and tests. Pure numbers —
 * no three.js — so node tests can lock the contracts without WebGPU.
 */

/** TSL bloom. Threshold sits above the toon hot stop (238/255 ≈ 0.933)
 *  so lit clay/toon surfaces do not bloom; only lamps / flames / window
 *  punctures do. */
export const BLOOM = {
  strength: 0.12,
  radius: 0.36,
  threshold: 0.97,
} as const;

/** Shared apartment rig — dim enough that toon bands hold silhouettes. */
export const NIGHT_RIG = {
  hemi: 0.26,
  moon: 0.38,
  key: 15,
  lamp: 6.5,
  fill: 3.2,
  pendant: 5.5,
  tvGlow: 2.2,
  chandelier: 6,
  fogDensity: 0.032,
} as const;

/** Warm key from upper-left (title art rim), not a ceiling flood. */
export const NIGHT_KEY_POS = { x: -3.1, y: 3.35, z: 1.35 } as const;

/** Self-lit practicals. Intensities sit above Toon's 0.4 skip so bulbs
 *  stay lamps, but under BLOOM.threshold so they don't wash the room. */
export const EMISSIVE = {
  cap: 1.45,
  bulb: 1.15,
  shade: 0.18,
  string: 0.82,
  stringPulse: 0.12,
  flame: 1.35,
  screen: 0.48,
  photo: 0,
  led: 0.7,
  vanity: 0.95,
} as const;

/** House-look surface finish: dusty / lived-in, not chrome toys. */
export const MATTE = {
  defaultRough: 0.88,
  minRough: 0.28,
  maxMetal: 0.22,
  glassRough: 0.32,
  glassMetal: 0.04,
  floorRough: 0.9,
  floorMetal: 0,
  stoneRough: 0.84,
  stoneMetal: 0,
  plasterRough: 0.96,
  fabricRough: 0.98,
  panelRough: 0.8,
  tileRough: 0.55,
  stoneVein: 0.18,
  stoneNormal: 0.22,
} as const;

export type RoomMatOpts = {
  rough?: number;
  metal?: number;
  emissive?: number;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
};

export function capEmissive(intensity: number, cap = EMISSIVE.cap): number {
  return Math.min(Math.max(0, intensity), cap);
}

export function matteMetal(metal: number, cap = MATTE.maxMetal): number {
  return Math.min(Math.max(0, metal), cap);
}

/** Normalize stdMat-style opts to the house look. Used by Props.roomMat. */
export function roomMatOpts(opts: RoomMatOpts = {}): RoomMatOpts {
  const out: RoomMatOpts = { ...opts };
  out.rough = Math.max(opts.rough ?? MATTE.defaultRough, MATTE.minRough);
  out.metal = matteMetal(opts.metal ?? 0);
  if (opts.emissive !== undefined) {
    out.emissiveIntensity = capEmissive(opts.emissiveIntensity ?? 1);
  }
  return out;
}

/** Rec. 709 luminance of a 0xRRGGBB color. */
export function luminance(hex: number): number {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Toon gradient hot stop in Toon.ts — bloom must sit above this. */
export const TOON_HOT_STOP = 238 / 255;
