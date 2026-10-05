#!/usr/bin/env node
/**
 * Check the final MP4: duration, streams, size and loudness. Exits non-zero on failure.
 *
 *   npm run verify              # typecheck + this script
 *   node scripts/verify.mjs out/wapee-showreel-4k.mp4
 */
import { statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TARGET, measure } from './master.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.resolve(root, process.argv[2] ?? 'out/wapee-showreel.mp4');
const MAX_MB = 40;

const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,pix_fmt,r_frame_rate,nb_frames,sample_rate,channels,bit_rate', '-of', 'json', file], { encoding: 'utf8' });
if (probe.status !== 0) {
  console.error(`Cannot read ${file}: ${probe.stderr}`);
  process.exit(1);
}
const info = JSON.parse(probe.stdout);
const video = info.streams.find((s) => s.codec_type === 'video');
const audio = info.streams.find((s) => s.codec_type === 'audio');
const duration = Number(info.format.duration);
const mb = statSync(file).size / 1e6;
const loud = audio ? measure(file) : null;

const checks = [
  ['duration 60.0 s', Math.abs(duration - 60) < 0.05, `${duration.toFixed(3)} s`],
  ['video H.264 yuv420p 30 fps', video?.codec_name === 'h264' && video?.pix_fmt === 'yuv420p' && video?.r_frame_rate === '30/1', `${video?.codec_name} ${video?.width}×${video?.height} ${video?.pix_fmt} ${video?.r_frame_rate} (${video?.nb_frames} frames)`],
  ['audio AAC stereo', audio?.codec_name === 'aac' && audio?.channels === 2, audio ? `${audio.codec_name} ${audio.sample_rate} Hz ${audio.channels} ch ${Math.round(audio.bit_rate / 1000)} kb/s` : 'missing'],
  ['loudness -16 LUFS ±0.5', loud && Math.abs(loud.lufs - TARGET.lufs) <= TARGET.tolerance, loud ? `${loud.lufs} LUFS (LRA ${loud.lra} LU)` : 'n/a'],
  ['true peak ≤ -1 dBTP', loud && loud.truePeak <= TARGET.truePeak, loud ? `${loud.truePeak} dBTP` : 'n/a'],
  [`size < ${MAX_MB} MB (1080p)`, mb < MAX_MB || video?.width > 1920, `${mb.toFixed(1)} MB`],
];
let ok = true;
for (const [name, pass, detail] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(28)} ${detail}`);
  ok &&= Boolean(pass);
}
process.exit(ok ? 0 : 1);
