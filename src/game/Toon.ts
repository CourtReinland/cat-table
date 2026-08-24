import * as THREE from 'three/webgpu';
import { positionLocal, normalLocal, attribute, vec3, color as tslColor, texture, mix, float, max, min, step } from 'three/tsl';

/**
 * Cel-shading pass for the whole game:
 *  - MeshToonNodeMaterial with a hard 4-step gradient for all lit surfaces
 *  - inverted-hull dark outlines on character meshes (cat, boyfriends)
 * Emissive, transparent and screen materials are left untouched.
 */

let gradientTex: THREE.DataTexture | null = null;

export function toonGradient(): THREE.DataTexture {
  if (!gradientTex) {
    // 5 steps: shadow → mid → lit → hot. The top stops short of pure white so
    // lit surfaces keep their albedo instead of clipping into the bloom pass.
    const data = new Uint8Array([
      72, 70, 78, 255,
      132, 128, 138, 255,
      186, 182, 188, 255,
      222, 220, 224, 255,
      238, 236, 238, 255,
    ]);
    gradientTex = new THREE.DataTexture(data, 5, 1, THREE.RGBAFormat);
    gradientTex.minFilter = THREE.NearestFilter;
    gradientTex.magFilter = THREE.NearestFilter;
    gradientTex.generateMipmaps = false;
    gradientTex.needsUpdate = true;
  }
  return gradientTex;
}

const toonCache = new Map<string, InstanceType<typeof THREE.MeshToonNodeMaterial>>();

export function toonMaterialFor(
  color: THREE.Color,
  map: THREE.Texture | null = null,
  side: THREE.Side = THREE.FrontSide,
  vertexColors = false,
  normalMap: THREE.Texture | null = null,
  normalScale: THREE.Vector2 | null = null,
) {
  const key = `${color.getHexString()}|${map?.uuid ?? ''}|${side}|${vertexColors}|${normalMap?.uuid ?? ''}`;
  let m = toonCache.get(key);
  if (!m) {
    m = new THREE.MeshToonNodeMaterial({ color, gradientMap: toonGradient(), side });
    if (map) m.map = map;
    if (normalMap) {
      // normals perturb where the toon bands fall, which is what sells the
      // weave / grain / grout on an otherwise flat cel surface
      m.normalMap = normalMap;
      if (normalScale) m.normalScale = normalScale.clone();
    }
    if (vertexColors) {
      // MeshToonNodeMaterial ignores the `vertexColors` flag under the WebGPU
      // node pipeline, so fold COLOR_0 in explicitly. Suki's whole coat —
      // tabby banding, pale bib, banded tail — lives in this attribute.
      m.vertexColors = true;
      // `attribute()` widens its node type to string in the TSL typings, so the
      // vec3 shape has to be reasserted here.
      const coat = vec3(attribute('color', 'vec3') as never);
      m.colorNode = coat.mul(tslColor(color));
    }
    toonCache.set(key, m);
  }
  return m;
}

const SKIP_TYPES = ['Basic', 'Toon', 'Points', 'Sprite', 'Line'];

function isSkippable(mat: any): boolean {
  if (!mat) return true;
  const type: string = mat.type ?? '';
  if (SKIP_TYPES.some((t) => type.includes(t))) return true;
  if (mat.transparent) return true;
  // Only genuinely glowing materials are exempt. Testing emissiveIntensity alone
  // skipped every glTF material, since three defaults it to 1 with black emissive.
  const e = mat.emissive;
  const glows = e && (e.r > 0.02 || e.g > 0.02 || e.b > 0.02);
  if (glows && (mat.emissiveIntensity ?? 1) > 0.4) return true;
  return false;
}

export type ToonifyOpts = {
  /** Keep albedo map (Suki eyes / bow / fluff). Default true. */
  map?: boolean;
  /** Hunyuan coat normals hatch the toon bands — off for Suki. */
  normalMap?: boolean;
  vertexColors?: boolean;
  forceFrontSide?: boolean;
};

/** Convert every lit material under root to stepped toon shading. */
export function toonify(root: THREE.Object3D, opts: ToonifyOpts = {}) {
  const useMap = opts.map !== false;
  // Room surfaces keep normals (grain / grout). Suki coat opts out.
  const useNormal = opts.normalMap !== false;
  const useVC = opts.vertexColors !== false;
  const front = opts.forceFrontSide === true;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const converted = mats.map((m: any) => {
      if (isSkippable(m)) return m;
      return toonMaterialFor(
        m.color ?? new THREE.Color(0xcccccc),
        useMap ? (m.map ?? null) : null,
        front ? THREE.FrontSide : (m.side ?? THREE.FrontSide),
        useVC && !!m.vertexColors,
        useNormal ? (m.normalMap ?? null) : null,
        useNormal ? (m.normalScale ?? null) : null,
      );
    });
    mesh.material = Array.isArray(mesh.material) ? converted : converted[0];
  });
}

