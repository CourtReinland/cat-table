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

/**
 * Stills-only 3/4 front portrait. Default play OTS is unchanged.
 * Trigger with `?portrait=1` or V. Do not use C / first-person (that hides the cat).
 */
export const PORTRAIT = {
  /** Cat-local: +X right, +Y up, +Z forward. Negative side = 3/4 from the left. */
  side: -0.12,
  /** Eye line on the 0.40 m Hunyuan (feet origin). */
  height: 0.26,
  /** Metres in front of the feet origin along heading — in FRONT of the muzzle. */
  front: 0.34,
  /** Look at the face, not the OTS chest (0.15). */
  lookHeight: 0.235,
  lookAhead: 0.11,
  fov: 32,
  near: 0.025,
  far: 80,
} as const;

export function stillsPortraitRequested(): boolean {
  if (typeof location === 'undefined') return false;
  try {
    return new URLSearchParams(location.search).get('portrait') === '1';
  } catch {
    return false;
  }
}

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
  /**
   * Unused. BUILD 6 left exponential catch-up here (10 / 14). After catVel
   * already halted, that leftover still slid props in the OTS frame for
   * ~the lag tail. Follow is pose-locked — stop on a dime.
   */
  posDamp: 10,
  lookDamp: 14,
} as const;

/**
 * Conservative cat AABB in cat-local metres (origin at the feet).
 * Covers the procedural cat (scale 1.18) and the Hunyuan GLB (0.40 m bind).
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

/** World pose for a close 3/4 front stills portrait. Cat stays visible. */
export function portraitPose(catPos: Vec3, yaw: number): { pos: THREE.Vector3; look: THREE.Vector3 } {
  const fwd = catForward(yaw);
  const right = catRight(yaw);
  return {
    pos: new THREE.Vector3(
      catPos.x + right.x * PORTRAIT.side + fwd.x * PORTRAIT.front,
      catPos.y + PORTRAIT.height,
      catPos.z + right.z * PORTRAIT.side + fwd.z * PORTRAIT.front,
    ),
    look: new THREE.Vector3(
      catPos.x + fwd.x * PORTRAIT.lookAhead,
      catPos.y + PORTRAIT.lookHeight,
      catPos.z + fwd.z * PORTRAIT.lookAhead,
    ),
  };
}

export function applyPortraitPose(
  camera: THREE.PerspectiveCamera,
  catPos: Vec3,
  yaw: number,
): { pos: THREE.Vector3; look: THREE.Vector3 } {
  const pose = portraitPose(catPos, yaw);
  camera.position.copy(pose.pos);
  camera.lookAt(pose.look);
  camera.fov = PORTRAIT.fov;
  camera.near = PORTRAIT.near;
  camera.far = PORTRAIT.far;
  camera.updateProjectionMatrix();
  return pose;
}

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

/** Pose-locked close-OTS follow. Writes into Game's camPos / camLook. */
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

  /**
   * Pose-lock the close OTS rig to the cat. BUILD 6 halted catVel on
   * input-up but left posDamp/lookDamp catch-up — that was the leftover
   * ~1s of props sliding in the OTS frame after W release.
   */
  follow(dt: number, catPos: Vec3, yaw: number, catVel: Vec3) {
    const speed = Math.hypot(catVel.x, catVel.z);
    const pose = otsPose(catPos, yaw, speed);
    this.pos.copy(pose.pos);
    this.look.copy(pose.look);
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
