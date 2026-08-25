import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import { BUILD_STAMP } from '../buildStamp.ts';
import {
  CAT_FRAME,
  CameraRig,
  DEFAULT_FP_CAM,
  OTS,
  PORTRAIT,
  applyOtsPose,
  applyPortraitPose,
  catForward,
  catFrameCorners,
  makeOtsCamera,
  otsPose,
  pointsInView,
  portraitPose,
  stillsPortraitRequested,
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

  it('keeps default play OTS numbers', () => {
    assert.equal(OTS.back, 1.32);
    assert.equal(OTS.side, 0.18);
    assert.equal(OTS.height, 0.5);
    assert.equal(OTS.lookHeight, 0.15);
    assert.equal(OTS.fov, 52);
    assert.equal(OTS.near, 0.08);
  });

  it('visible stamp is BUILD 13', () => {
    assert.match(BUILD_STAMP, /^BUILD 13\b/);
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

describe('GS-SUKI-POLISH leftover: OTS follow lag after W release', () => {
  const DT = 1 / 60;
  const WALK = { x: 0, y: 0, z: 1.35 };

  it('pose-locks — after input-up the camera does not keep travelling', () => {
    const rig = new CameraRig();
    const cat = new THREE.Vector3(0, 1.12, 0);
    const yaw = 0;
    rig.snap(cat, yaw, 1.35);
    for (let i = 0; i < 60; i++) {
      cat.z += WALK.z * DT;
      rig.follow(DT, cat, yaw, WALK);
    }
    const halted = { x: 0, y: 0, z: 0 };
    rig.follow(DT, cat, yaw, halted);
    const pose = otsPose(cat, yaw, 0);
    assert.ok(rig.pos.distanceTo(pose.pos) < 1e-9, 'first halt frame must sit on the pose');
    assert.ok(rig.look.distanceTo(pose.look) < 1e-9);

    const cam0 = rig.pos.clone();
    const look0 = rig.look.clone();
    for (let i = 0; i < 90; i++) {
      rig.follow(DT, cat, yaw, halted);
    }
    const travel = rig.pos.distanceTo(cam0);
    const lookTravel = rig.look.distanceTo(look0);
    assert.ok(travel < 1e-9, `1.5s after keyup camera still travelled ${travel}`);
    assert.ok(lookTravel < 1e-9, `1.5s after keyup look still travelled ${lookTravel}`);
  });

  it('world-fixed props stay put in the OTS frame after keyup', () => {
    const rig = new CameraRig();
    const cat = new THREE.Vector3(0, 1.12, 0);
    const yaw = 0;
    rig.snap(cat, yaw, 1.35);
    for (let i = 0; i < 60; i++) {
      cat.z += WALK.z * DT;
      rig.follow(DT, cat, yaw, WALK);
    }
    const mug = new THREE.Vector3(0.35, 1.12, cat.z + 0.7);
    const cam = makeOtsCamera(16 / 9);
    const halted = { x: 0, y: 0, z: 0 };
    rig.follow(DT, cat, yaw, halted);
    rig.applyTo(cam);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    const ndc0 = mug.clone().project(cam);

    for (let i = 0; i < 90; i++) rig.follow(DT, cat, yaw, halted);
    rig.applyTo(cam);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    const ndc = mug.clone().project(cam);
    assert.ok(Math.abs(ndc.x - ndc0.x) < 1e-6, `prop NDC x drifted ${ndc.x - ndc0.x}`);
    assert.ok(Math.abs(ndc.y - ndc0.y) < 1e-6, `prop NDC y drifted ${ndc.y - ndc0.y}`);
  });
});

describe('GS-PLAY-ART stills portrait camera', () => {
  it('stands in front of the cat, 3/4, looking at the face not the OTS chest', () => {
    const cat = new THREE.Vector3(0, 1.0, 0);
    const yaw = 0;
    const pose = portraitPose(cat, yaw);
    const fwd = catForward(yaw);
    const toCam = {
      x: pose.pos.x - cat.x,
      y: pose.pos.y - cat.y,
      z: pose.pos.z - cat.z,
    };
    const ahead = toCam.x * fwd.x + toCam.z * fwd.z;
    assert.ok(ahead > 0.2, `portrait must be in FRONT of the cat, ahead=${ahead}`);
    assert.ok(toCam.x < -0.05, `3/4 from cat's left, side=${toCam.x}`);
    assert.ok(PORTRAIT.lookHeight > OTS.lookHeight, 'portrait looks at the face, OTS at the chest');
    assert.ok(pose.look.y > cat.y + 0.2, 'look sits on the muzzle / eyes');
    assert.ok(PORTRAIT.fov < OTS.fov, 'tighter fov so eyes fill the frame');
    assert.ok(PORTRAIT.front >= 0.46 && PORTRAIT.front <= 0.56, `front ${PORTRAIT.front} is the tight crop or a full-body bust`);
    assert.ok(PORTRAIT.fov >= 36 && PORTRAIT.fov <= 42, `fov ${PORTRAIT.fov} not a face 3/4`);
    assert.ok(PORTRAIT.height <= 0.24 && PORTRAIT.height >= 0.18, `height ${PORTRAIT.height} still the high/tight crop`);
    assert.notEqual(PORTRAIT.front, OTS.back);
  });

  it('puts Hunyuan eye-line points in a close portrait frame', () => {
    const cat = new THREE.Vector3(0.4, 1.12, 0.2);
    const yaw = Math.PI * 0.5;
    const fwd = catForward(yaw);
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    const eyes = [
      new THREE.Vector3(
        cat.x + right.x * -0.02 + fwd.x * 0.13,
        cat.y + 0.25,
        cat.z + right.z * -0.02 + fwd.z * 0.13,
      ),
      new THREE.Vector3(
        cat.x + right.x * 0.018 + fwd.x * 0.13,
        cat.y + 0.25,
        cat.z + right.z * 0.018 + fwd.z * 0.13,
      ),
    ];
    const cam = new THREE.PerspectiveCamera(PORTRAIT.fov, 16 / 9, PORTRAIT.near, PORTRAIT.far);
    applyPortraitPose(cam, cat, yaw);
    assert.ok(pointsInView(cam, eyes, 0.75), 'eyes leave the wider 3/4 portrait');
    const n0 = ndcOf(cam, eyes[0]);
    const n1 = ndcOf(cam, eyes[1]);
    const span = Math.hypot(n0.x - n1.x, n0.y - n1.y);
    assert.ok(span > 0.08, `eyes too small in portrait NDC span=${span}`);
    assert.ok(span < 0.55, `eyes still a one-eye crop, NDC span=${span}`);
    assert.ok(Math.abs(n0.y) < 0.55 && Math.abs(n1.y) < 0.55, 'eyes not vertically in the portrait');
    const muzzle = new THREE.Vector3(
      cat.x + fwd.x * 0.14,
      cat.y + 0.18,
      cat.z + fwd.z * 0.14,
    );
    const bowHint = new THREE.Vector3(
      cat.x + fwd.x * 0.02,
      cat.y + 0.11,
      cat.z + fwd.z * 0.02,
    );
    const earTips = [
      new THREE.Vector3(
        cat.x + right.x * -0.03 + fwd.x * 0.08,
        cat.y + 0.36,
        cat.z + right.z * -0.03 + fwd.z * 0.08,
      ),
      new THREE.Vector3(
        cat.x + right.x * 0.03 + fwd.x * 0.08,
        cat.y + 0.36,
        cat.z + right.z * 0.03 + fwd.z * 0.08,
      ),
    ];
    assert.ok(pointsInView(cam, [muzzle, bowHint], 0.95), 'muzzle / neck-bow hint cropped out');
    assert.ok(pointsInView(cam, earTips, 0.92), 'ear tips clipped by the portrait top');
  });

  it('does not change default OTS when computing a portrait pose', () => {
    const cat = new THREE.Vector3(0, 1.12, 0);
    const ots = otsPose(cat, 0, 0);
    portraitPose(cat, 0);
    const ots2 = otsPose(cat, 0, 0);
    assert.ok(ots.pos.distanceTo(ots2.pos) < 1e-12);
    assert.equal(OTS.back, 1.32);
    assert.equal(DEFAULT_FP_CAM, false);
    assert.equal(stillsPortraitRequested(), false);
  });

  it('Game wires ?portrait=1 and V without hiding the cat or touching OTS', () => {
    const src = readFileSync(new URL('./Game.ts', import.meta.url), 'utf8');
    assert.match(src, /KeyV/);
    assert.match(src, /portrait=1/);
    assert.match(src, /setPortraitCam/);
    assert.match(src, /portraitPose/);
    assert.match(src, /setVisible\(true\)/);
    assert.doesNotMatch(src, /OTS\.(back|side|height)\s*=/);
    assert.doesNotMatch(src, /portraitCam.*fpCam\s*=\s*true/);
  });
});
