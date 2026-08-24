import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import { BUILD_STAMP } from '../buildStamp.ts';
import {
  CAT_FRAME,
  DEFAULT_FP_CAM,
  OTS,
  applyOtsPose,
  catForward,
  catFrameCorners,
  makeOtsCamera,
  otsPose,
  pointsInView,
} from './CameraRig.ts';
import { STEER } from './Steer.ts';

function ndcOf(
  camera: THREE.PerspectiveCamera,
  p: THREE.Vector3,
): { x: number; y: number; z: number } {
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const ndc = p.clone().project(camera);
  return { x: ndc.x, y: ndc.y, z: ndc.z };
}

describe('GS-CAM-OTS default + stamp', () => {
  it('does not boot into first-person', () => {
    assert.equal(DEFAULT_FP_CAM, false);
  });

  it('visible stamp is BUILD 5', () => {
    assert.match(BUILD_STAMP, /^BUILD 5\b/);
  });

  it('keeps BUILD 3 steer tunables', () => {
    assert.equal(STEER.yawRatePlanted, 1.4);
    assert.equal(STEER.yawRateMoving, 2.2);
    assert.equal(STEER.decelSlide, 1.15);
    assert.equal(STEER.yawBusy, 0.3);
  });
});

describe('GS-CAM-OTS close over-the-shoulder', () => {
  it('sits behind the cat, over the right shoulder, looking at the body', () => {
    const cat = new THREE.Vector3(0, 1.0, 0);
    const yaw = 0; // faces +Z
    const pose = otsPose(cat, yaw, 0);
    const fwd = catForward(yaw);
    const toCam = {
      x: pose.pos.x - cat.x,
      y: pose.pos.y - cat.y,
      z: pose.pos.z - cat.z,
    };
    const behind = -(toCam.x * fwd.x + toCam.z * fwd.z);
    assert.ok(behind > 0.8, `camera should be behind the cat, behind=${behind}`);
    assert.ok(toCam.x > 0.15, `right-shoulder offset, side=${toCam.x}`);
    assert.ok(toCam.y > 0.35 && toCam.y < 0.75, `close height, y=${toCam.y}`);
    assert.ok(pose.look.y > cat.y + 0.05 && pose.look.y < cat.y + 0.28, 'look at chest, not sky');
    // not first-person (between the ears)
    assert.ok(behind > 0.7 && toCam.y > 0.3, 'must not sit between the ears');
  });

  it('frames the whole cat (head to paws) on desktop and phone', () => {
    const cat = new THREE.Vector3(0.4, 1.12, 0.2);
    const yaw = Math.PI * 0.5; // spawn facing +X
    const corners = catFrameCorners(cat, yaw);
    assert.equal(corners.length, 8);
    // paws vs head exist in the AABB
    const ys = corners.map((c) => c.y);
    assert.ok(Math.min(...ys) <= cat.y + 0.02, 'AABB includes paws');
    assert.ok(Math.max(...ys) >= cat.y + CAT_FRAME.max.y - 0.01, 'AABB includes head');

    for (const aspect of [16 / 9, 9 / 16]) {
      const cam = makeOtsCamera(aspect);
      applyOtsPose(cam, cat, yaw, 0);
      const failed = corners
        .map((p, i) => ({ i, ...ndcOf(cam, p) }))
        .filter((n) => Math.abs(n.x) > 0.92 || Math.abs(n.y) > 0.92 || n.z < -1 || n.z > 1);
      assert.ok(
        pointsInView(cam, corners, 0.92),
        `cat AABB leaves the ${aspect > 1 ? 'desktop' : 'phone'} frame: ${JSON.stringify(failed)}`,
      );
    }
  });

  it('still frames the whole cat while she prowls', () => {
    const cat = new THREE.Vector3(0, 1.12, 0);
    const yaw = 0.4;
    const cam = makeOtsCamera(16 / 9);
    applyOtsPose(cam, cat, yaw, 1.35);
    assert.ok(pointsInView(cam, catFrameCorners(cat, yaw), 0.95));
  });

  it('OTS fov is a close third-person, not FP 62', () => {
    assert.ok(OTS.fov >= 46 && OTS.fov <= 54);
    assert.notEqual(OTS.fov, 62);
  });
});
