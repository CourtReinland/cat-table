import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { SUKI_COAT } from './sukiGlb.ts';

const here = dirname(fileURLToPath(import.meta.url));
const toon = readFileSync(join(here, 'Toon.ts'), 'utf8');

function hexRgb(hex: number) {
  return { r: (hex >> 16) & 255, g: (hex >> 8) & 255, b: hex & 255 };
}

function luma(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

describe('GS-PLAY-ART Suki fluff stays paper white', () => {
  const hexMatch = toon.match(/SUKI_FLUFF_HEX = (0x[0-9a-fA-F]+)/);
  const gradMatch = toon.match(
    /SUKI_FLUFF_GRADIENT = \[\s*(\d+),\s*(\d+),\s*(\d+),\s*255,\s*(\d+),\s*(\d+),\s*(\d+),\s*255,\s*(\d+),\s*(\d+),\s*(\d+),\s*255,?\s*\]/s,
  );

  it('exports a cooler paper-white coat, not cream 0xf4f1ee', () => {
    assert.ok(hexMatch, 'SUKI_FLUFF_HEX missing');
    const hex = Number(hexMatch![1]);
    const { r, g, b } = hexRgb(hex);
    assert.notEqual(hex, 0xf4f1ee);
    assert.ok(b >= r, `FLUFF ${hexMatch![1]} is still warm cream (R=${r} B=${b})`);
    assert.ok(luma(r, g, b) >= 240, `FLUFF luma ${luma(r, g, b).toFixed(1)} is graphite, not paper`);
    assert.ok(r >= 240 && g >= 240 && b >= 240, 'paper white must stay high-value');
  });

  it('raises fluff gradient shadow/mid so night bands stay white, not grey-lavender', () => {
    assert.ok(gradMatch, 'SUKI_FLUFF_GRADIENT missing');
    const nums = gradMatch!.slice(1, 10).map(Number);
    const [sr, sg, sb, mr, mg, mb, lr, lg, lb] = nums;
    // BUILD 6 miss: 176,174,180 — too dark + B-heavy lavender under the lamp
    assert.ok(sr !== 176 || sg !== 174 || sb !== 180);
    assert.ok(sr >= 210 && sg >= 210 && sb >= 210, `shadow ${sr},${sg},${sb} still grey-lavender`);
    assert.ok(sb >= sr, `shadow ${sr},${sg},${sb} leans peach`);
    assert.ok(mr >= 230 && mg >= 230 && mb >= 230, `mid ${mr},${mg},${mb} too dark`);
    assert.ok(lr >= 245 && lg >= 245 && lb >= 245, `lit ${lr},${lg},${lb} not paper`);
    assert.ok(luma(sr, sg, sb) >= 210, `shadow luma ${luma(sr, sg, sb).toFixed(1)}`);
    assert.ok(luma(sr, sg, sb) < luma(lr, lg, lb), 'need a real band, not a flat sheet');
  });

  it('keeps identity mask and refuses Hunyuan albedo as map / ink hull', () => {
    assert.equal(SUKI_COAT.keepAlbedo, false);
    assert.equal(SUKI_COAT.useFluffShader, true);
    assert.equal(SUKI_COAT.identityFromAlbedo, true);
    assert.equal(SUKI_COAT.skipOutline, true);
    const fluffFn = toon.slice(toon.indexOf('function sukiFluffMaterial'), toon.indexOf('export function toonifySukiCoat'));
    const coatFn = toon.slice(toon.indexOf('export function toonifySukiCoat'), toon.indexOf('const outlineMats'));
    assert.match(fluffFn, /step\(float\(0\.14\), chroma\)/);
    assert.match(fluffFn, /step\(float\(0\.28\), luma\)/);
    assert.match(fluffFn, /mix\(tslColor\(FLUFF\), rgb, ident\)/);
    assert.match(fluffFn, /Never assign Hunyuan maps/);
    assert.doesNotMatch(fluffFn, /m\.map\s*=/);
    assert.doesNotMatch(coatFn, /outlineCharacter\(/);
  });
});
