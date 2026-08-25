import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  isPlantStrafe,
  isPlantTurn,
  resolveHeadingLock,
  resolvePlantLock,
  type PlantLock,
  type XZ,
} from './Steer.ts';
import { combineMoveAxes, restDeadzone, REST_DEADZONE } from '../core/Input.ts';
import { OTS, otsPose } from './CameraRig.ts';

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

function stepFor(n: number, vel: XZ, yaw: number, desired: XZ, yawOnly = false) {
  let v = { ...vel };
  let y = yaw;
  const pos = { x: 0, z: 0 };
  let last = stepProwl(DT, v, y, desired, yawOnly);
  for (let i = 0; i < n; i++) {
    last = stepProwl(DT, v, y, desired, yawOnly);
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

describe('GS-STEER-FEEL planted pivot + halt-on-release', () => {
  it('yaw rate is a capped body turn, punched past the main 2.6 / 4.2 hover-puck', () => {
    assert.ok(STEER.yawRatePlanted >= 1.3 && STEER.yawRatePlanted <= 1.6, `planted ${STEER.yawRatePlanted} should be a ~2s 180`);
    assert.ok(STEER.yawRateMoving < 3, `moving ${STEER.yawRateMoving} should be slower than main 4.2`);
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
    const early = stepFor(12, { x: 0, z: 0 }, 0, desired, true); // 0.2s
    const dist = Math.hypot(early.pos.x, early.pos.z);
    assert.ok(dist < 0.05, `planted 0.2s travel ${dist} should keep the feet still`);
    assert.ok(early.yaw < 0, 'A should yaw toward camera-left');
    // 0.2s * 1.4 rad/s ≈ 0.28 rad — started, nowhere near 90°
    assert.ok(Math.abs(early.yaw) < 0.45, `0.2s yaw ${early.yaw} must not be a turret snap`);
    assert.ok(Math.abs(shortestAngle(early.yaw, -Math.PI / 2)) > 1.0);
    const earlySpd = Math.hypot(early.vel.x, early.vel.z);
    assert.ok(earlySpd < 0.08, `planted speed ${earlySpd} stays below the walk clip gate`);
    assert.ok(Math.abs(early.last.yawRate) > STEER.yawBusy, 'yawRate must count as active during the pivot');
    assert.ok(isSteerActive(earlySpd, early.last.yawRate));
    assert.equal(isSteerActive(0, 0), false);
  });

  it('a 180° turn from rest takes about two seconds, not a snap', () => {
    const desired = { x: 0, z: -WALK };
    const short = stepFor(36, { x: 0, z: 0 }, 0, desired); // 0.6s
    assert.ok(
      Math.abs(shortestAngle(short.yaw, Math.PI)) > 1.0,
      `0.6s of a 180° should still be turning (yaw ${short.yaw})`,
    );
    const mid = stepFor(90, { x: 0, z: 0 }, 0, desired); // 1.5s
    assert.ok(
      Math.abs(shortestAngle(mid.yaw, Math.PI)) > 0.4,
      `1.5s should still be mid-pivot (yaw ${mid.yaw})`,
    );
    const done = stepFor(150, { x: 0, z: 0 }, 0, desired); // 2.5s
    assert.ok(
      Math.abs(shortestAngle(done.yaw, Math.PI)) < 0.2,
      `2.5s should finish the 180° (yaw ${done.yaw})`,
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

  it('release halts on a dime — no Stray slide', () => {
    assert.ok(STEER.decelSlide >= 1.0 && STEER.decelSlide <= 1.4, `constant ${STEER.decelSlide} kept, unused on release`);
    assert.ok(STEER.decelSettle < STEER.accel);
    const coast = stepProwl(DT, { x: 0, z: WALK }, 0, { x: 0, z: 0 });
    almost(coast.x, 0);
    almost(coast.z, 0);
    almost(coast.yawRate, 0);

    const mid = stepFor(36, { x: 0, z: WALK }, 0, { x: 0, z: 0 }); // 0.6s
    almost(Math.hypot(mid.vel.x, mid.vel.z), 0);
    almost(Math.hypot(mid.pos.x, mid.pos.z), 0);

    const late = stepFor(90, { x: 0, z: WALK }, 0, { x: 0, z: 0 }); // 1.5s playtest window
    almost(Math.hypot(late.vel.x, late.vel.z), 0);
    almost(Math.hypot(late.pos.x, late.pos.z), 0);
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
    const s = stepFor(90, { x: 0, z: 0 }, 0, desired, true);
    assert.ok(Math.abs(shortestAngle(s.yaw, -Math.PI / 2)) < 0.2, `yaw ${s.yaw} should face camera-left`);
    const spd = Math.hypot(s.vel.x, s.vel.z);
    assert.ok(spd < 0.02, `planted A must not sneak forward (${spd})`);
    assert.ok(Math.hypot(s.pos.x, s.pos.z) < 0.02, `planted A travel ${Math.hypot(s.pos.x, s.pos.z)} must stay planted`);
    assert.equal(isPlantTurn(AXES_A), true);
    assert.equal(isPlantTurn(AXES_W), false);
  });

  it('lean banks against yaw rate so the body is not a rigid spin', () => {
    const left = leanFromYawRate(STEER.yawRatePlanted);
    const right = leanFromYawRate(-STEER.yawRatePlanted);
    assert.ok(left < 0 && right > 0, 'positive yaw (left) leans onto the left side');
    assert.ok(Math.abs(left) <= STEER.leanMax);
    assert.ok(Math.abs(leanFromYawRate(40)) <= STEER.leanMax);
  });

  it('live 90° cut and reverse use accel catch, not scrape ice-skate', () => {
    const cut = stepFor(30, { x: 0, z: WALK }, 0, { x: WALK, z: 0 }); // 0.5s
    const cfx = Math.sin(cut.yaw);
    const cfz = Math.cos(cut.yaw);
    const cutAlong = cut.vel.x * cfx + cut.vel.z * cfz;
    assert.ok(cutAlong > 1.0, `in-gait 90° should keep walk speed along heading (${cutAlong})`);
    assert.ok(cut.vel.z < 0.85, `old-axis leftover ${cut.vel.z} is ice-skate; heading catch should plant the cut`);

    const rev = stepFor(48, { x: 0, z: WALK }, 0, { x: 0, z: -WALK }); // 0.8s
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

  it('planted FP A/D is yaw-only — Game skips the walk lock so turn does not sneak forward', () => {
    // Lens is Suki: camDir = current yaw every frame. Game skips resolvePlantLock
    // when isPlantTurn, and stepProwl(..., yawOnly) zeros translation.
    const facing = (yaw: number): XZ => ({ x: Math.sin(yaw), z: Math.cos(yaw) });

    let yaw = 0;
    let vel: XZ = { x: 0, z: 0 };
    const pos = { x: 0, z: 0 };
    for (let i = 0; i < 120; i++) {
      assert.equal(isPlantTurn(AXES_A), true);
      const live = cameraRelativeMove(AXES_A, facing(yaw));
      const s = stepProwl(DT, vel, yaw, { x: live.x * WALK, z: live.z * WALK }, true);
      vel = { x: s.x, z: s.z };
      yaw = s.yaw;
      pos.x += vel.x * DT;
      pos.z += vel.z * DT;
    }
    assert.ok(Math.hypot(vel.x, vel.z) < 0.02, `planted A must not translate (${Math.hypot(vel.x, vel.z)})`);
    assert.ok(Math.hypot(pos.x, pos.z) < 0.02, `planted A travel ${Math.hypot(pos.x, pos.z)} must stay planted`);
    assert.ok(Math.abs(yaw) > 2.2, `held A should keep yawing in place (yaw ${yaw})`);
  });

  it('body-locked W stays live and commits; in-gait A does not start a lock', () => {
    const facing = (yaw: number): XZ => ({ x: Math.sin(yaw), z: Math.cos(yaw) });
    const w = resolvePlantLock(AXES_W, facing(0), 0, null);
    assert.equal(w.lock, null);
    almost(w.move.x, 0);
    almost(w.move.z, 1);

    let yaw = 0;
    let vel: XZ = { x: 0, z: 0 };
    for (let i = 0; i < 20; i++) {
      const r = resolvePlantLock(AXES_W, facing(yaw), Math.hypot(vel.x, vel.z), null);
      const s = stepProwl(DT, vel, yaw, { x: r.move.x * WALK, z: r.move.z * WALK });
      vel = { x: s.x, z: s.z };
      yaw = s.yaw;
    }
    assert.ok(Math.hypot(vel.x, vel.z) > 0.4, 'W from rest should walk into the lens');
    assert.ok(Math.abs(yaw) < 0.05, 'W should not yaw');

    const movingA = resolvePlantLock(AXES_A, facing(0), WALK, null);
    assert.equal(movingA.lock, null, 'in-gait A/D is a cut, not a new plant lock');
    assert.ok(isPlantStrafe(AXES_A) && isPlantStrafe(AXES_S));
    assert.equal(isPlantStrafe(AXES_W), false);

    const held = resolvePlantLock(AXES_A, facing(0), 0, null);
    assert.ok(held.lock);
    const released = resolvePlantLock({ x: 0, z: 0 }, facing(0), 0, held.lock);
    assert.equal(released.lock, null);
  });

  it('locked analog A/D/S keeps heading but scales magnitude so ease-off scrapes', () => {
    const cam = { x: 0, z: 1 };
    const full = resolvePlantLock({ x: -1, z: 0 }, cam, 0, null);
    assert.ok(full.lock);
    almost(Math.hypot(full.move.x, full.move.z), 1);
    almost(Math.hypot(full.lock.world.x, full.lock.world.z), 1);

    const analog = resolvePlantLock({ x: -0.3, z: 0 }, cam, 0, full.lock);
    assert.ok(analog.lock, 'eased stick should keep the lock until |axis| < 0.05');
    almost(Math.hypot(analog.move.x, analog.move.z), 0.3);
    const fullDir = Math.atan2(full.lock.world.x, full.lock.world.z);
    const analogDir = Math.atan2(analog.move.x, analog.move.z);
    almost(shortestAngle(fullDir, analogDir), 0, 1e-6);

    const desired = { x: analog.move.x * WALK, z: analog.move.z * WALK };
    const coasting = { x: full.move.x * WALK, z: full.move.z * WALK };
    // Analog A is a plant turn: yaw only, even with a leftover walk vector.
    const eased = stepProwl(
      DT,
      coasting,
      Math.atan2(full.lock.world.x, full.lock.world.z),
      desired,
      true,
    );
    almost(Math.hypot(eased.x, eased.z), 0);
  });
});

describe('GS-CAM-OTS rest / no auto-forward', () => {
  it('no keys and a centered stick is exactly rest', () => {
    const a = combineMoveAxes(() => false, { x: 0, z: 0 });
    almost(a.x, 0);
    almost(a.z, 0);
    const rest = restDeadzone(a);
    almost(rest.x, 0);
    almost(rest.z, 0);
  });

  it('tiny analog noise is rest, not a phantom W', () => {
    const noisy = restDeadzone({ x: 0.02, z: -0.04 });
    almost(noisy.x, 0);
    almost(noisy.z, 0);
    assert.ok(REST_DEADZONE >= 0.05);
    const w = restDeadzone(AXES_W);
    almost(w.z, -1);
  });

  it('zero desired from a standstill does not invent forward drive', () => {
    const s = stepProwl(DT, { x: 0, z: 0 }, 0, { x: 0, z: 0 });
    almost(s.x, 0);
    almost(s.z, 0);
    almost(s.yawRate, 0);
    assert.equal(isSteerActive(0, 0), false);
  });

  it('camera-relative of rest axes is rest for any look', () => {
    const a = cameraRelativeMove({ x: 0, z: 0 }, lookToCamDir(LOOK_POS_X, 0));
    almost(a.x, 0);
    almost(a.z, 0);
  });
});

/** Flattened OTS look — side-offset so camDir ≠ cat heading. */
function otsCamDir(yaw: number, speed = 0): XZ {
  const pose = otsPose({ x: 0, y: 0, z: 0 }, yaw, speed);
  return lookToCamDir(
    { x: pose.look.x - pose.pos.x, y: pose.look.y - pose.pos.y, z: pose.look.z - pose.pos.z },
    yaw,
  );
}

function maxCrossTrack(points: XZ[]): number {
  const a = points[0];
  const b = points[points.length - 1];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const span = Math.hypot(dx, dz) || 1;
  let max = 0;
  for (const p of points) {
    const cross = Math.abs((p.x - a.x) * dz - (p.z - a.z) * dx) / span;
    if (cross > max) max = cross;
  }
  return max;
}

describe('GS-W-CIRCLE heading lock (side-offset OTS)', () => {
  it('OTS look is inward of cat heading — the live-W orbit bias', () => {
    assert.equal(OTS.side, 0.18);
    const yaw = 0;
    const cam = otsCamDir(yaw);
    const heading = { x: Math.sin(yaw), z: Math.cos(yaw) };
    const dot = cam.x * heading.x + cam.z * heading.z;
    assert.ok(dot < 0.995, `camDir·heading ${dot} should show the 0.18 side offset`);
    assert.ok(Math.abs(cam.x) > 0.05, `camDir.x ${cam.x} must not equal heading`);
  });

  it('W-only from standstill walks a straight line; live remap would orbit', () => {
    const frames = 60; // 1.0s
    const settle = 20; // 0.33s — planted yaw onto the snapshot heading

    let lock: PlantLock | null = null;
    let yaw = 0;
    let vel: XZ = { x: 0, z: 0 };
    const pos = { x: 0, z: 0 };
    const path: XZ[] = [{ x: 0, z: 0 }];
    let yawAtSettle = 0;
    for (let i = 0; i < frames; i++) {
      const cam = otsCamDir(yaw, Math.hypot(vel.x, vel.z));
      const r = resolveHeadingLock(AXES_W, cam, lock);
      lock = r.lock;
      const s = stepProwl(DT, vel, yaw, { x: r.move.x * WALK, z: r.move.z * WALK });
      vel = { x: s.x, z: s.z };
      yaw = s.yaw;
      pos.x += vel.x * DT;
      pos.z += vel.z * DT;
      path.push({ x: pos.x, z: pos.z });
      if (i === settle - 1) yawAtSettle = yaw;
    }
    assert.ok(lock, 'held W must snapshot a world heading');
    assert.ok(Math.hypot(vel.x, vel.z) > 0.8, 'W from rest should be on the gait');
    assert.ok(
      Math.abs(shortestAngle(yaw, yawAtSettle)) < 0.03,
      `yaw must settle after the initial catch (Δ ${shortestAngle(yaw, yawAtSettle)})`,
    );
    const settled = path.slice(settle);
    const drift = maxCrossTrack(settled);
    assert.ok(drift < 0.02, `settled path cross-track ${drift} is an arc, not a line`);

    // Same loop without the lock: live camDir chase — the BUILD 12 circle.
    let liveYaw = 0;
    let liveVel: XZ = { x: 0, z: 0 };
    for (let i = 0; i < frames; i++) {
      const cam = otsCamDir(liveYaw, Math.hypot(liveVel.x, liveVel.z));
      const move = cameraRelativeMove(AXES_W, cam);
      const s = stepProwl(DT, liveVel, liveYaw, { x: move.x * WALK, z: move.z * WALK });
      liveVel = { x: s.x, z: s.z };
      liveYaw = s.yaw;
    }
    assert.ok(
      Math.abs(shortestAngle(liveYaw, 0)) > 0.6,
      `live OTS remap should keep turning (yaw ${liveYaw}); lock exists because of this`,
    );
    assert.ok(
      Math.abs(shortestAngle(yaw, 0)) < 0.2,
      `locked W should only take the initial side-offset catch (yaw ${yaw})`,
    );
  });

  it('planted A/D still pivots in place under the heading lock', () => {
    let lock: PlantLock | null = null;
    let yaw = 0;
    let vel: XZ = { x: 0, z: 0 };
    const pos = { x: 0, z: 0 };
    for (let i = 0; i < 90; i++) {
      const cam = otsCamDir(yaw);
      assert.equal(isPlantTurn(AXES_A), true);
      const r = resolveHeadingLock(AXES_A, cam, lock);
      lock = r.lock;
      const s = stepProwl(DT, vel, yaw, { x: r.move.x * WALK, z: r.move.z * WALK }, true);
      vel = { x: s.x, z: s.z };
      yaw = s.yaw;
      pos.x += vel.x * DT;
      pos.z += vel.z * DT;
    }
    assert.ok(lock, 'planted A snapshots a world heading');
    assert.ok(Math.hypot(vel.x, vel.z) < 0.02, `planted A must not translate (${Math.hypot(vel.x, vel.z)})`);
    assert.ok(Math.hypot(pos.x, pos.z) < 0.02, `planted A travel ${Math.hypot(pos.x, pos.z)} must stay planted`);
    assert.ok(Math.abs(yaw) > 0.8, `held A should yaw in place (yaw ${yaw})`);
    const aTarget = Math.atan2(lock.world.x, lock.world.z);
    assert.ok(
      Math.abs(shortestAngle(yaw, aTarget)) < 0.35,
      `A should face the snapshotted heading (yaw ${yaw} vs ${aTarget})`,
    );

    const d = resolveHeadingLock(AXES_D, otsCamDir(0), null);
    const pivoted = stepFor(90, { x: 0, z: 0 }, 0, { x: d.move.x * WALK, z: d.move.z * WALK }, true);
    assert.ok(Math.sign(pivoted.yaw) !== Math.sign(yaw), 'D should yaw the other way from A');
    assert.ok(Math.abs(pivoted.yaw) > 0.8, `held D should yaw in place (yaw ${pivoted.yaw})`);
    assert.ok(Math.hypot(pivoted.pos.x, pivoted.pos.z) < 0.02, 'D planted pivot must keep the feet still');
  });

  it('release and quantized-axis change drop or resnapshot the lock', () => {
    const cam = otsCamDir(0);
    const held = resolveHeadingLock(AXES_W, cam, null);
    assert.ok(held.lock);
    const still = resolveHeadingLock(AXES_W, otsCamDir(0.4), held.lock);
    assert.ok(still.lock);
    almost(still.lock.world.x, held.lock.world.x);
    almost(still.lock.world.z, held.lock.world.z);

    const up = resolveHeadingLock({ x: 0, z: 0 }, cam, held.lock);
    assert.equal(up.lock, null);

    const cut = resolveHeadingLock(AXES_D, cam, held.lock);
    assert.ok(cut.lock);
    const wDir = Math.atan2(held.lock.world.x, held.lock.world.z);
    const dDir = Math.atan2(cut.lock.world.x, cut.lock.world.z);
    assert.ok(Math.abs(shortestAngle(wDir, dDir)) > 0.8, 'D must resnapshot off the W heading');
  });

  it('Game third-person playerWorldAxes holds W; FP plant lock and OTS numbers stay', () => {
    const src = readFileSync(new URL('./Game.ts', import.meta.url), 'utf8');
    assert.match(src, /resolveHeadingLock/);
    assert.match(src, /!this\.fpCam/);
    assert.match(src, /resolvePlantLock/);
    assert.match(src, /isPlantTurn/);
    assert.doesNotMatch(src, /OTS\.(back|side|height)\s*=/);
    assert.equal(OTS.side, 0.18);
    assert.equal(OTS.back, 1.32);
    assert.equal(OTS.fov, 52);
    assert.equal(isPlantStrafe(AXES_W), false);
  });
});
