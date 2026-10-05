import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Check } from 'lucide-react';
import { C, RADIUS } from '../theme';
import { Headline } from '../components/Headline';
import { SceneFrame } from '../components/SceneFrame';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { appear, ease, mix } from '../components/motion';

const gbp = (minor: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2 }).format(minor / 100);

const LINES = [
  { name: 'Haircut & style', staff: 'Amira · 45 min', minor: 4500 },
  { name: 'Beard trim', staff: 'Amira · 20 min', minor: 2000 },
];
const SUBTOTAL = LINES.reduce((s, l) => s + l.minor, 0);
const VAT = Math.round(SUBTOTAL * 0.2);

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const VALUES = [520, 640, 580, 720, 860, 980, 560];
const PEAK = 5;
const WEEK = VALUES.reduce((a, b) => a + b, 0);

const Row = ({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: strong ? 24 : 19, fontWeight: strong ? 700 : 400, color: strong ? C.text : C.text2, marginTop: strong ? 0 : 10 }}>
    <span>{label}</span>
    <span style={{ color: C.text, fontWeight: strong ? 700 : 500 }}>{value}</span>
  </div>
);

/** Local timeline, shared with the SFX cue list. */
export const MONEY_T = { paid: 66 } as const;

export const Money = () => {
  const frame = useCurrentFrame();
  const paid = ease(frame, MONEY_T.paid, 18);
  const count = ease(frame, 36, 60);
  return (
    <SceneFrame>
      <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', padding: '0 120px 0 140px', gap: 80 }}>
        <div style={{ width: 560 }}>
          <Headline lines={[['From'], ['appointment'], [{ text: 'to paid.', accent: true }]]} size={96} />
          <div style={{ fontSize: 30, color: C.text2, marginTop: 34, lineHeight: 1.35, opacity: ease(frame, 26, 26), maxWidth: 520 }}>
            Invoices with VAT, recorded payments and clear daily totals.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
          <div style={appear(frame, 12)}>
            <Card style={{ width: 520, padding: 34, boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 17, color: C.text2 }}>Invoice INV-0042</div>
                  <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', marginTop: 4 }}>Sara Khan</div>
                  <div style={{ fontSize: 17, color: C.text3, marginTop: 4 }}>14 Oct 2026</div>
                </div>
                <div style={{ position: 'relative', height: 40, width: 120 }}>
                  <div style={{ position: 'absolute', right: 0, opacity: 1 - paid }}>
                    <Badge tone="warning">Pending</Badge>
                  </div>
                  <div style={{ position: 'absolute', right: 0, opacity: paid, transform: `scale(${mix(paid, 0.97, 1)})` }}>
                    <Badge tone="success">
                      <Check size={16} strokeWidth={2.5} /> Paid
                    </Badge>
                  </div>
                </div>
              </div>
              <div style={{ height: 1, background: C.border, margin: '26px 0 8px' }} />
              {LINES.map((l) => (
                <div key={l.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: `1px solid ${C.borderSubtle}` }}>
                  <div>
                    <div style={{ fontSize: 21, fontWeight: 600 }}>{l.name}</div>
                    <div style={{ fontSize: 16, color: C.text2, marginTop: 2 }}>{l.staff}</div>
                  </div>
                  <div style={{ fontSize: 21, fontWeight: 600 }}>{gbp(l.minor)}</div>
                </div>
              ))}
              <div style={{ marginTop: 10 }}>
                <Row label="Subtotal" value={gbp(SUBTOTAL)} />
                <Row label="VAT 20%" value={gbp(VAT)} />
              </div>
              <div style={{ height: 1, background: C.border, margin: '20px 0' }} />
              <Row label="Total" value={gbp(SUBTOTAL + VAT)} strong />
              <div style={{ marginTop: 18, fontSize: 16, color: C.text2, opacity: paid }}>Paid by card in store · 14 Oct</div>
            </Card>
          </div>
          <div style={appear(frame, 24)}>
            <Card style={{ width: 440, padding: 34, boxSizing: 'border-box' }}>
              <div style={{ fontSize: 18, color: C.text2 }}>Revenue this week</div>
              <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: '-0.045em', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                {gbp(Math.round(WEEK * count) * 100)}
              </div>
              <div style={{ marginTop: 8, fontSize: 17, color: C.text3 }}>13 – 19 Oct</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 220, marginTop: 34 }}>
                {VALUES.map((v, i) => {
                  const g = ease(frame, 40 + i * 4, 34);
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, height: '100%', justifyContent: 'flex-end' }}>
                      <div
                        style={{
                          width: '100%',
                          height: `${(v / 1000) * 180 * g}px`,
                          borderRadius: RADIUS.md,
                          background: i === PEAK ? C.lime : C.teal,
                          opacity: i === PEAK ? 1 : 0.9,
                        }}
                      />
                      <div style={{ fontSize: 15, color: i === PEAK ? C.text : C.text3, fontWeight: i === PEAK ? 600 : 400 }}>{DAYS[i]}</div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};
