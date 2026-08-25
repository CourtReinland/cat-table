import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pawHitsProp, swipeHitsProp } from './pawHit.ts';
import { PAW_HIT_RADIUS, PAW_PLAY_REACH } from './sukiGlb.ts';

const PLANT_R = Math.max(0.22, 0.22) * 0.6;
const LAPTOP_R = Math.max(0.34, 0.24) * 0.6;
const CAT = { x: 0, z: 0 };

describe('GS-SUKI-POLISH paw hit volumes', () => {
  it('overlaps a prop disc at the visible paw, not a long body-forward cone', () => {
    assert.equal(pawHitsProp({ x: 0.2, z: 0.2 }, { x: 0.28, z: 0.22 }, 0.08, PAW_HIT_RADIUS), true);
    assert.equal(pawHitsProp({ x: 0, z: 0 }, { x: 0.42, z: 0 }, 0.08, PAW_HIT_RADIUS), false);
  });
});

describe('GS-PROP-HIT play-reach swipe', () => {
  it('covers the 0.42 m commit, not the old 0.28 facing capsule', () => {
    assert.equal(PAW_PLAY_REACH, 0.42);
    assert.ok(PAW_HIT_RADIUS > 0.05 && PAW_HIT_RADIUS < 0.2);
  });

  it('hits an adjacent off-axis plant (beside the cat, not on yaw)', () => {
    // After WASD the plant can sit at the shoulder. A +Z capsule of 0.28
    // misses this; the cat disc must not.
    const beside = { x: 0.32, z: 0.10 };
    assert.ok(Math.hypot(beside.x, beside.z) < PAW_PLAY_REACH + PLANT_R);
    assert.equal(swipeHitsProp(CAT, beside, PLANT_R), true);
  });

  it('hits plant and laptop at the 0.42 m commit distance', () => {
    const atCommit = { x: 0, z: 0.42 };
    assert.equal(swipeHitsProp(CAT, atCommit, PLANT_R), true);
    assert.equal(swipeHitsProp(CAT, atCommit, LAPTOP_R), true);
  });

  it('far props still miss', () => {
    assert.equal(swipeHitsProp(CAT, { x: 0, z: 0.80 }, PLANT_R), false);
    assert.equal(swipeHitsProp(CAT, { x: 0, z: 0.80 }, LAPTOP_R), false);
  });
});
