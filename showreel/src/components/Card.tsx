import type { CSSProperties, ReactNode } from 'react';
import { C, RADIUS, SCENES, SHADOW } from '../theme';
import { useSceneTiming } from './Scene';

type Props = { children: ReactNode; style?: CSSProperties; float?: boolean };

/** White card: 1px border, large radius, layered teal-tinted shadow (stronger when it floats). */
export const Card = ({ children, style, float = false }: Props) => {
  const onTeal = SCENES[useSceneTiming().scene].tone === 'teal';
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${onTeal ? 'rgba(255, 255, 255, 0.7)' : C.border}`,
        borderRadius: RADIUS.card,
        boxShadow: onTeal ? SHADOW.onTeal : float ? SHADOW.float : SHADOW.card,
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  );
};
