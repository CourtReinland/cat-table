import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pawHitsProp } from './pawHit.ts';
import { PAW_HIT_RADIUS } from './sukiGlb.ts';

describe('GS-SUKI-POLISH paw hit volumes', () => {
  it('overlaps a prop disc at the visible paw, not a long body-forward cone', () => {
    assert.equal(pawHitsProp({ x: 0.2, z: 0.2 }, { x: 0.28, z: 0.22 }, 0.08, PAW_HIT_RADIUS), true);
    assert.equal(pawHitsProp({ x: 0, z: 0 }, { x: 0.42, z: 0 }, 0.08, PAW_HIT_RADIUS), false);
  });
});
