import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { BUILD_STAMP } from '../buildStamp.ts';
import { CLIP, PAW_MESH, SUKI_GLB_SRC, USE_SIT_FOR_LONG_IDLE } from './sukiGlb.ts';

const glbPath = join(dirname(fileURLToPath(import.meta.url)), '../../public', SUKI_GLB_SRC);

type Gltf = {
  nodes: { name?: string; rotation?: number[]; children?: number[] }[];
  animations: {
    name: string;
    channels: { sampler: number; target: { node: number; path: string } }[];
    samplers: { input: number; output: number }[];
  }[];
  skins: { joints: number[] }[];
  meshes: { primitives: { attributes: Record<string, number> }[] }[];
  accessors: {
    bufferView: number;
    byteOffset?: number;
    componentType: number;
    count: number;
    type: string;
  }[];
  bufferViews: { byteOffset?: number; byteStride?: number }[];
};

function loadGlb(path: string): { gltf: Gltf; bin: Buffer } {
  const buf = readFileSync(path);
  const jsonLen = buf.readUInt32LE(12);
  const json = buf.subarray(20, 20 + jsonLen).toString('utf8').replace(/\0+$/, '').trimEnd();
  const gltf = JSON.parse(json) as Gltf;
  let off = 20 + jsonLen;
  while (off % 4) off++;
  const binLen = buf.readUInt32LE(off);
  const bin = buf.subarray(off + 8, off + 8 + binLen);
  return { gltf, bin };
}

const NCOMP: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const CSIZE: Record<number, number> = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 };

function accOff(gltf: Gltf, i: number): { start: number; stride: number; n: number; count: number; ctype: number } {
  const acc = gltf.accessors[i];
  const bv = gltf.bufferViews[acc.bufferView];
  const n = NCOMP[acc.type];
  const csize = CSIZE[acc.componentType];
  return {
    start: (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0),
    stride: bv.byteStride ?? csize * n,
    n,
    count: acc.count,
    ctype: acc.componentType,
  };
}

function readF32(bin: Buffer, gltf: Gltf, i: number): number[][] {
  const { start, stride, n, count } = accOff(gltf, i);
  const out: number[][] = [];
  for (let k = 0; k < count; k++) {
    const row: number[] = [];
    for (let c = 0; c < n; c++) row.push(bin.readFloatLE(start + k * stride + c * 4));
    out.push(row);
  }
  return out;
}

function readU8x4(bin: Buffer, gltf: Gltf, i: number): number[][] {
  const { start, stride, count } = accOff(gltf, i);
  const out: number[][] = [];
  for (let k = 0; k < count; k++) {
    const o = start + k * stride;
    out.push([bin[o], bin[o + 1], bin[o + 2], bin[o + 3]]);
  }
  return out;
}

function qnorm(q: number[]): number[] {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return q.map((x) => x / n);
}

