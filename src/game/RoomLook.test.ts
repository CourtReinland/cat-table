import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { BUILD_STAMP } from '../buildStamp.ts';
import { LEVELS } from '../data/content.ts';
import {
  ACCENT_MIX,
  BLOOM,
  EMISSIVE,
  MATTE,
  NIGHT_AMBIENT,
  NIGHT_FILL_POS,
  NIGHT_KEY_POS,
  NIGHT_RIG,
  NIGHT_SURFACE,
  TOON_HOT_STOP,
  TOON_SHADOW_STOP,
  capEmissive,
  levelMood,
  liftLuma,
  luminance,
  matteMetal,
  mixHex,
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
  it('is a soft rim plus fill, not a left-side clip pool and black cliff', () => {
    assert.ok(NIGHT_RIG.hemi >= 0.42 && NIGHT_RIG.hemi <= 0.65, `hemi ${NIGHT_RIG.hemi} must lift cabinets without going daylight`);
    assert.ok(NIGHT_RIG.moon >= 0.45 && NIGHT_RIG.moon <= 0.75, `moon ${NIGHT_RIG.moon}`);
    assert.ok(NIGHT_RIG.key <= 7, `key ${NIGHT_RIG.key} still dumps a white pool`);
    assert.ok(NIGHT_RIG.lamp >= 8 && NIGHT_RIG.lamp <= 12, `lamp ${NIGHT_RIG.lamp} should read as a practical`);
    assert.ok(NIGHT_RIG.fill >= 5.5 && NIGHT_RIG.fill <= 10, `fill ${NIGHT_RIG.fill}`);
    assert.ok(NIGHT_RIG.pendant <= 5, `pendant ${NIGHT_RIG.pendant} is a second sun`);
    assert.ok(NIGHT_RIG.fogDensity <= 0.03, `fog ${NIGHT_RIG.fogDensity} eats the window`);
    assert.ok(NIGHT_RIG.key < NIGHT_RIG.fill, 'rim must be weaker than the fill that lifts the dark half');
  });

  it('puts warm rim behind-left and fill on the window half', () => {
    assert.ok(NIGHT_KEY_POS.x < -1.5, `key x=${NIGHT_KEY_POS.x} is not left-side warmth`);
    assert.ok(NIGHT_KEY_POS.z < 0, `key z=${NIGHT_KEY_POS.z} must be behind for a rim, not a slab dump`);
    assert.ok(NIGHT_FILL_POS.x > 1, `fill x=${NIGHT_FILL_POS.x} must lift the right/window half`);
  });

  it('keeps ambient dusty cocoa-purple, not magenta bounce', () => {
    const fill = NIGHT_AMBIENT.fill;
    const r = (fill >> 16) & 255;
    const b = fill & 255;
    assert.ok(b - r < 30, `fill ${fill.toString(16)} is magenta bounce`);
    assert.ok(luminance(fill) < 0.32, `fill too bright`);
    assert.ok(luminance(NIGHT_AMBIENT.ground) < 0.12);
    assert.ok(luminance(NIGHT_AMBIENT.rim) > 0.45, 'rim should read warm peach');
    // captain-owned: do not retune hemi/fog/sky/ground on a surface-color ticket
    assert.equal(NIGHT_RIG.hemi, 0.52);
    assert.equal(NIGHT_RIG.fogDensity, 0.022);
    assert.equal(NIGHT_AMBIENT.sky, 0x43384c);
    assert.equal(NIGHT_AMBIENT.ground, 0x1a1412);
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
    assert.ok(MATTE.ceramicRough >= 0.85);
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

describe('GS-ROOM-COLOR night-readable surfaces', () => {
  it('keeps kitchen local color at night, not a crushed-black cave', () => {
    const kitchen = LEVELS.find((l) => l.id === 'kitchen');
    assert.ok(kitchen, 'kitchen level missing');
    const { wallColor, counterColor, fogColor, sky } = kitchen!;
    assert.ok(
      luminance(wallColor) >= NIGHT_SURFACE.minWallLuma && luminance(wallColor) <= NIGHT_SURFACE.maxWallLuma,
      `wall ${wallColor.toString(16)} luma=${luminance(wallColor).toFixed(3)}`,
    );
    assert.ok(
      luminance(counterColor) >= NIGHT_SURFACE.minCounterLuma && luminance(counterColor) <= NIGHT_SURFACE.maxCounterLuma,
      `counter ${counterColor.toString(16)} luma=${luminance(counterColor).toFixed(3)}`,
    );
    assert.ok(
      luminance(fogColor) >= NIGHT_SURFACE.minFogLuma && luminance(fogColor) <= NIGHT_SURFACE.maxFogLuma,
      `fog ${fogColor.toString(16)} luma=${luminance(fogColor).toFixed(3)}`,
    );
    assert.ok(
      luminance(sky) >= NIGHT_SURFACE.minSkyLuma && luminance(sky) <= NIGHT_SURFACE.maxSkyLuma,
      `sky ${sky.toString(16)} luma=${luminance(sky).toFixed(3)}`,
    );
    // dusty mauve / granite, not grey daylight or the 0x161218 black slab
    assert.notEqual(counterColor, 0x161218);
    assert.ok((wallColor & 255) > ((wallColor >> 16) & 255), `wall ${wallColor.toString(16)} should stay mauve`);
    assert.ok((sky & 255) > ((sky >> 16) & 255), `sky ${sky.toString(16)} should stay purple-red`);
    assert.ok(luminance(counterColor) * TOON_HOT_STOP >= 0.18, 'lit granite must survive the toon hot stop');
    assert.ok(
      luminance(counterColor) * TOON_SHADOW_STOP >= 0.12,
      `table must keep hue in the toon shadow band (play shot was a black slab). luma*shadow=${(luminance(counterColor) * TOON_SHADOW_STOP).toFixed(3)}`,
    );
  });

  it('lifts every level’s walls/counter/sky/fog into the night-readable band', () => {
    for (const level of LEVELS) {
      const tag = level.id;
      assert.ok(
        luminance(level.wallColor) >= NIGHT_SURFACE.minWallLuma && luminance(level.wallColor) <= NIGHT_SURFACE.maxWallLuma,
        `${tag} wall ${level.wallColor.toString(16)} luma=${luminance(level.wallColor).toFixed(3)}`,
      );
      assert.ok(
        luminance(level.counterColor) >= NIGHT_SURFACE.minCounterLuma &&
          luminance(level.counterColor) <= NIGHT_SURFACE.maxCounterLuma,
        `${tag} counter ${level.counterColor.toString(16)} luma=${luminance(level.counterColor).toFixed(3)}`,
      );
      assert.ok(
        luminance(level.sky) >= NIGHT_SURFACE.minSkyLuma && luminance(level.sky) <= NIGHT_SURFACE.maxSkyLuma,
        `${tag} sky ${level.sky.toString(16)} luma=${luminance(level.sky).toFixed(3)}`,
      );
      assert.ok(
        luminance(level.fogColor) >= NIGHT_SURFACE.minFogLuma && luminance(level.fogColor) <= NIGHT_SURFACE.maxFogLuma,
        `${tag} fog ${level.fogColor.toString(16)} luma=${luminance(level.fogColor).toFixed(3)}`,
      );
      assert.ok(luminance(level.fogColor) < luminance(level.wallColor), `${tag} fog should sit behind the walls`);
    }
  });

  it('preserves hue when lifting a crushed black slab', () => {
    const lifted = liftLuma(0x161218, NIGHT_SURFACE.minCounterLuma);
    assert.ok(luminance(lifted) >= NIGHT_SURFACE.minCounterLuma - 0.001);
    assert.ok(luminance(lifted) <= NIGHT_SURFACE.maxCounterLuma + 0.02, 'lift is not a daylight fill');
    const srcR = (0x4a2c3a >> 16) & 255;
    const srcB = 0x4a2c3a & 255;
    const out = liftLuma(0x4a2c3a, 0.22);
    const outR = (out >> 16) & 255;
    const outB = out & 255;
    assert.ok(srcR > srcB, 'source is warm');
    assert.ok(outR >= outB, `lifted ${out.toString(16)} must keep warm hue`);
  });

  it('keeps granite flecks, cabinet body, and floor grain in the house look', () => {
    assert.ok(MATTE.stoneVein >= 0.26, 'vein/grain too timid to read at night');
    assert.ok(MATTE.stoneNormal >= 0.28 && MATTE.stoneNormal <= 0.5, 'normals catch grain, not chrome');
    assert.ok(MATTE.stoneMetal === 0);
    assert.ok(NIGHT_SURFACE.stonePale >= 0.22, 'pale granite flecks must actually mix in');
    assert.ok(NIGHT_SURFACE.stoneChar >= 0.12);
    assert.ok(NIGHT_SURFACE.cabinetMul >= 0.7 && NIGHT_SURFACE.cabinetMul < 1, 'cabinets darker than the slab, not crushed');
    assert.ok(NIGHT_SURFACE.bgMul >= 0.75, 'background must keep fog hue');
    assert.ok(NIGHT_SURFACE.floorLightMin >= 32, 'floor boards too dark to show grain');
    assert.ok(NIGHT_SURFACE.floorLightMax <= 62 && NIGHT_SURFACE.floorLightMax > NIGHT_SURFACE.floorLightMin);
    assert.ok(luminance(NIGHT_SURFACE.cityBot) >= 0.14, 'window foot is a purple-red, not black');
    assert.ok(luminance(NIGHT_SURFACE.shellWall) >= NIGHT_SURFACE.minWallLuma);
    assert.ok(luminance(NIGHT_SURFACE.shellRug) >= NIGHT_SURFACE.minWallLuma);
    assert.ok(luminance(NIGHT_SURFACE.shellShelf) >= NIGHT_SURFACE.minWallLuma);
    assert.ok(luminance(NIGHT_SURFACE.shellFrame) >= NIGHT_SURFACE.minWallLuma);
    assert.ok(luminance(NIGHT_SURFACE.shellPan) >= NIGHT_SURFACE.minWallLuma);
    assert.ok(luminance(NIGHT_SURFACE.shellRack) >= NIGHT_SURFACE.minWallLuma);
    assert.ok(TOON_SHADOW_STOP < 0.32 && TOON_SHADOW_STOP > 0.24);
  });
});

describe('GS-ROOM-LIGHT per-level accents on the night family', () => {
  it('does not discard desk/dining key and fill into one kitchen look', () => {
    const kitchen = LEVELS.find((l) => l.id === 'kitchen')!;
    const desk = LEVELS.find((l) => l.id === 'desk')!;
    const dining = LEVELS.find((l) => l.id === 'dining')!;
    assert.equal(desk.keyColor, 0xa8e0ff);
    assert.equal(dining.fillColor, 0x9a5aff);
    const k = levelMood(kitchen);
    const d = levelMood(desk);
    const n = levelMood(dining);
    assert.notEqual(k.key, d.key);
    assert.notEqual(k.fill, n.fill);
    assert.equal(d.lamp, desk.lampColor);
    assert.equal(n.lamp, dining.lampColor);
    // desk key leans cooler than the night rim; dining fill leans violet
    const deskB = d.key & 255;
    const deskR = (d.key >> 16) & 255;
    assert.ok(deskB > deskR, `desk key ${d.key.toString(16)} should stay cool`);
    const dinB = n.fill & 255;
    const dinR = (n.fill >> 16) & 255;
    assert.ok(dinB > dinR + 20, `dining fill ${n.fill.toString(16)} should stay violet`);
    assert.ok(ACCENT_MIX >= 0.5, 'level colors must actually drive the practicals');
    assert.equal(mixHex(0xff0000, 0x00ff00, 0), 0xff0000);
    assert.equal(mixHex(0xff0000, 0x00ff00, 1), 0x00ff00);
  });
});

describe('GS-ROOM-LIGHT stamp', () => {
  it('visible stamp is BUILD 11 (CameraRig.test.ts owns this too)', () => {
    assert.match(BUILD_STAMP, /^BUILD 11\b/);
  });
});

describe('GS-ROOM-LIGHT wiring', () => {
  it('Engine bloom and Apartment rig actually consume the contracts', () => {
    const engine = readFileSync(join(here, '../core/Engine.ts'), 'utf8');
    assert.match(engine, /bloom\(color, BLOOM\.strength, BLOOM\.radius, BLOOM\.threshold\)/);

    const apt = src('Apartment.ts');
    const load = apt.slice(apt.indexOf('loadLevel('));
    const wallLoop = load.match(/for \(const i of \[1, 2, 3\]\) \{[\s\S]*?\n    \}/)?.[0] ?? '';
    assert.match(wallLoop, /toonify\(wall\)/);
    assert.doesNotMatch(wallLoop, /\.dispose\(/);
    assert.match(apt, /NIGHT_RIG\.hemi/);
    assert.match(apt, /NIGHT_RIG\.key/);
    assert.match(apt, /NIGHT_KEY_POS/);
    assert.match(apt, /NIGHT_FILL_POS/);
    assert.match(apt, /NIGHT_AMBIENT/);
    assert.match(apt, /levelMood\(level\)/);
    assert.match(apt, /this\.key\.target\.position\.set\(0, topY, cz\)/);
    assert.match(apt, /this\.key\.color\.setHex\(mood\.key\)/);
    assert.match(apt, /this\.fill\.color\.setHex\(mood\.fill\)/);
    assert.match(apt, /this\.lamp\.color\.setHex\(mood\.lamp\)/);
    assert.match(apt, /this\.key\.castShadow = false/);
    assert.match(apt, /EMISSIVE\.bulb/);
    assert.match(apt, /MATTE\.floorRough/);
    assert.match(apt, /NIGHT_SURFACE\.cabinetMul/);
    assert.match(apt, /NIGHT_SURFACE\.bgMul/);
    assert.match(apt, /NIGHT_SURFACE\.cityBot/);
    assert.match(apt, /NIGHT_SURFACE\.floorLightMin/);
    assert.match(apt, /NIGHT_SURFACE\.shellPan/);
    assert.match(apt, /NIGHT_SURFACE\.shellRack/);
    assert.match(apt, /const pole =[\s\S]*?NIGHT_SURFACE\.shellRack/);
    assert.match(apt, /const cord =[\s\S]*?NIGHT_SURFACE\.shellRack/);
    assert.match(
      apt,
      /roomMat\(NIGHT_SURFACE\.shellPan, \{ rough: 0\.7, metal: 0\.18, emissive: level\.lampColor, emissiveIntensity: EMISSIVE\.shade \}/,
    );
    assert.match(apt, /roomMat\(0xf5e0b8[\s\S]*?EMISSIVE\.shade/);
    assert.doesNotMatch(apt, /roomMat\(0x2a2a32/);
    assert.doesNotMatch(apt, /roomMat\(0x141014/);
    assert.doesNotMatch(apt, /roomMat\(0x2a2422/);
    assert.match(apt, /liftLuma\(/);
    assert.doesNotMatch(apt, /multiplyScalar\(0\.48\)/);
    assert.doesNotMatch(apt, /rgba\(6, 4, 14/);
    assert.doesNotMatch(apt, /#241811/);
    assert.doesNotMatch(apt, /#3a2a24/);

    const props = src('Props.ts');
    assert.match(props, /export function roomMat/);
    assert.match(props, /roomMatOpts/);
    assert.match(props, /EMISSIVE\.flame/);
    assert.match(props, /ceramicMat|ceramicSurface/);

    const textures = src('Textures.ts');
    assert.match(textures, /export function ceramicSurface/);
    assert.match(textures, /keepNightRgb/);
    assert.match(textures, /NIGHT_SURFACE\.stonePale/);
    assert.match(textures, /NIGHT_SURFACE\.minMapLuma/);
    assert.match(textures, /blotch/);
  });
});
