import { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Car, CalendarDays, LayoutGrid, Scissors, Stethoscope, User } from 'lucide-react';
import { C, ICON, RADIUS } from '../theme';
import { Headline } from '../components/Headline';
import { SceneFrame } from '../components/SceneFrame';
import { Card } from '../components/Card';
import { Swap } from '../components/Swap';
import { appear, ease, mix } from '../components/motion';

export const PHASES = [18, 54, 86];
const INDUSTRIES = [
  { name: 'Salon', Icon: Scissors },
  { name: 'Clinic', Icon: Stethoscope },
  { name: 'Car service', Icon: Car },
];
const ROWS = [
  { label: 'Who books', Icon: User, words: ['Client', 'Patient', 'Customer'] },
  { label: 'What they book', Icon: CalendarDays, words: ['Appointment', 'Appointment', 'Booking'] },
  { label: 'Where it happens', Icon: LayoutGrid, words: ['Chair', 'Room', 'Bay'] },
];

const CHIP_FONT = 22;
const CHIP_PAD = 22;
const CHIP_ICON = 22;
const CHIP_GAP = 10;

/** Width of each chip label, measured with the loaded DM Sans face. */
const chipWidths = () => {
  const ctx = document.createElement('canvas').getContext('2d');
  return INDUSTRIES.map(({ name }) => {
    if (!ctx) return name.length * CHIP_FONT * 0.55;
    ctx.font = `600 ${CHIP_FONT}px 'DM Sans'`;
    return ctx.measureText(name).width;
  }).map((w) => Math.ceil(w) + CHIP_PAD * 2 + CHIP_ICON + CHIP_GAP);
};

export const Industries = () => {
  const frame = useCurrentFrame();
  const widths = useMemo(chipWidths, []);
  const chipWidth = widths.slice(1).reduce((w, next, i) => mix(ease(frame, PHASES[i + 1], 20), w, next), widths[0]);
  return (
    <SceneFrame>
      <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '0 180px 0 160px' }}>
        <div>
          <Headline lines={[['One engine.'], [{ text: 'Every industry.', accent: true }]]} size={124} />
          <div style={{ fontSize: 30, color: C.text2, marginTop: 34, lineHeight: 1.35, maxWidth: 600, opacity: ease(frame, 22, 26) }}>
            Pick your industry and the words, fields and website follow.
          </div>
        </div>
        <div style={appear(frame, 10)}>
          <Card style={{ width: 620, padding: 40, boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 20, color: C.text2 }}>Industry</div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: CHIP_GAP,
                  height: 52,
                  width: chipWidth,
                  boxSizing: 'border-box',
                  overflow: 'hidden',
                  padding: `0 ${CHIP_PAD}px`,
                  borderRadius: RADIUS.full,
                  background: C.lime,
                  color: C.teal,
                  fontSize: CHIP_FONT,
                  fontWeight: 600,
                }}
              >
                <span style={{ display: 'inline-grid', width: CHIP_ICON, height: CHIP_ICON, flexShrink: 0 }}>
                  {INDUSTRIES.map(({ name, Icon }, i) => {
                    const on = ease(frame, PHASES[i], 14) - (i < 2 ? ease(frame, PHASES[i + 1], 10) : 0);
                    return (
                      <Icon key={name} size={CHIP_ICON} strokeWidth={ICON.strokeWidth} style={{ gridArea: '1 / 1', opacity: on }} />
                    );
                  })}
                </span>
                <Swap frame={frame} phases={PHASES} words={INDUSTRIES.map((i) => i.name)} />
              </div>
            </div>
            <div style={{ height: 1, background: C.border, margin: '30px 0 8px' }} />
            {ROWS.map((r, ri) => (
              <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '22px 0', borderBottom: ri < 2 ? `1px solid ${C.borderSubtle}` : 'none' }}>
                <div style={{ width: 56, height: 56, borderRadius: RADIUS.lg, background: C.tealLight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <r.Icon size={26} color={C.teal} strokeWidth={ICON.strokeWidth} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 18, color: C.text2 }}>{r.label}</div>
                  <Swap
                    frame={frame}
                    phases={PHASES}
                    words={r.words}
                    delay={4 + ri * 4}
                    style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-0.04em', marginTop: 2 }}
                  />
                </div>
              </div>
            ))}
          </Card>
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};
