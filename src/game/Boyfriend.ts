import * as THREE from 'three/webgpu';
import { stdMat } from './Props';
import type { BoyDef } from '../data/content';

type PoseName = 'sit' | 'stand' | 'walk' | 'kneel' | 'cuddle';

interface Pose {
  rootY: number;
  torsoX: number;
  armL: [number, number];
  armR: [number, number];
  thighLX: number;
  shinLX: number;
  thighRX: number;
  shinRX: number;
}

const POSES: Record<PoseName, Pose> = {
  sit: { rootY: 0.5, torsoX: 0.14, armL: [0.75, 0.06], armR: [0.75, -0.06], thighLX: -1.35, shinLX: 1.35, thighRX: -1.35, shinRX: 1.35 },
  stand: { rootY: 0.92, torsoX: 0, armL: [0.06, 0.09], armR: [0.06, -0.09], thighLX: 0, shinLX: 0, thighRX: 0, shinRX: 0 },
  walk: { rootY: 0.92, torsoX: 0.07, armL: [0.15, 0.09], armR: [-0.15, -0.09], thighLX: 0, shinLX: 0, thighRX: 0, shinRX: 0 },
  kneel: { rootY: 0.5, torsoX: 0.16, armL: [0.85, 0.3], armR: [0.85, -0.3], thighLX: -0.5, shinLX: 2.3, thighRX: -0.5, shinRX: 2.3 },
  cuddle: { rootY: 0.5, torsoX: 0.12, armL: [1.3, 0.45], armR: [1.3, -0.45], thighLX: -0.5, shinLX: 2.3, thighRX: -0.5, shinRX: 2.3 },
};

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

/** Stylized procedural boyfriend. Built standing; posed via POSES. Faces +Z. */
export class Boyfriend {
  group = new THREE.Group();
  private torso!: THREE.Group;
  private headG!: THREE.Group;
  private armL!: THREE.Group;
  private armR!: THREE.Group;
  private thighL!: THREE.Group;
  private shinL!: THREE.Group;
  private thighR!: THREE.Group;
  private shinR!: THREE.Group;
  private exclaim!: THREE.Mesh;
  private exclaimT = 0;

  private current: Pose = { ...POSES.sit };
  private from: Pose = { ...POSES.sit };
  private target: Pose = { ...POSES.sit };
  private blend = 1;
  private blendTime = 0.6;
  private walkT = 0;
  walking = false;
  lookTarget: THREE.Vector3 | null = null;
  private gazeTimer = 2;
  private gazeHold = 0;
  private _wander: THREE.Vector3 | undefined;
  def: BoyDef;

  constructor(def: BoyDef) {
    this.def = def;
    this.build(def);
    this.setPose('sit', 0.01);
  }

