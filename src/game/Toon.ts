import * as THREE from 'three/webgpu';
import { positionLocal, normalLocal, attribute, vec3, color as tslColor } from 'three/tsl';

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
      // white / pale-pink recess shade + faint forehead M — lives in this attribute.
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

/** Convert every lit material under root to stepped toon shading. */
export function toonify(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const converted = mats.map((m: any) => {
      if (isSkippable(m)) return m;
      return toonMaterialFor(
        m.color ?? new THREE.Color(0xcccccc),
        m.map ?? null,
        m.side ?? THREE.FrontSide,
        // Suki's coat is baked into COLOR_0 — dropping it would flatten her to white.
        // Prefer the geometry attribute over the material flag: some glTF paths
        // ship the colour but leave vertexColors unset.
        !!(m.vertexColors || mesh.geometry?.attributes?.color),
        m.normalMap ?? null,
        m.normalScale ?? null,
      );
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
    if (/(Glint|Glint2|Whisker|Pupil|Lash|Fang|Tongue|Blush|LidShut|flame|Icosphere)/.test(m.name)) return;
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
