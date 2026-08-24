import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LEVELS, PROP_LIBRARY, shatterableCount, type PropKind } from '../data/content.ts';
import { counterRestY } from './ground.ts';
import { pawHitsProp } from './pawHit.ts';
import { PAW_HIT_RADIUS } from './sukiGlb.ts';
import { contactAccel, isSmashable, kickScale } from './mass.ts';
import { BUILD_STAMP } from '../buildStamp.ts';
import { DEFAULT_FP_CAM } from './CameraRig.ts';
import { STEER } from './Steer.ts';

/** Locked mass table — heavier is slower, none are frozen. */
const MASS: Record<PropKind, number> = {
  mug: 0.55,
  glass: 0.35,
  wineglass: 0.28,
  plate: 0.7,
  plant: 2.4,
  book: 0.65,
  phone: 0.28,
  candle: 0.4,
  bottle: 0.55,
  remote: 0.3,
  frame: 0.55,
  bowl: 0.55,
  jar: 0.7,
  vase: 0.75,
  perfume: 0.22,
  jewelrybox: 1.1,
  candelabra: 1.4,
  teapot: 0.9,
  laptop: 3.2,
};

describe('GS-PROP-PHYS smashables stay dynamic', () => {
  it('no table smashable is flagged immovable (plant + laptop used to be)', () => {
    const staticKinds = (Object.keys(PROP_LIBRARY) as PropKind[]).filter((k) => PROP_LIBRARY[k].immovable);
    assert.deepEqual(staticKinds, []);
    assert.equal(isSmashable(PROP_LIBRARY.plant.immovable), true);
    assert.equal(isSmashable(PROP_LIBRARY.laptop.immovable), true);
  });

  it('keeps the mass table (heavier / harder to shove is fine)', () => {
    for (const k of Object.keys(MASS) as PropKind[]) {
      assert.equal(PROP_LIBRARY[k].mass, MASS[k], k);
    }
    assert.ok(PROP_LIBRARY.plant.mass > PROP_LIBRARY.mug.mass);
    assert.ok(PROP_LIBRARY.laptop.mass > PROP_LIBRARY.plant.mass);
  });

  it('every level prop counts as shatterable — no frozen scenery on the win table', () => {
    for (const level of LEVELS) {
      assert.equal(shatterableCount(level), level.props.length, level.id);
    }
  });

  it('committed contact still accelerates former statics, slower than glass', () => {
    const glass = contactAccel(1, PROP_LIBRARY.glass.mass);
    const plant = contactAccel(1, PROP_LIBRARY.plant.mass);
    const laptop = contactAccel(1, PROP_LIBRARY.laptop.mass);
    assert.ok(plant > 0 && laptop > 0);
    assert.ok(plant < glass);
    assert.ok(laptop < plant);
    assert.ok(kickScale(1, PROP_LIBRARY.laptop.mass) > 0);
  });

  it('sits ON the counter plane — grounding did not hover or freeze', () => {
    const topY = 1.02;
    assert.equal(counterRestY(topY), topY);
    assert.notEqual(counterRestY(topY), topY + PROP_LIBRARY.mug.size[1] / 2);
  });

  it('paw spheres are an XZ disc — table rest Y is not a miss layer', () => {
    // plant disc at the same XZ as a front paw; Y is unused
    assert.equal(
      pawHitsProp({ x: 0.2, z: 0.2 }, { x: 0.28, z: 0.22 }, Math.max(0.22, 0.22) * 0.6, PAW_HIT_RADIUS),
      true,
    );
    assert.equal(pawHitsProp({ x: 0, z: 0 }, { x: 0.6, z: 0 }, 0.132, PAW_HIT_RADIUS), false);
  });

  it('keeps OTS + rest default and BUILD 9 (sibling polish-stop took 7)', () => {
    assert.equal(DEFAULT_FP_CAM, false);
    assert.equal(STEER.yawRatePlanted, 1.4);
    assert.equal(STEER.yawRateMoving, 2.2);
    assert.match(BUILD_STAMP, /^BUILD 9\b/);
  });
});
