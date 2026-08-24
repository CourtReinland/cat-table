import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CLIP,
  GLB_SCALE,
  GLB_YAW_OFFSET,
  USE_SIT_FOR_LONG_IDLE,
} from './sukiGlb.ts';

describe('GS-SUKI-IN Hunyuan play mesh', () => {
  it('does not re-shrink the 0.40 m bind with the old cream-sculpt 0.85', () => {
    assert.equal(GLB_SCALE, 1);
    assert.notEqual(GLB_SCALE, 0.85);
  });

  it('yaws the mesh 180° so −Z rest faces game +Z', () => {
    assert.equal(GLB_YAW_OFFSET, Math.PI);
  });

  it('does not rest into the shredded Sit clip', () => {
    assert.equal(USE_SIT_FOR_LONG_IDLE, false);
    assert.equal(CLIP.sit, 'Sit');
    assert.equal(CLIP.idle, 'Idle');
    assert.equal(CLIP.walk, 'Walk');
    assert.equal(CLIP.run, 'Run');
  });
});
