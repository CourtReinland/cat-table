import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import { BUILD_STAMP } from '../buildStamp.ts';
import { LEVELS } from '../data/content.ts';
import { applyOtsPose, makeOtsCamera, OTS, otsPose } from './CameraRig.ts';
import {
  BIND_POSE_MAX_S,
  BOY_CLIPS,
  boyGlbUrl,
  boyMarkerWorld,
  boyPlayPlacement,
  cineShouldSitThenStand,
  couchBoyPlacement,
  findHeadBone,
  idleStandIsBind,
  kitchenCatSpawn,
  kitchenIslandBoyPlacement,
  LEVEL_SURFACE_CZ,
  MIXAMO_STAND_CHEST_Y,
  MIXAMO_STAND_HEAD_Y,
  remapMixamoRig,
  remapMixamoTrackName,
  stripMixamoPrefix,
} from './boyfriendPlay.ts';

const here = dirname(fileURLToPath(import.meta.url));
const src = (name: string) => readFileSync(join(here, name), 'utf8');
const models = join(here, '../../public/assets/models');

function glbJson(path: string) {
  const buf = readFileSync(path);
  assert.equal(buf.subarray(0, 4).toString('ascii'), 'glTF');
  const chunkLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + chunkLen).toString('utf8')) as {
    animations?: { name?: string; samplers?: { input: number }[] }[];
    accessors?: { max?: number[] }[];
    nodes?: { name?: string }[];
    materials?: unknown[];
    textures?: unknown[];
    images?: unknown[];
  };
  return { buf, json };
}

function clipDuration(json: ReturnType<typeof glbJson>['json'], name: string) {
  const anim = (json.animations ?? []).find((a) => a.name === name);
  assert.ok(anim, `missing clip ${name}`);
  let dur = 0;
  for (const s of anim.samplers ?? []) {
    const mx = json.accessors?.[s.input]?.max?.[0];
    if (typeof mx === 'number') dur = Math.max(dur, mx);
  }
  return dur;
}

const COUCH = { x: -2.6, z: -2.0 };
const KITCHEN = LEVELS[0];

function ndcInView(
  camera: THREE.PerspectiveCamera,
  p: THREE.Vector3,
  margin = 0.92,
): boolean {
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const view = p.clone().applyMatrix4(camera.matrixWorldInverse);
  if (view.z >= 0) return false;
  const ndc = p.clone().project(camera);
  return Math.abs(ndc.x) <= margin && Math.abs(ndc.y) <= margin && ndc.z >= -1 && ndc.z <= 1;
}

