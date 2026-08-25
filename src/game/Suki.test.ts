import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { BUILD_STAMP } from '../buildStamp.ts';
import {
  CLIP,
  GLB_SCALE,
  GLB_YAW_OFFSET,
  USE_SIT_FOR_LONG_IDLE,
  SUKI_COAT,
  SUKI_PAW_BONES,
  PAW_HIT_RADIUS,
  PAW_PLAY_REACH,
  PAW_MESH,
  SUKI_BOW,
  SUKI_FACE,
  SUKI_GLB_SRC,
  SUKI_TAIL,
  sukiGlbUrl,
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
    assert.equal(PAW_PLAY_REACH, 0.42);
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Suki.ts'), 'utf8');
    assert.match(src, /preparePaws\(dt: number\) \{\s*this\.group\.rotation\.y = this\.yaw;/);
    assert.match(src, /updateMatrixWorld\(true\)/);
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
    assert.ok(SUKI_BOW.napeLocal.y <= 0.032, `napeLocal.y ${SUKI_BOW.napeLocal.y} sits on the crown (0.055)`);
    assert.ok(SUKI_BOW.napeLocal.y >= 0.018, `napeLocal.y ${SUKI_BOW.napeLocal.y} dropped onto the rump`);
    assert.ok(
      SUKI_BOW.napeLocal.z <= -0.035 && SUKI_BOW.napeLocal.z >= -0.055,
      `napeLocal.z ${SUKI_BOW.napeLocal.z} must sit toward the tail without floating off the nape`,
    );
    assert.equal(SUKI_BOW.attr, 'sukiBow');
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

  it('splits face identity off the paper coat and nudges rest tail off the left bow loop', () => {
    assert.deepEqual([...SUKI_FACE.bones], ['head', 'ear_L', 'ear_R']);
    assert.equal(SUKI_FACE.attr, 'sukiFace');
    assert.equal(SUKI_FACE.coatChroma, 0.14);
    assert.ok(SUKI_FACE.faceChroma <= 0.06, `faceChroma ${SUKI_FACE.faceChroma} still papers pale blush`);
    assert.ok(SUKI_FACE.faceLuma >= 0.38, `faceLuma ${SUKI_FACE.faceLuma} still papers grey lashes`);
    assert.ok(SUKI_FACE.coatLuma <= 0.24, 'coat luma gate must stay tight or hatch returns');
    assert.ok(SUKI_FACE.overlay, 'Hunyuan iris islands need head furniture like the nape bow');
    assert.equal(SUKI_FACE.parentBone, 'head');
    assert.ok(SUKI_FACE.eyeRadius >= 0.014, `eyeRadius ${SUKI_FACE.eyeRadius} still a blue dot`);
    const { r: sr, b: sb } = {
      r: (SUKI_FACE.sapphire >> 16) & 255,
      b: SUKI_FACE.sapphire & 255,
    };
    assert.ok(sb > sr + 40, 'overlay iris must be sapphire, not grey');
    assert.deepEqual([...SUKI_TAIL.bones], ['tail_01', 'tail_02', 'tail_03']);
    assert.ok(SUKI_TAIL.nudge.tail_01.z <= -18, `tail_01 z ${SUKI_TAIL.nudge.tail_01.z} does not clear the left loop`);
    assert.ok(SUKI_TAIL.nudge.tail_01.x <= -12, `tail_01 x ${SUKI_TAIL.nudge.tail_01.x} still climbs the nape`);
    assert.ok(SUKI_TAIL.nudge.tail_01.x >= -22, `tail_01 x ${SUKI_TAIL.nudge.tail_01.x} drags the plume`);
    assert.equal(USE_SIT_FOR_LONG_IDLE, false);
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Suki.ts'), 'utf8');
    assert.match(src, /applyTailNudge/);
    assert.match(src, /SUKI_TAIL\.bones/);
    assert.match(src, /quaternion\.multiply\(tailNudgeQuat/);
    assert.doesNotMatch(src, /setFromEuler\(_nudgeEuler\)/);
    assert.match(src, /buildHeroFaceMesh/);
    assert.match(src, /HeroFace/);
    assert.ok(SUKI_FACE.headLocal.y >= 0.04, `headLocal.y ${SUKI_FACE.headLocal.y} still inside the skull`);
    assert.ok(SUKI_FACE.headLocal.x <= -0.015, `headLocal.x ${SUKI_FACE.headLocal.x} sits on the +X cheek, not the face`);
    assert.ok(SUKI_FACE.lashLen >= 0.015, `lashLen ${SUKI_FACE.lashLen} papers out in portrait`);
    assert.equal(SUKI_FACE.blushOverlay, false, 'MeshBasic blush spheres were the hard magenta cheek');
    assert.equal(SUKI_FACE.blushRadius, 0);
    assert.ok(SUKI_FACE.sat <= 1.7, `sat ${SUKI_FACE.sat} still punches Hunyuan blush into a decal`);
    assert.ok(SUKI_FACE.lift <= 1.25, `lift ${SUKI_FACE.lift} still punches Hunyuan blush into a decal`);
    const { r: br, g: bg, b: bb } = {
      r: (SUKI_FACE.blush >> 16) & 255,
      g: (SUKI_FACE.blush >> 8) & 255,
      b: SUKI_FACE.blush & 255,
    };
    assert.ok(br > bb, 'blush must stay warm, not grey paper');
    assert.ok(bg >= 160 && br - bg < 80, `blush ${SUKI_FACE.blush.toString(16)} is magenta, not approved-sit peach`);
    assert.doesNotMatch(src, /blushRadius/);
    assert.match(src, /No MeshBasic blush sphere/);
    assert.doesNotMatch(src, /OTS\.(back|side|height)\s*=/);
    const toon = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Toon.ts'), 'utf8');
    assert.match(toon, /MeshBasicNodeMaterial/);
    assert.match(toon, /SUKI_FLUFF_HEX/);
  });

  it('cache-busts the play GLB URL with the BUILD stamp and does not rename the file', () => {
    assert.equal(SUKI_GLB_SRC, 'assets/models/suki.glb');
    const url = sukiGlbUrl();
    assert.equal(url.split('?')[0], SUKI_GLB_SRC);
    assert.match(url, /\?v=/);
    assert.ok(url.includes(encodeURIComponent(BUILD_STAMP)), `${url} missing stamp ${BUILD_STAMP}`);
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Suki.ts'), 'utf8');
    assert.match(src, /sukiGlbUrl\(\)/);
    assert.doesNotMatch(src, /loadAsync\(\s*['"]assets\/models\/suki\.glb['"]\s*\)/);
  });

  it('applies paper coat + nape bow + face on both backends — not gated on ?gl=1', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Suki.ts'), 'utf8');
    const engine = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../core/Engine.ts'), 'utf8');
    assert.match(src, /toonifySukiCoat\(this\.inner\)/);
    assert.match(src, /attachHeroBow\(sk\.skeleton\)/);
    assert.match(src, /attachHeroFace\(sk\.skeleton\)/);
    assert.match(src, /napeLocal/);
    assert.equal(SUKI_BOW.napeLocal.y, 0.028);
    assert.equal(SUKI_BOW.napeLocal.z, -0.042);
    assert.equal(SUKI_FACE.overlay, true);
    assert.doesNotMatch(src, /\?gl|forceWebGL|usingWebGPU|safeMode/);
    // Engine may force WebGL on mobile Safari; stills look must not live there.
    assert.doesNotMatch(engine, /toonifySukiCoat|attachHeroBow|attachHeroFace/);
  });
});
