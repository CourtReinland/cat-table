/**
 * GS-STEER-01 — camera-relative prowl.
 *
 * Keyboard WASD and the mobile stick share the same camera-local axes
 * (`x` = right, `z` = back, so W / stick-forward is `z < 0`). Game.ts
 * maps those axes through the live camera look so W walks into the lens.
 * In first-person the camera *is* Suki, so that is also where she faces.
 *
 * Autopilot feeds world-space axes and must skip this remap.
 */

export type XZ = { x: number; z: number };

/** Tighter than the live 5399f59 puck (vel exp 10, yaw 10, deadzone 0.15). */
export const STEER = {
  /** Input present — snap onto the gait without ice-skate. */
  accel: 14,
  /** Input released — a short settle, not an instant halt. */
  decel: 9,
  /** Heading catches desired motion with body weight. */
  yawCatch: 16,
  /** Start turning as soon as the gait has a direction. */
  yawDeadzone: 0.06,
  /** Kill crab-walk so she does not slide sideways. */
  lateralCatch: 20,
} as const;

/** Flatten a world look vector onto XZ. Falls back to current heading if vertical. */
export function lookToCamDir(look: { x: number; y: number; z: number }, fallbackYaw: number): XZ {
  const len = Math.hypot(look.x, look.z);
  if (len < 1e-6) return { x: Math.sin(fallbackYaw), z: Math.cos(fallbackYaw) };
  return { x: look.x / len, z: look.z / len };
}

/** `camDir × world-up` on the ground plane. */
export function cameraRight(camDir: XZ): XZ {
  return { x: -camDir.z, z: camDir.x };
}

/**
 * Camera-local axes → world XZ intent (unit-ish).
 *
 *   moveX = axes.x * camRight.x + -axes.z * camDir.x
 *   moveZ = axes.x * camRight.z + -axes.z * camDir.z
 *
 * W / stick-forward (`axes.z < 0`) walks along `camDir` (into the camera).
 */
export function cameraRelativeMove(axes: XZ, camDir: XZ): XZ {
  const right = cameraRight(camDir);
  const forward = -axes.z;
  return {
    x: axes.x * right.x + forward * camDir.x,
    z: axes.x * right.z + forward * camDir.z,
  };
}

export function shortestAngle(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Integrate a cat body: accelerate toward the desired world move, yaw into
 * that heading, and bleed off lateral slip so she does not crab-walk.
 *
 * `desired` is already scaled by walk/sprint speed.
 */
export function stepProwl(
  dt: number,
  vel: XZ,
  yaw: number,
  desired: XZ,
): { x: number; z: number; yaw: number } {
  const desiredSpd = Math.hypot(desired.x, desired.z);
  const rate = desiredSpd > 0.02 ? STEER.accel : STEER.decel;
  const a = 1 - Math.exp(-rate * dt);

  let nextYaw = yaw;
  if (desiredSpd > STEER.yawDeadzone) {
    const targetYaw = Math.atan2(desired.x, desired.z);
    nextYaw = yaw + shortestAngle(yaw, targetYaw) * Math.min(1, dt * STEER.yawCatch);
  }

  const fx = Math.sin(nextYaw);
  const fz = Math.cos(nextYaw);
  // Walk along heading at the requested speed — no sideways target.
  const targetX = fx * desiredSpd;
  const targetZ = fz * desiredSpd;
  let vx = vel.x + (targetX - vel.x) * a;
  let vz = vel.z + (targetZ - vel.z) * a;

  const along = vx * fx + vz * fz;
  const latX = vx - along * fx;
  const latZ = vz - along * fz;
  const latKeep = Math.exp(-STEER.lateralCatch * dt);
  vx = along * fx + latX * latKeep;
  vz = along * fz + latZ * latKeep;

  return { x: vx, z: vz, yaw: nextYaw };
}
