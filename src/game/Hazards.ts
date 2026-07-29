import * as THREE from 'three/webgpu';
import { stdMat } from './Props';
import type { SurfaceRect } from './Physics';
import type { Difficulty } from '../data/content';

export type HazardHitKind = 'hand' | 'mouse';

/**
 * Counter hazards: Heather's hand (sweep to scoop Suki) and a cheeky mouse.
 * Purely visual + hit-radius; Game owns fail thresholds.
 */
export class Hazards {
  group = new THREE.Group();
  private hand = new THREE.Group();
  private mouse = new THREE.Group();
  private handActive = false;
  private mouseActive = false;
  private handT = 0;
  private mouseT = 0;
  private handCD = 6;
  private mouseCD = 4;
  /**
   * A hazard may only land one hit per appearance. Without this the mouse —
   * which homes in and lingers — became a damage aura that could burn every
   * life in a single visit, and lives stopped meaning "mistakes".
   */
  private handScored = false;
  private mouseScored = false;
  private surface: SurfaceRect = { cx: 0, cz: 0, halfW: 2, halfD: 1, topY: 1 };
  private handHitRadius = 0.28;
  private mouseHitRadius = 0.18;
  /** seconds of invuln after a hit so one pass doesn't multi-count */
  private hitIFrame = 0;

  constructor(scene: THREE.Scene) {
    this.buildHand();
    this.buildMouse();
    this.hand.visible = false;
    this.mouse.visible = false;
    this.group.add(this.hand, this.mouse);
    scene.add(this.group);
  }

