import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Cat } from './Cat';
import { toonifySukiCoat } from './Toon';
import { isSteerActive, leanFromYawRate } from './Steer';
import { CLIP, GLB_SCALE, GLB_YAW_OFFSET, USE_SIT_FOR_LONG_IDLE, SUKI_PAW_BONES, SUKI_BOW, SUKI_TAIL, SUKI_FACE } from './sukiGlb';

export { CLIP, GLB_SCALE, GLB_YAW_OFFSET, USE_SIT_FOR_LONG_IDLE } from './sukiGlb';

/**
 * Suki — playable heroine.
 *
 * Primary representation is `assets/models/suki.glb`, a standing Hunyuan
 * quadruped from tools/character-pipe/ (bind_suki_stand.py): fluffy white
 * kitten, sapphire eyes, pink bow. Rest pose is four-on-floor. Bound clips:
 * Idle, Idle_Look, Walk, Run, Swipe, Sit, Cuddle, Hit.
 *
 * The old procedural cat stays as a fallback if the GLB fails to load, and can
 * be forced with `?suki=proc` for a quick A/B.
 */

const _tailNudgeQ = new Map<string, THREE.Quaternion>();

function tailNudgeQuat(name: keyof typeof SUKI_TAIL.nudge) {
  let q = _tailNudgeQ.get(name);
  if (!q) {
    const e = SUKI_TAIL.nudge[name];
    q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(e.x),
        THREE.MathUtils.degToRad(e.y),
        THREE.MathUtils.degToRad(e.z),
        'XYZ',
      ),
    );
    _tailNudgeQ.set(name, q);
  }
  return q;
}

function heroBowMaterial() {
  const m = new THREE.MeshBasicNodeMaterial({
    color: SUKI_BOW.pink,
    side: THREE.DoubleSide,
  });
  return m;
}

function faceMat(hex: number) {
  return new THREE.MeshBasicNodeMaterial({ color: hex, side: THREE.DoubleSide });
}

function addEye(root: THREE.Group, sign: number) {
  const sap = faceMat(SUKI_FACE.sapphire);
  const ink = faceMat(SUKI_FACE.lash);
  const blushM = faceMat(SUKI_FACE.blush);
  const hi = faceMat(SUKI_FACE.highlight);
  // Head +Y = muzzle-forward, +Z = down the face, +X = cat-right.
  const x = sign * 0.016;
  const y = 0.004;
  const z = -0.004;
  const r = SUKI_FACE.eyeRadius;
  const iris = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), sap);
  iris.name = sign > 0 ? 'EyeL' : 'EyeR';
  iris.scale.set(1, 0.52, 0.9);
  iris.position.set(x, y, z);
  iris.frustumCulled = false;
  root.add(iris);

  const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.38, 10, 8), ink);
  pupil.name = iris.name + 'Pupil';
  pupil.position.set(x, y + r * 0.42, z);
  pupil.frustumCulled = false;
  root.add(pupil);

  const glint = new THREE.Mesh(new THREE.SphereGeometry(r * 0.2, 8, 6), hi);
  glint.name = iris.name + 'Glint';
  glint.position.set(x + sign * 0.004, y + r * 0.55, z - 0.006);
  glint.frustumCulled = false;
  root.add(glint);

  for (let i = 0; i < 3; i++) {
    const lash = new THREE.Mesh(new THREE.ConeGeometry(0.002, 0.011, 5), ink);
    lash.name = iris.name + 'Lash' + i;
    lash.position.set(x + sign * (0.006 + i * 0.0035), y + 0.002, z - 0.011 - i * 0.001);
    lash.rotation.x = 0.85;
    lash.rotation.z = sign * (0.28 + i * 0.22);
    lash.frustumCulled = false;
    root.add(lash);
  }

  const blush = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), blushM);
  blush.name = sign > 0 ? 'BlushL' : 'BlushR';
  blush.scale.set(1.2, 0.45, 0.7);
  blush.position.set(x + sign * 0.003, y - 0.002, z + 0.016);
  blush.frustumCulled = false;
  root.add(blush);
}

/** Sapphire eyes + lashes + blush + nose, sized to read vs approved sit. */
export function buildHeroFaceMesh() {
  const root = new THREE.Group();
  root.name = 'HeroFace';
  addEye(root, 1);
  addEye(root, -1);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 6), faceMat(SUKI_FACE.nose));
  nose.name = 'Nose';
  nose.scale.set(1.15, 0.65, 0.75);
  nose.position.set(0, 0.014, 0.01);
  nose.frustumCulled = false;
  root.add(nose);
  root.position.set(SUKI_FACE.headLocal.x, SUKI_FACE.headLocal.y, SUKI_FACE.headLocal.z);
  return root;
}

