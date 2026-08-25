/**
 * Night apartment look contracts (GS-ROOM-LIGHT + GS-ROOM-COLOR).
 *
 * Title key art (`public/assets/ui/title-keyart.jpg`) is the color script:
 * dusty lived-in night kitchen, readable silhouettes, deep purple/indigo
 * with warm practicals (window city, lamp, left-side warmth), punchy matte
 * hero objects — not a crushed-black cave, bloom soup, or PBR chrome.
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
 *  keep cabinets from falling into a black cliff.
 *  GS-ROOM-SET: modest hemi/fill/moon lift so OTS backgrounds read. Key
 *  stays put — it dumps on the play slab and would flatten Suki's neighbor
 *  granite. Coat is unlit paper (Toon.ts) so hemi does not blow it. */
export const NIGHT_RIG = {
  hemi: 0.60,
  moon: 0.64,
  key: 4.8,
  lamp: 9.5,
  fill: 8.4,
  pendant: 3.6,
  tvGlow: 2.2,
  chandelier: 6,
  fogDensity: 0.022,
} as const;

/**
 * World-space set-piece centers that must read in the play OTS at spawn
 * (close over-the-shoulder, cat on the left-front of the slab facing +X).
 * Far back-wall dressing is too small in that frustum — these sit on the
 * slab fringe. Apartment.dressRoom plants geometry on these points.
 */
export const SET_DRESS = {
  kitchen: {
    backCounter: { x: 0.55, y: 0.46, z: -1.14 },
    sink: { x: 1.28, y: 1.00, z: -1.14 },
    riceCooker: { x: 0.08, y: 1.00, z: -1.12 },
    fridge: { x: 2.78, y: 0.92, z: 0.22 },
    upperCab: { x: 0.85, y: 2.08, z: -1.22 },
    bakerRack: { x: 1.52, y: 0.95, z: 1.68 },
    portraitHutch: { x: -4.05, y: 1.05, z: 0.55 },
  },
  coffee: {
    backConsole: { x: 0.35, y: 0.28, z: -1.06 },
    loungeChair: { x: 2.42, y: 0.42, z: 0.15 },
    portraitLamp: { x: -3.55, y: 0.85, z: 0.62 },
  },
  desk: {
    backShelf: { x: 0.25, y: 1.15, z: -1.10 },
    fileCab: { x: 2.32, y: 0.58, z: 0.18 },
    portraitCart: { x: -3.42, y: 0.55, z: 0.58 },
  },
  dresser: {
    nightstand: { x: 0.15, y: 0.55, z: -0.96 },
    wardrobe: { x: 2.18, y: 1.10, z: 0.18 },
    portraitHamper: { x: -3.22, y: 0.22, z: 0.68 },
  },
  dining: {
    wineCart: { x: 2.88, y: 0.55, z: 0.18 },
    portraitBuffet: { x: -3.72, y: 0.48, z: 0.42 },
    windowSideboard: { x: 1.15, y: 0.42, z: -1.72 },
  },
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
  stoneVein: 0.38,
  stoneNormal: 0.38,
  ceramicRough: 0.9,
} as const;

/**
 * Night-readable local color. Toon multiplies albedo by TOON_SHADOW_STOP
 * (~0.28) in shadow, so a 0x4a444c counter still displays as ~0.08 — a
 * black slab except in the lamp puddle (BUILD 6 play shot). Paint local
 * color bright enough that shadow-band hue survives, without flattening
 * per-level lamp accents.
 */
export const NIGHT_SURFACE = {
  minWallLuma: 0.34,
  minCounterLuma: 0.46,
  minSkyLuma: 0.14,
  minFogLuma: 0.10,
  maxWallLuma: 0.52,
  maxCounterLuma: 0.62,
  maxSkyLuma: 0.30,
  maxFogLuma: 0.22,
  /** Painted map pixels (marble / plaster) after stain + grain. */
  minMapLuma: 0.38,
  /** Granite blotches: mix toward pale grey / charcoal purple. */
  stonePale: 0.46,
  stoneChar: 0.28,
  /** Cabinet body vs slab — darker wood, not crushed into the floor. */
  cabinetMul: 0.86,
  /** Fog → scene background. */
  bgMul: 0.88,
  floorLightMin: 36,
  floorLightMax: 56,
  /** Purple-red foot of the city gradient (title key art window). */
  cityBot: 0x6a3060,
  shellWall: 0x746090,
  shellRug: 0x7a5870,
  shellRugAccent: 0x9a7088,
  shellShelf: 0x72584e,
  shellFrame: 0x6a5a62,
  shellLeaf: 0x4a8a50,
  shellPan: 0x7a787e,
  shellRack: 0x6a6058,
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

/** Scale a hex toward a brighter twin of itself, preserving hue. */
export function liftLuma(hex: number, minLuma: number): number {
  const L = luminance(hex);
  if (L >= minLuma) return hex;
  if (L < 1e-5) return mixHex(0x3a2a3a, 0x5a4c56, Math.min(1, minLuma / 0.28));
  const s = minLuma / L;
  let r = Math.min(255, Math.round(((hex >> 16) & 255) * s));
  let g = Math.min(255, Math.round(((hex >> 8) & 255) * s));
  let b = Math.min(255, Math.round((hex & 255) * s));
  let out = (r << 16) | (g << 8) | b;
  // integer rounding can undershoot the luma floor
  while (luminance(out) < minLuma && r + g + b < 255 * 3) {
    r = Math.min(255, r + 1);
    g = Math.min(255, g + 1);
    b = Math.min(255, b + 1);
    out = (r << 16) | (g << 8) | b;
  }
  return out;
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

/** Toon gradient stops in Toon.ts — bloom must sit above the hot stop.
 *  Shadow is the band the BUILD 6 play slab actually lives in. */
export const TOON_SHADOW_STOP = 72 / 255;
export const TOON_HOT_STOP = 238 / 255;
