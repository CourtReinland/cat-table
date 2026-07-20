import * as THREE from 'three';

/** Third-person chase camera with look-ahead, spring damping, and hit punch */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private pos = new THREE.Vector3(0, 3.2, 4.5);
  private look = new THREE.Vector3(0, 1, 0);
  private punch = new THREE.Vector3();
  private fovPunch = 0;

  /** Ideal offset from cat in cat-local space (behind + up + slight side) */
  offset = new THREE.Vector3(-2.35, 1.35, 0.55);
  lookHeight = 0.18;
  lookAhead = 1.15;
  posDamp = 4.2;
  lookDamp = 6.5;
  private fovBase = 52;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(this.fovBase, aspect, 0.08, 100);
    this.camera.position.copy(this.pos);
  }

  setSize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Call on swat impact for cinematic punch */
  addPunch(strength = 1) {
    this.punch.x += (Math.random() - 0.5) * 0.08 * strength;
    this.punch.y += 0.04 * strength;
    this.punch.z += (Math.random() - 0.5) * 0.06 * strength;
    this.fovPunch = 4 * strength;
  }

  /** Intro / non-play orbit */
  orbit(center: THREE.Vector3, time: number, radius = 3.8, height = 2.4) {
    const t = time * 0.25;
    this.pos.set(center.x + Math.sin(t) * radius, center.y + height, center.z + Math.cos(t) * radius * 0.85);
    this.look.copy(center);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
    this.camera.fov = this.fovBase;
    this.camera.updateProjectionMatrix();
  }

  follow(
    dt: number,
    catPos: THREE.Vector3,
    catYaw: number,
    catVel: THREE.Vector3,
  ) {
    // World-space offset rotated by cat yaw
    const cos = Math.cos(catYaw);
    const sin = Math.sin(catYaw);
    // Offset: behind cat (negative local X in our mesh faces +X)
    const ox = this.offset.x * cos - this.offset.z * sin;
    const oz = this.offset.x * sin + this.offset.z * cos;

    const speed = Math.hypot(catVel.x, catVel.z);
    const ahead = this.lookAhead * THREE.MathUtils.clamp(speed / 3, 0.2, 1.4);

    const desiredPos = new THREE.Vector3(
      catPos.x + ox,
      catPos.y + this.offset.y,
      catPos.z + oz,
    );

    const desiredLook = new THREE.Vector3(
      catPos.x + cos * ahead * 0.9,
      catPos.y + this.lookHeight,
      catPos.z + sin * ahead * 0.9,
    );

    // Exponential damp
    const aPos = 1 - Math.exp(-this.posDamp * dt);
    const aLook = 1 - Math.exp(-this.lookDamp * dt);
    this.pos.lerp(desiredPos, aPos);
    this.look.lerp(desiredLook, aLook);

    // Punch decay
    this.punch.multiplyScalar(Math.exp(-8 * dt));
    this.fovPunch = THREE.MathUtils.damp(this.fovPunch, 0, 6, dt);

    this.camera.position.copy(this.pos).add(this.punch);
    this.camera.lookAt(this.look);
    this.camera.fov = this.fovBase + this.fovPunch + speed * 0.35;
    this.camera.updateProjectionMatrix();
  }
}
