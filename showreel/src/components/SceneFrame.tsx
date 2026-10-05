import type { ReactNode } from 'react';
import { AbsoluteFill } from 'remotion';
import { C, FONT, TYPE } from '../theme';

/** Full-bleed scene background (teal or light) with the base font applied. */
export const SceneFrame = ({ dark = false, children }: { dark?: boolean; children: ReactNode }) => (
  <AbsoluteFill
    style={{
      background: dark ? C.teal : C.bg,
      fontFamily: FONT,
      color: dark ? '#fff' : C.text,
      ...TYPE.body,
    }}
  >
    {children}
  </AbsoluteFill>
);
