import { useMemo } from 'react';
import { useCurrentFrame } from 'remotion';
import { Car, CalendarDays, LayoutGrid, Scissors, Stethoscope, User } from 'lucide-react';
import { C, FONT, ICON } from '../theme';
import { T } from '../timeline';
import { Scene } from '../components/Scene';
import { SplitLayout } from '../components/Layout';
import { Card } from '../components/Card';
import { Divider } from '../components/Divider';
import { IconTile } from '../components/IconTile';
import { Pill } from '../components/Pill';
import { Swap } from '../components/Swap';
import { appear, ease, mix } from '../components/motion';

const I = T.industries;
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

const CHIP = { h: 52, font: 21, icon: 22, gap: 10 };

/** Chip width per industry, measured with the loaded DM Sans face. */
const chipWidths = () => {
  const ctx = document.createElement('canvas').getContext('2d');
  return INDUSTRIES.map(({ name }) => {
    if (!ctx) return name.length * CHIP.font * 0.55;
    ctx.font = `600 ${CHIP.font}px ${FONT}`;
    return ctx.measureText(name).width;
  }).map((w) => Math.ceil(w) + Math.round(CHIP.h * 0.42) * 2 + CHIP.icon + CHIP.gap);
};

export const Industries = () => {
  const frame = useCurrentFrame();
  const widths = useMemo(chipWidths, []);
  const chipWidth = widths.slice(1).reduce((w, next, i) => mix(ease(frame, I.phases[i + 1], I.swapFrames + 4), w, next), widths[0]);
  return (
    <Scene>
      <SplitLayout
        headline={[['One engine.'], [{ text: 'Every industry.', accent: true }]]}
        headlineAt={I.headline}
        sub="Pick your industry and the words, fields and website follow."
        subAt={I.sub}
      >
        <div style={appear(frame, I.card)}>
          <Card style={{ width: 620, padding: 40, boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 20, color: C.text2 }}>Industry</div>
              <Pill height={CHIP.h} style={{ width: chipWidth, overflow: 'hidden', fontSize: CHIP.font, gap: CHIP.gap }}>
                <span style={{ display: 'inline-grid', width: CHIP.icon, height: CHIP.icon, flexShrink: 0 }}>
                  {INDUSTRIES.map(({ name, Icon }, i) => {
                    const on = ease(frame, I.phases[i], 12) - (i < INDUSTRIES.length - 1 ? ease(frame, I.phases[i + 1], 8) : 0);
                    return <Icon key={name} size={CHIP.icon} strokeWidth={ICON.strokeWidth} style={{ gridArea: '1 / 1', opacity: on }} />;
                  })}
                </span>
                <Swap frame={frame} phases={I.phases} words={INDUSTRIES.map((x) => x.name)} frames={I.swapFrames} />
              </Pill>
            </div>
            <Divider margin="30px 0 8px" />
            {ROWS.map((r, ri) => (
              <div key={r.label}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '22px 0' }}>
                  <IconTile Icon={r.Icon} size={56} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 18, color: C.text2 }}>{r.label}</div>
                    <Swap
                      frame={frame}
                      phases={I.phases}
                      words={r.words}
                      delay={ri * I.rowDelay}
                      frames={I.swapFrames}
                      style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-0.04em', marginTop: 2 }}
                    />
                  </div>
                </div>
                {ri < ROWS.length - 1 ? <Divider subtle /> : null}
              </div>
            ))}
          </Card>
        </div>
      </SplitLayout>
    </Scene>
  );
};
