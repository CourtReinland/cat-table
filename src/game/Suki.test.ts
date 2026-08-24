import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CLIP,
  GLB_SCALE,
  GLB_YAW_OFFSET,
  USE_SIT_FOR_LONG_IDLE,
  SUKI_COAT,
  SUKI_PAW_BONES,
  PAW_HIT_RADIUS,
  PAW_MESH,
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
});
