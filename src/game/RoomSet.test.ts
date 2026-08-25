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
