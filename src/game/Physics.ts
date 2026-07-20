import * as THREE from 'three/webgpu';
import type { ShatterKind } from '../data/content';

export interface ShatterEvent {
  kind: ShatterKind;
  pos: THREE.Vector3;
  impactSpeed: number;
  body: Body;
}

const GRAVITY = 11.5;
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

export type BodyState = 'idle' | 'sliding' | 'falling' | 'gone';

export class Body {
  group: THREE.Group;
  kind: ShatterKind;
  state: BodyState = 'idle';
  vel = new THREE.Vector3();
  angVel = new THREE.Vector3();
  halfH: number;
  radiusXZ: number;
  points: number;
  bounces = 0;

  constructor(group: THREE.Group, kind: ShatterKind, halfH: number, radiusXZ: number, points: number) {
    this.group = group;
    this.kind = kind;
    this.halfH = halfH;
    this.radiusXZ = radiusXZ;
    this.points = points;
  }

  get pos() {
    return this.group.position;
  }
}

/** Instanced shard debris pool: one draw call, per-instance color + matrix. */
export class ShardPool {
  mesh: THREE.InstancedMesh;
  private max: number;
  private free: number[] = [];
  private active: {
    i: number;
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    rot: THREE.Euler;
    angVel: THREE.Vector3;
    scale: number;
    life: number;
    asleep: boolean;
  }[] = [];
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();