function qmul(a: number[], b: number[]): number[] {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function qangleDeg(q: number[]): number {
  const w = Math.min(1, Math.max(-1, qnorm(q)[3]));
  return (2 * Math.acos(Math.abs(w)) * 180) / Math.PI;
}

function restDeltaDeg(rest: number[], keys: number[][]): number {
  let mx = 0;
  for (const k of keys) {
    const d = qmul([-rest[0], -rest[1], -rest[2], rest[3]], qnorm(k));
    mx = Math.max(mx, qangleDeg(d));
  }
  return mx;
}

function clipDeltas(gltf: Gltf, bin: Buffer, clip: string, bones: readonly string[]): Record<string, number> {
  const anim = gltf.animations.find((a) => a.name === clip);
  assert.ok(anim, `missing clip ${clip}`);
  const out: Record<string, number> = {};
  for (const ch of anim.channels) {
    if (ch.target.path !== 'rotation') continue;
    const name = gltf.nodes[ch.target.node]?.name;
    if (!name || !bones.includes(name)) continue;
    const rest = qnorm(gltf.nodes[ch.target.node].rotation ?? [0, 0, 0, 1]);
    const quats = readF32(bin, gltf, anim.samplers[ch.sampler].output);
    out[name] = restDeltaDeg(rest, quats);
  }
  return out;
}

describe('GS-PAW-MESH Hunyuan paw shells', () => {
  const { gltf, bin } = loadGlb(glbPath);
  const names = gltf.skins[0].joints.map((j) => gltf.nodes[j].name ?? '');
  const pawJs = new Set(PAW_MESH.exclusiveBones.map((n) => names.indexOf(n)));
  const prim = gltf.meshes[0].primitives[0];
  const pos = readF32(bin, gltf, prim.attributes.POSITION);
  const joints = readU8x4(bin, gltf, prim.attributes.JOINTS_0);
  const weights = readF32(bin, gltf, prim.attributes.WEIGHTS_0);

  it('keeps Idle/Swipe/Hit/Sit on the bound GLB', () => {
    const have = new Set(gltf.animations.map((a) => a.name));
    assert.ok(have.has(CLIP.idle));
    assert.ok(have.has(CLIP.swipe));
    assert.ok(have.has(CLIP.hit));
    assert.ok(have.has(CLIP.sit));
  });

  it('tames Swipe forearm/wrist travel to walk scale', () => {
    const d = clipDeltas(gltf, bin, 'Swipe', PAW_MESH.swipeTameBones);
    assert.ok(d.upper_FL < PAW_MESH.swipeMaxDeltaDeg, `upper_FL ${d.upper_FL}`);
    assert.ok(d.lower_FL < 12, `lower_FL ${d.lower_FL}`);
    assert.ok(d.paw_FL < 12, `paw_FL ${d.paw_FL}`);
    assert.ok(d.shoulder_L < PAW_MESH.swipeMaxDeltaDeg, `shoulder_L ${d.shoulder_L}`);
    // Pre-fix Swipe whipped the forearm ~59°.
    assert.ok(d.upper_FL < 40);
  });

  it('tames Hit/grab spine-neck travel so limbs do not fold into the chest', () => {
    const d = clipDeltas(gltf, bin, 'Hit', PAW_MESH.hitTameBones);
    assert.ok(d.neck < PAW_MESH.hitMaxDeltaDeg, `neck ${d.neck}`);
    assert.ok(d.spine_01 < PAW_MESH.hitMaxDeltaDeg, `spine_01 ${d.spine_01}`);
    assert.ok(d.head < PAW_MESH.hitMaxDeltaDeg, `head ${d.head}`);
    assert.ok(d.tail_01 < PAW_MESH.hitMaxDeltaDeg + 0.5, `tail_01 ${d.tail_01}`);
  });

  it('tames Sit hind/spine travel so f28 does not shred belly cards', () => {
    const d = clipDeltas(gltf, bin, 'Sit', PAW_MESH.sitTameBones);
    assert.ok(d.shin_L < PAW_MESH.sitMaxDeltaDeg, `shin_L ${d.shin_L}`);
    assert.ok(d.thigh_L < PAW_MESH.sitMaxDeltaDeg, `thigh_L ${d.thigh_L}`);
    assert.ok(d.hip_L < 8, `hip_L ${d.hip_L}`);
    assert.ok(d.spine_01 < 8, `spine_01 ${d.spine_01}`);
    // Still a sit — never bind sit as rest.
    assert.ok(d.hip_L > PAW_MESH.sitMinHipDeg, `hip_L collapsed to rest ${d.hip_L}`);
    assert.equal(USE_SIT_FOR_LONG_IDLE, false);
  });

  it('Idle stand is rest — Sit is not bound over four-on-floor', () => {
    const idle = clipDeltas(gltf, bin, 'Idle', ['hip_L', 'thigh_L', 'shin_L', 'spine_01']);
    for (const [bone, deg] of Object.entries(idle)) {
      assert.ok(deg < 3, `Idle ${bone} ${deg} — rest must stay stand`);
    }
  });

  it('locks low-Y paw-shell verts to a single paw bone', () => {
    let low = 0;
    let exclusive = 0;
    let mixedContra = 0;
    const fl = names.indexOf('paw_FL');
    const fr = names.indexOf('paw_FR');
    const lowF = new Set([fl, names.indexOf('lower_FL')]);
    const lowR = new Set([fr, names.indexOf('lower_FR')]);
    for (let i = 0; i < pos.length; i++) {
      if (pos[i][1] >= 0.045) continue;
      low++;
      const k = weights[i][0] >= weights[i][1] && weights[i][0] >= weights[i][2] && weights[i][0] >= weights[i][3] ? 0
        : weights[i][1] >= weights[i][2] && weights[i][1] >= weights[i][3] ? 1
        : weights[i][2] >= weights[i][3] ? 2 : 3;
      if (pawJs.has(joints[i][k]) && weights[i][k] >= 0.99) exclusive++;
      let hasL = false;
      let hasR = false;
      for (let s = 0; s < 4; s++) {
        if (weights[i][s] < 0.05) continue;
        if (lowF.has(joints[i][s])) hasL = true;
        if (lowR.has(joints[i][s])) hasR = true;
      }
      if (hasL && hasR) mixedContra++;
    }
    assert.ok(low > 500, `expected ground paw verts, got ${low}`);
    assert.ok(exclusive / low >= PAW_MESH.lowYExclusiveMin, `exclusive ${exclusive}/${low}`);
    assert.equal(mixedContra, 0, 'paw shells must not span both forearms');
  });

  it('visible stamp is BUILD 12', () => {
    assert.match(BUILD_STAMP, /^BUILD 12\b/);
  });

  it('keeps Swipe tame scale at 0.38', () => {
    const py = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../tools/character-pipe/tame_paw_mesh.py'), 'utf8');
    assert.match(py, /"upper_FL": 0\.38/);
    assert.match(py, /"upper_FR": 0\.38/);
  });
});
