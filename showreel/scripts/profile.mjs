#!/usr/bin/env node
/**
 * Time every Nth frame and report the average cost per scene, to find slow layers.
 *
 *   node scripts/profile.mjs            # every 3rd frame
 *   node scripts/profile.mjs --every=1
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { openBrowser, renderFrames, selectComposition } from '@remotion/renderer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const every = Number((process.argv.find((a) => a.startsWith('--every=')) ?? '--every=3').split('=')[1]);

// Scene lengths, read from theme.ts so this stays in sync without compiling TypeScript.
const theme = readFileSync(path.join(root, 'src/theme.ts'), 'utf8');
const scenes = [...theme.matchAll(/^\s+(\w+): \{ frames: (\d+), tone:/gm)].map(([, name, frames]) => ({ name, frames: Number(frames) }));

const serveUrl = await bundle({ entryPoint: path.join(root, 'src/index.ts'), publicDir: path.join(root, 'public') });
const browser = await openBrowser('chrome', { browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE || null });
const composition = await selectComposition({ serveUrl, id: 'Showreel', puppeteerInstance: browser });
const outputDir = mkdtempSync(path.join(os.tmpdir(), 'showreel-profile-'));

const times = new Map();
const started = Date.now();
await renderFrames({
  composition,
  serveUrl,
  outputDir,
  imageFormat: 'jpeg',
  everyNthFrame: every,
  puppeteerInstance: browser,
  onStart: () => undefined,
  onFrameUpdate: (_, frame, ms) => times.set(frame, ms),
  inputProps: {},
});
await browser.close({ silent: true });
rmSync(outputDir, { recursive: true, force: true });

let from = 0;
console.log(`${'scene'.padEnd(14)} ${'avg ms'.padStart(7)} ${'max ms'.padStart(7)}  slowest`);
for (const s of scenes) {
  const rows = [...times].filter(([f]) => f >= from && f < from + s.frames);
  const avg = rows.reduce((a, [, ms]) => a + ms, 0) / Math.max(rows.length, 1);
  const [slowF, slowMs] = rows.reduce((m, r) => (r[1] > m[1] ? r : m), [0, 0]);
  console.log(`${s.name.padEnd(14)} ${avg.toFixed(0).padStart(7)} ${slowMs.toFixed(0).padStart(7)}  frame ${slowF}`);
  from += s.frames;
}
const all = [...times.values()];
console.log(`\n${all.length} frames, mean ${(all.reduce((a, b) => a + b, 0) / all.length).toFixed(0)} ms, wall ${((Date.now() - started) / 1000).toFixed(1)} s`);
