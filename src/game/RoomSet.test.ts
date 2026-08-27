import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { LEVELS } from '../data/content.ts';
import { applyOtsPose, applyPortraitPose, makeOtsCamera, PORTRAIT, pointsInView } from './CameraRig.ts';
import { NIGHT_RIG, SET_DRESS } from './roomLook.ts';

const here = dirname(fileURLToPath(import.meta.url));

/** Match Apartment.loadLevel spawn (do not import WebGPU Apartment in node). */
function spawnOf(level: (typeof LEVELS)[number]) {
  const [w, d] = level.counterSize;
  const cz = 0.3;
  return {
    pos: new THREE.Vector3(-w / 2 + 0.35, level.counterHeight, cz + d / 2 - 0.28),
    yaw: Math.PI * 0.5,
  };
}

function otsCam(level: (typeof LEVELS)[number], aspect = 16 / 9) {
  const { pos, yaw } = spawnOf(level);
  const cam = makeOtsCamera(aspect);
  applyOtsPose(cam, pos, yaw, 0);
  cam.updateMatrixWorld();
  return cam;
}

function slabOf(level: (typeof LEVELS)[number]) {
  const [w, d] = level.counterSize;
  const cz = 0.3;
  return {
    minX: -w / 2,
    maxX: w / 2,
    minZ: cz - d / 2,
    maxZ: cz + d / 2,
  };
}

describe('GS-ROOM-SET night rig lift', () => {
  it('lifts hemi/fill/moon without dumping key on the slab', () => {
    assert.ok(NIGHT_RIG.hemi >= 0.55 && NIGHT_RIG.hemi <= 0.65);
    assert.ok(NIGHT_RIG.fill >= 7.8 && NIGHT_RIG.fill <= 9.8);
    assert.ok(NIGHT_RIG.moon >= 0.60 && NIGHT_RIG.moon <= 0.75);
    assert.equal(NIGHT_RIG.key, 4.8);
    assert.ok(NIGHT_RIG.key < NIGHT_RIG.fill);
    assert.ok(NIGHT_RIG.pendant <= 5);
  });
});

describe('GS-ROOM-SET OTS-readable fringe', () => {
  it('keeps every kitchen landmark off the play slab', () => {
    const kitchen = LEVELS.find((l) => l.id === 'kitchen')!;
    const slab = slabOf(kitchen);
    for (const [name, p] of Object.entries(SET_DRESS.kitchen)) {
      const onSlab = p.x >= slab.minX && p.x <= slab.maxX && p.z >= slab.minZ && p.z <= slab.maxZ;
      assert.equal(onSlab, false, `${name} @ ${p.x},${p.z} sits on the smashable island`);
    }
  });

  it('plants kitchen back-counter / fridge / cooker in the spawn OTS frame', () => {
    const kitchen = LEVELS.find((l) => l.id === 'kitchen')!;
    const cam = otsCam(kitchen);
    const need = ['backCounter', 'sink', 'riceCooker', 'fridge', 'upperCab', 'bakerRack'] as const;
    for (const name of need) {
      const p = SET_DRESS.kitchen[name];
      const pt = new THREE.Vector3(p.x, p.y, p.z);
      assert.ok(
        pointsInView(cam, [pt], 0.98),
        `${name} (${p.x}, ${p.y}, ${p.z}) misses kitchen play OTS`,
      );
    }
  });

  it('keeps the portrait hutch behind the cat in 3/4 stills, not in the OTS lens', () => {
    const kitchen = LEVELS.find((l) => l.id === 'kitchen')!;
    const { pos, yaw } = spawnOf(kitchen);
    const ots = otsCam(kitchen);
    const por = new THREE.PerspectiveCamera(PORTRAIT.fov, 16 / 9, PORTRAIT.near, PORTRAIT.far);
    applyPortraitPose(por, pos, yaw);
    por.updateMatrixWorld();
    const h = SET_DRESS.kitchen.portraitHutch;
    const pt = new THREE.Vector3(h.x, h.y, h.z);
    assert.ok(pointsInView(por, [pt], 0.98), 'portrait stills still look into empty -X void');
    assert.equal(pointsInView(ots, [pt], 0.98), false, 'hutch must not sit between OTS camera and Suki');
  });

  it('puts OTS-near dressing on every other level', () => {
    const checks: { id: string; keys: string[] }[] = [
      { id: 'coffee', keys: ['backConsole', 'loungeChair', 'snackCart', 'speaker', 'wallBoard'] },
      { id: 'desk', keys: ['backShelf', 'fileCab', 'easel', 'pinboard', 'corkWall', 'wallBoard'] },
      { id: 'dresser', keys: ['nightstand', 'wardrobe', 'vanityStool', 'robeHook', 'wallBoard'] },
      { id: 'dining', keys: ['wineCart', 'windowSideboard', 'guestChair', 'serveTrolley', 'wallBoard'] },
    ];
    for (const { id, keys } of checks) {
      const level = LEVELS.find((l) => l.id === id)!;
      const cam = otsCam(level);
      const slab = slabOf(level);
      const dress = SET_DRESS[id as keyof typeof SET_DRESS];
      for (const key of keys) {
        const p = dress[key as keyof typeof dress] as { x: number; y: number; z: number };
        const onSlab = p.x >= slab.minX && p.x <= slab.maxX && p.z >= slab.minZ && p.z <= slab.maxZ;
        assert.equal(onSlab, false, `${id}.${key} on the play slab`);
        const pt = new THREE.Vector3(p.x, p.y, p.z);
        assert.ok(pointsInView(cam, [pt], 0.98), `${id}.${key} misses spawn OTS`);
      }
    }
  });
});

