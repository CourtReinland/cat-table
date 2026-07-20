import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PROP_LIBRARY, type PropDef } from '../data/content';

export interface ShatterEvent {
  position: THREE.Vector3;
  kind: PropDef['shatter'];
  color: number;
}

let idCounter = 0;

export class BreakableObject {
  readonly id = idCounter++;
  readonly mesh: THREE.Group;
  readonly body: CANNON.Body;
  readonly kind: PropDef['kind'];
  readonly shatter: PropDef['shatter'];
  readonly color: number;
  broken = false;
  private world: CANNON.World;
  private scene: THREE.Scene;
  private shards: THREE.Mesh[] = [];
  private shardVels: THREE.Vector3[] = [];
  private shardLife = 0;

  constructor(
    kind: PropDef['kind'],
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

    this.mesh = new THREE.Group();
    this.mesh.position.copy(position);
    this.buildMesh(kind, def);

    const shape = new CANNON.Box(
      new CANNON.Vec3(def.scale[0] * 0.5, def.scale[1] * 0.5, def.scale[2] * 0.5),
    );
    this.body = new CANNON.Body({
      mass: def.mass,
      shape,
      position: new CANNON.Vec3(position.x, position.y, position.z),
      linearDamping: 0.12,
      angularDamping: 0.2,
      material: new CANNON.Material({ friction: 0.28, restitution: 0.22 }),
    });
    this.body.allowSleep = true;
    this.body.sleepSpeedLimit = 0.15;
    this.body.sleepTimeLimit = 0.5;

    world.addBody(this.body);
    scene.add(this.mesh);
  }

