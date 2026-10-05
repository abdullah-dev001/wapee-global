import type { CSSProperties } from 'react';
import { ease, mix } from './motion';

type Props = {
  frame: number;
  /** Value shown in each phase. Equal neighbours stay still. */
  words: string[];
  /** Frame each phase begins. phases[0] is the first entrance. */
  phases: readonly number[];
  delay?: number;
  frames?: number;
  style?: CSSProperties;
};

/** Masked text: the old value rises out as the next rises in at each phase change. */
export const Swap = ({ frame, words, phases, delay = 0, frames = 18, style }: Props) => {
  const runs: Array<{ word: string; from: number; to: number | null }> = [];
  words.forEach((word, i) => {
    const last = runs[runs.length - 1];
    if (last && last.word === word) return;
    if (last) last.to = phases[i] + delay;
    runs.push({ word, from: phases[i] + delay, to: null });
  });
  return (
    <span style={{ display: 'inline-grid', overflow: 'hidden', verticalAlign: 'top', paddingBottom: '0.12em', marginBottom: '-0.12em', ...style }}>
      {runs.map((r) => {
        const pin = ease(frame, r.from, frames);
        const pout = r.to === null ? 0 : ease(frame, r.to, frames * 0.75);
        const y = pout > 0 ? mix(pout, 0, -105) : mix(pin, 105, 0);
        return (
          <span key={r.word + r.from} style={{ gridArea: '1 / 1', transform: `translateY(${y}%)`, whiteSpace: 'nowrap' }}>
            {r.word}
          </span>
        );
      })}
    </span>
  );
};
