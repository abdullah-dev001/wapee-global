import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Mail, Phone, Search, StickyNote } from 'lucide-react';
import { C, ICON, RADIUS } from '../theme';
import { Headline } from '../components/Headline';
import { SceneFrame } from '../components/SceneFrame';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { appear, ease, mix, stepIn } from '../components/motion';

/** Local timeline, shared with the SFX cue list. */
export const CLIENTS_T = { card: 12, type: 24, typeStep: 4, query: 'Sar', select: 50, profile: 56 } as const;

const CLIENTS = [
  { name: 'Sara Khan', initials: 'SK', last: 'Last visit 14 Oct' },
  { name: 'Lena Moretti', initials: 'LM', last: 'Last visit 9 Oct' },
  { name: 'Sarah Lee', initials: 'SL', last: 'Last visit 2 Oct' },
  { name: 'Omar Haddad', initials: 'OH', last: 'Last visit 28 Sep' },
  { name: 'Sam Ortiz', initials: 'SO', last: 'Last visit 21 Sep' },
  { name: 'Ana Ribeiro', initials: 'AR', last: 'Last visit 19 Sep' },
  { name: 'Priya Rao', initials: 'PR', last: 'Last visit 12 Sep' },
];

/** Number of typed characters at which a name stops matching the query. */
const firstMiss = (name: string) => {
  const q = CLIENTS_T.query.toLowerCase();
  let i = 0;
  while (i < q.length && name.toLowerCase()[i] === q[i]) i++;
  return i + 1;
};

const VISITS = [
  { date: '14 Oct', service: 'Haircut & style', staff: 'Amira' },
  { date: '16 Sep', service: 'Colour & gloss', staff: 'Mei' },
  { date: '12 Aug', service: 'Haircut & style', staff: 'Amira' },
];

export const Clients = () => {
  const frame = useCurrentFrame();
  const T = CLIENTS_T;
  const typed = T.query.slice(0, Math.max(0, Math.min(T.query.length, Math.floor((frame - T.type) / T.typeStep) + 1)));
  const picked = ease(frame, T.select, 6);
  const searching = frame < T.profile + 4;
  return (
    <SceneFrame>
      <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '0 160px 0 160px' }}>
        <div>
          <Headline lines={[['Every client,'], [{ text: 'in one place.', accent: true }]]} size={124} />
          <div style={{ fontSize: 30, color: C.text2, marginTop: 34, lineHeight: 1.35, maxWidth: 560, opacity: ease(frame, 24, 26) }}>
            Contact details, private notes and the full visit history.
          </div>
        </div>
        <div style={appear(frame, T.card)}>
          <Card style={{ width: 660, height: 720, padding: 36, boxSizing: 'border-box', position: 'relative' }}>
            <div
              style={{
                height: 58,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '0 18px',
                borderRadius: RADIUS.md + 2,
                border: `1px solid ${searching && frame >= T.type - 4 ? C.teal : C.border}`,
                boxShadow: searching && frame >= T.type - 4 ? `0 0 0 4px ${C.tealLight}` : 'none',
                fontSize: 22,
              }}
            >
              <Search size={20} color={C.text3} strokeWidth={ICON.strokeWidth} />
              {typed ? <span>{typed}</span> : <span style={{ color: C.text3 }}>Search clients</span>}
            </div>
            {searching ? (
              <div style={{ marginTop: 14, opacity: 1 - ease(frame, T.profile, 8) }}>
                {CLIENTS.map((c) => {
                  const match = c.name.toLowerCase().startsWith(typed.toLowerCase());
                  const hideAt = match ? null : T.type + T.typeStep * (firstMiss(c.name) - 1);
                  const hide = hideAt === null ? 0 : ease(frame, hideAt, 10);
                  const isSara = c.name === 'Sara Khan';
                  return (
                    <div
                      key={c.name}
                      style={{
                        height: mix(hide, 72, 0),
                        opacity: 1 - hide,
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '0 14px',
                        borderRadius: RADIUS.md + 2,
                        background: isSara && picked > 0.5 ? C.tealLight : 'transparent',
                      }}
                    >
                      <Avatar size={42} initials={c.initials} />
                      <div style={{ flex: 1, fontSize: 21, fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: 17, color: C.text2 }}>{c.last}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Profile frame={frame} />
            )}
          </Card>
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};

const Avatar = ({ size, initials = 'SK' }: { size: number; initials?: string }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      background: C.tealLight,
      color: C.teal,
      fontWeight: 700,
      fontSize: size * 0.38,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}
  >
    {initials}
  </div>
);

const Profile = ({ frame }: { frame: number }) => {
  const at = CLIENTS_T.profile;
  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, ...stepIn(frame, at) }}>
        <Avatar size={76} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em' }}>Sara Khan</div>
          <div style={{ display: 'flex', gap: 18, marginTop: 6, fontSize: 17, color: C.text2 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Phone size={15} strokeWidth={ICON.strokeWidth} /> +44 7700 900 123
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Mail size={15} strokeWidth={ICON.strokeWidth} /> sara@mail.com
            </span>
          </div>
        </div>
        <Badge tone="primary">12 visits</Badge>
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
          ...stepIn(frame, at + 8),
        }}
      >
        <StickyNote size={20} color={C.teal} strokeWidth={ICON.strokeWidth} style={{ marginTop: 3, flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: C.teal }}>Note</div>
          <div style={{ fontSize: 19, color: C.text, marginTop: 4, lineHeight: 1.4 }}>
            Prefers a quiet chair by the window. Patch test before any colour.
          </div>
        </div>
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, margin: '28px 0 6px', ...stepIn(frame, at + 14) }}>Visit history</div>
      {VISITS.map((v, i) => {
        const p = ease(frame, at + 18 + i * 5, 18);
        return (
          <div
            key={v.date}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              padding: '14px 0',
              borderBottom: i < VISITS.length - 1 ? `1px solid ${C.borderSubtle}` : 'none',
              opacity: p,
              transform: `translateY(${mix(p, 14, 0)}px)`,
            }}
          >
            <div style={{ width: 80, fontSize: 18, color: C.text2 }}>{v.date}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 19, fontWeight: 600 }}>{v.service}</div>
              <div style={{ fontSize: 16, color: C.text2 }}>with {v.staff}</div>
            </div>
            <Badge tone="success" size={15}>
              Completed
            </Badge>
          </div>
        );
      })}
    </div>
  );
};
