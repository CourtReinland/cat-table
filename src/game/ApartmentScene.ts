import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import type { LevelDef } from '../data/content';
import { BreakableObject } from './Breakable';
import { Cat } from './Cat';

export class ApartmentScene {
  readonly scene = new THREE.Scene();
  readonly world = new CANNON.World({ gravity: new CANNON.Vec3(0, -14, 0) });
  readonly cat = new Cat();
  objects: BreakableObject[] = [];
  halfW = 2.5;
  halfD = 1.2;
  counterY = 1.05;
  floorY = 0;
  private keyLight!: THREE.PointLight;
  private fillLight!: THREE.PointLight;
  private rimLight!: THREE.PointLight;
  private bounceLight!: THREE.PointLight;
  private particles: THREE.Points | null = null;
  private particleVels: THREE.Vector3[] = [];
  private particleLife = 0;
  private clockPhase = 0;
  private envGroup = new THREE.Group();
  private godRays: THREE.Mesh[] = [];

  constructor() {
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    (this.world.solver as CANNON.GSSolver).iterations = 14;
    this.scene.fog = new THREE.FogExp2(0x12081c, 0.038);
    this.scene.add(this.envGroup);
  }

  loadLevel(level: LevelDef) {
    this.clearLevel();

    this.halfW = level.counterSize[0] / 2;
    this.halfD = level.counterSize[1] / 2;
    this.scene.fog = new THREE.FogExp2(level.fogColor, 0.042);
    this.scene.background = new THREE.Color(level.fogColor).multiplyScalar(0.55);

    this.buildLighting(level);
    this.buildRoom(level);
    this.buildCounter(level);
    this.spawnProps(level);

    this.cat.setPosition(-this.halfW * 0.55, this.counterY, 0);
    this.cat.facingYaw = 0;
    this.cat.attachPhysics(this.world, this.counterY);
    this.scene.add(this.cat.group);

    this.spawnAmbientMotes(level);
  }

