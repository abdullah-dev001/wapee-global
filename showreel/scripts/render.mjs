#!/usr/bin/env node
/**
 * One Remotion render (H.264 + lossless PCM in MKV), then master the audio and mux the MP4.
 *
 *   npm run render       → out/wapee-showreel.mp4      (1920×1080)
 *   npm run render:4k    → out/wapee-showreel-4k.mp4   (3840×2160, --scale=2)
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { master } from './master.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scale = Number((process.argv.find((a) => a.startsWith('--scale=')) ?? '--scale=1').split('=')[1]);
const passthrough = process.argv.slice(2).filter((a) => !a.startsWith('--scale='));
const out = path.join(root, 'out', scale === 2 ? 'wapee-showreel-4k.mp4' : 'wapee-showreel.mp4');
const mkv = path.join(root, 'out', '.build', scale === 2 ? 'render-4k.mkv' : 'render.mkv');
mkdirSync(path.dirname(mkv), { recursive: true });

const t0 = Date.now();
const r = spawnSync(
  'npx',
  [
    'remotion',
    'render',
    'Showreel',
    mkv,
    '--codec=h264-mkv',
    '--audio-codec=pcm-16',
    '--crf=17',
    '--x264-preset=slow',
    // Standard BT.709, limited-range yuv420p (Remotion's default here is full-range yuvj420p).
    '--color-space=bt709',
    '--pixel-format=yuv420p',
    `--scale=${scale}`,
    ...passthrough,
  ],
  { cwd: root, stdio: 'inherit' },
);
if (r.status !== 0) process.exit(r.status ?? 1);
const t1 = Date.now();
master(mkv, out);
const t2 = Date.now();
console.log(`\nRender ${((t1 - t0) / 1000).toFixed(1)} s + master ${((t2 - t1) / 1000).toFixed(1)} s = ${((t2 - t0) / 1000).toFixed(1)} s → ${path.relative(root, out)}`);
