#!/usr/bin/env node
/**
 * GS-ROOM-DETAIL stills: play OTS + isolation (HUD/cat/smashables off).
 * Usage: node tools/gs-room-detail-shot.mjs [prefix]
 * Env: BASE (default http://127.0.0.1:5173), OUT, VIEW
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:5173/?gl=1';
const OUT = process.env.OUT ?? 'tools/out/gs-room-detail';
const PREFIX = process.argv[2] ?? 'gs-b12';
mkdirSync(OUT, { recursive: true });

const LEVELS = [
  { id: 'kitchen', i: 0 },
  { id: 'coffee', i: 1 },
  { id: 'desk', i: 2 },
  { id: 'dresser', i: 3 },
  { id: 'dining', i: 4 },
];

const browser = await chromium.launch({
  headless: true,
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan',
    '--ignore-gpu-blocklist',
    '--use-gl=angle',
    '--use-angle=swiftshader-webgl',
  ],
});
const [vw, vh] = (process.env.VIEW ?? '1280x720').split('x').map(Number);
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console.error]', m.text());
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setIso(hide) {
  await page.evaluate((off) => {
    const g = window.__cat;
    const apt = g?.apartment;
    if (apt?.cat?.setVisible) apt.cat.setVisible(!off);
    else if (apt?.cat?.group) apt.cat.group.visible = !off;
    if (apt?.boyfriend?.group) apt.boyfriend.group.visible = !off;
    for (const b of apt?.physics?.bodies ?? []) {
      if (b?.group) b.group.visible = !off;
    }
    const hud = document.getElementById('hud');
    if (hud) {
      hud.classList.toggle('visible', !off);
      hud.style.display = off ? 'none' : '';
    }
  }, hide);
  await sleep(280);
}

try {
  for (const { id, i } of LEVELS) {
    // Fresh page per level — loadLevel dispose races WebGPU on a hot reload.
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
    await sleep(2200);
    await page.evaluate((l) => window.__cat.debugStart(l), i);
    await sleep(2200);
    const st = await page.evaluate(() => window.__cat.state);
    console.log(id, 'phase', st?.phase, 'webgpu', st?.webgpu, 'cat', st?.cat);

    await page.screenshot({ path: `${OUT}/${PREFIX}-${id}-ots.png` });
    console.log('shot', `${PREFIX}-${id}-ots.png`);

    await setIso(true);
    await page.screenshot({ path: `${OUT}/${PREFIX}-${id}-iso.png` });
    console.log('shot', `${PREFIX}-${id}-iso.png`);
    await setIso(false);

    await page.keyboard.down('KeyD');
    await sleep(700);
    await page.keyboard.up('KeyD');
    await sleep(500);
    await page.screenshot({ path: `${OUT}/${PREFIX}-${id}-walked.png` });
    console.log('shot', `${PREFIX}-${id}-walked.png`);
  }
} finally {
  await browser.close();
}
