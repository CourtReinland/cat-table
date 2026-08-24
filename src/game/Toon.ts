import * as THREE from 'three/webgpu';
import { positionLocal, normalLocal, attribute, vec2, vec3, color as tslColor, texture, mix, float, max, min, step, saturate } from 'three/tsl';
import { SUKI_BOW, SUKI_FACE } from './sukiGlb';

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
 * MeshToonNodeMaterial's ToonLightingModel samples only gradientMap.r, then
 * multiplies scene `lightColor`. Hana night hemi (0x43384c) + lamp (0xffb46a)
 * therefore peach/lavender any MeshToon coat, no matter how cool the gradient
 * B channel is. 0xf8f8fb + 224,225,230 still failed on play OTS stills.
 * Coat is MeshBasic: HEX × gradient RGB are the on-screen paper, unlit.
 */
export const SUKI_FLUFF_HEX = 0xfbfdff;

/** RGB+A, 3 nearest-filter stops: shadow → mid → lit. Cool paper, not peach. */
export const SUKI_FLUFF_GRADIENT = [
  238, 242, 252, 255,
  248, 250, 255, 255,
  255, 255, 255, 255,
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

function stampBoneMask(mesh: THREE.Mesh, attrName: string, boneNames: readonly string[]) {
  const geo = mesh.geometry;
  if (geo.getAttribute(attrName)) return;
  const n = geo.getAttribute('position')?.count ?? 0;
  const arr = new Float32Array(n);
  const sk = mesh as THREE.SkinnedMesh;
  const idx = geo.getAttribute('skinIndex');
  const wt = geo.getAttribute('skinWeight');
  if (sk.isSkinnedMesh && sk.skeleton && idx && wt) {
    const want = new Set<number>();
    sk.skeleton.bones.forEach((b, i) => {
      if (boneNames.includes(b.name)) want.add(i);
    });
    const comp = (attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number, k: number) =>
      k === 0 ? attr.getX(i) : k === 1 ? attr.getY(i) : k === 2 ? attr.getZ(i) : attr.getW(i);
    for (let i = 0; i < n; i++) {
      let w = 0;
      for (let k = 0; k < 4; k++) {
        if (want.has(comp(idx, i, k))) w += comp(wt, i, k);
      }
      arr[i] = w;
    }
  }
  geo.setAttribute(attrName, new THREE.BufferAttribute(arr, 1));
}

/** Per-vert face / ear / Hunyuan-bow weights — chroma split without extra meshes. */
function stampSukiFaceMask(mesh: THREE.Mesh) {
  stampBoneMask(mesh, SUKI_FACE.attr, SUKI_FACE.bones);
  stampBoneMask(mesh, SUKI_FACE.earAttr, SUKI_FACE.earBones);
  stampBoneMask(mesh, SUKI_BOW.attr, SUKI_BOW.bones);
}

function sukiFluffMaterial(src: any) {
  // Unlit paper — MeshToon would multiply Hana lightColor (purple hemi +
  // peach lamp) and ignore gradient G/B. HEX × cool stops are the pixels.
  // MeshBasicNodeMaterial + TSL runs on both renderer backends. Do not
  // gate this path on a GL-only query. toneMapped off so ACES cannot
  // peach the paper hex on one backend only.
  const m = new THREE.MeshBasicNodeMaterial({
    color: FLUFF,
    side: THREE.FrontSide,
  });
  m.toneMapped = false;
  m.userData.sukiFluff = true;
  const band = vec3(texture(sukiFluffGradient(), vec2(float(0.78), float(0.5))));
  const paper = band.mul(tslColor(FLUFF));
  const albedo = src?.map as THREE.Texture | undefined;
  if (albedo) {
    // WebGPU samples linear unless colorSpace is sRGB — that blew the
    // chroma/luma identity gates and kept Hunyuan hatch (the slop path).
    albedo.colorSpace = THREE.SRGBColorSpace;
    const rgb = vec3(texture(albedo));
    const cmax = max(rgb.x, max(rgb.y, rgb.z));
    const cmin = min(rgb.x, min(rgb.y, rgb.z));
    const chroma = cmax.sub(cmin);
    const luma = rgb.dot(vec3(0.299, 0.587, 0.114));
    const faceW = float(attribute(SUKI_FACE.attr, 'float') as never);
    const earW = float(attribute(SUKI_FACE.earAttr, 'float') as never);
    const bowW = float(attribute(SUKI_BOW.attr, 'float') as never);
    // Coat: tight chroma so hatch stays paper. Face verts: pale blush + lashes.
    const chromaGate = mix(float(SUKI_FACE.coatChroma), float(SUKI_FACE.faceChroma), faceW);
    const lumaGate = mix(float(SUKI_FACE.coatLuma), float(SUKI_FACE.faceLuma), faceW);
    const ident = max(step(chromaGate, chroma), float(1).sub(step(lumaGate, luma)));
    // Unlit raw albedo flattens the iris into a blue dot. Saturate + lift
    // identity; crush lashes/nose so they stay ink against paper.
    const grey = vec3(luma, luma, luma);
    const sat = mix(grey, rgb, float(SUKI_FACE.sat));
    const lift = mix(float(SUKI_FACE.inkMul), float(SUKI_FACE.lift), step(float(0.35), luma));
    const lifted = saturate(sat.mul(lift));
    const isBlue = step(rgb.x, rgb.z)
      .mul(step(rgb.y.mul(float(0.92)), rgb.z))
      .mul(step(float(0.07), chroma));
    const sapphire = vec3(float(0.13), float(0.40), float(0.88));
    const withEye = mix(lifted, mix(lifted, sapphire, float(0.38)), isBlue);
    const isPink = step(rgb.z, rgb.x)
      .mul(step(float(0.12), chroma))
      .mul(step(float(0.25), faceW))
      .mul(float(1).sub(step(float(0.90), luma)));
    // Approved sit: faint peach wash. Magenta vec3(1,0.5,0.66) was a hard decal.
    const peach = vec3(float(1.0), float(0.86), float(0.82));
    const identRgb = mix(withEye, mix(withEye, peach, float(0.18)), isPink);
    // Coat keeps sapphire only. Paper Hunyuan throat paint (bow bones + hot pink
    // that is not an inner ear) so HeroBow is the only neck bow.
    const isHotPink = step(rgb.z, rgb.x).mul(step(float(0.16), chroma));
    const paperThroat = max(step(float(0.20), bowW), isHotPink.mul(float(1).sub(step(float(0.25), earW))));
    const keep = mix(ident.mul(isBlue), ident, step(float(0.25), faceW)).mul(
      float(1).sub(paperThroat),
    );
    m.colorNode = mix(paper, identRgb, keep);
  } else {
    m.colorNode = paper;
  }
  // Never assign Hunyuan maps — that was the scribble path.
  return m;
}

/** Suki coat: white toon fluff shader. Drops scribble/AO/hatch albedo. No ink hull. */
export function toonifySukiCoat(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if ((mesh as any).userData?.isOutline) return;
    stampSukiFaceMask(mesh);
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const converted = mats.map((m: any) => {
      if (!m) return m;
      // Do not skip Basic/unlit/transparent here. WebGPU may present the
      // GLTF coat as MeshBasicNodeMaterial before this runs; skipping
      // left raw Hunyuan maps on one backend. Both backends get paper
      // MeshBasic + identity TSL.
      if (m.userData?.sukiFluff) return m;
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
