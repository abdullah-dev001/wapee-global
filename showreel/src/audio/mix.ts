import { interpolate } from 'remotion';
import { SCENE_ORDER, VIDEO } from '../theme';
import { abs, transitionFrames, transitionInto } from '../timeline';
import { VO, voMaxFrames, voStart } from '../voiceover';
import { IMPACTS } from './cues';

export const db = (x: number) => 10 ** (x / 20);

/**
 * Bus gains in dB. One-shot SFX peak at -3 dBFS, so the SFX bus puts the loudest near -6 dBFS.
 * The bed file is -20 dBFS RMS, so the bed bus puts it near -30 dBFS. The master step
 * (scripts/master.mjs) then normalises the whole mix to -16 LUFS / -1 dBTP.
 */
export const BUS = { bed: -10, sfx: -3, music: -8, vo: 0 } as const;

export const BED = {
  file: 'sfx/bed.wav',
  loopFrames: 360,
  /** Optional soft 75 BPM pulse under the bed. Off by default. */
  pulse: false,
  pulseFile: 'sfx/bed-pulse.wav',
  pulseLoopFrames: 144,
  pulseDb: -12,
} as const;

const DUCK = { impactTo: db(-6), attack: 2, hold: 6, release: 26 } as const;
const SWELL = db(3);

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const plateau = (f: number, a: number, b: number, c: number, d: number) => interpolate(f, [a, b, c, d], [0, 1, 1, 0], clamp);
const lerp = (p: number, from: number, to: number) => from + (to - from) * p;

export type VoTiming = Array<{ start: number; frames: number }>;

/** Where each voice line plays: its measured length, capped so it never runs into the next line. */
export const voTiming = (voFrames: number[] | null): VoTiming =>
  VO.enabled ? VO.lines.map((l, i) => ({ start: voStart(l), frames: Math.min(voFrames?.[i] ?? voMaxFrames(l), voMaxFrames(l) + 16) })) : [];

/** Bed and music dip under each voice line (smooth ramps) and briefly under big impacts. */
const duck = (f: number, vo: VoTiming) => {
  let gain = 1;
  for (const { start, frames } of vo) {
    gain = Math.min(gain, lerp(plateau(f, start - VO.duckRamp, start, start + frames, start + frames + VO.duckRamp), 1, VO.duckTo));
  }
  for (const c of IMPACTS) {
    const at = abs(c.scene, c.frame);
    gain = Math.min(gain, lerp(plateau(f, at - DUCK.attack, at, at + DUCK.hold, at + DUCK.hold + DUCK.release), 1, DUCK.impactTo));
  }
  return gain;
};

/** Middle of every transition where the background tone changes: the bed swells gently there. */
const TONE_CHANGES = SCENE_ORDER.filter((k) => {
  const type = transitionInto(k);
  return type === 'scale' || type === 'fade';
}).map((k) => abs(k, Math.round(transitionFrames(transitionInto(k)) / 2)));

const swell = (f: number) => TONE_CHANGES.reduce((g, at) => Math.max(g, lerp(plateau(f, at - 14, at + 2, at + 6, at + 40), 1, SWELL)), 1);

const end = VIDEO.durationInFrames;

/** Volume curves for the bed and music, given where the voice lines play. */
export const createMix = (vo: VoTiming) => ({
  bedVolume: (f: number) => db(BUS.bed) * interpolate(f, [0, 30, end - 75, end], [0, 1, 1, 0], clamp) * swell(f) * duck(f, vo),
  musicVolume: (f: number) => db(BUS.music) * interpolate(f, [0, 20, end - 45, end], [0, 1, 1, 0], clamp) * duck(f, vo),
});

export const sfxVolume = (cueDb: number) => db(BUS.sfx + cueDb);

export const voVolume = db(BUS.vo) * VO.volume;