  constructor(scene: THREE.Scene, max = 220) {
    this.max = max;
    const geo = new THREE.TetrahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.5, metalness: 0.1 });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.count = max;
    this.mesh.frustumCulled = false;
    for (let i = max - 1; i >= 0; i--) {
      this.free.push(i);
      this.dummy.position.set(0, -100, 0);
      this.dummy.scale.setScalar(0.001);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, this.color.setHex(0xffffff));
    }
    scene.add(this.mesh);
  }

  spawn(pos: THREE.Vector3, baseVel: THREE.Vector3, colorHex: number, count: number, size: number, spread: number) {
    for (let n = 0; n < count; n++) {
      let slot = this.free.pop();
      if (slot === undefined) {
        // recycle the oldest active shard
        const oldest = this.active.shift();
        if (!oldest) return;
        slot = oldest.i;
      } else {
        this.active.push({ i: slot } as any);
      }
      const rec = this.active[this.active.length - 1] as any;
      rec.i = slot;
      rec.pos = pos.clone().add(_v.set((Math.random() - 0.5) * 0.08, Math.random() * 0.05, (Math.random() - 0.5) * 0.08));
      rec.vel = new THREE.Vector3(
        baseVel.x * 0.4 + (Math.random() - 0.5) * spread,
        Math.abs(baseVel.y) * 0.25 + 1.2 + Math.random() * 1.8,
        baseVel.z * 0.4 + (Math.random() - 0.5) * spread,
      );
      rec.rot = new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      rec.angVel = new THREE.Vector3((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
      rec.scale = size * (0.6 + Math.random() * 0.9);
      rec.life = 4.2 + Math.random() * 0.8;
      rec.asleep = false;
      this.mesh.setColorAt(slot, this.color.setHex(colorHex).offsetHSL(0, 0, (Math.random() - 0.5) * 0.1));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number) {
    for (let a = this.active.length - 1; a >= 0; a--) {
      const s = this.active[a];
      if (!s.asleep) {
        s.vel.y -= GRAVITY * dt;
        s.pos.addScaledVector(s.vel, dt);
        s.rot.x += s.angVel.x * dt;
        s.rot.y += s.angVel.y * dt;
        s.rot.z += s.angVel.z * dt;
        const rest = s.scale * 0.55;
        if (s.pos.y < rest && s.vel.y < 0) {
          s.pos.y = rest;
          if (Math.abs(s.vel.y) > 0.9) {
            s.vel.y = -s.vel.y * 0.32;
            s.vel.x *= 0.6;
            s.vel.z *= 0.6;
            s.angVel.multiplyScalar(0.5);
          } else {
            s.vel.set(0, 0, 0);
            s.angVel.set(0, 0, 0);
            s.asleep = true;
          }
        }
      }
      s.life -= dt;
      let scale = s.scale;
      if (s.life < 0.7) scale *= Math.max(0.001, s.life / 0.7);
      if (s.life <= 0) {
        this.dummy.position.set(0, -100, 0);
        this.dummy.scale.setScalar(0.001);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(s.i, this.dummy.matrix);
        this.free.push(s.i);
        this.active.splice(a, 1);
        continue;
      }
      this.dummy.position.copy(s.pos);
      this.dummy.rotation.copy(s.rot);
      this.dummy.scale.setScalar(scale);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(s.i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    for (const s of this.active) {
      this.dummy.position.set(0, -100, 0);
      this.dummy.scale.setScalar(0.001);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(s.i, this.dummy.matrix);
      this.free.push(s.i);
    }
    this.active.length = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export interface SurfaceRect {
  cx: number;
  cz: number;
  halfW: number;
  halfD: number;
  topY: number;
}

/**
 * Minimal arcade physics: props rest on a surface rect, get pushed, slide,
 * tip over the edge, tumble, and shatter on the floor.
 */
export class Physics {
  bodies: Body[] = [];
  shards: ShardPool;
  surface: SurfaceRect = { cx: 0, cz: 0, halfW: 2, halfD: 1, topY: 1 };
  floorY = 0;
  onShatter: ((ev: ShatterEvent) => void) | null = null;

  constructor(scene: THREE.Scene) {
    this.shards = new ShardPool(scene);
  }

  reset() {
    this.bodies.length = 0;
    this.shards.clear();
  }

  addBody(b: Body) {
    this.bodies.push(b);
  }

  get remaining() {
    return this.bodies.filter((b) => b.state !== 'gone').length;
  }

  /** Kick a body with an impulse (called by the cat). */
  kick(b: Body, dir: THREE.Vector3, power: number) {
    if (b.state === 'gone') return;
    const mass = 0.2 + b.radiusXZ * 2;
    b.vel.addScaledVector(dir, power / mass);
    b.vel.y += power * 0.12;
    b.angVel.add(_v.set((Math.random() - 0.5) * power * 2.2, (Math.random() - 0.5) * power * 1.4, (Math.random() - 0.5) * power * 2.2));
    if (b.state === 'idle') b.state = 'sliding';
  }

  private shatter(b: Body, impactSpeed: number) {
    b.state = 'gone';
    b.group.visible = false;
    this.onShatter?.({ kind: b.kind, pos: b.pos.clone(), impactSpeed, body: b });
  }

  update(dt: number) {
    const s = this.surface;
    for (const b of this.bodies) {
      if (b.state === 'gone') continue;

      if (b.state === 'sliding') {
        // planar slide on the surface with friction + stylish tilt
        const friction = Math.exp(-3.2 * dt);
        b.vel.x *= friction;
        b.vel.z *= friction;
        b.pos.x += b.vel.x * dt;
        b.pos.z += b.vel.z * dt;
        b.pos.y = s.topY + b.halfH;

        const speed = Math.hypot(b.vel.x, b.vel.z);
        const tilt = Math.min(0.22, speed * 0.12);
        const target = _e.set(b.vel.z * tilt, b.group.rotation.y, -b.vel.x * tilt);
        _q.setFromEuler(target);
        b.group.quaternion.slerp(_q, 1 - Math.exp(-8 * dt));

        // tipped off the edge?
        const outX = Math.abs(b.pos.x - s.cx) > s.halfW + b.radiusXZ * 0.35;
        const outZ = Math.abs(b.pos.z - s.cz) > s.halfD + b.radiusXZ * 0.35;
        if (outX || outZ) {
          b.state = 'falling';
          b.angVel.x += b.vel.z * 2.5;
          b.angVel.z -= b.vel.x * 2.5;
        } else if (speed < 0.05) {
          b.vel.set(0, 0, 0);
          b.state = 'idle';
          // settle back upright
          b.group.quaternion.slerp(new THREE.Quaternion(), 0.4);
        }
      } else if (b.state === 'falling') {
        b.vel.y -= GRAVITY * dt;
        b.pos.addScaledVector(b.vel, dt);
        _e.set(b.angVel.x * dt, b.angVel.y * dt, b.angVel.z * dt);
        _q.setFromEuler(_e);
        b.group.quaternion.multiply(_q);

        // landed back on the surface (didn't clear the edge)
        const onSurface =
          Math.abs(b.pos.x - s.cx) < s.halfW && Math.abs(b.pos.z - s.cz) < s.halfD;
        if (onSurface && b.pos.y - b.halfH <= s.topY && b.vel.y < 0 && s.topY > 0.05) {
          b.pos.y = s.topY + b.halfH;
          b.state = 'sliding';
          b.vel.y = 0;
          continue;
        }

        // floor impact
        if (b.pos.y - b.halfH * 0.5 <= this.floorY && b.vel.y < 0) {
          const impact = Math.abs(b.vel.y) + Math.hypot(b.vel.x, b.vel.z) * 0.3;
          if (impact > 1.0 || b.bounces >= 1) {
            b.pos.y = this.floorY + b.halfH * 0.5;
            this.shatter(b, impact);
          } else {
            b.bounces++;
            b.vel.y = -b.vel.y * 0.3;
            b.vel.x *= 0.6;
            b.vel.z *= 0.6;
          }
        }
      }
    }
    this.shards.update(dt);
  }
}
