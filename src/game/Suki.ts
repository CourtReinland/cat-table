import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Cat } from './Cat';

/**
 * Suki — Blender-restyled Quaternius Fox (cream cat, pink bow & collar)
 * driven by its baked animation set via AnimationMixer.
 * Same runtime interface as the procedural Cat; falls back to it on 404.
 *
 * Clips available: Attack, Death, Eating, Gallop, Gallop_Jump, Idle,
 * Idle_2, Idle_2_HeadLow, Idle_HitReact1/2, Jump_ToIdle, Walk
 */
export class Suki {
  group = new THREE.Group();
  yaw = 0;
  speed = 0;

  private inner: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private oneShotUntil = 0;
  private idleTime = 0;
  private fallback: Cat | null = null;
  private loading: Promise<void>;
  ready = false;

  constructor() {
    this.loading = this.load();
  }

  private async load() {
    try {
      const gltf = await new GLTFLoader().loadAsync('assets/models/suki.glb');
      this.inner = gltf.scene as THREE.Group;
      // normalize: Quaternius units are big; Suki should read ~0.45m long
      this.inner.scale.setScalar(0.105);
      this.inner.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = false;
        }
      });
      this.group.add(this.inner);
      this.mixer = new THREE.AnimationMixer(this.inner);
      for (const clip of gltf.animations) {
        this.actions.set(clip.name, this.mixer.clipAction(clip));
      }
      this.play('Idle');
      this.ready = true;
      console.info(`[suki] glb loaded, ${gltf.animations.length} clips: ${gltf.animations.map((c) => c.name).join(', ')}`);
    } catch (err) {
      console.warn('[suki] glb unavailable, using procedural cat', err);
      this.fallback = new Cat();
      this.group.add(this.fallback.group);
      this.ready = true;
    }
  }

  async wait() {
    await this.loading;
  }

  private play(name: string, fade = 0.22, once = false) {
    if (!this.mixer) return;
    const next = this.actions.get(name) ?? this.actions.get('Idle');
    if (!next || next === this.current) return;
    next.reset();
    if (once) {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
    }
    if (this.current) {
      next.crossFadeFrom(this.current, fade, false);
    }
    next.play();
    this.current = next;
  }

  /** paw swipe */
  push() {
    if (this.fallback) return this.fallback.push();
    this.oneShotUntil = 0.55;
    this.play('Attack', 0.1, true);
  }

  /** indignant meow flourish */
  meowAnim() {
    if (this.fallback) return;
    this.oneShotUntil = 0.7;
    this.play('Idle_HitReact1', 0.15, true);
  }

  /** calm seated pose for the cuddle cinematic */
  cuddlePose() {
    if (this.fallback) return;
    this.oneShotUntil = 0;
    this.play('Idle_2', 0.5);
  }

  update(dt: number, t: number) {
    if (this.fallback) {
      this.fallback.yaw = this.yaw;
      this.fallback.speed = this.speed;
      this.fallback.update(dt, t);
      return;
    }
    if (!this.mixer) return;

    const moving = this.speed > 0.08;
    this.idleTime = moving ? 0 : this.idleTime + dt;

    if (this.oneShotUntil > 0) {
      this.oneShotUntil -= dt;
    } else if (this.speed > 1.15) {
      this.play('Gallop');
      this.current!.timeScale = THREE.MathUtils.clamp(this.speed / 1.4, 0.8, 1.8);
    } else if (this.speed > 0.08) {
      this.play('Walk');
      this.current!.timeScale = THREE.MathUtils.clamp(this.speed / 0.8, 0.6, 2.0);
    } else if (this.idleTime > 4.5) {
      this.play('Idle_2', 0.6);
      this.current!.timeScale = 1;
    } else {
      this.play('Idle', 0.35);
      this.current!.timeScale = 1;
    }

    this.mixer.update(dt);
    this.group.rotation.y = this.yaw;
  }
}
