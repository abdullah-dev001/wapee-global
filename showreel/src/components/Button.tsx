import type { CSSProperties, ReactNode } from 'react';
import { C, RADIUS } from '../theme';

type Props = {
  children: ReactNode;
  variant?: 'primary' | 'lime';
  height?: number;
  fontSize?: number;
  /** 0..1, cursor hovering. */
  hover?: number;
  /** 0..1, being pressed. */
  pressed?: number;
  pill?: boolean;
  style?: CSSProperties;
};

/** App Button (DESIGN_GUIDE 12.1): primary teal or secondary lime; hover darkens, press nudges the scale. */
export const Button = ({ children, variant = 'primary', height = 56, fontSize = 20, hover = 0, pressed = 0, pill = false, style }: Props) => {
  const primary = variant === 'primary';
  const shade = Math.max(hover, pressed);
  return (
    <div
      style={{
        position: 'relative',
        height,
        padding: `0 ${Math.round(height * 0.5)}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        borderRadius: pill ? RADIUS.full : RADIUS.md,
        background: primary ? C.teal : C.lime,
        color: primary ? '#fff' : C.teal,
        fontSize,
        fontWeight: 600,
        letterSpacing: '-0.02em',
        overflow: 'hidden',
        transform: `scale(${1 - pressed * 0.03})`,
        ...style,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, background: primary ? C.tealHover : C.limeHover, opacity: shade }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10 }}>{children}</div>
    </div>
  );
};
