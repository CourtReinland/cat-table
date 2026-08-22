import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Cat } from './Cat';
import { toonify, outlineCharacter } from './Toon';

/**
 * Suki — playable heroine.
 *
 * Primary representation is `assets/models/suki.glb`, sculpted from scratch in
 * Blender against the canon 2D lock (tools/blender/sculpt_suki.py): fluffy
 * white / pale-pink coat in COLOR_0, sapphire eyes, hero pink bow.
 *
 * The old procedural cat stays as a fallback if the GLB fails to load, and can
 * be forced with `?suki=proc` for a quick A/B.
 */

/** Clip names authored by sculpt_suki.py. */
const CLIP = {
  idle: 'Idle',
  look: 'Idle_Look',
  walk: 'Walk',
  run: 'Run',
  swipe: 'Swipe',
  sit: 'Sit',
  cuddle: 'Cuddle',
  hit: 'Hit',
} as const;

/** Blender metres -> game units (a counter is ~4 units across). */
const GLB_SCALE = 0.85;

const _euler = new THREE.Euler();

export class Suki {
  group = new THREE.Group();
  yaw = 0;
  speed = 0;
  /** external velocity applied by shoves/hits; decays, drives tumble */
  knockVel = new THREE.Vector3();
  /** rolling/tumbling state: spin axis progress 0→1 over the roll */
  tumbleT = 0;
  tumbleDur = 0.55;
  private tumbleAxis = new THREE.Vector3(1, 0, 0);
  private tumbleSpin = Math.PI * 2;

  private inner: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private oneShotUntil = 0;
  private idleTime = 0;
  /** Procedural cat — fallback only. */
  private cat: Cat;
  private useGlb = false;
  private loading: Promise<void>;
  ready = false;

  constructor() {
    this.cat = new Cat();
    this.group.add(this.cat.group);
    this.loading = this.loadGlb();
  }

