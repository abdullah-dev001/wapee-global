import type { CSSProperties, ReactNode } from 'react';
import { C, RADIUS } from '../theme';

type Props = {
  children: ReactNode;
  variant?: 'primary' | 'lime';
  height?: number;
  fontSize?: number;
  pressed?: number;
  style?: CSSProperties;
};

/** Mock of the app Button. `pressed` (0..1) darkens and nudges the scale. */
export const Button = ({ children, variant = 'primary', height = 56, fontSize = 20, pressed = 0, style }: Props) => {
  const base = variant === 'primary' ? C.teal : C.lime;
  const hover = variant === 'primary' ? C.tealHover : '#c4eb1a';
  return (
    <div
      style={{
        height,
        padding: `0 ${height * 0.5}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        borderRadius: variant === 'lime' ? RADIUS.full : RADIUS.md + 4,
        background: pressed > 0.5 ? hover : base,
        color: variant === 'primary' ? '#fff' : C.teal,
        fontSize,
        fontWeight: 600,
        letterSpacing: '-0.02em',
        transform: `scale(${1 - pressed * 0.025})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