  private buildMesh(kind: PropDef['kind'], def: typeof PROP_LIBRARY[PropDef['kind']]) {
    const mat = new THREE.MeshStandardMaterial({
      color: def.color,
      roughness: this.shatter === 'glass' ? 0.15 : 0.55,
      metalness: this.shatter === 'metal' ? 0.7 : this.shatter === 'glass' ? 0.2 : 0.05,
      transparent: this.shatter === 'glass',
      opacity: this.shatter === 'glass' ? 0.75 : 1,
      emissive: this.shatter === 'glass' ? def.color : 0x000000,
      emissiveIntensity: this.shatter === 'glass' ? 0.08 : 0,
    });

    let mesh: THREE.Mesh;
    switch (kind) {
      case 'mug': {
        const g = new THREE.Group();
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.22, 16, 1, true), mat);
        cup.castShadow = true;
        const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.09, 16), mat);
        bottom.rotation.x = -Math.PI / 2;
        bottom.position.y = -0.11;
        const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 8, 12, Math.PI), mat);
        handle.position.set(0.11, 0, 0);
        handle.rotation.y = Math.PI / 2;
        g.add(cup, bottom, handle);
        g.position.y = def.scale[1] * 0.5;
        this.mesh.add(g);
        return;
      }
      case 'glass': {
        mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.045, 0.28, 12, 1, true),
          mat,
        );
        mesh.position.y = 0.14;
        break;
      }
      case 'plant': {
        const pot = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1, 0.08, 0.14, 10),
          new THREE.MeshStandardMaterial({ color: 0xb8956e, roughness: 0.7 }),
        );
        pot.position.y = 0.07;
        pot.castShadow = true;
        const leaf = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 10, 10),
          new THREE.MeshStandardMaterial({ color: 0x4a9b5c, roughness: 0.6 }),
        );
        leaf.position.y = 0.22;
        leaf.scale.set(1, 1.3, 1);
        leaf.castShadow = true;
        this.mesh.add(pot, leaf);
        return;
      }
      case 'book': {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(...def.scale), mat);
        mesh.position.y = def.scale[1] * 0.5;
        break;
      }
      case 'phone': {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(...def.scale), mat);
        mesh.position.y = def.scale[1] * 0.5;
        const screen = new THREE.Mesh(
          new THREE.PlaneGeometry(def.scale[0] * 0.85, def.scale[2] * 0.8),
          new THREE.MeshStandardMaterial({
            color: 0x88aaff,
            emissive: 0x4466cc,
            emissiveIntensity: 0.6,
          }),
        );
        screen.rotation.x = -Math.PI / 2;
        screen.position.y = def.scale[1] + 0.002;
        this.mesh.add(mesh, screen);
        mesh.castShadow = true;
        return;
      }
      case 'candle': {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 12), mat);
        mesh.position.y = 0.11;
        const flame = new THREE.Mesh(
          new THREE.SphereGeometry(0.03, 8, 8),
          new THREE.MeshStandardMaterial({
            color: 0xffaa44,
            emissive: 0xff6600,
            emissiveIntensity: 1.2,
          }),
        );
        flame.position.y = 0.26;
        flame.scale.set(0.7, 1.2, 0.7);
        this.mesh.add(mesh, flame);
        mesh.castShadow = true;
        return;
      }
      case 'bottle': {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.22, 12), mat);
        body.position.y = 0.11;
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.1, 10), mat);
        neck.position.y = 0.27;
        body.castShadow = true;
        this.mesh.add(body, neck);
        return;
      }
      case 'remote': {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(...def.scale), mat);
        mesh.position.y = def.scale[1] * 0.5;
        break;
      }
      case 'frame': {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(...def.scale), mat);
        mesh.position.y = def.scale[1] * 0.5;
        const photo = new THREE.Mesh(
          new THREE.PlaneGeometry(def.scale[0] * 0.7, def.scale[1] * 0.7),
          new THREE.MeshStandardMaterial({ color: 0xf0c0d0, emissive: 0x402030, emissiveIntensity: 0.2 }),
        );
        photo.position.set(0, def.scale[1] * 0.5, def.scale[2] * 0.51);
        this.mesh.add(mesh, photo);
        mesh.castShadow = true;
        return;
      }
      case 'bowl': {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.14, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
          mat,
        );
        mesh.position.y = 0.02;
        mesh.scale.y = 0.6;
        break;
      }
      default:
        mesh = new THREE.Mesh(new THREE.BoxGeometry(...def.scale), mat);
        mesh.position.y = def.scale[1] * 0.5;
    }

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.mesh.add(mesh);
  }

  syncFromPhysics() {
    if (this.broken) return;
    this.mesh.position.copy(this.body.position as unknown as THREE.Vector3);
    this.mesh.quaternion.copy(this.body.quaternion as unknown as THREE.Quaternion);
  }

  applyNudge(from: THREE.Vector3, strength = 3.5) {
    if (this.broken) return;
    const dir = new THREE.Vector3()
      .subVectors(this.mesh.position, from)
      .setY(0);
    if (dir.lengthSq() < 0.0001) dir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    dir.normalize();
    this.body.wakeUp();
    this.body.applyImpulse(
      new CANNON.Vec3(dir.x * strength, 0.8 + Math.random() * 0.6, dir.z * strength),
      new CANNON.Vec3(0, 0.05, 0),
    );
    this.body.angularVelocity.set(
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4,
    );
  }

  /** Soft continuous push when cat collides */
  applySoftPush(from: THREE.Vector3, strength = 1.2) {
    if (this.broken) return;
    const dist = from.distanceTo(this.mesh.position);
    if (dist > 0.45) return;
    const dir = new THREE.Vector3().subVectors(this.mesh.position, from).setY(0);
    if (dir.lengthSq() < 0.0001) return;
    dir.normalize();
    const force = strength * (1 - dist / 0.45);
    this.body.wakeUp();
    this.body.applyForce(
      new CANNON.Vec3(dir.x * force * 8, 0, dir.z * force * 8),
      this.body.position,
    );
  }

  shouldBreak(floorY: number): boolean {
    if (this.broken) return false;
    return this.body.position.y < floorY + 0.15 || this.mesh.position.y < floorY + 0.15;
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
      transparent: this.shatter === 'glass',
      opacity: 0.85,
    });

    const count = this.shatter === 'soft' ? 5 : 12;
    for (let i = 0; i < count; i++) {
      const size = 0.03 + Math.random() * 0.06;
      const geo =
        Math.random() > 0.5
          ? new THREE.TetrahedronGeometry(size)
          : new THREE.BoxGeometry(size, size * 0.6, size * 0.8);
      const shard = new THREE.Mesh(geo, mat.clone());
      shard.position.copy(pos);
      shard.position.x += (Math.random() - 0.5) * 0.15;
      shard.position.y += Math.random() * 0.1;
      shard.position.z += (Math.random() - 0.5) * 0.15;
      shard.castShadow = true;
      this.scene.add(shard);
      this.shards.push(shard);
      this.shardVels.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * 3.5,
          1.5 + Math.random() * 2.5,
          (Math.random() - 0.5) * 3.5,
        ),
      );
    }
    this.shardLife = 1.4;

    return { position: pos, kind: this.shatter, color: this.color };
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
        v.x *= 0.8;
        v.z *= 0.8;
      }
      const mat = s.material as THREE.MeshStandardMaterial;
      mat.opacity = Math.max(0, this.shardLife / 1.4);
      mat.transparent = true;
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
    for (const s of this.shards) {
      this.scene.remove(s);
    }
    this.shards = [];
  }
}
