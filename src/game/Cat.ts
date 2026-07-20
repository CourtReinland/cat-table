import * as THREE from 'three/webgpu';
import { stdMat } from './Props';

const CREAM = 0xecd2ac;
const APRICOT = 0xdca878;
const PINK = 0xf08bb0;

/**
 * Suki — procedural stylized cat. Origin at the feet; faces +Z when yaw = 0.
 */
export class Cat {
  group = new THREE.Group();
  body!: THREE.Mesh;
  head!: THREE.Group;
  tailSegs: THREE.Mesh[] = [];
  legs: THREE.Mesh[] = [];
  private earL!: THREE.Mesh;
  private earR!: THREE.Mesh;
  private eyeL!: THREE.Mesh;
  private eyeR!: THREE.Mesh;
  private pawR!: THREE.Mesh;

  // anim state
  private walkPhase = 0;
  private blinkTimer = 2.5;
  private blink = 0;
  private earTwitch = 4;
  private pushTimer = 0;
  private idleTime = 0;
  private sitK = 0;
  yaw = 0;
  speed = 0;

  constructor() {
    this.build();
    this.group.scale.setScalar(1.18);
  }

  private build() {
    const fur = stdMat(CREAM, { rough: 0.95 });
    const furDark = stdMat(APRICOT, { rough: 0.95 });
    const pinkMat = stdMat(PINK, { rough: 0.6 });

    // body — horizontal capsule along Z
    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.24, 6, 12), fur);
    this.body.rotation.x = Math.PI / 2;
    this.body.position.y = 0.115;
    this.body.castShadow = true;
    this.group.add(this.body);

    // apricot back patch
    const patch = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), furDark);
    patch.scale.set(1.0, 0.55, 1.6);
    patch.position.set(0.02, 0.17, -0.04);
    this.group.add(patch);

    // head
    this.head = new THREE.Group();
    this.head.position.set(0, 0.225, 0.2);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.095, 14, 12), fur);
    skull.castShadow = true;
    this.head.add(skull);
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), stdMat(0xf8e8d2, { rough: 0.95 }));
    muzzle.position.set(0, -0.03, 0.075);
    this.head.add(muzzle);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.014, 6), pinkMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, -0.012, 0.115);
    this.head.add(nose);

    // ears
    const earGeo = new THREE.ConeGeometry(0.042, 0.078, 8);
    this.earL = new THREE.Mesh(earGeo, fur);
    this.earL.position.set(-0.05, 0.085, 0.01);
    this.earL.rotation.z = 0.25;
    this.earR = new THREE.Mesh(earGeo, fur);
    this.earR.position.set(0.05, 0.085, 0.01);
    this.earR.rotation.z = -0.25;
    const innerGeo = new THREE.ConeGeometry(0.018, 0.035, 6);
    const innerL = new THREE.Mesh(innerGeo, pinkMat);
    innerL.position.set(-0.048, 0.078, 0.022);
    innerL.rotation.z = 0.25;
    const innerR = new THREE.Mesh(innerGeo, pinkMat);
    innerR.position.set(0.048, 0.078, 0.022);
    innerR.rotation.z = -0.25;
    this.head.add(this.earL, this.earR, innerL, innerR);

    // eyes — big glossy amber
    const eyeGeo = new THREE.SphereGeometry(0.022, 10, 8);
    const eyeMat = stdMat(0x8a5a20, { rough: 0.15, emissive: 0x3a2408, emissiveIntensity: 0.5 });
    this.eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    this.eyeL.position.set(-0.042, 0.012, 0.082);
    this.eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    this.eyeR.position.set(0.042, 0.012, 0.082);
    const glintGeo = new THREE.SphereGeometry(0.005, 6, 4);
    const glintMat = stdMat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 2.2 });
    const glintL = new THREE.Mesh(glintGeo, glintMat);
    glintL.position.set(-0.037, 0.02, 0.097);
    const glintR = new THREE.Mesh(glintGeo, glintMat);
    glintR.position.set(0.047, 0.02, 0.097);
    this.head.add(this.eyeL, this.eyeR, glintL, glintR);

    // whiskers
    const whiskerMat = new THREE.MeshBasicNodeMaterial({ color: 0xfff8ee, transparent: true, opacity: 0.55 });
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.0006, 0.0006, 0.09, 3), whiskerMat);
        w.rotation.z = Math.PI / 2 + side * (0.1 + i * 0.12);
        w.position.set(side * 0.09, -0.02 - i * 0.008, 0.1);
        this.head.add(w);
      }
    }

    // pink bow on right ear
    const bowMat = stdMat(PINK, { rough: 0.5 });
    const bowL = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.03, 4), bowMat);
    bowL.rotation.z = Math.PI / 2;
    bowL.position.set(0.062, 0.115, 0.01);
    const bowR = bowL.clone();
    bowR.rotation.z = -Math.PI / 2;
    bowR.position.x = 0.095;
    const bowC = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 5), bowMat);
    bowC.position.set(0.078, 0.115, 0.01);
    this.head.add(bowL, bowR, bowC);

    this.group.add(this.head);

    // collar + bell
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.011, 8, 18), pinkMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 0.155, 0.135);
    collar.rotation.x = 1.25;
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), stdMat(0xf5c95a, { metal: 0.85, rough: 0.25 }));
    bell.position.set(0, 0.115, 0.185);
    this.group.add(collar, bell);

    // legs
    const legGeo = new THREE.CapsuleGeometry(0.024, 0.1, 4, 8);
    const legPos: [number, number][] = [
      [-0.055, 0.13],
      [0.055, 0.13],
      [-0.055, -0.13],
      [0.055, -0.13],
    ];
    for (const [x, z] of legPos) {
      const leg = new THREE.Mesh(legGeo, fur);
      leg.position.set(x, 0.07, z);
      leg.castShadow = true;
      this.legs.push(leg);
      this.group.add(leg);
    }
    this.pawR = this.legs[1];

    // tail — chained segments curving up
    const tailMat = fur;
    let parent: THREE.Object3D = this.group;
    let basePos = new THREE.Vector3(0, 0.15, -0.19);
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.Mesh(new THREE.CapsuleGeometry(0.016 - i * 0.0012, 0.05, 4, 8), i >= 4 ? furDark : tailMat);
      const pivot = new THREE.Group();
      pivot.position.copy(basePos);
      seg.position.y = 0.035;
      pivot.add(seg);
      parent.add(pivot);
      this.tailSegs.push(pivot as any);
      parent = pivot;
      basePos = new THREE.Vector3(0, 0.07, 0);
    }

    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
  }

  /** Paw-swipe animation trigger */
  push() {
    this.pushTimer = 0.32;
  }

  update(dt: number, t: number) {
    const sp = this.speed;
    this.walkPhase += dt * (4 + sp * 9);
    const p = this.walkPhase;
    const moving = sp > 0.05;
    this.idleTime = moving ? 0 : this.idleTime + dt;

    // settle into a sit when idle for a while
    const wantSit = this.idleTime > 3.5 && this.pushTimer <= 0 ? 1 : 0;
    this.sitK += (wantSit - this.sitK) * Math.min(1, dt * 3.2);
    const sit = this.sitK;

    // legs
    const amp = Math.min(1, sp * 1.6) * 0.55;
    const sitLeg = -2.2 * sit;
    this.legs[0].rotation.x = Math.sin(p) * amp * (1 - sit) + sitLeg;
    this.legs[1].rotation.x = Math.sin(p + Math.PI) * amp * (1 - sit) + sitLeg;
    this.legs[2].rotation.x = Math.sin(p + Math.PI) * amp * (1 - sit) + sitLeg * 0.9;
    this.legs[3].rotation.x = Math.sin(p) * amp * (1 - sit) + sitLeg * 0.9;

    // push animation overrides right paw
    if (this.pushTimer > 0) {
      this.pushTimer -= dt;
      const k = Math.sin((1 - this.pushTimer / 0.32) * Math.PI);
      this.pawR.rotation.x = -1.6 * k;
      this.pawR.position.z = 0.13 + 0.09 * k;
      this.body.rotation.x = Math.PI / 2 + 0.12 * k;
    } else {
      this.pawR.position.z = 0.13;
      this.body.rotation.x = Math.PI / 2 + Math.sin(p * 2) * 0.02 * amp + sit * 0.38;
    }

    // body bob + breathing; lower haunches when sitting
    const bob = moving ? Math.abs(Math.sin(p)) * 0.012 : Math.sin(t * 2.2) * 0.004;
    this.body.position.y = 0.115 + bob - sit * 0.028;
    this.head.position.y = 0.225 - sit * 0.012;
    this.head.position.z = 0.2 - sit * 0.03;

    // head: look-around when idle, forward when moving
    const headTargetY = moving ? 0 : Math.sin(t * 0.6) * 0.35;
    this.head.rotation.y += (headTargetY - this.head.rotation.y) * Math.min(1, dt * 3);
    this.head.rotation.x = moving ? 0.08 : Math.sin(t * 0.9) * 0.06;

    // tail: sine wave down the chain, wraps around when sitting
    const wag = moving ? 2.8 : 1.4;
    const wagAmp = (moving ? 0.28 : 0.16) * (1 - sit * 0.5);
    for (let i = 0; i < this.tailSegs.length; i++) {
      const seg = this.tailSegs[i];
      seg.rotation.z = Math.sin(t * wag + i * 0.7) * wagAmp * (0.3 + i * 0.16) + sit * i * 0.16;
      seg.rotation.x = -0.55 + Math.sin(t * wag * 0.7 + i * 0.5) * 0.1 - sit * 0.12;
    }

    // blink
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blink = 0.14;
      this.blinkTimer = 2 + Math.random() * 3.5;
    }
    if (this.blink > 0) {
      this.blink -= dt;
      const s = this.blink > 0.07 ? 0.12 : 1;
      this.eyeL.scale.y = s;
      this.eyeR.scale.y = s;
    } else {
      this.eyeL.scale.y = 1;
      this.eyeR.scale.y = 1;
    }

    // ear twitch
    this.earTwitch -= dt;
    if (this.earTwitch <= 0) {
      this.earTwitch = 3 + Math.random() * 5;
      const ear = Math.random() < 0.5 ? this.earL : this.earR;
      ear.scale.setScalar(1.25);
      setTimeout(() => ear.scale.setScalar(1), 140);
    }

    // facing
    this.group.rotation.y = this.yaw;
  }
}
