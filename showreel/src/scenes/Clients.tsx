import { useCurrentFrame } from 'remotion';
import { Mail, Phone, Search, StickyNote } from 'lucide-react';
import { C, ICON, RADIUS, STAGGER, ui } from '../theme';
import { T, typedCount } from '../timeline';
import { BOOKING, CLIENT, SEARCH_QUERY as QUERY } from '../content';
import { Scene } from '../components/Scene';
import { SplitLayout } from '../components/Layout';
import { Card } from '../components/Card';
import { Avatar } from '../components/Avatar';
import { Badge } from '../components/Badge';
import { Divider } from '../components/Divider';
import { appear, ease, easeInOut, mix, stepIn } from '../components/motion';

const K = T.clients;

const RESULTS = [
  { name: CLIENT.name, initials: CLIENT.initials, last: `Last visit ${BOOKING.date}` },
  { name: 'Lena Moretti', initials: 'LM', last: 'Last visit 9 Oct' },
  { name: 'Sarah Lee', initials: 'SL', last: 'Last visit 2 Oct' },
  { name: 'Omar Haddad', initials: 'OH', last: 'Last visit 28 Sep' },
  { name: 'Sam Ortiz', initials: 'SO', last: 'Last visit 21 Sep' },
  { name: 'Ana Ribeiro', initials: 'AR', last: 'Last visit 19 Sep' },
  { name: 'Priya Rao', initials: 'PR', last: 'Last visit 12 Sep' },
];

const CARD = { w: 660, pad: 36, search: 60, listGap: 14, row: 72, profile: 690 };

const VISITS = [
  { date: BOOKING.date, service: BOOKING.service.name, staff: BOOKING.staff },
  { date: '16 Sep', service: 'Colour & gloss', staff: 'Mei' },
  { date: '12 Aug', service: 'Haircut & style', staff: 'Amira' },
];

/** Frame a name stops matching the query being typed. */
const missAt = (name: string) => {
  let i = 0;
  while (i < QUERY.length && name[i].toLowerCase() === QUERY[i].toLowerCase()) i++;
  return i < QUERY.length ? K.typeStart + i * K.keyFrames : null;
};

const SearchList = ({ frame }: { frame: number }) => {
  const picked = ease(frame, K.select + 1, 6);
  return (
    <div style={{ marginTop: CARD.listGap, opacity: 1 - ease(frame, K.profile - 6, 6) }}>
      {RESULTS.map((r) => {
        const at = missAt(r.name);
        const hide = at === null ? 0 : ease(frame, at, 10);
        const isClient = r.name === CLIENT.name;
        return (
          <div
            key={r.name}
            style={{
              height: mix(hide, CARD.row, 0),
              opacity: 1 - hide,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '0 14px',
              borderRadius: RADIUS.md,
              background: isClient && picked > 0.5 ? C.tealLight : 'transparent',
            }}
          >
            <Avatar initials={r.initials} size={42} />
            <div style={{ flex: 1, fontSize: 21, fontWeight: 600 }}>{r.name}</div>
            <div style={{ fontSize: 17, color: isClient && picked > 0.5 ? C.teal : C.text2 }}>{r.last}</div>
          </div>
        );
      })}
    </div>
  );
};

const Profile = ({ frame }: { frame: number }) => (
  <div style={{ marginTop: 28 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, ...stepIn(frame, K.profile) }}>
      <Avatar initials={CLIENT.initials} size={76} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em' }}>{CLIENT.name}</div>
        <div style={{ display: 'flex', gap: 18, marginTop: 6, fontSize: 17, color: C.text2 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Phone size={16} strokeWidth={ICON.strokeWidth} /> {CLIENT.dial} {CLIENT.phone}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Mail size={16} strokeWidth={ICON.strokeWidth} /> {CLIENT.email}
          </span>
        </div>
      </div>
      <Badge tone="primary">{CLIENT.visits} visits</Badge>
    </div>
    <div
      style={{
        marginTop: 26,
        padding: '18px 20px',
        borderRadius: RADIUS.lg,
        background: C.limeLight,
        border: `1px solid ${C.border}`,
        display: 'flex',
        gap: 14,
        ...stepIn(frame, K.note),
      }}
    >
      <StickyNote size={20} color={C.teal} strokeWidth={ICON.strokeWidth} style={{ marginTop: 3, flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 17, fontWeight: 600, color: C.teal }}>Private note</div>
        <div style={{ fontSize: 19, marginTop: 4, lineHeight: 1.4 }}>{CLIENT.note}</div>
      </div>
    </div>
    <div style={{ fontSize: 20, fontWeight: 600, margin: '28px 0 6px', ...stepIn(frame, K.history - 4) }}>Visit history</div>
    {VISITS.map((v, i) => {
      const p = ease(frame, K.history + i * STAGGER.items, 18);
      return (
        <div key={v.date} style={{ opacity: p, transform: `translateY(${mix(p, 14, 0)}px)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '14px 0' }}>
            <div style={{ width: 80, fontSize: 18, color: C.text2 }}>{v.date}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 19, fontWeight: 600 }}>{v.service}</div>
              <div style={{ fontSize: 16, color: C.text2 }}>with {v.staff}</div>
            </div>
            <Badge tone="success" dot>
              Completed
            </Badge>
          </div>
          {i < VISITS.length - 1 ? <Divider subtle /> : null}
        </div>
      );
    })}
  </div>
);

/** Card height for the visible search results; grows to the profile height when it opens. */
const cardHeight = (frame: number) => {
  const rows = RESULTS.reduce((n, r) => {
    const at = missAt(r.name);
    return n + (at === null ? 1 : 1 - ease(frame, at, 10));
  }, 0);
  const list = CARD.pad * 2 + CARD.search + CARD.listGap + rows * CARD.row;
  // Grow only once the profile starts arriving, in step with its content.
  return mix(easeInOut(frame, K.profile, 30), list, CARD.profile);
};

export const Clients = () => {
  const frame = useCurrentFrame();
  const typed = QUERY.slice(0, typedCount(frame, K.typeStart, K.keyFrames, QUERY.length));
  const searching = frame < K.profile;
  const focused = searching && frame >= K.typeStart - 4;
  return (
    <Scene>
      <SplitLayout
        headline={[['Every client,'], [{ text: 'in one place.', accent: true }]]}
        headlineAt={K.headline}
        sub="Contact details, private notes and the full visit history."
        subAt={K.sub}
      >
        <div style={{ height: CARD.profile, ...appear(frame, K.card) }}>
          <Card style={{ width: CARD.w, height: cardHeight(frame), padding: CARD.pad, boxSizing: 'border-box' }}>
            <div
              style={{
                height: CARD.search,
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '0 18px',
                borderRadius: RADIUS.md,
                border: `1px solid ${focused ? C.teal : C.border}`,
                boxShadow: focused ? `0 0 0 ${ui(3)}px ${C.tealLight}` : 'none',
                fontSize: 22,
              }}
            >
              <Search size={20} color={C.text2} strokeWidth={ICON.strokeWidth} />
              {typed ? <span>{typed}</span> : <span style={{ color: C.text2 }}>Search clients</span>}
              {focused ? <span style={{ width: 2, height: 26, background: C.teal, opacity: Math.floor(frame / 8) % 2 === 0 || (typed && typed.length < QUERY.length) ? 1 : 0 }} /> : null}
            </div>
            {searching ? <SearchList frame={frame} /> : <Profile frame={frame} />}
          </Card>
        </div>
      </SplitLayout>
    </Scene>
  );
};
