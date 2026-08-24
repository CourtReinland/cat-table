import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { counterRestY, hitCounter } from './ground.ts';

describe('GS-SUKI-POLISH counter rest (bottom-origin props)', () => {
  it('rests on the table plane, not topY + halfHeight', () => {
    const topY = 1.02;
    const halfH = 0.18;
    assert.equal(counterRestY(topY), topY);
    assert.notEqual(counterRestY(topY), topY + halfH);
  });

  it('lands when a bottom-origin body reaches the slab from above', () => {
    assert.equal(hitCounter(1.0, 1.02, -0.4), true);
    assert.equal(hitCounter(1.1, 1.02, -0.4), false);
    assert.equal(hitCounter(1.0, 1.02, 0.2), false);
  });
});
