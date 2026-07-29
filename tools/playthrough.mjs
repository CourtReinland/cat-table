#!/usr/bin/env node
/**
 * Headless AI playthrough + capture harness (indie-sprint play gate).
 *
 * Starts Vite is NOT required here — pass BASE if already running, or set
 * START_DEV=1 to spawn `npm run dev` for the duration.
 *
 * Usage:
 *   node tools/playthrough.mjs [--levels 0,1] [--interval 1500] [--timeout 90000]
 *
 * Env:
 *   BASE=http://127.0.0.1:5173
 *   OUT=tools/out/play
 *   START_DEV=1
 *   VIEW=1280x720
 *
 * Writes:
 *   OUT/report.json  — per-level telemetry + flags for difficulty/physics
 *   OUT/L{n}-t{ms}.png — interval screenshots during autoplay
 *   OUT/L{n}-portrait-compare-meta.json — paths to portrait + best 3d frame
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { spawn } from 'child_process';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const BASE = process.env.BASE ?? 'http://127.0.0.1:5173';
const OUT = resolve(ROOT, process.env.OUT ?? 'tools/out/play');
const VIEW = (process.env.VIEW ?? '1280x720').split('x').map(Number);
const LEVELS = (arg('--levels', process.env.LEVELS ?? '0'))
  .split(',')
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => !Number.isNaN(n));
const INTERVAL = parseInt(arg('--interval', process.env.INTERVAL ?? '1500'), 10);
const TIMEOUT = parseInt(arg('--timeout', process.env.TIMEOUT ?? '90000'), 10);
const START_DEV = process.env.START_DEV === '1' || process.argv.includes('--dev');

mkdirSync(OUT, { recursive: true });

const PORTRAITS = {
  suki: 'public/assets/characters/suki-portrait.jpg',
  eli: 'public/assets/characters/boy-eli.jpg',
  jasper: 'public/assets/characters/boy-jasper.jpg',
  kai: 'public/assets/characters/boy-kai.jpg',
  theo: 'public/assets/characters/boy-theo.jpg',
  ren: 'public/assets/characters/boy-ren.jpg',
};

const LEVEL_BOY = {
  0: 'eli',
  1: 'jasper',
  2: 'kai',
  3: 'theo',
  4: 'ren',
};

let devProc = null;

async function waitForServer(url, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status === 404) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Server not ready: ${url}`);
}

if (START_DEV) {
  console.log('starting vite…');
  devProc = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173'], {
    cwd: ROOT,
    stdio: 'pipe',
    env: { ...process.env },
  });
  devProc.stdout.on('data', (d) => process.stdout.write(`[vite] ${d}`));
  devProc.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
  await waitForServer(BASE);
  console.log('vite ready');
}

const browser = await chromium.launch({
  headless: true,
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan',
    '--use-angle=metal',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
  ],
});

const page = await browser.newPage({
  viewport: { width: VIEW[0], height: VIEW[1] },
});
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[PAGEERROR] ${e.message}`));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getState() {
  return page.evaluate(() => (window.__cat ? window.__cat.state : null));
}

/**
 * Heuristic flags for playfeel (not final art judgment — agents read shots too).
 */
function analyzeSamples(samples, totalProps) {
  if (!samples.length) {
    return {
      too_easy: null,
      physics_stuck: null,
      clear_time_ms: null,
      notes: ['no samples'],
    };
  }
  const last = samples[samples.length - 1];
  const first = samples[0];
  const clear_time_ms =
    last.phase === 'complete' || last.phase === 'dialogue' || last.phase === 'cinematic'
      ? last.elapsedMs
      : null;

  // too easy: cleared under 12s with autopilot while total props >= 8
  const too_easy =
    clear_time_ms != null && clear_time_ms < 12000 && totalProps >= 8;

  // physics stuck: broken doesn't increase for >8s while remaining > 0 during playing
  let physics_stuck = false;
  let lastBroken = first.broken ?? 0;
  let lastChangeT = first.t;
  for (const s of samples) {
    if ((s.broken ?? 0) !== lastBroken) {
      lastBroken = s.broken ?? 0;
      lastChangeT = s.t;
    }
    if (
      s.phase === 'playing' &&
      (s.remaining ?? 0) > 0 &&
      s.t - lastChangeT > 8000
    ) {
      physics_stuck = true;
    }
  }

  // sliding forever: many bodies still "sliding" late
  const late = samples.filter((s) => s.phase === 'playing').slice(-3);
  let sliding_late = false;
  for (const s of late) {
    const sliding = (s.bodies || []).filter((b) => b.state === 'sliding').length;
    if (sliding >= 3) sliding_late = true;
  }

  return {
    too_easy,
    physics_stuck,
    sliding_late,
    clear_time_ms,
    final_score: last.score,
    final_broken: last.broken,
    final_phase: last.phase,
    sample_count: samples.length,
  };
}

