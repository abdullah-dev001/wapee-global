import type { CSSProperties } from 'react';
import { ease, mix } from './motion';

type Props = {
  frame: number;
  /** Word shown in each phase. Equal neighbours stay still. */
  words: string[];
  /** Frame each phase begins. phases[0] is the first entrance. */
  phases: number[];
  delay?: number;
  style?: CSSProperties;
};

/** Masked text that rises out and the next value rises in at each phase change. */
export const Swap = ({ frame, words, phases, delay = 0, style }: Props) => {
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
        const pin = ease(frame, r.from, 20);
        const pout = r.to === null ? 0 : ease(frame, r.to, 14);
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
