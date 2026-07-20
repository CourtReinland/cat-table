import * as THREE from 'three';

export type ProceduralModelOptions = {
  wireframe?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  textureSize?: number;
  textureAnisotropy?: number;
  qualityPriority?: 'reference-fidelity' | 'balanced';
};

export type ProceduralModelRuntime = {
  nodes: Record<string, THREE.Object3D>;
  meshes: Record<string, THREE.Mesh>;
  sockets: Record<string, THREE.Object3D>;
  colliders: Record<string, unknown>;
  destructionGroups: Record<string, THREE.Object3D[]>;
};

type SculptMaterialSpec = Record<string, any>;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function readLayerNumber(value: unknown, keys: string[], fallback: number): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      if (typeof record[key] === 'number') return record[key] as number;
    }
  }
  return fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = /^#[0-9a-f]{3}$/i.test(hex)
    ? '#' + hex.slice(1).split('').map((part) => part + part).join('')
    : hex;
  const value = /^#[0-9a-f]{6}$/i.test(normalized) ? Number.parseInt(normalized.slice(1), 16) : 0x8a7a5f;
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function materialPalette(spec: SculptMaterialSpec): string[] {
  const palette = spec.colorVariation?.palette;
  if (Array.isArray(palette) && palette.length > 0) return palette.filter((value) => typeof value === 'string');
  const secondary = spec.albedo?.secondary;
  const colors = [spec.baseColor ?? spec.color ?? spec.albedo?.dominant, ...(Array.isArray(secondary) ? secondary : [])];
  return colors.filter((value): value is string => typeof value === 'string' && value.startsWith('#'));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothCurve(value: number): number {
  return value * value * (3 - 2 * value);
}

function periodicHash(x: number, y: number, seed: number, periodX: number, periodY: number): number {
  const wrappedX = ((x % periodX) + periodX) % periodX;
  const wrappedY = ((y % periodY) + periodY) % periodY;
  let value = Math.imul(wrappedX + seed * 17, 374761393) ^ Math.imul(wrappedY + seed * 31, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function periodicValueNoise(u: number, v: number, seed: number, periodX: number, periodY: number): number {
  const x = u * periodX;
  const y = v * periodY;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothCurve(x - x0);
  const ty = smoothCurve(y - y0);
  const a = periodicHash(x0, y0, seed, periodX, periodY);
  const b = periodicHash(x0 + 1, y0, seed, periodX, periodY);
  const c = periodicHash(x0, y0 + 1, seed, periodX, periodY);
  const d = periodicHash(x0 + 1, y0 + 1, seed, periodX, periodY);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, tx), THREE.MathUtils.lerp(c, d, tx), ty);
}

type SurfaceBand = {
  frequency: number;
  amplitude: number;
  stretchX: number;
  stretchY: number;
  ridge: boolean;
};

function surfaceBands(spec: SculptMaterialSpec): SurfaceBand[] {
  const source = Array.isArray(spec.surfaceFrequencyBands) ? spec.surfaceFrequencyBands : [];
  const parsed = source.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const band = item as Record<string, unknown>;
    const frequency = typeof band.frequency === 'number' ? band.frequency : 0;
    const amplitude = typeof band.amplitude === 'number' ? band.amplitude : 0;
    if (frequency <= 0 || amplitude <= 0) return [];
    const stretch = Array.isArray(band.stretch) ? band.stretch : [1, 1];
    const description = `${String(band.pattern ?? '')} ${String(band.role ?? '')}`.toLowerCase();
    return [{
      frequency,
      amplitude,
      stretchX: typeof stretch[0] === 'number' ? Math.max(0.1, stretch[0]) : 1,
      stretchY: typeof stretch[1] === 'number' ? Math.max(0.1, stretch[1]) : 1,
      ridge: /(ridge|groove|grain|fiber|striated|crack)/.test(description),
    }];
  });
  return parsed.length > 0 ? parsed : [
    { frequency: 2, amplitude: 0.42, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 12, amplitude: 0.22, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 56, amplitude: 0.08, stretchX: 1, stretchY: 1, ridge: false },
  ];
}

function sampleSurface(u: number, v: number, bands: SurfaceBand[], seed: number): number {
  let value = 0;
  let weight = 0;
  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index];
    const periodX = Math.max(1, Math.round(band.frequency * band.stretchX));
    const periodY = Math.max(1, Math.round(band.frequency * band.stretchY));
    let sample = periodicValueNoise(u, v, seed + index * 1013, periodX, periodY);
    if (band.ridge) sample = 1 - Math.abs(sample * 2 - 1);
    value += sample * band.amplitude;
    weight += band.amplitude;
  }
  return weight > 0 ? clamp01(value / weight) : 0.5;
}

function mixPalette(colors: [number, number, number][], value: number): [number, number, number] {
  if (colors.length === 1) return colors[0];
  const scaled = clamp01(value) * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(scaled));
  const mix = scaled - index;
  const a = colors[index];
  const b = colors[index + 1];
  return [
    Math.round(THREE.MathUtils.lerp(a[0], b[0], mix)),
    Math.round(THREE.MathUtils.lerp(a[1], b[1], mix)),
    Math.round(THREE.MathUtils.lerp(a[2], b[2], mix)),
  ];
}

function writePixel(data: Uint8ClampedArray, offset: number, red: number, green: number, blue: number): void {
  data[offset] = Math.max(0, Math.min(255, Math.round(red)));
  data[offset + 1] = Math.max(0, Math.min(255, Math.round(green)));
  data[offset + 2] = Math.max(0, Math.min(255, Math.round(blue)));
  data[offset + 3] = 255;
}

function makeCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function createMapTexture(
  canvas: HTMLCanvasElement,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [2, 2];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 2,
    typeof repeat[1] === 'number' ? repeat[1] : 2,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  // NOTE(refine-code): loader sets needsUpdate on arrival; flagging early
  // crashes the WebGPU backend on null image.
  return texture;
}

type ProceduralTextureSet = {
  albedo: THREE.Texture;
  roughness: THREE.Texture;
  height: THREE.Texture;
  normal: THREE.Texture;
  ao: THREE.Texture;
  source: 'reference-pixel-extraction' | 'procedural';
};

function referenceMapUrl(spec: SculptMaterialSpec, channel: string): string | null {
  const reference = spec.referencePbr;
  if (!reference || typeof reference !== 'object') return null;
  if (reference.usable === false) return null;
  const confidence = typeof reference.confidence === 'number'
    ? reference.confidence
    : (typeof reference.estimatedFidelity === 'number' ? reference.estimatedFidelity : 0);
  const threshold = typeof reference.targetThreshold === 'number' ? reference.targetThreshold : 0.7;
  if (confidence < threshold) return null;
  const maps = reference.maps;
  if (!maps || typeof maps !== 'object') return null;
  const map = (maps as Record<string, unknown>)[channel];
  if (!map || typeof map !== 'object') return null;
  const record = map as Record<string, unknown>;
  const url = typeof record.url === 'string' && record.url.trim() ? record.url : record.path;
  return typeof url === 'string' && url.trim() ? url : null;
}

