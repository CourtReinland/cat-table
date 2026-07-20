import * as THREE from 'three';

/** Stylized low-poly cream cat with simple bob animation */
export class Cat {
  readonly group = new THREE.Group();
  private body: THREE.Mesh;
  private head: THREE.Mesh;
  private tail: THREE.Mesh;
  private legs: THREE.Mesh[] = [];
  private phase = 0;
  facing = 1;
  velocity = new THREE.Vector3();
  speed = 2.8;
  nudgeCooldown = 0;

  constructor() {
    const fur = new THREE.MeshStandardMaterial({
      color: 0xf0d2b0,
      roughness: 0.72,
      metalness: 0.05,
    });
    const pink = new THREE.MeshStandardMaterial({
      color: 0xf4a0b8,
      roughness: 0.5,
      metalness: 0.05,
      emissive: 0x401020,
      emissiveIntensity: 0.15,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x2a1a12,
      roughness: 0.6,
    });
    const eye = new THREE.MeshStandardMaterial({
      color: 0xe8a020,
      emissive: 0xc87810,
      emissiveIntensity: 0.55,
      roughness: 0.3,
    });

    // Body
    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.28, 6, 12), fur);
    this.body.rotation.z = Math.PI / 2;
    this.body.position.y = 0.22;
    this.body.castShadow = true;
    this.group.add(this.body);

    // Chest blaze
    const blaze = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), new THREE.MeshStandardMaterial({
      color: 0xfff5ea,
      roughness: 0.8,
    }));
    blaze.position.set(0.12, 0.22, 0);
    blaze.scale.set(0.6, 0.9, 0.7);
    this.group.add(blaze);

    // Head
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), fur);
    this.head.position.set(0.28, 0.34, 0);
    this.head.castShadow = true;
    this.group.add(this.head);

    // Ears
    const earGeo = new THREE.ConeGeometry(0.07, 0.12, 5);
    const earL = new THREE.Mesh(earGeo, fur);
    earL.position.set(0.22, 0.5, 0.08);
    earL.rotation.z = -0.25;
    const earR = earL.clone();
    earR.position.z = -0.08;
    earR.rotation.z = -0.25;
    this.group.add(earL, earR);
    const innerL = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 5), pink);
    innerL.position.set(0.24, 0.48, 0.08);
    const innerR = innerL.clone();
    innerR.position.z = -0.08;
    this.group.add(innerL, innerR);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.035, 10, 10);
    const eL = new THREE.Mesh(eyeGeo, eye);
    eL.position.set(0.4, 0.36, 0.07);
    eL.scale.set(1, 1.2, 0.7);
    const eR = eL.clone();
    eR.position.z = -0.07;
    this.group.add(eL, eR);
    const pupilGeo = new THREE.SphereGeometry(0.015, 8, 8);
    const pL = new THREE.Mesh(pupilGeo, dark);
    pL.position.set(0.43, 0.36, 0.07);
    const pR = pL.clone();
    pR.position.z = -0.07;
    this.group.add(pL, pR);

    // Nose
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), pink);
    nose.position.set(0.44, 0.3, 0);
    this.group.add(nose);

    // Tail
    this.tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.35, 4, 8), fur);
    this.tail.position.set(-0.28, 0.32, 0);
    this.tail.rotation.z = 0.6;
    this.tail.castShadow = true;
    this.group.add(this.tail);

    // Legs
    const legGeo = new THREE.CapsuleGeometry(0.04, 0.1, 4, 6);
    const offsets: [number, number][] = [
      [0.12, 0.08],
      [0.12, -0.08],
      [-0.1, 0.08],
      [-0.1, -0.08],
    ];
    for (const [x, z] of offsets) {
      const leg = new THREE.Mesh(legGeo, fur);
      leg.position.set(x, 0.08, z);
      leg.castShadow = true;
      this.legs.push(leg);
      this.group.add(leg);
    }

    this.group.scale.setScalar(1.05);
  }

  setPosition(x: number, y: number, z: number) {
    this.group.position.set(x, y, z);
  }

  update(dt: number, input: { x: number; z: number }, bounds: { halfW: number; halfD: number }) {
    this.nudgeCooldown = Math.max(0, this.nudgeCooldown - dt);
    const moving = input.x !== 0 || input.z !== 0;

    if (moving) {
      const len = Math.hypot(input.x, input.z) || 1;
      this.velocity.x = (input.x / len) * this.speed;
      this.velocity.z = (input.z / len) * this.speed;
      this.facing = input.x !== 0 ? Math.sign(input.x) : this.facing;
      this.group.rotation.y = this.facing > 0 ? 0 : Math.PI;
    } else {
      this.velocity.x *= 0.85;
      this.velocity.z *= 0.85;
      if (Math.hypot(this.velocity.x, this.velocity.z) < 0.02) {
        this.velocity.x = 0;
        this.velocity.z = 0;
      }
    }

    this.group.position.x += this.velocity.x * dt;
    this.group.position.z += this.velocity.z * dt;

    // Clamp to counter top
    const margin = 0.25;
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

    // Animate
    this.phase += dt * (moving ? 14 : 3);
    const bob = Math.sin(this.phase) * (moving ? 0.02 : 0.008);
    this.body.position.y = 0.22 + bob;
    this.head.position.y = 0.34 + bob * 1.2;
    this.tail.rotation.z = 0.6 + Math.sin(this.phase * 0.8) * 0.35;
    this.tail.rotation.y = Math.sin(this.phase * 0.5) * 0.25;

    if (moving) {
      this.legs.forEach((leg, i) => {
        leg.position.y = 0.08 + Math.sin(this.phase + i * 1.5) * 0.03;
      });
    }
  }

  getPushOrigin(): THREE.Vector3 {
    return this.group.position.clone().add(new THREE.Vector3(0.2 * this.facing, 0.15, 0));
  }
}
