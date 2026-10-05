import { useCurrentFrame } from 'remotion';
import { CalendarClock, Check, Package } from 'lucide-react';
import { C, ICON, TYPE } from '../theme';
import { T } from '../timeline';
import { CLIENT, PACKAGE } from '../content';
import { Scene } from '../components/Scene';
import { StackLayout } from '../components/Layout';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Divider } from '../components/Divider';
import { IconTile } from '../components/IconTile';
import { Swap } from '../components/Swap';
import { pressAt } from '../components/Cursor';
import { appear, ease, mix } from '../components/motion';

const P = T.packages;
const RING = 250;
const STROKE = 16;
const R = (RING - STROKE) / 2;
const CIRC = 2 * Math.PI * R;
const COUNTS = Array.from({ length: P.uses.length + 1 }, (_, i) => String(PACKAGE.sessions - i));

export const Packages = () => {
  const frame = useCurrentFrame();
  const sold = ease(frame, P.sell, 18);
  const used = P.uses.reduce((n, at) => n + ease(frame, at, 20), 0);
  return (
    <Scene>
      <StackLayout headline={[['Packages that track', { text: 'every visit.', accent: true }]]} headlineAt={P.headline} gap={72}>
        <div style={appear(frame, P.card, 56)}>
          <Card style={{ width: 1120, padding: 46, boxSizing: 'border-box', display: 'flex', gap: 56, alignItems: 'center', color: C.text }}>
            <div style={{ position: 'relative', width: RING, height: RING, flexShrink: 0 }}>
              <svg width={RING} height={RING} style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={RING / 2} cy={RING / 2} r={R} fill="none" stroke={C.tealLight} strokeWidth={STROKE} />
                <circle
                  cx={RING / 2}
                  cy={RING / 2}
                  r={R}
                  fill="none"
                  stroke={C.teal}
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  strokeDasharray={CIRC}
                  strokeDashoffset={CIRC * (1 - (sold * (PACKAGE.sessions - used)) / PACKAGE.sessions)}
                />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <Swap frame={frame} words={COUNTS} phases={[P.card, ...P.uses]} style={{ ...TYPE.headlineStyle, fontSize: 96, fontVariantNumeric: 'tabular-nums' }} />
                <div style={{ fontSize: 19, color: C.text2, marginTop: 2 }}>of {PACKAGE.sessions} sessions left</div>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <IconTile Icon={Package} size={56} tone="lime" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em' }}>{PACKAGE.name}</div>
                  <div style={{ fontSize: 19, color: C.text2, marginTop: 2 }}>
                    {PACKAGE.sessions} sessions · {CLIENT.name}
                  </div>
                </div>
                <div style={{ position: 'relative', width: 200, height: 56 }}>
                  <div style={{ position: 'absolute', right: 0, top: 0, opacity: 1 - sold }}>
                    <Button height={56} fontSize={20} pressed={pressAt(frame, P.sell - 2)}>
                      Sell package
                    </Button>
                  </div>
                  <div style={{ position: 'absolute', right: 0, top: 11, opacity: sold, transform: `scale(${mix(sold, 0.97, 1)})` }}>
                    <Badge tone="success" dot>
                      Active
                    </Badge>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 18, color: C.text2, marginTop: 22 }}>
                <CalendarClock size={18} strokeWidth={ICON.strokeWidth} /> {PACKAGE.expires}
              </div>
              <Divider margin="24px 0 4px" />
              <div style={{ height: PACKAGE.log.length * 64 }}>
                {PACKAGE.log.map((row, i) => {
                  const p = ease(frame, P.uses[i] + 2, 20);
                  return (
                    <div key={row.date} style={{ opacity: p, transform: `translateY(${mix(p, 14, 0)}px)` }}>
                      <div style={{ height: 63, display: 'flex', alignItems: 'center', gap: 14 }}>
                        <Check size={20} color={C.teal} strokeWidth={2.25} />
                        <div style={{ flex: 1, fontSize: 21, fontWeight: 600 }}>Session used</div>
                        <div style={{ fontSize: 18, color: C.text2 }}>
                          {row.date} · {row.staff}
                        </div>
                      </div>
                      {i < PACKAGE.log.length - 1 ? <Divider subtle /> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        </div>
      </StackLayout>
    </Scene>
  );
};
