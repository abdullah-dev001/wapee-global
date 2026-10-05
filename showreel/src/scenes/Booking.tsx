import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, RADIUS, TYPE } from '../theme';
import { Headline } from '../components/Headline';
import { SceneFrame } from '../components/SceneFrame';
import { Card } from '../components/Card';
import { appear, ease, stepIn, stepOut } from '../components/motion';
import { PhoneStep, ServiceStep, Success, TimeStep } from './booking/Steps';

/** Local timeline, shared with the SFX cue list. */
export const BOOKING_T = {
  card: 14,
  pickService: 40,
  toTime: 60,
  pickTime: 84,
  toPhone: 100,
  type: 108,
  press: 134,
  toDone: 142,
};

const Layer = ({ style, children }: { style: React.CSSProperties; children: React.ReactNode }) => (
  <div style={{ position: 'absolute', inset: 0, ...style }}>{children}</div>
);

const visible = (frame: number, inAt: number | null, outAt: number | null) => {
  if (outAt !== null && frame >= outAt) return stepOut(frame, outAt);
  if (inAt !== null) return stepIn(frame, inAt);
  return { opacity: 1 };
};

export const Booking = () => {
  const frame = useCurrentFrame();
  const T = BOOKING_T;
  const sub = ease(frame, 24, 26);
  const progress = frame < T.toTime + 6 ? 1 : frame < T.toPhone + 6 ? 2 : 3;
  const headerFade = 1 - ease(frame, T.toDone, 12);
  return (
    <SceneFrame>
      <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '0 170px 0 160px' }}>
        <div>
          <Headline lines={[['Clients book'], [{ text: 'in seconds.', accent: true }]]} size={132} />
          <div style={{ fontSize: 32, color: C.text2, marginTop: 34, maxWidth: 620, lineHeight: 1.35, opacity: sub }}>
            A clean booking page that works on any phone, around the clock.
          </div>
        </div>
        <div style={appear(frame, T.card)}>
          <Card style={{ width: 600, height: 690, padding: 40, boxSizing: 'border-box', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, opacity: headerFade }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: RADIUS.lg,
                  background: C.teal,
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 22,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                SN
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 24, fontWeight: 600, ...TYPE.body }}>Studio Nova</div>
                <div style={{ fontSize: 18, color: C.text2 }}>Book an appointment</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 26, opacity: headerFade }}>
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  style={{ flex: 1, height: 5, borderRadius: 3, background: n <= progress ? C.teal : C.border }}
                />
              ))}
            </div>
            <div style={{ position: 'absolute', left: 40, right: 40, top: 168, bottom: 40 }}>
              {frame < T.toTime + 12 && (
                <Layer style={visible(frame, null, T.toTime)}>
                  <ServiceStep selected={ease(frame, T.pickService, 8)} />
                </Layer>
              )}
              {frame >= T.toTime && frame < T.toPhone + 12 && (
                <Layer style={visible(frame, T.toTime + 4, T.toPhone)}>
                  <TimeStep selected={ease(frame, T.pickTime, 6)} />
                </Layer>
              )}
              {frame >= T.toPhone && frame < T.toDone + 12 && (
                <Layer style={visible(frame, T.toPhone + 4, T.toDone)}>
                  <PhoneStep frame={frame} typeStart={T.type} pressAt={T.press} />
                </Layer>
              )}
            </div>
            {frame >= T.toDone && (
              <div style={{ position: 'absolute', inset: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Success frame={frame} start={T.toDone + 4} />
              </div>
            )}
          </Card>
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};