const report = {
  created_at: new Date().toISOString(),
  base: BASE,
  levels: [],
  logs_tail: [],
};

try {
  for (const level of LEVELS) {
    console.log(`\n=== level ${level} autoplay ===`);
    await page.goto(`${BASE}/?auto=1&level=${level}&quality=medium`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await sleep(2500);
    await page.click('#btn-intro-go').catch(() => {});
    await sleep(800);

    const samples = [];
    const frames = [];
    const t0 = Date.now();
    let lastShot = 0;
    let final = null;
    let total = 10;

    while (Date.now() - t0 < TIMEOUT) {
      const st = await getState();
      if (!st) {
        await sleep(500);
        continue;
      }
      total = st.total || total;
      const sample = {
        t: Date.now() - t0,
        ...st,
        // drop heavy body list from every sample in report after analysis — keep in sample
      };
      samples.push(sample);

      if (Date.now() - lastShot >= INTERVAL) {
        const name = `L${level}-t${String(sample.t).padStart(5, '0')}.png`;
        const path = join(OUT, name);
        await page.screenshot({ path });
        frames.push({ t: sample.t, path: name, phase: st.phase, broken: st.broken });
        console.log(`shot ${name} phase=${st.phase} broken=${st.broken}/${st.total}`);
        lastShot = Date.now();
      }

      if (st.phase === 'dialogue' || st.phase === 'complete' || st.phase === 'ending') {
        final = st;
        const name = `L${level}-end.png`;
        await page.screenshot({ path: join(OUT, name) });
        frames.push({ t: Date.now() - t0, path: name, phase: st.phase, broken: st.broken });
        break;
      }
      await sleep(Math.min(INTERVAL, 500));
    }

    // mid-play frame preferred for 3d likeness (character visible)
    const playFrames = frames.filter((f) => f.phase === 'playing' || f.phase === 'cinematic');
    const best3d = playFrames[Math.floor(playFrames.length / 2)] || frames[0];
    const boyId = LEVEL_BOY[level] || 'eli';
    const portraitRel = PORTRAITS[boyId];
    const sukiRel = PORTRAITS.suki;
    const blenderStill = `tools/out/blender/bf_${boyId}_stand.png`;

    const analysis = analyzeSamples(samples, total);
    // strip full bodies from stored samples to keep JSON light
    const lightSamples = samples.map(({ bodies, ...rest }) => ({
      ...rest,
      body_states: bodies
        ? Object.fromEntries(
            ['idle', 'sliding', 'falling', 'gone'].map((k) => [
              k,
              bodies.filter((b) => b.state === k).length,
            ]),
          )
        : null,
    }));

    const levelReport = {
      level,
      boyfriendId: boyId,
      analysis,
      frames,
      samples: lightSamples,
      likeness_paths: {
        portrait: portraitRel,
        suki_portrait: sukiRel,
        play_frame: best3d ? join(OUT, best3d.path) : null,
        blender_stand: existsSync(resolve(ROOT, blenderStill))
          ? blenderStill
          : null,
      },
    };
    report.levels.push(levelReport);

    writeFileSync(
      join(OUT, `L${level}-likeness-meta.json`),
      JSON.stringify(levelReport.likeness_paths, null, 2),
    );
    console.log('analysis:', JSON.stringify(analysis));
  }
} finally {
  report.logs_tail = logs.slice(-40);
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\nwrote ${join(OUT, 'report.json')}`);
  await browser.close();
  if (devProc) {
    devProc.kill('SIGTERM');
  }
}

// exit non-zero if any level looks broken (stuck or never progressed)
const hardFail = report.levels.some(
  (L) => L.analysis.physics_stuck || L.analysis.final_phase === 'playing',
);
process.exit(hardFail ? 2 : 0);
