import type { CSSProperties } from 'react';
import { useCurrentFrame } from 'remotion';
import { C, STAGGER, TYPE, type Tone } from '../theme';
import { ease, mix } from './motion';

export type Segment = string | { text: string; accent: true };

type Props = {
  /** One array of segments per line (max two lines). Accent a phrase, never a lone word. */
  lines: Segment[][];
  start: number;
  tone?: Tone;
  size?: number;
  align?: CSSProperties['textAlign'];
};

const RISE = 26;

/** Headline whose words rise out of a mask, staggered. */
export const Headline = ({ lines, start, tone = 'light', size = TYPE.headline, align = 'left' }: Props) => {
  const frame = useCurrentFrame();
  const color = tone === 'teal' ? '#fff' : C.text;
  const accent = tone === 'teal' ? C.lime : C.teal;
  let index = 0;
  return (
    <div
      style={{
        fontSize: size,
        color,
        textAlign: align,
        // Optical alignment: pull large type left by its side bearing so it lines up with body text.
        marginLeft: align === 'left' ? '-0.05em' : 0,
        ...TYPE.headlineStyle,
      }}
    >
      {lines.map((line, li) => (
        <div key={li} style={{ whiteSpace: 'nowrap' }}>
          {line.flatMap((seg, si) => {
            const isAccent = typeof seg !== 'string';
            const text = typeof seg === 'string' ? seg : seg.text;
            return text
              .split(' ')
              .filter(Boolean)
              .map((word, wi) => {
                const p = ease(frame, start + index++ * STAGGER.words, RISE);
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
