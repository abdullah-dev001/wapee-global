#!/usr/bin/env node
/**
 * Render frames with ONE bundle and ONE browser, then tile them into a contact sheet.
 *
 *   npm run stills                          # whole video, every 15th frame → stills/sheet.png
 *   npm run stills -- 150 330 480           # specific frames at full size
 *   npm run stills -- --from=270 --to=420 --every=10 --sheet=calendar
 *
 * Set REMOTION_BROWSER_EXECUTABLE to use a local Chrome/Chromium instead of downloading one.
 */
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { openBrowser, renderStill, selectComposition } from '@remotion/renderer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};
const explicit = args.filter((a) => /^\d+$/.test(a)).map(Number);
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;

const serveUrl = await bundle({ entryPoint: path.join(root, 'src/index.ts'), publicDir: path.join(root, 'public') });
const browser = await openBrowser('chrome', { browserExecutable });
const composition = await selectComposition({ serveUrl, id: 'Showreel', puppeteerInstance: browser });

const every = Number(opt('every', explicit.length ? 0 : 15));
const from = Number(opt('from', 0));
const to = Number(opt('to', composition.durationInFrames - 1));
const frames = explicit.length ? explicit : Array.from({ length: Math.floor((to - from) / every) + 1 }, (_, i) => from + i * every);
const scale = Number(opt('scale', explicit.length ? 1 : 0.5));
const sheet = opt('sheet', explicit.length ? null : 'sheet');

const outDir = path.join(root, 'stills');
const tileDir = path.join(outDir, '.tiles');
mkdirSync(outDir, { recursive: true });
rmSync(tileDir, { recursive: true, force: true });
mkdirSync(tileDir, { recursive: true });

const started = Date.now();
let next = 0;
const worker = async () => {
  while (next < frames.length) {
    const i = next++;
    const frame = frames[i];
    const output = sheet ? path.join(tileDir, `t${String(i).padStart(4, '0')}.png`) : path.join(outDir, `f${frame}.png`);
    await renderStill({ composition, serveUrl, frame, output, scale, imageFormat: 'png', puppeteerInstance: browser, overwrite: true });
  }
};
await Promise.all([worker(), worker(), worker()]);
await browser.close({ silent: true });
console.log(`Rendered ${frames.length} stills in ${((Date.now() - started) / 1000).toFixed(1)}s`);

if (sheet) {
  const cols = Number(opt('cols', frames.length > 60 ? 10 : 6));
  const rows = Math.ceil(frames.length / cols);
  const fonts = ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf', '/Library/Fonts/Arial.ttf'];
  const font = fonts.find((f) => existsSync(f));
  // Label each tile with its frame number (frame = from + n * every).
  const label = font && !explicit.length
    ? `,drawtext=fontfile=${font}:text='%{eif\\:${from}+n*${every || 1}\\:d}':x=8:y=8:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=4`
    : '';
  const out = path.join(outDir, `${sheet}.png`);
  const result = spawnSync(
    'ffmpeg',
    ['-loglevel', 'error', '-y', '-framerate', '1', '-i', path.join(tileDir, 't%04d.png'), '-vf', `scale=384:216${label},tile=${cols}x${rows}:padding=4:color=0x333333`, '-frames:v', '1', out],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) {
    console.error('ffmpeg is needed for the contact sheet (stills are in stills/.tiles).');
    process.exit(1);
  }
  rmSync(tileDir, { recursive: true, force: true });
  console.log(`Contact sheet: ${path.relative(root, out)}`);
}
