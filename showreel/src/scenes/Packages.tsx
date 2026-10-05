import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { CalendarClock, Check, Package } from 'lucide-react';
import { C, ICON, RADIUS, TYPE } from '../theme';
import { Headline } from '../components/Headline';
import { SceneFrame } from '../components/SceneFrame';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Swap } from '../components/Swap';
import { appear, ease, mix } from '../components/motion';

/** Local timeline, shared with the SFX cue list. */
export const PACKAGES_T = { card: 16, sell: 38, uses: [70, 100] } as const;

const TOTAL = 6;
const RING = 248;
const STROKE = 16;
const R = (RING - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

const LOG = [
  { date: 'Tue 14 Oct', staff: 'Amira' },
  { date: 'Tue 28 Oct', staff: 'Amira' },
];

export const Packages = () => {
  const frame = useCurrentFrame();
  const T = PACKAGES_T;
  const sold = ease(frame, T.sell, 18);
  const press = ease(frame, T.sell - 4, 4) - ease(frame, T.sell + 1, 6);
  const used = T.uses.reduce((n, at) => n + ease(frame, at, 20), 0);
  const left = TOTAL - used;
  return (
    <SceneFrame dark>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', paddingBottom: 30 }}>
        <Headline
          lines={[['Packages that track', { text: 'every visit.', accent: true }]]}
          size={108}
          color="#fff"
          accent={C.lime}
          align="center"
        />
        <div style={{ marginTop: 80, ...appear(frame, T.card, 60) }}>
          <Card onTeal style={{ width: 1120, padding: 44, boxSizing: 'border-box', display: 'flex', gap: 56, alignItems: 'center' }}>
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
                  strokeDashoffset={CIRC * (1 - (sold * left) / TOTAL)}
                />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <Swap
                  frame={frame}
                  words={['6', '5', '4']}
                  phases={[T.card, ...T.uses]}
                  style={{ ...TYPE.headline, fontSize: 96, color: C.text, fontVariantNumeric: 'tabular-nums' }}
                />
                <div style={{ fontSize: 19, color: C.text2, marginTop: 4 }}>of {TOTAL} sessions left</div>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 56, height: 56, borderRadius: RADIUS.lg, background: C.lime, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Package size={26} color={C.teal} strokeWidth={ICON.strokeWidth} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em', color: C.text }}>Glow facial course</div>
                  <div style={{ fontSize: 19, color: C.text2, marginTop: 2 }}>6 sessions · Sara Khan</div>
                </div>
                <div style={{ position: 'relative', width: 190, height: 56 }}>
                  <div style={{ position: 'absolute', right: 0, top: 0, opacity: 1 - sold }}>
                    <Button height={56} fontSize={20} pressed={press}>
                      Sell package
                    </Button>
                  </div>
                  <div style={{ position: 'absolute', right: 0, top: 10, opacity: sold, transform: `scale(${mix(sold, 0.97, 1)})` }}>
                    <Badge tone="success">
                      <Check size={16} strokeWidth={2.5} /> Active
                    </Badge>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 18, color: C.text2, marginTop: 22, opacity: mix(sold, 0.4, 1) }}>
                <CalendarClock size={18} strokeWidth={ICON.strokeWidth} /> Expires 14 Apr 2027
              </div>
              <div style={{ height: 1, background: C.border, margin: '24px 0 4px' }} />
              <div style={{ height: 2 * 64 }}>
                {LOG.map((row, i) => {
                  const p = ease(frame, T.uses[i] + 2, 20);
                  return (
                    <div
                      key={row.date}
                      style={{
                        height: 64,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        borderBottom: i === 0 ? `1px solid ${C.borderSubtle}` : 'none',
                        opacity: p,
                        transform: `translateY(${mix(p, 14, 0)}px)`,
                      }}
                    >
                      <div style={{ width: 10, height: 10, borderRadius: 5, background: C.teal }} />
                      <div style={{ flex: 1, fontSize: 20, fontWeight: 600, color: C.text }}>Session used</div>
                      <div style={{ fontSize: 18, color: C.text2 }}>
                        {row.date} · {row.staff}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};
