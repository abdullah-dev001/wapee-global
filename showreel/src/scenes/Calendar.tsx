import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { C, ICON, RADIUS, SHADOW } from '../theme';
import { Headline } from '../components/Headline';
import { SceneFrame } from '../components/SceneFrame';
import { Card } from '../components/Card';
import { appear, ease, mix } from '../components/motion';

const STAFF = ['Amira', 'Daniel', 'Mei'];
const HOURS = ['9:00', '10:00', '11:00', '12:00', '13:00', '14:00'];
const ROW = 84;
const GUTTER = 96;

type Block = { col: number; start: number; len: number; client: string; service: string };
const BLOCKS: Block[] = [
  { col: 0, start: 0, len: 0.75, client: 'Lena M.', service: 'Haircut & style' },
  { col: 1, start: 0.5, len: 1, client: 'Omar H.', service: 'Colour & gloss' },
  { col: 2, start: 0, len: 0.5, client: 'Jo P.', service: 'Beard trim' },
  { col: 0, start: 1.5, len: 0.75, client: 'Sara K.', service: 'Haircut & style' },
  { col: 2, start: 1.25, len: 1.5, client: 'Ana R.', service: 'Colour & gloss' },
  { col: 1, start: 4, len: 0.75, client: 'Tom W.', service: 'Haircut & style' },
  { col: 0, start: 3.5, len: 1, client: 'Priya R.', service: 'Colour & gloss' },
  { col: 2, start: 4.25, len: 0.5, client: 'Ben L.', service: 'Beard trim' },
];
const LIVE: Block = { col: 1, start: 2.5, len: 0.75, client: 'Noor A.', service: 'Haircut & style' };

const BlockView = ({ b, p, live = false }: { b: Block; p: number; live?: boolean }) => (
  <div
    style={{
      position: 'absolute',
      top: b.start * ROW + 4,
      height: b.len * ROW - 8,
      left: 8,
      right: 8,
      borderRadius: RADIUS.md + 2,
      background: live ? C.lime : C.tealLight,
      borderLeft: `4px solid ${C.teal}`,
      padding: '8px 14px',
      boxSizing: 'border-box',
      color: C.teal,
      opacity: p,
      transform: `translateY(${mix(p, 14, 0)}px) scale(${mix(p, 0.97, 1)})`,
      boxShadow: live ? SHADOW.float : 'none',
      overflow: 'hidden',
    }}
  >
    <div style={{ fontSize: 18, fontWeight: 600, whiteSpace: 'nowrap' }}>{b.client}</div>
    {b.len >= 0.75 && <div style={{ fontSize: 16, opacity: 0.8, whiteSpace: 'nowrap' }}>{b.service}</div>}
  </div>
);

/** Local timeline, shared with the SFX cue list. */
export const CALENDAR_T = { live: 84, toast: 92 } as const;

export const Calendar = () => {
  const frame = useCurrentFrame();
  const live = ease(frame, CALENDAR_T.live, 20);
  const toast = ease(frame, CALENDAR_T.toast, 26);
  return (
    <SceneFrame>
      <AbsoluteFill style={{ alignItems: 'center', paddingTop: 92 }}>
        <Headline lines={[['Your whole day,', { text: 'at a glance.', accent: true }]]} size={104} align="center" />
        <div style={{ ...appear(frame, 16, 60), marginTop: 52, position: 'relative' }}>
          <Card style={{ width: 1360, padding: '26px 32px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
              <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em' }}>Tuesday, 14 October</div>
              <div style={{ flex: 1 }} />
              {[ChevronLeft, ChevronRight].map((Icon, i) => (
                <div
                  key={i}
                  style={{ width: 42, height: 42, borderRadius: RADIUS.md, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon size={20} color={C.text2} strokeWidth={ICON.strokeWidth} />
                </div>
              ))}
              <div style={{ display: 'flex', background: C.surfaceHover, borderRadius: RADIUS.lg, padding: 4, marginLeft: 6 }}>
                {['Day', 'Week'].map((v) => (
                  <div
                    key={v}
                    style={{
                      padding: '8px 20px',
                      borderRadius: RADIUS.md,
                      fontSize: 18,
                      fontWeight: 600,
                      background: v === 'Day' ? C.surface : 'transparent',
                      color: v === 'Day' ? C.text : C.text2,
                      border: v === 'Day' ? `1px solid ${C.border}` : '1px solid transparent',
                    }}
                  >
                    {v}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, paddingBottom: 14 }}>
              <div style={{ width: GUTTER }} />
              {STAFF.map((s) => (
                <div key={s} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 12 }}>
                  <div
                    style={{ width: 38, height: 38, borderRadius: 19, background: C.tealLight, color: C.teal, fontWeight: 700, fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {s[0]}
                  </div>
                  <div style={{ fontSize: 21, fontWeight: 600 }}>{s}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', position: 'relative', height: HOURS.length * ROW }}>
              <div style={{ width: GUTTER }}>
                {HOURS.map((h) => (
                  <div key={h} style={{ height: ROW, fontSize: 16, color: C.text3, paddingTop: 6 }}>
                    {h}
                  </div>
                ))}
              </div>
              {HOURS.map((h, i) => (
                <div key={h} style={{ position: 'absolute', left: GUTTER, right: 0, top: i * ROW, borderTop: `1px solid ${C.borderSubtle}` }} />
              ))}
              {STAFF.map((s, col) => (
                <div key={s} style={{ flex: 1, position: 'relative', borderLeft: `1px solid ${C.borderSubtle}` }}>
                  {BLOCKS.map((b, i) => (b.col === col ? <BlockView key={i} b={b} p={ease(frame, 26 + i * 5, 22)} /> : null))}
                  {col === LIVE.col && <BlockView b={LIVE} p={live} live />}
                </div>
              ))}
            </div>
          </Card>
          <div
            style={{
              position: 'absolute',
              bottom: 36,
              right: -40,
              opacity: toast,
              transform: `translateX(${mix(toast, 60, 0)}px)`,
            }}
          >
            <Card style={{ width: 420, padding: '20px 22px', display: 'flex', gap: 16, alignItems: 'center', boxShadow: SHADOW.float, borderRadius: 18 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: C.lime, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <CalendarCheck size={24} color={C.teal} strokeWidth={ICON.strokeWidth} />
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 600 }}>New booking</div>
                <div style={{ fontSize: 17, color: C.text2, marginTop: 2 }}>Noor A. · 11:30 with Daniel</div>
              </div>
            </Card>
          </div>
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};
