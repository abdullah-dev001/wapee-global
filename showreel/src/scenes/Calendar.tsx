import { memo } from 'react';
import { useCurrentFrame } from 'remotion';
import { CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { C, ICON, RADIUS, SHADOW, STAGGER } from '../theme';
import { T } from '../timeline';
import { BOOKING, CLIENT, STAFF } from '../content';
import { Depth, Scene } from '../components/Scene';
import { StackLayout } from '../components/Layout';
import { Card } from '../components/Card';
import { Avatar } from '../components/Avatar';
import { Toast } from '../components/Toast';
import { Cursor, type Waypoint } from '../components/Cursor';
import { appear, ease, mix } from '../components/motion';
import { AppShell, HEADER_H, SIDEBAR_W, shell } from './calendar/AppShell';

const K = T.calendar;
const WINDOW = { w: 1500, h: 676 };
const PAD = shell(24);
const PAGE_HEADER = { h: 64, gap: 18 };
const GRID = { gutter: 76, staffRow: 52, row: 66, hours: ['9:00', '10:00', '11:00', '12:00', '13:00', '14:00'] };
const COL_W = (WINDOW.w - SIDEBAR_W - PAD * 2 - 2 - GRID.gutter) / STAFF.length;
const ORIGIN = { x: SIDEBAR_W + PAD + 1 + GRID.gutter, y: HEADER_H + PAD + PAGE_HEADER.h + PAGE_HEADER.gap + 1 + GRID.staffRow + 1 };

type Block = { col: number; start: number; len: number; client: string; service: string };
const BLOCKS: Block[] = [
  { col: 0, start: 0, len: 0.75, client: 'Lena M.', service: 'Haircut & style' },
  { col: 1, start: 0.5, len: 1.5, client: 'Omar H.', service: 'Colour & gloss' },
  { col: 2, start: 0, len: 0.5, client: 'Jo P.', service: 'Beard trim' },
  { col: 2, start: 1.25, len: 1.5, client: 'Ana R.', service: 'Colour & gloss' },
  { col: 0, start: 3.5, len: 1.5, client: 'Priya R.', service: 'Colour & gloss' },
  { col: 1, start: 3.25, len: 0.75, client: 'Tom W.', service: 'Haircut & style' },
  { col: 2, start: 3, len: 0.5, client: 'Ben L.', service: 'Beard trim' },
];
/** The booking Sara just made in the previous scene. */
const LIVE: Block = { col: STAFF.indexOf(BOOKING.staff), start: BOOKING.calendarStart, len: BOOKING.service.minutes / 60, client: CLIENT.short, service: BOOKING.service.name };
const LIVE_CENTER = { x: ORIGIN.x + LIVE.col * COL_W + COL_W / 2, y: ORIGIN.y + (LIVE.start + LIVE.len / 2) * GRID.row };

const PATH: Waypoint[] = [
  { at: K.cursorIn, x: WINDOW.w - 300, y: WINDOW.h - 150 },
  { at: K.clickBlock, ...LIVE_CENTER, click: true, travel: 16 },
];

const BlockView = ({ b, p, live = false, selected = 0 }: { b: Block; p: number; live?: boolean; selected?: number }) => (
  <div
    style={{
      position: 'absolute',
      top: b.start * GRID.row + 3,
      height: b.len * GRID.row - 6,
      left: 8,
      right: 8,
      boxSizing: 'border-box',
      borderRadius: RADIUS.md,
      background: live ? C.lime : C.tealLight,
      borderLeft: `4px solid ${C.teal}`,
      padding: '5px 12px',
      color: C.teal,
      lineHeight: 1.15,
      overflow: 'hidden',
      opacity: p,
      transform: `translateY(${mix(p, 12, 0)}px) scale(${mix(p, 0.97, 1)})`,
      boxShadow: live ? `${SHADOW.float}${selected > 0 ? `, 0 0 0 ${3 * selected}px ${C.teal}` : ''}` : 'none',
    }}
  >
    <div style={{ fontSize: 17, fontWeight: 600, whiteSpace: 'nowrap' }}>{b.client}</div>
    {b.len >= 0.75 ? <div style={{ fontSize: 16, whiteSpace: 'nowrap' }}>{b.service}</div> : null}
  </div>
);

const PageHeader = memo(() => (
  <div style={{ height: PAGE_HEADER.h, marginBottom: PAGE_HEADER.gap, display: 'flex', alignItems: 'center', gap: 12 }}>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: shell(24), fontWeight: 700, letterSpacing: '-0.03em' }}>Calendar</div>
      <div style={{ fontSize: 18, color: C.text2 }}>{BOOKING.dateLong}</div>
    </div>
    {[ChevronLeft, ChevronRight].map((Icon, i) => (
      <div key={i} style={{ width: 42, height: 42, borderRadius: RADIUS.md, border: `1px solid ${C.border}`, background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={20} color={C.text2} strokeWidth={ICON.strokeWidth} />
      </div>
    ))}
    <div style={{ display: 'flex', background: C.bg, border: `1px solid ${C.border}`, borderRadius: RADIUS.lg, padding: 4, marginLeft: 6 }}>
      {['Day', 'Week'].map((v) => (
        <div
          key={v}
          style={{
            padding: '7px 20px',
            borderRadius: RADIUS.md,
            fontSize: 18,
            fontWeight: 600,
            background: v === 'Day' ? C.surface : 'transparent',
            color: v === 'Day' ? C.text : C.text2,
            border: `1px solid ${v === 'Day' ? C.border : 'transparent'}`,
          }}
        >
          {v}
        </div>
      ))}
    </div>
  </div>
));

const GridLines = memo(() => (
  <>
    <div style={{ display: 'flex', height: GRID.staffRow, borderBottom: `1px solid ${C.border}`, alignItems: 'center' }}>
      <div style={{ width: GRID.gutter }} />
      {STAFF.map((s) => (
        <div key={s} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 12 }}>
          <Avatar initials={s[0]} size={34} />
          <div style={{ fontSize: 18, fontWeight: 600 }}>{s}</div>
        </div>
      ))}
    </div>
    {GRID.hours.map((h, i) => (
      <div key={h} style={{ position: 'absolute', left: 0, right: 0, top: GRID.staffRow + 1 + i * GRID.row, height: GRID.row, display: 'flex' }}>
        <div style={{ width: GRID.gutter, fontSize: 16, color: C.text2, paddingTop: 4, paddingLeft: 14, boxSizing: 'border-box' }}>{h}</div>
        <div style={{ flex: 1, borderTop: i ? `1px solid ${C.borderSubtle}` : 'none' }} />
      </div>
    ))}
    {STAFF.map((s, col) => (
      <div key={s} style={{ position: 'absolute', top: GRID.staffRow + 1, bottom: 0, left: GRID.gutter + col * COL_W, width: 1, background: C.borderSubtle }} />
    ))}
  </>
));

