import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pawHitsProp, swipeHitsProp } from './pawHit.ts';
import { PAW_HIT_RADIUS, PAW_PLAY_REACH } from './sukiGlb.ts';

const PLANT_R = Math.max(0.22, 0.22) * 0.6;
const LAPTOP_R = Math.max(0.34, 0.24) * 0.6;
const FACING = { x: 0, z: 1 };
const ORIGIN = { x: 0, z: 0 };

describe('GS-SUKI-POLISH paw hit volumes', () => {
  it('overlaps a prop disc at the visible paw, not a long body-forward cone', () => {
    assert.equal(pawHitsProp({ x: 0.2, z: 0.2 }, { x: 0.28, z: 0.22 }, 0.08, PAW_HIT_RADIUS), true);
    assert.equal(pawHitsProp({ x: 0, z: 0 }, { x: 0.42, z: 0 }, 0.08, PAW_HIT_RADIUS), false);
  });
});

describe('GS-PROP-HIT play-reach swipe', () => {
  it('keeps play reach at the committed swipe tip (0.28), not a table-wide cone', () => {
    assert.equal(PAW_PLAY_REACH, 0.28);
    assert.ok(PAW_HIT_RADIUS > 0.05 && PAW_HIT_RADIUS < 0.2);
  });

  it('paw-near-prop still hits', () => {
    assert.equal(
      swipeHitsProp({ x: 0.2, z: 0.2 }, { x: 0.28, z: 0.22 }, 0.08, FACING, ORIGIN),
      true,
    );
  });

  it('a too-short/too-close paw that currently misses now hits at play reach', () => {
    // GLB bone origin in the chest (rest paw_FL z≈0.10, paw_FR z≈0.06).
    // Plant disc at 0.28 is past the 0.11 sphere; laptop at 0.28 already
    // overlaps (r=0.204) — the BUILD 8 miss for both is autoplay 0.42.
    const shortPaw = { x: 0, z: 0 };
    const plantAtReach = { x: 0, z: PAW_PLAY_REACH };
    assert.equal(pawHitsProp(shortPaw, plantAtReach, PLANT_R, PAW_HIT_RADIUS), false);
    assert.equal(swipeHitsProp(shortPaw, plantAtReach, PLANT_R, FACING, ORIGIN), true);
    assert.equal(swipeHitsProp(shortPaw, plantAtReach, LAPTOP_R, FACING, ORIGIN), true);
  });

  it('covers autoplay commit (0.42) for plant + laptop from a chest-pocket paw', () => {
    const glbPaw = { x: 0, z: 0.06 };
    const plant = { x: 0, z: 0.42 };
    const laptop = { x: 0, z: 0.42 };
    assert.equal(pawHitsProp(glbPaw, plant, PLANT_R, PAW_HIT_RADIUS), false);
    assert.equal(pawHitsProp(glbPaw, laptop, LAPTOP_R, PAW_HIT_RADIUS), false);
    assert.equal(swipeHitsProp(glbPaw, plant, PLANT_R, FACING, ORIGIN), true);
    assert.equal(swipeHitsProp(glbPaw, laptop, LAPTOP_R, FACING, ORIGIN), true);
  });

  it('does not grow a long body-forward cone across the table', () => {
    assert.equal(pawHitsProp({ x: 0, z: 0 }, { x: 0.6, z: 0 }, PLANT_R, PAW_HIT_RADIUS), false);
    assert.equal(swipeHitsProp({ x: 0, z: 0 }, { x: 0, z: 0.6 }, PLANT_R, FACING, ORIGIN), false);
  });

  it('a paw already at play reach stays a sphere — no extra cone', () => {
    const reached = { x: 0, z: PAW_PLAY_REACH };
    // Same far miss as the raw sphere: 0.42 from a reached paw with a tiny disc.
    assert.equal(pawHitsProp(reached, { x: 0, z: 0.56 }, 0.08, PAW_HIT_RADIUS), false);
    assert.equal(swipeHitsProp(reached, { x: 0, z: 0.56 }, 0.08, FACING, ORIGIN), false);
  });
});
