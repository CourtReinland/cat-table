#!/usr/bin/env node
/** WebKit (Safari-proxy) smoke test with an iPhone profile. */
import { webkit, devices } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const browser = await webkit.launch({ headless: true });
const ctx = await browser.newContext({
  ...devices['iPhone 13'],
});
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[PAGEERROR] ${e.message}`));
page.on('response', (r) => {
  if (r.status() >= 400) logs.push(`HTTP ${r.status()}: ${r.url()}`);
});

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 }).catch((e) => logs.push('GOTO FAIL: ' + e.message));
await page.waitForTimeout(6000);
await page.screenshot({ path: 'tools/out/webkit-iphone.png' });
console.log('shot: tools/out/webkit-iphone.png');
console.log('--- logs ---');
for (const l of logs.slice(0, 30)) console.log(l);
const state = await page.evaluate(() => (window.__cat ? window.__cat.state : 'no __cat'));
console.log('state:', JSON.stringify(state));
const loading = await page.evaluate(() => document.querySelector('#screen-loading .loading-text')?.textContent);
console.log('loading text:', loading);
await browser.close();