/** Two loops + knot + tails, sized to read from default OTS. */
export function buildHeroBowMesh() {
  const mat = heroBowMaterial();
  const root = new THREE.Group();
  root.name = 'HeroBow';

  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.015, 10, 8), mat);
  knot.name = 'BowKnot';
  root.add(knot);

  const r = SUKI_BOW.loopRadius;
  const loopL = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), mat);
  loopL.name = 'BowLoopL';
  loopL.scale.set(r, r * 0.55, r * 0.72);
  loopL.position.set(r + 0.006, 0.008, 0.002);
  loopL.rotation.z = 0.42;
  loopL.rotation.y = 0.28;
  loopL.frustumCulled = false;
  root.add(loopL);

  const loopR = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), mat);
  loopR.name = 'BowLoopR';
  loopR.scale.set(r, r * 0.55, r * 0.72);
  loopR.position.set(-(r + 0.006), 0.008, 0.002);
  loopR.rotation.z = -0.42;
  loopR.rotation.y = -0.28;
  loopR.frustumCulled = false;
  root.add(loopR);

  const tailL = new THREE.Mesh(new THREE.ConeGeometry(0.011, SUKI_BOW.tailLength, 8), mat);
  tailL.name = 'BowTailL';
  tailL.position.set(0.016, -0.03, -0.024);
  tailL.rotation.x = Math.PI * 0.72;
  tailL.rotation.z = 0.38;
  tailL.frustumCulled = false;
  root.add(tailL);

  const tailR = new THREE.Mesh(new THREE.ConeGeometry(0.011, SUKI_BOW.tailLength, 8), mat);
  tailR.name = 'BowTailR';
  tailR.position.set(-0.016, -0.03, -0.024);
  tailR.rotation.x = Math.PI * 0.72;
  tailR.rotation.z = -0.38;
  tailR.frustumCulled = false;
  root.add(tailR);
  knot.frustumCulled = false;
  root.position.set(SUKI_BOW.napeLocal.x, SUKI_BOW.napeLocal.y, SUKI_BOW.napeLocal.z);
  return root;
}

