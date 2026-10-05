import type { CSSProperties, ReactNode } from 'react';
import { C, RADIUS, SHADOW } from '../theme';

type Props = { children: ReactNode; style?: CSSProperties; onTeal?: boolean };

/** White card: 1px border, large radius, soft teal-tinted shadow. */
export const Card = ({ children, style, onTeal = false }: Props) => (
  <div
    style={{
      background: C.surface,
      border: `1px solid ${onTeal ? 'rgba(255,255,255,0.6)' : C.border}`,
      borderRadius: RADIUS.card,
      boxShadow: onTeal ? SHADOW.onTeal : SHADOW.card,
      overflow: 'hidden',
      ...style,
    }}
  >
    {children}
  </div>
);
