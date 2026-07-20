import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export type CatAnim = 'idle' | 'walk' | 'swat';

/**
 * Hierarchical cream cat with real feline proportions,
 * diagonal walk gait, and a paw-swat attack cycle.
 */
export class Cat {
  readonly group = new THREE.Group();
  readonly velocity = new THREE.Vector3();
  facingYaw = 0;
  speed = 3.9;
  sprintMul = 1.35;
  nudgeCooldown = 0;
  mass = 4.2;

  /** 0–1 how hard the last swat hit (for camera/UI) */
  lastSwatStrength = 0;
  /** World-space point of paw impact during swat peak */
  readonly swatPoint = new THREE.Vector3();
  swatActive = false;
  swatPeakHit = false;

  private root = new THREE.Group();
  private pelvis!: THREE.Group;
  private chest!: THREE.Group;
  private neck!: THREE.Group;
  private head!: THREE.Group;
  private tailSegs: THREE.Group[] = [];
  private legs: {
    root: THREE.Group;
    upper: THREE.Group;
    lower: THREE.Group;
    paw: THREE.Group;
    side: 1 | -1;
    front: boolean;
  }[] = [];

  private phase = 0;
  private anim: CatAnim = 'idle';
  private swatT = 0;
  private readonly swatDuration = 0.42;
  private bodyMat!: THREE.MeshStandardMaterial;
  private accentMat!: THREE.MeshStandardMaterial;
  private worldBody: CANNON.Body | null = null;
  private world: CANNON.World | null = null;

  constructor() {
    this.buildMesh();
    this.group.add(this.root);
    this.root.scale.setScalar(1.0);
  }

  /** Attach a kinematic capsule used to shove rigid props */
  attachPhysics(world: CANNON.World, y: number) {
    this.world = world;
    if (this.worldBody) world.removeBody(this.worldBody);
    this.worldBody = new CANNON.Body({
      mass: 0, // kinematic-style via manual velocity injection
      type: CANNON.Body.KINEMATIC,
      shape: new CANNON.Sphere(0.18),
      position: new CANNON.Vec3(0, y + 0.18, 0),
      collisionFilterGroup: 2,
      collisionFilterMask: 1,
    });
    // Slightly larger interaction radius
    this.worldBody.addShape(new CANNON.Sphere(0.14), new CANNON.Vec3(0.16, 0, 0));
    world.addBody(this.worldBody);
  }

  detachPhysics() {
    if (this.world && this.worldBody) {
      this.world.removeBody(this.worldBody);
    }
    this.worldBody = null;
    this.world = null;
  }

