import * as THREE from 'three/webgpu';
import { stdMat, buildProp } from './Props';
import { Suki } from './Suki';
import { Boyfriend } from './BoyGlb';
import { Body, Physics, type SurfaceRect } from './Physics';
import { PROP_LIBRARY, getBoyfriend, type LevelDef, type PropKind } from '../data/content';

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
  grad.addColorStop(0, 'rgba(190, 205, 255, 0.55)');
  grad.addColorStop(0.6, 'rgba(160, 175, 235, 0.16)');
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
  });
}

function cityTex(skyColor: number) {
  const sky = new THREE.Color(skyColor);
  return canvasTex(512, 384, (ctx) => {
    const grad = ctx.createLinearGradient(0, 0, 0, 384);
    grad.addColorStop(0, `#${sky.clone().multiplyScalar(1.1).getHexString()}`);
    grad.addColorStop(1, `#${sky.clone().multiplyScalar(2.6).getHexString()}`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 384);
    // distant buildings
    for (let i = 0; i < 14; i++) {
      const bw = 30 + Math.random() * 60;
      const bh = 60 + Math.random() * 150;
      const x = Math.random() * 512;
      ctx.fillStyle = `rgba(10, 8, 20, ${0.5 + Math.random() * 0.4})`;
      ctx.fillRect(x, 384 - bh, bw, bh);
    }
    // bokeh lights
    for (let i = 0; i < 170; i++) {
      const warm = Math.random() < 0.65;
      ctx.fillStyle = warm ? 'rgba(255, 205, 140, 0.9)' : 'rgba(160, 200, 255, 0.8)';
      ctx.shadowColor = warm ? '#ffcd8c' : '#a0c8ff';
      ctx.shadowBlur = 8 + Math.random() * 14;
      const r = 1.4 + Math.random() * 3.6;
      ctx.beginPath();
      ctx.arc(Math.random() * 512, 190 + Math.random() * 194, r, 0, 7);
      ctx.fill();
    }
    // moon with halo
    ctx.shadowColor = '#fff4d8';
    ctx.shadowBlur = 60;
    ctx.fillStyle = '#fff8e8';
    ctx.beginPath();
    ctx.arc(400, 76, 30, 0, 7);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(230, 220, 200, 0.5)';
    ctx.beginPath();
    ctx.arc(390, 70, 6, 0, 7);
    ctx.arc(408, 84, 4, 0, 7);
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

function counterTex(colorHex: number) {
  const base = new THREE.Color(colorHex);
  return canvasTex(256, 256, (ctx) => {
    ctx.fillStyle = `#${base.getHexString()}`;
    ctx.fillRect(0, 0, 256, 256);
    // subtle stone veins
    for (let i = 0; i < 14; i++) {
      ctx.strokeStyle = `rgba(${base.r * 255 * (Math.random() < 0.5 ? 0.7 : 1.25)}, ${base.g * 255 * 0.85}, ${base.b * 255 * 0.9}, 0.16)`;
      ctx.lineWidth = 0.6 + Math.random() * 1.6;
      ctx.beginPath();
      let x = Math.random() * 256;
      let y = Math.random() * 256;
      ctx.moveTo(x, y);
      for (let s = 0; s < 5; s++) {
        x += (Math.random() - 0.5) * 90;
        y += (Math.random() - 0.5) * 90;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // speckle
    for (let i = 0; i < 500; i++) {
      const l = Math.random();
      ctx.fillStyle = `rgba(${l > 0.5 ? 255 : 0}, ${l > 0.5 ? 255 : 0}, ${l > 0.5 ? 255 : 0}, 0.03)`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 1.2, 1.2);
    }
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
      new THREE.MeshStandardNodeMaterial({ map: floorTex, roughness: 0.6, metalness: 0.05 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 0.5);
    floor.receiveShadow = true;
    g.add(floor);

    // walls
    const wallMat = stdMat(0x241a30, { rough: 0.95 });
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
    const frameMat = stdMat(0x141018, { rough: 0.6 });
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
      opacity: 0.34,
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
      stdMat(0xd8cce0, { rough: 0.9, transparent: true, opacity: 0.16 }),
    );
    curtain.position.set(1.35, 2.0, -3.2);
    g.add(curtain);

    // couch
    const couchG = new THREE.Group();
    couchG.position.copy(this.couchPos);
    const couchMat = stdMat(0x5a3a52, { rough: 0.95 });
    const seatMat = stdMat(0x6b4662, { roughness: 0.95 } as any);
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
    const throwPillow = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.1), stdMat(0xd8a878, { rough: 0.9 }));
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
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.9, 28), stdMat(0x3a2438, { rough: 1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(-1.2, 0.005, -0.9);
    rug.receiveShadow = true;
    g.add(rug);

    // floor lamp (right side)
    const lampG = new THREE.Group();
    lampG.position.set(3.6, 0, -1.4);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.05, 1.65, 8), stdMat(0x2a2422, { metal: 0.6, rough: 0.4 }));
    pole.position.y = 0.82;
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.3, 14, 1, true), stdMat(0xf5e0b8, { rough: 0.8, emissive: 0xffb46a, emissiveIntensity: 0.55 }));
    shade.position.y = 1.7;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), stdMat(0xffe2b0, { emissive: 0xffc87a, emissiveIntensity: 5, rough: 0.3 }));
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
      const mat = new THREE.MeshStandardNodeMaterial({ color: 0xffd9a0, emissive: 0xffc06a, emissiveIntensity: 2.6, roughness: 0.4 });
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
    const shelfMat = stdMat(0x1e1618, { rough: 0.9 });
    for (let i = 0; i < 3; i++) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.3), shelfMat);
      board.position.set(0, 0.6 + i * 0.5, 0);
      shelf.add(board);
      for (let b = 0; b < 6; b++) {
        const book = new THREE.Mesh(
          new THREE.BoxGeometry(0.05 + Math.random() * 0.05, 0.24 + Math.random() * 0.1, 0.18),
          stdMat([0x4a2c2c, 0x2c3c4a, 0x4a3c2c, 0x342c44][b % 4], { rough: 0.9 }),
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
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.34, 10), stdMat(0x4a3430, { rough: 0.9 }));
    pot.position.y = 0.17;
    plantG.add(pot);
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.8 + Math.random() * 0.5, 6), stdMat(0x2a4a2e, { rough: 0.95 }));
      leaf.position.set((Math.random() - 0.5) * 0.25, 0.7 + Math.random() * 0.3, (Math.random() - 0.5) * 0.25);
      leaf.rotation.z = (Math.random() - 0.5) * 0.7;
      plantG.add(leaf);
    }
    g.add(plantG);

    // ── lighting rig ──
    this.hemi = new THREE.HemisphereLight(0x3a2c58, 0x181018, 0.85);
    g.add(this.hemi);

    this.moon = new THREE.DirectionalLight(0x8fb0ff, 1.6);
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

    this.key = new THREE.SpotLight(0xffd4a8, 64, 13, 0.68, 0.55, 1.6);
    this.key.position.set(0.6, 3.6, 1.6);
    this.key.target.position.set(0, 1, 0.3);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.bias = -0.0015;
    g.add(this.key, this.key.target);

    this.lamp = new THREE.PointLight(0xffb46a, 24, 8, 1.7);
    this.lamp.position.set(3.6, 1.62, -1.4);
    g.add(this.lamp);

    this.fill = new THREE.PointLight(0x8b6cff, 13, 11, 1.7);
    this.fill.position.set(-2.5, 1.6, 2.4);
    g.add(this.fill);

    this.scene.add(g);
    this.scene.fog = new THREE.FogExp2(0x0e0818, 0.045);
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
    (this.roomGroup.children[1] as THREE.Mesh).material = stdMat(level.wallColor, { rough: 0.95 });
    this.scene.fog = new THREE.FogExp2(level.fogColor, 0.045);
    this.scene.background = new THREE.Color(level.fogColor).multiplyScalar(0.55);
    this.hemi.color.setHex(level.fillColor).multiplyScalar(0.55);
    this.hemi.intensity = 0.8;
    this.key.color.setHex(level.keyColor);
    this.key.target.position.set(0, topY, cz);
    this.lamp.color.setHex(level.lampColor);
    this.fill.color.setHex(level.fillColor);
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
  }

  private buildFurniture(lg: THREE.Group, level: LevelDef, w: number, d: number, topY: number, cz: number) {
    const topMat = new THREE.MeshStandardNodeMaterial({ map: counterTex(level.counterColor), roughness: 0.5 });
    const bodyMat = stdMat(new THREE.Color(level.counterColor).multiplyScalar(0.55).getHex(), { rough: 0.8 });

    const slab = (ww: number, dd: number) => {
      const top = new THREE.Mesh(new THREE.BoxGeometry(ww, 0.06, dd), topMat);
      top.position.set(0, topY - 0.03, cz);
      top.castShadow = true;
      top.receiveShadow = true;
      lg.add(top);
    };

    switch (level.surface) {
      case 'kitchen': {
        slab(w, d);
        const cab = new THREE.Mesh(new THREE.BoxGeometry(w - 0.25, topY - 0.1, d - 0.25), bodyMat);
        cab.position.set(0, (topY - 0.1) / 2, cz);
        cab.castShadow = true;
        lg.add(cab);
        // pendant lamp above
        const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.2, 6), stdMat(0x141014, { rough: 0.7 }));
        cord.position.set(0, 3.4, cz);
        const shade = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.24, 16, 1, true), stdMat(0x2a2a32, { rough: 0.4, metal: 0.6, emissive: level.lampColor, emissiveIntensity: 0.25 }));
        shade.position.set(0, 2.75, cz);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), stdMat(0xffe2b0, { emissive: level.lampColor, emissiveIntensity: 6 }));
        bulb.position.set(0, 2.68, cz);
        lg.add(cord, shade, bulb);
        const pendant = new THREE.PointLight(level.lampColor, 16, 5.5, 1.8);
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
        const bezel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.3, 0.06), stdMat(0x0a0a0e, { rough: 0.3 }));
        this.tvScreen = new THREE.Mesh(
          new THREE.PlaneGeometry(2.05, 1.15),
          stdMat(0x0c1420, { emissive: 0x4a7ab8, emissiveIntensity: 1.6, rough: 0.2 }),
        );
        this.tvScreen.position.z = 0.035;
        tvG.add(bezel, this.tvScreen);
        lg.add(tvG);
        const tvGlow = new THREE.PointLight(0x4a7ab8, 7, 8, 2);
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
        const mon = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.38), stdMat(0x0a1020, { emissive: 0x6ab0e8, emissiveIntensity: 1.1, rough: 0.2 }));
        mon.position.set(-w / 2 + 0.5, topY + 0.36, cz - d / 2 + 0.28);
        mon.rotation.y = 0.35;
        lg.add(mon);
        const monBack = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.4, 0.03), stdMat(0x1a1a20, { rough: 0.4, metal: 0.5 }));
        monBack.position.set(-w / 2 + 0.5, topY + 0.36, cz - d / 2 + 0.26);
        monBack.rotation.y = 0.35;
        lg.add(monBack);
        const monStand = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.05, 0.22, 8), stdMat(0x1a1a20, { rough: 0.4, metal: 0.5 }));
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
          const drawer = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, 0.22, 0.03), stdMat(level.counterColor, { rough: 0.6 }));
          drawer.position.set(0, 0.25 + r * 0.3, cz + (d - 0.15) / 2 + 0.005);
          lg.add(drawer);
          const knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), stdMat(0xd8b25a, { metal: 0.85, rough: 0.25 }));
          knob.position.set(0, 0.25 + r * 0.3, cz + (d - 0.15) / 2 + 0.03);
          lg.add(knob);
        }
        // mirror with vanity bulbs
        const mirror = new THREE.Mesh(
          new THREE.PlaneGeometry(1.3, 1.0),
          stdMat(0x9ab0c0, { rough: 0.08, metal: 0.85, emissive: 0x2a3c4c, emissiveIntensity: 0.5 }),
        );
        mirror.position.set(0, topY + 0.85, cz - d / 2 + 0.02);
        lg.add(mirror);
        const mFrame = new THREE.Mesh(new THREE.BoxGeometry(1.44, 1.14, 0.04), stdMat(0x6a4a3a, { rough: 0.5 }));
        mFrame.position.set(0, topY + 0.85, cz - d / 2 - 0.01);
        lg.add(mFrame);
        const bulbGeo = new THREE.SphereGeometry(0.025, 8, 6);
        for (let i = 0; i < 8; i++) {
          const side = i < 4 ? -1 : 1;
          const b = new THREE.Mesh(bulbGeo, stdMat(0xffe8c8, { emissive: 0xffd9a8, emissiveIntensity: 3.4 }));
          b.position.set(side * 0.78, topY + 0.42 + (i % 4) * 0.28, cz - d / 2 + 0.02);
          lg.add(b);
        }
        break;
      }
      case 'dining': {
        slab(w, d);
        // tablecloth drop
        const cloth = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, topY - 0.15, d - 0.3), stdMat(0x6a2030, { rough: 0.95 }));
        cloth.position.set(0, (topY - 0.12) / 2, cz);
        cloth.castShadow = true;
        lg.add(cloth);
        // chandelier
        const chG = new THREE.Group();
        chG.position.set(0, 2.9, cz);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.025, 8, 24), stdMat(0xd8b25a, { metal: 0.85, rough: 0.3 }));
        ring.rotation.x = Math.PI / 2;
        chG.add(ring);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 6), stdMat(0xf5e6c8, { rough: 0.6 }));
          candle.position.set(Math.cos(a) * 0.4, 0.06, Math.sin(a) * 0.4);
          const fl = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.045, 8), stdMat(0xffc46a, { emissive: 0xffa030, emissiveIntensity: 3.4 }));
          fl.position.set(Math.cos(a) * 0.4, 0.15, Math.sin(a) * 0.4);
          fl.name = 'flame';
          this.flames.push(fl);
          chG.add(candle, fl);
        }
        const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.0, 6), stdMat(0x8a6a2a, { metal: 0.7, rough: 0.4 }));
        chain.position.y = 0.55;
        chG.add(chain);
        lg.add(chG);
        const chLight = new THREE.PointLight(level.lampColor, 18, 6, 1.8);
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
    const darkWood = stdMat(0x2e211c, { rough: 0.8 });
    const midWood = stdMat(0x4a3428, { rough: 0.75 });
    const fabric = stdMat(0x5a4a5e, { rough: 0.95 });

    switch (level.surface) {
      case 'kitchen': {
        // hanging pot rack over the island (in frame) + bar stools in the foreground
        const rackMat = stdMat(0x2a2622, { metal: 0.6, rough: 0.4 });
        const panMat = stdMat(0x3a3a40, { metal: 0.7, rough: 0.35 });
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
          cyl(0.19, 0.07, stdMat(0x6a4a3a, { rough: 0.6 }), sx, 0.62, 1.55);
          cyl(0.03, 0.6, stdMat(0x2a2622, { metal: 0.6, rough: 0.4 }), sx, 0.3, 1.55);
          cyl(0.14, 0.03, stdMat(0x2a2622, { metal: 0.6, rough: 0.4 }), sx, 0.02, 1.55);
        }
        // herb pots on the window sill (visible near window)
        for (let i = 0; i < 2; i++) {
          cyl(0.07, 0.09, stdMat(0xb0684a, { rough: 0.8 }), 2.1 + i * 0.35, 1.04, -3.25);
          const herb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), stdMat(0x5c9a5e, { rough: 0.9 }));
          herb.position.set(2.1 + i * 0.35, 1.14, -3.25);
          herb.scale.y = 1.4;
          lg.add(herb);
        }
        break;
      }
      case 'coffee': {
        // media console under the TV + floor cushions + magazine stack
        box(1.8, 0.45, 0.45, darkWood, 6.55, 0.23, 0.4);
        box(0.5, 0.04, 0.3, stdMat(0x1a1a20, { rough: 0.3, metal: 0.4 }), 6.55, 0.48, 0.4);
        // console glow
        const led = box(0.06, 0.02, 0.02, stdMat(0xff3a3a, { emissive: 0xff2a2a, emissiveIntensity: 3 }), 6.35, 0.35, 0.63);
        led.castShadow = false;
        // floor cushions
        box(0.55, 0.14, 0.55, fabric, -1.4, 0.07, 1.6, 0.3);
        box(0.5, 0.13, 0.5, stdMat(0x6b5a48, { rough: 0.95 }), 1.6, 0.065, 1.5, -0.2);
        // magazine stack on the rug
        for (let i = 0; i < 3; i++) {
          box(0.28, 0.015, 0.38, stdMat([0x8a4a5a, 0x4a6a8a, 0xc8b89a][i], { rough: 0.7 }), -1.9 + Math.random() * 0.04, 0.02 + i * 0.018, -0.6, Math.random() * 0.6 - 0.3);
        }
                // throw blanket draped over the couch arm
        box(0.34, 0.06, 0.6, stdMat(0xc84a5a, { rough: 1 }), -3.62, 0.78, -1.9, 0.2);
        box(0.06, 0.3, 0.6, stdMat(0xc84a5a, { rough: 1 }), -3.62, 0.6, -1.9, 0);
        // popcorn bowl on the rug (spilled a little)
        cyl(0.16, 0.1, stdMat(0xc84a5a, { rough: 0.6 }), -0.9, 0.05, -0.7);
        for (let i = 0; i < 6; i++) {
          const k = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), stdMat(0xf5e8c8, { rough: 0.8 }));
          k.position.set(-0.9 + (Math.random() - 0.5) * 0.5, 0.02, -0.7 + (Math.random() - 0.5) * 0.4);
          lg.add(k);
        }
        break;
      }
      case 'desk': {
        // rolling office chair behind the desk + shelf of art books + corkboard
        const chairMat = stdMat(0x2a2e38, { rough: 0.7 });
        box(0.5, 0.08, 0.48, chairMat, 0.6, 0.5, -1.15, 0.4);
        box(0.5, 0.6, 0.08, chairMat, 0.68, 0.85, -1.42, 0.4);
        cyl(0.03, 0.45, stdMat(0x4a4e58, { metal: 0.6, rough: 0.3 }), 0.6, 0.25, -1.15);
        // corkboard with pinned notes
        box(1.3, 0.9, 0.03, stdMat(0x9a7a5a, { rough: 0.9 }), 3.4, 2.2, -3.35);
        for (let i = 0; i < 6; i++) {
          box(0.16, 0.2, 0.005, stdMat([0xe8e0c8, 0xc8d8e8, 0xe8c8c8][i % 3], { rough: 0.95 }), 3.0 + (i % 3) * 0.4, 2.05 + Math.floor(i / 3) * 0.35, -3.33, (Math.random() - 0.5) * 0.2);
        }
        // flat files drawer
        box(0.6, 1.1, 0.5, darkWood, 2.6, 0.55, -3.0);
        // stack of sketchbooks
        for (let i = 0; i < 4; i++) {
          box(0.3, 0.03, 0.4, stdMat([0x3a3a44, 0x5a4a3a, 0x2a3a4a, 0x4a3a3a][i], { rough: 0.8 }), 2.6, 1.13 + i * 0.035, -3.0, (Math.random() - 0.5) * 0.3);
        }
        break;
      }
      case 'dresser': {
        // bed with headboard, pillows, blanket; wardrobe; laundry pile
        const bedFrame = stdMat(0x4a3428, { rough: 0.8 });
        const blanket = stdMat(0x7a4a5e, { rough: 0.95 });
        box(2.2, 0.35, 1.6, bedFrame, -4.6, 0.18, -1.2);
        box(2.2, 1.1, 0.12, bedFrame, -4.6, 0.9, -2.05);
        box(2.1, 0.22, 1.5, stdMat(0xe8dcd0, { rough: 0.95 }), -4.6, 0.46, -1.2);
        box(2.1, 0.14, 0.9, blanket, -4.6, 0.52, -0.85);
        box(0.55, 0.16, 0.35, stdMat(0xf5efe4, { rough: 0.95 }), -5.1, 0.6, -1.75, 0.15);
        box(0.55, 0.16, 0.35, stdMat(0xf5efe4, { rough: 0.95 }), -4.4, 0.6, -1.72, -0.1);
        // wardrobe
        box(1.1, 2.1, 0.6, darkWood, -6.5, 1.05, -3.0);
        cyl(0.02, 0.15, stdMat(0xd8b25a, { metal: 0.8, rough: 0.25 }), -6.15, 1.05, -2.68);
        // laundry pile
        for (let i = 0; i < 4; i++) {
          const cloth = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), stdMat([0x8a9ab8, 0xb88a9a, 0x9ab88a, 0xd8d0c0][i], { rough: 1 }));
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
          const b = cyl(0.05, 0.3, stdMat(0x2a4a2a, { rough: 0.15 }), -5.2 + i * 0.22, 1.06, -3.05);
          b.scale.y = 1;
          cyl(0.015, 0.08, stdMat(0xc8a878, { rough: 0.8 }), -5.2 + i * 0.22, 1.25, -3.05);
        }
        // decanter
        cyl(0.09, 0.16, stdMat(0x6a1630, { rough: 0.1, transparent: true, opacity: 0.7 }), -4.2, 0.99, -3.05);
        // curtains on both sides of the window
        for (const x of [1.35, 4.45]) {
          const curtain = box(0.5, 2.6, 0.15, stdMat(0x5a2030, { rough: 1 }), x, 2.0, -3.25);
          curtain.castShadow = false;
        }
        // wall frames
        for (let i = 0; i < 2; i++) {
          box(0.5, 0.65, 0.03, darkWood, -0.8 + i * 0.7, 2.5, -3.37);
          box(0.42, 0.57, 0.02, stdMat(0x8a6a4a, { rough: 0.6, emissive: 0x3a2a1a, emissiveIntensity: 0.3 }), -0.8 + i * 0.7, 2.5, -3.36);
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

      const body = new Body(visual.group, def.shatter, visual.halfHeight, visual.radiusXZ, def.points);
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
      this.stringMats[i].emissiveIntensity = 2.4 + Math.sin(t * 1.8 + i * 1.3) * 0.5;
    }
    // tv flicker
    if (this.tvScreen) {
      const m = this.tvScreen.material as any;
      m.emissiveIntensity = 1.3 + Math.abs(Math.sin(t * 2.3) * Math.sin(t * 5.7)) * 1.1;
    }
    this.boyfriend?.update(dt, t, camera);
    this.cat.update(dt, t);
  }
}
