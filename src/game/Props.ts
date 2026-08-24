import * as THREE from 'three/webgpu';
import { PROP_LIBRARY, type PropKind } from '../data/content';
import { createCandelabraModel } from './models/createCandelabraModel';
import { refineCandelabra } from './models/refineCandelabra';
import { EMISSIVE, MATTE, roomMatOpts, type RoomMatOpts } from './roomLook';
import { ceramicSurface, surfaceMat } from './Textures';

export interface PropVisual {
  group: THREE.Group;
  kind: PropKind;
  halfHeight: number;
  radiusXZ: number;
}

const matCache = new Map<string, InstanceType<typeof THREE.MeshStandardNodeMaterial>>();

export function stdMat(
  color: number,
  opts: { rough?: number; metal?: number; emissive?: number; emissiveIntensity?: number; transparent?: boolean; opacity?: number } = {},
) {
  const key = `${color}|${opts.rough ?? 0.85}|${opts.metal ?? 0}|${opts.emissive ?? 0}|${opts.emissiveIntensity ?? 0}|${opts.opacity ?? 1}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardNodeMaterial({
      color,
      roughness: opts.rough ?? 0.85,
      metalness: opts.metal ?? 0,
    });
    if (opts.emissive !== undefined) {
      m.emissive = new THREE.Color(opts.emissive);
      m.emissiveIntensity = opts.emissiveIntensity ?? 1;
    }
    if (opts.transparent) {
      m.transparent = true;
      m.opacity = opts.opacity ?? 0.5;
      m.depthWrite = false;
    }
    matCache.set(key, m);
  }
  return m;
}

/** Room / prop factory — dusty matte, metal and emissive capped. Cat.ts keeps stdMat. */
export function roomMat(color: number, opts: RoomMatOpts = {}) {
  return stdMat(color, roomMatOpts(opts));
}

function ceramicMat(color: number) {
  return surfaceMat(ceramicSurface(color), [1.15, 1.15]);
}

function glassRim(radius: number, y: number) {
  const mat = new THREE.MeshBasicNodeMaterial({
    color: 0xffe0c4,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });
  const ring = mesh(TORUS(radius, 0.0032, Math.PI * 2), mat, false);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = y;
  return ring;
}

function mesh(geo: THREE.BufferGeometry, mat: any, castShadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = castShadow;
  m.receiveShadow = true;
  return m;
}

const CYL = (rt: number, rb: number, h: number, seg = 14) => new THREE.CylinderGeometry(rt, rb, h, seg);
const BOX = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const SPH = (r: number, seg = 12) => new THREE.SphereGeometry(r, seg, Math.max(8, seg - 2));
const CONE = (r: number, h: number, seg = 10) => new THREE.ConeGeometry(r, h, seg);
const TORUS = (r: number, t: number, arc = Math.PI) => new THREE.TorusGeometry(r, t, 8, 16, arc);

function lathe(points: [number, number][], seg = 16) {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), seg);
}

function flame(scale = 1) {
  const g = new THREE.Group();
  const f = mesh(CONE(0.012 * scale, 0.05 * scale, 8), roomMat(0xffc46a, { emissive: 0xffa030, emissiveIntensity: EMISSIVE.flame, rough: 0.55 }), false);
  f.position.y = 0.025 * scale;
  f.name = 'flame';
  g.add(f);
  return g;
}

/** Build a stylized prop mesh; origin at the bottom center of the prop. */
export function buildProp(kind: PropKind): PropVisual {
  const def = PROP_LIBRARY[kind];
  const g = new THREE.Group();
  const c = def.color;
  const [w, h, d] = def.size;

  switch (kind) {
    case 'mug': {
      const body = mesh(CYL(w * 0.42, w * 0.38, h), ceramicMat(c));
      body.position.y = h / 2;
      const handle = mesh(TORUS(w * 0.22, 0.016), ceramicMat(c));
      handle.rotation.y = Math.PI / 2;
      handle.position.set(w * 0.44, h * 0.55, 0);
      g.add(body, handle);
      break;
    }
    case 'glass':
    case 'wineglass': {
      const glassMat = roomMat(c, { rough: MATTE.glassRough, metal: MATTE.glassMetal, transparent: true, opacity: 0.42 });
      if (kind === 'wineglass') {
        const bowl = mesh(lathe([[0.014, h * 0.34], [w * 0.36, h * 0.46], [w * 0.5, h * 0.72], [w * 0.44, h * 0.9], [w * 0.38, h * 0.97]]), glassMat);
        const stem = mesh(CYL(0.011, 0.011, h * 0.36), glassMat);
        stem.position.y = h * 0.2;
        const base = mesh(CYL(w * 0.34, w * 0.38, 0.014), glassMat);
        base.position.y = 0.007;
        const wine = mesh(lathe([[0.012, h * 0.37], [w * 0.3, h * 0.48], [w * 0.4, h * 0.64]]), roomMat(0x8a1638, { rough: 0.35, transparent: true, opacity: 0.9 }), false);
        g.add(bowl, stem, base, wine, glassRim(w * 0.44, h * 0.96));
      } else {
        const tumblerMat = roomMat(c, { rough: 0.38, metal: MATTE.glassMetal, transparent: true, opacity: 0.32 });
        const cup = mesh(lathe([[0.002, 0.006], [w * 0.4, 0.01], [w * 0.45, h * 0.92], [w * 0.42, h]]), tumblerMat);
        const water = mesh(CYL(w * 0.36, w * 0.33, h * 0.45), roomMat(0x7ab8d8, { transparent: true, opacity: 0.45, rough: 0.32 }), false);
        water.position.y = h * 0.3;
        g.add(cup, water, glassRim(w * 0.43, h * 0.97));
      }
      break;
    }
    case 'plate': {
      const p = mesh(CYL(w * 0.48, w * 0.42, h * 0.55, 20), ceramicMat(c));
      p.position.y = h * 0.275;
      const rim = mesh(TORUS(w * 0.46, h * 0.32, Math.PI * 2), ceramicMat(c));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = h * 0.62;
      g.add(p, rim);
      break;
    }
    case 'plant': {
      const pot = mesh(CYL(w * 0.42, w * 0.32, h * 0.5), roomMat(0xb0684a, { rough: 0.88 }));
      pot.position.y = h * 0.25;
      g.add(pot);
      const leafMat = roomMat(0x5c9a5e, { rough: 0.95 });
      for (let i = 0; i < 4; i++) {
        const leaf = mesh(new THREE.IcosahedronGeometry(w * (0.2 + Math.random() * 0.14), 0), leafMat);
        leaf.position.set((Math.random() - 0.5) * w * 0.4, h * (0.55 + Math.random() * 0.35), (Math.random() - 0.5) * w * 0.4);
        leaf.scale.y = 1.5;
        g.add(leaf);
      }
      break;
    }
    case 'book': {
      const cover = mesh(BOX(w, h, d), roomMat(c, { rough: 0.82 }));
      cover.position.y = h / 2;
      const pages = mesh(BOX(w * 0.94, h * 0.8, d * 0.94), roomMat(0xf0ead8, { rough: 0.94 }), false);
      pages.position.set(w * 0.03, h / 2, 0);
      g.add(cover, pages);
      break;
    }
    case 'phone': {
      const body = mesh(BOX(w, h, d), roomMat(c, { rough: 0.45, metal: 0.18 }));
      body.position.y = h / 2;
      const screen = mesh(BOX(w * 0.88, h * 0.4, d * 0.9), roomMat(0x0a0c14, { emissive: 0x4a6a9a, emissiveIntensity: EMISSIVE.screen, rough: 0.35 }), false);
      screen.position.y = h * 0.8;
      g.add(body, screen);
      break;
    }
    case 'candle': {
      const wax = mesh(CYL(w * 0.45, w * 0.48, h * 0.85), roomMat(c, { rough: 0.72 }));
      wax.position.y = h * 0.425;
      g.add(wax);
      const f = flame();
      f.position.y = h * 0.85;
      g.add(f);
      break;
    }
    case 'bottle': {
      const glassMat = roomMat(c, { rough: MATTE.glassRough, metal: MATTE.glassMetal, transparent: true, opacity: 0.55 });
      const body = mesh(CYL(w * 0.45, w * 0.45, h * 0.62), glassMat);
      body.position.y = h * 0.31;
      const neck = mesh(CYL(w * 0.16, w * 0.4, h * 0.3), glassMat);
      neck.position.y = h * 0.72;
      const cork = mesh(CYL(w * 0.13, w * 0.13, h * 0.1), roomMat(0xc8a878, { rough: 0.92 }));
      cork.position.y = h * 0.92;
      g.add(body, neck, cork);
      break;
    }
    case 'remote': {
      const body = mesh(BOX(w, h, d), roomMat(c, { rough: 0.62, metal: 0.12 }));
      body.position.y = h / 2;
      g.add(body);
      const btnMat = roomMat(0x888890, { rough: 0.7 });
      for (let i = 0; i < 3; i++) {
        const b = mesh(CYL(0.008, 0.008, h * 0.5, 6), btnMat, false);
        b.position.set(0, h, (i - 1) * d * 0.25);
        g.add(b);
      }
      break;
    }
    case 'frame': {
      const border = mesh(BOX(w, h, d), roomMat(c, { rough: 0.7, metal: 0.08 }));
      border.position.y = h / 2;
      const photo = mesh(BOX(w * 0.8, h * 0.8, d * 1.2), roomMat(0x2a3a4a, { rough: 0.85 }), false);
      photo.position.y = h / 2;
      g.add(border, photo);
      border.rotation.x = -0.12;
      photo.rotation.x = -0.12;
      break;
    }
    case 'bowl': {
      const bowlMat = ceramicMat(c);
      const shell = mesh(
        new THREE.SphereGeometry(w * 0.5, 16, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5),
        surfaceMat(ceramicSurface(c, 43), [1.1, 1.1], { side: THREE.DoubleSide }),
      );
      shell.scale.y = 0.72;
      shell.position.y = h * 0.32;
      const foot = mesh(CYL(w * 0.22, w * 0.26, h * 0.24, 12), bowlMat);
      foot.position.y = h * 0.12;
      g.add(shell, foot);
      break;
    }
    case 'jar': {
      const glassMat = roomMat(c, { rough: MATTE.glassRough, transparent: true, opacity: 0.5 });
      const body = mesh(CYL(w * 0.45, w * 0.42, h * 0.8), glassMat);
      body.position.y = h * 0.4;
      const lid = mesh(CYL(w * 0.47, w * 0.47, h * 0.12), roomMat(0xb08a4a, { rough: 0.62, metal: 0.18 }));
      lid.position.y = h * 0.86;
      g.add(body, lid);
      break;
    }
    case 'vase': {
      const v = mesh(
        lathe([[0.001, 0], [w * 0.4, h * 0.05], [w * 0.5, h * 0.4], [w * 0.22, h * 0.75], [w * 0.28, h * 0.98]]),
        roomMat(c, { rough: 0.62 }),
      );
      g.add(v);
      const stemMat = roomMat(0x4a7a3a, { rough: 0.94 });
      for (let i = 0; i < 3; i++) {
        const stem = mesh(CYL(0.006, 0.006, h * 0.5, 6), stemMat, false);
        stem.position.set((i - 1) * 0.02, h * 1.1, 0);
        stem.rotation.z = (i - 1) * 0.25;
        const rose = mesh(SPH(0.025, 8), roomMat(0xd84a6a, { rough: 0.82 }), false);
        rose.position.set((i - 1) * 0.045, h * 1.32, 0);
        g.add(stem, rose);
      }
      break;
    }
    case 'perfume': {
      const glassMat = roomMat(c, { rough: MATTE.glassRough, transparent: true, opacity: 0.6 });
      const body = mesh(BOX(w * 0.8, h * 0.7, d * 0.8), glassMat);
      body.position.y = h * 0.35;
      const cap = mesh(SPH(w * 0.3, 8), roomMat(0xd8b25a, { metal: 0.18, rough: 0.45 }));
      cap.position.y = h * 0.82;
      g.add(body, cap);
      break;
    }
    case 'jewelrybox': {
      const box = mesh(BOX(w, h * 0.7, d), roomMat(c, { rough: 0.62 }));
      box.position.y = h * 0.35;
      const lidTop = mesh(BOX(w * 1.02, h * 0.25, d * 1.02), roomMat(0x5a3a46, { rough: 0.62 }));
      lidTop.position.y = h * 0.82;
      const clasp = mesh(BOX(w * 0.12, h * 0.2, 0.012), roomMat(0xd8b25a, { metal: 0.18, rough: 0.4 }), false);
      clasp.position.set(0, h * 0.6, d / 2 + 0.006);
      g.add(box, lidTop, clasp);
      break;
    }
    case 'candelabra': {
      // img2threejs pipeline build (see tools/img2threejs + spec in repo) —
      // lathed brass, S-curve arms, bobeche cups, emissive teardrop flames
      const model = createCandelabraModel({ textureSize: 512, textureAnisotropy: 4 });
      refineCandelabra(model);
      model.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = true;
      });
      g.add(model);
      break;
    }
    case 'teapot': {
      const pot = ceramicMat(c);
      const body = mesh(SPH(w * 0.5, 14), pot);
      body.scale.y = 0.75;
      body.position.y = h * 0.45;
      const spout = mesh(CONE(0.025, h * 0.4, 8), pot);
      spout.rotation.z = -0.9;
      spout.position.set(w * 0.48, h * 0.55, 0);
      const handle = mesh(TORUS(w * 0.24, 0.014), pot);
      handle.rotation.y = Math.PI / 2;
      handle.position.set(-w * 0.45, h * 0.55, 0);
      const lidKnob = mesh(SPH(0.018, 8), pot);
      lidKnob.position.y = h * 0.9;
      g.add(body, spout, handle, lidKnob);
      break;
    }
    case 'laptop': {
      const baseMat = roomMat(c, { rough: 0.55, metal: 0.16 });
      const base = mesh(BOX(w, h * 0.5, d), baseMat);
      base.position.y = h * 0.25;
      const screenBack = mesh(BOX(w, d * 0.68, h * 0.5), baseMat);
      screenBack.position.set(0, d * 0.32, -d * 0.46);
      screenBack.rotation.x = -0.35;
      const screen = mesh(BOX(w * 0.92, d * 0.58, 0.004), roomMat(0x0a1020, { emissive: 0x5a8ac8, emissiveIntensity: EMISSIVE.screen, rough: 0.4 }), false);
      screen.position.set(0, d * 0.33, -d * 0.43);
      screen.rotation.x = -0.35;
      g.add(base, screenBack, screen);
      break;
    }
  }

  g.name = `prop-${kind}`;
  return { group: g, kind, halfHeight: h / 2, radiusXZ: Math.max(w, d) * 0.6 };
}