  private buildLighting(level: LevelDef) {
    // Soft sky/ground ambient (fake GI)
    const hemi = new THREE.HemisphereLight(level.keyColor, level.ambientColor, 0.55);
    this.envGroup.add(hemi);

    const amb = new THREE.AmbientLight(level.ambientColor, 0.28);
    this.envGroup.add(amb);

    // Key — warm window (kept moderate to avoid blown highlights)
    this.keyLight = new THREE.PointLight(level.keyColor, 28, 20, 1.6);
    this.keyLight.position.set(-2.4, 3.5, 2.4);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.bias = -0.0015;
    this.keyLight.shadow.normalBias = 0.02;
    this.keyLight.shadow.radius = 2.5;
    this.envGroup.add(this.keyLight);

    // Fill — cool violet bounce
    this.fillLight = new THREE.PointLight(level.fillColor, 16, 15, 1.8);
    this.fillLight.position.set(2.8, 2.2, -1.2);
    this.envGroup.add(this.fillLight);

    // Rim / romance
    this.rimLight = new THREE.PointLight(0xff88cc, 10, 11, 2.0);
    this.rimLight.position.set(0.5, 1.6, 2.8);
    this.envGroup.add(this.rimLight);

    // Floor bounce (fake GI from counter)
    this.bounceLight = new THREE.PointLight(level.keyColor, 6, 5, 2.4);
    this.bounceLight.position.set(0, this.counterY + 0.05, 0);
    this.envGroup.add(this.bounceLight);

    // Directional moon/window
    const dir = new THREE.DirectionalLight(level.keyColor, 0.55);
    dir.position.set(-5, 6, 3);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 24;
    dir.shadow.camera.left = -8;
    dir.shadow.camera.right = 8;
    dir.shadow.camera.top = 8;
    dir.shadow.camera.bottom = -8;
    dir.shadow.bias = -0.001;
    dir.shadow.normalBias = 0.02;
    this.envGroup.add(dir);

    // Rect-area-ish window glow
    const windowGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 3.0),
      new THREE.MeshStandardMaterial({
        color: level.keyColor,
        emissive: level.keyColor,
        emissiveIntensity: 1.1,
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
      }),
    );
    windowGlow.position.set(-3.4, 3.1, -3.92);
    this.envGroup.add(windowGlow);

    // God-ray quads
    for (let i = 0; i < 3; i++) {
      const ray = new THREE.Mesh(
        new THREE.PlaneGeometry(0.55, 3.5),
        new THREE.MeshBasicMaterial({
          color: level.keyColor,
          transparent: true,
          opacity: 0.06,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        }),
      );
      ray.position.set(-2.6 + i * 0.35, 2.4, -1.5 + i * 0.4);
      ray.rotation.z = -0.35;
      ray.rotation.y = 0.4;
      this.godRays.push(ray);
      this.envGroup.add(ray);
    }
  }

  private buildRoom(level: LevelDef) {
    // Floor with subtle checker via vertex colors
    const floorGeo = new THREE.PlaneGeometry(28, 28, 20, 20);
    const colors = new Float32Array(floorGeo.attributes.position.count * 3);
    const cA = new THREE.Color(0x1a1218);
    const cB = new THREE.Color(0x221820);
    for (let i = 0; i < floorGeo.attributes.position.count; i++) {
      const x = floorGeo.attributes.position.getX(i);
      const z = floorGeo.attributes.position.getY(i); // before rotation
      const tile = (Math.floor(x) + Math.floor(z)) % 2 === 0;
      const c = tile ? cA : cB;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    floorGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const floor = new THREE.Mesh(
      floorGeo,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.45,
        metalness: 0.12,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.envGroup.add(floor);

    const floorBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(floorBody);

    // Walls with baseboards
    const wallMat = new THREE.MeshStandardMaterial({
      color: level.wallColor,
      roughness: 0.82,
      metalness: 0.04,
    });
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(22, 10), wallMat);
    wall.position.set(0, 4, -4);
    wall.receiveShadow = true;
    this.envGroup.add(wall);

    const wallL = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), wallMat);
    wallL.position.set(-7.5, 4, 0);
    wallL.rotation.y = Math.PI / 2;
    wallL.receiveShadow = true;
    this.envGroup.add(wallL);

    const wallR = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), wallMat);
    wallR.position.set(7.5, 4, 0);
    wallR.rotation.y = -Math.PI / 2;
    wallR.receiveShadow = true;
    this.envGroup.add(wallR);

    // Baseboard
    const boardMat = new THREE.MeshStandardMaterial({ color: 0x1a1014, roughness: 0.6 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(22, 0.12, 0.06), boardMat);
    board.position.set(0, 0.06, -3.97);
    this.envGroup.add(board);

    // Curtains
    const curtainMat = new THREE.MeshStandardMaterial({
      color: 0x4a3058,
      roughness: 0.9,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
    });
    for (const x of [-4.6, -2.1]) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 3.4), curtainMat);
      c.position.set(x, 2.9, -3.88);
      c.castShadow = true;
      this.envGroup.add(c);
    }

    // Couch with cushions
    const couchMat = new THREE.MeshStandardMaterial({ color: 0x2a1a28, roughness: 0.72 });
    const couch = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.55, 1.15), couchMat);
    couch.position.set(2.6, 0.35, -2.15);
    couch.castShadow = true;
    couch.receiveShadow = true;
    this.envGroup.add(couch);
    const couchBack = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.95, 0.28), couchMat);
    couchBack.position.set(2.6, 0.95, -2.6);
    couchBack.castShadow = true;
    this.envGroup.add(couchBack);
    // Armrests
    for (const dx of [-1.35, 1.35]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.55, 1.15), couchMat);
      arm.position.set(2.6 + dx, 0.55, -2.15);
      arm.castShadow = true;
      this.envGroup.add(arm);
    }

    // Boyfriend on couch — slightly better mannequin
    const boy = new THREE.Group();
    const boyMat = new THREE.MeshStandardMaterial({
      color: 0x3a2a40,
      roughness: 0.65,
      emissive: level.fillColor,
      emissiveIntensity: 0.06,
    });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.4, 6, 10), boyMat);
    torso.position.y = 0.95;
    torso.rotation.x = 0.35;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), boyMat);
    head.position.set(0, 1.35, 0.1);
    boy.add(torso, head);
    boy.position.set(2.6, 0.2, -2.25);
    this.envGroup.add(boy);

    // Side table + lamp glow in BG
    const table = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.38, 0.55, 16),
      new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.55 }),
    );
    table.position.set(4.3, 0.28, -1.8);
    table.castShadow = true;
    this.envGroup.add(table);
    const lampGlow = new THREE.PointLight(0xffb070, 8, 5, 2);
    lampGlow.position.set(4.3, 1.1, -1.8);
    this.envGroup.add(lampGlow);

    // Ceiling
    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(28, 28),
      new THREE.MeshStandardMaterial({ color: 0x120c16, roughness: 0.95 }),
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = 5.5;
    this.envGroup.add(ceil);
  }

  private buildCounter(level: LevelDef) {
    const counterH = 0.1;
    this.counterY = 1.08;

    // Thick wood / stone top with bevel feel (stacked boxes)
    const topMat = new THREE.MeshStandardMaterial({
      color: level.counterColor,
      roughness: level.surface === 'vanity' ? 0.22 : 0.48,
      metalness: level.surface === 'vanity' ? 0.4 : 0.08,
      envMapIntensity: 0.9,
    });
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(level.counterSize[0], counterH, level.counterSize[1]),
      topMat,
    );
    top.position.set(0, this.counterY - counterH / 2, 0);
    top.castShadow = true;
    top.receiveShadow = true;
    this.envGroup.add(top);

    // Edge lip
    const lip = new THREE.Mesh(
      new THREE.BoxGeometry(level.counterSize[0] + 0.06, 0.04, level.counterSize[1] + 0.06),
      new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.35, metalness: 0.25 }),
    );
    lip.position.set(0, this.counterY - counterH - 0.015, 0);
    this.envGroup.add(lip);

    // Cabinets with panel detail
    const cabMat = new THREE.MeshStandardMaterial({ color: 0x241820, roughness: 0.78 });
    const cabH = this.counterY - counterH - 0.02;
    const cabinet = new THREE.Mesh(
      new THREE.BoxGeometry(level.counterSize[0] * 0.94, cabH, level.counterSize[1] * 0.88),
      cabMat,
    );
    cabinet.position.set(0, cabH / 2, 0);
    cabinet.castShadow = true;
    cabinet.receiveShadow = true;
    this.envGroup.add(cabinet);

    // Cabinet door lines
    const lineMat = new THREE.MeshStandardMaterial({ color: 0x1a1014, roughness: 0.7 });
    for (let i = -1; i <= 1; i++) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.02, cabH * 0.7, 0.02), lineMat);
      line.position.set(i * level.counterSize[0] * 0.25, cabH * 0.5, level.counterSize[1] * 0.44);
      this.envGroup.add(line);
    }
    // Handles
    for (let i = -1; i <= 1; i += 2) {
      const h = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.02, 0.02),
        new THREE.MeshStandardMaterial({ color: 0xc0a878, metalness: 0.7, roughness: 0.3 }),
      );
      h.position.set(i * 0.35, cabH * 0.55, level.counterSize[1] * 0.45);
      this.envGroup.add(h);
    }

    // Physics counter
    const counterBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(
        new CANNON.Vec3(level.counterSize[0] / 2, counterH / 2, level.counterSize[1] / 2),
      ),
      position: new CANNON.Vec3(0, this.counterY - counterH / 2, 0),
      material: new CANNON.Material({ friction: 0.4, restitution: 0.04 }),
    });
    this.world.addBody(counterBody);
  }

  private spawnProps(level: LevelDef) {
    const kinds = [...level.props];
    const placed: THREE.Vector3[] = [];
    for (let i = 0; i < kinds.length; i++) {
      let pos = new THREE.Vector3();
      let tries = 0;
      do {
        pos = new THREE.Vector3(
          (Math.random() - 0.5) * (level.counterSize[0] - 0.9),
          this.counterY,
          (Math.random() - 0.5) * (level.counterSize[1] - 0.7),
        );
        tries++;
      } while (tries < 30 && placed.some((p) => p.distanceTo(pos) < 0.45));
      placed.push(pos.clone());
      // Keep cat spawn clear
      if (pos.x < -this.halfW * 0.4 && Math.abs(pos.z) < 0.35) {
        pos.x += 1.2;
      }
      this.objects.push(new BreakableObject(kinds[i], pos, this.world, this.scene));
    }
  }

  private spawnAmbientMotes(level: LevelDef) {
    const count = 120;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const c1 = new THREE.Color(level.keyColor);
    const c2 = new THREE.Color(level.fillColor);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 12;
      positions[i * 3 + 1] = Math.random() * 5.2;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 10;
      const c = c1.clone().lerp(c2, Math.random());
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const pts = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.035,
        vertexColors: true,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    pts.name = 'motes';
    this.envGroup.add(pts);
  }

  spawnShatterBurst(pos: THREE.Vector3, color: number) {
    const count = 48;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const c = new THREE.Color(color);
    this.particleVels = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      this.particleVels.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * 6,
          Math.random() * 5,
          (Math.random() - 0.5) * 6,
        ),
      );
    }
    if (this.particles) {
      this.scene.remove(this.particles);
      this.particles.geometry.dispose();
      (this.particles.material as THREE.Material).dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.particles = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.08,
        vertexColors: true,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(this.particles);
    this.particleLife = 1.0;
  }

  clearLevel() {
    this.cat.detachPhysics();
    for (const o of this.objects) o.dispose();
    this.objects = [];
    this.scene.remove(this.cat.group);

    const bodies = [...this.world.bodies];
    for (const b of bodies) this.world.removeBody(b);

    while (this.envGroup.children.length) {
      const c = this.envGroup.children[0];
      this.envGroup.remove(c);
      if (c instanceof THREE.Mesh || c instanceof THREE.Points) {
        c.geometry?.dispose();
        const m = c.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m?.dispose();
      }
    }
    this.godRays = [];

    if (this.particles) {
      this.scene.remove(this.particles);
      this.particles = null;
    }
  }

  update(
    dt: number,
    input: { x: number; z: number },
    wantSwat: boolean,
  ): {
    breaks: { kind: string }[];
    swatResult: 'miss' | 'locked' | 'unlocked' | 'pushed' | null;
    didSwat: boolean;
  } {
    this.clockPhase += dt;
    this.world.step(1 / 60, dt, 5);

    let didSwat = false;
    if (wantSwat) {
      didSwat = this.cat.trySwat();
    }

    const swatEvent = this.cat.update(
      dt,
      input,
      { halfW: this.halfW, halfD: this.halfD },
      this.counterY,
    );

    let swatResult: 'miss' | 'locked' | 'unlocked' | 'pushed' | null = null;
    if (swatEvent) {
      // Hit nearest object in cone
      let best: BreakableObject | null = null;
      let bestScore = Infinity;
      for (const obj of this.objects) {
        if (obj.broken) continue;
        const op = new THREE.Vector3(obj.body.position.x, swatEvent.origin.y, obj.body.position.z);
        const to = op.clone().sub(swatEvent.origin);
        const dist = to.length();
        if (dist > 1.0) continue;
        if (dist > 0.001) to.normalize();
        const align = to.dot(swatEvent.direction);
        // Allow wide cone + pure proximity hits
        if (align < -0.2 && dist > 0.45) continue;
        const score = dist - Math.max(0, align) * 0.4;
        if (score < bestScore) {
          bestScore = score;
          best = obj;
        }
      }
      if (best) {
        swatResult = best.applySwat(swatEvent.origin, swatEvent.direction, swatEvent.swatImpulse);
      } else {
        swatResult = 'miss';
      }
    }

    const catPos = this.cat.group.position;
    for (const obj of this.objects) {
      if (obj.broken) {
        obj.updateShards(dt);
        continue;
      }
      obj.applySoftPush(catPos, this.cat.velocity, 2.4);
      // Edge drama — once past the lip, yank off for satisfying falls
      const p = obj.body.position;
      const edgeX = this.halfW - 0.18;
      const edgeZ = this.halfD - 0.18;
      if (obj.body.type === CANNON.Body.DYNAMIC && (Math.abs(p.x) > edgeX || Math.abs(p.z) > edgeZ)) {
        obj.body.wakeUp();
        const ox = Math.sign(p.x) * (Math.abs(p.x) > edgeX ? 5.5 : 0);
        const oz = Math.sign(p.z) * (Math.abs(p.z) > edgeZ ? 5.5 : 0);
        obj.body.velocity.x += ox * dt * 14;
        obj.body.velocity.z += oz * dt * 14;
        obj.body.velocity.y -= 8 * dt;
      }
      obj.syncFromPhysics();
    }

    // Lights breathe
    if (this.keyLight) {
      this.keyLight.intensity = 26 + Math.sin(this.clockPhase * 1.2) * 3;
      this.rimLight.intensity = 9 + Math.sin(this.clockPhase * 2.0) * 2;
      this.bounceLight.intensity = 5 + Math.sin(this.clockPhase * 0.8) * 1.2;
      this.bounceLight.position.set(catPos.x * 0.3, this.counterY + 0.08, catPos.z * 0.3);
    }
    for (const ray of this.godRays) {
      const m = ray.material as THREE.MeshBasicMaterial;
      m.opacity = 0.04 + Math.sin(this.clockPhase * 1.5 + ray.position.x) * 0.025;
    }

    // Motes
    const motes = this.envGroup.getObjectByName('motes') as THREE.Points | undefined;
    if (motes) {
      const pos = motes.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) + dt * 0.12;
        if (y > 5.2) y = 0;
        pos.setY(i, y);
        pos.setX(i, pos.getX(i) + Math.sin(this.clockPhase + i) * dt * 0.04);
      }
      pos.needsUpdate = true;
    }

    if (this.particles && this.particleLife > 0) {
      this.particleLife -= dt;
      const pos = this.particles.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < this.particleVels.length; i++) {
        const v = this.particleVels[i];
        v.y -= 9 * dt;
        pos.setX(i, pos.getX(i) + v.x * dt);
        pos.setY(i, pos.getY(i) + v.y * dt);
        pos.setZ(i, pos.getZ(i) + v.z * dt);
      }
      pos.needsUpdate = true;
      (this.particles.material as THREE.PointsMaterial).opacity = Math.max(
        0,
        this.particleLife / 1.0,
      );
    }

    const breaks: { kind: string }[] = [];
    for (const obj of this.objects) {
      if (!obj.broken && obj.shouldBreak(this.floorY)) {
        const ev = obj.breakApart();
        this.spawnShatterBurst(ev.position, ev.color);
        breaks.push({ kind: ev.kind });
      }
    }

    return { breaks, swatResult, didSwat };
  }

  get brokenCount() {
    return this.objects.filter((o) => o.broken).length;
  }

  get totalCount() {
    return this.objects.length;
  }

  get allBroken() {
    return this.objects.length > 0 && this.objects.every((o) => o.broken);
  }
}