  private buildMesh() {
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: 0xf2d4b5,
      roughness: 0.78,
      metalness: 0.02,
      envMapIntensity: 0.45,
    });
    this.accentMat = new THREE.MeshStandardMaterial({
      color: 0xfff6ec,
      roughness: 0.82,
      metalness: 0.0,
    });
    const pink = new THREE.MeshStandardMaterial({
      color: 0xf4a0b8,
      roughness: 0.45,
      emissive: 0x3a1020,
      emissiveIntensity: 0.12,
    });
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0xe8a020,
      emissive: 0xd47810,
      emissiveIntensity: 0.65,
      roughness: 0.25,
    });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a100c, roughness: 0.5 });

    // Hierarchy: root → pelvis → chest → neck → head
    //            pelvis → hind legs, tail
    //            chest → front legs
    this.pelvis = new THREE.Group();
    this.pelvis.position.set(-0.06, 0.22, 0);
    this.root.add(this.pelvis);

    this.chest = new THREE.Group();
    this.chest.position.set(0.16, 0.02, 0);
    this.pelvis.add(this.chest);

    // Torso — longer, leaner feline silhouette
    const hind = this.mesh(new THREE.SphereGeometry(0.11, 16, 12), this.bodyMat);
    hind.scale.set(1.25, 0.95, 0.85);
    hind.position.set(-0.02, 0.02, 0);
    this.pelvis.add(hind);

    const mid = this.mesh(new THREE.CapsuleGeometry(0.095, 0.18, 6, 12), this.bodyMat);
    mid.rotation.z = Math.PI / 2;
    mid.position.set(0.1, 0.03, 0);
    mid.scale.set(1, 1.0, 0.88);
    this.pelvis.add(mid);

    const chestMesh = this.mesh(new THREE.SphereGeometry(0.12, 16, 14), this.bodyMat);
    chestMesh.scale.set(1.25, 0.95, 0.9);
    chestMesh.position.set(0.04, 0.01, 0);
    this.chest.add(chestMesh);

    // Apricot shoulder marking (Suki identity)
    const mark = this.mesh(
      new THREE.SphereGeometry(0.05, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xe8b090, roughness: 0.85 }),
    );
    mark.position.set(0.06, 0.06, 0.08);
    mark.scale.set(1.2, 0.6, 0.8);
    this.chest.add(mark);

    // White blaze
    const blaze = this.mesh(new THREE.SphereGeometry(0.07, 12, 10), this.accentMat);
    blaze.position.set(0.1, -0.02, 0);
    blaze.scale.set(0.7, 1.1, 0.55);
    this.chest.add(blaze);

    // Neck + head — cat skull (tapered muzzle)
    this.neck = new THREE.Group();
    this.neck.position.set(0.12, 0.06, 0);
    this.chest.add(this.neck);

    this.head = new THREE.Group();
    this.head.position.set(0.1, 0.04, 0);
    this.neck.add(this.head);

    const skull = this.mesh(new THREE.SphereGeometry(0.105, 16, 14), this.bodyMat);
    skull.scale.set(1.05, 0.95, 0.92);
    this.head.add(skull);

    const cheekL = this.mesh(new THREE.SphereGeometry(0.045, 10, 8), this.bodyMat);
    cheekL.position.set(0.02, -0.02, 0.07);
    cheekL.scale.set(1.1, 0.8, 0.9);
    this.head.add(cheekL);
    const cheekR = cheekL.clone();
    cheekR.position.z = -0.07;
    this.head.add(cheekR);

    // Muzzle
    const muzzle = this.mesh(new THREE.SphereGeometry(0.055, 12, 10), this.accentMat);
    muzzle.position.set(0.09, -0.02, 0);
    muzzle.scale.set(1.15, 0.75, 0.8);
    this.head.add(muzzle);

    const nose = this.mesh(new THREE.SphereGeometry(0.018, 8, 8), pink);
    nose.position.set(0.14, -0.01, 0);
    this.head.add(nose);

    // Ears — tall triangles, cat-like
    for (const side of [1, -1] as const) {
      const ear = new THREE.Group();
      ear.position.set(0.02, 0.1, 0.055 * side);
      ear.rotation.z = -0.15;
      ear.rotation.x = 0.15 * side;
      const outer = this.mesh(new THREE.ConeGeometry(0.045, 0.11, 6), this.bodyMat);
      outer.position.y = 0.05;
      ear.add(outer);
      const inner = this.mesh(new THREE.ConeGeometry(0.022, 0.07, 5), pink);
      inner.position.set(0.005, 0.045, 0);
      ear.add(inner);
      this.head.add(ear);
    }

    // Eyes
    for (const side of [1, -1] as const) {
      const eye = this.mesh(new THREE.SphereGeometry(0.028, 12, 10), eyeMat);
      eye.position.set(0.08, 0.025, 0.055 * side);
      eye.scale.set(0.9, 1.15, 0.55);
      this.head.add(eye);
      const pupil = this.mesh(new THREE.SphereGeometry(0.012, 8, 8), dark);
      pupil.position.set(0.1, 0.025, 0.055 * side);
      pupil.scale.set(0.7, 1.4, 0.5);
      this.head.add(pupil);
    }

    // Whisker stubs
    for (const side of [1, -1] as const) {
      for (let i = 0; i < 3; i++) {
        const w = this.mesh(
          new THREE.CylinderGeometry(0.002, 0.002, 0.1, 4),
          new THREE.MeshStandardMaterial({ color: 0xf8f0e8, roughness: 0.4 }),
        );
        w.position.set(0.1, -0.02 + i * 0.012, 0.04 * side);
        w.rotation.z = Math.PI / 2;
        w.rotation.y = 0.35 * side;
        w.rotation.x = (i - 1) * 0.2;
        this.head.add(w);
      }
    }

    // Legs — upper, lower, paw
    const legDefs: { front: boolean; side: 1 | -1; x: number; z: number }[] = [
      { front: true, side: 1, x: 0.08, z: 0.08 },
      { front: true, side: -1, x: 0.08, z: -0.08 },
      { front: false, side: 1, x: -0.05, z: 0.09 },
      { front: false, side: -1, x: -0.05, z: -0.09 },
    ];

    for (const def of legDefs) {
      const parent = def.front ? this.chest : this.pelvis;
      const root = new THREE.Group();
      root.position.set(def.x, -0.02, def.z);
      parent.add(root);

      const upper = new THREE.Group();
      root.add(upper);
      const upperMesh = this.mesh(new THREE.CapsuleGeometry(0.035, 0.06, 4, 8), this.bodyMat);
      upperMesh.position.y = -0.05;
      upper.add(upperMesh);

      const lower = new THREE.Group();
      lower.position.y = -0.1;
      upper.add(lower);
      const lowerMesh = this.mesh(new THREE.CapsuleGeometry(0.028, 0.05, 4, 8), this.bodyMat);
      lowerMesh.position.y = -0.04;
      lower.add(lowerMesh);

      const paw = new THREE.Group();
      paw.position.y = -0.09;
      lower.add(paw);
      const pawMesh = this.mesh(new THREE.SphereGeometry(0.032, 10, 8), this.accentMat);
      pawMesh.scale.set(1.2, 0.55, 1.0);
      pawMesh.position.y = -0.01;
      paw.add(pawMesh);

      this.legs.push({ root, upper, lower, paw, side: def.side, front: def.front });
    }

    // Multi-segment tail chain
    this.tailSegs = [];
    let tailParent: THREE.Object3D = this.pelvis;
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Group();
      seg.position.set(i === 0 ? -0.14 : -0.07, i === 0 ? 0.06 : 0.01, 0);
      tailParent.add(seg);
      this.tailSegs.push(seg);
      const r = 0.032 - i * 0.004;
      const m = this.mesh(new THREE.CapsuleGeometry(r, 0.04, 3, 6), this.bodyMat);
      m.rotation.z = Math.PI / 2;
      m.position.x = -0.03;
      seg.add(m);
      tailParent = seg;
    }
  }

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  setPosition(x: number, y: number, z: number) {
    this.group.position.set(x, y, z);
    this.syncPhysics();
  }

  get position() {
    return this.group.position;
  }

  /** Trigger paw swat; returns true if started */
  trySwat(): boolean {
    if (this.anim === 'swat' || this.nudgeCooldown > 0) return false;
    this.anim = 'swat';
    this.swatT = 0;
    this.swatActive = true;
    this.swatPeakHit = false;
    this.nudgeCooldown = 0.55;
    this.lastSwatStrength = 0;
    return true;
  }

  /**
   * @returns swat impulse event at peak frame, else null
   */
  update(
    dt: number,
    input: { x: number; z: number },
    bounds: { halfW: number; halfD: number },
    surfaceY: number,
  ): { swatImpulse: number; origin: THREE.Vector3; direction: THREE.Vector3 } | null {
    this.nudgeCooldown = Math.max(0, this.nudgeCooldown - dt);
    let swatEvent: { swatImpulse: number; origin: THREE.Vector3; direction: THREE.Vector3 } | null =
      null;

    // --- Swat state machine ---
    if (this.anim === 'swat') {
      this.swatT += dt;
      const t = this.swatT / this.swatDuration;
      this.animateSwat(t);

      // Peak impact ~55% through the cycle
      if (!this.swatPeakHit && t >= 0.52) {
        this.swatPeakHit = true;
        const strength = 1.0;
        this.lastSwatStrength = strength;
        this.updateSwatPoint();
        const dir = new THREE.Vector3(Math.cos(this.facingYaw), 0.15, Math.sin(this.facingYaw));
        swatEvent = {
          swatImpulse: strength,
          origin: this.swatPoint.clone(),
          direction: dir,
        };
      }

      if (t >= 1) {
        this.anim = 'idle';
        this.swatActive = false;
        this.resetPoseBase();
      }

      // Still allow slight reposition during windup
      this.applyMovement(dt, input, bounds, 0.25);
      this.syncPhysics();
      this.group.position.y = surfaceY;
      return swatEvent;
    }

    // --- Locomotion ---
    const moving = Math.hypot(input.x, input.z) > 0.05;
    this.anim = moving ? 'walk' : 'idle';

    this.applyMovement(dt, input, bounds, 1);
    this.group.position.y = surfaceY;

    // Face movement direction smoothly (full 360, not flip-only)
    if (moving) {
      const targetYaw = Math.atan2(input.z, input.x);
      let dy = targetYaw - this.facingYaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.facingYaw += dy * Math.min(1, 12 * dt);
    }
    this.root.rotation.y = this.facingYaw;

    // Gait
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.phase += dt * (moving ? 11 + speed * 1.5 : 2.2);
    if (moving) this.animateWalk(this.phase, speed);
    else this.animateIdle(this.phase);

    this.syncPhysics();
    return null;
  }

  private applyMovement(
    dt: number,
    input: { x: number; z: number },
    bounds: { halfW: number; halfD: number },
    mul: number,
  ) {
    const len = Math.hypot(input.x, input.z);
    if (len > 0.05) {
      const nx = input.x / len;
      const nz = input.z / len;
      const sp = this.speed * mul;
      // Accelerate toward input
      this.velocity.x = THREE.MathUtils.damp(this.velocity.x, nx * sp, 12, dt);
      this.velocity.z = THREE.MathUtils.damp(this.velocity.z, nz * sp, 12, dt);
    } else {
      this.velocity.x = THREE.MathUtils.damp(this.velocity.x, 0, 10, dt);
      this.velocity.z = THREE.MathUtils.damp(this.velocity.z, 0, 10, dt);
    }

    this.group.position.x += this.velocity.x * dt;
    this.group.position.z += this.velocity.z * dt;

    const margin = 0.28;
    this.group.position.x = THREE.MathUtils.clamp(
      this.group.position.x,
      -bounds.halfW + margin,
      bounds.halfW - margin,
    );
    this.group.position.z = THREE.MathUtils.clamp(
      this.group.position.z,
      -bounds.halfD + margin,
      bounds.halfD - margin,
    );
  }

  private animateIdle(phase: number) {
    this.resetPoseBase();
    const breathe = Math.sin(phase * 0.8) * 0.012;
    this.chest.position.y = 0.02 + breathe;
    this.head.rotation.x = Math.sin(phase * 0.5) * 0.04;
    this.head.rotation.z = Math.sin(phase * 0.35) * 0.03;
    // Tail slow curl
    this.tailSegs.forEach((s, i) => {
      s.rotation.y = Math.sin(phase * 0.7 + i * 0.4) * 0.18;
      s.rotation.z = 0.25 + Math.sin(phase * 0.5 + i * 0.3) * 0.08;
    });
    // Slight crouch settle on paws
    for (const leg of this.legs) {
      leg.upper.rotation.x = 0.08;
      leg.lower.rotation.x = -0.12;
    }
  }

  private animateWalk(phase: number, speed: number) {
    this.resetPoseBase();
    const amp = THREE.MathUtils.clamp(speed / this.speed, 0.35, 1.1);

    // Body pitch/bob
    this.pelvis.position.y = 0.22 + Math.sin(phase * 2) * 0.018 * amp;
    this.chest.rotation.x = Math.sin(phase) * 0.06 * amp;
    this.pelvis.rotation.z = Math.sin(phase) * 0.04 * amp;
    this.head.rotation.x = -Math.sin(phase) * 0.05 * amp;
    this.head.rotation.y = Math.sin(phase * 0.5) * 0.06;

    // Diagonal gait: FL+HR phase 0, FR+HL phase PI
    for (const leg of this.legs) {
      const pairPhase = leg.front === (leg.side === 1) ? phase : phase + Math.PI;
      const swing = Math.sin(pairPhase) * 0.55 * amp;
      const lift = Math.max(0, Math.sin(pairPhase)) * 0.12 * amp;
      leg.upper.rotation.x = swing * (leg.front ? 1 : 0.85);
      leg.lower.rotation.x = -Math.abs(swing) * 0.7 - 0.1;
      leg.root.position.y = -0.02 + lift;
      leg.paw.rotation.x = -swing * 0.3;
    }

    // Tail counter-balance
    this.tailSegs.forEach((s, i) => {
      s.rotation.y = Math.sin(phase + i * 0.5) * 0.35 * amp;
      s.rotation.z = 0.4 + Math.sin(phase * 1.2 + i * 0.4) * 0.12;
    });
  }

  private animateSwat(t: number) {
    // 0–0.35 crouch windup, 0.35–0.6 strike, 0.6–1 recover
    this.resetPoseBase();
    const ease = (x: number) => x * x * (3 - 2 * x);

    if (t < 0.35) {
      const u = ease(t / 0.35);
      this.pelvis.position.y = 0.22 - 0.06 * u;
      this.chest.rotation.x = -0.25 * u;
      this.head.rotation.x = 0.15 * u;
      // Front-right paw loads back
      const fr = this.legs.find((l) => l.front && l.side === -1)!;
      fr.upper.rotation.x = -0.9 * u;
      fr.lower.rotation.x = -0.4 * u;
      // Plant other legs
      for (const leg of this.legs) {
        if (leg === fr) continue;
        leg.upper.rotation.x = 0.2 * u;
        leg.lower.rotation.x = -0.25 * u;
      }
    } else if (t < 0.62) {
      const u = ease((t - 0.35) / 0.27);
      this.pelvis.position.y = 0.16 + 0.04 * u;
      this.chest.rotation.x = -0.25 + 0.55 * u;
      this.chest.rotation.y = 0.35 * u;
      const fr = this.legs.find((l) => l.front && l.side === -1)!;
      fr.upper.rotation.x = -0.9 + 2.2 * u;
      fr.lower.rotation.x = -0.4 + 0.2 * u;
      fr.root.position.x = 0.08 + 0.12 * u;
      // Body weight shift
      this.pelvis.rotation.z = -0.15 * u;
    } else {
      const u = ease((t - 0.62) / 0.38);
      this.pelvis.position.y = 0.2 + 0.02 * (1 - u);
      this.chest.rotation.x = 0.3 * (1 - u);
      this.chest.rotation.y = 0.35 * (1 - u);
      const fr = this.legs.find((l) => l.front && l.side === -1)!;
      fr.upper.rotation.x = 1.3 * (1 - u);
      fr.lower.rotation.x = -0.2 * (1 - u);
      fr.root.position.x = 0.08 + 0.12 * (1 - u);
    }

    // Tail lash during swat
    this.tailSegs.forEach((s, i) => {
      s.rotation.y = Math.sin(t * 20 + i) * 0.4;
      s.rotation.z = 0.5;
    });
  }

  private resetPoseBase() {
    this.pelvis.position.set(-0.06, 0.22, 0);
    this.pelvis.rotation.set(0, 0, 0);
    this.chest.position.set(0.16, 0.02, 0);
    this.chest.rotation.set(0, 0, 0);
    this.neck.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
    for (const leg of this.legs) {
      leg.root.position.y = -0.02;
      leg.root.position.x = leg.front ? 0.08 : -0.05;
      leg.upper.rotation.set(0, 0, 0);
      leg.lower.rotation.set(0, 0, 0);
      leg.paw.rotation.set(0, 0, 0);
    }
  }

  private updateSwatPoint() {
    const fr = this.legs.find((l) => l.front && l.side === -1);
    if (fr) {
      fr.paw.getWorldPosition(this.swatPoint);
    } else {
      this.swatPoint.set(
        this.group.position.x + Math.cos(this.facingYaw) * 0.35,
        this.group.position.y + 0.15,
        this.group.position.z + Math.sin(this.facingYaw) * 0.35,
      );
    }
  }

  private syncPhysics() {
    if (!this.worldBody) return;
    this.worldBody.position.set(
      this.group.position.x,
      this.group.position.y + 0.18,
      this.group.position.z,
    );
    this.worldBody.velocity.set(this.velocity.x, 0, this.velocity.z);
    this.worldBody.quaternion.setFromEuler(0, -this.facingYaw, 0, 'YZX');
  }

  getPushOrigin(): THREE.Vector3 {
    return new THREE.Vector3(
      this.group.position.x + Math.cos(this.facingYaw) * 0.28,
      this.group.position.y + 0.12,
      this.group.position.z + Math.sin(this.facingYaw) * 0.28,
    );
  }

  get facing() {
    return this.facingYaw;
  }
}
