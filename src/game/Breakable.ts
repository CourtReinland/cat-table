import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PROP_LIBRARY, type PropKind, type WeightClass } from '../data/content';

export interface ShatterEvent {
  position: THREE.Vector3;
  kind: 'glass' | 'ceramic' | 'soft' | 'metal';
  color: number;
  weight: WeightClass;
}

let idCounter = 0;

export class BreakableObject {
  readonly id = idCounter++;
  readonly mesh: THREE.Group;
  readonly body: CANNON.Body;
  readonly kind: PropKind;
  readonly shatter: 'glass' | 'ceramic' | 'soft' | 'metal';
  readonly color: number;
  readonly weight: WeightClass;
  readonly mass: number;
  broken = false;
  /** Hits absorbed before free sliding (for heavies/anchors) */
  toughnessLeft: number;
  readonly toughnessMax: number;
  private world: CANNON.World;
  private scene: THREE.Scene;
  private shards: THREE.Mesh[] = [];
  private shardVels: THREE.Vector3[] = [];
  private shardLife = 0;
  private hitFlash = 0;
  private baseMats: THREE.MeshStandardMaterial[] = [];
  private labelSprite: THREE.Sprite | null = null;

  constructor(
    kind: PropKind,
    position: THREE.Vector3,
    world: CANNON.World,
    scene: THREE.Scene,
  ) {
    this.kind = kind;
    this.world = world;
    this.scene = scene;
    const def = PROP_LIBRARY[kind];
    this.shatter = def.shatter;
    this.color = def.color;
    this.weight = def.weight;
    this.mass = def.mass;
    this.toughnessMax = def.toughness;
    this.toughnessLeft = def.toughness;

    this.mesh = new THREE.Group();
    this.mesh.position.copy(position);
    this.buildMesh(kind, def);

    const shape = new CANNON.Box(
      new CANNON.Vec3(def.scale[0] * 0.5, def.scale[1] * 0.5, def.scale[2] * 0.5),
    );
    this.body = new CANNON.Body({
      mass: def.mass,
      shape,
      position: new CANNON.Vec3(position.x, position.y + def.scale[1] * 0.5, position.z),
      linearDamping: def.weight === 'feather' ? 0.08 : 0.18,
      angularDamping: 0.25,
      material: new CANNON.Material({ friction: def.friction, restitution: 0.12 }),
      collisionFilterGroup: 1,
      collisionFilterMask: 1 | 2,
    });

    // Anchors start nearly locked — need toughness stripped first
    if (def.weight === 'anchor' || def.weight === 'heavy') {
      this.body.type = CANNON.Body.STATIC;
    }

    this.body.allowSleep = true;
    this.body.sleepSpeedLimit = 0.12;
    this.body.sleepTimeLimit = 0.4;

    world.addBody(this.body);
    scene.add(this.mesh);

    if (def.weight === 'heavy' || def.weight === 'anchor') {
      this.addWeightBadge(def.weight);
    }
  }