function createLoadedMapTexture(
  url: string,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.Texture {
  const texture = new THREE.TextureLoader().load(url);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [1, 1];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 1,
    typeof repeat[1] === 'number' ? repeat[1] : 1,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  // NOTE(refine-code): loader sets needsUpdate on arrival; flagging early
  // crashes the WebGPU backend on null image.
  return texture;
}

function makeReferenceTextureSet(spec: SculptMaterialSpec, options: ProceduralModelOptions): ProceduralTextureSet | null {
  const albedo = referenceMapUrl(spec, 'albedo');
  const roughness = referenceMapUrl(spec, 'roughness');
  const height = referenceMapUrl(spec, 'height');
  const normal = referenceMapUrl(spec, 'normal');
  const ao = referenceMapUrl(spec, 'ao');
  if (!albedo || !roughness || !height || !normal || !ao) return null;
  return {
    albedo: createLoadedMapTexture(albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createLoadedMapTexture(roughness, THREE.NoColorSpace, spec, options),
    height: createLoadedMapTexture(height, THREE.NoColorSpace, spec, options),
    normal: createLoadedMapTexture(normal, THREE.NoColorSpace, spec, options),
    ao: createLoadedMapTexture(ao, THREE.NoColorSpace, spec, options),
    source: 'reference-pixel-extraction',
  };
}

function makeProceduralTextureSet(
  id: string,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): ProceduralTextureSet | null {
  if (typeof document === 'undefined') return null;
  const qualityFirst = (options.qualityPriority ?? 'reference-fidelity') === 'reference-fidelity';
  const requested = options.textureSize ?? spec.textureResolution;
  const requestedSize = typeof requested === 'number' && Number.isFinite(requested)
    ? requested
    : (qualityFirst ? 1024 : 512);
  const size = Math.max(256, Math.min(2048, 2 ** Math.round(Math.log2(requestedSize))));
  const canvases = {
    albedo: makeCanvas(size),
    roughness: makeCanvas(size),
    height: makeCanvas(size),
    normal: makeCanvas(size),
    ao: makeCanvas(size),
  };
  const contexts = {
    albedo: canvases.albedo.getContext('2d'),
    roughness: canvases.roughness.getContext('2d'),
    height: canvases.height.getContext('2d'),
    normal: canvases.normal.getContext('2d'),
    ao: canvases.ao.getContext('2d'),
  };
  if (!contexts.albedo || !contexts.roughness || !contexts.height || !contexts.normal || !contexts.ao) return null;
  const images = {
    albedo: contexts.albedo.createImageData(size, size),
    roughness: contexts.roughness.createImageData(size, size),
    height: contexts.height.createImageData(size, size),
    normal: contexts.normal.createImageData(size, size),
    ao: contexts.ao.createImageData(size, size),
  };
  const seed = hashString(id);
  const bands = surfaceBands(spec);
  const heightField = new Float32Array(size * size);
  const roughnessField = new Float32Array(size * size);
  const palette = materialPalette(spec);
  const fallback = typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F';
  const colors = (palette.length >= 2 ? palette : [fallback, '#6E614B', '#A08F70']).map(hexToRgb);
  const baseRoughness = clamp01(readLayerNumber(spec.roughness, ['base'], 0.76));
  const roughnessVariation = clamp01(readLayerNumber(spec.roughness, ['variation'], 0.18));
  const colorAmplitude = clamp01(readLayerNumber(spec.colorVariation, ['amplitude', 'variation'], 0.18));
  const heightCorrelation = clamp01(readLayerNumber(spec.colorVariation, ['heightCorrelation'], 0.3));
  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const index = y * size + x;
      const height = sampleSurface(u, v, bands, seed + 101);
      const roughNoise = sampleSurface(u, v, bands, seed + 7001);
      const colorNoise = sampleSurface(u, v, bands, seed + 15013);
      heightField[index] = height;
      roughnessField[index] = clamp01(baseRoughness + (roughNoise - 0.5) * roughnessVariation * 2);
      const paletteValue = clamp01(
        0.5 + (colorNoise - 0.5) * colorAmplitude * 2 + (height - 0.5) * heightCorrelation
      );
      const color = mixPalette(colors, paletteValue);
      writePixel(images.albedo.data, index * 4, color[0], color[1], color[2]);
    }
  }
  const normalStrength = Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35));
  const aoStrength = clamp01(readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35));
  for (let y = 0; y < size; y += 1) {
    const up = ((y - 1 + size) % size) * size;
    const down = ((y + 1) % size) * size;
    for (let x = 0; x < size; x += 1) {
      const left = (x - 1 + size) % size;
      const right = (x + 1) % size;
      const index = y * size + x;
      const center = heightField[index];
      const dx = (heightField[y * size + right] - heightField[y * size + left]) * normalStrength * 6;
      const dy = (heightField[down + x] - heightField[up + x]) * normalStrength * 6;
      const inverseLength = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const normalX = -dx * inverseLength;
      const normalY = -dy * inverseLength;
      const normalZ = inverseLength;
      const neighborAverage = (
        heightField[y * size + left] + heightField[y * size + right]
        + heightField[up + x] + heightField[down + x]
      ) * 0.25;
      const cavity = Math.max(0, neighborAverage - center);
      const ao = clamp01(1 - aoStrength * (cavity * 12 + (1 - center) * 0.16));
      const offset = index * 4;
      const heightByte = center * 255;
      const roughnessByte = roughnessField[index] * 255;
      writePixel(images.height.data, offset, heightByte, heightByte, heightByte);
      writePixel(images.roughness.data, offset, roughnessByte, roughnessByte, roughnessByte);
      writePixel(
        images.normal.data, offset,
        (normalX * 0.5 + 0.5) * 255,
        (normalY * 0.5 + 0.5) * 255,
        (normalZ * 0.5 + 0.5) * 255,
      );
      writePixel(images.ao.data, offset, ao * 255, ao * 255, ao * 255);
    }
  }
  contexts.albedo.putImageData(images.albedo, 0, 0);
  contexts.roughness.putImageData(images.roughness, 0, 0);
  contexts.height.putImageData(images.height, 0, 0);
  contexts.normal.putImageData(images.normal, 0, 0);
  contexts.ao.putImageData(images.ao, 0, 0);
  return {
    albedo: createMapTexture(canvases.albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createMapTexture(canvases.roughness, THREE.NoColorSpace, spec, options),
    height: createMapTexture(canvases.height, THREE.NoColorSpace, spec, options),
    normal: createMapTexture(canvases.normal, THREE.NoColorSpace, spec, options),
    ao: createMapTexture(canvases.ao, THREE.NoColorSpace, spec, options),
    source: 'procedural',
  };
}

function createSculptMaterial(id: string, spec: SculptMaterialSpec, options: ProceduralModelOptions): THREE.MeshPhysicalMaterial {
  const textures = makeReferenceTextureSet(spec, options) ?? makeProceduralTextureSet(id, spec, options);
  const material = new THREE.MeshPhysicalMaterial({
    color: textures ? 0xffffff : new THREE.Color(typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F'),
    roughness: textures ? 1 : clamp01(readLayerNumber(spec.roughness, ['base'], 0.76)),
    metalness: clamp01(readLayerNumber(spec.metalness, ['base'], 0.0)),
    clearcoat: clamp01(readLayerNumber(spec.clearcoat, ['base', 'amount'], 0)),
    clearcoatRoughness: clamp01(readLayerNumber(spec.clearcoatRoughness, ['base'], 0.25)),
    transmission: clamp01(readLayerNumber(spec.transmission, ['base', 'amount'], 0)),
    opacity: clamp01(readLayerNumber(spec.opacity, ['base'], 1)),
    transparent: readLayerNumber(spec.transmission, ['base', 'amount'], 0) > 0 || readLayerNumber(spec.opacity, ['base'], 1) < 1,
    alphaTest: Math.max(0, readLayerNumber(spec.alpha, ['cutoff', 'alphaTest'], 0)),
    wireframe: options.wireframe ?? false,
    side: spec.doubleSided === true ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (textures) {
    material.map = textures.albedo;
    material.roughnessMap = textures.roughness;
    material.normalMap = textures.normal;
    material.normalScale.setScalar(Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35)));
    material.aoMap = textures.ao;
    material.aoMap.channel = 0;
    material.aoMapIntensity = readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35);
    const bumpScale = Math.max(0, readLayerNumber(spec.bump, ['amplitude', 'strength'], 0));
    if (bumpScale > 0) {
      material.bumpMap = textures.height;
      material.bumpScale = bumpScale;
    }
    const displacementScale = Math.max(0, readLayerNumber(spec.displacement, ['amplitude', 'strength'], 0));
    if (displacementScale > 0) {
      material.displacementMap = textures.height;
      material.displacementScale = displacementScale;
      material.displacementBias = -displacementScale * 0.5;
    }
  }
  material.envMapIntensity = readLayerNumber(spec, ['envMapIntensity'], 0.8);
  material.userData.sculptMaterial = spec;
  material.userData.proceduralMapsIndependent = true;
  material.userData.pbrTextureSource = textures?.source ?? 'flat-fallback';
  material.userData.referencePbr = spec.referencePbr ?? null;
  material.needsUpdate = true;
  return material;
}

type AttachmentEndpoint = {
  start: THREE.Vector3;
  midpoint: THREE.Vector3;
  quaternion: THREE.Quaternion;
  length: number;
  baseRadius: number;
  endRadius: number;
};

