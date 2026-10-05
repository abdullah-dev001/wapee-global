import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Check, FileSignature } from 'lucide-react';
import { C, ICON, RADIUS } from '../theme';
import { Headline } from '../components/Headline';
import { SceneFrame } from '../components/SceneFrame';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { appear, ease, mix } from '../components/motion';

/** Local timeline, shared with the SFX cue list. */
export const FORMS_T = { card: 12, checks: [36, 46], sign: 58, signFrames: 40, signed: 104 } as const;

const PAD_W = 560;
const PAD_H = 170;

/** A looping, handwriting-like stroke plus an underline flourish. */
const signaturePath = (() => {
  // Prolate cycloid: round, slanted loops like joined-up handwriting.
  const pts: string[] = [];
  const n = 320;
  const turns = 5.5;
  for (let i = 0; i <= n; i++) {
    const th = (i / n) * turns * 2 * Math.PI;
    const t = i / n;
    const size = 1 - 0.45 * t;
    const y = 80 - 30 * size * Math.cos(th) + 18 * Math.sin(Math.PI * t) - 6;
    const x = 70 + 13 * th - 22 * size * Math.sin(th) + 0.3 * (80 - y);
    pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return `M48 104 C 40 60, 70 30, 84 60 ${pts.join(' ').replace(/^M/, 'L')} M70 132 C 200 118, 360 122, 520 108`;
})();

const ITEMS = ['I had a patch test in the last 48 hours.', 'I have read the aftercare advice.'];

export const Forms = () => {
  const frame = useCurrentFrame();
  const T = FORMS_T;
  const draw = ease(frame, T.sign, T.signFrames);
  const signed = ease(frame, T.signed, 18);
  return (
    <SceneFrame>
      <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '0 170px 0 160px' }}>
        <div>
          <Headline lines={[['Consent, signed'], [{ text: 'before they arrive.', accent: true }]]} size={100} />
          <div style={{ fontSize: 30, color: C.text2, marginTop: 34, lineHeight: 1.35, maxWidth: 560, opacity: ease(frame, 24, 26) }}>
            Intake and consent forms with a real signature, stored on the client.
          </div>
        </div>
        <div style={appear(frame, T.card)}>
          <Card style={{ width: 640, padding: 40, boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 56, height: 56, borderRadius: RADIUS.lg, background: C.tealLight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileSignature size={26} color={C.teal} strokeWidth={ICON.strokeWidth} />
              </div>
              <div>
                <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em' }}>Colour treatment consent</div>
                <div style={{ fontSize: 18, color: C.text2, marginTop: 2 }}>Sara Khan · before Tue 14 Oct</div>
              </div>
            </div>
            <div style={{ height: 1, background: C.border, margin: '28px 0 10px' }} />
            {ITEMS.map((label, i) => {
              const on = ease(frame, T.checks[i], 8);
              return (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 0' }}>
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: RADIUS.md,
                      border: `${on > 0.5 ? 0 : 1.5}px solid ${C.border}`,
                      background: on > 0.5 ? C.teal : C.surface,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxSizing: 'border-box',
                      flexShrink: 0,
                    }}
                  >
                    <Check size={18} color="#fff" strokeWidth={2.5} style={{ opacity: on }} />
                  </div>
                  <div style={{ fontSize: 21 }}>{label}</div>
                </div>
              );
            })}
            <div style={{ fontSize: 17, fontWeight: 600, margin: '22px 0 10px' }}>Signature</div>
            <div
              style={{
                position: 'relative',
                width: PAD_W,
                height: PAD_H,
                borderRadius: RADIUS.lg,
                border: `1px solid ${draw > 0 && draw < 1 ? C.teal : C.border}`,
                boxShadow: draw > 0 && draw < 1 ? `0 0 0 4px ${C.tealLight}` : 'none',
                background: C.bg,
              }}
            >
              <div style={{ position: 'absolute', left: 30, right: 30, bottom: 34, height: 1, background: C.border }} />
              <div style={{ position: 'absolute', left: 30, bottom: 40, fontSize: 18, color: C.text3 }}>×</div>
              <svg width={PAD_W} height={PAD_H} style={{ position: 'absolute', inset: 0 }}>
                <path
                  d={signaturePath}
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
              <div style={{ fontSize: 18, color: C.text2 }}>Saved to Sara&apos;s profile</div>
            </div>
          </Card>
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};
