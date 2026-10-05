#!/usr/bin/env node
/**
 * Master the rendered mix and mux the final MP4.
 *
 *   node scripts/master.mjs <render.mkv> <out.mp4>
 *
 * Two passes: measure EBU R128 loudness, then apply one gain to reach -16 LUFS
 * integrated and a 4×-oversampled lookahead limiter so true peak stays ≤ -1 dBTP
 * (limit -1.5 dBFS leaves room for AAC encoding). Re-measures the AAC result and
 * nudges once if needed. Video is copied untouched; audio → AAC 192k; +faststart.
 */
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const TARGET = { lufs: -16, truePeak: -1, tolerance: 0.5 };
const LIMIT_DB = -1.5;

const ffmpeg = (args, capture = false) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`ffmpeg failed:\n${r.stderr.slice(-2000)}`);
  return capture ? r.stderr : '';
};

/** Integrated loudness, true peak and LRA via ffmpeg's ebur128 filter. */
export const measure = (file) => {
  const log = ffmpeg(['-i', file, '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', '-'], true);
  const summary = log.slice(log.lastIndexOf('Summary:'));
  const num = (re) => Number(summary.match(re)?.[1]);
  return { lufs: num(/I:\s+(-?[\d.]+) LUFS/), lra: num(/LRA:\s+(-?[\d.]+) LU/), truePeak: num(/Peak:\s+(-?[\d.]+) dBFS/) };
};

const master = (input, output) => {
  const work = path.join(path.dirname(output), '.build');
  mkdirSync(work, { recursive: true });
  const wav = path.join(work, 'mastered.wav');
  const before = measure(input);
  console.log(`Pre-master:  ${before.lufs} LUFS, true peak ${before.truePeak} dBTP, LRA ${before.lra} LU`);

  let gain = TARGET.lufs - before.lufs;
  let after = null;
  for (let pass = 1; pass <= 3; pass++) {
    const limit = 10 ** (LIMIT_DB / 20);
    ffmpeg([
      '-y', '-i', input, '-map', '0:a:0',
      '-af', `volume=${gain.toFixed(2)}dB,aresample=192000,alimiter=limit=${limit.toFixed(4)}:attack=5:release=60:level=disabled,aresample=48000`,
      '-c:a', 'pcm_s24le', wav,
    ]);
    ffmpeg(['-y', '-i', input, '-i', wav, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', output]);
    after = measure(output);
    console.log(`Pass ${pass}: gain ${gain.toFixed(2)} dB → ${after.lufs} LUFS, true peak ${after.truePeak} dBTP`);
    const off = TARGET.lufs - after.lufs;
    if (Math.abs(off) <= 0.2 && after.truePeak <= TARGET.truePeak) break;
    gain += off;
  }
  rmSync(wav, { force: true });
  return { before, after };
};

if (process.argv[1] && process.argv[1].endsWith('master.mjs')) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error('Usage: node scripts/master.mjs <render.mkv> <out.mp4>');
    process.exit(1);
  }
  master(input, output);
}

export { master };
