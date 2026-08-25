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
    assert.ok(NIGHT_RIG.hemi >= 0.55 && NIGHT_RIG.hemi <= 0.62);
    assert.ok(NIGHT_RIG.fill >= 7.8 && NIGHT_RIG.fill <= 9.2);
    assert.ok(NIGHT_RIG.moon >= 0.60 && NIGHT_RIG.moon <= 0.70);
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
      { id: 'coffee', keys: ['backConsole', 'loungeChair'] },
      { id: 'desk', keys: ['backShelf', 'fileCab'] },
      { id: 'dresser', keys: ['nightstand', 'wardrobe'] },
      { id: 'dining', keys: ['wineCart', 'windowSideboard'] },
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
    assert.match(readFileSync(join(here, '../buildStamp.ts'), 'utf8'), /BUILD 11/);
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
