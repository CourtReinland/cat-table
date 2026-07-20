import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import type { LevelDef } from '../data/content';
import { BreakableObject } from './Breakable';
import { Cat } from './Cat';

export class ApartmentScene {
  readonly scene = new THREE.Scene();
  readonly world = new CANNON.World({ gravity: new CANNON.Vec3(0, -12, 0) });
  readonly cat = new Cat();
  objects: BreakableObject[] = [];
  halfW = 2.5;
  halfD = 1.2;
  counterY = 1.05;
  floorY = 0;
  private counterMesh!: THREE.Mesh;
  private keyLight!: THREE.PointLight;
  private fillLight!: THREE.PointLight;
  private rimLight!: THREE.PointLight;
  private particles: THREE.Points | null = null;
  private particleVels: THREE.Vector3[] = [];
  private particleLife = 0;
  private clockPhase = 0;
  private envGroup = new THREE.Group();

  constructor() {
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    (this.world.solver as CANNON.GSSolver).iterations = 10;

    this.scene.fog = new THREE.FogExp2(0x12081c, 0.045);
    this.scene.add(this.envGroup);
  }

  loadLevel(level: LevelDef) {
    this.clearLevel();

    this.halfW = level.counterSize[0] / 2;
    this.halfD = level.counterSize[1] / 2;
    this.scene.fog = new THREE.FogExp2(level.fogColor, 0.05);
    this.scene.background = new THREE.Color(level.fogColor).multiplyScalar(0.6);

    // Ambient + beautiful mysterious lights
    const amb = new THREE.AmbientLight(level.ambientColor, 0.45);
    this.envGroup.add(amb);

    this.keyLight = new THREE.PointLight(level.keyColor, 40, 18, 1.6);
    this.keyLight.position.set(-1.5, 3.2, 2.5);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.bias = -0.002;
    this.envGroup.add(this.keyLight);

    this.fillLight = new THREE.PointLight(level.fillColor, 22, 14, 1.8);
    this.fillLight.position.set(2.5, 2.4, -1.5);
    this.envGroup.add(this.fillLight);

    this.rimLight = new THREE.PointLight(0xff88cc, 12, 10, 2);
    this.rimLight.position.set(0, 1.5, 3);
    this.envGroup.add(this.rimLight);

    // Window light shaft (rect area approximation)
    const windowLight = new THREE.DirectionalLight(level.keyColor, 0.8);
    windowLight.position.set(-4, 5, 2);
    windowLight.castShadow = true;
    windowLight.shadow.mapSize.set(1024, 1024);
    windowLight.shadow.camera.near = 0.5;
    windowLight.shadow.camera.far = 20;
    windowLight.shadow.camera.left = -6;
    windowLight.shadow.camera.right = 6;
    windowLight.shadow.camera.top = 6;
    windowLight.shadow.camera.bottom = -6;
    this.envGroup.add(windowLight);

    // Floor
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1a1218,
      roughness: 0.55,
      metalness: 0.1,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.envGroup.add(floor);

    // Floor physics
    const floorBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
    });
    floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(floorBody);

    // Back wall
    const wallMat = new THREE.MeshStandardMaterial({
      color: level.wallColor,
      roughness: 0.85,
      metalness: 0.05,
    });
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(20, 10), wallMat);
    wall.position.set(0, 4, -4);
    wall.receiveShadow = true;
    this.envGroup.add(wall);

    // Side walls soft
    const wallL = new THREE.Mesh(new THREE.PlaneGeometry(12, 10), wallMat);
    wallL.position.set(-7, 4, 0);
    wallL.rotation.y = Math.PI / 2;
    this.envGroup.add(wallL);

    // Window glow panel
    const windowGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 2.8),
      new THREE.MeshStandardMaterial({
        color: level.keyColor,
        emissive: level.keyColor,
        emissiveIntensity: 0.85,
        transparent: true,
        opacity: 0.55,
      }),
    );
    windowGlow.position.set(-3.2, 3.2, -3.95);
    this.envGroup.add(windowGlow);

    // Curtains
    const curtainMat = new THREE.MeshStandardMaterial({
      color: 0x4a3058,
      roughness: 0.9,
      transparent: true,
      opacity: 0.85,
    });
    const c1 = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 3.2), curtainMat);
    c1.position.set(-4.4, 3, -3.9);
    const c2 = c1.clone();
    c2.position.x = -2;
    this.envGroup.add(c1, c2);

    // Decorative couch silhouette (background)
    const couchMat = new THREE.MeshStandardMaterial({
      color: 0x2a1a28,
      roughness: 0.75,
    });
    const couch = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.7, 1.1), couchMat);
    couch.position.set(2.5, 0.35, -2.2);
    couch.castShadow = true;
    couch.receiveShadow = true;
    this.envGroup.add(couch);
    const couchBack = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.9, 0.25), couchMat);
    couchBack.position.set(2.5, 0.9, -2.65);
    this.envGroup.add(couchBack);

    // Boyfriend silhouette blob on couch (simple)
    const boyMat = new THREE.MeshStandardMaterial({
      color: 0x3a2a40,
      roughness: 0.7,
      emissive: level.fillColor,
      emissiveIntensity: 0.08,
    });
    const boy = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.5, 4, 8), boyMat);
    boy.position.set(2.5, 0.95, -2.3);
    boy.rotation.x = 0.3;
    this.envGroup.add(boy);

    // Counter / surface
    const counterH = 0.12;
    this.counterY = 1.05;
    const counterMat = new THREE.MeshStandardMaterial({
      color: level.counterColor,
      roughness: level.surface === 'vanity' ? 0.25 : 0.55,
      metalness: level.surface === 'vanity' ? 0.35 : 0.08,
    });
    this.counterMesh = new THREE.Mesh(
      new THREE.BoxGeometry(level.counterSize[0], counterH, level.counterSize[1]),
      counterMat,
    );
    this.counterMesh.position.set(0, this.counterY - counterH / 2, 0);
    this.counterMesh.castShadow = true;
    this.counterMesh.receiveShadow = true;
    this.envGroup.add(this.counterMesh);

    // Counter edge highlight strip
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(level.counterSize[0] + 0.04, 0.03, level.counterSize[1] + 0.04),
      new THREE.MeshStandardMaterial({
        color: 0x1a1210,
        roughness: 0.4,
        metalness: 0.2,
      }),
    );
    edge.position.set(0, this.counterY - counterH - 0.01, 0);
    this.envGroup.add(edge);

    // Cabinet base
    const cabinet = new THREE.Mesh(
      new THREE.BoxGeometry(level.counterSize[0] * 0.95, this.counterY - counterH, level.counterSize[1] * 0.9),
      new THREE.MeshStandardMaterial({ color: 0x241820, roughness: 0.8 }),
    );
    cabinet.position.set(0, (this.counterY - counterH) / 2, 0);
    cabinet.castShadow = true;
    cabinet.receiveShadow = true;
    this.envGroup.add(cabinet);

    // Counter physics
    const counterBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(
        new CANNON.Vec3(level.counterSize[0] / 2, counterH / 2, level.counterSize[1] / 2),
      ),
      position: new CANNON.Vec3(0, this.counterY - counterH / 2, 0),
      material: new CANNON.Material({ friction: 0.5, restitution: 0.05 }),
    });
    this.world.addBody(counterBody);

    // Invisible walls slightly inside edge so objects fall off when pushed
    // (no walls on purpose — free fall off edges)

    // Spawn props
    const kinds = level.props;
    const placed: THREE.Vector3[] = [];
    for (let i = 0; i < kinds.length; i++) {
      let pos = new THREE.Vector3();
      let tries = 0;
      do {
        pos = new THREE.Vector3(
          (Math.random() - 0.5) * (level.counterSize[0] - 0.8),
          this.counterY + 0.2,
          (Math.random() - 0.5) * (level.counterSize[1] - 0.6),
        );
        tries++;
      } while (tries < 20 && placed.some((p) => p.distanceTo(pos) < 0.4));
      placed.push(pos.clone());
      // Slight Y offset by prop half-height approximated in Breakable
      const obj = new BreakableObject(kinds[i], pos, this.world, this.scene);
      this.objects.push(obj);
    }

    // Cat
    this.cat.setPosition(-this.halfW * 0.6, this.counterY, 0);
    this.scene.add(this.cat.group);

    // Floating dust / romantic motes
    this.spawnAmbientMotes(level);
  }

  private spawnAmbientMotes(level: LevelDef) {
    const count = 80;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const c1 = new THREE.Color(level.keyColor);
    const c2 = new THREE.Color(level.fillColor);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 10;
      positions[i * 3 + 1] = Math.random() * 5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 8;
      const c = c1.clone().lerp(c2, Math.random());
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.04,
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.name = 'motes';
    this.envGroup.add(pts);
  }

  spawnShatterBurst(pos: THREE.Vector3, color: number) {
    const count = 40;
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
          (Math.random() - 0.5) * 5,
          Math.random() * 4,
          (Math.random() - 0.5) * 5,
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
        size: 0.07,
        vertexColors: true,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(this.particles);
    this.particleLife = 0.9;
  }

  clearLevel() {
    for (const o of this.objects) o.dispose();
    this.objects = [];
    this.scene.remove(this.cat.group);

    // Remove all bodies
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

    if (this.particles) {
      this.scene.remove(this.particles);
      this.particles = null;
    }
  }

  update(dt: number, input: { x: number; z: number }, nudge: boolean) {
    this.clockPhase += dt;
    this.world.step(1 / 60, dt, 4);

    this.cat.update(dt, input, { halfW: this.halfW, halfD: this.halfD });

    // Soft push from cat body + edge bias so clutter tumbles off satisfyingly
    const catPos = this.cat.group.position;
    for (const obj of this.objects) {
      if (obj.broken) {
        obj.updateShards(dt);
        continue;
      }
      obj.applySoftPush(catPos, 1.8);
      if (nudge && this.cat.nudgeCooldown <= 0) {
        const d = catPos.distanceTo(obj.mesh.position);
        if (d < 0.75) {
          obj.applyNudge(this.cat.getPushOrigin(), 5.5);
        }
      }

      // Once past the lip of the counter, yank outward + down for drama
      const p = obj.body.position;
      const edgeX = this.halfW - 0.12;
      const edgeZ = this.halfD - 0.12;
      if (Math.abs(p.x) > edgeX || Math.abs(p.z) > edgeZ) {
        obj.body.wakeUp();
        const ox = Math.sign(p.x) * (Math.abs(p.x) > edgeX ? 2.5 : 0);
        const oz = Math.sign(p.z) * (Math.abs(p.z) > edgeZ ? 2.5 : 0);
        obj.body.velocity.x += ox * dt * 8;
        obj.body.velocity.z += oz * dt * 8;
        obj.body.velocity.y -= 2 * dt;
      }

      obj.syncFromPhysics();
    }
    if (nudge && this.cat.nudgeCooldown <= 0) {
      this.cat.nudgeCooldown = 0.28;
    }

    // Animate lights subtly
    if (this.keyLight) {
      this.keyLight.intensity = 38 + Math.sin(this.clockPhase * 1.3) * 4;
      this.rimLight.intensity = 10 + Math.sin(this.clockPhase * 2.1) * 3;
    }

    // Motes drift
    const motes = this.envGroup.getObjectByName('motes') as THREE.Points | undefined;
    if (motes) {
      const pos = motes.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) + dt * 0.15;
        if (y > 5) y = 0;
        pos.setY(i, y);
        pos.setX(i, pos.getX(i) + Math.sin(this.clockPhase + i) * dt * 0.05);
      }
      pos.needsUpdate = true;
    }

    // Shatter particles
    if (this.particles && this.particleLife > 0) {
      this.particleLife -= dt;
      const pos = this.particles.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < this.particleVels.length; i++) {
        const v = this.particleVels[i];
        v.y -= 8 * dt;
        pos.setX(i, pos.getX(i) + v.x * dt);
        pos.setY(i, pos.getY(i) + v.y * dt);
        pos.setZ(i, pos.getZ(i) + v.z * dt);
      }
      pos.needsUpdate = true;
      (this.particles.material as THREE.PointsMaterial).opacity = Math.max(0, this.particleLife / 0.9);
    }

    // Check breaks
    const events: { obj: BreakableObject; pos: THREE.Vector3; kind: BreakableObject['shatter']; color: number }[] = [];
    for (const obj of this.objects) {
      if (!obj.broken && obj.shouldBreak(this.floorY)) {
        const ev = obj.breakApart();
        this.spawnShatterBurst(ev.position, ev.color);
        events.push({ obj, pos: ev.position, kind: ev.kind, color: ev.color });
      }
    }
    return events;
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
