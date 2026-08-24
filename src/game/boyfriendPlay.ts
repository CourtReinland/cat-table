import type { Object3D } from 'three';

/**
 * Play drop-in for boyfriend GLBs.
 *
 * TODO(GS-HUMAN-SCOUT Mixamo): `public/assets/models/boy-eli.glb` is still the
 * clay factory mesh from `tools/blender/build_boyfriends.py` (BFRig capsules).
 * The cloud VM has no Mixamo / AccuRIG / VRoid / Adobe. Drop a Mixamo-rigged
 * GLB on that path with clips Idle_Sit, StandUp, Idle_Stand, Walk, Kneel,
 * Cuddle. `mixamorig:Head` is remapped at load so look-at keeps working.
 * Do not invent a fake Mixamo mesh. Leave jasper/kai/theo/ren on clay.
 */
export const BOY_CLIPS = [
  'Idle_Sit',
  'StandUp',
  'Idle_Stand',
  'Walk',
  'Kneel',
  'Cuddle',
] as const;

export type BoyPlayPoseName = 'sit' | 'stand';

export type BoyPlayPlacement = {
  pos: { x: number; y: number; z: number };
  rotY: number;
  pose: BoyPlayPoseName;
};

/** Matches Apartment.loadLevel surface z. */
export const LEVEL_SURFACE_CZ = 0.3;

/**
 * Far +X end of the kitchen island, just outside the slab.
 * Confirmed (not the labeled 72°/2° paste): couch sit is ~79° camera-right
 * of boot OTS look and out of frustum. This slot is ~5.3 m ahead, ~5.4° off
 * look, same z as Suki spawn — in desktop and phone OTS without retargeting
 * the camera. Idle_Sit at y=0; yaw −π/2 faces the cat (−X).
 */
export const KITCHEN_ISLAND_END_PAD = 0.15;

/** Clay Idle_Sit offsets from group origin (metres). Mixamo bind may differ. */
export const CLAY_SIT_HEAD_Y = 1.11;
export const CLAY_SIT_CHEST_Y = 0.88;
export const CLAY_STAND_HEAD_Y = 1.53;
export const CLAY_STAND_CHEST_Y = 1.2;

export function boyGlbUrl(id: string): string {
  return `assets/models/boy-${id}.glb`;
}

export function couchBoyPlacement(couchPos: { x: number; z: number }): BoyPlayPlacement {
  return {
    pos: { x: couchPos.x + 0.35, y: 0, z: couchPos.z + 0.3 },
    rotY: 0.35,
    pose: 'sit',
  };
}

/** Sit just past the island's +X lip, facing the cat. Date at the island. */
export function kitchenIslandBoyPlacement(
  catSpawn: { x: number; z: number },
  counterWidth: number,
): BoyPlayPlacement {
  return {
    pos: { x: counterWidth / 2 + KITCHEN_ISLAND_END_PAD, y: 0, z: catSpawn.z },
    rotY: -Math.PI / 2,
    pose: 'sit',
  };
}

export function boyPlayPlacement(
  surface: string,
  couchPos: { x: number; z: number },
  catSpawn: { x: number; z: number },
  counterWidth: number,
): BoyPlayPlacement {
  if (surface === 'kitchen') return kitchenIslandBoyPlacement(catSpawn, counterWidth);
  return couchBoyPlacement(couchPos);
}

export function boyMarkerWorld(
  place: BoyPlayPlacement,
  which: 'head' | 'chest',
): { x: number; y: number; z: number } {
  const sit = place.pose === 'sit';
  const yOff =
    which === 'head'
      ? sit
        ? CLAY_SIT_HEAD_Y
        : CLAY_STAND_HEAD_Y
      : sit
        ? CLAY_SIT_CHEST_Y
        : CLAY_STAND_CHEST_Y;
  return { x: place.pos.x, y: place.pos.y + yOff, z: place.pos.z };
}

export function kitchenCatSpawn(counterSize: [number, number], counterHeight: number) {
  const [w, d] = counterSize;
  return {
    x: -w / 2 + 0.35,
    y: counterHeight,
    z: LEVEL_SURFACE_CZ + d / 2 - 0.28,
  };
}

/** Mixamo: `mixamorig:Head` / `mixamorigHead` → `Head`. Idempotent on clay names. */
export function stripMixamoPrefix(name: string): string {
  return name.replace(/^mixamorig[:_]?/, '');
}

export function remapMixamoTrackName(trackName: string): string {
  const dot = trackName.indexOf('.');
  if (dot < 0) return stripMixamoPrefix(trackName);
  return stripMixamoPrefix(trackName.slice(0, dot)) + trackName.slice(dot);
}

export function remapMixamoRig(
  root: Object3D,
  clips: { tracks: { name: string }[] }[] = [],
): void {
  root.traverse((o) => {
    o.name = stripMixamoPrefix(o.name);
  });
  for (const clip of clips) {
    for (const track of clip.tracks) {
      track.name = remapMixamoTrackName(track.name);
    }
  }
}

export function findHeadBone(root: Object3D): Object3D | null {
  const names = ['Head', 'mixamorig:Head', 'mixamorigHead', 'mixamorig_Head'];
  for (const n of names) {
    const o = root.getObjectByName(n);
    if (o) return o;
  }
  let found: Object3D | null = null;
  root.traverse((o) => {
    if (found) return;
    if (stripMixamoPrefix(o.name) === 'Head') found = o;
  });
  return found;
}
