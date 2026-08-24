import * as THREE from 'three/webgpu';
import { MATTE, NIGHT_SURFACE } from './roomLook';

/**
 * Procedural surface textures for the apartment.
 *
 * Everything is drawn to a canvas at load time — no image assets to ship, and
 * each generator also emits a matching normal map derived from its own height
 * field, so surfaces catch the counter lighting instead of reading as flat fills.
 *
 * Generators are deterministic (seeded) so a level looks the same every run.
 */

export interface Surface {
  map: THREE.Texture;
  normalMap?: THREE.Texture;
  normalScale?: number;
  roughness?: number;
  metalness?: number;
}

// ── deterministic noise ─────────────────────────────────────────────────────

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tiling value noise — wraps on `period` so textures repeat seamlessly. */
function valueNoise(seed: number, period: number) {
  const rnd = mulberry32(seed);
  const grid = new Float32Array(period * period);
  for (let i = 0; i < grid.length; i++) grid[i] = rnd();
  const at = (x: number, y: number) =>
    grid[(((y % period) + period) % period) * period + (((x % period) + period) % period)];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const tx = smooth(x - xi);
    const ty = smooth(y - yi);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
}

function fbm(seed: number, octaves = 4, basePeriod = 8) {
  const layers = Array.from({ length: octaves }, (_, i) =>
    valueNoise(seed + i * 977, basePeriod * 2 ** i),
  );
  return (u: number, v: number) => {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      const p = basePeriod * 2 ** i;
      sum += layers[i](u * p, v * p) * amp;
      norm += amp;
      amp *= 0.5;
    }
    return sum / norm;
  };
}

// ── canvas plumbing ─────────────────────────────────────────────────────────

function makeCanvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function toTexture(canvas: HTMLCanvasElement, srgb: boolean, repeat: number) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

/** Sobel a height field into a tangent-space normal map. */
function normalFromHeight(height: Float32Array, size: number, strength: number, repeat: number) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const h = (x: number, y: number) =>
    height[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      // normalize (-dx, -dy, 1)
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len) * 0.5 * 255 + 127.5;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(canvas, false, repeat);
}

/**
 * Paint a surface pixel-by-pixel from a shader-like callback.
 * `shade` returns [r, g, b] in 0..1 plus a height in 0..1 used for the normal.
 */
function paint(
  size: number,
  repeat: number,
  normalStrength: number,
  shade: (u: number, v: number) => [number, number, number, number],
): Surface {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b, hgt] = shade(x / size, y / size);
      const i = (y * size + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, r * 255));
      img.data[i + 1] = Math.max(0, Math.min(255, g * 255));
      img.data[i + 2] = Math.max(0, Math.min(255, b * 255));
      img.data[i + 3] = 255;
      height[y * size + x] = hgt;
    }
  }
  ctx.putImageData(img, 0, 0);
  return {
    map: toTexture(canvas, true, repeat),
    normalMap: normalStrength > 0 ? normalFromHeight(height, size, normalStrength, repeat) : undefined,
    normalScale: 1,
  };
}

const cache = new Map<string, Surface>();
function cached(key: string, make: () => Surface) {
  let s = cache.get(key);
  if (!s) {
    s = make();
    cache.set(key, s);
  }
  return s;
}

