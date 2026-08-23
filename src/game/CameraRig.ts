import * as THREE from 'three';

/**
 * GS-CAM-OTS — close third-person over-the-shoulder.
 *
 * Cat local space matches Game / Cat: +Z forward at yaw 0, +Y up, +X right.
 * (The old chase rig treated −X as behind a +X-facing mesh and was never wired.)
 *
 * Pose is tight enough to read the cat, far/high enough that head AND paws
 * stay in frame. Look sits on the chest, not the horizon — a big look-ahead
 * would crop the feet.
 *
 * First-person is an optional C toggle. It is not the boot default.
 */
export const DEFAULT_FP_CAM = false;

/** Cat-local close OTS. +X right, +Y up, −Z behind. */
export const OTS = {
  side: 0.18,
  height: 0.5,
  back: 1.32,
  lookHeight: 0.15,
  lookAhead: 0.08,
  /** Extra look-ahead while moving — still small so paws stay in frame. */
  lookAheadMove: 0.14,
  fov: 52,
  near: 0.08,
  far: 80,
  posDamp: 10,
  lookDamp: 14,
} as const;

/**
 * Conservative cat AABB in cat-local metres (origin at the feet).
 * Covers the procedural cat (scale 1.18) and the 0.85 GLB.
 */
export const CAT_FRAME = {
  min: new THREE.Vector3(-0.16, 0.0, -0.38),
  max: new THREE.Vector3(0.16, 0.45, 0.34),
};

export type XZ = { x: number; z: number };

export function catForward(yaw: number): XZ {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

export function catRight(yaw: number): XZ {
  return { x: Math.cos(yaw), z: -Math.sin(yaw) };
}

/** World pose for a close OTS camera that frames the whole cat. */
type Vec3 = { x: number; y: number; z: number };

export function otsPose(
  catPos: Vec3,
  yaw: number,
  speed = 0,
): { pos: THREE.Vector3; look: THREE.Vector3 } {
  const fwd = catForward(yaw);
  const right = catRight(yaw);
  const ahead =
    OTS.lookAhead + (OTS.lookAheadMove - OTS.lookAhead) * Math.min(1, speed / 1.35);
  return {
    pos: new THREE.Vector3(
      catPos.x + right.x * OTS.side - fwd.x * OTS.back,
      catPos.y + OTS.height,
      catPos.z + right.z * OTS.side - fwd.z * OTS.back,
    ),
    look: new THREE.Vector3(
      catPos.x + fwd.x * ahead,
      catPos.y + OTS.lookHeight,
      catPos.z + fwd.z * ahead,
    ),
  };
}

/** Eight corners of CAT_FRAME in world space. */
export function catFrameCorners(catPos: Vec3, yaw: number): THREE.Vector3[] {
  const fwd = catForward(yaw);
  const right = catRight(yaw);
  const { min, max } = CAT_FRAME;
  const xs = [min.x, max.x];
  const ys = [min.y, max.y];
  const zs = [min.z, max.z];
  const out: THREE.Vector3[] = [];
  for (const lx of xs) {
    for (const ly of ys) {
      for (const lz of zs) {
        out.push(
          new THREE.Vector3(
            catPos.x + right.x * lx + fwd.x * lz,
            catPos.y + ly,
            catPos.z + right.z * lx + fwd.z * lz,
          ),
        );
      }
    }
  }
  return out;
}

export function makeOtsCamera(aspect: number): THREE.PerspectiveCamera {
  return new THREE.PerspectiveCamera(OTS.fov, aspect, OTS.near, OTS.far);
}

/** True when every world point projects inside NDC with a screen margin. */
export function pointsInView(
  camera: THREE.PerspectiveCamera,
  points: THREE.Vector3[],
  margin = 0.92,
): boolean {
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const ndc = new THREE.Vector3();
  for (const p of points) {
    ndc.copy(p).project(camera);
    if (Math.abs(ndc.x) > margin || Math.abs(ndc.y) > margin || ndc.z < -1 || ndc.z > 1) {
      return false;
    }
  }
  return true;
}

export function applyOtsPose(
  camera: THREE.PerspectiveCamera,
  catPos: Vec3,
  yaw: number,
  speed = 0,
): { pos: THREE.Vector3; look: THREE.Vector3 } {
  const pose = otsPose(catPos, yaw, speed);
  camera.position.copy(pose.pos);
  camera.lookAt(pose.look);
  camera.fov = OTS.fov;
  camera.near = OTS.near;
  camera.updateProjectionMatrix();
  return pose;
}

/** Damped close-OTS follow. Writes into Game's camPos / camLook. */
export class CameraRig {
  pos = new THREE.Vector3(0, 3.2, 4.5);
  look = new THREE.Vector3(0, 1, 0);
  private punch = new THREE.Vector3();

  /** Instantly sit on the OTS pose — play start and leaving FP. */
  snap(catPos: Vec3, yaw: number, speed = 0) {
    const pose = otsPose(catPos, yaw, speed);
    this.pos.copy(pose.pos);
    this.look.copy(pose.look);
    this.punch.set(0, 0, 0);
  }

  addPunch(strength = 1) {
    this.punch.x += (Math.random() - 0.5) * 0.08 * strength;
    this.punch.y += 0.04 * strength;
    this.punch.z += (Math.random() - 0.5) * 0.06 * strength;
  }

  follow(dt: number, catPos: Vec3, yaw: number, catVel: Vec3) {
    const speed = Math.hypot(catVel.x, catVel.z);
    const pose = otsPose(catPos, yaw, speed);
    const aPos = 1 - Math.exp(-OTS.posDamp * dt);
    const aLook = 1 - Math.exp(-OTS.lookDamp * dt);
    this.pos.lerp(pose.pos, aPos);
    this.look.lerp(pose.look, aLook);
    this.punch.multiplyScalar(Math.exp(-8 * dt));
  }

  applyTo(camera: THREE.PerspectiveCamera) {
    camera.position.copy(this.pos).add(this.punch);
    camera.lookAt(this.look);
    if (Math.abs(camera.fov - OTS.fov) > 0.05) {
      camera.fov = OTS.fov;
      camera.near = OTS.near;
      camera.updateProjectionMatrix();
    }
  }
}