describe('GS-ROOM-SET leave the cat and camera alone', () => {
  it('does not retune OTS, Suki fluff, or the BUILD stamp', () => {
    assert.match(readFileSync(join(here, '../buildStamp.ts'), 'utf8'), /BUILD 13/);
    const suki = readFileSync(join(here, 'Suki.ts'), 'utf8');
    assert.match(suki, /toonifySukiCoat\(this\.inner\)/);
    const cam = readFileSync(join(here, 'CameraRig.ts'), 'utf8');
    assert.match(cam, /back: 1\.32/);
    assert.match(cam, /side: 0\.18/);
    const apt = readFileSync(join(here, 'Apartment.ts'), 'utf8');
    assert.match(apt, /this\.catSpawn\.set\(-w \/ 2 \+ 0\.35/);
    assert.doesNotMatch(apt, /toonifySukiCoat/);
  });

  it('reuses Props / Textures kit instead of a new asset pipeline', () => {
    const apt = readFileSync(join(here, 'Apartment.ts'), 'utf8');
    assert.match(apt, /buildProp\('teapot'\)/);
    assert.match(apt, /buildProp\('plant'\)/);
    assert.match(apt, /tileSurface/);
    assert.match(apt, /panelSurface/);
    assert.match(apt, /marbleSurface/);
    assert.match(apt, /fabricSurface/);
    assert.match(apt, /rugSurface/);
    assert.match(apt, /dressProp\(/);
  });
});

describe('GS-ROOM-DETAIL deepen coffee/desk/dresser/dining', () => {
  it('does not move kitchen BUILD 12 landmarks or bump the stamp', () => {
    const k = SET_DRESS.kitchen;
    assert.equal(k.fridge.x, 2.78);
    assert.equal(k.fridge.z, 0.22);
    assert.equal(k.backCounter.z, -1.14);
    assert.equal(k.bakerRack.x, 1.52);
    assert.equal(NIGHT_RIG.key, 4.8);
    assert.match(readFileSync(join(here, '../buildStamp.ts'), 'utf8'), /BUILD 13/);
  });

  it('does not park new dressing on the play slab', () => {
    for (const id of ['coffee', 'desk', 'dresser', 'dining'] as const) {
      const level = LEVELS.find((l) => l.id === id)!;
      const slab = slabOf(level);
      const dress = SET_DRESS[id];
      for (const [name, p] of Object.entries(dress)) {
        const onSlab = p.x >= slab.minX && p.x <= slab.maxX && p.z >= slab.minZ && p.z <= slab.maxZ;
        assert.equal(onSlab, false, `${id}.${name} @ ${p.x},${p.z} sits on the smashable slab`);
      }
    }
  });

  it('keeps coffee table good-form (lower shelf) and an OTS-right snack cart', () => {
    const apt = readFileSync(join(here, 'Apartment.ts'), 'utf8');
    assert.match(apt, /lower shelf so the table reads as furniture/);
    assert.match(apt, /SET_DRESS\.coffee/);
    assert.equal(SET_DRESS.coffee.snackCart.z > 1.1, true);
    const coffee = LEVELS.find((l) => l.id === 'coffee')!;
    const cam = otsCam(coffee);
    assert.ok(pointsInView(cam, [new THREE.Vector3(SET_DRESS.coffee.snackCart.x, SET_DRESS.coffee.snackCart.y, SET_DRESS.coffee.snackCart.z)], 0.98));
  });

  it('plants a desk easel and pinboard in spawn OTS', () => {
    const desk = LEVELS.find((l) => l.id === 'desk')!;
    const cam = otsCam(desk);
    for (const name of ['easel', 'pinboard'] as const) {
      const p = SET_DRESS.desk[name];
      assert.ok(pointsInView(cam, [new THREE.Vector3(p.x, p.y, p.z)], 0.98), `desk.${name} misses spawn OTS`);
    }
    const apt = readFileSync(join(here, 'Apartment.ts'), 'utf8');
    assert.match(apt, /shaker drawer fronts so the pedestals read as a desk/);
    assert.match(apt, /leftover empty \+X BACK WALL/);
    assert.match(apt, /leftoverWallBoard/);
    assert.doesNotMatch(apt, /farBoard/);
    const wall = SET_DRESS.desk.corkWall;
    assert.ok(pointsInView(cam, [new THREE.Vector3(wall.x, wall.y, wall.z)], 0.98), 'desk.corkWall misses spawn OTS');
    assert.equal(SET_DRESS.desk.fileCab.x, 2.32);
    assert.equal(SET_DRESS.desk.backShelf.z, -1.10);
  });

  it('drops the leftover dresser stool that sat on the OTS-right fringe twice', () => {
    const apt = readFileSync(join(here, 'Apartment.ts'), 'utf8');
    assert.doesNotMatch(apt, /cyl\(0\.2, 0\.08, fabric, 0\.95, 0\.42, 1\.35\)/);
    assert.equal(SET_DRESS.dresser.vanityStool.x, 1.18);
    assert.equal(SET_DRESS.dresser.vanityStool.z, 1.38);
  });

  it('seats dining guests on the OTS-right and a serving trolley off-slab', () => {
    const dining = LEVELS.find((l) => l.id === 'dining')!;
    const cam = otsCam(dining);
    const g = SET_DRESS.dining.guestChair;
    const t = SET_DRESS.dining.serveTrolley;
    assert.ok(pointsInView(cam, [new THREE.Vector3(g.x, g.y, g.z)], 0.98), 'guestChair misses spawn OTS');
    assert.ok(pointsInView(cam, [new THREE.Vector3(t.x, t.y, t.z)], 0.98), 'serveTrolley misses spawn OTS');
    const apt = readFileSync(join(here, 'Apartment.ts'), 'utf8');
    assert.match(apt, /two chairs on the window/);
    assert.match(apt, /d \/ 2 \+ 0\.55/);
    assert.match(apt, /n\.guestChair\.x/);
    assert.match(apt, /n\.guestChair\.z/);
  });

  it('fills leftover empty surfaces on coffee/desk/dresser/dining without new OTS-missing landmarks', () => {
    const apt = readFileSync(join(here, 'Apartment.ts'), 'utf8');
    assert.match(apt, /leftover empty floor by the cart/);
    assert.match(apt, /leftover empty floor by the speaker/);
    assert.match(apt, /polaroids on the splash/);
    assert.match(apt, /leftover empty floor — wastebasket/);
    assert.match(apt, /leftover empty floor — paint tubes/);
    assert.match(apt, /leftover empty floor by the stool/);
    assert.match(apt, /leftover empty floor by the robe/);
    assert.match(apt, /leftover empty floor — wine crate/);
    assert.match(apt, /leftover empty floor by the wine cart/);
    assert.match(apt, /dresserRug/);
    assert.match(apt, /leftover empty \+X wall behind the wardrobe/);
    for (const id of ['coffee', 'desk', 'dresser', 'dining'] as const) {
      assert.equal(SET_DRESS[id].wallBoard.x, 3.55, `${id}.wallBoard must sit beside the front posters`);
      assert.equal(SET_DRESS[id].wallBoard.z, 5.16, `${id}.wallBoard must share the front-poster plane, not hang at 4.72`);
    }
    const shot = readFileSync(join(here, '../../tools/gs-room-detail-shot.mjs'), 'utf8');
    assert.match(shot, /auto=1&level=N&instant=1/);
    assert.match(shot, /searchParams\.set\('instant', '1'\)/);
    assert.match(shot, /searchParams\.set\('level', String\(i\)\)/);
    const game = readFileSync(join(here, 'Game.ts'), 'utf8');
    assert.match(game, /q\.get\('instant'\) === '1'/);
    assert.match(game, /if \(this\.autopilot && instant\)/);
    assert.match(game, /this\.startPlaying\(\)/);
    assert.match(game, /else if \(this\.autopilot\)/);
    assert.match(shot, /phase === 'playing'/);
    assert.doesNotMatch(shot, /waitForFunction\(\(\) => window\.__cat, \{ timeout: 20000 \}\)/);
  });

  it('leaves Suki coat, OTS numbers, and smashable placement alone', () => {
    const suki = readFileSync(join(here, 'Suki.ts'), 'utf8');
    assert.match(suki, /toonifySukiCoat\(this\.inner\)/);
    const cam = readFileSync(join(here, 'CameraRig.ts'), 'utf8');
    assert.match(cam, /back: 1\.32/);
    assert.match(cam, /side: 0\.18/);
    const apt = readFileSync(join(here, 'Apartment.ts'), 'utf8');
    assert.match(apt, /this\.catSpawn\.set\(-w \/ 2 \+ 0\.35/);
    assert.match(apt, /visual\.group\.position\.set\(x, counterRestY\(this\.surface\.topY\), z\)/);
    assert.doesNotMatch(apt, /toonifySukiCoat/);
    assert.equal(NIGHT_RIG.key, 4.8);
  });
});

describe('GS-ROOM-SET forge auto-fixes', () => {
  it('drops the leftover desk chair that intersected backShelf', () => {
    const apt = readFileSync(join(here, 'Apartment.ts'), 'utf8');
    assert.doesNotMatch(
      apt,
      /0\.6,\s*0\.5,\s*-1\.15/,
      'old chair seat at (0.6, 0.5, −1.15) intersects SET_DRESS.desk.backShelf',
    );
    assert.equal(SET_DRESS.desk.backShelf.x, 0.25);
    assert.equal(SET_DRESS.desk.backShelf.z, -1.10);
  });

  it('parks the kitchen under-cab PointLight under the stone-top lip', () => {
    const apt = readFileSync(join(here, 'Apartment.ts'), 'utf8');
    assert.doesNotMatch(
      apt,
      /0\.88,\s*k\.backCounter\.z \+ 0\.12/,
      'under-cab must not sit at y=0.88 / z+0.12 (inside the 0.895 stone top)',
    );
    assert.match(
      apt,
      /under\.position\.set\(k\.backCounter\.x,\s*0\.78,\s*k\.backCounter\.z \+ 0\.5 \/ 2\)/,
      'park under-cab at y=0.78 on the cabinet front face (under the lip)',
    );
    assert.equal(NIGHT_RIG.key, 4.8);
  });

  it('separates the L-return from the fridge AABB; fridge stays the +X vanishing point', () => {
    const fridge = SET_DRESS.kitchen.fridge;
    assert.equal(fridge.x, 2.78);
    assert.equal(fridge.z, 0.22);
    // fridge meshBox 0.62 × 1.84 × 0.58; L-return stone top 0.52 × 0.05 × 1.35
    const f = {
      minX: fridge.x - 0.62 / 2,
      maxX: fridge.x + 0.62 / 2,
      minY: fridge.y - 1.84 / 2,
      maxY: fridge.y + 1.84 / 2,
      minZ: fridge.z - 0.58 / 2,
      maxZ: fridge.z + 0.58 / 2,
    };
    const lCx = 2.48;
    const lCz = -0.8;
    const lW = 0.52;
    const lD = 1.35;
    const lTopY = 0.92;
    const l = {
      minX: lCx - lW / 2,
      maxX: lCx + lW / 2,
      minY: 0,
      maxY: lTopY,
      minZ: lCz - lD / 2,
      maxZ: lCz + lD / 2,
    };
    const overlap =
      f.minX < l.maxX &&
      f.maxX > l.minX &&
      f.minY < l.maxY &&
      f.maxY > l.minY &&
      f.minZ < l.maxZ &&
      f.maxZ > l.minZ;
    assert.equal(overlap, false, 'L-return still intersects the fridge AABB');
    const apt = readFileSync(join(here, 'Apartment.ts'), 'utf8');
    assert.match(apt, /cabinetRun\(lg, level, 2\.48, -0\.80, 0\.52, 1\.35, 0\.92\)/);
    assert.doesNotMatch(apt, /cabinetRun\(lg, level, 2\.48, -0\.42, 0\.52, 1\.35, 0\.92\)/);
  });

  it('sits the rice cooker on the 0.92 back-counter, keeping OTS x/z', () => {
    const p = SET_DRESS.kitchen.riceCooker;
    assert.equal(p.x, 0.08);
    assert.equal(p.z, -1.12);
    assert.equal(p.y, 1.00);
  });

  it('nudges the third bar stool −X off bakerRack', () => {
    const apt = readFileSync(join(here, 'Apartment.ts'), 'utf8');
    assert.match(apt, /for \(const sx of \[-0\.9, 0\.15, 0\.85\]\)/);
    assert.doesNotMatch(apt, /for \(const sx of \[-0\.9, 0\.15, 1\.15\]\)/);
  });
});