/**
 * White cel fluff for Suki — a different material path than room MeshToon + Hunyuan maps.
 * Do not assign the hatch/AO/normal albedo as `map`. Identity (sapphire / pink bow / dark
 * nose) is a chroma+luma mask sampled in the color node only.
 *
 * GS-PLAY-ART: 0xf4f1ee + shadow 176,174,180 read cream / grey-lavender once Hana
 * lifted the night room (BUILD 9). Isolation studio stills of the GLB are already
 * white — this path is the live miss. Cooler paper white, raised cool shadow/mid.
 */
export const SUKI_FLUFF_HEX = 0xf8f8fb;

/** RGB+A, 3 nearest-filter stops: shadow → mid → lit. Not graphite, not peach. */
export const SUKI_FLUFF_GRADIENT = [
  224, 225, 230, 255,
  240, 240, 244, 255,
  252, 252, 254, 255,
] as const;

const FLUFF = new THREE.Color(SUKI_FLUFF_HEX);

let fluffGrad: THREE.DataTexture | null = null;

function sukiFluffGradient(): THREE.DataTexture {
  if (!fluffGrad) {
    const data = new Uint8Array(SUKI_FLUFF_GRADIENT);
    fluffGrad = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
    fluffGrad.minFilter = THREE.NearestFilter;
    fluffGrad.magFilter = THREE.NearestFilter;
    fluffGrad.generateMipmaps = false;
    fluffGrad.needsUpdate = true;
  }
  return fluffGrad;
}

function sukiFluffMaterial(src: any) {
  const m = new THREE.MeshToonNodeMaterial({
    color: FLUFF,
    gradientMap: sukiFluffGradient(),
    side: THREE.FrontSide,
  });
  const albedo = src?.map as THREE.Texture | undefined;
  if (albedo) {
    const rgb = vec3(texture(albedo));
    const cmax = max(rgb.x, max(rgb.y, rgb.z));
    const cmin = min(rgb.x, min(rgb.y, rgb.z));
    const chroma = cmax.sub(cmin);
    const luma = rgb.dot(vec3(0.299, 0.587, 0.114));
    // Hard mask: keep saturated eyes/bow and dark features; coat becomes flat white.
    const ident = max(step(float(0.14), chroma), float(1).sub(step(float(0.28), luma)));
    m.colorNode = mix(tslColor(FLUFF), rgb, ident);
  }
  // Never assign Hunyuan maps — that was the scribble path.
  return m;
}

/** Suki coat: white toon fluff shader. Drops scribble/AO/hatch albedo. No ink hull. */
export function toonifySukiCoat(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const converted = mats.map((m: any) => {
      if (!m || isSkippable(m)) return m;
      return sukiFluffMaterial(m);
    });
    mesh.material = Array.isArray(mesh.material) ? converted : converted[0];
  });
}

const outlineMats = new Map<string, InstanceType<typeof THREE.MeshBasicNodeMaterial>>();

/**
 * Inverted-hull outlines for character models (call after toonify).
 *
 * The hull is offset along the vertex normal in the shader rather than by
 * scaling the object: uniform scaling puts a lopsided outline on anything whose
 * geometry isn't centred on its origin, and it breaks outright on skinned
 * meshes. `positionNode` runs before skinning, so this follows the skeleton.
 */
export function outlineCharacter(root: THREE.Object3D, color = 0x241826, thickness = 0.006) {
  const key = `${color}|${thickness}`;
  let mat = outlineMats.get(key);
  if (!mat) {
    mat = new THREE.MeshBasicNodeMaterial({ color, side: THREE.BackSide });
    mat.positionNode = positionLocal.add(normalLocal.mul(thickness));
    outlineMats.set(key, mat);
  }
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    // tiny/thin bits gain nothing from an outline and just get muddy
    if (/(Glint|Whisker|Pupil|flame|Icosphere)/.test(m.name)) return;
    if ((m as any).userData?.isOutline) return;
    meshes.push(m);
  });
  for (const mesh of meshes) {
    const src = mesh as THREE.SkinnedMesh;
    let hull: THREE.Mesh;
    if (src.isSkinnedMesh) {
      const sk = new THREE.SkinnedMesh(src.geometry, mat);
      sk.bind(src.skeleton, src.bindMatrix);
      hull = sk;
    } else {
      hull = new THREE.Mesh(mesh.geometry, mat);
      hull.scale.copy(mesh.scale);
    }
    hull.userData.isOutline = true;
    hull.position.copy(mesh.position);
    hull.quaternion.copy(mesh.quaternion);
    hull.castShadow = false;
    hull.receiveShadow = false;
    hull.renderOrder = -1;
    mesh.parent?.add(hull);
  }
}
