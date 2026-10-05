import { useCurrentFrame } from 'remotion';
import { Check, FileSignature } from 'lucide-react';
import { C, RADIUS, ui } from '../theme';
import { T } from '../timeline';
import { CLIENT } from '../content';
import { Scene } from '../components/Scene';
import { SplitLayout } from '../components/Layout';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Divider } from '../components/Divider';
import { IconTile } from '../components/IconTile';
import { appear, ease, easeInOut, mix } from '../components/motion';

const F = T.forms;
const CARD_W = 600;
const PAD_W = CARD_W - 80;
const PAD_H = 170;

/** Prolate cycloid: round, slanted loops like joined-up handwriting, plus an underline. */
const SIGNATURE = (() => {
  const pts: string[] = [];
  const n = 320;
  const turns = 5.5;
  const sx = PAD_W / 560;
  for (let i = 0; i <= n; i++) {
    const th = (i / n) * turns * 2 * Math.PI;
    const t = i / n;
    const size = 1 - 0.45 * t;
    const y = 80 - 30 * size * Math.cos(th) + 18 * Math.sin(Math.PI * t) - 6;
    const x = (70 + 13 * th - 22 * size * Math.sin(th) + 0.3 * (80 - y)) * sx;
    pts.push(`L${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return `M${(48 * sx).toFixed(1)} 104 C ${(40 * sx).toFixed(1)} 60, ${(70 * sx).toFixed(1)} 30, ${(84 * sx).toFixed(1)} 60 ${pts.join(' ')} M${(70 * sx).toFixed(1)} 132 C ${(200 * sx).toFixed(1)} 118, ${(360 * sx).toFixed(1)} 122, ${(520 * sx).toFixed(1)} 108`;
})();

const ITEMS = ['I had a patch test in the last 48 hours.', 'I have read the aftercare advice.'];

export const Forms = () => {
  const frame = useCurrentFrame();
  // A pen moves at a steady pace: in-out, not the UI curve.
  const draw = easeInOut(frame, F.sign, F.signFrames);
  const signing = draw > 0 && draw < 1;
  const signed = ease(frame, F.signed, 18);
  return (
    <Scene>
      <SplitLayout
        headline={[['Consent, signed'], [{ text: 'before they arrive.', accent: true }]]}
        headlineAt={F.headline}
        sub="Intake and consent forms with a real signature, stored on the client."
        subAt={F.sub}
      >
        <div style={appear(frame, F.card)}>
          <Card style={{ width: CARD_W, padding: 40, boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <IconTile Icon={FileSignature} size={56} />
              <div>
                <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em' }}>Colour consent</div>
                <div style={{ fontSize: 18, color: C.text2, marginTop: 2 }}>{CLIENT.name} · before Colour & gloss, 11 Nov</div>
              </div>
            </div>
            <Divider margin="28px 0 10px" />
            {ITEMS.map((label, i) => {
              const on = ease(frame, F.checks[i], 8);
              return (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '13px 0' }}>
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      boxSizing: 'border-box',
                      flexShrink: 0,
                      borderRadius: RADIUS.md * 0.6,
                      border: on > 0.5 ? 'none' : `1.5px solid ${C.border}`,
                      background: on > 0.5 ? C.teal : C.surface,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Check size={18} color="#fff" strokeWidth={2.5} style={{ opacity: on, transform: `scale(${mix(on, 0.7, 1)})` }} />
                  </div>
                  <div style={{ fontSize: 21 }}>{label}</div>
                </div>
              );
            })}
            <div style={{ fontSize: ui(13), fontWeight: 600, margin: '22px 0 10px' }}>Signature</div>
            <div
              style={{
                position: 'relative',
                width: PAD_W,
                height: PAD_H,
                boxSizing: 'border-box',
                borderRadius: RADIUS.lg,
                border: `1px solid ${signing ? C.teal : C.border}`,
                boxShadow: signing ? `0 0 0 ${ui(3)}px ${C.tealLight}` : 'none',
                background: C.bg,
              }}
            >
              <div style={{ position: 'absolute', left: 30, right: 30, bottom: 34, height: 1, background: C.border }} />
              <div style={{ position: 'absolute', left: 30, bottom: 40, fontSize: 18, color: C.text2 }}>×</div>
              <svg width={PAD_W} height={PAD_H} style={{ position: 'absolute', inset: 0 }}>
                <path
                  d={SIGNATURE}
                  fill="none"
                  stroke={C.text}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pathLength={1}
                  strokeDasharray={1}
                  strokeDashoffset={1 - draw}
                />
              </svg>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 24, opacity: signed, transform: `translateY(${mix(signed, 12, 0)}px)` }}>
              <Badge tone="success">
                <Check size={16} strokeWidth={2.5} /> Signed 14 Oct, 09:12
              </Badge>
              <div style={{ fontSize: 18, color: C.text2 }}>Saved to {CLIENT.first}&apos;s profile</div>
            </div>
          </Card>
        </div>
      </SplitLayout>
    </Scene>
  );
};
