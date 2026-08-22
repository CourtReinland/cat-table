import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  STEER,
  cameraRelativeMove,
  cameraRight,
  decelForSpeed,
  isSteerActive,
  leanFromYawRate,
  lookToCamDir,
  shortestAngle,
  stepProwl,
  yawRateForSpeed,
  type XZ,
} from './Steer.ts';
import { combineMoveAxes } from '../core/Input.ts';

const LOOK_NEG_Z = { x: 0, y: 0, z: -1 };
const LOOK_POS_X = { x: 1, y: 0, z: 0 };
const AXES_W: XZ = { x: 0, z: -1 };
const AXES_S: XZ = { x: 0, z: 1 };
const AXES_D: XZ = { x: 1, z: 0 };
const AXES_A: XZ = { x: -1, z: 0 };
const WALK = 1.35;
const DT = 1 / 60;

function almost(a: number, b: number, eps = 1e-6) {
  assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b}`);
}

function keysOf(...codes: string[]) {
  const set = new Set(codes);
  return (code: string) => set.has(code);
}

function stepFor(n: number, vel: XZ, yaw: number, desired: XZ) {
  let v = { ...vel };
  let y = yaw;
  const pos = { x: 0, z: 0 };
  let last = stepProwl(DT, v, y, desired);
  for (let i = 0; i < n; i++) {
    last = stepProwl(DT, v, y, desired);
    v = { x: last.x, z: last.z };
    y = last.yaw;
    pos.x += v.x * DT;
    pos.z += v.z * DT;
  }
  return { vel: v, yaw: y, pos, last };
}

describe('GS-STEER-01 camera-relative axes', () => {
  it('W and stick-forward share the same camera-local axes', () => {
    const keyboard = combineMoveAxes(keysOf('KeyW'), { x: 0, z: 0 });
    const stick = combineMoveAxes(() => false, { x: 0, z: -1 });
    almost(keyboard.x, stick.x);
    almost(keyboard.z, stick.z);
    almost(keyboard.z, -1);
  });

  it('D and stick-right share the same camera-local axes', () => {
    const keyboard = combineMoveAxes(keysOf('KeyD'), { x: 0, z: 0 });
    const stick = combineMoveAxes(() => false, { x: 1, z: 0 });
    almost(keyboard.x, stick.x);
    almost(keyboard.z, stick.z);
    almost(keyboard.x, 1);
  });

  it('WASD and stick add in the same space then clamp', () => {
    const mixed = combineMoveAxes(keysOf('KeyW'), { x: 1, z: 0 });
    almost(Math.hypot(mixed.x, mixed.z), 1);
    assert.ok(mixed.x > 0 && mixed.z < 0);
  });

  it('W walks into a camera looking down world -Z', () => {
    const camDir = lookToCamDir(LOOK_NEG_Z, 0);
    const move = cameraRelativeMove(AXES_W, camDir);
    almost(move.x, 0);
    almost(move.z, -1);
  });

  it('W walks into a camera looking down world +X (first-person facing +X)', () => {
    const camDir = lookToCamDir(LOOK_POS_X, Math.PI / 2);
    const move = cameraRelativeMove(AXES_W, camDir);
    almost(move.x, 1);
    almost(move.z, 0);
    // live 5399f59 would have used raw axes and slid along world -Z instead
    assert.notEqual(Math.sign(move.z || 0), -1);
  });

  it('stick-forward matches W for an angled camera', () => {
    const camDir = lookToCamDir({ x: 0.6, y: -0.3, z: -0.8 }, 0);
    const fromW = cameraRelativeMove(AXES_W, camDir);
    const fromStick = cameraRelativeMove(combineMoveAxes(() => false, { x: 0, z: -1 }), camDir);
    almost(fromW.x, fromStick.x);
    almost(fromW.z, fromStick.z);
    const dot = fromW.x * camDir.x + fromW.z * camDir.z;
    almost(dot, 1, 1e-5);
  });

  it('D is camera-right via camDir × up', () => {
    const camDir = lookToCamDir(LOOK_NEG_Z, 0);
    const right = cameraRight(camDir);
    const move = cameraRelativeMove(AXES_D, camDir);
    almost(right.x, 1);
    almost(right.z, 0);
    almost(move.x, 1);
    almost(move.z, 0);
  });

  it('S walks away from the camera (opposite of W)', () => {
    const camDir = lookToCamDir(LOOK_POS_X, Math.PI / 2);
    const fwd = cameraRelativeMove(AXES_W, camDir);
    const back = cameraRelativeMove(AXES_S, camDir);
    almost(fwd.x + back.x, 0);
    almost(fwd.z + back.z, 0);
  });

  it('near-vertical look falls back to heading so W stays where she faces', () => {
    const yaw = 0.4;
    const camDir = lookToCamDir({ x: 0, y: -1, z: 0 }, yaw);
    const move = cameraRelativeMove(AXES_W, camDir);
    almost(move.x, Math.sin(yaw));
    almost(move.z, Math.cos(yaw));
  });
});

describe('GS-STEER-FEEL planted pivot + slide-to-stop', () => {
  it('yaw rate is a capped body turn, not the live yawCatch-16 turret', () => {
    assert.ok(STEER.yawRatePlanted < 4, `planted ${STEER.yawRatePlanted} should be a slow pivot`);
    assert.ok(STEER.yawRateMoving < 6, `moving ${STEER.yawRateMoving} should still take time`);
    assert.ok(STEER.yawRatePlanted < STEER.yawRateMoving);
    // old catch: first frame of a 180° closed π * min(1, dt*16) ≈ 0.84 rad
    const turretFirst = Math.PI * Math.min(1, DT * 16);
    const plantedFirst = STEER.yawRatePlanted * DT;
    assert.ok(plantedFirst < turretFirst * 0.2, `first-frame yaw ${plantedFirst} vs turret ${turretFirst}`);
    almost(yawRateForSpeed(0), STEER.yawRatePlanted);
    assert.ok(yawRateForSpeed(WALK) >= STEER.yawRateMoving - 1e-9);
  });

  it('low-speed A/D is a planted pivot — feet stay while the body yaws slowly', () => {
    const camDir = lookToCamDir(LOOK_NEG_Z, 0);
    const dir = cameraRelativeMove(AXES_A, camDir);
    const desired = { x: dir.x * WALK, z: dir.z * WALK };
    const early = stepFor(12, { x: 0, z: 0 }, 0, desired); // 0.2s
    const dist = Math.hypot(early.pos.x, early.pos.z);
    assert.ok(dist < 0.05, `planted 0.2s travel ${dist} should keep the feet still`);
    assert.ok(early.yaw < 0, 'A should yaw toward camera-left');
    // 0.2s * 2.6 rad/s ≈ 0.52 rad — started, nowhere near 90°
    assert.ok(Math.abs(early.yaw) < 0.7, `0.2s yaw ${early.yaw} must not be a turret snap`);
    assert.ok(Math.abs(shortestAngle(early.yaw, -Math.PI / 2)) > 0.7);
    const earlySpd = Math.hypot(early.vel.x, early.vel.z);
    assert.ok(earlySpd < 0.08, `planted speed ${earlySpd} stays below the walk clip gate`);
    assert.ok(Math.abs(early.last.yawRate) > STEER.yawBusy, 'yawRate must count as active during the pivot');
    assert.ok(isSteerActive(earlySpd, early.last.yawRate));
    assert.equal(isSteerActive(0, 0), false);
  });

  it('a 180° turn from rest takes about a second, not a frame', () => {
    const desired = { x: 0, z: -WALK };
    const short = stepFor(24, { x: 0, z: 0 }, 0, desired); // 0.4s
    assert.ok(
      Math.abs(shortestAngle(short.yaw, Math.PI)) > 1.0,
      `0.4s of a 180° should still be turning (yaw ${short.yaw})`,
    );
    const done = stepFor(90, { x: 0, z: 0 }, 0, desired); // 1.5s
    assert.ok(
      Math.abs(shortestAngle(done.yaw, Math.PI)) < 0.2,
      `1.5s should finish the 180° (yaw ${done.yaw})`,
    );
  });

  it('does not crab-walk — settled velocity lies along heading', () => {
    const desired = { x: 0.9, z: 0.9 };
    const s = stepFor(90, { x: 0, z: 0 }, 0, desired);
    const fx = Math.sin(s.yaw);
    const fz = Math.cos(s.yaw);
    const along = s.vel.x * fx + s.vel.z * fz;
    const lat = Math.hypot(s.vel.x - along * fx, s.vel.z - along * fz);
    assert.ok(lat < 0.05, `lateral slip ${lat} should be near 0`);
    assert.ok(along > 0.8, `forward speed ${along} should have built up`);
  });

  it('accel is still weighted — first frame does not snap onto walk speed', () => {
    const kick = stepProwl(DT, { x: 0, z: 0 }, 0, { x: 0, z: WALK });
    const kicked = Math.hypot(kick.x, kick.z);
    assert.ok(kicked > 0.15 && kicked < 1.0, `first-frame accel ${kicked} should be partial`);
  });

  it('release is a Stray slide-to-stop, not a hover-puck brake', () => {
    assert.ok(STEER.decelSlide < 4, `slide decel ${STEER.decelSlide} must be well under the old 9`);
    assert.ok(STEER.decelSettle < STEER.accel);
    assert.ok(decelForSpeed(WALK) < 3, 'at walk speed, friction should be the slide');
    const coast = stepProwl(DT, { x: 0, z: WALK }, 0, { x: 0, z: 0 });
    assert.ok(Math.hypot(coast.x, coast.z) > 1.2, 'one frame of slide must leave almost all speed');

    const mid = stepFor(24, { x: 0, z: WALK }, 0, { x: 0, z: 0 }); // 0.4s
    const midSpd = Math.hypot(mid.vel.x, mid.vel.z);
    assert.ok(midSpd > 0.45, `0.4s after release she should still be sliding (${midSpd})`);

    const late = stepFor(90, { x: 0, z: WALK }, 0, { x: 0, z: 0 }); // 1.5s
    const lateSpd = Math.hypot(late.vel.x, late.vel.z);
    assert.ok(lateSpd < 0.08, `1.5s should scrape to a stop (${lateSpd})`);
  });

  it('turns at a lower speed deadzone than the live 0.15 puck', () => {
    const s = stepProwl(DT, { x: 0, z: 0 }, 0, { x: 0.1, z: 0 });
    assert.ok(s.yaw > 0, '0.1 sideways intent should start a yaw');
    assert.ok(s.yawRate > 0);
    assert.ok(STEER.yawDeadzone < 0.15);
  });

  it('A is a heading change, not a lasting world-axis slide', () => {
    const camDir = lookToCamDir(LOOK_NEG_Z, 0);
    const desiredDir = cameraRelativeMove(AXES_A, camDir);
    const desired = { x: desiredDir.x * WALK, z: desiredDir.z * WALK };
    const s = stepFor(70, { x: 0, z: 0 }, 0, desired);
    assert.ok(Math.abs(shortestAngle(s.yaw, -Math.PI / 2)) < 0.2, `yaw ${s.yaw} should face camera-left`);
    const facingDot = Math.sin(s.yaw) * s.vel.x + Math.cos(s.yaw) * s.vel.z;
    assert.ok(facingDot > 0.5, `once facing, she should walk into it (${facingDot})`);
  });

  it('lean banks against yaw rate so the body is not a rigid spin', () => {
    const left = leanFromYawRate(STEER.yawRatePlanted);
    const right = leanFromYawRate(-STEER.yawRatePlanted);
    assert.ok(left < 0 && right > 0, 'positive yaw (left) leans onto the left side');
    assert.ok(Math.abs(left) <= STEER.leanMax);
    assert.ok(Math.abs(leanFromYawRate(40)) <= STEER.leanMax);
  });

  it('live 90° cut and reverse use accel catch, not scrape ice-skate', () => {
    const cut = stepFor(18, { x: 0, z: WALK }, 0, { x: WALK, z: 0 }); // 0.3s
    const cfx = Math.sin(cut.yaw);
    const cfz = Math.cos(cut.yaw);
    const cutAlong = cut.vel.x * cfx + cut.vel.z * cfz;
    assert.ok(cutAlong > 1.0, `in-gait 90° should keep walk speed along heading (${cutAlong})`);
    assert.ok(cut.vel.z < 0.85, `old-axis leftover ${cut.vel.z} is ice-skate; heading catch should plant the cut`);

    const rev = stepFor(30, { x: 0, z: WALK }, 0, { x: 0, z: -WALK }); // 0.5s
    const rfx = Math.sin(rev.yaw);
    const rfz = Math.cos(rev.yaw);
    const revAlong = rev.vel.x * rfx + rev.vel.z * rfz;
    assert.ok(revAlong > 1.0, `held reverse should keep gait speed along heading (${revAlong})`);
    assert.ok(rev.vel.z < 0.4, `reverse must not ice-skate the old +Z (${rev.vel.z})`);
  });

  it('scrape still applies when input eases or sprint drops to walk', () => {
    const eased = WALK * 0.25;
    const ease = stepProwl(DT, { x: 0, z: WALK }, 0, { x: 0, z: eased });
    const a = 1 - Math.exp(-decelForSpeed(WALK) * DT);
    almost(Math.hypot(ease.x, ease.z), WALK + (eased - WALK) * a, 1e-3);

    const sprint = 2.2;
    const drop = stepProwl(DT, { x: 0, z: sprint }, 0, { x: 0, z: WALK });
    const dropped = Math.hypot(drop.x, drop.z);
    assert.ok(dropped > sprint - 0.12, `sprint→walk should scrape, not accel-brake (${dropped})`);
    assert.ok(dropped < sprint);
  });
});
