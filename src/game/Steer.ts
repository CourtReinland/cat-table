/**
 * GS-STEER-01 direction + GS-STEER-FEEL body.
 *
 * Keyboard WASD and the mobile stick share the same camera-local axes
 * (`x` = right, `z` = back, so W / stick-forward is `z < 0`). Game.ts
 * maps those axes through the live camera look so W walks into the lens.
 * In first-person the camera *is* Suki, so that is also where she faces.
 *
 * Autopilot feeds world-space axes and must skip this remap.
 *
 * Feel (live ea73f93 failed playtest): yaw is a capped body rate, not an
 * exponential turret catch, and release is a slide-to-stop scrape.
 */

export type XZ = { x: number; z: number };

export type ProwlStep = { x: number; z: number; yaw: number; yawRate: number };

/**
 * Live ea73f93 / 8b29604 puck-adjacent body:
 *   accel 14, decel 9, yawCatch 16, yawDeadzone 0.06, lateralCatch 20
 * yawCatch 16 × dt closes ~27% of the remaining heading per frame — a 180°
 * snap. decel 9 halves speed in ~4 frames. Those are the numbers this ticket
 * walks back.
 */
export const STEER = {
  /** Input present and facing the intent — onto the gait, not an ice-skate. */
  accel: 12,
  /** Fast residual — Stray slide, paws still skidding. */
  decelSlide: 2.2,
  /** Slow residual — scrape and plant. */
  decelSettle: 5.4,
  /** Blend slide → settle around this speed (u/s). */
  scrapeSpeed: 0.48,
  /**
   * Planted A/D pivot (rad/s). π / 2.6 ≈ 1.21s for a 180° — feet stay,
   * body yaws, not a turret.
   */
  yawRatePlanted: 2.6,
  /** On the move — still a body turn (π / 4.2 ≈ 0.75s for 180°). */
  yawRateMoving: 4.2,
  /** Below this speed (u/s), treat A/D as a planted pivot. */
  plantSpeed: 0.38,
  /**
   * Planted walk-commit: facing dot must clear this before the feet step
   * (0.55 ≈ 57°). Until then A/D is yaw-only.
   */
  plantAlign: 0.55,
  /** Start turning as soon as the gait has a direction. */
  yawDeadzone: 0.06,
  /** Bleed crab-walk; leave a little smear so a slide can scrape. */
  lateralCatch: 16,
  /** Visual bank (rad per rad/s of yaw). */
  leanPerYawRate: 0.045,
  leanMax: 0.16,
} as const;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function mix(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

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

/** Capped yaw rate from current speed — slow planted, a bit quicker while moving. */
export function yawRateForSpeed(spd: number): number {
  return mix(STEER.yawRatePlanted, STEER.yawRateMoving, spd / STEER.plantSpeed);
}

/** Slide friction at speed, scrape as she plants. */
export function decelForSpeed(spd: number): number {
  return mix(STEER.decelSettle, STEER.decelSlide, spd / STEER.scrapeSpeed);
}

/** Bank into the turn so yaw is not a rigid-body spin. Negative z = lean left. */
export function leanFromYawRate(yawRate: number): number {
  return clamp(-yawRate * STEER.leanPerYawRate, -STEER.leanMax, STEER.leanMax);
}

/**
 * Integrate a cat body: accelerate toward the desired world move, yaw into
 * that heading at a capped body rate, and bleed off lateral slip.
 *
 * `desired` is already scaled by walk/sprint speed.
 *
 * Low-speed A/D is a planted pivot: feet stay until she faces the intent.
 * Release is a slide then scrape, not an exponential hover-puck halt.
 */
export function stepProwl(
  dt: number,
  vel: XZ,
  yaw: number,
  desired: XZ,
): ProwlStep {
  const desiredSpd = Math.hypot(desired.x, desired.z);
  const spd = Math.hypot(vel.x, vel.z);
  const planted = 1 - clamp(spd / STEER.plantSpeed, 0, 1);

  let yawRate = 0;
  let nextYaw = yaw;
  if (desiredSpd > STEER.yawDeadzone) {
    const targetYaw = Math.atan2(desired.x, desired.z);
    const err = shortestAngle(yaw, targetYaw);
    const maxStep = yawRateForSpeed(spd) * dt;
    const step = clamp(err, -maxStep, maxStep);
    nextYaw = yaw + step;
    yawRate = dt > 1e-8 ? step / dt : 0;
  }

  const fx = Math.sin(nextYaw);
  const fz = Math.cos(nextYaw);

  // Planted: do not walk until the body faces the intent (feet stay).
  // Moving: keep committing along heading while the body yaws (a curve, not a crab).
  let commit = 1;
  if (desiredSpd > 1e-8) {
    const facingDot = (fx * desired.x + fz * desired.z) / desiredSpd;
    const plantCommit = clamp((facingDot - STEER.plantAlign) / (1 - STEER.plantAlign), 0, 1);
    commit = mix(1, plantCommit, planted);
  }
  const targetSpd = desiredSpd * commit;
  const targetX = fx * targetSpd;
  const targetZ = fz * targetSpd;

  const speedingUp = targetSpd > spd + 0.02;
  const rate = speedingUp ? STEER.accel : decelForSpeed(spd);
  const a = 1 - Math.exp(-rate * dt);

  let vx = vel.x + (targetX - vel.x) * a;
  let vz = vel.z + (targetZ - vel.z) * a;

  const along = vx * fx + vz * fz;
  const latX = vx - along * fx;
  const latZ = vz - along * fz;
  const latKeep = Math.exp(-STEER.lateralCatch * dt);
  vx = along * fx + latX * latKeep;
  vz = along * fz + latZ * latKeep;

  return { x: vx, z: vz, yaw: nextYaw, yawRate };
}
