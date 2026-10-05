import type { LucideIcon } from 'lucide-react';
import { C, ICON, RADIUS } from '../theme';

type Props = { Icon: LucideIcon; size?: number; tone?: 'teal' | 'lime' | 'white' };

const TONES = {
  teal: { bg: C.tealLight, fg: C.teal },
  lime: { bg: C.lime, fg: C.teal },
  white: { bg: C.surface, fg: C.teal },
} as const;

/** Icon in a tinted rounded square (StatCard icon tile, DESIGN_GUIDE 12.14). */
export const IconTile = ({ Icon, size = 52, tone = 'teal' }: Props) => (
  <div
    style={{
      width: size,
      height: size,
      flexShrink: 0,
      borderRadius: RADIUS.md,
      background: TONES[tone].bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <Icon size={Math.round(size * 0.46)} color={TONES[tone].fg} strokeWidth={ICON.strokeWidth} />
  </div>
);
