import { C, RADIUS } from '../theme';

type Props = { initials: string; size: number; square?: boolean; tone?: 'light' | 'dark' };

/** User initials (circle) or business avatar (rounded square), DESIGN_GUIDE 12.27. */
export const Avatar = ({ initials, size, square = false, tone = 'light' }: Props) => (
  <div
    style={{
      width: size,
      height: size,
      flexShrink: 0,
      borderRadius: square ? RADIUS.md : RADIUS.full,
      background: tone === 'dark' ? C.tealLine : C.tealLight,
      color: tone === 'dark' ? C.lime : C.teal,
      fontSize: Math.round(size * (square ? 0.42 : 0.4)),
      fontWeight: 600,
      letterSpacing: '-0.02em',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    {initials}
  </div>
);