function rgb(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function lumaRgb(c: [number, number, number]): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** Keep painted pixels above the night floor so toon*shadow still shows hue. */
function keepNightRgb(c: [number, number, number], minLuma = NIGHT_SURFACE.minMapLuma): [number, number, number] {
  const L = lumaRgb(c);
  if (L >= minLuma) return c;
  if (L < 1e-5) return [0.28, 0.24, 0.32];
  const s = minLuma / L;
  return [Math.min(1, c[0] * s), Math.min(1, c[1] * s), Math.min(1, c[2] * s)];
}

// ── surfaces ────────────────────────────────────────────────────────────────

/** Dusty night granite — light-grey / charcoal flecks stay visible at night. Not chrome marble. */
export function marbleSurface(baseHex: number, veinHex: number, seed = 7, repeat = 2): Surface {
  return cached(`marble${baseHex}${veinHex}${seed}${repeat}`, () => {
    const base = rgb(baseHex);
    const vein = rgb(veinHex);
    const pale: [number, number, number] = [0.58, 0.54, 0.52];
    const charcoal: [number, number, number] = [0.22, 0.20, 0.24];
    const warp = fbm(seed, 4, 4);
    const grain = fbm(seed + 31, 5, 16);
    const stainN = fbm(seed + 67, 3, 3);
    const s = paint(512, repeat, 1.15, (u, v) => {
      const w = warp(u, v) - 0.5;
      const t = Math.sin((u * 1.1 + v * 0.7 + w * 1.6) * Math.PI * 2);
      const veinAmt = Math.pow(Math.max(0, 1 - Math.abs(t) * 7), 4);
      const dust = grain(u, v);
      const stain = Math.max(0, stainN(u * 0.8, v * 1.1) - 0.58) ** 2;
      const grit = dust > 0.72 ? (dust - 0.72) * 0.7 : dust < 0.22 ? (dust - 0.22) * 0.35 : 0;
      const speck = (dust - 0.5) * 0.12;
      let c = mix(base, vein, veinAmt * MATTE.stoneVein);
      if (dust > 0.68) c = mix(c, pale, NIGHT_SURFACE.stonePale * ((dust - 0.68) / 0.32));
      else if (dust < 0.34) c = mix(c, charcoal, NIGHT_SURFACE.stoneChar * ((0.34 - dust) / 0.34));
      const lived = mix(c, [c[0] * 0.85, c[1] * 0.86, c[2] * 0.9], stain * 0.45);
      const out = keepNightRgb([
        lived[0] + speck + grit * 0.14,
        lived[1] + speck * 0.9 + grit * 0.1,
        lived[2] + speck * 0.85 + grit * 0.08,
      ]);
      return [out[0], out[1], out[2], dust * 0.45 + stain * 0.4 + Math.abs(grit) * 0.3];
    });
    s.roughness = MATTE.stoneRough;
    s.metalness = MATTE.stoneMetal;
    s.normalScale = MATTE.stoneNormal;
    return s;
  });
}

/** Dusty ceramic for mugs, plates, teapots — speckle and wear, never paper-white. */
export function ceramicSurface(baseHex: number, seed = 41, repeat = 2): Surface {
  return cached(`ceramic${baseHex}${seed}${repeat}`, () => {
    let base = rgb(baseHex);
    const luma = 0.2126 * base[0] + 0.7152 * base[1] + 0.0722 * base[2];
    if (luma > 0.72) {
      base = mix(base, [0.76, 0.66, 0.56], 0.42);
    }
    const grain = fbm(seed, 4, 12);
    const stainN = fbm(seed + 17, 3, 4);
    const s = paint(256, repeat, 1.0, (u, v) => {
      const g = grain(u, v);
      const stain = Math.max(0, stainN(u * 0.7, v * 0.9) - 0.6) ** 2;
      const speckle = g > 0.78 ? (g - 0.78) * 0.5 : g < 0.18 ? (g - 0.18) * 0.25 : 0;
      const dirt = mix(base, [0.38, 0.28, 0.22], stain * 0.35 + 0.06);
      const n = (g - 0.5) * 0.08;
      return [dirt[0] + n + speckle * 0.06, dirt[1] + n * 0.9, dirt[2] + n * 0.8, g * 0.45 + stain];
    });
    s.roughness = MATTE.ceramicRough;
    s.metalness = 0;
    s.normalScale = 0.2;
    return s;
  });
}

/** Painted plaster for walls — mottled, with dust streaks and a trowel finish. */
export function plasterSurface(baseHex: number, seed = 3, repeat = 3): Surface {
  return cached(`plaster${baseHex}${seed}${repeat}`, () => {
    const base = rgb(baseHex);
    const mottle = fbm(seed, 4, 3);
    const fine = fbm(seed + 91, 3, 24);
    const s = paint(256, repeat, 1.25, (u, v) => {
      const m = (mottle(u, v) - 0.5) * 0.28;
      const f = (fine(u, v) - 0.5) * 0.08;
      // vertical water stain / dust fall — tinted mauve, not a black drip
      const streak = Math.max(0, mottle(u * 0.35, v * 0.12) - 0.62) * 0.28;
      const dustHi = Math.max(0, mottle(u, v) - 0.55) * 0.18;
      const c = keepNightRgb(
        [
          base[0] + m + f - streak * 0.08 + dustHi * 0.12,
          base[1] + m + f - streak * 0.06 + dustHi * 0.08,
          base[2] + m + f - streak * 0.02 + dustHi * 0.16,
        ],
        NIGHT_SURFACE.minWallLuma,
      );
      return [c[0], c[1], c[2], mottle(u, v) * 0.45 + fine(u, v) * 0.4 + streak];
    });
    s.roughness = MATTE.plasterRough;
    s.normalScale = 0.32;
    return s;
  });
}

/** Woven upholstery for the couch — visible warp/weft at close range. */
export function fabricSurface(baseHex: number, seed = 11, repeat = 4): Surface {
  return cached(`fabric${baseHex}${seed}${repeat}`, () => {
    const base = rgb(baseHex);
    const slub = fbm(seed, 3, 6);
    const s = paint(256, repeat, 2.2, (u, v) => {
      // over/under weave: two out-of-phase square waves
      const wx = Math.sin(u * Math.PI * 2 * 32);
      const wy = Math.sin(v * Math.PI * 2 * 32);
      const weave = wx * wy > 0 ? 0.08 : -0.08;
      const n = (slub(u, v) - 0.5) * 0.14;
      const fade = (slub(u * 0.4, v * 0.4) - 0.5) * 0.08;
      const l = 1 + weave + n + fade;
      const c = keepNightRgb([base[0] * l, base[1] * l, base[2] * l], NIGHT_SURFACE.minWallLuma);
      return [c[0], c[1], c[2], (weave + 0.08) * 4 + slub(u, v) * 0.4];
    });
    s.roughness = MATTE.fabricRough;
    s.normalScale = 0.55;
    return s;
  });
}

/** Patterned area rug — concentric bands plus pile noise. */
export function rugSurface(baseHex: number, accentHex: number, seed = 19, repeat = 1): Surface {
  return cached(`rug${baseHex}${accentHex}${seed}${repeat}`, () => {
    const base = rgb(baseHex);
    const accent = rgb(accentHex);
    const pile = fbm(seed, 4, 20);
    const s = paint(256, repeat, 2.6, (u, v) => {
      const dx = u - 0.5;
      const dy = v - 0.5;
      const r = Math.hypot(dx, dy) * 2;
      const band = Math.sin(r * Math.PI * 7) > 0.55 ? 1 : 0;
      const petal = Math.sin(Math.atan2(dy, dx) * 8) > 0.7 && r < 0.55 ? 1 : 0;
      const c = mix(base, accent, Math.min(1, band * 0.55 + petal * 0.5));
      const n = (pile(u, v) - 0.5) * 0.18;
      const out = keepNightRgb([c[0] + n, c[1] + n, c[2] + n], NIGHT_SURFACE.minWallLuma);
      return [out[0], out[1], out[2], pile(u, v)];
    });
    s.roughness = 1;
    s.normalScale = 0.8;
    return s;
  });
}

/** Painted cabinet / panelled wood — grain plus a shaker panel groove. */
export function panelSurface(baseHex: number, seed = 23, repeat = 2): Surface {
  return cached(`panel${baseHex}${seed}${repeat}`, () => {
    const base = rgb(baseHex);
    const grain = fbm(seed, 4, 5);
    const s = paint(256, repeat, 1.6, (u, v) => {
      // stretched noise reads as wood grain running vertically
      const g = grain(u * 0.25, v * 3.0);
      const rings = Math.sin((g * 6 + u * 9) * Math.PI * 2) * 0.5 + 0.5;
      const dust = (grain(u * 2.2, v * 0.4) - 0.5) * 0.12;
      const l = 0.92 + rings * 0.18 + (g - 0.5) * 0.12 + dust;
      const c = keepNightRgb([base[0] * l, base[1] * l, base[2] * l], NIGHT_SURFACE.minWallLuma);
      return [c[0], c[1], c[2], rings * 0.55 + g * 0.35];
    });
    s.roughness = MATTE.panelRough;
    s.normalScale = 0.36;
    return s;
  });
}

/** Glazed splashback tiles with grout lines. */
export function tileSurface(baseHex: number, groutHex: number, seed = 29, repeat = 4): Surface {
  return cached(`tile${baseHex}${groutHex}${seed}${repeat}`, () => {
    const base = rgb(baseHex);
    const grout = rgb(groutHex);
    const glaze = fbm(seed, 3, 8);
    const s = paint(256, repeat, 3.0, (u, v) => {
      const gx = Math.abs((u * 4) % 1 - 0.5);
      const gy = Math.abs((v * 4) % 1 - 0.5);
      const isGrout = gx > 0.455 || gy > 0.455 ? 1 : 0;
      const n = (glaze(u, v) - 0.5) * 0.08;
      const c = mix(base, grout, isGrout);
      return [c[0] + n, c[1] + n, c[2] + n, isGrout ? 0 : 1];
    });
    s.roughness = MATTE.tileRough;
    s.normalScale = 0.45;
    return s;
  });
}

/** Build a standard material from a Surface, with per-use tiling. */
export function surfaceMat(s: Surface, repeat?: [number, number], extra: Record<string, unknown> = {}) {
  const m = new THREE.MeshStandardNodeMaterial({
    map: s.map,
    roughness: s.roughness ?? MATTE.defaultRough,
    metalness: s.metalness ?? 0,
    ...extra,
  });
  if (s.normalMap) {
    m.normalMap = s.normalMap;
    m.normalScale = new THREE.Vector2(s.normalScale ?? 1, s.normalScale ?? 1);
  }
  if (repeat) {
    // clone so one Surface can tile differently on different meshes
    m.map = s.map.clone();
    m.map.needsUpdate = true;
    m.map.repeat.set(repeat[0], repeat[1]);
    if (s.normalMap) {
      m.normalMap = s.normalMap.clone();
      m.normalMap.needsUpdate = true;
      m.normalMap.repeat.set(repeat[0], repeat[1]);
    }
  }
  return m;
}
