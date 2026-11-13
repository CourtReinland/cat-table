import type { Object3D } from 'three';

/**
 * Play drop-in for boyfriend GLBs.
 *
 * Kitchen date (Eli): STAND at the far +X island lip. Do not couch-sit.
 * Do not start in Idle_Sit (that floats a sit clip at y=0 with no seat).
 *
 * Play mesh: textured Mixamo `public/assets/models/boy-eli.glb`.
 * Clips: Idle_Sit, Idle_Stand (1-frame T-pose bind — not a looping idle),
 * StandUp, Walk, Kneel. No Cuddle — do not invent one. Face FAIL is accepted;
 * do not invent a new face. Head bone is already `Head`. Play load uses
 * SkeletonUtils.clone and does not rename the rig or mutate cached clips.
 * Rest is standing T-pose, 1.75 m, +Y up. Leave jasper/kai/theo/ren on clay.
 */
export const BOY_CLIPS = [
  'Idle_Sit',
  'StandUp',
  'Idle_Stand',
  'Walk',
  'Kneel',
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
 * the camera. Idle_Stand at y=0 (feet on the floor). Yaw −π/2 faces the cat (−X).
 */
export const KITCHEN_ISLAND_END_PAD = 0.15;

/** Clay offsets from group origin (metres). Mixamo bind (~1.75 m) may differ. */
export const CLAY_SIT_HEAD_Y = 1.11;
export const CLAY_SIT_CHEST_Y = 0.88;
export const CLAY_STAND_HEAD_Y = 1.53;
export const CLAY_STAND_CHEST_Y = 1.2;
/** Mixamo Eli is ~1.75 m; head sits a little above the clay stand marker. */
export const MIXAMO_STAND_HEAD_Y = 1.65;
export const MIXAMO_STAND_CHEST_Y = 1.35;

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

/** Stand just past the island's +X lip, facing the cat. Date at the island. */
export function kitchenIslandBoyPlacement(
  catSpawn: { x: number; z: number },
  counterWidth: number,
): BoyPlayPlacement {
  return {
    pos: { x: counterWidth / 2 + KITCHEN_ISLAND_END_PAD, y: 0, z: catSpawn.z },
    rotY: -Math.PI / 2,
    pose: 'stand',
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
  standHeadY = CLAY_STAND_HEAD_Y,
  standChestY = CLAY_STAND_CHEST_Y,
): { x: number; y: number; z: number } {
  const sit = place.pose === 'sit';
  const yOff =
    which === 'head'
      ? sit
        ? CLAY_SIT_HEAD_Y
        : standHeadY
      : sit
        ? CLAY_SIT_CHEST_Y
        : standChestY;
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

/** Idle_Stand shorter than this is a bind T-pose, not a looping idle (clay ~2.54s). */
export const BIND_POSE_MAX_S = 0.05;

export function idleStandIsBind(duration: number): boolean {
  return duration > 0 && duration < BIND_POSE_MAX_S;
}

/** Win cine sits then StandUp only if the date spawned sitting. Kitchen Eli is already stand. */
export function cineShouldSitThenStand(pose: string): boolean {
  return pose === 'sit';
}

/**
 * t=1.2 win-cine cut. Couch dates keep the sofa look; kitchen/stand dates look
 * at the island body/head (Eli at ~2.25, 1.5, 0.97), not empty furniture.
 * Camera pos for this cut stays the wide +Z shot — only the look was leftover.
 */
export const CINE_RISE_T = 1.2;
export const CINE_RISE_POS = { x: -2.6, y: 2.0, z: 3.3 };
export const CINE_COUCH_RISE_LOOK = { x: -1.9, y: 1.0, z: -1.5 };

export function cineRiseLookAt(
  place: Pick<BoyPlayPlacement, 'pos' | 'pose'>,
  standHeadY = MIXAMO_STAND_HEAD_Y,
  standChestY = MIXAMO_STAND_CHEST_Y,
): { x: number; y: number; z: number } {
  if (place.pose === 'sit') return { ...CINE_COUCH_RISE_LOOK };
  const y = place.pos.y + (standHeadY + standChestY) * 0.5;
  return { x: place.pos.x, y, z: place.pos.z };
}

/** Mixamo: `mixamorig:Head` / `mixamorigHead` → `Head`. Idempotent on clay names. Play load does not call this. */
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