  private addWeightBadge(w: WeightClass) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = w === 'anchor' ? 'rgba(180,40,60,0.85)' : 'rgba(80,60,120,0.8)';
    ctx.fillRect(4, 8, 120, 48);
    ctx.fillStyle = '#ffe8a0';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(w === 'anchor' ? 'ANCHOR' : 'HEAVY', 64, 40);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true });
    this.labelSprite = new THREE.Sprite(mat);
    this.labelSprite.scale.set(0.35, 0.18, 1);
    this.labelSprite.position.y = PROP_LIBRARY[this.kind].scale[1] + 0.2;
    this.mesh.add(this.labelSprite);
  }

  private trackMat(mat: THREE.MeshStandardMaterial) {
    this.baseMats.push(mat);
    return mat;
  }

  private buildMesh(kind: PropKind, def: (typeof PROP_LIBRARY)[PropKind]) {
    const mat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: def.color,
        roughness: this.shatter === 'glass' ? 0.12 : 0.5,
        metalness: this.shatter === 'metal' ? 0.75 : this.shatter === 'glass' ? 0.25 : 0.06,
        transparent: this.shatter === 'glass',
        opacity: this.shatter === 'glass' ? 0.72 : 1,
        emissive: this.shatter === 'glass' ? def.color : 0x000000,
        emissiveIntensity: this.shatter === 'glass' ? 0.1 : 0,
        envMapIntensity: 1.0,
      }),
    );

    switch (kind) {
      case 'mug': {
        const g = new THREE.Group();
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.22, 20, 1, true), mat);
        cup.castShadow = true;
        const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.09, 20), mat);
        bottom.rotation.x = -Math.PI / 2;
        bottom.position.y = -0.11;
        const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 8, 16, Math.PI), mat);
        handle.position.set(0.11, 0, 0);
        handle.rotation.y = Math.PI / 2;
        g.add(cup, bottom, handle);
        g.position.y = def.scale[1] * 0.5;
        this.mesh.add(g);
        return;
      }
      case 'glass': {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.28, 16, 1, true), mat);
        mesh.position.y = 0.14;
        mesh.castShadow = true;
        this.mesh.add(mesh);
        return;
      }
      case 'plant': {
        const pot = new THREE.Mesh(
          new THREE.CylinderGeometry(0.11, 0.09, 0.16, 12),
          this.trackMat(new THREE.MeshStandardMaterial({ color: 0xb8956e, roughness: 0.7 })),
        );
        pot.position.y = 0.08;
        pot.castShadow = true;
        const leafMat = this.trackMat(
          new THREE.MeshStandardMaterial({ color: 0x4a9b5c, roughness: 0.55 }),
        );
        for (let i = 0; i < 5; i++) {
          const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 10), leafMat);
          const a = (i / 5) * Math.PI * 2;
          leaf.position.set(Math.cos(a) * 0.06, 0.22 + (i % 2) * 0.05, Math.sin(a) * 0.06);
          leaf.scale.set(1, 1.4, 0.7);
          leaf.castShadow = true;
          this.mesh.add(leaf);
        }
        this.mesh.add(pot);
        return;
      }
      case 'book': {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(...def.scale), mat);
        mesh.position.y = def.scale[1] * 0.5;
        mesh.castShadow = true;
        this.mesh.add(mesh);
        return;
      }
      case 'phone': {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(...def.scale), mat);
        mesh.position.y = def.scale[1] * 0.5;
        mesh.castShadow = true;
        const screen = new THREE.Mesh(
          new THREE.PlaneGeometry(def.scale[0] * 0.85, def.scale[2] * 0.8),
          this.trackMat(
            new THREE.MeshStandardMaterial({
              color: 0x88aaff,
              emissive: 0x4466cc,
              emissiveIntensity: 0.7,
            }),
          ),
        );
        screen.rotation.x = -Math.PI / 2;
        screen.position.y = def.scale[1] + 0.002;
        this.mesh.add(mesh, screen);
        return;
      }
      case 'candle': {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 14), mat);
        mesh.position.y = 0.11;
        mesh.castShadow = true;
        const flame = new THREE.Mesh(
          new THREE.SphereGeometry(0.03, 8, 8),
          this.trackMat(
            new THREE.MeshStandardMaterial({
              color: 0xffaa44,
              emissive: 0xff6600,
              emissiveIntensity: 1.4,
            }),
          ),
        );
        flame.position.y = 0.26;
        flame.scale.set(0.7, 1.2, 0.7);
        this.mesh.add(mesh, flame);
        return;
      }
      case 'bottle': {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.22, 14), mat);
        body.position.y = 0.11;
        body.castShadow = true;
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.1, 12), mat);
        neck.position.y = 0.27;
        this.mesh.add(body, neck);
        return;
      }
      case 'remote': {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(...def.scale), mat);
        mesh.position.y = def.scale[1] * 0.5;
        mesh.castShadow = true;
        this.mesh.add(mesh);
        return;
      }
      case 'frame': {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(...def.scale), mat);
        mesh.position.y = def.scale[1] * 0.5;
        mesh.castShadow = true;
        const photo = new THREE.Mesh(
          new THREE.PlaneGeometry(def.scale[0] * 0.7, def.scale[1] * 0.7),
          this.trackMat(
            new THREE.MeshStandardMaterial({
              color: 0xf0c0d0,
              emissive: 0x402030,
              emissiveIntensity: 0.25,
            }),
          ),
        );
        photo.position.set(0, def.scale[1] * 0.5, def.scale[2] * 0.51);
        this.mesh.add(mesh, photo);
        return;
      }
      case 'bowl': {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.14, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.5),
          mat,
        );
        mesh.position.y = 0.02;
        mesh.scale.y = 0.6;
        mesh.castShadow = true;
        this.mesh.add(mesh);
        return;
      }
      case 'laptop': {
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.03, 0.32), mat);
        base.position.y = 0.015;
        base.castShadow = true;
        const lid = new THREE.Mesh(
          new THREE.BoxGeometry(0.45, 0.28, 0.02),
          this.trackMat(
            new THREE.MeshStandardMaterial({ color: 0x2a2a32, roughness: 0.4, metalness: 0.6 }),
          ),
        );
        lid.position.set(0, 0.16, -0.15);
        lid.rotation.x = -0.35;
        const screen = new THREE.Mesh(
          new THREE.PlaneGeometry(0.4, 0.24),
          this.trackMat(
            new THREE.MeshStandardMaterial({
              color: 0x6688ff,
              emissive: 0x2244aa,
              emissiveIntensity: 0.5,
            }),
          ),
        );
        screen.position.set(0, 0.16, -0.135);
        screen.rotation.x = -0.35;
        this.mesh.add(base, lid, screen);
        return;
      }
      case 'kettle': {
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 14), mat);
        body.scale.set(1.1, 0.95, 0.9);
        body.position.y = 0.14;
        body.castShadow = true;
        const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.12, 8), mat);
        spout.position.set(0.12, 0.16, 0);
        spout.rotation.z = Math.PI / 2.5;
        const handle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.015, 8, 14, Math.PI), mat);
        handle.position.set(-0.1, 0.16, 0);
        handle.rotation.y = Math.PI / 2;
        this.mesh.add(body, spout, handle);
        return;
      }
      case 'lamp': {
        const base = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1, 0.12, 0.06, 14),
          this.trackMat(new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.5, metalness: 0.4 })),
        );
        base.position.y = 0.03;
        base.castShadow = true;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.28, 8), mat);
        pole.position.y = 0.2;
        const shade = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.14, 0.14, 14, 1, true),
          this.trackMat(
            new THREE.MeshStandardMaterial({
              color: 0xf5e6c8,
              emissive: 0xffcc88,
              emissiveIntensity: 0.45,
              side: THREE.DoubleSide,
            }),
          ),
        );
        shade.position.y = 0.4;
        this.mesh.add(base, pole, shade);
        return;
      }
      case 'vase': {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.3, 14), mat);
        body.position.y = 0.15;
        body.castShadow = true;
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.12, 12), mat);
        neck.position.y = 0.35;
        this.mesh.add(body, neck);
        return;
      }
      case 'stack': {
        const colors = [0x6a4a3a, 0x3a5a6a, 0x5a3a4a, 0x4a5a3a];
        for (let i = 0; i < 4; i++) {
          const b = new THREE.Mesh(
            new THREE.BoxGeometry(0.3 - i * 0.01, 0.06, 0.22),
            this.trackMat(
              new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.7 }),
            ),
          );
          b.position.y = 0.03 + i * 0.065;
          b.rotation.y = (i - 1.5) * 0.08;
          b.castShadow = true;
          this.mesh.add(b);
        }
        return;
      }
      default: {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(...def.scale), mat);
        mesh.position.y = def.scale[1] * 0.5;
        mesh.castShadow = true;
        this.mesh.add(mesh);
      }
    }
  }

  syncFromPhysics() {
    if (this.broken) return;
    this.mesh.position.copy(this.body.position as unknown as THREE.Vector3);
    this.mesh.quaternion.copy(this.body.quaternion as unknown as THREE.Quaternion);
    // Counteract the half-height offset baked into body for mesh children that already include it
    // Body center is object center; mesh was built with local Y offsets — OK for most.

    if (this.hitFlash > 0) {
      this.hitFlash -= 0.05;
      for (const m of this.baseMats) {
        m.emissive = new THREE.Color(0xff6688);
        m.emissiveIntensity = this.hitFlash * 0.8;
      }
    } else {
      for (const m of this.baseMats) {
        if (this.shatter !== 'glass') {
          m.emissiveIntensity = 0;
        }
      }
    }
  }

  /**
   * Apply swat impulse. Heavies/anchors need multiple hits to unlock.
   * @returns 'locked' | 'unlocked' | 'pushed'
   */
  applySwat(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    strength: number,
  ): 'locked' | 'unlocked' | 'pushed' | 'miss' {
    if (this.broken) return 'miss';
    const target = new THREE.Vector3(this.body.position.x, origin.y, this.body.position.z);
    const dist = origin.distanceTo(target);
    const reach = 0.85 + (this.weight === 'feather' ? 0.15 : 0);
    if (dist > reach) return 'miss';

    this.hitFlash = 1;

    // Toughness gate — heavies rattle until unlocked
    if (this.toughnessLeft > 1) {
      this.toughnessLeft -= 1;
      this.body.type = CANNON.Body.DYNAMIC;
      this.body.mass = this.mass;
      this.body.updateMassProperties();
      this.body.wakeUp();
      const n = direction.clone().normalize();
      this.body.velocity.set(n.x * 1.6 * strength, 0.9, n.z * 1.6 * strength);
      this.body.angularVelocity.set(
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 4,
      );
      // Brief rattle then re-lock if still tough
      if (this.weight === 'anchor' || this.weight === 'heavy') {
        const id = this.id;
        setTimeout(() => {
          if (!this.broken && this.toughnessLeft > 1 && this.id === id) {
            this.body.velocity.set(0, 0, 0);
            this.body.angularVelocity.set(0, 0, 0);
            this.body.type = CANNON.Body.STATIC;
          }
        }, 220);
      }
      return this.toughnessLeft <= 1 ? 'unlocked' : 'locked';
    }

    // Free to fly — big satisfying launch toward / off the edge
    this.body.type = CANNON.Body.DYNAMIC;
    this.body.mass = this.mass;
    this.body.updateMassProperties();
    this.body.wakeUp();
    this.toughnessLeft = 0;

    const n = direction.clone().normalize();
    // Bias impulse toward nearest counter edge so things actually fall
    const edgeDir = new THREE.Vector3(
      Math.abs(this.mesh.position.x) > 0.01 ? Math.sign(this.mesh.position.x) : n.x,
      0,
      Math.abs(this.mesh.position.z) > 0.01 ? Math.sign(this.mesh.position.z) : n.z,
    ).normalize();
    const launch = n.clone().multiplyScalar(0.55).add(edgeDir.multiplyScalar(0.45)).normalize();

    const inv = 1 / Math.max(0.12, Math.pow(this.mass, 0.35));
    const force = (7.5 + strength * 5.5) * inv;
    const up = 1.6 + strength * 1.2 * inv;

    this.body.velocity.set(launch.x * force, up, launch.z * force);
    this.body.angularVelocity.set(
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 12,
      (Math.random() - 0.5) * 10,
    );

    if (this.labelSprite) {
      this.mesh.remove(this.labelSprite);
      this.labelSprite = null;
    }
    return 'pushed';
  }

  /** Continuous shoulder-check from cat body */
  applySoftPush(from: THREE.Vector3, catVel: THREE.Vector3, strength = 1) {
    if (this.broken) return;
    if (this.body.type === CANNON.Body.STATIC) return;
    const dist = from.distanceTo(
      new THREE.Vector3(this.body.position.x, from.y, this.body.position.z),
    );
    if (dist > 0.5) return;
    const dir = new THREE.Vector3(
      this.body.position.x - from.x,
      0,
      this.body.position.z - from.z,
    );
    if (dir.lengthSq() < 1e-6) return;
    dir.normalize();
    const falloff = 1 - dist / 0.5;
    const inv = 1 / Math.max(0.15, Math.pow(this.mass, 0.45));
    const speed = Math.hypot(catVel.x, catVel.z);
    const impulse = (2.2 + speed * 0.9) * strength * falloff * inv;
    this.body.wakeUp();
    this.body.velocity.x += dir.x * impulse;
    this.body.velocity.z += dir.z * impulse;
    this.body.velocity.y += 0.15 * falloff * inv;
    this.body.angularVelocity.y += (Math.random() - 0.5) * 2 * falloff;
  }

  shouldBreak(floorY: number): boolean {
    if (this.broken) return false;
    return this.body.position.y < floorY + 0.18;
  }

  breakApart(): ShatterEvent {
    this.broken = true;
    this.world.removeBody(this.body);
    this.scene.remove(this.mesh);

    const pos = this.mesh.position.clone();
    const mat = new THREE.MeshStandardMaterial({
      color: this.color,
      roughness: 0.4,
      metalness: this.shatter === 'glass' ? 0.3 : 0.05,
      transparent: true,
      opacity: 0.9,
    });

    const count = this.shatter === 'soft' ? 6 : this.weight === 'heavy' ? 16 : 12;
    for (let i = 0; i < count; i++) {
      const size = 0.03 + Math.random() * 0.07;
      const geo =
        Math.random() > 0.5
          ? new THREE.TetrahedronGeometry(size)
          : new THREE.BoxGeometry(size, size * 0.6, size * 0.8);
      const shard = new THREE.Mesh(geo, mat.clone());
      shard.position.copy(pos);
      shard.position.x += (Math.random() - 0.5) * 0.2;
      shard.position.y += Math.random() * 0.12;
      shard.position.z += (Math.random() - 0.5) * 0.2;
      shard.castShadow = true;
      this.scene.add(shard);
      this.shards.push(shard);
      this.shardVels.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * 4,
          1.8 + Math.random() * 3,
          (Math.random() - 0.5) * 4,
        ),
      );
    }
    this.shardLife = 1.5;

    return { position: pos, kind: this.shatter, color: this.color, weight: this.weight };
  }

  updateShards(dt: number) {
    if (!this.broken || this.shards.length === 0) return;
    this.shardLife -= dt;
    for (let i = 0; i < this.shards.length; i++) {
      const s = this.shards[i];
      const v = this.shardVels[i];
      v.y -= 9.5 * dt;
      s.position.addScaledVector(v, dt);
      s.rotation.x += v.x * dt * 2;
      s.rotation.z += v.z * dt * 2;
      if (s.position.y < 0.02) {
        s.position.y = 0.02;
        v.y *= -0.25;
        v.x *= 0.75;
        v.z *= 0.75;
      }
      const m = s.material as THREE.MeshStandardMaterial;
      m.opacity = Math.max(0, this.shardLife / 1.5);
    }
    if (this.shardLife <= 0) {
      for (const s of this.shards) {
        this.scene.remove(s);
        s.geometry.dispose();
        (s.material as THREE.Material).dispose();
      }
      this.shards = [];
    }
  }

  dispose() {
    if (!this.broken) {
      this.world.removeBody(this.body);
      this.scene.remove(this.mesh);
    }
    for (const s of this.shards) this.scene.remove(s);
    this.shards = [];
  }
}
