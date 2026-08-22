#!/usr/bin/env node
/** Screenshot the model preview page. Usage: node tools/model-shot.mjs [name] [angle] */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const name = process.argv[2] ?? 'model';
const angle = process.argv[3] ?? '0';
const view = process.env.VIEW ?? process.argv[4] ?? 'beauty';
const model = process.env.MODEL ?? 'suki';
const BASE = process.env.BASE ?? 'http://localhost:5173';
const OUT = process.env.OUT ?? 'tools/out';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-webgpu', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 720, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[PAGEERROR] ${e.message}`));
await page.goto(`${BASE}/preview.html?model=${model}&view=${view}&a=${angle}&gl=1`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__ready, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/${name}.png` });
console.log(`shot: ${OUT}/${name}.png`);
for (const l of logs.filter((x) => x.startsWith('[error]') || x.startsWith('[PAGEERROR]'))) console.log(l);
await browser.close();
