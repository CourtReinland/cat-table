import * as THREE from 'three/webgpu';
import { roomMat, buildProp } from './Props';
import { Suki } from './Suki';
import { Boyfriend } from './BoyGlb';
import { boyPlayPlacement } from './boyfriendPlay';
import { Body, Physics, type SurfaceRect } from './Physics';
import { PROP_LIBRARY, getBoyfriend, type LevelDef, type PropKind } from '../data/content';
import { toonify } from './Toon';
import { counterRestY } from './ground';
import {
  marbleSurface,
  plasterSurface,
  fabricSurface,
  rugSurface,
  panelSurface,
  surfaceMat,
  tileSurface,
} from './Textures';
import { EMISSIVE, MATTE, NIGHT_AMBIENT, NIGHT_FILL_POS, NIGHT_KEY_CONE, NIGHT_KEY_POS, NIGHT_KEY_TARGET, NIGHT_RIG, NIGHT_SURFACE, SET_DRESS, levelMood, liftLuma } from './roomLook';

// ── canvas texture helpers ──────────────────────────────────────────────────

function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function shaftTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(170, 185, 230, 0.22)');
  grad.addColorStop(0.6, 'rgba(140, 155, 210, 0.07)');
  grad.addColorStop(1, 'rgba(140, 155, 220, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function woodFloorTex() {
  const lo = NIGHT_SURFACE.floorLightMin;
  const span = NIGHT_SURFACE.floorLightMax - NIGHT_SURFACE.floorLightMin;
  return canvasTex(512, 512, (ctx) => {
    ctx.fillStyle = '#5a4034';
    ctx.fillRect(0, 0, 512, 512);
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 4; c++) {
        const l = lo + Math.random() * span;
        ctx.fillStyle = `hsl(${18 + Math.random() * 10}, ${22 + Math.random() * 14}%, ${l}%)`;
        const off = r % 2 ? 64 : 0;
        ctx.fillRect(c * 128 + off + 1, r * 64 + 1, 126, 62);
        ctx.fillStyle = 'rgba(48, 32, 36, 0.18)';
        for (let g = 0; g < 4; g++) {
          const y = r * 64 + Math.random() * 64;
          ctx.fillRect(c * 128 + off + 1, y, 126, 1);
        }
      }
    }
    // grit / scuffs so the floor reads dusty, not a flat fill
    ctx.fillStyle = 'rgba(88, 70, 62, 0.32)';
    for (let i = 0; i < 420; i++) {
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 1 + (Math.random() > 0.85 ? 2 : 0), 1);
    }
    ctx.fillStyle = 'rgba(20, 12, 18, 0.12)';
    for (let i = 0; i < 18; i++) {
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 40 + Math.random() * 80, 1);
    }
  });
}

function cityTex(skyColor: number) {
  const sky = new THREE.Color(skyColor);
  return canvasTex(512, 384, (ctx) => {
    const top = sky.clone();
    const bot = sky.clone().lerp(new THREE.Color(NIGHT_SURFACE.cityBot), 0.62);
    const mid = sky.clone().lerp(new THREE.Color(0x6a3060), 0.28);
    const grad = ctx.createLinearGradient(0, 0, 0, 384);
    grad.addColorStop(0, `#${top.getHexString()}`);
    grad.addColorStop(0.42, `#${mid.getHexString()}`);
    grad.addColorStop(1, `#${bot.getHexString()}`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 384);
    // distant buildings — indigo silhouettes, not a crushed cave
    for (let i = 0; i < 16; i++) {
      const bw = 28 + Math.random() * 58;
      const bh = 70 + Math.random() * 160;
      const x = Math.random() * 512;
      ctx.fillStyle = `rgba(42, 24, 68, ${0.5 + Math.random() * 0.32})`;
      ctx.fillRect(x, 384 - bh, bw, bh);
    }
    // city practicals: readable punctures, not bloom bokeh soup
    for (let i = 0; i < 130; i++) {
      const roll = Math.random();
      const warm = roll < 0.55;
      const mag = roll > 0.82;
      ctx.fillStyle = mag
        ? 'rgba(220, 120, 180, 0.7)'
        : warm
          ? 'rgba(255, 196, 130, 0.88)'
          : 'rgba(186, 176, 220, 0.65)';
      ctx.shadowColor = mag ? '#dc78b4' : warm ? '#ffc282' : '#b0a8dc';
      ctx.shadowBlur = 1 + Math.random() * 2.5;
      const r = 0.7 + Math.random() * 1.6;
      ctx.beginPath();
      ctx.arc(Math.random() * 512, 200 + Math.random() * 180, r, 0, 7);
      ctx.fill();
    }
    // a few window stacks so the skyline reads as buildings, not sparkle
    ctx.shadowBlur = 0;
    for (let i = 0; i < 9; i++) {
      const bx = 20 + Math.random() * 470;
      const by = 220 + Math.random() * 120;
      const cols = 2 + Math.floor(Math.random() * 3);
      const rows = 3 + Math.floor(Math.random() * 4);
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          if (Math.random() < 0.35) continue;
          ctx.fillStyle = Math.random() < 0.7 ? 'rgba(255, 190, 120, 0.82)' : 'rgba(190, 150, 220, 0.6)';
          ctx.fillRect(bx + c * 5, by + r * 6, 2, 3);
        }
      }
    }
    // moon — a cool disc, tight halo
    ctx.shadowColor = '#e8dcc8';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#f0e6d0';
    ctx.beginPath();
    ctx.arc(408, 62, 13, 0, 7);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(210, 200, 185, 0.35)';
    ctx.beginPath();
    ctx.arc(404, 58, 3, 0, 7);
    ctx.arc(414, 66, 2, 0, 7);
    ctx.fill();
  });
}