function readVector3(value: unknown, fallback: [number, number, number]): THREE.Vector3 {
  if (Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === 'number')) {
    return new THREE.Vector3(value[0], value[1], value[2]);
  }
  return new THREE.Vector3(fallback[0], fallback[1], fallback[2]);
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function makeAttachmentEndpoint(attachment: unknown): AttachmentEndpoint | null {
  if (!attachment || typeof attachment !== 'object') return null;
  const record = attachment as Record<string, unknown>;
  const start = readVector3(record.localStart, [0, 0, 0]);
  const end = readVector3(record.localEnd, [0, 1, 0]);
  const delta = end.clone().sub(start);
  const length = delta.length();
  if (length <= 0.0001) return null;
  const direction = delta.clone().normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  const baseRadius = Math.max(0.005, readNumber(record.baseRadius, 0.06));
  const endRadius = Math.max(0.003, readNumber(record.endRadius, baseRadius * 0.55));
  return {
    start,
    midpoint: delta.multiplyScalar(0.5),
    quaternion,
    length,
    baseRadius,
    endRadius,
  };
}

// Generated from ObjectSculptSpec target: Candelabra
// Sculpt build pass: structural-pass
// This factory is intentionally pass-gated. Finish browser screenshot review before unlocking deeper passes.
export function createCandelabraModel(options: ProceduralModelOptions = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = "Candelabra";

  const materialMap: Record<string, THREE.Material> = {};
  materialMap["brass"] = createSculptMaterial(
    "brass",
    {"id": "brass", "baseColor": "#c9a24a", "metalness": 0.85, "roughness": {"base": 0.32, "variation": 0.08, "map": "independent procedural roughness noise, center 0.32"}, "clearcoat": 0.3, "emissive": "#000000", "emissiveIntensity": 0.0, "notes": "polished aged brass", "localOverrides": [{"id": "brass_cavity_ao", "target": "base_foot/f_embossed_rings", "roughness": 0.5, "darken": 0.25, "note": "AO inside embossed ring recesses"}, {"id": "brass_edge_wear", "target": "stem/f_knop", "roughness": 0.22, "brighten": 0.2, "note": "polished knop rim highlight"}], "textureResolution": 1024, "textureProjection": {"mode": "triplanar-procedural", "repeat": [1, 1], "anisotropy": 4, "texelDensity": "uniform 1024 px/m intent"}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 0.2, "amplitude": 0.02, "note": "broad form variation"}, {"id": "meso", "frequency": 1.0, "amplitude": 0.05, "note": "crafted relief"}, {"id": "micro", "frequency": 6.0, "amplitude": 0.02, "note": "fine grain"}], "ambientOcclusion": {"strength": 0.5, "note": "cavity darkening inside lathe ring recesses; bright exposed rims"}, "referencePbr": {"usable": false, "confidence": 0.8, "maps": {"albedo": {"path": "zones/brass-albedo.png", "channel": "albedo"}, "roughness": {"path": "zones/brass-roughness.png", "channel": "roughness"}, "height": {"path": "zones/brass-height.png", "channel": "height"}, "normal": {"path": "zones/brass-normal.png", "channel": "normal"}, "ao": {"path": "zones/brass-ao.png", "channel": "ao"}}, "renderPath": "procedural-palette", "note": "zone maps archived as evidence only; photo albedo wraps whole object, procedural palette drives render"}, "albedo": {"primary": "#c9a24a", "secondary": "#8a6a2e"}, "colorVariation": "aged brass variation between raised rims and recesses"},
    options
  );
  materialMap["wax"] = createSculptMaterial(
    "wax",
    {"id": "wax", "baseColor": "#f5efe0", "metalness": 0.0, "roughness": {"base": 0.6, "variation": 0.08, "map": "independent procedural roughness noise, center 0.6"}, "clearcoat": 0.0, "emissive": "#ffb46a", "emissiveIntensity": 0.12, "notes": "warm translucent-ish taper", "localOverrides": [{"id": "wax_top_glow", "target": "candle/f_wick", "emissiveBoost": 0.2, "note": "warm glow near flame"}], "textureResolution": 1024, "textureProjection": {"mode": "triplanar-procedural", "repeat": [1, 1], "anisotropy": 4, "texelDensity": "uniform 1024 px/m intent"}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 0.2, "amplitude": 0.02, "note": "broad form variation"}, {"id": "meso", "frequency": 1.0, "amplitude": 0.05, "note": "crafted relief"}, {"id": "micro", "frequency": 6.0, "amplitude": 0.02, "note": "fine grain"}], "ambientOcclusion": {"strength": 0.5, "note": "soft self-shadowing at cup contact"}, "referencePbr": {"usable": false, "confidence": 0.75, "maps": {"albedo": {"path": "zones/wax-albedo.png", "channel": "albedo"}, "roughness": {"path": "zones/wax-roughness.png", "channel": "roughness"}, "height": {"path": "zones/wax-height.png", "channel": "height"}, "normal": {"path": "zones/wax-normal.png", "channel": "normal"}, "ao": {"path": "zones/wax-ao.png", "channel": "ao"}}, "renderPath": "procedural-palette", "note": "zone maps archived as evidence only; photo albedo wraps whole object, procedural palette drives render"}},
    options
  );
  materialMap["flame"] = createSculptMaterial(
    "flame",
    {"id": "flame", "baseColor": "#ffc46a", "metalness": 0.0, "roughness": {"base": 0.4, "variation": 0.08, "map": "independent procedural roughness noise, center 0.4"}, "clearcoat": 0.0, "emissive": "#ffa030", "emissiveIntensity": 3.2, "notes": "additive teardrop", "surfaceFrequencyBands": [{"id": "macro", "frequency": 0.2, "amplitude": 0.02, "note": "broad form variation"}, {"id": "meso", "frequency": 1.0, "amplitude": 0.05, "note": "crafted relief"}, {"id": "micro", "frequency": 6.0, "amplitude": 0.02, "note": "fine grain"}], "referencePbr": {"usable": false, "baseColor": "#ffc46a", "roughness": 0.4, "metalness": 0.0, "maps": {"albedo": {"path": "zones/flame-albedo.png", "channel": "albedo"}, "roughness": {"path": "zones/flame-roughness.png", "channel": "roughness"}, "height": {"path": "zones/flame-height.png", "channel": "height"}, "normal": {"path": "zones/flame-normal.png", "channel": "normal"}, "ao": {"path": "zones/flame-ao.png", "channel": "ao"}}, "confidence": 0.72, "renderPath": "procedural-palette", "note": "zone maps archived as evidence only; photo albedo wraps whole object, procedural palette drives render"}, "textureResolution": 1024, "textureProjection": {"mode": "triplanar-procedural", "repeat": [1, 1], "anisotropy": 4, "texelDensity": "uniform 1024 px/m intent"}, "ambientOcclusion": {"strength": 0.5, "note": "none — emissive emitter, AO disabled"}},
    options
  );

  const nodes: Record<string, THREE.Object3D> = { root };
  const meshes: Record<string, THREE.Mesh> = {};
  const sockets: Record<string, THREE.Object3D> = {};
  const colliders: Record<string, unknown> = {};
  const destructionGroups: Record<string, THREE.Object3D[]> = {};

  const attachment_root_0 = null;
  const endpoint_root_0 = makeAttachmentEndpoint(attachment_root_0);
  const node_root_0 = new THREE.Group();
  node_root_0.name = "Candelabra__pivot";
  if (endpoint_root_0) {
    node_root_0.position.copy(endpoint_root_0.start);
    node_root_0.rotation.set(0, 0, 0);
    node_root_0.scale.set(1, 1, 1);
  } else {
    node_root_0.position.set(0.0, 0.0, 0.0);
    node_root_0.rotation.set(0.0, 0.0, 0.0);
    node_root_0.scale.set(1.0, 1.0, 1.0);
  }
  node_root_0.userData.sculptComponent = {"id": "root", "name": "Candelabra", "level": "macro", "role": "body", "importance": 1.0, "confidence": 0.95, "primitive": "box", "geometryDescriptor": {"topologyIntent": "assembled turned-metal parts", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated", "normalStrategy": "smooth"}, "parent": null, "attachment": null, "dimensions": {"width": 0.001, "height": 0.001, "depth": 0.001, "units": "meters", "confidence": 1.0}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "bottom-center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0.17, 0], "scale": [0.26, 0.34, 0.1], "isTrigger": false, "notes": ""}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "body", "seamRefs": [], "detachableFragments": ["candle_center", "candle_left", "candle_right"], "breakImpulse": 2.0, "debrisMaterial": "brass"}}, "material": "brass", "materialLayers": ["brass"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "assembly root — degenerate proxy, strip in refine-code"}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "structural"};
  node_root_0.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "bottom-center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0.17, 0], "scale": [0.26, 0.34, 0.1], "isTrigger": false, "notes": ""}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "body", "seamRefs": [], "detachableFragments": ["candle_center", "candle_left", "candle_right"], "breakImpulse": 2.0, "debrisMaterial": "brass"}};
  (nodes["root"] ?? root).add(node_root_0);
  nodes["root"] = node_root_0;
  const mesh_root_0Geometry = endpoint_root_0
    ? new THREE.CylinderGeometry(endpoint_root_0.endRadius, endpoint_root_0.baseRadius, endpoint_root_0.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  const mesh_root_0 = new THREE.Mesh(
    mesh_root_0Geometry,
    materialMap["brass"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_root_0.name = "Candelabra";
  if (endpoint_root_0) {
    mesh_root_0.position.copy(endpoint_root_0.midpoint);
    mesh_root_0.quaternion.copy(endpoint_root_0.quaternion);
  }
  mesh_root_0.castShadow = options.castShadow ?? true;
  mesh_root_0.receiveShadow = options.receiveShadow ?? true;
  mesh_root_0.userData.sculptComponent = {"id": "root", "name": "Candelabra", "level": "macro", "role": "body", "importance": 1.0, "confidence": 0.95, "primitive": "box", "geometryDescriptor": {"topologyIntent": "assembled turned-metal parts", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated", "normalStrategy": "smooth"}, "parent": null, "attachment": null, "dimensions": {"width": 0.001, "height": 0.001, "depth": 0.001, "units": "meters", "confidence": 1.0}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "bottom-center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0.17, 0], "scale": [0.26, 0.34, 0.1], "isTrigger": false, "notes": ""}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "body", "seamRefs": [], "detachableFragments": ["candle_center", "candle_left", "candle_right"], "breakImpulse": 2.0, "debrisMaterial": "brass"}}, "material": "brass", "materialLayers": ["brass"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "assembly root — degenerate proxy, strip in refine-code"}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "structural"};
  node_root_0.add(mesh_root_0);
  meshes["root"] = mesh_root_0;
  colliders["root"] = {"type": "box", "offset": [0, 0.17, 0], "scale": [0.26, 0.34, 0.1], "isTrigger": false, "notes": ""};
  destructionGroups["body"] ??= [];
  destructionGroups["body"].push(node_root_0);

  const attachment_base_foot_1 = {"type": "coaxial-stack", "parentPart": "root", "contact": "bottom of stem", "offset": [0, 0, 0]};
  const endpoint_base_foot_1 = makeAttachmentEndpoint(attachment_base_foot_1);
  const node_base_foot_1 = new THREE.Group();
  node_base_foot_1.name = "Domed Foot__pivot";
  if (endpoint_base_foot_1) {
    node_base_foot_1.position.copy(endpoint_base_foot_1.start);
    node_base_foot_1.rotation.set(0, 0, 0);
    node_base_foot_1.scale.set(1, 1, 1);
  } else {
    node_base_foot_1.position.set(0.0, 0.0, 0.0);
    node_base_foot_1.rotation.set(0.0, 0.0, 0.0);
    node_base_foot_1.scale.set(1.0, 1.0, 1.0);
  }
  node_base_foot_1.userData.sculptComponent = {"id": "base_foot", "name": "Domed Foot", "level": "macro", "role": "base", "importance": 0.8, "confidence": 0.9, "primitive": "lathe", "geometryDescriptor": {"topologyIntent": "lathe of stepped dome profile", "edgeTreatment": {"type": "fillet", "bevelRadius": 0.002, "segments": 2}, "deformationStack": [], "uvStrategy": "lathe-generated", "normalStrategy": "smooth"}, "parent": "root", "attachment": {"type": "coaxial-stack", "parentPart": "root", "contact": "bottom of stem", "offset": [0, 0, 0]}, "dimensions": {"width": 0.1, "height": 0.045, "depth": 0.1, "units": "meters", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0.02, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [{"id": "stem_socket", "accepts": "stem", "position": [0, 0.045, 0]}], "collider": {"type": "cylinder", "offset": [0, 0.02, 0], "scale": [0.1, 0.045, 0.1], "isTrigger": false, "notes": ""}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "brass"}}, "material": "brass", "materialLayers": ["brass"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"kind": "embossed-band", "params": {"rings": 2, "ringRadius": [0.075, 0.09], "relief": 0.003}, "id": "f_embossed_rings"}], "surfaceDetail": {"macroRoughness": 0.32, "microRoughness": 0.1, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity-darkening in dome recess", "edgeWearPattern": "bright on dome edge", "notes": "repoussé swirls approximated by stepped lathe rings"}, "evidenceRefs": ["bottom-third"], "details": ["d1"], "fidelityTier": "form"};
  node_base_foot_1.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0.02, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [{"id": "stem_socket", "accepts": "stem", "position": [0, 0.045, 0]}], "collider": {"type": "cylinder", "offset": [0, 0.02, 0], "scale": [0.1, 0.045, 0.1], "isTrigger": false, "notes": ""}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "brass"}};
  (nodes["root"] ?? root).add(node_base_foot_1);
  nodes["base_foot"] = node_base_foot_1;
  const mesh_base_foot_1Geometry = endpoint_base_foot_1
    ? new THREE.CylinderGeometry(endpoint_base_foot_1.endRadius, endpoint_base_foot_1.baseRadius, endpoint_base_foot_1.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 8, 8, 8);
  const mesh_base_foot_1 = new THREE.Mesh(
    mesh_base_foot_1Geometry,
    materialMap["brass"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_base_foot_1.name = "Domed Foot";
  if (endpoint_base_foot_1) {
    mesh_base_foot_1.position.copy(endpoint_base_foot_1.midpoint);
    mesh_base_foot_1.quaternion.copy(endpoint_base_foot_1.quaternion);
  }
  mesh_base_foot_1.castShadow = options.castShadow ?? true;
  mesh_base_foot_1.receiveShadow = options.receiveShadow ?? true;
  mesh_base_foot_1.userData.sculptComponent = {"id": "base_foot", "name": "Domed Foot", "level": "macro", "role": "base", "importance": 0.8, "confidence": 0.9, "primitive": "lathe", "geometryDescriptor": {"topologyIntent": "lathe of stepped dome profile", "edgeTreatment": {"type": "fillet", "bevelRadius": 0.002, "segments": 2}, "deformationStack": [], "uvStrategy": "lathe-generated", "normalStrategy": "smooth"}, "parent": "root", "attachment": {"type": "coaxial-stack", "parentPart": "root", "contact": "bottom of stem", "offset": [0, 0, 0]}, "dimensions": {"width": 0.1, "height": 0.045, "depth": 0.1, "units": "meters", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0.02, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [{"id": "stem_socket", "accepts": "stem", "position": [0, 0.045, 0]}], "collider": {"type": "cylinder", "offset": [0, 0.02, 0], "scale": [0.1, 0.045, 0.1], "isTrigger": false, "notes": ""}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "brass"}}, "material": "brass", "materialLayers": ["brass"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"kind": "embossed-band", "params": {"rings": 2, "ringRadius": [0.075, 0.09], "relief": 0.003}, "id": "f_embossed_rings"}], "surfaceDetail": {"macroRoughness": 0.32, "microRoughness": 0.1, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "cavity-darkening in dome recess", "edgeWearPattern": "bright on dome edge", "notes": "repoussé swirls approximated by stepped lathe rings"}, "evidenceRefs": ["bottom-third"], "details": ["d1"], "fidelityTier": "form"};
  node_base_foot_1.add(mesh_base_foot_1);
  meshes["base_foot"] = mesh_base_foot_1;
  colliders["base_foot"] = {"type": "cylinder", "offset": [0, 0.02, 0], "scale": [0.1, 0.045, 0.1], "isTrigger": false, "notes": ""};
  destructionGroups["body"] ??= [];
  destructionGroups["body"].push(node_base_foot_1);
  const socket_base_foot_stem_socket_0 = new THREE.Object3D();
  socket_base_foot_stem_socket_0.name = "stem_socket";
  socket_base_foot_stem_socket_0.position.set(0.0, 0.045, 0.0);
  socket_base_foot_stem_socket_0.rotation.set(0, 0, 0);
  socket_base_foot_stem_socket_0.userData.socket = {"id": "stem_socket", "accepts": "stem", "position": [0, 0.045, 0]};
  node_base_foot_1.add(socket_base_foot_stem_socket_0);
  sockets["base_foot:stem_socket"] = socket_base_foot_stem_socket_0;
  // TODO: replace 'base_foot' box fallback with lathe procedural geometry.

  const attachment_stem_2 = {"type": "coaxial-stack", "parentPart": "base_foot", "contact": "sits in stem_socket", "offset": [0, 0.045, 0]};
  const endpoint_stem_2 = makeAttachmentEndpoint(attachment_stem_2);
  const node_stem_2 = new THREE.Group();
  node_stem_2.name = "Baluster Stem__pivot";
  if (endpoint_stem_2) {
    node_stem_2.position.copy(endpoint_stem_2.start);
    node_stem_2.rotation.set(0, 0, 0);
    node_stem_2.scale.set(1, 1, 1);
  } else {
    node_stem_2.position.set(0.0, 0.045, 0.0);
    node_stem_2.rotation.set(0.0, 0.0, 0.0);
    node_stem_2.scale.set(1.0, 1.0, 1.0);
  }
  node_stem_2.userData.sculptComponent = {"id": "stem", "name": "Baluster Stem", "level": "meso", "role": "column", "importance": 0.9, "confidence": 0.9, "primitive": "lathe", "geometryDescriptor": {"topologyIntent": "lathe of baluster profile: foot collar, taper, knop bulb, neck", "edgeTreatment": {"type": "fillet", "bevelRadius": 0.001, "segments": 2}, "deformationStack": [], "uvStrategy": "lathe-generated", "normalStrategy": "smooth"}, "parent": "root", "attachment": {"type": "coaxial-stack", "parentPart": "base_foot", "contact": "sits in stem_socket", "offset": [0, 0.045, 0]}, "dimensions": {"width": 0.05, "height": 0.14, "depth": 0.05, "units": "meters", "confidence": 0.9}, "transform": {"position": [0, 0.045, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0.07, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [{"id": "arm_socket", "accepts": "arm", "position": [0, 0.13, 0]}, {"id": "center_cup_socket", "accepts": "cup", "position": [0, 0.14, 0]}], "collider": {"type": "cylinder", "offset": [0, 0.07, 0], "scale": [0.05, 0.14, 0.05], "isTrigger": false, "notes": ""}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "brass"}}, "material": "brass", "materialLayers": ["brass"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"kind": "baluster-knop", "params": {"knopRadius": 0.028, "knopY": 0.09, "neckRadius": 0.011}, "id": "f_knop"}], "surfaceDetail": {"macroRoughness": 0.3, "microRoughness": 0.1, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "bright knop rim", "notes": ""}, "evidenceRefs": ["middle-third"], "details": ["d2"], "fidelityTier": "form"};
  node_stem_2.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0.07, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [{"id": "arm_socket", "accepts": "arm", "position": [0, 0.13, 0]}, {"id": "center_cup_socket", "accepts": "cup", "position": [0, 0.14, 0]}], "collider": {"type": "cylinder", "offset": [0, 0.07, 0], "scale": [0.05, 0.14, 0.05], "isTrigger": false, "notes": ""}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "brass"}};
  (nodes["root"] ?? root).add(node_stem_2);
  nodes["stem"] = node_stem_2;
  const mesh_stem_2Geometry = endpoint_stem_2
    ? new THREE.CylinderGeometry(endpoint_stem_2.endRadius, endpoint_stem_2.baseRadius, endpoint_stem_2.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 8, 8, 8);
  const mesh_stem_2 = new THREE.Mesh(
    mesh_stem_2Geometry,
    materialMap["brass"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_stem_2.name = "Baluster Stem";
  if (endpoint_stem_2) {
    mesh_stem_2.position.copy(endpoint_stem_2.midpoint);
    mesh_stem_2.quaternion.copy(endpoint_stem_2.quaternion);
  }
  mesh_stem_2.castShadow = options.castShadow ?? true;
  mesh_stem_2.receiveShadow = options.receiveShadow ?? true;
  mesh_stem_2.userData.sculptComponent = {"id": "stem", "name": "Baluster Stem", "level": "meso", "role": "column", "importance": 0.9, "confidence": 0.9, "primitive": "lathe", "geometryDescriptor": {"topologyIntent": "lathe of baluster profile: foot collar, taper, knop bulb, neck", "edgeTreatment": {"type": "fillet", "bevelRadius": 0.001, "segments": 2}, "deformationStack": [], "uvStrategy": "lathe-generated", "normalStrategy": "smooth"}, "parent": "root", "attachment": {"type": "coaxial-stack", "parentPart": "base_foot", "contact": "sits in stem_socket", "offset": [0, 0.045, 0]}, "dimensions": {"width": 0.05, "height": 0.14, "depth": 0.05, "units": "meters", "confidence": 0.9}, "transform": {"position": [0, 0.045, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0.07, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [{"id": "arm_socket", "accepts": "arm", "position": [0, 0.13, 0]}, {"id": "center_cup_socket", "accepts": "cup", "position": [0, 0.14, 0]}], "collider": {"type": "cylinder", "offset": [0, 0.07, 0], "scale": [0.05, 0.14, 0.05], "isTrigger": false, "notes": ""}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "brass"}}, "material": "brass", "materialLayers": ["brass"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"kind": "baluster-knop", "params": {"knopRadius": 0.028, "knopY": 0.09, "neckRadius": 0.011}, "id": "f_knop"}], "surfaceDetail": {"macroRoughness": 0.3, "microRoughness": 0.1, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "bright knop rim", "notes": ""}, "evidenceRefs": ["middle-third"], "details": ["d2"], "fidelityTier": "form"};
  node_stem_2.add(mesh_stem_2);
  meshes["stem"] = mesh_stem_2;
  colliders["stem"] = {"type": "cylinder", "offset": [0, 0.07, 0], "scale": [0.05, 0.14, 0.05], "isTrigger": false, "notes": ""};
  destructionGroups["body"] ??= [];
  destructionGroups["body"].push(node_stem_2);
  const socket_stem_arm_socket_0 = new THREE.Object3D();
  socket_stem_arm_socket_0.name = "arm_socket";
  socket_stem_arm_socket_0.position.set(0.0, 0.13, 0.0);
  socket_stem_arm_socket_0.rotation.set(0, 0, 0);
  socket_stem_arm_socket_0.userData.socket = {"id": "arm_socket", "accepts": "arm", "position": [0, 0.13, 0]};
  node_stem_2.add(socket_stem_arm_socket_0);
  sockets["stem:arm_socket"] = socket_stem_arm_socket_0;
  const socket_stem_center_cup_socket_1 = new THREE.Object3D();
  socket_stem_center_cup_socket_1.name = "center_cup_socket";
  socket_stem_center_cup_socket_1.position.set(0.0, 0.14, 0.0);
  socket_stem_center_cup_socket_1.rotation.set(0, 0, 0);
  socket_stem_center_cup_socket_1.userData.socket = {"id": "center_cup_socket", "accepts": "cup", "position": [0, 0.14, 0]};
  node_stem_2.add(socket_stem_center_cup_socket_1);
  sockets["stem:center_cup_socket"] = socket_stem_center_cup_socket_1;
  // TODO: replace 'stem' box fallback with lathe procedural geometry.

  const attachment_arm_3 = {"type": "socket-join", "parentPart": "stem", "contact": "arm_socket", "offset": [0, 0.175, 0], "parentSocket": "arm_socket", "localStart": [0, 0, 0], "localEnd": [0.11, 0.055, 0], "contactType": "embed", "embedDepth": 0.006, "overlap": 0.004, "gapTolerance": 0.002};
  const endpoint_arm_3 = makeAttachmentEndpoint(attachment_arm_3);
  const node_arm_3 = new THREE.Group();
  node_arm_3.name = "Scroll Arm__pivot";
  if (endpoint_arm_3) {
    node_arm_3.position.copy(endpoint_arm_3.start);
    node_arm_3.rotation.set(0, 0, 0);
    node_arm_3.scale.set(1, 1, 1);
  } else {
    node_arm_3.position.set(0.0, 0.175, 0.0);
    node_arm_3.rotation.set(0.0, 0.0, 0.0);
    node_arm_3.scale.set(1.0, 1.0, 1.0);
  }
  node_arm_3.userData.sculptComponent = {"id": "arm", "name": "Scroll Arm", "level": "meso", "role": "branch", "importance": 0.9, "confidence": 0.85, "primitive": "curve-sweep", "geometryDescriptor": {"topologyIntent": "tube swept along S-curve from stem top out to cup position", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [{"type": "bend", "curve": "s-scroll"}], "uvStrategy": "sweep-generated", "normalStrategy": "smooth"}, "parent": "root", "attachment": {"type": "socket-join", "parentPart": "stem", "contact": "arm_socket", "offset": [0, 0.175, 0], "parentSocket": "arm_socket", "localStart": [0, 0, 0], "localEnd": [0.11, 0.055, 0], "contactType": "embed", "embedDepth": 0.006, "overlap": 0.004, "gapTolerance": 0.002}, "dimensions": {"width": 0.11, "height": 0.055, "depth": 0.014, "units": "meters", "confidence": 0.8}, "transform": {"position": [0, 0.175, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "start", "localPosition": [0, 0, 0], "axis": [1, 0, 0], "confidence": 0.8}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [{"id": "cup_socket", "accepts": "cup", "position": [0.11, 0.055, 0]}], "collider": {"type": "capsule", "offset": [0.055, 0.03, 0], "scale": [0.11, 0.014, 0.014], "isTrigger": false, "notes": ""}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "brass"}}, "material": "brass", "materialLayers": ["brass"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"kind": "s-scroll-leaf-tip", "params": {"tipFlareRadius": 0.014, "tubeRadius": 0.007}, "id": "f_scroll_tip"}], "surfaceDetail": {"macroRoughness": 0.3, "microRoughness": 0.1, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "leaf scroll at tip approximated with flared tube end"}, "evidenceRefs": ["middle-third"], "details": ["d3"], "fidelityTier": "form", "repetition": {"system": "arms-x2", "count": 2, "mirror": "x"}};
  node_arm_3.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "start", "localPosition": [0, 0, 0], "axis": [1, 0, 0], "confidence": 0.8}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [{"id": "cup_socket", "accepts": "cup", "position": [0.11, 0.055, 0]}], "collider": {"type": "capsule", "offset": [0.055, 0.03, 0], "scale": [0.11, 0.014, 0.014], "isTrigger": false, "notes": ""}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "brass"}};
  (nodes["root"] ?? root).add(node_arm_3);
  nodes["arm"] = node_arm_3;
  const mesh_arm_3Geometry = endpoint_arm_3
    ? new THREE.CylinderGeometry(endpoint_arm_3.endRadius, endpoint_arm_3.baseRadius, endpoint_arm_3.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 8, 8, 8);
  const mesh_arm_3 = new THREE.Mesh(
    mesh_arm_3Geometry,
    materialMap["brass"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_arm_3.name = "Scroll Arm";
  if (endpoint_arm_3) {
    mesh_arm_3.position.copy(endpoint_arm_3.midpoint);
    mesh_arm_3.quaternion.copy(endpoint_arm_3.quaternion);
  }
  mesh_arm_3.castShadow = options.castShadow ?? true;
  mesh_arm_3.receiveShadow = options.receiveShadow ?? true;
  mesh_arm_3.userData.sculptComponent = {"id": "arm", "name": "Scroll Arm", "level": "meso", "role": "branch", "importance": 0.9, "confidence": 0.85, "primitive": "curve-sweep", "geometryDescriptor": {"topologyIntent": "tube swept along S-curve from stem top out to cup position", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [{"type": "bend", "curve": "s-scroll"}], "uvStrategy": "sweep-generated", "normalStrategy": "smooth"}, "parent": "root", "attachment": {"type": "socket-join", "parentPart": "stem", "contact": "arm_socket", "offset": [0, 0.175, 0], "parentSocket": "arm_socket", "localStart": [0, 0, 0], "localEnd": [0.11, 0.055, 0], "contactType": "embed", "embedDepth": 0.006, "overlap": 0.004, "gapTolerance": 0.002}, "dimensions": {"width": 0.11, "height": 0.055, "depth": 0.014, "units": "meters", "confidence": 0.8}, "transform": {"position": [0, 0.175, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "start", "localPosition": [0, 0, 0], "axis": [1, 0, 0], "confidence": 0.8}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [{"id": "cup_socket", "accepts": "cup", "position": [0.11, 0.055, 0]}], "collider": {"type": "capsule", "offset": [0.055, 0.03, 0], "scale": [0.11, 0.014, 0.014], "isTrigger": false, "notes": ""}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "brass"}}, "material": "brass", "materialLayers": ["brass"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"kind": "s-scroll-leaf-tip", "params": {"tipFlareRadius": 0.014, "tubeRadius": 0.007}, "id": "f_scroll_tip"}], "surfaceDetail": {"macroRoughness": 0.3, "microRoughness": 0.1, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "leaf scroll at tip approximated with flared tube end"}, "evidenceRefs": ["middle-third"], "details": ["d3"], "fidelityTier": "form", "repetition": {"system": "arms-x2", "count": 2, "mirror": "x"}};
  node_arm_3.add(mesh_arm_3);
  meshes["arm"] = mesh_arm_3;
  colliders["arm"] = {"type": "capsule", "offset": [0.055, 0.03, 0], "scale": [0.11, 0.014, 0.014], "isTrigger": false, "notes": ""};
  destructionGroups["body"] ??= [];
  destructionGroups["body"].push(node_arm_3);
  const socket_arm_cup_socket_0 = new THREE.Object3D();
  socket_arm_cup_socket_0.name = "cup_socket";
  socket_arm_cup_socket_0.position.set(0.11, 0.055, 0.0);
  socket_arm_cup_socket_0.rotation.set(0, 0, 0);
  socket_arm_cup_socket_0.userData.socket = {"id": "cup_socket", "accepts": "cup", "position": [0.11, 0.055, 0]};
  node_arm_3.add(socket_arm_cup_socket_0);
  sockets["arm:cup_socket"] = socket_arm_cup_socket_0;
  // TODO: replace 'arm' box fallback with curve-sweep procedural geometry.

  const attachment_cup_4 = {"type": "socket-join", "parentPart": "arm", "contact": "cup_socket", "offset": [0, 0, 0]};
  const endpoint_cup_4 = makeAttachmentEndpoint(attachment_cup_4);
  const node_cup_4 = new THREE.Group();
  node_cup_4.name = "Candle Cup__pivot";
  if (endpoint_cup_4) {
    node_cup_4.position.copy(endpoint_cup_4.start);
    node_cup_4.rotation.set(0, 0, 0);
    node_cup_4.scale.set(1, 1, 1);
  } else {
    node_cup_4.position.set(0.0, 0.0, 0.0);
    node_cup_4.rotation.set(0.0, 0.0, 0.0);
    node_cup_4.scale.set(1.0, 1.0, 1.0);
  }
  node_cup_4.userData.sculptComponent = {"id": "cup", "name": "Candle Cup", "level": "meso", "role": "vessel", "importance": 0.8, "confidence": 0.9, "primitive": "lathe", "geometryDescriptor": {"topologyIntent": "small turned cup with flared rim and bobeche drip pan", "edgeTreatment": {"type": "fillet", "bevelRadius": 0.001, "segments": 2}, "deformationStack": [], "uvStrategy": "lathe-generated", "normalStrategy": "smooth"}, "parent": "root", "attachment": {"type": "socket-join", "parentPart": "arm", "contact": "cup_socket", "offset": [0, 0, 0]}, "dimensions": {"width": 0.04, "height": 0.028, "depth": 0.04, "units": "meters", "confidence": 0.85}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "bottom", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [{"id": "candle_socket", "accepts": "candle", "position": [0, 0.02, 0]}], "collider": {"type": "cylinder", "offset": [0, 0.014, 0], "scale": [0.04, 0.028, 0.04], "isTrigger": false, "notes": ""}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "brass"}}, "material": "brass", "materialLayers": ["brass"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"kind": "bobeche-drip-pan", "params": {"panRadius": 0.028, "panHeight": 0.006}, "id": "f_bobeche"}, {"kind": "flared-cup-rim", "params": {"rimRadius": 0.02, "flare": 1.15}, "id": "f_rim"}], "surfaceDetail": {"macroRoughness": 0.3, "microRoughness": 0.1, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "bright rim", "notes": ""}, "evidenceRefs": ["top-third"], "details": ["d4", "d5"], "fidelityTier": "form", "repetition": {"system": "cups-x3", "count": 3, "placements": [[0, 0.232, 0], [0.11, 0.23, 0], [-0.11, 0.23, 0]]}};
  node_cup_4.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "bottom", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [{"id": "candle_socket", "accepts": "candle", "position": [0, 0.02, 0]}], "collider": {"type": "cylinder", "offset": [0, 0.014, 0], "scale": [0.04, 0.028, 0.04], "isTrigger": false, "notes": ""}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "brass"}};
  (nodes["root"] ?? root).add(node_cup_4);
  nodes["cup"] = node_cup_4;
  const mesh_cup_4Geometry = endpoint_cup_4
    ? new THREE.CylinderGeometry(endpoint_cup_4.endRadius, endpoint_cup_4.baseRadius, endpoint_cup_4.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 8, 8, 8);
  const mesh_cup_4 = new THREE.Mesh(
    mesh_cup_4Geometry,
    materialMap["brass"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_cup_4.name = "Candle Cup";
  if (endpoint_cup_4) {
    mesh_cup_4.position.copy(endpoint_cup_4.midpoint);
    mesh_cup_4.quaternion.copy(endpoint_cup_4.quaternion);
  }
  mesh_cup_4.castShadow = options.castShadow ?? true;
  mesh_cup_4.receiveShadow = options.receiveShadow ?? true;
  mesh_cup_4.userData.sculptComponent = {"id": "cup", "name": "Candle Cup", "level": "meso", "role": "vessel", "importance": 0.8, "confidence": 0.9, "primitive": "lathe", "geometryDescriptor": {"topologyIntent": "small turned cup with flared rim and bobeche drip pan", "edgeTreatment": {"type": "fillet", "bevelRadius": 0.001, "segments": 2}, "deformationStack": [], "uvStrategy": "lathe-generated", "normalStrategy": "smooth"}, "parent": "root", "attachment": {"type": "socket-join", "parentPart": "arm", "contact": "cup_socket", "offset": [0, 0, 0]}, "dimensions": {"width": 0.04, "height": 0.028, "depth": 0.04, "units": "meters", "confidence": 0.85}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "bottom", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": false, "rotate": false, "scale": false, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [{"id": "candle_socket", "accepts": "candle", "position": [0, 0.02, 0]}], "collider": {"type": "cylinder", "offset": [0, 0.014, 0], "scale": [0.04, 0.028, 0.04], "isTrigger": false, "notes": ""}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "body", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "brass"}}, "material": "brass", "materialLayers": ["brass"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"kind": "bobeche-drip-pan", "params": {"panRadius": 0.028, "panHeight": 0.006}, "id": "f_bobeche"}, {"kind": "flared-cup-rim", "params": {"rimRadius": 0.02, "flare": 1.15}, "id": "f_rim"}], "surfaceDetail": {"macroRoughness": 0.3, "microRoughness": 0.1, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "bright rim", "notes": ""}, "evidenceRefs": ["top-third"], "details": ["d4", "d5"], "fidelityTier": "form", "repetition": {"system": "cups-x3", "count": 3, "placements": [[0, 0.232, 0], [0.11, 0.23, 0], [-0.11, 0.23, 0]]}};
  node_cup_4.add(mesh_cup_4);
  meshes["cup"] = mesh_cup_4;
  colliders["cup"] = {"type": "cylinder", "offset": [0, 0.014, 0], "scale": [0.04, 0.028, 0.04], "isTrigger": false, "notes": ""};
  destructionGroups["body"] ??= [];
  destructionGroups["body"].push(node_cup_4);
  const socket_cup_candle_socket_0 = new THREE.Object3D();
  socket_cup_candle_socket_0.name = "candle_socket";
  socket_cup_candle_socket_0.position.set(0.0, 0.02, 0.0);
  socket_cup_candle_socket_0.rotation.set(0, 0, 0);
  socket_cup_candle_socket_0.userData.socket = {"id": "candle_socket", "accepts": "candle", "position": [0, 0.02, 0]};
  node_cup_4.add(socket_cup_candle_socket_0);
  sockets["cup:candle_socket"] = socket_cup_candle_socket_0;
  // TODO: replace 'cup' box fallback with lathe procedural geometry.

  const attachment_candle_5 = {"type": "socket-join", "parentPart": "cup", "contact": "candle_socket", "offset": [0, 0, 0], "parentSocket": "candle_socket", "localStart": [0, 0, 0], "localEnd": [0, 0.075, 0], "contactType": "embed", "embedDepth": 0.01, "overlap": 0.006, "gapTolerance": 0.001};
  const endpoint_candle_5 = makeAttachmentEndpoint(attachment_candle_5);
  const node_candle_5 = new THREE.Group();
  node_candle_5.name = "Wax Taper__pivot";
  if (endpoint_candle_5) {
    node_candle_5.position.copy(endpoint_candle_5.start);
    node_candle_5.rotation.set(0, 0, 0);
    node_candle_5.scale.set(1, 1, 1);
  } else {
    node_candle_5.position.set(0.0, 0.0, 0.0);
    node_candle_5.rotation.set(0.0, 0.0, 0.0);
    node_candle_5.scale.set(1.0, 1.0, 1.0);
  }
  node_candle_5.userData.sculptComponent = {"id": "candle", "name": "Wax Taper", "level": "meso", "role": "consumable", "importance": 0.85, "confidence": 0.95, "primitive": "cylinder", "geometryDescriptor": {"topologyIntent": "plain wax cylinder, center one taller", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.0015, "segments": 1}, "deformationStack": [], "uvStrategy": "cylindrical", "normalStrategy": "smooth"}, "parent": "root", "attachment": {"type": "socket-join", "parentPart": "cup", "contact": "candle_socket", "offset": [0, 0, 0], "parentSocket": "candle_socket", "localStart": [0, 0, 0], "localEnd": [0, 0.075, 0], "contactType": "embed", "embedDepth": 0.01, "overlap": 0.006, "gapTolerance": 0.001}, "dimensions": {"width": 0.018, "height": 0.075, "depth": 0.018, "units": "meters", "confidence": 0.95}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable", "pivot": {"mode": "bottom", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.95}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": false}, "sockets": [{"id": "flame_socket", "accepts": "flame", "position": [0, 0.078, 0]}], "collider": {"type": "cylinder", "offset": [0, 0.037, 0], "scale": [0.018, 0.075, 0.018], "isTrigger": false, "notes": ""}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "candles", "seamRefs": [], "detachableFragments": [], "breakImpulse": 1.2, "debrisMaterial": "wax"}}, "material": "wax", "materialLayers": ["wax"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"kind": "blackened-wick-tip", "params": {"wickRadius": 0.0015, "wickHeight": 0.006, "color": "#1a1210"}, "id": "f_wick"}], "surfaceDetail": {"macroRoughness": 0.6, "microRoughness": 0.2, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "slight wax translucency faked with emissiveIntensity 0.15 warm"}, "evidenceRefs": ["top-third"], "details": ["d6"], "fidelityTier": "surface", "repetition": {"system": "candles-x3", "count": 3, "placements": [[0, 0.252, 0], [0.11, 0.25, 0], [-0.11, 0.25, 0]], "heightVariations": [0.085, 0.07, 0.07]}};
  node_candle_5.userData.actionProfile = {"animationRole": "detachable", "pivot": {"mode": "bottom", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.95}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": false}, "sockets": [{"id": "flame_socket", "accepts": "flame", "position": [0, 0.078, 0]}], "collider": {"type": "cylinder", "offset": [0, 0.037, 0], "scale": [0.018, 0.075, 0.018], "isTrigger": false, "notes": ""}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "candles", "seamRefs": [], "detachableFragments": [], "breakImpulse": 1.2, "debrisMaterial": "wax"}};
  (nodes["root"] ?? root).add(node_candle_5);
  nodes["candle"] = node_candle_5;
  const mesh_candle_5Geometry = endpoint_candle_5
    ? new THREE.CylinderGeometry(endpoint_candle_5.endRadius, endpoint_candle_5.baseRadius, endpoint_candle_5.length, 32, 12)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 48, 16);
  const mesh_candle_5 = new THREE.Mesh(
    mesh_candle_5Geometry,
    materialMap["wax"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_candle_5.name = "Wax Taper";
  if (endpoint_candle_5) {
    mesh_candle_5.position.copy(endpoint_candle_5.midpoint);
    mesh_candle_5.quaternion.copy(endpoint_candle_5.quaternion);
  }
  mesh_candle_5.castShadow = options.castShadow ?? true;
  mesh_candle_5.receiveShadow = options.receiveShadow ?? true;
  mesh_candle_5.userData.sculptComponent = {"id": "candle", "name": "Wax Taper", "level": "meso", "role": "consumable", "importance": 0.85, "confidence": 0.95, "primitive": "cylinder", "geometryDescriptor": {"topologyIntent": "plain wax cylinder, center one taller", "edgeTreatment": {"type": "chamfer", "bevelRadius": 0.0015, "segments": 1}, "deformationStack": [], "uvStrategy": "cylindrical", "normalStrategy": "smooth"}, "parent": "root", "attachment": {"type": "socket-join", "parentPart": "cup", "contact": "candle_socket", "offset": [0, 0, 0], "parentSocket": "candle_socket", "localStart": [0, 0, 0], "localEnd": [0, 0.075, 0], "contactType": "embed", "embedDepth": 0.01, "overlap": 0.006, "gapTolerance": 0.001}, "dimensions": {"width": 0.018, "height": 0.075, "depth": 0.018, "units": "meters", "confidence": 0.95}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable", "pivot": {"mode": "bottom", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.95}, "transformChannels": {"translate": true, "rotate": true, "scale": false, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": false}, "sockets": [{"id": "flame_socket", "accepts": "flame", "position": [0, 0.078, 0]}], "collider": {"type": "cylinder", "offset": [0, 0.037, 0], "scale": [0.018, 0.075, 0.018], "isTrigger": false, "notes": ""}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "candles", "seamRefs": [], "detachableFragments": [], "breakImpulse": 1.2, "debrisMaterial": "wax"}}, "material": "wax", "materialLayers": ["wax"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"kind": "blackened-wick-tip", "params": {"wickRadius": 0.0015, "wickHeight": 0.006, "color": "#1a1210"}, "id": "f_wick"}], "surfaceDetail": {"macroRoughness": 0.6, "microRoughness": 0.2, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "slight wax translucency faked with emissiveIntensity 0.15 warm"}, "evidenceRefs": ["top-third"], "details": ["d6"], "fidelityTier": "surface", "repetition": {"system": "candles-x3", "count": 3, "placements": [[0, 0.252, 0], [0.11, 0.25, 0], [-0.11, 0.25, 0]], "heightVariations": [0.085, 0.07, 0.07]}};
  node_candle_5.add(mesh_candle_5);
  meshes["candle"] = mesh_candle_5;
  colliders["candle"] = {"type": "cylinder", "offset": [0, 0.037, 0], "scale": [0.018, 0.075, 0.018], "isTrigger": false, "notes": ""};
  destructionGroups["candles"] ??= [];
  destructionGroups["candles"].push(node_candle_5);
  const socket_candle_flame_socket_0 = new THREE.Object3D();
  socket_candle_flame_socket_0.name = "flame_socket";
  socket_candle_flame_socket_0.position.set(0.0, 0.078, 0.0);
  socket_candle_flame_socket_0.rotation.set(0, 0, 0);
  socket_candle_flame_socket_0.userData.socket = {"id": "flame_socket", "accepts": "flame", "position": [0, 0.078, 0]};
  node_candle_5.add(socket_candle_flame_socket_0);
  sockets["candle:flame_socket"] = socket_candle_flame_socket_0;

  root.userData.sculptRuntime = { nodes, meshes, sockets, colliders, destructionGroups } satisfies ProceduralModelRuntime;
  root.userData.lookDevTargets = {"qualityPriority": "reference-fidelity", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": true, "localOverridesRequired": true, "minimumTextureResolution": 1024, "preferredTextureResolution": 2048, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": true, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "forge/stage1_intake/extract_pbr_evidence.py", "acceptedLimitation": "single-image extraction is reference-derived inference, not exact photogrammetry"}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"], "albedoPalette": {"brass": "#c9a24a", "brassDark": "#8a6a2e", "wax": "#f5efe0", "wick": "#1a1210", "flameCore": "#ffd9a0", "flameTip": "#ff8a30"}}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim or environment light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "flat value range", "missing contact shadow", "reference lighting copied without separating material readability"]}, "screenshotReview": ["Compare albedo palette and local color zones.", "Compare roughness/normal/bump response under light.", "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.", "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.", "Capture a neutral-light render to verify material readability without reference lighting.", "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.", "Capture a reference-matched render from the same camera framing as the source."]};
  root.userData.actionReadiness = {
    note: 'Use root.userData.sculptRuntime.nodes for transforms, sockets for attachments, colliders for physics proxies, and destructionGroups for breakable sets.',
  };
  return root;
}

