import type { ReactNode } from 'react';
import { C, RADIUS, ui } from '../theme';

type Tone = 'success' | 'warning' | 'primary';

const TONES: Record<Tone, { bg: string; fg: string; border: string }> = {
  success: { bg: C.successLight, fg: C.successText, border: C.successBorder },
  warning: { bg: C.warningLight, fg: C.warning, border: C.warningBorder },
  primary: { bg: C.tealLight, fg: C.teal, border: C.tealLight },
};

/** Status pill per DESIGN_GUIDE 12.16 (11px/600, tinted, 1px border), drawn at UI scale. */
export const Badge = ({ tone, children, dot = false }: { tone: Tone; children: ReactNode; dot?: boolean }) => {
  const t = TONES[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: ui(5),
        padding: `${ui(3)}px ${ui(8)}px`,
        fontSize: ui(11),
        fontWeight: 600,
        lineHeight: 1.3,
        whiteSpace: 'nowrap',
        borderRadius: RADIUS.full,
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.border}`,
      }}
    >
      {dot ? <span style={{ width: ui(6), height: ui(6), borderRadius: RADIUS.full, background: 'currentColor' }} /> : null}
      {children}
    </span>
  );
};