export class Suki {
  group = new THREE.Group();
  yaw = 0;
  /** rad/s from stepProwl — drives a light bank so yaw is not a rigid spin. */
  yawRate = 0;
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
  private skeleton: THREE.Skeleton | null = null;
  private pawBones: THREE.Bone[] = [];
  private heroBow: THREE.Group | null = null;
  private heroFace: THREE.Group | null = null;
  /** Skip a duplicate mixer tick when Game already advanced paws this frame. */
  private animAdvanced = false;
  private _pawWorld = [new THREE.Vector3(), new THREE.Vector3()];

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
      this.inner.rotation.y = GLB_YAW_OFFSET;
      this.inner.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = false;
          m.frustumCulled = false; // skinned bounds go stale during big swipes
        }
      });
      toonifySukiCoat(this.inner);
      // No inverted-hull: 77k Hunyuan tris + noisy normals = black pencil scribble.
      this.inner.traverse((o) => {
        const sk = o as THREE.SkinnedMesh;
        if (sk.isSkinnedMesh && sk.skeleton) {
          this.skeleton = sk.skeleton;
          this.pawBones = [];
          for (const name of SUKI_PAW_BONES) {
            const bone = sk.skeleton.bones.find((b) => b.name === name);
            if (bone) this.pawBones.push(bone);
          }
          this.attachHeroBow(sk.skeleton);
          this.attachHeroFace(sk.skeleton);
        }
      });

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
      console.info(
        '[suki] Hunyuan GLB loaded —',
        gltf.animations.length,
        'clips; tail nudge',
        SUKI_TAIL.nudge.tail_01,
      );
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

  /**
   * Advance the swipe pose before Game samples paw hit volumes, then skip
   * the mixer tick in update() so clips do not double-speed.
   */
  preparePaws(dt: number) {
    if (this.useGlb) {
      if (this.mixer && !this.animAdvanced) {
        this.mixer.update(dt);
        this.applyTailNudge();
        this.animAdvanced = true;
      }
    } else {
      this.cat.update(dt, 0);
      this.animAdvanced = true;
    }
    this.group.updateMatrixWorld(true);
  }

  /**
   * Idle/rest plume sits on the OTS-left HeroBow loop (loopL). Mixer owns
   * the clip; a fixed local quaternion is post-multiplied so Idle still wags
   * around the bias. Do not euler-add (tail_01 rest is gimbal-locked). Do
   * not bind Sit as rest.
   */
  private applyTailNudge() {
    if (!this.skeleton) return;
    for (const name of SUKI_TAIL.bones) {
      const bone = this.skeleton.bones.find((b) => b.name === name);
      const n = SUKI_TAIL.nudge[name];
      if (!bone || !n) continue;
      bone.quaternion.multiply(tailNudgeQuat(name));
    }
  }

  /** World-space front paw tips (GLB bones, or procedural paws). */
  getPawTips(): THREE.Vector3[] {
    if (this.useGlb && this.pawBones.length) {
      return this.pawBones.map((b, i) => b.getWorldPosition(this._pawWorld[i] ?? new THREE.Vector3()));
    }
    return this.cat.getPawTips(this._pawWorld);
  }

  /** Nape overlay parented to `bow` — Hunyuan strip cannot silhouette from OTS. */
  private attachHeroBow(skeleton: THREE.Skeleton) {
    if (this.heroBow || !SUKI_BOW.napeMesh) return;
    const bone = skeleton.bones.find((b) => b.name === SUKI_BOW.parentBone);
    if (!bone) return;
    this.heroBow = buildHeroBowMesh();
    bone.add(this.heroBow);
  }

  /** Face furniture on `head` — Hunyuan iris islands stay a blue dot from play cameras. */
  private attachHeroFace(skeleton: THREE.Skeleton) {
    if (this.heroFace || !SUKI_FACE.overlay) return;
    const bone = skeleton.bones.find((b) => b.name === SUKI_FACE.parentBone);
    if (!bone) return;
    this.heroFace = buildHeroFaceMesh();
    bone.add(this.heroFace);
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
      if (this.inner) {
        this.inner.rotation.copy(_e);
        this.inner.rotation.y += GLB_YAW_OFFSET;
      }
      this.cat.group.rotation.copy(_e);
      if (this.tumbleT <= 0) {
        this.inner?.rotation.set(0, GLB_YAW_OFFSET, 0);
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
      this.cat.yawRate = this.yawRate;
      this.cat.speed = this.speed;
      this.cat.update(dt, t);
      this.group.rotation.y = this.yaw;
      this.animAdvanced = false;
      return;
    }
    if (!this.mixer) return;

    const moving = this.speed > 0.08;
    const active = isSteerActive(this.speed, this.yawRate);
    this.idleTime = active ? 0 : this.idleTime + dt;

    if (this.oneShotUntil > 0) {
      this.oneShotUntil -= dt;
    } else if (this.speed > 1.15) {
      this.play(CLIP.run);
      this.current!.timeScale = THREE.MathUtils.clamp(this.speed / 1.4, 0.85, 1.9);
    } else if (moving) {
      this.play(CLIP.walk);
      this.current!.timeScale = THREE.MathUtils.clamp(this.speed / 0.75, 0.6, 2.0);
    } else if (active) {
      // Planted A/D holds speed at 0; stand-idle yaws. Do not look/sit.
      this.play(CLIP.idle, 0.2);
      this.current!.timeScale = 1;
    } else if (USE_SIT_FOR_LONG_IDLE && this.idleTime > 5.5) {
      this.play(CLIP.sit, 0.5, true);
      this.current!.timeScale = 1;
    } else if (this.idleTime > 2.5) {
      this.play(CLIP.look, 0.5);
      this.current!.timeScale = 1;
    } else {
      this.play(CLIP.idle, 0.35);
      this.current!.timeScale = 1;
    }

    if (this.mixer && !this.animAdvanced) {
      this.mixer.update(dt);
      this.applyTailNudge();
    }
    this.animAdvanced = false;
    this.group.rotation.y = this.yaw;
    // Light bank on the mesh — group yaw stays the gameplay heading so
    // first-person / camera math stay upright. Skip while a tumble owns inner.
    if (this.tumbleT <= 0 && this.inner) {
      this.inner.rotation.y = GLB_YAW_OFFSET;
      const lean = leanFromYawRate(this.yawRate);
      this.inner.rotation.z += (lean - this.inner.rotation.z) * Math.min(1, dt * 10);
    }
  }
}