export function createCandelabraLookDevLights(
  mode: 'neutral' | 'grazing' | 'reference' = 'neutral',
): THREE.Group {
  const lights = new THREE.Group();
  lights.name = "Candelabra look-dev lights";
  const hemi = new THREE.HemisphereLight(
    mode === 'reference' ? 0xfff0d6 : 0xf2f4ff,
    0x363b42,
    mode === 'grazing' ? 0.28 : mode === 'reference' ? 0.72 : 0.85,
  );
  lights.add(hemi);
  const key = new THREE.DirectionalLight(
    mode === 'reference' ? 0xffcf8a : 0xfff4e8,
    mode === 'grazing' ? 4.2 : mode === 'reference' ? 2.6 : 2.15,
  );
  if (mode === 'grazing') key.position.set(7.5, 1.1, 4.0);
  else if (mode === 'reference') key.position.set(-4.5, 7.5, 5.0);
  else key.position.set(-4.0, 6.0, 5.5);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.018;
  lights.add(key);
  const fill = new THREE.DirectionalLight(0xa8c4ff, mode === 'grazing' ? 0.12 : 0.42);
  fill.position.set(4.0, 3.0, 3.5);
  lights.add(fill);
  const rim = new THREE.DirectionalLight(0xfff1c4, mode === 'grazing' ? 0.28 : 0.85);
  rim.position.set(0.5, 4.5, -6.0);
  lights.add(rim);
  lights.userData.reviewMode = mode;
  lights.userData.lightingFromPhoto = [{"role": "key", "color": "#fff2e0", "intensity": 1.2, "direction": "upper front-left", "note": "warm studio key from photo"}, {"role": "fill", "color": "#8a9ac8", "intensity": 0.4, "direction": "front-right low", "note": "cool fill lifting shadows"}, {"role": "rim", "color": "#ffe8c0", "intensity": 0.8, "direction": "back upper", "note": "edge separation on dark bg"}, {"role": "exposure", "toneMapping": "ACES", "exposure": 1.1, "note": "match photo contrast"}, {"role": "contactShadow", "type": "blob-shadow", "note": "soft contact shadow under domed foot"}];
  lights.userData.lookDevTargets = {"qualityPriority": "reference-fidelity", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": true, "localOverridesRequired": true, "minimumTextureResolution": 1024, "preferredTextureResolution": 2048, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": true, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "forge/stage1_intake/extract_pbr_evidence.py", "acceptedLimitation": "single-image extraction is reference-derived inference, not exact photogrammetry"}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"], "albedoPalette": {"brass": "#c9a24a", "brassDark": "#8a6a2e", "wax": "#f5efe0", "wick": "#1a1210", "flameCore": "#ffd9a0", "flameTip": "#ff8a30"}}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim or environment light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "flat value range", "missing contact shadow", "reference lighting copied without separating material readability"]}, "screenshotReview": ["Compare albedo palette and local color zones.", "Compare roughness/normal/bump response under light.", "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.", "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.", "Capture a neutral-light render to verify material readability without reference lighting.", "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.", "Capture a reference-matched render from the same camera framing as the source."]};
  return lights;
}