describe('GS-HUMAN-SCOUT Eli GLB path is eli-only', () => {
  it('loads boy-eli.glb for Eli and leaves the other clay boys on their own files', () => {
    assert.equal(boyGlbUrl('eli'), 'assets/models/boy-eli.glb');
    assert.equal(boyGlbUrl('jasper'), 'assets/models/boy-jasper.glb');
    assert.equal(boyGlbUrl('kai'), 'assets/models/boy-kai.glb');
    assert.equal(boyGlbUrl('theo'), 'assets/models/boy-theo.glb');
    assert.equal(boyGlbUrl('ren'), 'assets/models/boy-ren.glb');
    for (const id of ['jasper', 'kai', 'theo', 'ren']) {
      assert.notEqual(boyGlbUrl(id), boyGlbUrl('eli'));
    }
  });

  it('BoyGlb preload uses boyGlbUrl — not a shared mesh, not suki.glb', () => {
    const boy = src('BoyGlb.ts');
    assert.match(boy, /boyGlbUrl\(id\)/);
    assert.doesNotMatch(boy, /suki\.glb/);
    assert.doesNotMatch(boy, /boy-eli\.glb`/);
  });

  it('clones skinned Eli with SkeletonUtils and does not mutate cached clips', () => {
    const boy = src('BoyGlb.ts');
    assert.match(boy, /SkeletonUtils\.clone\(src\.scene\)/);
    assert.doesNotMatch(boy, /src\.scene\.clone\(/);
    assert.doesNotMatch(boy, /remapMixamoRig/);
  });

  it('keeps the Mixamo clip contract without inventing Cuddle', () => {
    assert.deepEqual([...BOY_CLIPS], ['Idle_Sit', 'StandUp', 'Idle_Stand', 'Walk', 'Kneel']);
    const boy = src('BoyGlb.ts');
    for (const clip of BOY_CLIPS) {
      assert.match(boy, new RegExp(`'${clip}'`));
    }
    assert.match(boy, /case 'cuddle'/);
    assert.match(boy, /this\.play\('Cuddle'/);
  });

  it('visible stamp is BUILD 13', () => {
    assert.match(BUILD_STAMP, /^BUILD 13\b/);
  });

  it('boy-eli.glb is the textured Mixamo drop-in (glTF, clips, Head, no Cuddle)', () => {
    const path = join(models, 'boy-eli.glb');
    assert.equal(statSync(path).size, 32810800);
    const { buf, json } = glbJson(path);
    assert.equal(buf.length, 32810800);
    const names = (json.animations ?? []).map((a) => a.name);
    assert.deepEqual(names, ['Idle_Sit', 'Idle_Stand', 'StandUp', 'Walk', 'Kneel']);
    assert.equal(names.includes('Cuddle'), false);
    assert.equal(Math.round(clipDuration(json, 'Idle_Sit') * 10) / 10, 4.3);
    assert.ok(clipDuration(json, 'Idle_Stand') < 0.04, 'Idle_Stand must stay a 1-frame bind');
    assert.equal(Math.round(clipDuration(json, 'StandUp') * 1000) / 1000, 8.267);
    assert.equal(Math.round(clipDuration(json, 'Walk') * 1000) / 1000, 1.033);
    assert.equal(Math.round(clipDuration(json, 'Kneel') * 1000) / 1000, 4.667);
    const nodeNames = (json.nodes ?? []).map((n) => n.name);
    assert.ok(nodeNames.includes('Head'), 'Head bone missing');
    assert.ok((json.images?.length ?? 0) >= 1, 'PBR textures missing');
    const boy = src('BoyGlb.ts');
    assert.doesNotMatch(boy, /SUKI_FACE/);
    assert.doesNotMatch(boy, /faceFurniture/);
  });

  it('does not overwrite the other clay boy GLBs', () => {
    assert.equal(statSync(join(models, 'boy-jasper.glb')).size, 399688);
    assert.equal(statSync(join(models, 'boy-kai.glb')).size, 424264);
    assert.equal(statSync(join(models, 'boy-theo.glb')).size, 420648);
    assert.equal(statSync(join(models, 'boy-ren.glb')).size, 398700);
  });
});

describe('GS-HUMAN-SCOUT Heather stays a hazard hand', () => {
  it('does not Mixamo a Heather body — Hazards.ts is still a procedural hand', () => {
    const hazards = src('Hazards.ts');
    assert.match(hazards, /private buildHand\(/);
    assert.match(hazards, /forearm \+ palm \+ fingers/);
    assert.doesNotMatch(hazards, /GLTFLoader/);
    assert.doesNotMatch(hazards, /heather\.glb/);
    assert.doesNotMatch(hazards, /boy-heather/);
    assert.doesNotMatch(hazards, /Mixamo|AccuRIG|Ready Player Me/);
  });
});

describe('GS-HUMAN-SCOUT Mixamo Head remap', () => {
  it('strips mixamorig prefixes without touching clay Head', () => {
    assert.equal(stripMixamoPrefix('Head'), 'Head');
    assert.equal(stripMixamoPrefix('mixamorig:Head'), 'Head');
    assert.equal(stripMixamoPrefix('mixamorigHead'), 'Head');
    assert.equal(stripMixamoPrefix('mixamorig_Head'), 'Head');
    assert.equal(remapMixamoTrackName('mixamorig:Head.quaternion'), 'Head.quaternion');
  });

  it('finds mixamorig:Head after remap so look-at does not die', () => {
    const root = new THREE.Group();
    const bone = new THREE.Bone();
    bone.name = 'mixamorig:Head';
    root.add(bone);
    assert.equal(findHeadBone(root)?.name, 'mixamorig:Head');
    remapMixamoRig(root, [{ tracks: [{ name: 'mixamorig:Head.quaternion' }] }]);
    assert.equal(bone.name, 'Head');
    assert.equal(findHeadBone(root)?.name, 'Head');
  });
});

describe('GS-HUMAN-SCOUT labeled spawn/OTS hypothesis (main ee1ee0c)', () => {
  const cat = kitchenCatSpawn(KITCHEN.counterSize, KITCHEN.counterHeight);
  const yaw = Math.PI * 0.5;
  const [w, d] = KITCHEN.counterSize;
  const pose = otsPose(cat, yaw, 0);

  it('confirms kitchen AABB, Suki spawn, boot OTS, and couch sit coords', () => {
    assert.equal(LEVEL_SURFACE_CZ, 0.3);
    assert.deepEqual(KITCHEN.counterSize, [4.2, 1.9]);
    assert.equal(KITCHEN.counterHeight, 1);
    assert.equal(-w / 2, -2.1);
    assert.equal(w / 2, 2.1);
    assert.equal(+(LEVEL_SURFACE_CZ - d / 2).toFixed(2), -0.65);
    assert.equal(LEVEL_SURFACE_CZ + d / 2, 1.25);
    assert.deepEqual(
      { x: +cat.x.toFixed(2), y: +cat.y.toFixed(2), z: +cat.z.toFixed(2) },
      { x: -1.75, y: 1, z: 0.97 },
    );
    assert.equal(yaw, Math.PI / 2);
    assert.deepEqual(pose.pos.toArray().map((n) => +n.toFixed(2)), [-3.07, 1.5, 0.79]);
    assert.deepEqual(pose.look.toArray().map((n) => +n.toFixed(2)), [-1.67, 1.15, 0.97]);
    const couch = couchBoyPlacement(COUCH);
    assert.deepEqual(couch.pos, { x: -2.25, y: 0, z: -1.7 });
    assert.equal(couch.rotY, 0.35);
    assert.equal(couch.pose, 'sit');
  });

  it('does not retarget OTS at the couch — close cat framing stays', () => {
    assert.equal(OTS.side, 0.18);
    assert.equal(OTS.height, 0.5);
    assert.equal(OTS.back, 1.32);
    assert.equal(OTS.lookAhead, 0.08);
    assert.equal(OTS.fov, 52);
    const rig = src('CameraRig.ts');
    assert.doesNotMatch(rig, /couchPos|boyfriend|eli/i);
  });
});

describe('GS-HUMAN-SCOUT kitchen island stand, not couch sit', () => {
  const cat = kitchenCatSpawn(KITCHEN.counterSize, KITCHEN.counterHeight);
  const yaw = Math.PI * 0.5;
  const width = KITCHEN.counterSize[0];

  it('Kitchen Island is Eli standing at the far +X lip; other rooms keep the couch', () => {
    assert.equal(KITCHEN.id, 'kitchen');
    assert.equal(KITCHEN.boyfriendId, 'eli');
    assert.equal(KITCHEN.surface, 'kitchen');
    const kitchen = boyPlayPlacement('kitchen', COUCH, cat, width);
    const island = kitchenIslandBoyPlacement(cat, width);
    assert.deepEqual(kitchen.pos, { x: 2.25, y: 0, z: 0.97 });
    assert.deepEqual(kitchen.pos, island.pos);
    assert.equal(kitchen.rotY, -Math.PI / 2);
    assert.equal(kitchen.pose, 'stand');
    assert.notEqual(kitchen.pose, 'sit');
    const couch = couchBoyPlacement(COUCH);
    assert.notDeepEqual(kitchen.pos, couch.pos);
    assert.notEqual(kitchen.pose, couch.pose);
    for (const surface of ['coffee', 'desk', 'dresser', 'dining']) {
      assert.deepEqual(boyPlayPlacement(surface, COUCH, cat, width), couchBoyPlacement(COUCH));
    }
  });

  it('does not boot BoyGlb into Idle_Sit (floating sit at y=0)', () => {
    const boy = src('BoyGlb.ts');
    assert.doesNotMatch(boy, /this\.setPose\('sit', 0\.01\)/);
    assert.match(boy, /this\.setPose\('stand', 0\.01\)/);
    assert.match(boy, /Idle_Stand/);
    const apt = src('Apartment.ts');
    assert.match(apt, /boyfriend\.setPose\(place\.pose/);
  });

  it('LoopOnce Idle_Stand only for sub-frame bind clips, not clay loops', () => {
    const eli = clipDuration(glbJson(join(models, 'boy-eli.glb')).json, 'Idle_Stand');
    const jasper = clipDuration(glbJson(join(models, 'boy-jasper.glb')).json, 'Idle_Stand');
    assert.equal(idleStandIsBind(eli), true);
    assert.equal(idleStandIsBind(jasper), false);
    assert.ok(jasper > BIND_POSE_MAX_S);
    const boy = src('BoyGlb.ts');
    assert.match(boy, /idleStandIsBind\(next\.getClip\(\)\.duration\)/);
    assert.doesNotMatch(boy, /if \(name === 'Idle_Stand'\) once = true/);
  });

  it('win cinematic does not sit a standing kitchen date, but still rises from a couch sit', () => {
    assert.equal(cineShouldSitThenStand('stand'), false);
    assert.equal(cineShouldSitThenStand('sit'), true);
    const game = src('Game.ts');
    assert.match(game, /cineShouldSitThenStand\(bf\.pose\)/);
    assert.match(game, /setPose\('sit'/);
    assert.match(game, /setPose\('stand'/);
  });

  it('couch spawn is outside Kitchen Island OTS (the old off-camera sit)', () => {
    const couch = couchBoyPlacement(COUCH);
    const head = boyMarkerWorld(couch, 'head');
    for (const aspect of [16 / 9, 9 / 16]) {
      const cam = makeOtsCamera(aspect);
      applyOtsPose(cam, cat, yaw, 0);
      assert.equal(
        ndcInView(cam, new THREE.Vector3(head.x, head.y, head.z), 1),
        false,
        `couch head should miss the ${aspect > 1 ? 'desktop' : 'phone'} play camera`,
      );
    }
  });

  it('far-end island stand puts Eli head + chest in the play camera', () => {
    const place = boyPlayPlacement('kitchen', COUCH, cat, width);
    assert.equal(place.pose, 'stand');
    const markers = [
      boyMarkerWorld(place, 'head'),
      boyMarkerWorld(place, 'chest'),
      boyMarkerWorld(place, 'head', MIXAMO_STAND_HEAD_Y, MIXAMO_STAND_CHEST_Y),
      boyMarkerWorld(place, 'chest', MIXAMO_STAND_HEAD_Y, MIXAMO_STAND_CHEST_Y),
    ];
    for (const aspect of [16 / 9, 9 / 16]) {
      const cam = makeOtsCamera(aspect);
      applyOtsPose(cam, cat, yaw, 0);
      const label = aspect > 1 ? 'desktop' : 'phone';
      for (const m of markers) {
        assert.ok(
          ndcInView(cam, new THREE.Vector3(m.x, m.y, m.z)),
          `Eli marker ${m.y.toFixed(2)} leaves ${label} OTS`,
        );
      }
    }
  });

  it('Apartment wires boyPlayPlacement and does not force the couch for kitchen', () => {
    const apt = src('Apartment.ts');
    assert.match(apt, /boyPlayPlacement\(level\.surface, this\.couchPos, this\.catSpawn, w\)/);
    assert.doesNotMatch(
      apt.slice(apt.indexOf('// boyfriend')),
      /boyfriend\.group\.position\.set\(this\.couchPos/,
    );
  });
});
