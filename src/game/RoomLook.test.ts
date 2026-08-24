import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { BUILD_STAMP } from '../buildStamp.ts';
import { LEVELS } from '../data/content.ts';
import {
  BLOOM,
  EMISSIVE,
  MATTE,
  NIGHT_KEY_POS,
  NIGHT_RIG,
  TOON_HOT_STOP,
  capEmissive,
  luminance,
  matteMetal,
  roomMatOpts,
} from './roomLook.ts';

const here = dirname(fileURLToPath(import.meta.url));
const src = (name: string) => readFileSync(join(here, name), 'utf8');

describe('GS-ROOM-LIGHT bloom contract', () => {
  it('keeps bloom below soup and above the toon hot stop', () => {
    assert.ok(BLOOM.strength <= 0.16, `bloom strength ${BLOOM.strength} still washes lit props`);
    assert.ok(BLOOM.radius <= 0.45, `bloom radius ${BLOOM.radius} spills off lamps`);
    assert.ok(
      BLOOM.threshold > TOON_HOT_STOP,
      `threshold ${BLOOM.threshold} must sit above toon white ${TOON_HOT_STOP} or mugs bloom`,
    );
    assert.ok(BLOOM.threshold >= 0.96, `threshold ${BLOOM.threshold} is too eager`);
  });
});

describe('GS-ROOM-LIGHT night rig', () => {
  it('dims the shared apartment rig so silhouettes hold', () => {
    assert.ok(NIGHT_RIG.hemi <= 0.35, `hemi ${NIGHT_RIG.hemi} fills shadows`);
    assert.ok(NIGHT_RIG.moon <= 0.55, `moon ${NIGHT_RIG.moon} is a second sun`);
    assert.ok(NIGHT_RIG.key <= 22, `key ${NIGHT_RIG.key} floods the counter`);
    assert.ok(NIGHT_RIG.lamp <= 10, `lamp ${NIGHT_RIG.lamp} is a room wash`);
    assert.ok(NIGHT_RIG.fill <= 5, `fill ${NIGHT_RIG.fill} kills contrast`);
    assert.ok(NIGHT_RIG.pendant <= 8, `pendant ${NIGHT_RIG.pendant} glows the island`);
    assert.ok(NIGHT_RIG.fogDensity <= 0.04, `fog ${NIGHT_RIG.fogDensity} eats the window`);
  });

  it('puts warm key on the left, not a ceiling flood', () => {
    assert.ok(NIGHT_KEY_POS.x < -1.5, `key x=${NIGHT_KEY_POS.x} is not left-side warmth`);
    assert.ok(NIGHT_KEY_POS.y >= 2.8 && NIGHT_KEY_POS.y <= 3.8, `key height ${NIGHT_KEY_POS.y}`);
  });
});

describe('GS-ROOM-LIGHT emissive caps', () => {
  it('keeps practicals as lamps, not toy glow', () => {
    assert.ok(EMISSIVE.bulb <= 1.4 && EMISSIVE.bulb > 0.4, `bulb ${EMISSIVE.bulb}`);
    assert.ok(EMISSIVE.shade < 0.4, `shade ${EMISSIVE.shade} must toonify (cloth/paper)`);
    assert.ok(EMISSIVE.string <= 1.1 && EMISSIVE.string > 0.4, `string ${EMISSIVE.string}`);
    assert.ok(EMISSIVE.flame <= 1.5 && EMISSIVE.flame > 0.4, `flame ${EMISSIVE.flame}`);
    assert.ok(EMISSIVE.screen <= 0.65 && EMISSIVE.screen > 0.4, `screen ${EMISSIVE.screen}`);
    assert.equal(EMISSIVE.photo, 0);
    assert.ok(EMISSIVE.cap <= 1.5);
    assert.ok(EMISSIVE.bulb <= EMISSIVE.cap);
    assert.ok(EMISSIVE.flame <= EMISSIVE.cap);
  });

  it('clamps factory emissive and metalness', () => {
    assert.equal(capEmissive(6), EMISSIVE.cap);
    assert.equal(capEmissive(-1), 0);
    assert.equal(capEmissive(0.9), 0.9);
    assert.equal(matteMetal(0.85), MATTE.maxMetal);
    assert.equal(matteMetal(0), 0);
  });
});

describe('GS-ROOM-LIGHT material factory', () => {
  it('defaults to dusty matte, never chrome', () => {
    const d = roomMatOpts();
    assert.equal(d.rough, MATTE.defaultRough);
    assert.equal(d.metal, 0);
    assert.ok((d.rough ?? 0) >= 0.85);
    assert.ok(MATTE.maxMetal <= 0.25);
    assert.ok(MATTE.stoneMetal === 0);
    assert.ok(MATTE.stoneRough >= 0.75);
    assert.ok(MATTE.floorRough >= 0.85);
    assert.ok(MATTE.glassRough >= MATTE.minRough);
  });

  it('caps hot call sites and lifts chrome-low roughness', () => {
    const hot = roomMatOpts({ metal: 0.9, emissive: 0xffe2b0, emissiveIntensity: 6, rough: 0.05 });
    assert.equal(hot.metal, MATTE.maxMetal);
    assert.equal(hot.emissiveIntensity, EMISSIVE.cap);
    assert.equal(hot.rough, MATTE.minRough);

    const glass = roomMatOpts({ rough: MATTE.glassRough, metal: MATTE.glassMetal, transparent: true, opacity: 0.42 });
    assert.equal(glass.rough, MATTE.glassRough);
    assert.ok((glass.metal ?? 1) <= MATTE.maxMetal);
    assert.equal(glass.transparent, true);
  });
});

describe('GS-ROOM-LIGHT kitchen night palette', () => {
  it('keeps kitchen walls and counter dark enough for the title key art', () => {
    const kitchen = LEVELS.find((l) => l.id === 'kitchen');
    assert.ok(kitchen, 'kitchen level missing');
    assert.ok(luminance(kitchen!.wallColor) < 0.14, `wall too bright ${kitchen!.wallColor.toString(16)}`);
    assert.ok(luminance(kitchen!.counterColor) < 0.14, `counter too bright ${kitchen!.counterColor.toString(16)}`);
    assert.ok(luminance(kitchen!.fogColor) < 0.08, `fog too bright ${kitchen!.fogColor.toString(16)}`);
    assert.ok(luminance(kitchen!.sky) < 0.14, `sky too bright ${kitchen!.sky.toString(16)}`);
  });
});

describe('GS-ROOM-LIGHT stamp', () => {
  it('visible stamp is BUILD 6', () => {
    assert.match(BUILD_STAMP, /^BUILD 6\b/);
  });
});

describe('GS-ROOM-LIGHT wiring', () => {
  it('Engine bloom and Apartment rig actually consume the contracts', () => {
    const engine = readFileSync(join(here, '../core/Engine.ts'), 'utf8');
    assert.match(engine, /bloom\(color, BLOOM\.strength, BLOOM\.radius, BLOOM\.threshold\)/);

    const apt = src('Apartment.ts');
    assert.match(apt, /NIGHT_RIG\.hemi/);
    assert.match(apt, /NIGHT_RIG\.key/);
    assert.match(apt, /NIGHT_KEY_POS/);
    assert.match(apt, /EMISSIVE\.bulb/);
    assert.match(apt, /MATTE\.floorRough/);

    const props = src('Props.ts');
    assert.match(props, /export function roomMat/);
    assert.match(props, /roomMatOpts/);
    assert.match(props, /EMISSIVE\.flame/);
  });
});
