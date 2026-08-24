import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CLIP,
  GLB_SCALE,
  GLB_YAW_OFFSET,
  USE_SIT_FOR_LONG_IDLE,
  SUKI_COAT,
  SUKI_PAW_BONES,
  PAW_HIT_RADIUS,
  PAW_MESH,
  SUKI_BOW,
} from './sukiGlb.ts';

describe('GS-SUKI-IN Hunyuan play mesh', () => {
  it('does not re-shrink the 0.40 m bind with the old cream-sculpt 0.85', () => {
    assert.equal(GLB_SCALE, 1);
    assert.notEqual(GLB_SCALE, 0.85);
  });

  it('does not yaw the mesh — bind already faces game +Z', () => {
    assert.equal(GLB_YAW_OFFSET, 0);
  });

  it('does not rest into the shredded Sit clip', () => {
    assert.equal(USE_SIT_FOR_LONG_IDLE, false);
    assert.equal(CLIP.sit, 'Sit');
    assert.equal(CLIP.idle, 'Idle');
    assert.equal(CLIP.walk, 'Walk');
    assert.equal(CLIP.run, 'Run');
  });

  it('uses a fluff shader path — does not keep Hunyuan hatch albedo as coat map', () => {
    assert.equal(SUKI_COAT.keepAlbedo, false);
    assert.equal(SUKI_COAT.useFluffShader, true);
    assert.equal(SUKI_COAT.identityFromAlbedo, true);
    assert.equal(SUKI_COAT.skipOutline, true);
  });

  it('samples front paw bones for swipe contact', () => {
    assert.deepEqual([...SUKI_PAW_BONES], ['paw_FL', 'paw_FR']);
    assert.ok(PAW_HIT_RADIUS > 0.05 && PAW_HIT_RADIUS < 0.2);
  });

  it('caps Swipe/Hit bone travel so paw shells cannot tube', () => {
    assert.deepEqual([...PAW_MESH.exclusiveBones], ['paw_FL', 'paw_FR', 'paw_HL', 'paw_HR']);
    assert.ok(PAW_MESH.swipeMaxDeltaDeg <= 28);
    assert.ok(PAW_MESH.hitMaxDeltaDeg <= 14);
  });

  it('parents a nape hero bow mesh so OTS can read loops and tails', () => {
    assert.equal(SUKI_BOW.napeMesh, true);
    assert.equal(SUKI_BOW.parentBone, 'bow');
    assert.equal(SUKI_BOW.meshName, 'node_0');
    assert.ok(SUKI_BOW.loopRadius >= 0.035, `loopRadius ${SUKI_BOW.loopRadius} still a thread at 1.32 m`);
    assert.ok(SUKI_BOW.tailLength >= 0.05, `tailLength ${SUKI_BOW.tailLength}`);
    assert.ok(SUKI_BOW.napeLocal.z < -0.02, 'nape mesh must sit toward the tail / OTS');
    assert.ok(SUKI_BOW.napeLocal.y > 0.015, 'nape mesh must sit up the ruff');
    const { r, g, b } = {
      r: (SUKI_BOW.pink >> 16) & 255,
      g: (SUKI_BOW.pink >> 8) & 255,
      b: SUKI_BOW.pink & 255,
    };
    assert.ok(r >= 200 && r > b, `hero pink ${SUKI_BOW.pink.toString(16)} is not saturated`);
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Suki.ts'), 'utf8');
    assert.match(src, /buildHeroBowMesh/);
    assert.match(src, /BowLoopL/);
    assert.match(src, /BowLoopR/);
    assert.match(src, /BowTailL/);
    assert.match(src, /BowTailR/);
    assert.match(src, /MeshBasicNodeMaterial/);
    assert.match(src, /SUKI_BOW\.parentBone/);
    assert.doesNotMatch(src, /OTS\.(back|side|height)\s*=/);
  });
});
