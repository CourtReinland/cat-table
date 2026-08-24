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

/** Shared apartment rig. Peak is the rim, not a counter pool; hemi/fill
 *  keep cabinets from falling into a black cliff. */
export const NIGHT_RIG = {
  hemi: 0.52,
  moon: 0.58,
  key: 4.8,
  lamp: 9.5,
  fill: 7.2,
  pendant: 3.6,
  tvGlow: 2.2,
  chandelier: 6,
  fogDensity: 0.022,
} as const;

/** Dusty cocoa-purple, not magenta bounce. Rim is peach, not near-white. */
export const NIGHT_AMBIENT = {
  sky: 0x43384c,
  ground: 0x1a1412,
  fill: 0x4e4258,
  rim: 0xffc08a,
  moon: 0x8890b4,
} as const;

/** Warm rim from upper-left/rear — grazes the cat, does not dump on the slab. */
export const NIGHT_KEY_POS = { x: -2.6, y: 3.8, z: -1.8 } as const;
export const NIGHT_KEY_TARGET = { x: 0.2, y: 1.55, z: 0.15 } as const;
export const NIGHT_KEY_CONE = { angle: 0.92, penumbra: 0.88, distance: 14, decay: 2 } as const;
/** Front-right fill so the window half of the room exists. */
export const NIGHT_FILL_POS = { x: 2.2, y: 1.75, z: 2.5 } as const;

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
  ceramicRough: 0.9,
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

/** Mix two 0xRRGGBB colors. `t` is the weight of `b`. */
export function mixHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/** How much a level's key/fill tints the night-family practicals. */
export const ACCENT_MIX = 0.65;

export function levelMood(level: { keyColor: number; fillColor: number; lampColor: number }) {
  return {
    key: mixHex(NIGHT_AMBIENT.rim, level.keyColor, ACCENT_MIX),
    fill: mixHex(NIGHT_AMBIENT.fill, level.fillColor, ACCENT_MIX),
    lamp: level.lampColor,
  };
}

/** Toon gradient hot stop in Toon.ts — bloom must sit above this. */
export const TOON_HOT_STOP = 238 / 255;
