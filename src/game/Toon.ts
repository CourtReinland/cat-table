import * as THREE from 'three/webgpu';

/**
 * Cel-shading pass for the whole game:
 *  - MeshToonNodeMaterial with a hard 4-step gradient for all lit surfaces
 *  - inverted-hull dark outlines on character meshes (cat, boyfriends)
 * Emissive, transparent and screen materials are left untouched.
 */

let gradientTex: THREE.DataTexture | null = null;

export function toonGradient(): THREE.DataTexture {
  if (!gradientTex) {
    // 4 hard steps: shadow → mid → lit → hot
    const data = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]);
    gradientTex = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
    gradientTex.minFilter = THREE.NearestFilter;
    gradientTex.magFilter = THREE.NearestFilter;
    gradientTex.generateMipmaps = false;
    gradientTex.needsUpdate = true;
  }
  return gradientTex;
}

const toonCache = new Map<string, InstanceType<typeof THREE.MeshToonNodeMaterial>>();

export function toonMaterialFor(color: THREE.Color, map: THREE.Texture | null = null, side: THREE.Side = THREE.FrontSide) {
  const key = `${color.getHexString()}|${map?.uuid ?? ''}|${side}`;
  let m = toonCache.get(key);
  if (!m) {
    m = new THREE.MeshToonNodeMaterial({ color, gradientMap: toonGradient(), side });
    if (map) m.map = map;
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
  if ((mat.emissiveIntensity ?? 0) > 0.4) return true;
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
      return toonMaterialFor(m.color ?? new THREE.Color(0xcccccc), m.map ?? null, m.side ?? THREE.FrontSide);
    });
    mesh.material = Array.isArray(mesh.material) ? converted : converted[0];
  });
}

let outlineMat: InstanceType<typeof THREE.MeshBasicNodeMaterial> | null = null;

/** Inverted-hull outlines for character models (call after toonify). */
export function outlineCharacter(root: THREE.Object3D, color = 0x241826, scale = 1.06) {
  outlineMat =
    outlineMat ??
    new THREE.MeshBasicNodeMaterial({ color, side: THREE.BackSide });
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (/(Glint|Whisker|flame|Icosphere)/.test(m.name)) return;
    if ((m as any).userData?.isOutline) return;
    meshes.push(m);
  });
  for (const mesh of meshes) {
    const hull = new THREE.Mesh(mesh.geometry, outlineMat);
    hull.userData.isOutline = true;
    hull.position.copy(mesh.position);
    hull.quaternion.copy(mesh.quaternion);
    hull.scale.copy(mesh.scale).multiplyScalar(scale);
    hull.castShadow = false;
    hull.receiveShadow = false;
    mesh.parent?.add(hull);
  }
}
