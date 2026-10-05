import { interpolate } from 'remotion';
import { EASE, EASE_MOVE } from '../theme';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Eased 0→1 progress between `start` and `start + duration`. */
export const ease = (frame: number, start: number, duration: number) =>
  interpolate(frame, [start, start + duration], [0, 1], { easing: EASE, ...clamp });

/** In-out 0→1 progress, for transitions and moves where both ends should be gentle. */
export const easeInOut = (frame: number, start: number, duration: number) =>
  interpolate(frame, [start, start + duration], [0, 1], { easing: EASE_MOVE, ...clamp });

/** Linear 0→1 progress, for camera drift where any easing would read as a settle. */
export const linear = (frame: number, start: number, duration: number) =>
  interpolate(frame, [start, start + duration], [0, 1], clamp);

export const mix = (p: number, from: number, to: number) => from + (to - from) * p;

/** Card entrance: fade + 3% scale + lift. */
export const appear = (frame: number, start: number, lift = 48, duration = 26) => {
  const p = ease(frame, start, duration);
  return { opacity: p, transform: `translateY(${mix(p, lift, 0)}px) scale(${mix(p, 0.97, 1)})` } as const;
};

/** Content arriving inside a card. */
export const stepIn = (frame: number, start: number, duration = 16) => {
  const p = ease(frame, start, duration);
  return { opacity: p, transform: `translateY(${mix(p, 16, 0)}px)` } as const;
};

/** Content leaving inside a card. */
export const stepOut = (frame: number, start: number, duration = 10) => {
  const p = ease(frame, start, duration);
  return { opacity: 1 - p, transform: `translateY(${mix(p, 0, -12)}px)` } as const;
};

/** Eased count-up that lands exactly on `to`, rounded to whole units. */
export const countUp = (frame: number, start: number, duration: number, to: number, unit = 1) =>
  Math.round((to * ease(frame, start, duration)) / unit) * unit;
