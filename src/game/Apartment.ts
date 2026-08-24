import * as THREE from 'three/webgpu';
import { roomMat, buildProp } from './Props';
import { Suki } from './Suki';
import { Boyfriend } from './BoyGlb';
import { Body, Physics, type SurfaceRect } from './Physics';
import { PROP_LIBRARY, getBoyfriend, type LevelDef, type PropKind } from '../data/content';
import { toonify } from './Toon';
import {
  marbleSurface,
  plasterSurface,
  fabricSurface,
  rugSurface,
  panelSurface,
  surfaceMat,
} from './Textures';
import { EMISSIVE, MATTE, NIGHT_AMBIENT, NIGHT_FILL_POS, NIGHT_KEY_CONE, NIGHT_KEY_POS, NIGHT_KEY_TARGET, NIGHT_RIG, levelMood } from './roomLook';

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
  return canvasTex(512, 512, (ctx) => {
    ctx.fillStyle = '#241811';
    ctx.fillRect(0, 0, 512, 512);
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 4; c++) {
        const l = 12 + Math.random() * 10;
        ctx.fillStyle = `hsl(${22 + Math.random() * 8}, ${28 + Math.random() * 12}%, ${l}%)`;
        const off = r % 2 ? 64 : 0;
        ctx.fillRect(c * 128 + off + 1, r * 64 + 1, 126, 62);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        for (let g = 0; g < 4; g++) {
          const y = r * 64 + Math.random() * 64;
          ctx.fillRect(c * 128 + off + 1, y, 126, 1);
        }
      }
    }
    // grit / scuffs so the floor reads dusty, not a flat fill
    ctx.fillStyle = 'rgba(52, 42, 36, 0.28)';
    for (let i = 0; i < 420; i++) {
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 1 + (Math.random() > 0.85 ? 2 : 0), 1);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    for (let i = 0; i < 18; i++) {
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 40 + Math.random() * 80, 1);
    }
  });
}

