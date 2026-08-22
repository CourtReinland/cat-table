#!/usr/bin/env node
/**
 * Isolation stills of sculpted Suki (toon lookdev, no gameplay).
 * Usage: node tools/suki-shot.mjs
 * Env: BASE (default http://localhost:5173), OUT (default docs/suki-model)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const OUT = process.env.OUT ?? 'docs/suki-model';
mkdirSync(OUT, { recursive: true });

// name -> { view, clip }
const shots = [
  { name: 'beauty', view: 'beauty', clip: 'Sit' },
  { name: 'side', view: 'side', clip: 'Idle' },
  { name: 'front', view: 'front', clip: 'Idle' },
  { name: 'threeq', view: 'threeq', clip: 'Idle' },
  { name: 'paw', view: 'paw', clip: 'Walk' },
  { name: 'face', view: 'face', clip: 'Idle' },
  { name: 'sit', view: 'front', clip: 'Sit' },
  { name: 'play-bow', view: 'side', clip: 'PlayBow' },
  { name: 'loaf', view: 'beauty', clip: 'Loaf' },
  { name: 'walk', view: 'threeq', clip: 'Walk' },
  { name: 'wink', view: 'face', clip: 'Wink' },
];

const browser = await chromium.launch({
  headless: true,
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan',
    '--use-angle=swiftshader',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
  ],
});
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[PAGEERROR] ${e.message}`));

for (const shot of shots) {
  const url = `${BASE}/preview.html?model=suki&view=${shot.view}&clip=${shot.clip}&gl=1`;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__ready, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1800);
  const path = `${OUT}/suki-${shot.name}.png`;
  await page.screenshot({ path });
  console.log(`shot: ${path}`);
}

console.log('--- console ---');
for (const l of logs.slice(-20)) console.log(l);
const errors = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[PAGEERROR]'));
console.log(`--- ${errors.length} errors ---`);
for (const e of errors.slice(0, 12)) console.log(e);
await browser.close();