function posterTex(hue: number) {
  return canvasTex(128, 160, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 128, 160);
    g.addColorStop(0, `hsl(${hue}, 45%, 28%)`);
    g.addColorStop(1, `hsl(${(hue + 40) % 360}, 55%, 16%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 160);
    ctx.strokeStyle = `hsla(${hue}, 70%, 70%, 0.8)`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(64, 70, 34, 0.4, 5.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(64, 70, 20, 2.2, 6.8);
    ctx.stroke();
  });
}

// ── apartment ───────────────────────────────────────────────────────────────

export class Apartment {
  scene: THREE.Scene;
  physics: Physics;
  cat = new Suki();
  boyfriend: Boyfriend | null = null;
  surface: SurfaceRect = { cx: 0, cz: 0, halfW: 2, halfD: 1, topY: 1 };
  catSpawn = new THREE.Vector3();
  cuddleSpot = new THREE.Vector3(); // where the boyfriend kneels

  private roomGroup = new THREE.Group();
  private levelGroup: THREE.Group | null = null;
  private hemi!: THREE.HemisphereLight;
  private moon!: THREE.DirectionalLight;
  private key!: THREE.SpotLight;
  private lamp!: THREE.PointLight;
  private fill!: THREE.PointLight;
  private flames: THREE.Object3D[] = [];
  private stringMats: THREE.MeshStandardNodeMaterial[] = [];
  private tvScreen: THREE.Mesh | null = null;
  private cityMat: THREE.MeshBasicNodeMaterial | null = null;
  private couchPos = new THREE.Vector3(-2.6, 0, -2.0);

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.physics = new Physics(scene);
    this.buildRoom();
    scene.add(this.cat.group);
    this.cat.group.visible = false;
  }

  // ── static room ───────────────────────────────────────────────────────────

  private buildRoom() {
    const g = this.roomGroup;

    // floor
    const floorTex = woodFloorTex();
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(3, 2.2);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(15, 10),
      new THREE.MeshStandardNodeMaterial({ map: floorTex, roughness: MATTE.floorRough, metalness: MATTE.floorMetal }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 0.5);
    floor.receiveShadow = true;
    g.add(floor);

    // walls — plaster with a mottled trowel finish
    const wallMat = surfaceMat(plasterSurface(NIGHT_SURFACE.shellWall), [5, 1.6]);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(15, 4.4), wallMat);
    back.position.set(0, 2.2, -3.4);
    back.receiveShadow = true;
    g.add(back);
    const left = new THREE.Mesh(new THREE.PlaneGeometry(10, 4.4), wallMat);
    left.rotation.y = Math.PI / 2;
    left.position.set(-7, 2.2, 0.5);
    left.receiveShadow = true;
    g.add(left);
    const right = new THREE.Mesh(new THREE.PlaneGeometry(10, 4.4), wallMat);
    right.rotation.y = -Math.PI / 2;
    right.position.set(7, 2.2, 0.5);
    g.add(right);
    // fourth wall — OTS looks +X with +Z on the right; without this the
    // play camera stares into fog (the "black cave" on screen-right).
    const front = new THREE.Mesh(new THREE.PlaneGeometry(15, 4.4), wallMat);
    front.rotation.y = Math.PI;
    front.position.set(0, 2.2, 5.2);
    front.receiveShadow = true;
    g.add(front);
    const doorMat = roomMat(0x5a4038, { rough: 0.88 });
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.05, 2.15, 0.08), doorMat);
    door.position.set(-2.4, 1.08, 5.14);
    g.add(door);
    const jamb = roomMat(NIGHT_SURFACE.shellFrame, { rough: 0.7 });
    for (const [w, h, x, y] of [[1.2, 0.08, -2.4, 2.2], [0.08, 2.2, -2.96, 1.1], [0.08, 2.2, -1.84, 1.1]] as const) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), jamb);
      bar.position.set(x, y, 5.16);
      g.add(bar);
    }
    // pictures on the new closer wall so OTS-right isn't a blank plaster slab
    const frontPoster = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), new THREE.MeshStandardNodeMaterial({ map: posterTex(48), roughness: 0.9 }));
    frontPoster.position.set(1.8, 2.25, 5.16);
    frontPoster.rotation.y = Math.PI;
    const frontPoster2 = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.7), new THREE.MeshStandardNodeMaterial({ map: posterTex(200), roughness: 0.9 }));
    frontPoster2.position.set(2.7, 2.15, 5.16);
    frontPoster2.rotation.y = Math.PI;
    g.add(frontPoster, frontPoster2);

    // window (back wall, right side) — frame + city view + sill
    const winG = new THREE.Group();
    winG.position.set(2.9, 2.05, -3.38);
    this.cityMat = new THREE.MeshBasicNodeMaterial({ map: cityTex(0x4a2860) });
    const view = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.9), this.cityMat);
    view.position.z = -0.15;
    winG.add(view);
    const frameMat = roomMat(NIGHT_SURFACE.shellFrame, { rough: 0.6 });
    const mkBar = (w: number, h: number, x: number, y: number) => {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), frameMat);
      bar.position.set(x, y, 0);
      winG.add(bar);
    };
    mkBar(2.7, 0.1, 0, 1.0);
    mkBar(2.7, 0.1, 0, -1.0);
    mkBar(0.1, 2.1, -1.3, 0);
    mkBar(0.1, 2.1, 1.3, 0);
    mkBar(0.06, 1.9, 0, 0);
    mkBar(2.5, 0.06, 0, 0);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.07, 0.24), frameMat);
    sill.position.set(0, -1.06, 0.08);
    winG.add(sill);
    g.add(winG);

    // moonlight shaft spilling from the window into the room
    const shaftMat = new THREE.MeshBasicNodeMaterial({
      map: shaftTexture(),
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    for (const [x, tilt] of [[2.55, 0.5], [3.25, 0.42]] as const) {
      const shaft = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 4.6), shaftMat);
      shaft.position.set(x, 1.7, -1.75);
      shaft.rotation.x = tilt;
      shaft.rotation.y = 0.12;
      g.add(shaft);
    }

    // sheer curtain hint (translucent, catches key light)
    const curtain = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 2.4),
      roomMat(0xd8cce0, { rough: 0.9, transparent: true, opacity: 0.16 }),
    );
    curtain.position.set(1.35, 2.0, -3.2);
    g.add(curtain);

    // couch
    const couchG = new THREE.Group();
    couchG.position.copy(this.couchPos);
    const couchMat = surfaceMat(fabricSurface(0x7a5470), [3, 1.2]);
    const seatMat = surfaceMat(fabricSurface(0x8a6480), [2, 1.4]);
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.42, 0.95), couchMat);
    base.position.y = 0.24;
    const backRest = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.75, 0.28), couchMat);
    backRest.position.set(0, 0.72, -0.36);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.5, 0.95), couchMat);
    armL.position.set(-1.1, 0.5, 0);
    const armR = armL.clone();
    armR.position.x = 1.1;
    const cushion1 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.16, 0.85), seatMat);
    cushion1.position.set(-0.52, 0.5, 0.04);
    const cushion2 = cushion1.clone();
    cushion2.position.x = 0.52;
    const throwPillow = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.28, 0.1),
      surfaceMat(fabricSurface(0xd8a878, 41), [1, 1]),
    );
    throwPillow.position.set(-0.82, 0.66, -0.14);
    throwPillow.rotation.z = 0.32;
    throwPillow.rotation.y = 0.4;
    couchG.add(base, backRest, armL, armR, cushion1, cushion2, throwPillow);
    couchG.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    couchG.rotation.y = 0.18;
    g.add(couchG);

    // rug
    const rug = new THREE.Mesh(
      new THREE.CircleGeometry(1.9, 28),
      surfaceMat(rugSurface(NIGHT_SURFACE.shellRug, NIGHT_SURFACE.shellRugAccent)),
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(-1.2, 0.005, -0.9);
    rug.receiveShadow = true;
    g.add(rug);

    // floor lamp (right side)
    const lampG = new THREE.Group();
    lampG.position.set(3.6, 0, -1.4);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.05, 1.65, 8), roomMat(NIGHT_SURFACE.shellRack, { metal: 0.18, rough: 0.55 }));
    pole.position.y = 0.82;
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.3, 14, 1, true), roomMat(0xf5e0b8, { rough: 0.88, emissive: 0xffb46a, emissiveIntensity: EMISSIVE.shade }));
    shade.position.y = 1.7;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), roomMat(0xffe2b0, { emissive: 0xffc87a, emissiveIntensity: EMISSIVE.bulb, rough: 0.45 }));
    bulb.position.y = 1.62;
    lampG.add(pole, shade, bulb);
    g.add(lampG);

    // string lights along back wall
    const bulbGeo = new THREE.SphereGeometry(0.02, 8, 6);
    const wireMat = new THREE.MeshBasicNodeMaterial({ color: 0x1a1418 });
    let prev: THREE.Vector3 | null = null;
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const x = -5.5 + t * 11;
      const y = 3.55 - Math.sin(t * Math.PI * 3) * 0.28 - 0.28;
      const p = new THREE.Vector3(x, y, -3.32);
      const mat = new THREE.MeshStandardNodeMaterial({
        color: 0xffd9a0,
        emissive: 0xffc06a,
        emissiveIntensity: EMISSIVE.string,
        roughness: 0.55,
        metalness: 0,
      });
      const b = new THREE.Mesh(bulbGeo, mat);
      b.position.copy(p);
      this.stringMats.push(mat);
      g.add(b);
      if (prev) {
        const len = prev.distanceTo(p);
        const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, len, 4), wireMat);
        wire.position.copy(prev).lerp(p, 0.5);
        wire.lookAt(p);
        wire.rotateX(Math.PI / 2);
        g.add(wire);
      }
      prev = p;
    }

    // bookshelf silhouette (left)
    const shelf = new THREE.Group();
    shelf.position.set(-5.6, 0, -3.1);
    const shelfMat = roomMat(NIGHT_SURFACE.shellShelf, { rough: 0.9 });
    for (let i = 0; i < 3; i++) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.3), shelfMat);
      board.position.set(0, 0.6 + i * 0.5, 0);
      shelf.add(board);
      for (let b = 0; b < 6; b++) {
        const book = new THREE.Mesh(
          new THREE.BoxGeometry(0.05 + Math.random() * 0.05, 0.24 + Math.random() * 0.1, 0.18),
          roomMat([0x4a2c2c, 0x2c3c4a, 0x4a3c2c, 0x342c44][b % 4], { rough: 0.9 }),
        );
        book.position.set(-0.6 + b * 0.2 + Math.random() * 0.05, 0.75 + i * 0.5, 0);
        shelf.add(book);
      }
    }
    g.add(shelf);

    // posters
    const poster1 = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.0), new THREE.MeshStandardNodeMaterial({ map: posterTex(280), roughness: 0.9 }));
    poster1.position.set(-3.2, 2.3, -3.38);
    const poster2 = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), new THREE.MeshStandardNodeMaterial({ map: posterTex(20), roughness: 0.9 }));
    poster2.position.set(-4.4, 2.2, -3.38);
    g.add(poster1, poster2);

    // big plant silhouette near window
    const plantG = new THREE.Group();
    plantG.position.set(5.2, 0, -2.8);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.34, 10), roomMat(0x4a3430, { rough: 0.9 }));
    pot.position.y = 0.17;
    plantG.add(pot);
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.8 + Math.random() * 0.5, 6), roomMat(NIGHT_SURFACE.shellLeaf, { rough: 0.95 }));
      leaf.position.set((Math.random() - 0.5) * 0.25, 0.7 + Math.random() * 0.3, (Math.random() - 0.5) * 0.25);
      leaf.rotation.z = (Math.random() - 0.5) * 0.7;
      plantG.add(leaf);
    }
    g.add(plantG);

    // ── lighting rig ──
    // Warm rim from upper-left/rear (title art). Key does not cast shadow —
    // BUILD 5's left pool + right-side black cliff was that shadow cliff.
    this.hemi = new THREE.HemisphereLight(NIGHT_AMBIENT.sky, NIGHT_AMBIENT.ground, NIGHT_RIG.hemi);
    g.add(this.hemi);

    this.moon = new THREE.DirectionalLight(NIGHT_AMBIENT.moon, NIGHT_RIG.moon);
    this.moon.position.set(4.5, 3.8, -2.2);
    this.moon.target.position.set(-0.5, 0.8, 0.5);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(1024, 1024);
    this.moon.shadow.camera.left = -4;
    this.moon.shadow.camera.right = 4;
    this.moon.shadow.camera.top = 4;
    this.moon.shadow.camera.bottom = -4;
    this.moon.shadow.bias = -0.002;
    g.add(this.moon, this.moon.target);

    this.key = new THREE.SpotLight(
      NIGHT_AMBIENT.rim,
      NIGHT_RIG.key,
      NIGHT_KEY_CONE.distance,
      NIGHT_KEY_CONE.angle,
      NIGHT_KEY_CONE.penumbra,
      NIGHT_KEY_CONE.decay,
    );
    this.key.position.set(NIGHT_KEY_POS.x, NIGHT_KEY_POS.y, NIGHT_KEY_POS.z);
    this.key.target.position.set(NIGHT_KEY_TARGET.x, NIGHT_KEY_TARGET.y, NIGHT_KEY_TARGET.z);
    this.key.castShadow = false;
    g.add(this.key, this.key.target);

    this.lamp = new THREE.PointLight(0xffb46a, NIGHT_RIG.lamp, 9, 1.7);
    this.lamp.position.set(3.6, 1.62, -1.4);
    g.add(this.lamp);

    this.fill = new THREE.PointLight(NIGHT_AMBIENT.fill, NIGHT_RIG.fill, 12, 1.6);
    this.fill.position.set(NIGHT_FILL_POS.x, NIGHT_FILL_POS.y, NIGHT_FILL_POS.z);
    g.add(this.fill);

    this.scene.add(g);
    toonify(g);
    this.scene.fog = new THREE.FogExp2(0x2a2038, NIGHT_RIG.fogDensity);
    this.scene.background = new THREE.Color(0x2a2038).multiplyScalar(NIGHT_SURFACE.bgMul);
  }

  // ── per-level setup ───────────────────────────────────────────────────────

  loadLevel(level: LevelDef) {
    // teardown
    if (this.levelGroup) {
      this.scene.remove(this.levelGroup);
      this.levelGroup.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
    }
    this.physics.reset();
    this.flames = [];
    this.tvScreen = null;
    if (this.boyfriend) {
      this.scene.remove(this.boyfriend.group);
      this.boyfriend = null;
    }

    const lg = (this.levelGroup = new THREE.Group());
    const [w, d] = level.counterSize;
    const topY = level.counterHeight;
    const cz = 0.3;
    this.surface = { cx: 0, cz, halfW: w / 2, halfD: d / 2, topY };
    this.physics.surface = this.surface;

    // furniture per surface kind
    this.buildFurniture(lg, level, w, d, topY, cz);
    this.dressRoom(lg, level);

    // mood
    // per-level wall colour, still plastered rather than a flat fill
    const wallPlaster = surfaceMat(
      plasterSurface(level.wallColor, level.surface.length * 5),
      [5, 1.6],
    );
    // buildRoom already toonify(roomGroup). A raw surfaceMat swap leaves
    // MeshStandardNodeMaterial on the walls (toonify(lg) never sees them),
    // and PBR can clip past BLOOM.threshold. Retint, then toonify each wall.
    // Do not dispose map/normalMap: plasterSurface keeps them in
    // Textures.cached and toonMaterialFor keys by map.uuid — dispose
    // poisons a later return to this room (walls go black).
    // children 1–4 are back, left, right, front (OTS-right closer).
    for (const i of [1, 2, 3, 4]) {
      const wall = this.roomGroup.children[i] as THREE.Mesh;
      wall.material = wallPlaster;
      toonify(wall);
    }
    this.scene.fog = new THREE.FogExp2(level.fogColor, NIGHT_RIG.fogDensity);
    this.scene.background = new THREE.Color(level.fogColor).multiplyScalar(NIGHT_SURFACE.bgMul);
    // Night-family BASE (intensities, hemi/moon, rim position). Per-level
    // key/fill/lamp are accents on that family and retarget the play slab.
    const mood = levelMood(level);
    this.hemi.color.setHex(NIGHT_AMBIENT.sky);
    this.hemi.groundColor.setHex(NIGHT_AMBIENT.ground);
    this.hemi.intensity = NIGHT_RIG.hemi;
    this.moon.color.setHex(NIGHT_AMBIENT.moon);
    this.moon.intensity = NIGHT_RIG.moon;
    this.key.color.setHex(mood.key);
    this.key.intensity = NIGHT_RIG.key;
    this.key.position.set(NIGHT_KEY_POS.x, NIGHT_KEY_POS.y, NIGHT_KEY_POS.z);
    this.key.target.position.set(0, topY, cz);
    this.key.castShadow = false;
    this.fill.color.setHex(mood.fill);
    this.fill.intensity = NIGHT_RIG.fill;
    this.fill.position.set(NIGHT_FILL_POS.x, topY + 0.7, NIGHT_FILL_POS.z);
    this.lamp.color.setHex(mood.lamp);
    this.lamp.intensity = NIGHT_RIG.lamp;
    if (this.cityMat) {
      this.cityMat.map?.dispose();
      this.cityMat.map = cityTex(level.sky);
      this.cityMat.needsUpdate = true;
    }

    // props
    this.placeProps(lg, level);

    // cat
    this.catSpawn.set(-w / 2 + 0.35, topY, cz + d / 2 - 0.28);
    this.cat.group.position.copy(this.catSpawn);
    this.cat.yaw = Math.PI * 0.5;
    this.cat.group.visible = true;

    // boyfriend: kitchen date stands the far +X island lip (in the play OTS).
    // Do not retarget OTS at the couch. Other rooms keep the living-room sit.
    const def = getBoyfriend(level.boyfriendId);
    this.boyfriend = new Boyfriend(def);
    const place = boyPlayPlacement(level.surface, this.couchPos, this.catSpawn, w);
    this.boyfriend.group.position.set(place.pos.x, place.pos.y, place.pos.z);
    this.boyfriend.group.rotation.y = place.rotY;
    this.boyfriend.setPose(place.pose, 0.01);
    // Kitchen spawn is already stand. Game cine must not sit then StandUp that date.
    this.scene.add(this.boyfriend.group);

    this.cuddleSpot.set(0.4, 0, cz + d / 2 + 0.55);

    this.scene.add(lg);
    toonify(lg);
  }

  private buildFurniture(lg: THREE.Group, level: LevelDef, w: number, d: number, topY: number, cz: number) {
    // Stone tops read as stone; the cabinet below gets wood grain and a panel
    // groove so the two halves of the furniture no longer share one flat fill.
    const veinHex = new THREE.Color(level.counterColor).multiplyScalar(1.18).getHex();
    const topMat = surfaceMat(marbleSurface(level.counterColor, veinHex, level.surface.length * 13), [2.4, 1.2]);
    const bodyHex = liftLuma(
      new THREE.Color(level.counterColor).multiplyScalar(NIGHT_SURFACE.cabinetMul).getHex(),
      NIGHT_SURFACE.minWallLuma,
    );
    const bodyMat = surfaceMat(panelSurface(bodyHex, level.surface.length * 7), [2, 1]);

    const slab = (ww: number, dd: number) => {
      const top = new THREE.Mesh(new THREE.BoxGeometry(ww, 0.06, dd), topMat);
      top.position.set(0, topY - 0.03, cz);
      top.castShadow = true;
      top.receiveShadow = true;
      lg.add(top);
      // ogee edge band: darker trim wrapping the slab lip so the counter reads
      // as a finished piece of furniture instead of a floating texture
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(ww + 0.03, 0.075, dd + 0.03),
        bodyMat,
      );
      band.position.set(0, topY - 0.085, cz);
      band.castShadow = true;
      band.receiveShadow = true;
      lg.add(band);
    };

    switch (level.surface) {
      case 'kitchen': {
        slab(w, d);
        const cab = new THREE.Mesh(new THREE.BoxGeometry(w - 0.25, topY - 0.1, d - 0.25), bodyMat);
        cab.position.set(0, (topY - 0.1) / 2, cz);
        cab.castShadow = true;
        lg.add(cab);
        // pendant lamp above
        const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.2, 6), roomMat(NIGHT_SURFACE.shellRack, { rough: 0.7 }));
        cord.position.set(0, 3.4, cz);
        const shade = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.24, 16, 1, true), roomMat(NIGHT_SURFACE.shellPan, { rough: 0.7, metal: 0.18, emissive: level.lampColor, emissiveIntensity: EMISSIVE.shade }));
        shade.position.set(0, 2.75, cz);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), roomMat(0xffe2b0, { emissive: level.lampColor, emissiveIntensity: EMISSIVE.bulb }));
        bulb.position.set(0, 2.68, cz);
        lg.add(cord, shade, bulb);
        const pendant = new THREE.PointLight(level.lampColor, NIGHT_RIG.pendant, 5.5, 1.9);
        pendant.position.set(0, 2.55, cz);
        lg.add(pendant);
        break;
      }
      case 'coffee': {
        slab(w, d);
        for (const [x, z] of [[-w / 2 + 0.12, -d / 2 + 0.12], [w / 2 - 0.12, -d / 2 + 0.12], [-w / 2 + 0.12, d / 2 - 0.12], [w / 2 - 0.12, d / 2 - 0.12]] as const) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, topY - 0.06, 0.07), bodyMat);
          leg.position.set(x, (topY - 0.06) / 2, cz + z);
          leg.castShadow = true;
          lg.add(leg);
        }
        // lower shelf so the table reads as furniture, not a floating slab
        const lowShelf = new THREE.Mesh(new THREE.BoxGeometry(w - 0.38, 0.03, d - 0.28), bodyMat);
        lowShelf.position.set(0, 0.18, cz);
        lowShelf.castShadow = true;
        lowShelf.receiveShadow = true;
        lg.add(lowShelf);
        for (let i = 0; i < 3; i++) {
          const vol = new THREE.Mesh(
            new THREE.BoxGeometry(0.22, 0.04, 0.16),
            roomMat([0x6a3a42, 0x3a4a62, 0x8a6a48][i], { rough: 0.88 }),
          );
          vol.position.set(-0.55 + i * 0.38, 0.22, cz + (i % 2 ? 0.12 : -0.1));
          vol.rotation.y = (i - 1) * 0.18;
          vol.castShadow = true;
          lg.add(vol);
        }
        // TV on right wall, flickering
        const tvG = new THREE.Group();
        tvG.position.set(6.9, 1.7, 0.4);
        tvG.rotation.y = -Math.PI / 2;
        const bezel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.3, 0.06), roomMat(0x0a0a0e, { rough: 0.3 }));
        this.tvScreen = new THREE.Mesh(
          new THREE.PlaneGeometry(2.05, 1.15),
          roomMat(0x0c1420, { emissive: 0x4a7ab8, emissiveIntensity: EMISSIVE.screen, rough: 0.4 }),
        );
        this.tvScreen.position.z = 0.035;
        tvG.add(bezel, this.tvScreen);
        lg.add(tvG);
        const tvGlow = new THREE.PointLight(0x4a7ab8, NIGHT_RIG.tvGlow, 8, 2);
        tvGlow.position.set(6.2, 1.7, 0.4);
        lg.add(tvGlow);
        break;
      }
      case 'desk': {
        slab(w, d);
        for (const x of [-w / 2 + 0.3, w / 2 - 0.3]) {
          const ped = new THREE.Mesh(new THREE.BoxGeometry(0.5, topY - 0.06, d - 0.15), bodyMat);
          ped.position.set(x, (topY - 0.06) / 2, cz);
          ped.castShadow = true;
          lg.add(ped);
          // shaker drawer fronts so the pedestals read as a desk, not crates
          for (let r = 0; r < 3; r++) {
            const drawer = new THREE.Mesh(
              new THREE.BoxGeometry(0.42, 0.16, 0.03),
              surfaceMat(panelSurface(bodyHex, 27 + r), [1, 1]),
            );
            drawer.position.set(x, 0.18 + r * 0.22, cz + (d - 0.15) / 2 + 0.01);
            lg.add(drawer);
            const knob = new THREE.Mesh(
              new THREE.SphereGeometry(0.018, 8, 6),
              roomMat(0xd8b25a, { metal: 0.18, rough: 0.4 }),
            );
            knob.position.set(x, 0.18 + r * 0.22, cz + (d - 0.15) / 2 + 0.03);
            lg.add(knob);
          }
        }
        // glowing monitor on the desk's back-left corner
        const mon = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.38), roomMat(0x0a1020, { emissive: 0x6ab0e8, emissiveIntensity: EMISSIVE.screen, rough: 0.4 }));
        mon.position.set(-w / 2 + 0.5, topY + 0.36, cz - d / 2 + 0.28);
        mon.rotation.y = 0.35;
        lg.add(mon);
        const monBack = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.4, 0.03), roomMat(0x1a1a20, { rough: 0.4, metal: 0.5 }));
        monBack.position.set(-w / 2 + 0.5, topY + 0.36, cz - d / 2 + 0.26);
        monBack.rotation.y = 0.35;
        lg.add(monBack);
        const monStand = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.05, 0.22, 8), roomMat(0x1a1a20, { rough: 0.4, metal: 0.5 }));
        monStand.position.set(-w / 2 + 0.48, topY + 0.11, cz - d / 2 + 0.26);
        lg.add(monStand);
        break;
      }
      case 'dresser': {
        slab(w, d);
        const cab = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, topY - 0.1, d - 0.15), bodyMat);
        cab.position.set(0, (topY - 0.1) / 2, cz);
        cab.castShadow = true;
        lg.add(cab);
        // drawers + knobs
        for (let r = 0; r < 3; r++) {
          const drawer = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, 0.22, 0.03), roomMat(level.counterColor, { rough: 0.6 }));
          drawer.position.set(0, 0.25 + r * 0.3, cz + (d - 0.15) / 2 + 0.005);
          lg.add(drawer);
          const knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), roomMat(0xd8b25a, { metal: 0.85, rough: 0.25 }));
          knob.position.set(0, 0.25 + r * 0.3, cz + (d - 0.15) / 2 + 0.03);
          lg.add(knob);
        }
        // mirror with vanity bulbs
        const mirror = new THREE.Mesh(
          new THREE.PlaneGeometry(1.3, 1.0),
          roomMat(0x9ab0c0, { rough: 0.35, metal: 0.12 }),
        );
        mirror.position.set(0, topY + 0.85, cz - d / 2 + 0.02);
        lg.add(mirror);
        const mFrame = new THREE.Mesh(new THREE.BoxGeometry(1.44, 1.14, 0.04), roomMat(0x6a4a3a, { rough: 0.5 }));
        mFrame.position.set(0, topY + 0.85, cz - d / 2 - 0.01);
        lg.add(mFrame);
        const bulbGeo = new THREE.SphereGeometry(0.025, 8, 6);
        for (let i = 0; i < 8; i++) {
          const side = i < 4 ? -1 : 1;
          const b = new THREE.Mesh(bulbGeo, roomMat(0xffe8c8, { emissive: 0xffd9a8, emissiveIntensity: EMISSIVE.vanity }));
          b.position.set(side * 0.78, topY + 0.42 + (i % 4) * 0.28, cz - d / 2 + 0.02);
          lg.add(b);
        }
        break;
      }
      case 'dining': {
        slab(w, d);
        // tablecloth drop
        const cloth = new THREE.Mesh(
          new THREE.BoxGeometry(w - 0.3, topY - 0.15, d - 0.3),
          surfaceMat(fabricSurface(0x6a2030, 17), [2, 1.4]),
        );
        cloth.position.set(0, (topY - 0.12) / 2, cz);
        cloth.castShadow = true;
        lg.add(cloth);
        // chandelier
        const chG = new THREE.Group();
        chG.position.set(0, 2.9, cz);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.025, 8, 24), roomMat(0xd8b25a, { metal: 0.85, rough: 0.3 }));
        ring.rotation.x = Math.PI / 2;
        chG.add(ring);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 6), roomMat(0xf5e6c8, { rough: 0.6 }));
          candle.position.set(Math.cos(a) * 0.4, 0.06, Math.sin(a) * 0.4);
          const fl = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.045, 8), roomMat(0xffc46a, { emissive: 0xffa030, emissiveIntensity: EMISSIVE.flame }));
          fl.position.set(Math.cos(a) * 0.4, 0.15, Math.sin(a) * 0.4);
          fl.name = 'flame';
          this.flames.push(fl);
          chG.add(candle, fl);
        }
        const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.0, 6), roomMat(0x8a6a2a, { metal: 0.7, rough: 0.4 }));
        chain.position.y = 0.55;
        chG.add(chain);
        lg.add(chG);
        const chLight = new THREE.PointLight(level.lampColor, NIGHT_RIG.chandelier, 6, 1.9);
        chLight.position.set(0, 2.6, cz);
        lg.add(chLight);
        // two chairs on the window (−Z) side, two more on the OTS-right (+Z)
        const seatMat = surfaceMat(fabricSurface(0x6a2030, 19), [1, 1]);
        for (const [x, zOff, rot] of [
          [-0.8, -d / 2 - 0.55, 0],
          [0.8, -d / 2 - 0.55, 0],
          [-0.55, d / 2 + 0.55, Math.PI],
          [0.72, d / 2 + 0.55, Math.PI],
        ] as const) {
          const chair = new THREE.Group();
          chair.position.set(x, 0, cz + zOff);
          chair.rotation.y = rot;
          const seat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 0.42), seatMat);
          seat.position.y = 0.5;
          const backR = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.6, 0.05), bodyMat);
          backR.position.set(0, 0.85, -0.19);
          for (const [lx, lz] of [[-0.19, -0.17], [0.19, -0.17], [-0.19, 0.17], [0.19, 0.17]] as const) {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), bodyMat);
            leg.position.set(lx, 0.25, lz);
            chair.add(leg);
          }
          chair.add(seat, backR);
          chair.traverse((o) => ((o as THREE.Mesh).castShadow = true));
          lg.add(chair);
        }
        break;
      }
    }

    // register flames from prop candles etc. after furniture
    lg.traverse((o) => {
      if (o.name.startsWith('flame') && !this.flames.includes(o)) this.flames.push(o);
    });
  }

  // ── per-level room dressing: turns the shared shell into distinct rooms ──

  private meshBox(
    lg: THREE.Group,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    ry = 0,
  ) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = true;
    m.receiveShadow = true;
    lg.add(m);
    return m;
  }

  private meshCyl(
    lg: THREE.Group,
    r: number,
    h: number,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    seg = 12,
  ) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    lg.add(m);
    return m;
  }

  /** Kit prop seated as scenery (not a smashable Body). */
  private dressProp(
    lg: THREE.Group,
    kind: PropKind,
    x: number,
    y: number,
    z: number,
    scale = 1,
    ry = 0,
  ) {
    const p = buildProp(kind);
    p.group.position.set(x, y, z);
    p.group.scale.setScalar(scale);
    p.group.rotation.y = ry;
    lg.add(p.group);
    return p;
  }

  /** Cabinet + stone-top run used on the OTS-near fringe (not the play slab). */
  private cabinetRun(
    lg: THREE.Group,
    level: LevelDef,
    cx: number,
    cz: number,
    width: number,
    depth: number,
    topY: number,
  ) {
    const veinHex = new THREE.Color(level.counterColor).multiplyScalar(1.18).getHex();
    const topMat = surfaceMat(marbleSurface(level.counterColor, veinHex, level.surface.length * 19), [2.2, 0.8]);
    const bodyHex = liftLuma(
      new THREE.Color(level.counterColor).multiplyScalar(NIGHT_SURFACE.cabinetMul).getHex(),
      NIGHT_SURFACE.minWallLuma,
    );
    const bodyMat = surfaceMat(panelSurface(bodyHex, level.surface.length * 11), [2, 1]);
    const cabH = topY - 0.08;
    this.meshBox(lg, width - 0.08, cabH, depth - 0.08, bodyMat, cx, cabH / 2, cz);
    this.meshBox(lg, width, 0.05, depth, topMat, cx, topY - 0.025, cz);
    // shaker doors so the run reads as furniture, not a crate
    const doorMat = surfaceMat(panelSurface(bodyHex, level.surface.length * 13), [1, 1]);
    const doors = Math.max(2, Math.round(width / 0.55));
    const dw = (width - 0.14) / doors;
    for (let i = 0; i < doors; i++) {
      const dx = cx - width / 2 + 0.1 + dw * (i + 0.5);
      this.meshBox(lg, dw - 0.04, cabH * 0.72, 0.02, doorMat, dx, cabH * 0.48, cz + depth / 2 - 0.03);
      this.meshCyl(lg, 0.012, 0.04, roomMat(0xd8b25a, { metal: 0.18, rough: 0.4 }), dx + dw * 0.28, cabH * 0.48, cz + depth / 2 + 0.01, 8);
    }
    return { topMat, bodyMat, topY };
  }

  /**
   * GS-ROOM-SET: furniture on the play-slab fringe so the OTS camera actually
   * sees a lived-in room. Distant back-wall props read as specks in that
   * frustum; these sit 1.5–4 m from spawn.
   */
  private dressPlayFringe(lg: THREE.Group, level: LevelDef) {
    const darkWood = roomMat(0x6a4a38, { rough: 0.8 });
    const midWood = roomMat(0x7a5a42, { rough: 0.75 });
    const silver = roomMat(NIGHT_SURFACE.shellPan, { metal: 0.18, rough: 0.45 });

    switch (level.surface) {
      case 'kitchen': {
        const k = SET_DRESS.kitchen;
        this.cabinetRun(lg, level, k.backCounter.x, k.backCounter.z, 3.35, 0.5, 0.92);
        // tile backsplash so the run doesn't sit in a black void
        const splash = new THREE.Mesh(
          new THREE.BoxGeometry(3.3, 0.52, 0.04),
          surfaceMat(tileSurface(0x8a7a88, 0x5a4c58, 31), [4, 1.2]),
        );
        splash.position.set(k.backCounter.x, 1.22, k.backCounter.z - 0.24);
        splash.receiveShadow = true;
        lg.add(splash);
        // sink + faucet (OTS-left, window side of the island)
        this.meshBox(lg, 0.42, 0.08, 0.32, roomMat(0x6a7278, { metal: 0.16, rough: 0.4 }), k.sink.x, k.sink.y - 0.04, k.sink.z);
        this.meshCyl(lg, 0.018, 0.22, silver, k.sink.x + 0.12, k.sink.y + 0.12, k.sink.z - 0.08, 8);
        const spout = this.meshBox(lg, 0.16, 0.022, 0.022, silver, k.sink.x + 0.04, k.sink.y + 0.22, k.sink.z - 0.02);
        spout.rotation.z = 0.15;
        this.meshCyl(lg, 0.012, 0.05, silver, k.sink.x - 0.02, k.sink.y + 0.18, k.sink.z + 0.02, 8);
        // upper cabinets hanging in the top-left of OTS
        this.meshBox(lg, 1.7, 0.42, 0.34, surfaceMat(panelSurface(0x6a5850, 17), [2, 1]), k.upperCab.x, k.upperCab.y, k.upperCab.z);
        this.meshBox(lg, 0.02, 0.02, 0.28, roomMat(0xffc07a, { emissive: 0xffb46a, emissiveIntensity: EMISSIVE.led }), k.upperCab.x, k.upperCab.y - 0.22, k.upperCab.z + 0.08);
        // fridge at the far +X end — vanishing point of the play camera
        this.meshBox(lg, 0.62, 1.84, 0.58, silver, k.fridge.x, k.fridge.y, k.fridge.z);
        this.meshBox(lg, 0.58, 0.02, 0.54, roomMat(0x4a5056, { rough: 0.5 }), k.fridge.x, k.fridge.y + 0.12, k.fridge.z + 0.01);
        this.meshBox(lg, 0.03, 0.55, 0.03, roomMat(0xd8b25a, { metal: 0.18, rough: 0.4 }), k.fridge.x - 0.28, k.fridge.y + 0.15, k.fridge.z + 0.28);
        // L-return tucked −Z of the fridge AABB (was z=−0.42, +Z face 0.255
        // stabbed fridge −Z at −0.07). Fridge stays the +X vanishing point.
        this.cabinetRun(lg, level, 2.48, -0.80, 0.52, 1.35, 0.92);
        // baker's rack on the +Z fringe — fills the right of the OTS frame
        const rackWood = roomMat(0x6a4a38, { rough: 0.8 });
        this.meshBox(lg, 0.48, 0.04, 0.36, rackWood, k.bakerRack.x, 0.42, k.bakerRack.z);
        this.meshBox(lg, 0.48, 0.04, 0.36, rackWood, k.bakerRack.x, 0.78, k.bakerRack.z);
        this.meshBox(lg, 0.48, 0.04, 0.36, rackWood, k.bakerRack.x, 1.14, k.bakerRack.z);
        for (const [lx, lz] of [[-0.2, -0.14], [0.2, -0.14], [-0.2, 0.14], [0.2, 0.14]] as const) {
          this.meshCyl(lg, 0.018, 1.18, rackWood, k.bakerRack.x + lx, 0.59, k.bakerRack.z + lz, 8);
        }
        const rackJar = buildProp('jar');
        rackJar.group.position.set(k.bakerRack.x - 0.1, 0.82, k.bakerRack.z);
        lg.add(rackJar.group);
        const rackPlant = buildProp('plant');
        rackPlant.group.position.set(k.bakerRack.x + 0.12, 1.16, k.bakerRack.z);
        rackPlant.group.scale.setScalar(0.75);
        lg.add(rackPlant.group);
        // portrait-side hutch (behind the cat in 3/4 stills)
        this.meshBox(lg, 0.72, 2.05, 0.38, darkWood, k.portraitHutch.x, k.portraitHutch.y, k.portraitHutch.z);
        for (let i = 0; i < 3; i++) {
          this.meshBox(lg, 0.64, 0.03, 0.32, midWood, k.portraitHutch.x, 0.55 + i * 0.45, k.portraitHutch.z + 0.02);
          const dish = buildProp(i % 2 ? 'jar' : 'bowl');
          dish.group.position.set(k.portraitHutch.x + (i - 1) * 0.16, 0.58 + i * 0.45, k.portraitHutch.z + 0.02);
          dish.group.scale.setScalar(0.85);
          lg.add(dish.group);
        }
        const hutchLight = new THREE.PointLight(level.lampColor, 1.6, 2.8, 2);
        hutchLight.position.set(k.portraitHutch.x + 0.35, 1.35, k.portraitHutch.z + 0.45);
        lg.add(hutchLight);
        // Park under the stone-top lip (front face), not inside the 0.895 slab —
        // y=0.88 / z+0.12 leaked onto the island back. Keep NIGHT_RIG.key at 4.8.
        const under = new THREE.PointLight(level.lampColor, 1.5, 1.8, 2);
        under.position.set(k.backCounter.x, 0.78, k.backCounter.z + 0.5 / 2);
        lg.add(under);
        break;
      }
      case 'coffee': {
        const c = SET_DRESS.coffee;
        const upholstery = surfaceMat(fabricSurface(0x7a6480, 29), [2, 1.2]);
        const throwMat = surfaceMat(fabricSurface(0xc84a5a, 41), [1.2, 1]);
        this.cabinetRun(lg, level, c.backConsole.x, c.backConsole.z, 2.4, 0.42, 0.52);
        // glowing media box so the console isn't a blank crate
        this.meshBox(lg, 0.28, 0.22, 0.18, roomMat(0x2a2e38, { rough: 0.45 }), c.backConsole.x - 0.7, 0.64, c.backConsole.z);
        this.meshBox(
          lg,
          0.24,
          0.16,
          0.01,
          roomMat(0x0a1020, { emissive: 0x4a7ab8, emissiveIntensity: EMISSIVE.screen, rough: 0.4 }),
          c.backConsole.x - 0.7,
          0.64,
          c.backConsole.z + 0.1,
        );
        this.dressProp(lg, 'remote', c.backConsole.x - 0.35, 0.54, c.backConsole.z + 0.05);
        this.dressProp(lg, 'book', c.backConsole.x + 0.45, 0.54, c.backConsole.z, 1, 0.4);
        this.dressProp(lg, 'plant', c.backConsole.x + 0.9, 0.54, c.backConsole.z, 0.7);
        this.dressProp(lg, 'bowl', c.backConsole.x + 0.1, 0.54, c.backConsole.z - 0.04, 0.85, 0.2);
        this.dressProp(lg, 'candle', c.backConsole.x + 0.68, 0.54, c.backConsole.z + 0.04, 0.8);
        this.dressProp(lg, 'frame', c.backConsole.x - 0.08, 0.54, c.backConsole.z + 0.06, 0.7, 0.2);
        this.meshBox(lg, 0.02, 0.02, 0.32, roomMat(0xffc07a, { emissive: 0xffb46a, emissiveIntensity: EMISSIVE.led }), c.backConsole.x, 0.50, c.backConsole.z + 0.18);
        // lounge chair — woven upholstery + throw, not a pink crate
        this.meshBox(lg, 0.62, 0.38, 0.58, upholstery, c.loungeChair.x, c.loungeChair.y, c.loungeChair.z, -0.25);
        this.meshBox(lg, 0.62, 0.55, 0.12, upholstery, c.loungeChair.x - 0.04, c.loungeChair.y + 0.42, c.loungeChair.z - 0.22, -0.25);
        this.meshBox(lg, 0.28, 0.08, 0.42, throwMat, c.loungeChair.x + 0.12, c.loungeChair.y + 0.24, c.loungeChair.z + 0.04, -0.4);
        this.dressProp(lg, 'plant', c.loungeChair.x + 0.45, 0, c.loungeChair.z - 0.45, 1.35);
        // speaker (window side of the vanishing point)
        const grille = surfaceMat(fabricSurface(0x4a4450, 17), [1, 1]);
        this.meshBox(lg, 0.22, 0.72, 0.18, roomMat(0x3a3a44, { rough: 0.7 }), c.speaker.x, c.speaker.y, c.speaker.z, 0.2);
        this.meshBox(lg, 0.16, 0.48, 0.02, grille, c.speaker.x - 0.02, c.speaker.y + 0.04, c.speaker.z + 0.09, 0.2);
        this.dressProp(lg, 'plant', c.speaker.x + 0.22, 0, c.speaker.z - 0.18, 0.7);
        // OTS-right snack cart
        const cartWood = surfaceMat(panelSurface(0x6a4a38, 33), [1, 1]);
        this.meshBox(lg, 0.48, 0.04, 0.36, cartWood, c.snackCart.x, 0.42, c.snackCart.z);
        this.meshBox(lg, 0.48, 0.04, 0.36, cartWood, c.snackCart.x, 0.78, c.snackCart.z);
        this.meshBox(lg, 0.48, 0.04, 0.36, cartWood, c.snackCart.x, 1.14, c.snackCart.z);
        for (const [lx, lz] of [[-0.2, -0.14], [0.2, -0.14], [-0.2, 0.14], [0.2, 0.14]] as const) {
          this.meshCyl(lg, 0.018, 1.18, roomMat(0x6a4a38, { rough: 0.8 }), c.snackCart.x + lx, 0.59, c.snackCart.z + lz, 8);
        }
        this.dressProp(lg, 'bowl', c.snackCart.x - 0.08, 0.82, c.snackCart.z, 0.9);
        this.dressProp(lg, 'bottle', c.snackCart.x + 0.12, 0.82, c.snackCart.z, 0.85);
        this.dressProp(lg, 'mug', c.snackCart.x + 0.14, 0.82, c.snackCart.z + 0.08, 0.75);
        this.dressProp(lg, 'plant', c.snackCart.x, 1.16, c.snackCart.z, 0.65);
        this.dressProp(lg, 'book', c.snackCart.x - 0.08, 0.46, c.snackCart.z, 0.9, 0.35);
        this.dressProp(lg, 'remote', c.snackCart.x + 0.12, 0.46, c.snackCart.z, 0.85, 0.2);
        // leftover empty floor by the cart — magazines so OTS-right isn't bare plank
        for (let i = 0; i < 3; i++) {
          this.meshBox(
            lg,
            0.16,
            0.012,
            0.22,
            roomMat([0x8a4a5a, 0x4a6a8a, 0xc8b89a][i], { rough: 0.7 }),
            c.snackCart.x - 0.28,
            0.02 + i * 0.014,
            c.snackCart.z + 0.06 + i * 0.02,
            0.4 + i * 0.12,
          );
        }
        // portrait-side torchiere
        this.meshCyl(lg, 0.04, 1.55, roomMat(NIGHT_SURFACE.shellRack, { metal: 0.16, rough: 0.5 }), c.portraitLamp.x, 0.78, c.portraitLamp.z, 8);
        this.meshCyl(lg, 0.16, 0.08, roomMat(0xf5e0b8, { rough: 0.88, emissive: 0xffb46a, emissiveIntensity: EMISSIVE.shade }), c.portraitLamp.x, c.portraitLamp.y + 0.55, c.portraitLamp.z, 12);
        const pLight = new THREE.PointLight(level.lampColor, 2.1, 3.4, 2);
        pLight.position.set(c.portraitLamp.x, c.portraitLamp.y + 0.5, c.portraitLamp.z);
        lg.add(pLight);
        const cartLight = new THREE.PointLight(level.lampColor, 1.5, 2.6, 2);
        cartLight.position.set(c.snackCart.x, 1.05, c.snackCart.z);
        lg.add(cartLight);
        break;
      }
      case 'desk': {
        const d = SET_DRESS.desk;
        const bodyHex = liftLuma(
          new THREE.Color(level.counterColor).multiplyScalar(NIGHT_SURFACE.cabinetMul).getHex(),
          NIGHT_SURFACE.minWallLuma,
        );
        const shelfMat = surfaceMat(panelSurface(bodyHex, 21), [1.4, 1]);
        this.meshBox(lg, 1.7, 1.55, 0.28, shelfMat, d.backShelf.x, d.backShelf.y - 0.35, d.backShelf.z);
        for (let r = 0; r < 4; r++) {
          this.meshBox(lg, 1.62, 0.03, 0.26, shelfMat, d.backShelf.x, 0.35 + r * 0.36, d.backShelf.z + 0.02);
          for (let b = 0; b < 5; b++) {
            this.meshBox(
              lg,
              0.05,
              0.22 + (b % 3) * 0.04,
              0.18,
              roomMat([0x4a2c2c, 0x2c3c4a, 0x4a3c2c, 0x342c44, 0x3a4a38][b], { rough: 0.9 }),
              d.backShelf.x - 0.65 + b * 0.28,
              0.48 + r * 0.36,
              d.backShelf.z + 0.02,
            );
          }
        }
        this.dressProp(lg, 'plant', d.backShelf.x - 0.55, 1.46, d.backShelf.z + 0.02, 0.7);
        this.dressProp(lg, 'jar', d.backShelf.x + 0.5, 1.46, d.backShelf.z + 0.02, 0.8);
        this.dressProp(lg, 'frame', d.backShelf.x + 0.15, 1.46, d.backShelf.z + 0.02, 0.75, 0.15);
        // leftover empty BACK WALL — cork splash (kitchen-tile analogue)
        this.meshBox(
          lg,
          2.4,
          1.35,
          0.05,
          surfaceMat(panelSurface(0x8a6848, 37), [3, 1.6]),
          d.backShelf.x,
          1.62,
          d.backShelf.z - 0.18,
        );
        // cork pinboard on the room face
        this.meshBox(lg, 1.15, 0.72, 0.03, surfaceMat(panelSurface(0x8a6848, 37), [1.6, 1]), d.pinboard.x, d.pinboard.y, d.pinboard.z);
        for (let i = 0; i < 6; i++) {
          this.meshBox(
            lg,
            0.18,
            0.24,
            0.012,
            roomMat([0xf2ead0, 0xd0e4f4, 0xf0c8c8][i % 3], { rough: 0.95 }),
            d.pinboard.x - 0.38 + (i % 3) * 0.38,
            d.pinboard.y - 0.16 + Math.floor(i / 3) * 0.32,
            d.pinboard.z + 0.02,
            (i - 2.5) * 0.04,
          );
        }
        // polaroids on the splash so the wall isn't one cork slab
        for (let i = 0; i < 4; i++) {
          this.meshBox(
            lg,
            0.14,
            0.16,
            0.008,
            roomMat([0xf8f0dc, 0xe8dcc8, 0xd8e8f0, 0xf0d0d0][i], { rough: 0.95 }),
            d.backShelf.x - 0.85 + i * 0.52,
            1.95,
            d.backShelf.z - 0.14,
            (i - 1.5) * 0.06,
          );
        }
        const cabMat = surfaceMat(panelSurface(bodyHex, 25), [1, 1.4]);
        this.meshBox(lg, 0.48, 1.12, 0.5, cabMat, d.fileCab.x, d.fileCab.y, d.fileCab.z);
        for (let i = 0; i < 3; i++) {
          this.meshBox(lg, 0.42, 0.08, 0.02, cabMat, d.fileCab.x, 0.28 + i * 0.28, d.fileCab.z + 0.26);
        }
        this.dressProp(lg, 'plant', d.fileCab.x, 1.16, d.fileCab.z, 0.8);
        this.dressProp(lg, 'mug', d.fileCab.x + 0.14, 1.16, d.fileCab.z + 0.06, 0.7);
        this.dressProp(lg, 'book', d.fileCab.x - 0.12, 1.16, d.fileCab.z, 0.85, 0.4);
        // leftover empty +X BACK WALL — cork face the play OTS actually looks at
        // (window-side splash stays; this is the kitchen-fridge analogue)
        const corkFace = surfaceMat(panelSurface(0x8a6848, 41), [1.4, 2]);
        this.meshBox(lg, 0.06, 1.9, 1.65, corkFace, d.corkWall.x, d.corkWall.y, d.corkWall.z);
        for (let i = 0; i < 8; i++) {
          this.meshBox(
            lg,
            0.012,
            0.22,
            0.16,
            roomMat([0xf2ead0, 0xd0e4f4, 0xf0c8c8, 0xe8dcc8][i % 4], { rough: 0.95 }),
            d.corkWall.x - 0.04,
            0.85 + (i % 4) * 0.38,
            d.corkWall.z - 0.55 + Math.floor(i / 4) * 0.7,
            (i - 3.5) * 0.03,
          );
        }
        this.meshBox(lg, 0.42, 0.72, 0.38, darkWood, d.portraitCart.x, d.portraitCart.y, d.portraitCart.z);
        this.dressProp(lg, 'book', d.portraitCart.x, 0.95, d.portraitCart.z);
        // OTS-right easel + canvas (Kai leftover). Canvas faces −X so play OTS
        // looking +X actually sees the painting, not a stick.
        const easelWood = roomMat(0x6a4a38, { rough: 0.8 });
        this.meshBox(lg, 0.04, 1.35, 0.04, easelWood, d.easel.x, 0.7, d.easel.z - 0.18);
        this.meshBox(lg, 0.04, 1.35, 0.04, easelWood, d.easel.x, 0.7, d.easel.z + 0.18);
        this.meshBox(lg, 0.04, 1.15, 0.04, easelWood, d.easel.x + 0.16, 0.6, d.easel.z);
        this.meshBox(lg, 0.04, 0.04, 0.42, easelWood, d.easel.x, 1.18, d.easel.z);
        const canvas = new THREE.Mesh(
          new THREE.PlaneGeometry(0.52, 0.68),
          new THREE.MeshStandardNodeMaterial({ map: posterTex(200), roughness: 0.9 }),
        );
        canvas.position.set(d.easel.x, d.easel.y, d.easel.z);
        canvas.rotation.y = Math.PI / 2;
        canvas.rotation.x = -0.08;
        canvas.castShadow = true;
        lg.add(canvas);
        const canvasBack = this.meshBox(lg, 0.03, 0.7, 0.54, easelWood, d.easel.x + 0.02, d.easel.y, d.easel.z);
        canvasBack.rotation.y = 0;
        this.dressProp(lg, 'jar', d.easel.x + 0.28, 0.02, d.easel.z + 0.12, 0.7);
        this.dressProp(lg, 'bowl', d.easel.x - 0.28, 0.02, d.easel.z + 0.1, 0.65);
        this.dressProp(lg, 'book', d.easel.x + 0.22, 0.02, d.easel.z - 0.16, 0.8, 0.5);
        this.dressProp(lg, 'jar', d.easel.x - 0.18, 0.02, d.easel.z - 0.12, 0.55);
        // leftover empty floor — wastebasket so the easel corner isn't bare plank
        this.meshCyl(lg, 0.12, 0.28, roomMat(0x4a4038, { rough: 0.9 }), d.easel.x - 0.42, 0.14, d.easel.z + 0.22, 10);
        const under = new THREE.PointLight(level.lampColor, 1.8, 3.0, 2);
        under.position.set(d.backShelf.x, 1.4, d.backShelf.z + 0.2);
        lg.add(under);
        const fileLight = new THREE.PointLight(level.lampColor, 1.4, 2.4, 2);
        fileLight.position.set(d.fileCab.x - 0.15, 1.35, d.fileCab.z + 0.2);
        lg.add(fileLight);
        const corkLight = new THREE.PointLight(level.lampColor, 1.6, 2.8, 2);
        corkLight.position.set(d.corkWall.x - 0.35, d.corkWall.y, d.corkWall.z);
        lg.add(corkLight);
        break;
      }
      case 'dresser': {
        const r = SET_DRESS.dresser;
        const linen = surfaceMat(fabricSurface(0x8a6480, 23), [1.4, 1]);
        this.cabinetRun(lg, level, r.nightstand.x, r.nightstand.z, 1.15, 0.42, 0.62);
        this.dressProp(lg, 'candle', r.nightstand.x - 0.28, 0.64, r.nightstand.z);
        this.dressProp(lg, 'frame', r.nightstand.x + 0.22, 0.64, r.nightstand.z + 0.02);
        this.dressProp(lg, 'perfume', r.nightstand.x - 0.02, 0.64, r.nightstand.z + 0.06, 0.9);
        this.dressProp(lg, 'jewelrybox', r.nightstand.x + 0.38, 0.64, r.nightstand.z - 0.04, 0.85, 0.2);
        this.dressProp(lg, 'perfume', r.nightstand.x + 0.18, 0.64, r.nightstand.z + 0.08, 0.7, -0.2);
        this.dressProp(lg, 'plant', r.nightstand.x - 0.48, 0.64, r.nightstand.z + 0.04, 0.55);
        // modest shade lamp so the nightstand reads warm, not a dead crate
        this.meshCyl(lg, 0.018, 0.22, roomMat(0xd8b25a, { metal: 0.18, rough: 0.4 }), r.nightstand.x - 0.42, 0.75, r.nightstand.z - 0.06, 8);
        this.meshCyl(lg, 0.11, 0.1, roomMat(0xf5e0b8, { rough: 0.88, emissive: 0xffb46a, emissiveIntensity: EMISSIVE.shade }), r.nightstand.x - 0.42, 0.92, r.nightstand.z - 0.06, 12);
        const nsLight = new THREE.PointLight(level.lampColor, 1.7, 2.6, 2);
        nsLight.position.set(r.nightstand.x - 0.42, 0.9, r.nightstand.z);
        lg.add(nsLight);
        const wardMat = surfaceMat(panelSurface(0x6a4a38, 31), [1.2, 2]);
        this.meshBox(lg, 0.85, 2.15, 0.48, wardMat, r.wardrobe.x, r.wardrobe.y, r.wardrobe.z);
        this.meshCyl(lg, 0.018, 0.16, roomMat(0xd8b25a, { metal: 0.18, rough: 0.35 }), r.wardrobe.x - 0.28, r.wardrobe.y, r.wardrobe.z + 0.25, 8);
        // leftover empty +X wall behind the wardrobe — do not replace GS-ROOM-SET wardrobe
        this.meshBox(lg, 0.05, 1.7, 1.45, linen, r.wardrobe.x + 0.32, 1.55, r.wardrobe.z);
        // ajar door + hanging clothes so the wardrobe isn't a sealed crate
        const door = this.meshBox(lg, 0.38, 1.7, 0.03, wardMat, r.wardrobe.x - 0.22, r.wardrobe.y - 0.05, r.wardrobe.z + 0.28);
        door.rotation.y = 0.55;
        for (let i = 0; i < 3; i++) {
          this.meshBox(
            lg,
            0.12,
            0.7,
            0.22,
            roomMat([0x8a9ab8, 0xb88a9a, 0xd8d0c0][i], { rough: 1 }),
            r.wardrobe.x - 0.08 + i * 0.12,
            r.wardrobe.y + 0.15,
            r.wardrobe.z + 0.08,
          );
        }
        for (let i = 0; i < 3; i++) {
          const cloth = new THREE.Mesh(
            new THREE.SphereGeometry(0.13, 8, 6),
            roomMat([0x8a9ab8, 0xb88a9a, 0xd8d0c0][i], { rough: 1 }),
          );
          cloth.scale.set(1.25, 0.45, 1.05);
          cloth.position.set(r.portraitHamper.x + (i - 1) * 0.12, r.portraitHamper.y + i * 0.04, r.portraitHamper.z);
          lg.add(cloth);
        }
        // OTS-right vanity stool
        this.meshCyl(lg, 0.2, 0.08, linen, r.vanityStool.x, r.vanityStool.y, r.vanityStool.z);
        this.meshCyl(lg, 0.03, 0.38, darkWood, r.vanityStool.x, r.vanityStool.y - 0.22, r.vanityStool.z);
        // robe on a hook — bulk so play OTS actually reads cloth, not a stick
        this.meshCyl(lg, 0.02, 0.12, roomMat(0xd8b25a, { metal: 0.18, rough: 0.4 }), r.robeHook.x, r.robeHook.y + 0.42, r.robeHook.z, 8);
        this.meshBox(lg, 0.52, 1.18, 0.28, linen, r.robeHook.x, r.robeHook.y, r.robeHook.z, 0.35);
        this.meshBox(lg, 0.22, 0.85, 0.2, roomMat(0xb88a9a, { rough: 1 }), r.robeHook.x + 0.16, r.robeHook.y - 0.1, r.robeHook.z + 0.08, 0.5);
        this.meshBox(lg, 0.18, 0.7, 0.18, roomMat(0x8a9ab8, { rough: 1 }), r.robeHook.x - 0.12, r.robeHook.y - 0.14, r.robeHook.z + 0.06, 0.15);
        this.meshBox(lg, 0.08, 0.55, 0.08, roomMat(0xd8c8b8, { rough: 1 }), r.robeHook.x + 0.04, r.robeHook.y - 0.22, r.robeHook.z + 0.1, 0.2);
        // leftover empty floor by the stool — hamper so +Z isn't a wood void
        for (let i = 0; i < 3; i++) {
          const cloth = new THREE.Mesh(
            new THREE.SphereGeometry(0.12, 8, 6),
            roomMat([0x8a9ab8, 0xb88a9a, 0xd8d0c0][i], { rough: 1 }),
          );
          cloth.scale.set(1.2, 0.5, 1.05);
          cloth.position.set(r.vanityStool.x + 0.28 + i * 0.08, 0.08 + i * 0.03, r.vanityStool.z - 0.06);
          lg.add(cloth);
        }
        break;
      }
      case 'dining': {
        const n = SET_DRESS.dining;
        const cartMat = surfaceMat(panelSurface(0x7a5a42, 29), [1.2, 1]);
        this.cabinetRun(lg, level, n.windowSideboard.x, n.windowSideboard.z, 1.8, 0.44, 0.78);
        for (let i = 0; i < 3; i++) {
          this.dressProp(lg, 'bottle', n.windowSideboard.x - 0.45 + i * 0.22, 0.80, n.windowSideboard.z);
        }
        this.dressProp(lg, 'vase', n.windowSideboard.x + 0.55, 0.80, n.windowSideboard.z);
        this.dressProp(lg, 'plate', n.windowSideboard.x + 0.22, 0.80, n.windowSideboard.z + 0.04, 0.7, 0.3);
        this.dressProp(lg, 'candle', n.windowSideboard.x - 0.72, 0.80, n.windowSideboard.z + 0.02, 0.85);
        this.dressProp(lg, 'wineglass', n.windowSideboard.x - 0.18, 0.80, n.windowSideboard.z + 0.06, 0.8);
        this.dressProp(lg, 'bowl', n.windowSideboard.x + 0.38, 0.80, n.windowSideboard.z, 0.65, 0.15);
        // wine cart at the far +X vanishing point
        this.meshBox(lg, 0.55, 0.08, 0.38, cartMat, n.wineCart.x, 0.72, n.wineCart.z);
        this.meshBox(lg, 0.55, 0.08, 0.38, cartMat, n.wineCart.x, 0.38, n.wineCart.z);
        for (const [lx, lz] of [[-0.22, -0.14], [0.22, -0.14], [-0.22, 0.14], [0.22, 0.14]] as const) {
          this.meshCyl(lg, 0.02, 0.72, darkWood, n.wineCart.x + lx, 0.36, n.wineCart.z + lz, 8);
        }
        this.dressProp(lg, 'bottle', n.wineCart.x, 0.78, n.wineCart.z);
        this.dressProp(lg, 'wineglass', n.wineCart.x + 0.16, 0.78, n.wineCart.z + 0.04, 0.9);
        this.dressProp(lg, 'wineglass', n.wineCart.x - 0.16, 0.78, n.wineCart.z - 0.04, 0.9);
        this.meshBox(lg, 1.55, 0.82, 0.42, cartMat, n.portraitBuffet.x, n.portraitBuffet.y, n.portraitBuffet.z);
        this.meshBox(lg, 1.58, 0.05, 0.44, darkWood, n.portraitBuffet.x, 0.92, n.portraitBuffet.z);
        this.dressProp(lg, 'wineglass', n.portraitBuffet.x + 0.3, 0.95, n.portraitBuffet.z);
        this.dressProp(lg, 'bowl', n.portraitBuffet.x - 0.25, 0.95, n.portraitBuffet.z, 0.85);
        // OTS-right serving trolley (guest chairs are table furniture)
        this.meshBox(lg, 0.52, 0.05, 0.36, cartMat, n.serveTrolley.x, 0.78, n.serveTrolley.z);
        this.meshBox(lg, 0.52, 0.05, 0.36, cartMat, n.serveTrolley.x, 0.42, n.serveTrolley.z);
        for (const [lx, lz] of [[-0.2, -0.14], [0.2, -0.14], [-0.2, 0.14], [0.2, 0.14]] as const) {
          this.meshCyl(lg, 0.018, 0.78, darkWood, n.serveTrolley.x + lx, 0.4, n.serveTrolley.z + lz, 8);
        }
        this.dressProp(lg, 'plate', n.serveTrolley.x - 0.1, 0.82, n.serveTrolley.z, 0.8, 0.2);
        this.dressProp(lg, 'bowl', n.serveTrolley.x + 0.12, 0.82, n.serveTrolley.z, 0.75);
        this.dressProp(lg, 'wineglass', n.serveTrolley.x, 0.82, n.serveTrolley.z + 0.08, 0.7);
        this.dressProp(lg, 'plant', n.serveTrolley.x, 0.46, n.serveTrolley.z, 0.55);
        this.dressProp(lg, 'bottle', n.serveTrolley.x - 0.14, 0.46, n.serveTrolley.z, 0.75);
        this.meshBox(lg, 0.16, 0.02, 0.16, roomMat(0xd8c8b8, { rough: 0.98 }), n.serveTrolley.x + 0.14, 0.46, n.serveTrolley.z + 0.04, 0.2);
        // leftover empty floor — wine crate so the trolley corner isn't bare plank
        this.meshBox(lg, 0.32, 0.16, 0.22, roomMat(0x6a4a38, { rough: 0.85 }), n.serveTrolley.x + 0.38, 0.08, n.serveTrolley.z + 0.06);
        this.dressProp(lg, 'bottle', n.serveTrolley.x + 0.38, 0.18, n.serveTrolley.z + 0.06, 0.7);
        const under = new THREE.PointLight(level.lampColor, 2.0, 3.2, 2);
        under.position.set(n.windowSideboard.x, 0.95, n.windowSideboard.z + 0.15);
        lg.add(under);
        const trolleyLight = new THREE.PointLight(level.lampColor, 1.5, 2.5, 2);
        trolleyLight.position.set(n.serveTrolley.x, 1.05, n.serveTrolley.z);
        lg.add(trolleyLight);
        break;
      }
    }
  }

  private dressRoom(lg: THREE.Group, level: LevelDef) {
    const box = (w: number, h: number, d: number, mat: any, x: number, y: number, z: number, ry = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      m.castShadow = true;
      m.receiveShadow = true;
      lg.add(m);
      return m;
    };
    const cyl = (r: number, h: number, mat: any, x: number, y: number, z: number, seg = 12) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      lg.add(m);
      return m;
    };
    const darkWood = roomMat(0x6a4a38, { rough: 0.8 });
    const midWood = roomMat(0x7a5a42, { rough: 0.75 });
    const fabric = roomMat(0x7a6480, { rough: 0.95 });

    this.dressPlayFringe(lg, level);

    switch (level.surface) {
      case 'kitchen': {
        // hanging pot rack over the island (in frame) + bar stools in the foreground
        const rackMat = roomMat(NIGHT_SURFACE.shellRack, { metal: 0.18, rough: 0.55 });
        const panMat = roomMat(NIGHT_SURFACE.shellPan, { metal: 0.16, rough: 0.5 });
        box(1.3, 0.03, 0.5, rackMat, -0.6, 2.15, 0.3);
        // second rack section further +X so OTS still sees pans after a few steps
        box(1.1, 0.03, 0.42, rackMat, 0.85, 2.15, 0.22);
        for (const [cx, cz2] of [[-1.15, 0.05], [-1.15, 0.55], [-0.05, 0.05], [-0.05, 0.55], [0.4, 0.05], [1.25, 0.05]] as const) {
          cyl(0.006, 1.3, rackMat, cx, 2.8, cz2, 6);
        }
        for (let i = 0; i < 3; i++) {
          const pan = cyl(0.13 - i * 0.02, 0.035, panMat, -1.05 + i * 0.42, 2.02, 0.3);
          pan.scale.y = 1;
          const handle = box(0.03, 0.02, 0.16, panMat, -1.05 + i * 0.42, 2.02, 0.45);
          handle.castShadow = false;
        }
        for (let i = 0; i < 2; i++) {
          cyl(0.12 - i * 0.02, 0.03, panMat, 0.55 + i * 0.4, 2.02, 0.22);
        }
        // bar stools — three so the +Z fringe stays dressed as she walks +X.
        // Third was x=1.15, z=1.55 and clipped bakerRack (1.52, 1.68); nudge −X.
        for (const sx of [-0.9, 0.15, 0.85]) {
          cyl(0.19, 0.07, roomMat(0x8a6a52, { rough: 0.6 }), sx, 0.62, 1.55);
          cyl(0.03, 0.6, roomMat(NIGHT_SURFACE.shellRack, { metal: 0.18, rough: 0.55 }), sx, 0.3, 1.55);
          cyl(0.14, 0.03, roomMat(NIGHT_SURFACE.shellRack, { metal: 0.18, rough: 0.55 }), sx, 0.02, 1.55);
        }
        // herb pots on the window sill (visible near window)
        for (let i = 0; i < 2; i++) {
          cyl(0.07, 0.09, roomMat(0xb0684a, { rough: 0.8 }), 2.1 + i * 0.35, 1.04, -3.25);
          const herb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), roomMat(0x5c9a5e, { rough: 0.9 }));
          herb.position.set(2.1 + i * 0.35, 1.14, -3.25);
          herb.scale.y = 1.4;
          lg.add(herb);
        }
        // dusty lived-in clutter on the BACK COUNTER only (not the play slab)
        const k = SET_DRESS.kitchen;
        const cooker = this.meshCyl(lg, 0.13, 0.16, roomMat(NIGHT_SURFACE.shellPan, { metal: 0.18, rough: 0.42 }), k.riceCooker.x, k.riceCooker.y, k.riceCooker.z, 14);
        cooker.scale.y = 1;
        this.meshCyl(lg, 0.14, 0.04, roomMat(NIGHT_SURFACE.shellPan, { metal: 0.16, rough: 0.5 }), k.riceCooker.x, k.riceCooker.y + 0.08, k.riceCooker.z, 14);
        this.meshCyl(lg, 0.025, 0.05, roomMat(0x4a4448, { rough: 0.6 }), k.riceCooker.x, k.riceCooker.y + 0.14, k.riceCooker.z, 8);
        const kettle = buildProp('teapot');
        kettle.group.position.set(k.riceCooker.x + 0.38, 0.94, k.riceCooker.z + 0.02);
        kettle.group.scale.setScalar(0.9);
        lg.add(kettle.group);
        const board = this.meshBox(lg, 0.32, 0.02, 0.22, roomMat(0x8a6a48, { rough: 0.9 }), k.sink.x - 0.55, 0.94, k.sink.z + 0.04);
        board.rotation.y = 0.18;
        const crock = this.meshCyl(lg, 0.055, 0.12, roomMat(0xb07a5a, { rough: 0.88 }), k.sink.x - 0.95, 1.00, k.sink.z - 0.04, 10);
        crock.castShadow = true;
        for (let i = 0; i < 4; i++) {
          const stick = this.meshCyl(lg, 0.008, 0.18, roomMat(0xc8b090, { rough: 0.7 }), k.sink.x - 0.95 + (i - 1.5) * 0.018, 1.14, k.sink.z - 0.04, 6);
          stick.rotation.z = (i - 1.5) * 0.08;
        }
        const towel = this.meshBox(lg, 0.18, 0.28, 0.04, roomMat(0xd8c8b8, { rough: 0.98 }), k.sink.x + 0.42, 0.72, k.sink.z + 0.22);
        towel.rotation.x = 0.15;
        const herbPot = buildProp('plant');
        herbPot.group.position.set(k.backCounter.x - 1.25, 0.94, k.backCounter.z);
        herbPot.group.scale.setScalar(0.7);
        lg.add(herbPot.group);
        // leftover empty surfaces only — do not redo BUILD 12 fridge/splash/hood/rack
        this.dressProp(lg, 'bowl', 2.48, 0.94, -0.80, 0.8, 0.25);
        this.meshBox(lg, 0.2, 0.04, 0.14, roomMat(0xd8c8b8, { rough: 0.98 }), 2.48, 0.94, -0.55);
        this.dressProp(lg, 'bowl', k.bakerRack.x, 0.46, k.bakerRack.z, 0.7);
        this.meshBox(lg, 0.08, 0.10, 0.004, roomMat(0xe8dcc8, { rough: 0.9 }), k.fridge.x - 0.32, k.fridge.y + 0.48, k.fridge.z + 0.29);
        this.meshBox(lg, 0.06, 0.08, 0.004, roomMat(0xc8d8e8, { rough: 0.9 }), k.fridge.x - 0.32, k.fridge.y + 0.28, k.fridge.z + 0.29, 0.12);
        break;
      }
      case 'coffee': {
        // media console under the TV + floor cushions + magazine stack
        box(1.8, 0.45, 0.45, darkWood, 6.55, 0.23, 0.4);
        box(0.5, 0.04, 0.3, roomMat(0x1a1a20, { rough: 0.3, metal: 0.4 }), 6.55, 0.48, 0.4);
        // console glow
        const led = box(0.06, 0.02, 0.02, roomMat(0xff3a3a, { emissive: 0xff2a2a, emissiveIntensity: EMISSIVE.led }), 6.35, 0.35, 0.63);
        led.castShadow = false;
        // floor cushions
        box(0.55, 0.14, 0.55, fabric, -1.4, 0.07, 1.6, 0.3);
        box(0.5, 0.13, 0.5, roomMat(0x6b5a48, { rough: 0.95 }), 1.6, 0.065, 1.5, -0.2);
        // magazine stack on the rug
        for (let i = 0; i < 3; i++) {
          box(0.28, 0.015, 0.38, roomMat([0x8a4a5a, 0x4a6a8a, 0xc8b89a][i], { rough: 0.7 }), -1.9 + Math.random() * 0.04, 0.02 + i * 0.018, -0.6, Math.random() * 0.6 - 0.3);
        }
                // throw blanket draped over the couch arm
        box(0.34, 0.06, 0.6, roomMat(0xc84a5a, { rough: 1 }), -3.62, 0.78, -1.9, 0.2);
        box(0.06, 0.3, 0.6, roomMat(0xc84a5a, { rough: 1 }), -3.62, 0.6, -1.9, 0);
        // popcorn bowl on the rug (spilled a little)
        cyl(0.16, 0.1, roomMat(0xc84a5a, { rough: 0.6 }), -0.9, 0.05, -0.7);
        for (let i = 0; i < 6; i++) {
          const k = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), roomMat(0xf5e8c8, { rough: 0.8 }));
          k.position.set(-0.9 + (Math.random() - 0.5) * 0.5, 0.02, -0.7 + (Math.random() - 0.5) * 0.4);
          lg.add(k);
        }
        // rug under the table so the slab doesn't sit in a wood void
        const coffeeRug = new THREE.Mesh(
          new THREE.CircleGeometry(1.45, 24),
          surfaceMat(rugSurface(0x6a5468, 0x8a7080, 21)),
        );
        coffeeRug.rotation.x = -Math.PI / 2;
        coffeeRug.position.set(0, 0.006, 0.3);
        coffeeRug.receiveShadow = true;
        lg.add(coffeeRug);
        break;
      }
      case 'desk': {
        // Leftover rolling chair at (0.6, 0.5, −1.15) ate SET_DRESS.desk.backShelf
        // (RoomSet locks that landmark — do not slide the shelf). Drop the chair.
        // corkboard with pinned notes
        box(1.3, 0.9, 0.03, roomMat(0x9a7a5a, { rough: 0.9 }), 3.4, 2.2, -3.35);
        for (let i = 0; i < 6; i++) {
          box(0.16, 0.2, 0.005, roomMat([0xe8e0c8, 0xc8d8e8, 0xe8c8c8][i % 3], { rough: 0.95 }), 3.0 + (i % 3) * 0.4, 2.05 + Math.floor(i / 3) * 0.35, -3.33, (Math.random() - 0.5) * 0.2);
        }
        // flat files drawer
        box(0.6, 1.1, 0.5, darkWood, 2.6, 0.55, -3.0);
        // stack of sketchbooks
        for (let i = 0; i < 4; i++) {
          box(0.3, 0.03, 0.4, roomMat([0x3a3a44, 0x5a4a3a, 0x2a3a4a, 0x4a3a3a][i], { rough: 0.8 }), 2.6, 1.13 + i * 0.035, -3.0, (Math.random() - 0.5) * 0.3);
        }
        break;
      }
      case 'dresser': {
        // bed with headboard, pillows, blanket; wardrobe; laundry pile
        const bedFrame = roomMat(0x4a3428, { rough: 0.8 });
        const blanket = roomMat(0x7a4a5e, { rough: 0.95 });
        box(2.2, 0.35, 1.6, bedFrame, -4.6, 0.18, -1.2);
        box(2.2, 1.1, 0.12, bedFrame, -4.6, 0.9, -2.05);
        box(2.1, 0.22, 1.5, roomMat(0xe8dcd0, { rough: 0.95 }), -4.6, 0.46, -1.2);
        box(2.1, 0.14, 0.9, blanket, -4.6, 0.52, -0.85);
        box(0.55, 0.16, 0.35, roomMat(0xf5efe4, { rough: 0.95 }), -5.1, 0.6, -1.75, 0.15);
        box(0.55, 0.16, 0.35, roomMat(0xf5efe4, { rough: 0.95 }), -4.4, 0.6, -1.72, -0.1);
        // wardrobe
        box(1.1, 2.1, 0.6, darkWood, -6.5, 1.05, -3.0);
        cyl(0.02, 0.15, roomMat(0xd8b25a, { metal: 0.8, rough: 0.25 }), -6.15, 1.05, -2.68);
        // laundry pile
        for (let i = 0; i < 4; i++) {
          const cloth = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), roomMat([0x8a9ab8, 0xb88a9a, 0x9ab88a, 0xd8d0c0][i], { rough: 1 }));
          cloth.scale.set(1.3, 0.5, 1.1);
          cloth.position.set(-3.4 + (Math.random() - 0.5) * 0.4, 0.05 + i * 0.03, -1.4 + (Math.random() - 0.5) * 0.3);
          lg.add(cloth);
        }
        const dresserRug = new THREE.Mesh(
          new THREE.CircleGeometry(1.25, 24),
          surfaceMat(rugSurface(0x6a4058, 0x8a6080, 19)),
        );
        dresserRug.rotation.x = -Math.PI / 2;
        dresserRug.position.set(0, 0.006, 0.35);
        dresserRug.receiveShadow = true;
        lg.add(dresserRug);
        break;
      }
      case 'dining': {
        // sideboard with wine bottles + wine rack + curtains framing the window
        box(2.0, 0.85, 0.5, midWood, -4.6, 0.43, -3.05);
        box(2.05, 0.05, 0.52, darkWood, -4.6, 0.88, -3.05);
        for (let i = 0; i < 3; i++) {
          const b = cyl(0.05, 0.3, roomMat(0x2a4a2a, { rough: 0.15 }), -5.2 + i * 0.22, 1.06, -3.05);
          b.scale.y = 1;
          cyl(0.015, 0.08, roomMat(0xc8a878, { rough: 0.8 }), -5.2 + i * 0.22, 1.25, -3.05);
        }
        // decanter
        cyl(0.09, 0.16, roomMat(0x6a1630, { rough: 0.1, transparent: true, opacity: 0.7 }), -4.2, 0.99, -3.05);
        // curtains on both sides of the window
        for (const x of [1.35, 4.45]) {
          const curtain = box(0.5, 2.6, 0.15, roomMat(0x5a2030, { rough: 1 }), x, 2.0, -3.25);
          curtain.castShadow = false;
        }
        // wall frames
        for (let i = 0; i < 2; i++) {
          box(0.5, 0.65, 0.03, darkWood, -0.8 + i * 0.7, 2.5, -3.37);
          box(0.42, 0.57, 0.02, roomMat(0x8a6a4a, { rough: 0.6, emissive: 0x3a2a1a, emissiveIntensity: 0.3 }), -0.8 + i * 0.7, 2.5, -3.36);
        }
        const diningRug = new THREE.Mesh(
          new THREE.CircleGeometry(1.55, 24),
          surfaceMat(rugSurface(0x6a2030, 0x8a4050, 27)),
        );
        diningRug.rotation.x = -Math.PI / 2;
        diningRug.position.set(0, 0.006, 0.3);
        diningRug.receiveShadow = true;
        lg.add(diningRug);
        break;
      }
    }
  }

  private placeProps(lg: THREE.Group, level: LevelDef) {
    const [w, d] = level.counterSize;
    const rows = 2;
    const perRow = Math.ceil(level.props.length / rows);
    const margin = 0.34;

    level.props.forEach((kind: PropKind, i: number) => {
      const visual = buildProp(kind);
      const def = PROP_LIBRARY[kind];
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const xSpan = (w - margin * 2) * 0.9;
      const x = -xSpan / 2 + (xSpan * (col + 0.5)) / perRow + (Math.random() - 0.5) * 0.16;
      const zSpan = d - margin * 1.4;
      const z = this.surface.cz - zSpan / 2 + (zSpan * (row + 0.5)) / rows + (Math.random() - 0.5) * 0.12;
      visual.group.position.set(x, counterRestY(this.surface.topY), z);
      visual.group.rotation.y = Math.random() * Math.PI * 2;
      lg.add(visual.group);

      const body = new Body(visual.group, def.shatter, visual.halfHeight, visual.radiusXZ, def.points, {
        mass: def.mass,
        immovable: !!def.immovable,
      });
      // subtle tint so leftover immovable scenery (none of the smashables) reads as planted
      if (def.immovable) {
        visual.group.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh && m.material && 'emissive' in (m.material as object)) {
            const mat = m.material as THREE.MeshStandardMaterial;
            if (mat.emissive) mat.emissive.setHex(0x1a1028);
            if ('emissiveIntensity' in mat) mat.emissiveIntensity = Math.max(mat.emissiveIntensity ?? 0, 0.08);
          }
        });
      }
      this.physics.addBody(body);
      if (kind === 'candle' || kind === 'candelabra') {
        visual.group.traverse((o) => {
          if (o.name.startsWith('flame')) this.flames.push(o);
        });
      }
    });
  }

  update(dt: number, t: number, camera: THREE.Camera) {
    // flame flicker
    for (const f of this.flames) {
      const s = 0.9 + Math.sin(t * 11 + f.id * 7.3) * 0.12 + Math.sin(t * 23 + f.id) * 0.06;
      f.scale.set(s, s * (1 + Math.sin(t * 17 + f.id) * 0.08), s);
    }
    // string light gentle pulse
    for (let i = 0; i < this.stringMats.length; i++) {
      this.stringMats[i].emissiveIntensity = EMISSIVE.string + Math.sin(t * 1.8 + i * 1.3) * EMISSIVE.stringPulse;
    }
    // tv flicker
    if (this.tvScreen) {
      const m = this.tvScreen.material as any;
      m.emissiveIntensity = EMISSIVE.screen + Math.abs(Math.sin(t * 2.3) * Math.sin(t * 5.7)) * 0.18;
    }
    this.boyfriend?.update(dt, t, camera);
    this.cat.update(dt, t);
  }
}
