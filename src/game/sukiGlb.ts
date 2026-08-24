/**
 * Hunyuan play-mesh fit. Kept out of Suki.ts so node tests can import
 * without pulling three/webgpu.
 */

/** Clip names authored by tools/character-pipe/bind_suki_stand.py. */
export const CLIP = {
  idle: 'Idle',
  look: 'Idle_Look',
  walk: 'Walk',
  run: 'Run',
  swipe: 'Swipe',
  sit: 'Sit',
  cuddle: 'Cuddle',
  hit: 'Hit',
} as const;

/**
 * Bind already grounds the mesh at 0.40 m (TARGET_H). The old cream-sculpt
 * 0.85 scale would shrink an already kitten-sized play mesh on a ~4-unit
 * counter. Procedural fallback is ~0.38 tall after its 1.18 scale.
 */
export const GLB_SCALE = 1;

/**
 * Hunyuan rest pose faces −Z (head / ears at min Z in the bound GLB).
 * Game / CameraRig treat +Z as forward at yaw 0. Offset lives on the mesh
 * only — group yaw stays the gameplay heading so OTS / first-person math
 * stay upright.
 */
export const GLB_YAW_OFFSET = Math.PI;

/**
 * Sit belly-cards shred on this bind. Long idle stays on Idle / Idle_Look
 * (stand). Sit remains on the GLB for tools; gameplay must not rest into it.
 */
export const USE_SIT_FOR_LONG_IDLE = false;
