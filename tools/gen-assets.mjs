#!/usr/bin/env node
// gen-assets.mjs — generate all visual/audio assets for "Cat Top Sim — Suki's Jealous Reign".
// Idempotent: existing valid files are skipped. Set REGEN=1 to force regeneration.
// API keys are loaded from .env and never printed.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGEN = process.env.REGEN === '1';
const REQUEST_DELAY_MS = 600;

// ---------- env / manifest ----------

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  const out = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = loadEnv();
const XAI_KEY = env.XAI_API_KEY;
const EL_KEY = env.ELEVENLABS_API_KEY;
if (!XAI_KEY || !EL_KEY) {
  console.error('Missing XAI_API_KEY or ELEVENLABS_API_KEY in .env');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/asset-manifest.json'), 'utf8'));

// ---------- helpers ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** fetch with exponential backoff on 429 / 5xx. */
async function fetchRetry(url, opts, { attempts = 5, label = 'request' } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.status === 429 || res.status >= 500) {
        const wait = 1000 * 2 ** i + Math.random() * 500;
        console.log(`  [retry] ${label}: HTTP ${res.status}, attempt ${i + 1}/${attempts}, waiting ${Math.round(wait)}ms`);
        await sleep(wait);
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      return res;
    } catch (err) {
      const wait = 1000 * 2 ** i + Math.random() * 500;
      console.log(`  [retry] ${label}: ${err.message}, attempt ${i + 1}/${attempts}, waiting ${Math.round(wait)}ms`);
      await sleep(wait);
      lastErr = err;
    }
  }
  throw lastErr;
}

function magicOk(buf, kind) {
  if (buf.length < 4) return false;
  if (kind === 'jpg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (kind === 'png') return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (kind === 'mp3') {
    if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true; // ID3
    return buf[0] === 0xff && (buf[1] & 0xf0) === 0xf0; // FF F*
  }
  return false;
}

function sipsDims(file) {
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], { encoding: 'utf8' });
  const w = Number(out.match(/pixelWidth:\s*(\d+)/)?.[1]);
  const h = Number(out.match(/pixelHeight:\s*(\d+)/)?.[1]);
  if (!w || !h) throw new Error('could not read dimensions');
  return { w, h };
}

// ---------- result tracking ----------

const results = []; // { file, status: 'OK'|'FAIL'|'SKIP', bytes, note }
function record(file, status, note = '') {
  let bytes = 0;
  try { bytes = fs.statSync(path.join(ROOT, file)).size; } catch {}
  results.push({ file, status, bytes, note });
  console.log(`  [${status}] ${file}${note ? ` — ${note}` : ''} (${bytes} bytes)`);
}

function existsValid(file, kind, expectSize) {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) return false;
  const buf = fs.readFileSync(abs);
  if (!magicOk(buf, kind)) return false;
  if (kind === 'jpg' && expectSize) {
    try {
      const { w, h } = sipsDims(abs);
      if (w !== expectSize[0] || h !== expectSize[1]) return false;
    } catch { return false; }
  }
  return true;
}

// ---------- images (xAI) ----------

const IMAGE_MODEL_CANDIDATES = ['grok-2-image', 'grok-2-image-1212', 'grok-imagine-image', 'aurora'];
let resolvedImageModel = null;

async function discoverImageModel() {
  try {
    const res = await fetchRetry('https://api.x.ai/v1/models', {
      headers: { Authorization: `Bearer ${XAI_KEY}` },
    }, { label: 'list-models' });
    if (res.ok) {
      const data = await res.json();
      const ids = (data.data || []).map((m) => m.id);
      const img = ids.filter((id) => /image|aurora|imagine/i.test(id));
      if (img.length) console.log(`  image-capable models on account: ${img.join(', ')}`);
    }
  } catch (e) {
    console.log(`  model discovery failed: ${e.message}`);
  }
  return null;
}

