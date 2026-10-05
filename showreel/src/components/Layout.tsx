import type { ReactNode } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, SAFE, SCENES, TYPE } from '../theme';
import { Headline, type Segment } from './Headline';
import { Depth, useSceneTiming } from './Scene';
import { ease, mix } from './motion';

type HeadlineProps = { headline: Segment[][]; headlineAt: number };

/** Supporting line under a side headline: one body size, balanced wrapping. */
const Sub = ({ children, at }: { children: string; at: number }) => {
  const frame = useCurrentFrame();
  const { scene } = useSceneTiming();
  const p = ease(frame, at, 26);
  return (
    <div
      style={{
        fontSize: TYPE.body,
        lineHeight: 1.35,
        color: SCENES[scene].tone === 'teal' ? C.tealMuted : C.text2,
        marginTop: 32,
        maxWidth: 540,
        textWrap: 'balance',
        opacity: p,
        transform: `translateY(${mix(p, 12, 0)}px)`,
      }}
    >
      {children}
    </div>
  );
};

/** Two-line headline (and optional sub) on the left, the hero UI on the right. */
export const SplitLayout = ({
  headline,
  headlineAt,
  sub,
  subAt = headlineAt + 18,
  children,
}: HeadlineProps & { sub?: string; subAt?: number; children: ReactNode }) => {
  const { scene } = useSceneTiming();
  return (
    <AbsoluteFill
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: `0 ${SAFE.x}px`, gap: 64 }}
    >
      <Depth z={0.8}>
        <Headline lines={headline} start={headlineAt} tone={SCENES[scene].tone} />
        {sub ? <Sub at={subAt}>{sub}</Sub> : null}
      </Depth>
      <Depth z={1.1}>{children}</Depth>
    </AbsoluteFill>
  );
};

/** One-line centred headline with the hero UI below. Teal scenes get a soft glow behind the hero. */
export const StackLayout = ({ headline, headlineAt, children, gap = 56 }: HeadlineProps & { children: ReactNode; gap?: number }) => {
  const { scene } = useSceneTiming();
  const tone = SCENES[scene].tone;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: `${SAFE.y}px ${SAFE.x}px`, gap }}>
      {tone === 'teal' ? <Glow /> : null}
      <Depth z={0.8}>
        <Headline lines={headline} start={headlineAt} tone={tone} align="center" />
      </Depth>
      <Depth z={1.1}>{children}</Depth>
    </AbsoluteFill>
  );
};

/** Restrained radial light behind hero cards. Teal scenes only. */
const Glow = ({ top = '58%' }: { top?: string }) => (
  <Depth z={0.6} style={{ position: 'absolute', left: '50%', top, width: 0, height: 0 }}>
    <div
      style={{
        position: 'absolute',
        width: 1700,
        height: 1000,
        left: -850,
        top: -500,
        background: `radial-gradient(closest-side, rgba(${C.tealGlow}, 0.28), rgba(${C.tealGlow}, 0.1) 55%, rgba(${C.tealGlow}, 0))`,
      }}
    />
  </Depth>
);
