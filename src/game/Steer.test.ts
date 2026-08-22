import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  STEER,
  cameraRelativeMove,
  cameraRight,
  lookToCamDir,
  shortestAngle,
  stepProwl,
  type XZ,
} from './Steer.ts';
import { combineMoveAxes } from '../core/Input.ts';

const LOOK_NEG_Z = { x: 0, y: 0, z: -1 };
const LOOK_POS_X = { x: 1, y: 0, z: 0 };
const AXES_W: XZ = { x: 0, z: -1 };
const AXES_S: XZ = { x: 0, z: 1 };
const AXES_D: XZ = { x: 1, z: 0 };
const AXES_A: XZ = { x: -1, z: 0 };

function almost(a: number, b: number, eps = 1e-6) {
  assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b}`);
}

function keysOf(...codes: string[]) {
  const set = new Set(codes);
  return (code: string) => set.has(code);
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

describe('GS-STEER-01 cat body', () => {
  it('yaw catches desired motion instead of leaving her facing the old axis', () => {
    const desired = { x: 1.35, z: 0 };
    let yaw = 0;
    let vel: XZ = { x: 0, z: 0 };
    for (let i = 0; i < 20; i++) {
      const s = stepProwl(1 / 60, vel, yaw, desired);
      vel = { x: s.x, z: s.z };
      yaw = s.yaw;
    }
    assert.ok(Math.abs(shortestAngle(yaw, Math.PI / 2)) < 0.15, `yaw ${yaw} should face +X`);
  });

  it('does not crab-walk — settled velocity lies along heading', () => {
    const desired = { x: 0.9, z: 0.9 };
    let yaw = 0;
    let vel: XZ = { x: 0, z: 0 };
    for (let i = 0; i < 45; i++) {
      const s = stepProwl(1 / 60, vel, yaw, desired);
      vel = { x: s.x, z: s.z };
      yaw = s.yaw;
    }
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const along = vel.x * fx + vel.z * fz;
    const lat = Math.hypot(vel.x - along * fx, vel.z - along * fz);
    assert.ok(lat < 0.05, `lateral slip ${lat} should be near 0`);
    assert.ok(along > 0.8, `forward speed ${along} should have built up`);
  });

  it('accel/decel are weighted — she does not snap to a stop like a puck', () => {
    let vel: XZ = { x: 0, z: 1.35 };
    let yaw = 0;
    const coast = stepProwl(1 / 60, vel, yaw, { x: 0, z: 0 });
    assert.ok(Math.hypot(coast.x, coast.z) > 1.1, 'one frame of decel must leave residual speed');
    const kick = stepProwl(1 / 60, { x: 0, z: 0 }, 0, { x: 0, z: 1.35 });
    const kicked = Math.hypot(kick.x, kick.z);
    assert.ok(kicked > 0.15 && kicked < 1.0, `first-frame accel ${kicked} should be partial`);
  });

  it('turns at a lower speed deadzone than the live 0.15 puck', () => {
    const s = stepProwl(1 / 60, { x: 0, z: 0 }, 0, { x: 0.1, z: 0 });
    assert.ok(s.yaw > 0, '0.1 sideways intent should start a yaw catch');
    assert.ok(STEER.yawDeadzone < 0.15);
  });

  it('A is a heading change, not a lasting world-axis slide', () => {
    const camDir = lookToCamDir(LOOK_NEG_Z, 0);
    const desiredDir = cameraRelativeMove(AXES_A, camDir);
    const desired = { x: desiredDir.x * 1.35, z: desiredDir.z * 1.35 };
    let yaw = 0;
    let vel: XZ = { x: 0, z: 0 };
    for (let i = 0; i < 30; i++) {
      const s = stepProwl(1 / 60, vel, yaw, desired);
      vel = { x: s.x, z: s.z };
      yaw = s.yaw;
    }
    // facing into the desired (camera-left = world -X), not sliding along -X while facing +Z
    assert.ok(Math.abs(shortestAngle(yaw, -Math.PI / 2)) < 0.2);
    const facingDot = Math.sin(yaw) * vel.x + Math.cos(yaw) * vel.z;
    assert.ok(facingDot > 0.5);
  });
});
