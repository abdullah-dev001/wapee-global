import { useCurrentFrame } from 'remotion';
import { ChevronDown, MapPin, Percent, ShieldCheck } from 'lucide-react';
import { C, ICON, RADIUS } from '../theme';
import { T } from '../timeline';
import { BOOKING } from '../content';
import { money } from '../format';
import { Scene } from '../components/Scene';
import { StackLayout } from '../components/Layout';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Divider } from '../components/Divider';
import { IconTile } from '../components/IconTile';
import { Swap } from '../components/Swap';
import { Toggle } from '../components/Toggle';
import { appear, countUp, ease } from '../components/motion';

const M = T.team;
const COMMISSION_POUNDS = 412;

const PERMS = [
  { label: 'View all staff calendars', scope: 'Branch', on: true },
  { label: 'Create appointments', scope: 'Branch', on: true },
  { label: 'Give discounts', scope: 'Branch', on: false, flips: true },
  { label: 'View revenue reports', scope: null, on: false },
];

export const Team = () => {
  const frame = useCurrentFrame();
  return (
    <Scene>
      <StackLayout headline={[['Grow without', { text: 'switching tools.', accent: true }]]} headlineAt={M.headline} gap={72}>
        <div style={{ display: 'flex', gap: 32, alignItems: 'stretch', color: C.text }}>
          <div style={appear(frame, M.cards[0], 56)}>
            <Card style={{ width: 660, height: '100%', padding: 38, boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <IconTile Icon={ShieldCheck} size={52} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 17, color: C.text2 }}>Role</div>
                  <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em' }}>Receptionist</div>
                </div>
                <Badge tone="primary">Custom role</Badge>
              </div>
              <Divider margin="24px 0 4px" />
              {PERMS.map((p, i) => (
                <div key={p.label}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: 70 }}>
                    <div style={{ flex: 1, fontSize: 22 }}>{p.label}</div>
                    {p.scope ? <div style={{ fontSize: 17, color: C.text2 }}>{p.scope}</div> : null}
                    <Toggle on={p.flips ? ease(frame, M.toggle, 10) : p.on ? 1 : 0} />
                  </div>
                  {i < PERMS.length - 1 ? <Divider subtle /> : null}
                </div>
              ))}
            </Card>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 26, width: 460 }}>
            <div style={appear(frame, M.cards[1], 56)}>
              <Card style={{ padding: 32 }}>
                <div style={{ fontSize: 17, color: C.text2, marginBottom: 12 }}>Branch</div>
                <div
                  style={{
                    height: 60,
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '0 18px',
                    borderRadius: RADIUS.md,
                    border: `1px solid ${C.border}`,
                    fontSize: 22,
                    fontWeight: 600,
                  }}
                >
                  <MapPin size={20} color={C.teal} strokeWidth={ICON.strokeWidth} />
                  <div style={{ flex: 1 }}>
                    <Swap frame={frame} words={['Camden', 'Shoreditch']} phases={[M.cards[1], M.branch]} frames={16} />
                  </div>
                  <ChevronDown size={20} color={C.text2} strokeWidth={ICON.strokeWidth} />
                </div>
                <div style={{ fontSize: 17, color: C.text2, marginTop: 12 }}>Own hours, staff and timezone</div>
              </Card>
            </div>
            <div style={appear(frame, M.cards[2], 56)}>
              <Card style={{ padding: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <IconTile Icon={Percent} size={50} />
                  <div>
                    <div style={{ fontSize: 21, fontWeight: 600 }}>Commission · {BOOKING.staff}</div>
                    <div style={{ fontSize: 17, color: C.text2 }}>10% on services</div>
                  </div>
                </div>
                <div style={{ fontSize: 50, fontWeight: 700, letterSpacing: '-0.045em', marginTop: 18, fontVariantNumeric: 'tabular-nums' }}>
                  {money(countUp(frame, M.countStart, M.countFrames, COMMISSION_POUNDS) * 100)}
                </div>
                <div style={{ fontSize: 17, color: C.text2 }}>Earned this month</div>
              </Card>
            </div>
          </div>
        </div>
      </StackLayout>
    </Scene>
  );
};
