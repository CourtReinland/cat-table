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
 * Bind authored −Y forward in Blender; glTF +Y-up export lands the skeleton
 * on game +Z (head / front paws at +Z, tail at −Z). Highest mesh verts are
 * the tail plume, not the ears — do not infer facing from the AABB.
 * Offset stays 0 so group yaw remains the gameplay heading.
 */
export const GLB_YAW_OFFSET = 0;

/**
 * Sit belly-cards shred on the authored bind (hips 16° / thighs 22° / shins 28°).
 * Long idle stays on Idle / Idle_Look (stand). Sit remains on the GLB after a
 * travel tame (tools/character-pipe/tame_paw_mesh.py) so isolation f28 can plant
 * without exploding Hunyuan cards. Gameplay must not rest into Sit.
 */
export const USE_SIT_FOR_LONG_IDLE = false;

/**
 * GS-SUKI-POLISH coat policy (playtest bar 2).
 * Do not feed Hunyuan albedo/normal/AO into the room MeshToon path — that
 * hatch map is the graphite. White toon fluff shader; chroma/luma identity
 * only (sapphire / pink bow). No inverted hull. Do not remake the mesh.
 */
export const SUKI_COAT = {
  keepAlbedo: false,
  useFluffShader: true,
  identityFromAlbedo: true,
  skipOutline: true,
  forceFrontSide: true,
} as const;

/** Front paw bones on the standing Hunyuan bind (glTF +Y-up names). */
export const SUKI_PAW_BONES = ['paw_FL', 'paw_FR'] as const;

/** Hit sphere around each visible front paw (metres). */
export const PAW_HIT_RADIUS = 0.11;

/**
 * GS-PAW-MESH — Hunyuan fur-card shells tube when Swipe over-rotates the
 * forearm and nearest-bone weights smear a paw across both wrists / the chest.
 * Play GLB is patched in place (tools/character-pipe/tame_paw_mesh.py): paw
 * verts exclusive-bind to paw_* bones, Swipe/Hit/Sit travel is slerped toward
 * rest. Sit is not rest. Do not remake Hunyuan.
 */
export const PAW_MESH = {
  exclusiveBones: ['paw_FL', 'paw_FR', 'paw_HL', 'paw_HR'] as const,
  swipeTameBones: ['upper_FL', 'lower_FL', 'paw_FL', 'shoulder_L'] as const,
  /** Walk-scale. Pre-fix Swipe upper_FL was ~59°. Keep 0.38 tame. */
  swipeMaxDeltaDeg: 28,
  hitTameBones: ['spine_01', 'neck', 'head', 'tail_01'] as const,
  hitMaxDeltaDeg: 14,
  sitTameBones: ['hip_L', 'thigh_L', 'shin_L', 'spine_01'] as const,
  /** Authored Sit shin was 28°; f28 exploded 540 edges. */
  sitMaxDeltaDeg: 12,
  /** Sit must still fold off Idle stand — never bind sit as rest. */
  sitMinHipDeg: 4,
  lowYExclusiveMin: 0.85,
} as const;

/**
 * Hero pink bow. Hunyuan `node_0` only has 159 verts on bow / bow_L / bow_R
 * — a ~3 cm throat strip. Bone scale 3.2 did not silhouette from default
 * OTS (1.32 m behind). A three.js nape mesh (two loops + tails) is parented
 * to `bow`, offset up and toward the tail. Do not move the camera. Keep the
 * Hunyuan skull. Do not inflate the chest strip.
 */
export const SUKI_BOW = {
  meshName: 'node_0',
  parentBone: 'bow' as const,
  bones: ['bow', 'bow_L', 'bow_R'] as const,
  /** Throat-strip scale — left at 1 so the chest thread does not smear. */
  loopScale: 1,
  knotScale: 1,
  napeMesh: true,
  /** Saturated hero pink; MeshBasic so night bounce cannot lavender it. */
  pink: 0xf24a96,
  /** Bone-local metres. +Y up the nape, −Z toward the tail / OTS camera. */
  napeLocal: { x: 0, y: 0.028, z: -0.042 },
  loopRadius: 0.04,
  tailLength: 0.06,
} as const;
