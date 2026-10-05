import type { ReactNode } from 'react';
import { C, RADIUS } from '../theme';

type Tone = 'success' | 'warning' | 'neutral' | 'primary';

const tones: Record<Tone, { bg: string; fg: string; border: string }> = {
  success: { bg: C.successLight, fg: '#047857', border: C.successBorder },
  warning: { bg: C.warningLight, fg: C.warning, border: C.warningBorder },
  neutral: { bg: C.surfaceHover, fg: C.text2, border: C.border },
  primary: { bg: C.tealLight, fg: C.teal, border: C.tealLight },
};

export const Badge = ({ tone, children, size = 18 }: { tone: Tone; children: ReactNode; size?: number }) => {
  const t = tones[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: `${size * 0.3}px ${size * 0.7}px`,
        fontSize: size,
        fontWeight: 600,
        lineHeight: 1.2,
        letterSpacing: '-0.01em',
        borderRadius: RADIUS.full,
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.border}`,
      }}
    >
      {children}
    </span>
  );
};