  private async loadGlb() {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
    if (q?.get('suki') === 'proc') {
      this.ready = true;
      console.info('[suki] forced procedural cat via ?suki=proc');
      return;
    }
    try {
      const gltf = await new GLTFLoader().loadAsync('assets/models/suki.glb');
      this.inner = gltf.scene as THREE.Group;
      this.inner.scale.setScalar(GLB_SCALE);
      this.inner.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = false;
          m.frustumCulled = false; // skinned bounds go stale during big swipes
        }
      });
      toonify(this.inner);
      outlineCharacter(this.inner, 0x2a1c24, 0.004);

      this.mixer = new THREE.AnimationMixer(this.inner);
      for (const clip of gltf.animations) {
        this.actions.set(clip.name, this.mixer.clipAction(clip));
      }
      const missing = Object.values(CLIP).filter((n) => !this.actions.has(n));
      if (missing.length) console.warn('[suki] glb missing clips:', missing);

      this.group.remove(this.cat.group);
      this.group.add(this.inner);
      this.useGlb = true;
      this.play(CLIP.idle);
      this.ready = true;
      console.info('[suki] sculpted GLB loaded —', gltf.animations.length, 'clips');
    } catch (err) {
      console.warn('[suki] glb unavailable, falling back to procedural cat', err);
      this.ready = true;
    }
  }

  async wait() {
    await this.loading;
  }

  /** Hide/show the whole cat (used by first-person camera). */
  setVisible(v: boolean) {
    this.group.visible = v;
    this.cat.group.visible = v;
  }

  private play(name: string, fade = 0.22, once = false) {
    if (!this.mixer) return;
    const next = this.actions.get(name) ?? this.actions.get(CLIP.idle);
    if (!next || next === this.current) return;
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    if (once) {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
    }
    if (this.current) next.crossFadeFrom(this.current, fade, false);
    next.play();
    this.current = next;
  }

  /** Full paw swipe — the wind-up sells the shove. */
  push() {
    if (!this.useGlb) {
      this.cat.push();
      return;
    }
    this.oneShotUntil = 0.5;
    this.play(CLIP.swipe, 0.08, true);
  }

  meowAnim() {
    if (!this.useGlb) return;
    this.oneShotUntil = 0.7;
    this.play(CLIP.look, 0.15, true);
  }

  cuddlePose() {
    if (!this.useGlb) {
      this.speed = 0;
      return;
    }
    this.oneShotUntil = 0;
    this.play(CLIP.cuddle, 0.5);
  }

  /** Flail when a hazard catches her. */
  hitReact() {
    if (!this.useGlb) {
      this.cat.push();
      return;
    }
    this.oneShotUntil = 0.45;
    this.play(CLIP.hit, 0.06, true);
  }

  /**
   * Get knocked back and roll. `dir` is the shove direction (world XZ),
   * `power` sets slide distance and spin speed.
   */
  knockback(dir: THREE.Vector3, power = 1) {
    this.knockVel.copy(dir).setY(0).normalize().multiplyScalar(power);
    this.tumbleT = this.tumbleDur;
    // spin around the axis perpendicular to travel (a real somersault)
    this.tumbleAxis.set(-dir.z, 0, dir.x).normalize();
    this.tumbleSpin = Math.PI * 2 * Math.min(1.4, 0.6 + power * 0.5);
  }

  /** Integrate knockback velocity + tumble rotation. Returns true while tumbling. */
  updateKnock(dt: number): boolean {
    if (this.knockVel.lengthSq() > 0.0001) {
      this.group.position.addScaledVector(this.knockVel, dt);
      const decay = Math.exp(-4.2 * dt);
      this.knockVel.multiplyScalar(decay);
      if (this.knockVel.lengthSq() < 0.0004) this.knockVel.set(0, 0, 0);
    }
    if (this.tumbleT > 0) {
      this.tumbleT -= dt;
      const u = 1 - Math.max(0, this.tumbleT) / this.tumbleDur;
      // ease-out so she lands settled, not snapping
      const ang = this.tumbleSpin * (1 - Math.pow(1 - u, 2.2));
      const _q = new THREE.Quaternion().setFromAxisAngle(this.tumbleAxis, -ang);
      const _e = new THREE.Euler().setFromQuaternion(_q);
      if (this.inner) this.inner.rotation.copy(_e);
      this.cat.group.rotation.copy(_e);
      if (this.tumbleT <= 0) {
        this.inner?.rotation.set(0, 0, 0);
        this.cat.group.rotation.set(0, 0, 0);
        return false;
      }
      return true;
    }
    return false;
  }

  update(dt: number, t: number) {
    if (!this.useGlb) {
      this.cat.yaw = this.yaw;
      this.cat.speed = this.speed;
      this.cat.update(dt, t);
      this.group.rotation.y = this.yaw;
      return;
    }
    if (!this.mixer) return;

    const moving = this.speed > 0.08;
    this.idleTime = moving ? 0 : this.idleTime + dt;

    if (this.oneShotUntil > 0) {
      this.oneShotUntil -= dt;
    } else if (this.speed > 1.15) {
      this.play(CLIP.run);
      this.current!.timeScale = THREE.MathUtils.clamp(this.speed / 1.4, 0.85, 1.9);
    } else if (moving) {
      this.play(CLIP.walk);
      this.current!.timeScale = THREE.MathUtils.clamp(this.speed / 0.75, 0.6, 2.0);
    } else if (this.idleTime > 5.5) {
      this.play(CLIP.sit, 0.5, true);
      this.current!.timeScale = 1;
    } else if (this.idleTime > 2.5) {
      this.play(CLIP.look, 0.5);
      this.current!.timeScale = 1;
    } else {
      this.play(CLIP.idle, 0.35);
      this.current!.timeScale = 1;
    }

    this.mixer.update(dt);
    this.group.rotation.y = this.yaw;
  }
}
