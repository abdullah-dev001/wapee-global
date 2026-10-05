import { interpolate } from 'remotion';
import { EASE } from '../theme';

/** Eased 0→1 progress between `start` and `start + duration`. */
export const ease = (frame: number, start: number, duration: number) =>
  interpolate(frame, [start, start + duration], [0, 1], {
    easing: EASE,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

export const mix = (p: number, from: number, to: number) => from + (to - from) * p;

/** Card entrance: fade + 3% scale + lift. */
export const appear = (frame: number, start: number, lift = 56, duration = 26) => {
  const p = ease(frame, start, duration);
  return {
    opacity: p,
    transform: `translateY(${mix(p, lift, 0)}px) scale(${mix(p, 0.97, 1)})`,
  } as const;
};

/** Crossfade between two states inside a card (out then in, slight lift). */
export const stepIn = (frame: number, start: number, duration = 16) => {
  const p = ease(frame, start, duration);
  return { opacity: p, transform: `translateY(${mix(p, 16, 0)}px)` } as const;
};

export const stepOut = (frame: number, start: number, duration = 10) => {
  const p = ease(frame, start, duration);
  return { opacity: 1 - p, transform: `translateY(${mix(p, 0, -12)}px)` } as const;
};
