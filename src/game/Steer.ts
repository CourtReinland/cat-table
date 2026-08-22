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
 * PR2 / main 684a736 was still too subtle on a phone:
 *   accel 12, decelSlide 2.2, yawRatePlanted 2.6, yawRateMoving 4.2
 * GS-STEER-STAMP punches planted A/D (~2.2s 180°) and release slide.
 */
export const STEER = {
  /** Input present and facing the intent — onto the gait, not an ice-skate. */
  accel: 12,
  /** Fast residual — long Stray slide, readable on a thumb-stick. */
  decelSlide: 1.15,
  /** Slow residual — scrape and plant. */
  decelSettle: 5.4,
  /** Blend slide → settle around this speed (u/s). */
  scrapeSpeed: 0.48,
  /**
   * Planted A/D pivot (rad/s). π / 1.4 ≈ 2.24s for a 180° — feet stay,
   * body yaws. Main 2.6 was still a hover-puck on a phone.
   */
  yawRatePlanted: 1.4,
  /** On the move — still a body turn (π / 2.2 ≈ 1.43s for 180°). */
  yawRateMoving: 2.2,
  /** Below this speed (u/s), treat A/D as a planted pivot. */
  plantSpeed: 0.38,
  /**
   * Planted walk-commit: facing dot must clear this before the feet step
   * (0.55 ≈ 57°). Until then A/D is yaw-only.
   */
  plantAlign: 0.55,
  /** Start turning as soon as the gait has a direction. */
  yawDeadzone: 0.06,
  /**
   * |yawRate| above this is a commanded pivot. Idle/sit must not own
   * the body while planted A/D is turning in place (speed stays ~0).
   */
  yawBusy: 0.3,
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
 * Walking or a commanded planted pivot. Clip / sitK use this so look/sit
 * do not play while A/D is yawing with the feet still.
 */
export function isSteerActive(speed: number, yawRate: number, speedFloor = 0.08): boolean {
  return speed > speedFloor || Math.abs(yawRate) > STEER.yawBusy;
}

/** Snapshotted world intent for body-locked (first-person) planted A/D/S. */
export type PlantLock = { axes: XZ; world: XZ };

const PLANT_AXIS_DEAD = 0.05;

/** Quantize stick/WASD so analog wobble does not resnapshot the lock. */
export function quantizePlantAxes(axes: XZ): XZ {
  return {
    x: Math.abs(axes.x) <= PLANT_AXIS_DEAD ? 0 : Math.sign(axes.x),
    z: axes.z > PLANT_AXIS_DEAD ? 1 : axes.z < -PLANT_AXIS_DEAD ? -1 : 0,
  };
}

/** A/D or S (back). W-only is not a plant-strafe — it already faces the lens. */
export function isPlantStrafe(axes: XZ): boolean {
  const q = quantizePlantAxes(axes);
  return q.x !== 0 || q.z === 1;
}

function samePlantAxes(a: XZ, b: XZ): boolean {
  const qa = quantizePlantAxes(a);
  const qb = quantizePlantAxes(b);
  return qa.x === qb.x && qa.z === qb.z;
}

function unitXZ(v: XZ): XZ {
  const len = Math.hypot(v.x, v.z) || 1;
  return { x: v.x / len, z: v.z / len };
}

/** Locked unit heading × current analog/key magnitude (ease-off can scrape). */
function scaleLockedHeading(heading: XZ, axes: XZ): XZ {
  const mag = Math.hypot(axes.x, axes.z);
  return { x: heading.x * mag, z: heading.z * mag };
}

/**
 * Body-locked camera (first-person: the lens is Suki). Live-remapping A/D/S
 * every frame keeps desired ~90°/180° off yaw, so plantCommit never clears
 * and she tank-spins in place. Snapshot those keys to a world heading while
 * planted; keep it until they are released so she turns into it and walks.
 * Scale by hypot(axes) each frame so analog ease still scrapes.
 * W-only stays live. In-gait cuts (already moving) stay live. Third-person
 * follow should not call this.
 */
export function resolvePlantLock(
  axes: XZ,
  camDir: XZ,
  spd: number,
  lock: PlantLock | null,
): { move: XZ; lock: PlantLock | null } {
  const live = cameraRelativeMove(axes, camDir);
  if (!isPlantStrafe(axes)) return { move: live, lock: null };

  if (lock && samePlantAxes(lock.axes, axes)) {
    return { move: scaleLockedHeading(lock.world, axes), lock };
  }

  if (spd >= STEER.plantSpeed) return { move: live, lock: null };

  const heading = unitXZ(live);
  return {
    move: scaleLockedHeading(heading, axes),
    lock: { axes: { x: axes.x, z: axes.z }, world: heading },
  };
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
  // Body-locked FP must snapshot A/D/S (resolvePlantLock) or facingDot never
  // clears plantAlign and she yaws in place forever.
  let commit = 1;
  if (desiredSpd > 1e-8) {
    const facingDot = (fx * desired.x + fz * desired.z) / desiredSpd;
    const plantCommit = clamp((facingDot - STEER.plantAlign) / (1 - STEER.plantAlign), 0, 1);
    commit = mix(1, plantCommit, planted);
  }
  const targetSpd = desiredSpd * commit;
  const targetX = fx * targetSpd;
  const targetZ = fz * targetSpd;

  // Accel for in-gait heading catch while input is live and speed is not
  // actually dropping (90° / reverse while W is held). Scrape only on
  // release, analog ease, or sprint→walk — when commit lowers speed.
  const catchHeading = desiredSpd > STEER.yawDeadzone && targetSpd >= spd - 0.02;
  const rate = catchHeading ? STEER.accel : decelForSpeed(spd);
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
