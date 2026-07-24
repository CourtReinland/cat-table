import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { toonify, outlineCharacter } from './Toon';
import type { BoyDef } from '../data/content';

type PoseName = 'sit' | 'stand' | 'walk' | 'kneel' | 'cuddle';

const gltfCache = new Map<string, any>();

/** Preload all five boyfriend GLBs at boot (called once from Game.init). */
export async function preloadBoys(ids: string[]) {
  const loader = new GLTFLoader();
  await Promise.all(
    ids.map(async (id) => {
      if (gltfCache.has(id)) return;
      try {
        const gltf = await loader.loadAsync(`assets/models/boy-${id}.glb`);
        gltfCache.set(id, gltf);
      } catch (err) {
        console.warn(`[bf] boy-${id}.glb unavailable`, err);
      }
    }),
  );
}

function exclaimTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.font = 'bold 52px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#ffd76a';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#ffe9a8';
  ctx.fillText('!', 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let exclaimTex: THREE.CanvasTexture | null = null;

/** GLB boyfriend: Blender-built rig, clip-driven poses + procedural head look-at. */
export class Boyfriend {
  group = new THREE.Group();
  def: BoyDef;
  walking = false;
  lookTarget: THREE.Vector3 | null = null;

  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private headBone: THREE.Object3D | null = null;
  private exclaim: THREE.Mesh;
  private exclaimT = 0;
  private pendingAfter: { at: number; clip: string; fade: number } | null = null;
  private oneShotUntil = 0;
  ready = false;

  constructor(def: BoyDef) {
    this.def = def;
    const src = gltfCache.get(def.id);
    if (src) {
      const inner = src.scene.clone(true) as THREE.Group;
      inner.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.castShadow = true;
      });
      this.group.add(inner);
      toonify(inner);
      outlineCharacter(inner);
      this.mixer = new THREE.AnimationMixer(inner);
      for (const clip of src.animations) {
        // NLA track names come through clean: Idle_Sit, Walk, Cuddle…
        this.actions.set(clip.name, this.mixer.clipAction(clip));
      }
      this.headBone = inner.getObjectByName('Head') ?? null;
      this.ready = true;
    } else {
      console.warn(`[bf] no glb for ${def.id}; boyfriend invisible this level`);
    }

    exclaimTex = exclaimTex ?? exclaimTexture();
    const mat = new THREE.MeshBasicNodeMaterial({ map: exclaimTex, transparent: true, opacity: 0, depthWrite: false });
    this.exclaim = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), mat);
    this.exclaim.position.set(0, 1.95, 0);
    this.exclaim.visible = false;
    this.group.add(this.exclaim);

    this.setPose('sit', 0.01);
  }

  private play(name: string, fade = 0.3, once = false) {
    if (!this.mixer) return;
    const next = this.actions.get(name);
    if (!next) return;
    if (next === this.current && !once) return;
    next.reset();
    if (once) {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
    }
    if (this.current && this.current !== next) next.crossFadeFrom(this.current, fade, false);
    next.play();
    this.current = next;
  }

  setPose(name: PoseName, time = 0.6) {
    this.walking = name === 'walk';
    switch (name) {
      case 'sit':
        this.play('Idle_Sit', time);
        break;
      case 'stand':
        this.play('StandUp', time, true);
        this.pendingAfter = { at: 0.9, clip: 'Idle_Stand', fade: 0.3 };
        this.oneShotUntil = 0.9;
        break;
      case 'walk':
        this.play('Walk', time);
        break;
      case 'kneel':
        this.play('Kneel', time, true);
        this.oneShotUntil = 1.0;
        break;
      case 'cuddle':
        this.play('Cuddle', time);
        break;
    }
  }

  react() {
    this.exclaimT = 1.1;
    this.exclaim.visible = true;
  }

  lookAt(pos: THREE.Vector3 | null) {
    this.lookTarget = pos;
  }

  get headWorldPos(): THREE.Vector3 {
    const v = new THREE.Vector3();
    if (this.headBone) this.headBone.getWorldPosition(v);
    else v.copy(this.group.position).add(new THREE.Vector3(0, 1.5, 0));
    return v;
  }

  update(dt: number, t: number, camera: THREE.Camera) {
    if (this.mixer) {
      // finish one-shots, then continue to their follow-up state
      if (this.oneShotUntil > 0) {
        this.oneShotUntil -= dt;
        if (this.oneShotUntil <= 0 && this.pendingAfter) {
          this.play(this.pendingAfter.clip, this.pendingAfter.fade);
          this.pendingAfter = null;
        }
      }
      this.mixer.update(dt);

      // procedural head look-at (applied after the mixer so it wins)
      if (this.headBone) {
        let targetYaw = 0;
        let targetPitch = 0;
        if (this.lookTarget) {
          const head = this.headWorldPos;
          const d = new THREE.Vector3().subVectors(this.lookTarget, head);
          targetYaw = Math.atan2(d.x, d.z) - this.group.rotation.y;
          while (targetYaw > Math.PI) targetYaw -= Math.PI * 2;
          while (targetYaw < -Math.PI) targetYaw += Math.PI * 2;
          targetYaw = THREE.MathUtils.clamp(targetYaw, -1.1, 1.1);
          targetPitch = THREE.MathUtils.clamp(-Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.5, 0.6);
        }
        // bone-local: character faces +Z in glTF space; yaw about Y, pitch about X
        const cur = this.headBone.rotation;
        cur.y += (targetYaw * 0.8 - cur.y) * Math.min(1, dt * 5);
        cur.x += (targetPitch * 0.8 - cur.x) * Math.min(1, dt * 5);
      }
    }

    if (this.exclaimT > 0) {
      this.exclaimT -= dt;
      const m = this.exclaim.material as any;
      m.opacity = Math.min(1, this.exclaimT * 4);
      const s = 1 + (1 - Math.min(1, this.exclaimT)) * 0.4;
      this.exclaim.scale.setScalar(Math.max(0.6, s));
      this.exclaim.quaternion.copy(camera.quaternion);
      if (this.exclaimT <= 0) this.exclaim.visible = false;
    }
    void t;
  }
}