  private buildHand() {
    // forearm + palm + fingers — soft skin tone, reads as "human hand from offscreen"
    const skin = stdMat(0xe8b89a, { rough: 0.75 });
    const nail = stdMat(0xf5d0c8, { rough: 0.45 });
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.32, 4, 10), skin);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(-0.18, 0, 0);
    arm.castShadow = true;
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.16), skin);
    palm.position.set(0.06, 0, 0);
    palm.castShadow = true;
    this.hand.add(arm, palm);
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.07, 3, 6), skin);
      f.position.set(0.14, 0.01, -0.05 + i * 0.035);
      f.rotation.z = -0.4;
      f.castShadow = true;
      this.hand.add(f);
      const n = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, 0.014), nail);
      n.position.set(0.175, 0.02, -0.05 + i * 0.035);
      this.hand.add(n);
    }
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.05, 3, 6), skin);
    thumb.position.set(0.08, 0.02, 0.09);
    thumb.rotation.set(0.4, 0, -0.8);
    this.hand.add(thumb);
  }

  private buildMouse() {
    const fur = stdMat(0x9a8a78, { rough: 0.9 });
    const pink = stdMat(0xf0a0b0, { rough: 0.6 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), fur);
    body.scale.set(1.35, 0.85, 1.1);
    body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), fur);
    head.position.set(0.06, 0.01, 0);
    const earL = new THREE.Mesh(new THREE.CircleGeometry(0.022, 8), pink);
    earL.position.set(0.05, 0.04, 0.025);
    earL.rotation.y = 0.5;
    const earR = earL.clone();
    earR.position.z = -0.025;
    earR.rotation.y = -0.5;
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.003, 0.14, 5), pink);
    tail.rotation.z = Math.PI / 2;
    tail.position.set(-0.1, 0.02, 0);
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.006, 6, 5),
      stdMat(0x1a1010, { rough: 0.3, emissive: 0x110808, emissiveIntensity: 0.4 }),
    );
    eye.position.set(0.08, 0.02, 0.018);
    const eye2 = eye.clone();
    eye2.position.z = -0.018;
    this.mouse.add(body, head, earL, earR, tail, eye, eye2);
  }

  /** Level pressure; set by reset(). Defaults match the gentlest level. */
  private diff: Difficulty = {
    lives: 6,
    timeLimit: 150,
    handGap: [7, 11],
    handSweep: 1.5,
    mouseGap: [7, 12],
    mouseSpeed: 1.5,
    maxConcurrent: 1,
  };

  private gap([min, max]: [number, number]) {
    return min + Math.random() * (max - min);
  }

  /** true when another hazard may start right now */
  private hasRoom() {
    const live = (this.handActive ? 1 : 0) + (this.mouseActive ? 1 : 0);
    return live < this.diff.maxConcurrent;
  }

  reset(surface: SurfaceRect, diff?: Difficulty) {
    this.surface = surface;
    if (diff) this.diff = diff;
    this.handActive = false;
    this.mouseActive = false;
    this.hand.visible = false;
    this.mouse.visible = false;
    // first threat is deliberately late so the player gets a beat to read the table
    this.handCD = this.gap(this.diff.handGap) * 1.5;
    this.mouseCD = this.gap(this.diff.mouseGap) * 1.5;
    this.handScored = false;
    this.mouseScored = false;
    this.hitIFrame = 0;
    this.handT = 0;
    this.mouseT = 0;
  }

  clear() {
    this.handActive = false;
    this.mouseActive = false;
    this.hand.visible = false;
    this.mouse.visible = false;
  }

  /**
   * @returns which hazard hit the cat this frame (at most one), or null
   */
  update(dt: number, catPos: THREE.Vector3, enabled: boolean): HazardHitKind | null {
    if (!enabled) {
      this.clear();
      return null;
    }
    this.hitIFrame = Math.max(0, this.hitIFrame - dt);
    let hit: HazardHitKind | null = null;
    const s = this.surface;

    // schedule hand
    if (!this.handActive) {
      this.handCD -= dt;
      if (this.handCD <= 0 && this.hasRoom()) {
        this.handActive = true;
        this.handScored = false;
        this.handT = 0;
        this.hand.visible = true;
        // enter from a random side
        const side = Math.random() < 0.5 ? -1 : 1;
        this.hand.position.set(
          s.cx + side * (s.halfW + 0.55),
          s.topY + 0.12,
          s.cz + (Math.random() - 0.5) * s.halfD * 1.2,
        );
        this.hand.rotation.y = side > 0 ? Math.PI : 0;
        this.hand.userData.side = side;
        this.hand.userData.targetZ = catPos.z;
      }
    } else {
      this.handT += dt;
      const side = this.hand.userData.side as number;
      // sweep across the table toward cat Z
      const k = Math.min(1, this.handT / this.diff.handSweep);
      const ease = k * k * (3 - 2 * k);
      const fromX = s.cx + side * (s.halfW + 0.55);
      const toX = s.cx - side * (s.halfW + 0.55);
      this.hand.position.x = fromX + (toX - fromX) * ease;
      this.hand.position.z += ((this.hand.userData.targetZ as number) - this.hand.position.z) * Math.min(1, dt * 2.2);
      this.hand.position.y = s.topY + 0.1 + Math.sin(this.handT * 9) * 0.02;
      // grab pose near cat
      if (
        !this.handScored &&
        this.hitIFrame <= 0 &&
        Math.hypot(this.hand.position.x - catPos.x, this.hand.position.z - catPos.z) < this.handHitRadius
      ) {
        hit = 'hand';
        this.handScored = true;
        this.hitIFrame = 0.9;
      }
      if (this.handT > this.diff.handSweep + 0.15) {
        this.handActive = false;
        this.hand.visible = false;
        this.handCD = this.gap(this.diff.handGap);
      }
    }

    // schedule mouse
    if (!this.mouseActive) {
      this.mouseCD -= dt;
      if (this.mouseCD <= 0 && this.hasRoom()) {
        this.mouseActive = true;
        this.mouseScored = false;
        this.mouseT = 0;
        this.mouse.visible = true;
        const edge = Math.floor(Math.random() * 4);
        const m = 0.12;
        if (edge === 0) this.mouse.position.set(s.cx - s.halfW + m, s.topY + 0.04, s.cz + (Math.random() - 0.5) * s.halfD);
        else if (edge === 1) this.mouse.position.set(s.cx + s.halfW - m, s.topY + 0.04, s.cz + (Math.random() - 0.5) * s.halfD);
        else if (edge === 2) this.mouse.position.set(s.cx + (Math.random() - 0.5) * s.halfW, s.topY + 0.04, s.cz - s.halfD + m);
        else this.mouse.position.set(s.cx + (Math.random() - 0.5) * s.halfW, s.topY + 0.04, s.cz + s.halfD - m);
        this.mouse.userData.vx = (Math.random() - 0.5) * 1.6;
        this.mouse.userData.vz = (Math.random() - 0.5) * 1.6;
      }
    } else {
      this.mouseT += dt;
      let vx = this.mouse.userData.vx as number;
      let vz = this.mouse.userData.vz as number;
      // scurry + slight chase of cat
      const toCatX = catPos.x - this.mouse.position.x;
      const toCatZ = catPos.z - this.mouse.position.z;
      const dist = Math.hypot(toCatX, toCatZ) || 1;
      // stops hunting once it has had its bite, so the flee actually sticks
      const chase = this.mouseScored ? 0 : 0.9;
      vx += (toCatX / dist) * chase * dt;
      vz += (toCatZ / dist) * chase * dt;
      const top = this.diff.mouseSpeed;
      const sp = Math.hypot(vx, vz);
      if (sp > top) {
        vx = (vx / sp) * top;
        vz = (vz / sp) * top;
      }
      this.mouse.userData.vx = vx;
      this.mouse.userData.vz = vz;
      this.mouse.position.x += vx * dt;
      this.mouse.position.z += vz * dt;
      this.mouse.position.y = s.topY + 0.04 + Math.abs(Math.sin(this.mouseT * 22)) * 0.012;
      this.mouse.rotation.y = Math.atan2(vx, vz);
      // clamp on surface
      this.mouse.position.x = THREE.MathUtils.clamp(this.mouse.position.x, s.cx - s.halfW + 0.08, s.cx + s.halfW - 0.08);
      this.mouse.position.z = THREE.MathUtils.clamp(this.mouse.position.z, s.cz - s.halfD + 0.08, s.cz + s.halfD - 0.08);

      if (
        !this.mouseScored &&
        this.hitIFrame <= 0 &&
        Math.hypot(this.mouse.position.x - catPos.x, this.mouse.position.z - catPos.z) < this.mouseHitRadius
      ) {
        hit = hit ?? 'mouse';
        this.mouseScored = true;
        this.hitIFrame = 0.75;
        // bite and run — it bolts for the nearest edge instead of hovering
        const away = Math.hypot(this.mouse.position.x - catPos.x, this.mouse.position.z - catPos.z) || 1;
        this.mouse.userData.vx = ((this.mouse.position.x - catPos.x) / away) * this.diff.mouseSpeed * 1.6;
        this.mouse.userData.vz = ((this.mouse.position.z - catPos.z) / away) * this.diff.mouseSpeed * 1.6;
        this.mouseT = Math.max(this.mouseT, 4.6);
      }
      if (this.mouseT > 5.5) {
        this.mouseActive = false;
        this.mouse.visible = false;
        this.mouseCD = this.gap(this.diff.mouseGap);
      }
    }

    return hit;
  }
}