export const Calendar = () => {
  const frame = useCurrentFrame();
  const live = ease(frame, K.live, 20);
  const toast = ease(frame, K.toast, 24);
  return (
    <Scene>
      <StackLayout headline={[['Your whole day,', { text: 'at a glance.', accent: true }]]} headlineAt={K.headline}>
        <div style={{ position: 'relative', width: WINDOW.w, height: WINDOW.h, ...appear(frame, K.window, 56) }}>
          <Card style={{ width: WINDOW.w, height: WINDOW.h, borderRadius: 20 }}>
            <AppShell width={WINDOW.w} height={WINDOW.h}>
              <PageHeader />
              <div
                style={{
                  position: 'relative',
                  height: GRID.staffRow + 2 + GRID.row * GRID.hours.length,
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  borderRadius: RADIUS.lg,
                  overflow: 'hidden',
                }}
              >
                <GridLines />
                {STAFF.map((s, col) => (
                  <div key={s} style={{ position: 'absolute', top: GRID.staffRow + 1, left: GRID.gutter + col * COL_W, width: COL_W, bottom: 0 }}>
                    {BLOCKS.map((b, i) => (b.col === col ? <BlockView key={b.client} b={b} p={ease(frame, K.blocks + i * STAGGER.items, 20)} /> : null))}
                    {col === LIVE.col ? <BlockView b={LIVE} p={live} live selected={ease(frame, K.clickBlock + 1, 8)} /> : null}
                  </div>
                ))}
              </div>
            </AppShell>
          </Card>
          <div style={{ position: 'absolute', right: PAD, bottom: PAD, opacity: toast, transform: `translateX(${mix(toast, 60, 0)}px)` }}>
            <Depth z={1.6}>
              <Toast Icon={CalendarCheck} title="New booking" detail={`${CLIENT.short} · ${BOOKING.time} with ${BOOKING.staff}`} />
            </Depth>
          </div>
          <Cursor path={PATH} />
        </div>
      </StackLayout>
    </Scene>
  );
};