async function generateImageBytes(prompt) {
  const candidates = resolvedImageModel
    ? [resolvedImageModel, ...IMAGE_MODEL_CANDIDATES.filter((m) => m !== resolvedImageModel)]
    : IMAGE_MODEL_CANDIDATES;
  let lastErr = 'no model succeeded';
  for (const model of candidates) {
    try {
      const res = await fetchRetry('https://api.x.ai/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${XAI_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, n: 1, response_format: 'b64_json' }),
      }, { label: `image (${model})` });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        lastErr = `${model}: HTTP ${res.status} ${text.slice(0, 160)}`;
        console.log(`  model ${model} failed: HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      const item = data?.data?.[0];
      if (item?.b64_json) {
        resolvedImageModel = model;
        return Buffer.from(item.b64_json, 'base64');
      }
      if (item?.url) {
        const imgRes = await fetchRetry(item.url, {}, { label: 'image-url-download' });
        if (imgRes.ok) {
          resolvedImageModel = model;
          return Buffer.from(await imgRes.arrayBuffer());
        }
        lastErr = `${model}: url download HTTP ${imgRes.status}`;
        continue;
      }
      lastErr = `${model}: no image data in response`;
    } catch (e) {
      lastErr = `${model}: ${e.message}`;
    }
  }
  if (!resolvedImageModel) await discoverImageModel();
  throw new Error(lastErr);
}

function processImage(rawBuf, outAbs, [tw, th]) {
  const tmpIn = outAbs + '.tmp-raw';
  const tmpCrop = outAbs + '.tmp-crop';
  fs.writeFileSync(tmpIn, rawBuf);
  try {
    const { w, h } = sipsDims(tmpIn);
    const srcAspect = w / h;
    const dstAspect = tw / th;
    let cw = w, ch = h;
    if (srcAspect > dstAspect) cw = Math.round(h * dstAspect); // too wide → crop width
    else ch = Math.round(w / dstAspect); // too tall → crop height
    execFileSync('sips', ['-c', String(ch), String(cw), tmpIn, '--out', tmpCrop], { stdio: 'pipe' });
    execFileSync('sips', [
      '-s', 'format', 'jpeg', '-s', 'formatOptions', '85',
      '-z', String(th), String(tw), tmpCrop, '--out', outAbs,
    ], { stdio: 'pipe' });
  } finally {
    for (const t of [tmpIn, tmpCrop]) { try { fs.unlinkSync(t); } catch {} }
  }
}

async function doImages() {
  console.log('\n=== IMAGES (xAI) ===');
  for (const img of manifest.images) {
    const abs = path.join(ROOT, img.path);
    if (!REGEN && existsValid(img.path, 'jpg', img.size)) { record(img.path, 'SKIP', 'already valid'); continue; }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    try {
      const raw = await generateImageBytes(img.prompt);
      processImage(raw, abs, img.size);
      const out = fs.readFileSync(abs);
      if (!magicOk(out, 'jpg')) { record(img.path, 'FAIL', 'output failed jpeg magic check'); continue; }
      const { w, h } = sipsDims(abs);
      if (w !== img.size[0] || h !== img.size[1]) { record(img.path, 'FAIL', `size ${w}x${h} != ${img.size.join('x')}`); continue; }
      record(img.path, 'OK');
    } catch (e) {
      record(img.path, 'FAIL', e.message.slice(0, 200));
    }
    await sleep(REQUEST_DELAY_MS);
  }
}

// ---------- voices (ElevenLabs) ----------

async function buildVoiceMap() {
  const res = await fetchRetry('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': EL_KEY },
  }, { label: 'list-voices' });
  if (!res.ok) throw new Error(`list voices HTTP ${res.status}`);
  const data = await res.json();
  const map = new Map(); // lowercase name -> { voice_id, name }
  for (const v of data.voices || []) map.set(v.name.toLowerCase(), v);
  return map;
}

function resolveCast(voiceMap) {
  const cast = {};
  for (const [key, info] of Object.entries(manifest.voiceCast)) {
    const want = info.name.toLowerCase();
    if (voiceMap.has(want)) {
      cast[key] = voiceMap.get(want).voice_id;
    } else {
      // Fallback: first available voice; logged clearly as a substitution.
      const fallback = voiceMap.values().next().value;
      console.log(`  [voice-substitution] cast "${key}" wants "${info.name}" — not on account; using "${fallback?.name}" instead`);
      cast[key] = fallback?.voice_id;
    }
  }
  return cast;
}

async function tts(voiceId, text) {
  const body = (modelId) => JSON.stringify({
    text,
    model_id: modelId,
    voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.45, use_speaker_boost: true },
  });
  for (const modelId of ['eleven_turbo_v2_5', 'eleven_multilingual_v2']) {
    const res = await fetchRetry(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': EL_KEY, 'Content-Type': 'application/json' },
      body: body(modelId),
    }, { label: `tts (${modelId})` });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const t = await res.text().catch(() => '');
    console.log(`  tts model ${modelId} failed: HTTP ${res.status} ${t.slice(0, 120)}`);
  }
  throw new Error('tts failed with both models');
}

async function doVoices() {
  console.log('\n=== VOICES (ElevenLabs TTS) ===');
  const voiceMap = await buildVoiceMap();
  const cast = resolveCast(voiceMap);
  for (const v of manifest.voices) {
    const abs = path.join(ROOT, v.path);
    if (!REGEN && existsValid(v.path, 'mp3')) { record(v.path, 'SKIP', 'already valid'); continue; }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    try {
      const voiceId = cast[v.cast];
      if (!voiceId) throw new Error(`no voice resolved for cast "${v.cast}"`);
      const buf = await tts(voiceId, v.text);
      if (!magicOk(buf, 'mp3')) { record(v.path, 'FAIL', 'response failed mp3 magic check'); continue; }
      fs.writeFileSync(abs, buf);
      record(v.path, 'OK');
    } catch (e) {
      record(v.path, 'FAIL', e.message.slice(0, 200));
    }
    await sleep(REQUEST_DELAY_MS);
  }
}

// ---------- sfx (ElevenLabs) ----------

async function doSfx() {
  console.log('\n=== SFX (ElevenLabs sound-generation) ===');
  for (const s of manifest.sfx) {
    const abs = path.join(ROOT, s.path);
    if (!REGEN && existsValid(s.path, 'mp3')) { record(s.path, 'SKIP', 'already valid'); continue; }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    try {
      const res = await fetchRetry('https://api.elevenlabs.io/v1/sound-generation', {
        method: 'POST',
        headers: { 'xi-api-key': EL_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: s.prompt, duration_seconds: s.duration, prompt_influence: 0.4 }),
      }, { label: 'sfx' });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} ${t.slice(0, 160)}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (!magicOk(buf, 'mp3')) { record(s.path, 'FAIL', 'response failed mp3 magic check'); continue; }
      fs.writeFileSync(abs, buf);
      record(s.path, 'OK');
    } catch (e) {
      record(s.path, 'FAIL', e.message.slice(0, 200));
    }
    await sleep(REQUEST_DELAY_MS);
  }
}

// ---------- music (ElevenLabs, optional) ----------

async function doMusic() {
  console.log('\n=== MUSIC (ElevenLabs, optional) ===');
  for (const m of manifest.music) {
    const abs = path.join(ROOT, m.path);
    if (!REGEN && existsValid(m.path, 'mp3')) { record(m.path, 'SKIP', 'already valid'); continue; }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    try {
      let buf = null;
      for (let i = 0; i < 2 && !buf; i++) {
        const res = await fetch(`https://api.elevenlabs.io/v1/music`, {
          method: 'POST',
          headers: { 'xi-api-key': EL_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: m.prompt, music_length_ms: m.seconds * 1000 }),
        });
        if (res.status === 404 || res.status === 403) {
          throw new Error(`music endpoint unavailable (HTTP ${res.status}) — skipping, game has procedural fallback`);
        }
        if (res.ok) { buf = Buffer.from(await res.arrayBuffer()); break; }
        const t = await res.text().catch(() => '');
        console.log(`  music attempt ${i + 1}/2 failed: HTTP ${res.status} ${t.slice(0, 120)}`);
        await sleep(1000);
      }
      if (!buf) throw new Error('music generation failed after 2 attempts');
      if (!magicOk(buf, 'mp3')) { record(m.path, 'FAIL', 'response failed mp3 magic check'); continue; }
      fs.writeFileSync(abs, buf);
      record(m.path, 'OK');
    } catch (e) {
      record(m.path, 'FAIL', e.message.slice(0, 200));
    }
    await sleep(REQUEST_DELAY_MS);
  }
}

// ---------- main ----------

function printTable() {
  console.log('\n=== FINAL STATUS ===');
  let ok = 0, fail = 0, skip = 0;
  for (const r of results) {
    if (r.status === 'OK') ok++;
    else if (r.status === 'FAIL') fail++;
    else skip++;
    console.log(`${r.status.padEnd(4)} ${String(r.bytes).padStart(9)}  ${r.file}${r.note ? `  (${r.note})` : ''}`);
  }
  console.log(`\nTotals: ${ok} OK, ${skip} skipped, ${fail} failed, ${results.length} total`);
}

const start = Date.now();
try {
  await doImages();
  await doVoices();
  await doSfx();
  await doMusic();
} catch (e) {
  console.error(`\nFATAL: ${e.message}`);
} finally {
  printTable();
  console.log(`Elapsed: ${Math.round((Date.now() - start) / 1000)}s. Re-run is safe: valid files are skipped (REGEN=1 forces).`);
}