  private build(def: BoyDef) {
    const skin = stdMat(0xeec39a, { rough: 0.65 });
    const outfit = stdMat(def.outfitColor, { rough: 0.85 });
    const pants = stdMat(0x2c2836, { rough: 0.9 });
    const hair = stdMat(def.hairColor, { rough: 0.7 });

    // ── torso (pivot at hip) ──
    this.torso = new THREE.Group();
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.155, 0.4, 6, 12), outfit);
    chest.position.y = 0.3;
    chest.castShadow = true;
    this.torso.add(chest);
    // shoulders
    const shoulders = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.28, 4, 8), outfit);
    shoulders.rotation.z = Math.PI / 2;
    shoulders.position.y = 0.5;
    shoulders.castShadow = true;
    this.torso.add(shoulders);
    // neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.09, 8), skin);
    neck.position.y = 0.6;
    this.torso.add(neck);

    // ── head ──
    this.headG = new THREE.Group();
    this.headG.position.y = 0.72;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 12), skin);
    skull.castShadow = true;
    this.headG.add(skull);
    // ears + nose hint
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), skin);
      ear.position.set(side * 0.105, 0, 0);
      this.headG.add(ear);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 5), skin);
    nose.position.set(0, -0.01, 0.108);
    this.headG.add(nose);

    // hair — top cap + style, kept off the face
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.118, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), hair);
    cap.position.set(0, 0.012, -0.012);
    this.headG.add(cap);
    const backHair = new THREE.Mesh(new THREE.SphereGeometry(0.112, 12, 8, 0, Math.PI, Math.PI * 0.2, Math.PI * 0.55), hair);
    backHair.rotation.y = -Math.PI / 2;
    backHair.position.set(0, 0.01, -0.01);
    this.headG.add(backHair);
    if (def.id === 'jasper') {
      for (let i = 0; i < 5; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.085, 6), hair);
        spike.position.set((i - 2) * 0.045, 0.105, 0.02 - Math.abs(i - 2) * 0.012);
        spike.rotation.z = (i - 2) * -0.3;
        this.headG.add(spike);
      }
    } else if (def.id === 'kai') {
      const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.05), hair);
      fringe.position.set(0.03, 0.055, 0.085);
      fringe.rotation.z = -0.18;
      this.headG.add(fringe);
      const long = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.24, 0.07), hair);
      long.position.set(0, -0.06, -0.09);
      this.headG.add(long);
    } else if (def.id === 'theo') {
      for (let i = 0; i < 6; i++) {
        const curl = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 6), hair);
        const a = (i / 6) * Math.PI - Math.PI / 2;
        curl.position.set(Math.cos(a) * 0.085, 0.06 + Math.sin(a) * 0.05, 0.045);
        this.headG.add(curl);
      }
    } else if (def.id === 'ren') {
      const slick = new THREE.Mesh(new THREE.SphereGeometry(0.112, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), hair);
      slick.position.set(0, 0.028, -0.02);
      slick.scale.set(0.98, 0.9, 1.02);
      this.headG.add(slick);
    } else {
      // eli — soft side fringe
      const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), hair);
      fringe.position.set(0.055, 0.055, 0.07);
      fringe.scale.set(1.5, 0.55, 0.7);
      this.headG.add(fringe);
    }

    // eyes + brows
    const eyeMat = stdMat(0x241c16, { rough: 0.25 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 5), eyeMat);
      eye.position.set(side * 0.042, 0.008, 0.102);
      this.headG.add(eye);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.007, 0.008), hair);
      brow.position.set(side * 0.042, 0.045, 0.1);
      brow.rotation.z = side * -0.1;
      this.headG.add(brow);
    }
    // soft smile
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.004, 6, 10, Math.PI * 0.7), stdMat(0xb87a5a, { rough: 0.6 }));
    smile.position.set(0, -0.038, 0.1);
    smile.rotation.x = -0.3;
    smile.rotation.z = Math.PI + Math.PI * 0.15;
    this.headG.add(smile);
    this.torso.add(this.headG);

    // accessories
    if (def.id === 'kai') {
      const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.042, 8, 14), stdMat(0x8a2a3a, { rough: 0.9 }));
      scarf.rotation.x = Math.PI / 2;
      scarf.position.y = 0.56;
      this.torso.add(scarf);
    } else if (def.id === 'theo') {
      const apron = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.4, 0.02), stdMat(0xf5efe4, { rough: 0.95 }));
      apron.position.set(0, 0.24, 0.15);
      this.torso.add(apron);
    } else if (def.id === 'ren') {
      const cravat = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.025), stdMat(0xd8cfc0, { rough: 0.8 }));
      cravat.position.set(0, 0.5, 0.135);
      this.torso.add(cravat);
    } else if (def.id === 'jasper') {
      const watch = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10), stdMat(0x3a3a44, { metal: 0.6, rough: 0.3 }));
      watch.rotation.x = Math.PI / 2;
      watch.position.set(-0.23, 0.02, 0.06);
      this.torso.add(watch);
    }

    // ── arms (shoulder pivots) ──
    const mkArm = (side: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.225, 0.48, 0);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.24, 4, 8), outfit);
      upper.position.y = -0.16;
      upper.castShadow = true;
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.22, 4, 8), skin);
      fore.position.y = -0.4;
      fore.castShadow = true;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 6), skin);
      hand.position.y = -0.54;
      pivot.add(upper, fore, hand);
      this.torso.add(pivot);
      return pivot;
    };
    this.armL = mkArm(-1);
    this.armR = mkArm(1);

    // ── legs (hip + knee pivots) ──
    const mkLeg = (side: number) => {
      const thigh = new THREE.Group();
      thigh.position.set(side * 0.09, 0.0, 0);
      const thighMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.34, 4, 8), pants);
      thighMesh.position.y = -0.2;
      thighMesh.castShadow = true;
      thigh.add(thighMesh);
      const shin = new THREE.Group();
      shin.position.y = -0.42;
      const shinMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.32, 4, 8), pants);
      shinMesh.position.y = -0.18;
      shinMesh.castShadow = true;
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.19), stdMat(0x1c1814, { rough: 0.5 }));
      shoe.position.set(0, -0.4, 0.035);
      shin.add(shinMesh, shoe);
      thigh.add(shin);
      this.group.add(thigh);
      return { thigh, shin };
    };
    const legL = mkLeg(-1);
    const legR = mkLeg(1);
    this.thighL = legL.thigh;
    this.shinL = legL.shin;
    this.thighR = legR.thigh;
    this.shinR = legR.shin;

    this.group.add(this.torso);

    // "!" emote
    const mat = new THREE.MeshBasicNodeMaterial({ map: exclaimTexture(), transparent: true, opacity: 0, depthWrite: false });
    this.exclaim = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), mat);
    this.exclaim.position.y = 1.9;
    this.exclaim.visible = false;
    this.group.add(this.exclaim);
  }

  setPose(name: PoseName, time = 0.6) {
    this.from = { ...this.current };
    this.target = { ...POSES[name] };
    this.blend = 0;
    this.blendTime = Math.max(0.01, time);
    this.walking = name === 'walk';
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
    this.headG.getWorldPosition(v);
    return v;
  }

  private applyPose(p: Pose) {
    this.group.position.y = p.rootY;
    this.torso.rotation.x = p.torsoX;
    this.armL.rotation.set(p.armL[0], 0, p.armL[1]);
    this.armR.rotation.set(p.armR[0], 0, p.armR[1]);
    this.thighL.rotation.x = p.thighLX;
    this.shinL.rotation.x = p.shinLX;
    this.thighR.rotation.x = p.thighRX;
    this.shinR.rotation.x = p.shinRX;

    if (this.walking) {
      const s = Math.sin(this.walkT * 8);
      const c = Math.sin(this.walkT * 8 + Math.PI);
      this.thighL.rotation.x = s * 0.45;
      this.thighR.rotation.x = c * 0.45;
      this.shinL.rotation.x = Math.max(0, -s) * 0.7;
      this.shinR.rotation.x = Math.max(0, -c) * 0.7;
      this.armL.rotation.x = c * 0.3;
      this.armR.rotation.x = s * 0.3;
      this.group.position.y += Math.abs(Math.sin(this.walkT * 8)) * 0.025;
    }
  }

  update(dt: number, t: number, camera: THREE.Camera) {
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / this.blendTime);
      const k = this.blend * this.blend * (3 - 2 * this.blend);
      const lerp = (a: number, b: number) => a + (b - a) * k;
      this.current = {
        rootY: lerp(this.from.rootY, this.target.rootY),
        torsoX: lerp(this.from.torsoX, this.target.torsoX),
        armL: [lerp(this.from.armL[0], this.target.armL[0]), lerp(this.from.armL[1], this.target.armL[1])],
        armR: [lerp(this.from.armR[0], this.target.armR[0]), lerp(this.from.armR[1], this.target.armR[1])],
        thighLX: lerp(this.from.thighLX, this.target.thighLX),
        shinLX: lerp(this.from.shinLX, this.target.shinLX),
        thighRX: lerp(this.from.thighRX, this.target.thighRX),
        shinRX: lerp(this.from.shinRX, this.target.shinRX),
      };
    }
    if (this.walking) this.walkT += dt;
    this.applyPose(this.current);

    // breathing
    this.torso.scale.y = 1 + Math.sin(t * 1.6) * 0.012;

    // head look-at (or idle gaze wandering around the room)
    if (!this.lookTarget) {
      this.gazeTimer -= dt;
      if (this.gazeTimer <= 0) {
        this.gazeTimer = 2.5 + Math.random() * 3.5;
        this.gazeHold = 1.4 + Math.random() * 1.6;
        this._wander = this._wander ?? new THREE.Vector3();
        this._wander.set(
          this.group.position.x + (Math.random() - 0.5) * 4,
          0.6 + Math.random() * 1.2,
          this.group.position.z + 1 + Math.random() * 3,
        );
      }
    }
    const lookGoal = this.lookTarget ?? (this.gazeHold > 0 ? this._wander! : null);
    if (this.gazeHold > 0) this.gazeHold -= dt;
    let targetYaw = 0;
    let targetPitch = 0;
    if (lookGoal) {
      const head = this.headWorldPos;
      const d = new THREE.Vector3().subVectors(lookGoal, head);
      targetYaw = Math.atan2(d.x, d.z) - this.group.rotation.y;
      while (targetYaw > Math.PI) targetYaw -= Math.PI * 2;
      while (targetYaw < -Math.PI) targetYaw += Math.PI * 2;
      targetYaw = THREE.MathUtils.clamp(targetYaw, -1.1, 1.1);
      targetPitch = THREE.MathUtils.clamp(-Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.5, 0.6);
    }
    this.headG.rotation.y += (targetYaw - this.headG.rotation.y) * Math.min(1, dt * 4);
    this.headG.rotation.x += (targetPitch - this.headG.rotation.x) * Math.min(1, dt * 4);

    // exclaim pop
    if (this.exclaimT > 0) {
      this.exclaimT -= dt;
      const m = this.exclaim.material as any;
      m.opacity = Math.min(1, this.exclaimT * 4);
      const s = 1 + (1 - Math.min(1, this.exclaimT)) * 0.4;
      this.exclaim.scale.setScalar(Math.max(0.6, s));
      this.exclaim.quaternion.copy(camera.quaternion);
      if (this.exclaimT <= 0) this.exclaim.visible = false;
    }
  }
}
