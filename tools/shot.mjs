#!/usr/bin/env node
/**
 * Screenshot / smoke-test harness.
 * Usage: node tools/shot.mjs [scene ...]
 * Scenes: title levels intro play break cine complete autoplay state
 * Env: BASE (default http://localhost:5173), LEVEL (0-4)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const LEVEL = parseInt(process.env.LEVEL ?? '0', 10);
const OUT = 'tools/out';
mkdirSync(OUT, { recursive: true });

const scenes = process.argv.slice(2);
if (scenes.length === 0) scenes.push('title', 'play');

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
const [vw, vh] = (process.env.VIEW ?? '1280x720').split('x').map(Number);
const page = await browser.newPage({
  viewport: { width: vw, height: vh },
  isMobile: vw < 700,
  hasTouch: vw < 700,
});
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[PAGEERROR] ${e.message}`));

async function shot(name) {
  await page.screenshot({ path: `${OUT}/L${LEVEL}-${name}.png` });
  console.log(`shot: ${OUT}/L${LEVEL}-${name}.png`);
}

async function state() {
  return page.evaluate(() => (window.__cat ? window.__cat.state : null));
}

async function waitPhase(phase, timeout = 15000) {
  await page.waitForFunction((p) => window.__cat?.state?.phase === p, phase, { timeout });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await sleep(2500);

  for (const scene of scenes) {
    switch (scene) {
      case 'title':
        await shot('01-title');
        break;

      case 'levels':
        await page.click('#btn-levels');
        await sleep(600);
        await shot('02-levels');
        await page.click('#btn-levels-back');
        break;

      case 'intro':
        await page.evaluate((l) => window.__cat.debugStart(l - 1 >= 0 ? l : 0), LEVEL + 1);
        // debugStart jumps straight to playing; instead show intro properly:
        await page.evaluate(() => window.__cat.showIntro?.(0));
        await sleep(800);
        await shot('03-intro');
        break;

      case 'play': {
        await page.evaluate((l) => window.__cat.debugStart(l), LEVEL);
        await sleep(1200);
        await shot('04-play');
        // walk forward + push a few times
        await page.keyboard.down('KeyD');
        await sleep(700);
        await page.keyboard.up('KeyD');
        await page.keyboard.press('Space');
        await sleep(900);
        await shot('05-play-push');
        break;
      }

      case 'meow':
        await page.keyboard.press('KeyE');
        await sleep(600);
        await shot('06-meow');
        break;

      case 'break': {
        await page.evaluate((l) => window.__cat.debugStart(l), LEVEL);
        await sleep(600);
        await page.evaluate(() => window.__cat.debugBreakAll());
        await sleep(1400);
        await shot('07-break');
        await sleep(1600);
        await shot('08-break-settled');
        break;
      }

      case 'cine': {
        await page.evaluate((l) => window.__cat.debugStart(l), LEVEL);
        await sleep(600);
        await page.evaluate(() => window.__cat.debugBreakAll());
        await sleep(2500);
        await shot('09-cinematic');
        await sleep(2200);
        await shot('10-cinematic-late');
        break;
      }

      case 'complete': {
        await page.evaluate((l) => window.__cat.debugStart(l), LEVEL);
        await sleep(600);
        await page.evaluate(() => window.__cat.debugBreakAll());
        // wait for dialogue phase then click through
        await waitPhase('dialogue', 20000).catch(() => {});
        await sleep(800);
        await shot('11-dialogue');
        for (let i = 0; i < 8; i++) {
          const st = await state();
          if (st?.phase !== 'dialogue') break;
          await page.mouse.click(640, 620);
          await sleep(500);
        }
        await shot('12-complete');
        break;
      }

      case 'autoplay': {
        await page.goto(`${BASE}/?auto=1&level=${LEVEL}`, { waitUntil: 'networkidle' });
        await sleep(2000);
        // press through intro
        await page.click('#btn-intro-go').catch(() => {});
        const t0 = Date.now();
        let final = null;
        while (Date.now() - t0 < 90000) {
          const st = await state();
          if (!st) break;
          if (st.phase === 'dialogue' || st.phase === 'complete') {
            final = st;
            break;
          }
          await sleep(1000);
        }
        console.log('autoplay reached:', JSON.stringify(final));
        await shot('13-autoplay-end');
        break;
      }

      case 'state':
        console.log('state:', JSON.stringify(await state()));
        break;

      case 'ending': {
        await page.evaluate((l) => window.__cat.debugStart(l), LEVEL);
        await sleep(600);
        await page.evaluate(() => window.__cat.debugBreakAll());
        await waitPhase('dialogue', 20000).catch(() => {});
        for (let i = 0; i < 8; i++) {
          const st = await state();
          if (st?.phase !== 'dialogue') break;
          await page.mouse.click(640, 620);
          await sleep(450);
        }
        await shot('14-complete');
        await page.click('#btn-next-level');
        await sleep(1200);
        await shot('15-ending');
        console.log('state:', JSON.stringify(await state()));
        break;
      }
    }
  }

  console.log('--- console log tail ---');
  for (const l of logs.slice(-30)) console.log(l);
  const errors = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[PAGEERROR]'));
  console.log(`--- ${errors.length} errors ---`);
  for (const e of errors.slice(0, 10)) console.log(e);
} finally {
  await browser.close();
}
