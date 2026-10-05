import { useCurrentFrame } from 'remotion';
import { Check } from 'lucide-react';
import { C, RADIUS, STAGGER } from '../theme';
import { T } from '../timeline';
import { CLIENT, INVOICE } from '../content';
import { money } from '../format';
import { Scene } from '../components/Scene';
import { StackLayout } from '../components/Layout';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Divider } from '../components/Divider';
import { appear, countUp, ease, mix } from '../components/motion';

const M = T.money;
const SUBTOTAL = INVOICE.lines.reduce((s, l) => s + l.minor, 0);
const VAT = Math.round(SUBTOTAL * INVOICE.vatRate);

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_TOTALS = [520, 640, 580, 720, 860, 980, 560];
const PEAK = DAY_TOTALS.indexOf(Math.max(...DAY_TOTALS));
const WEEK = DAY_TOTALS.reduce((a, b) => a + b, 0);
const BAR_MAX = 200;

const Row = ({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: strong ? 26 : 20, fontWeight: strong ? 700 : 400, color: strong ? C.text : C.text2, marginTop: strong ? 0 : 10 }}>
    <span>{label}</span>
    <span style={{ color: C.text, fontWeight: strong ? 700 : 500, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
  </div>
);

export const Money = () => {
  const frame = useCurrentFrame();
  const paid = ease(frame, M.paid, 18);
  return (
    <Scene>
      <StackLayout headline={[['From appointment', { text: 'to paid.', accent: true }]]} headlineAt={M.headline}>
        <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
          <div style={appear(frame, M.invoice)}>
            <Card style={{ width: 580, padding: 38, boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 18, color: C.text2 }}>Invoice {INVOICE.number}</div>
                  <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em', marginTop: 4 }}>{CLIENT.name}</div>
                  <div style={{ fontSize: 18, color: C.text2, marginTop: 4 }}>{INVOICE.date}</div>
                </div>
                <div style={{ position: 'relative', width: 140, height: 40 }}>
                  <div style={{ position: 'absolute', right: 0, opacity: 1 - paid }}>
                    <Badge tone="warning" dot>
                      Pending
                    </Badge>
                  </div>
                  <div style={{ position: 'absolute', right: 0, opacity: paid, transform: `scale(${mix(paid, 0.97, 1)})` }}>
                    <Badge tone="success">
                      <Check size={16} strokeWidth={2.5} /> Paid
                    </Badge>
                  </div>
                </div>
              </div>
              <Divider margin="26px 0 6px" />
              {INVOICE.lines.map((l, i) => (
                <div key={l.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0' }}>
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 600 }}>{l.name}</div>
                      <div style={{ fontSize: 17, color: C.text2, marginTop: 2 }}>{l.detail}</div>
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{money(l.minor)}</div>
                  </div>
                  {i < INVOICE.lines.length - 1 ? <Divider subtle /> : null}
                </div>
              ))}
              <Divider margin="6px 0 6px" />
              <Row label="Subtotal" value={money(SUBTOTAL)} />
              <Row label={`VAT ${Math.round(INVOICE.vatRate * 100)}%`} value={money(VAT)} />
              <Divider margin="20px 0" />
              <Row label="Total" value={money(SUBTOTAL + VAT)} strong />
              <div style={{ marginTop: 18, fontSize: 17, color: C.text2, opacity: paid }}>{INVOICE.paidNote}</div>
            </Card>
          </div>
          <div style={appear(frame, M.revenue)}>
            <Card style={{ width: 480, padding: 38, boxSizing: 'border-box' }}>
              <div style={{ fontSize: 19, color: C.text2 }}>Revenue this week</div>
              <div style={{ fontSize: 60, fontWeight: 700, letterSpacing: '-0.045em', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                {money(countUp(frame, M.countStart, M.countFrames, WEEK) * 100)}
              </div>
              <div style={{ marginTop: 4, fontSize: 18, color: C.text2 }}>13 – 19 Oct</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: BAR_MAX + 36, marginTop: 30 }}>
                {DAY_TOTALS.map((v, i) => {
                  const g = ease(frame, M.bars + i * STAGGER.items, 30);
                  return (
                    <div key={DAYS[i]} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: '100%',
                          height: (v / 1000) * BAR_MAX,
                          borderRadius: RADIUS.md,
                          background: i === PEAK ? C.lime : C.teal,
                          transformOrigin: 'bottom',
                          transform: `scaleY(${g})`,
                        }}
                      />
                      <div style={{ fontSize: 16, color: i === PEAK ? C.text : C.text2, fontWeight: i === PEAK ? 600 : 400 }}>{DAYS[i]}</div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
      </StackLayout>
    </Scene>
  );
};
