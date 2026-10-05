import type { CSSProperties } from 'react';
import { useCurrentFrame } from 'remotion';
import { C, TYPE } from '../theme';
import { ease, mix } from './motion';

export type Segment = string | { text: string; accent: true };

type Props = {
  /** One array of segments per line. An accent segment should be a phrase, not a lone word. */
  lines: Segment[][];
  size: number;
  color?: string;
  accent?: string;
  start?: number;
  stagger?: number;
  align?: CSSProperties['textAlign'];
};

/** Headline whose words rise out of a mask, staggered. */
export const Headline = ({
  lines,
  size,
  color = C.text,
  accent = C.teal,
  start = 6,
  stagger = 4,
  align = 'left',
}: Props) => {
  const frame = useCurrentFrame();
  let index = 0;
  return (
    <div style={{ fontSize: size, color, textAlign: align, ...TYPE.headline }}>
      {lines.map((line, li) => (
        <div key={li} style={{ display: 'block', whiteSpace: 'nowrap' }}>
          {line.flatMap((seg, si) => {
            const isAccent = typeof seg !== 'string';
            const text = typeof seg === 'string' ? seg : seg.text;
            return text
              .split(' ')
              .filter(Boolean)
              .map((word, wi) => {
                const p = ease(frame, start + index++ * stagger, 26);
                return (
                  <span
                    key={`${si}-${wi}`}
                    style={{
                      display: 'inline-block',
                      overflow: 'hidden',
                      verticalAlign: 'top',
                      paddingBottom: '0.12em',
                      marginBottom: '-0.12em',
                      marginLeft: si === 0 && wi === 0 ? 0 : '0.24em',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        transform: `translateY(${mix(p, 105, 0)}%)`,
                        color: isAccent ? accent : color,
                      }}
                    >
                      {word}
                    </span>
                  </span>
                );
              });
          })}
        </div>
      ))}
    </div>
  );
};

/** Number of words in a headline, to time what follows it. */
export const wordCount = (lines: Segment[][]) =>
  lines.flat().reduce((n, s) => n + (typeof s === 'string' ? s : s.text).split(' ').filter(Boolean).length, 0);
