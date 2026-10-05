import type { CSSProperties, ReactNode } from 'react';
import { C, RADIUS } from '../theme';

type Props = { children: ReactNode; tone?: 'lime' | 'success'; height?: number; style?: CSSProperties };

/** Rounded chip: lime (selected filter / industry) or success (confirmation). */
export const Pill = ({ children, tone = 'lime', height = 52, style }: Props) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      height,
      padding: `0 ${Math.round(height * 0.42)}px`,
      borderRadius: RADIUS.full,
      fontSize: Math.round(height * 0.4),
      fontWeight: 600,
      whiteSpace: 'nowrap',
      boxSizing: 'border-box',
      ...(tone === 'lime'
        ? { background: C.lime, color: C.teal }
        : { background: C.successLight, color: C.successText, border: `1px solid ${C.successBorder}` }),
      ...style,
    }}
  >
    {children}
  </div>
);
