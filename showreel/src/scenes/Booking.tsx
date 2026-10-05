import type { CSSProperties, ReactNode } from 'react';
import { useCurrentFrame } from 'remotion';
import { C } from '../theme';
import { T, typedCount } from '../timeline';
import { BUSINESS, CLIENT } from '../content';
import { Scene } from '../components/Scene';
import { SplitLayout } from '../components/Layout';
import { Card } from '../components/Card';
import { Avatar } from '../components/Avatar';
import { Cursor, hoverAt, pressAt, type Waypoint } from '../components/Cursor';
import { appear, ease, stepIn, stepOut } from '../components/motion';
import { CARD, CONTENT_TOP, PhoneStep, ServiceStep, Success, TARGETS, TimeStep } from './booking/Steps';

const B = T.booking;

const PATH: Waypoint[] = [
  { at: B.cursorIn, x: CARD.w - 70, y: CARD.h - 40 },
  { at: B.clickService, ...TARGETS.service, click: true, travel: 14 },
  { at: B.clickTime, ...TARGETS.time, click: true, travel: 14 },
  { at: B.clickPhone, ...TARGETS.phone, click: true, travel: 8 },
  { at: B.clickConfirm, ...TARGETS.confirm, click: true, travel: 10 },
];

const Layer = ({ style, children }: { style: CSSProperties; children: ReactNode }) => (
  <div style={{ position: 'absolute', left: CARD.pad, right: CARD.pad, top: CONTENT_TOP, ...style }}>{children}</div>
);

/** In from `inAt`, out at `outAt`. */
const visible = (frame: number, inAt: number | null, outAt: number | null): CSSProperties => {
  if (outAt !== null && frame >= outAt) return stepOut(frame, outAt);
  return inAt === null ? { opacity: 1 } : stepIn(frame, inAt);
};

const STEP_STARTS = [B.card + 8, B.toTime, B.toPhone];

export const Booking = () => {
  const frame = useCurrentFrame();
  const header = 1 - ease(frame, B.booked, 12);
  return (
    <Scene>
      <SplitLayout
        headline={[['Clients book'], [{ text: 'in seconds.', accent: true }]]}
        headlineAt={B.headline}
        sub="A clean booking page that works on any phone, around the clock."
        subAt={B.sub}
      >
        <div style={{ position: 'relative', width: CARD.w, height: CARD.h, ...appear(frame, B.card) }}>
          <Card style={{ width: CARD.w, height: CARD.h, padding: CARD.pad, boxSizing: 'border-box', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, opacity: header }}>
              <Avatar initials={BUSINESS.initials} size={56} square />
              <div>
                <div style={{ fontSize: 24, fontWeight: 600 }}>{BUSINESS.name}</div>
                <div style={{ fontSize: 18, color: C.text2 }}>Book an appointment</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 28, opacity: header }}>
              {STEP_STARTS.map((at) => (
                <div key={at} style={{ flex: 1, height: 6, borderRadius: 3, background: C.border, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: C.teal, transformOrigin: 'left', transform: `scaleX(${ease(frame, at, 18)})` }} />
                </div>
              ))}
            </div>
            {frame < B.toTime + 12 && (
              <Layer style={visible(frame, null, B.toTime)}>
                <ServiceStep selected={ease(frame, B.clickService + 1, 6)} hover={hoverAt(frame, PATH, TARGETS.service.x, TARGETS.service.y, 120)} />
              </Layer>
            )}
            {frame >= B.toTime && frame < B.toPhone + 12 && (
              <Layer style={visible(frame, B.toTime + 4, B.toPhone)}>
                <TimeStep selected={ease(frame, B.clickTime + 1, 6)} />
              </Layer>
            )}
            {frame >= B.toPhone && frame < B.booked + 12 && (
              <Layer style={visible(frame, B.toPhone + 4, B.booked)}>
                <PhoneStep
                  frame={frame}
                  typed={typedCount(frame, B.typeStart, B.keyFrames, CLIENT.phone.length)}
                  focused={frame >= B.clickPhone + 1 && frame < B.clickConfirm}
                  hover={hoverAt(frame, PATH, TARGETS.confirm.x, TARGETS.confirm.y, 80)}
                  pressed={pressAt(frame, B.clickConfirm)}
                />
              </Layer>
            )}
            {frame >= B.booked && (
              <div style={{ position: 'absolute', inset: CARD.pad, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Success frame={frame} start={B.booked + 4} linkAt={B.linkSent} />
              </div>
            )}
          </Card>
          <Cursor path={PATH} hideAt={B.booked + 6} />
        </div>
      </SplitLayout>
    </Scene>
  );
};
