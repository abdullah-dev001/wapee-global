import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { ChevronDown, MapPin, Percent, ShieldCheck } from 'lucide-react';
import { C, ICON, RADIUS } from '../theme';
import { Headline } from '../components/Headline';
import { SceneFrame } from '../components/SceneFrame';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Swap } from '../components/Swap';
import { Toggle } from '../components/Toggle';
import { appear, ease } from '../components/motion';

/** Local timeline, shared with the SFX cue list. */
export const TEAM_T = { cards: [16, 24, 32], toggle: 64, branch: 100 } as const;

const PERMS = [
  { label: 'View all staff calendars', scope: 'Branch', on: true },
  { label: 'Create appointments', scope: 'Branch', on: true },
  { label: 'Give discounts', scope: 'Branch', on: false, flips: true },
  { label: 'View revenue reports', scope: null, on: false },
];

const gbp = (minor: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(minor / 100);

const IconTile = ({ children }: { children: React.ReactNode }) => (
  <div style={{ width: 48, height: 48, borderRadius: RADIUS.lg, background: C.tealLight, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
    {children}
  </div>
);

export const Team = () => {
  const frame = useCurrentFrame();
  const T = TEAM_T;
  const commission = ease(frame, 40, 56);
  return (
    <SceneFrame dark>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', paddingBottom: 20 }}>
        <Headline
          lines={[['Grow without', { text: 'switching tools.', accent: true }]]}
          size={108}
          color="#fff"
          accent={C.lime}
          align="center"
        />
        <div style={{ display: 'flex', gap: 32, marginTop: 76, alignItems: 'stretch' }}>
          <div style={appear(frame, T.cards[0], 60)}>
            <Card onTeal style={{ width: 640, height: '100%', padding: 36, boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <IconTile>
                  <ShieldCheck size={24} color={C.teal} strokeWidth={ICON.strokeWidth} />
                </IconTile>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 17, color: C.text2 }}>Role</div>
                  <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', color: C.text }}>Receptionist</div>
                </div>
                <Badge tone="primary">Custom</Badge>
              </div>
              <div style={{ height: 1, background: C.border, margin: '24px 0 4px' }} />
              {PERMS.map((p, i) => (
                <div
                  key={p.label}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, height: 66, borderBottom: i < PERMS.length - 1 ? `1px solid ${C.borderSubtle}` : 'none' }}
                >
                  <div style={{ flex: 1, fontSize: 21, color: C.text }}>{p.label}</div>
                  {p.scope && <div style={{ fontSize: 16, color: C.text2 }}>{p.scope}</div>}
                  <Toggle on={p.flips ? ease(frame, T.toggle, 10) : p.on ? 1 : 0} />
                </div>
              ))}
            </Card>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: 440 }}>
            <div style={appear(frame, T.cards[1], 60)}>
              <Card onTeal style={{ padding: 30 }}>
                <div style={{ fontSize: 17, color: C.text2, marginBottom: 12 }}>Branch</div>
                <div
                  style={{
                    height: 58,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '0 18px',
                    borderRadius: RADIUS.md + 2,
                    border: `1px solid ${C.border}`,
                    fontSize: 22,
                    fontWeight: 600,
                    color: C.text,
                  }}
                >
                  <MapPin size={20} color={C.teal} strokeWidth={ICON.strokeWidth} />
                  <div style={{ flex: 1 }}>
                    <Swap frame={frame} words={['Camden', 'Shoreditch']} phases={[T.cards[1], T.branch]} />
                  </div>
                  <ChevronDown size={20} color={C.text2} strokeWidth={ICON.strokeWidth} />
                </div>
                <div style={{ fontSize: 17, color: C.text2, marginTop: 12 }}>Own hours, staff and timezone</div>
              </Card>
            </div>
            <div style={appear(frame, T.cards[2], 60)}>
              <Card onTeal style={{ padding: 30 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <IconTile>
                    <Percent size={22} color={C.teal} strokeWidth={ICON.strokeWidth} />
                  </IconTile>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 600, color: C.text }}>Commission · Amira</div>
                    <div style={{ fontSize: 17, color: C.text2 }}>10% on services</div>
                  </div>
                </div>
                <div style={{ fontSize: 46, fontWeight: 700, letterSpacing: '-0.045em', color: C.text, marginTop: 18, fontVariantNumeric: 'tabular-nums' }}>
                  {gbp(Math.round(41250 * commission))}
                </div>
                <div style={{ fontSize: 17, color: C.text2 }}>Earned this month</div>
              </Card>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};