function cityTex(skyColor: number) {
  const sky = new THREE.Color(skyColor);
  return canvasTex(512, 384, (ctx) => {
    const top = sky.clone();
    const bot = sky.clone().lerp(new THREE.Color(0x2a1848), 0.32);
    const grad = ctx.createLinearGradient(0, 0, 0, 384);
    grad.addColorStop(0, `#${top.getHexString()}`);
    grad.addColorStop(1, `#${bot.getHexString()}`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 384);
    // distant buildings — silhouettes, not a glowing skybox
    for (let i = 0; i < 16; i++) {
      const bw = 28 + Math.random() * 58;
      const bh = 70 + Math.random() * 160;
      const x = Math.random() * 512;
      ctx.fillStyle = `rgba(6, 4, 14, ${0.72 + Math.random() * 0.26})`;
      ctx.fillRect(x, 384 - bh, bw, bh);
    }
    // city practicals: readable punctures, not bloom bokeh soup
    for (let i = 0; i < 110; i++) {
      const warm = Math.random() < 0.62;
      ctx.fillStyle = warm ? 'rgba(255, 196, 130, 0.82)' : 'rgba(186, 176, 220, 0.55)';
      ctx.shadowColor = warm ? '#ffc282' : '#b0a8dc';
      ctx.shadowBlur = 2 + Math.random() * 5;
      const r = 0.6 + Math.random() * 1.7;
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
          ctx.fillStyle = Math.random() < 0.7 ? 'rgba(255, 190, 120, 0.7)' : 'rgba(170, 160, 210, 0.45)';
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
    g.addColorStop(0, `hsl(${hue}, 45%, 18%)`);
    g.addColorStop(1, `hsl(${(hue + 40) % 360}, 55%, 8%)`);
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
    const wallMat = surfaceMat(plasterSurface(0x241a30), [5, 1.6]);
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

    // window (back wall, right side) — frame + city view + sill
    const winG = new THREE.Group();
    winG.position.set(2.9, 2.05, -3.38);
    this.cityMat = new THREE.MeshBasicNodeMaterial({ map: cityTex(0x1a1030) });
    const view = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.9), this.cityMat);
    view.position.z = -0.15;
    winG.add(view);
    const frameMat = roomMat(0x141018, { rough: 0.6 });
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
    const couchMat = surfaceMat(fabricSurface(0x5a3a52), [3, 1.2]);
    const seatMat = surfaceMat(fabricSurface(0x6b4662), [2, 1.4]);
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
      surfaceMat(rugSurface(0x2e1c2e, 0x53384e)),
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(-1.2, 0.005, -0.9);
    rug.receiveShadow = true;
    g.add(rug);

    // floor lamp (right side)
    const lampG = new THREE.Group();
    lampG.position.set(3.6, 0, -1.4);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.05, 1.65, 8), roomMat(0x2a2422, { metal: 0.6, rough: 0.4 }));
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
    const shelfMat = roomMat(0x1e1618, { rough: 0.9 });
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
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.8 + Math.random() * 0.5, 6), roomMat(0x2a4a2e, { rough: 0.95 }));
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
    this.scene.fog = new THREE.FogExp2(0x0e0818, NIGHT_RIG.fogDensity);
    this.scene.background = new THREE.Color(0x070410);
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
    for (const i of [1, 2, 3]) {
      const wall = this.roomGroup.children[i] as THREE.Mesh;
      wall.material = wallPlaster;
      toonify(wall);
    }
    this.scene.fog = new THREE.FogExp2(level.fogColor, NIGHT_RIG.fogDensity);
    this.scene.background = new THREE.Color(level.fogColor).multiplyScalar(0.55);
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

    // boyfriend on the couch
    const def = getBoyfriend(level.boyfriendId);
    this.boyfriend = new Boyfriend(def);
    this.boyfriend.group.position.set(this.couchPos.x + 0.35, 0, this.couchPos.z + 0.3);
    this.boyfriend.group.rotation.y = 0.35;
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
    const bodyHex = new THREE.Color(level.counterColor).multiplyScalar(0.48).getHex();
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
        const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.2, 6), roomMat(0x141014, { rough: 0.7 }));
        cord.position.set(0, 3.4, cz);
        const shade = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.24, 16, 1, true), roomMat(0x2a2a32, { rough: 0.7, metal: 0.18, emissive: level.lampColor, emissiveIntensity: EMISSIVE.shade }));
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
        // two chairs
        for (const x of [-0.8, 0.8]) {
          const chair = new THREE.Group();
          chair.position.set(x, 0, cz - d / 2 - 0.55);
          const seat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 0.42), bodyMat);
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
    const darkWood = roomMat(0x2e211c, { rough: 0.8 });
    const midWood = roomMat(0x4a3428, { rough: 0.75 });
    const fabric = roomMat(0x5a4a5e, { rough: 0.95 });

    switch (level.surface) {
      case 'kitchen': {
        // hanging pot rack over the island (in frame) + bar stools in the foreground
        const rackMat = roomMat(0x2a2622, { metal: 0.6, rough: 0.4 });
        const panMat = roomMat(0x3a3a40, { metal: 0.7, rough: 0.35 });
        box(1.3, 0.03, 0.5, rackMat, -0.6, 2.15, 0.3);
        for (const [cx, cz2] of [[-1.15, 0.05], [-1.15, 0.55], [-0.05, 0.05], [-0.05, 0.55]] as const) {
          cyl(0.006, 1.3, rackMat, cx, 2.8, cz2, 6);
        }
        for (let i = 0; i < 3; i++) {
          const pan = cyl(0.13 - i * 0.02, 0.035, panMat, -1.05 + i * 0.42, 2.02, 0.3);
          pan.scale.y = 1;
          const handle = box(0.03, 0.02, 0.16, panMat, -1.05 + i * 0.42, 2.02, 0.45);
          handle.castShadow = false;
        }
        // bar stools
        for (const sx of [-0.9, 0.15]) {
          cyl(0.19, 0.07, roomMat(0x6a4a3a, { rough: 0.6 }), sx, 0.62, 1.55);
          cyl(0.03, 0.6, roomMat(0x2a2622, { metal: 0.6, rough: 0.4 }), sx, 0.3, 1.55);
          cyl(0.14, 0.03, roomMat(0x2a2622, { metal: 0.6, rough: 0.4 }), sx, 0.02, 1.55);
        }
        // herb pots on the window sill (visible near window)
        for (let i = 0; i < 2; i++) {
          cyl(0.07, 0.09, roomMat(0xb0684a, { rough: 0.8 }), 2.1 + i * 0.35, 1.04, -3.25);
          const herb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), roomMat(0x5c9a5e, { rough: 0.9 }));
          herb.position.set(2.1 + i * 0.35, 1.14, -3.25);
          herb.scale.y = 1.4;
          lg.add(herb);
        }
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
        break;
      }
      case 'desk': {
        // rolling office chair behind the desk + shelf of art books + corkboard
        const chairMat = roomMat(0x2a2e38, { rough: 0.7 });
        box(0.5, 0.08, 0.48, chairMat, 0.6, 0.5, -1.15, 0.4);
        box(0.5, 0.6, 0.08, chairMat, 0.68, 0.85, -1.42, 0.4);
        cyl(0.03, 0.45, roomMat(0x4a4e58, { metal: 0.6, rough: 0.3 }), 0.6, 0.25, -1.15);
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
        // vanity stool
        cyl(0.2, 0.08, fabric, 0.95, 0.42, 1.35);
        cyl(0.03, 0.4, darkWood, 0.95, 0.2, 1.35);
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
      visual.group.position.set(x, this.surface.topY, z);
      visual.group.rotation.y = Math.random() * Math.PI * 2;
      lg.add(visual.group);

      const body = new Body(visual.group, def.shatter, visual.halfHeight, visual.radiusXZ, def.points, {
        mass: def.mass,
        immovable: !!def.immovable,
      });
      // subtle tint so immovable anchors read as "won't budge"
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
