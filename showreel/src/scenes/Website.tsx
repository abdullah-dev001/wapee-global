import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Clock, Code2, Lock, Palette, Scissors, Sparkles, Star } from 'lucide-react';
import { BRAND, C, ICON, RADIUS, SHADOW, TYPE } from '../theme';
import { Headline } from '../components/Headline';
import { SceneFrame } from '../components/SceneFrame';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { appear, ease, mix } from '../components/motion';

const W = 1000;
const H = 700;
const CHROME = 56;
const SCROLL = 450;

const SERVICES = [
  { name: 'Haircut & style', time: '45 min', Icon: Scissors },
  { name: 'Beard trim', time: '20 min', Icon: Sparkles },
  { name: 'Colour & gloss', time: '90 min', Icon: Palette },
];

const Site = () => (
  <div style={{ padding: '0 40px 40px' }}>
    <div style={{ height: 84, display: 'flex', alignItems: 'center', gap: 34 }}>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', flex: 1 }}>Studio Nova</div>
      {['Services', 'Reviews', 'Contact'].map((l) => (
        <div key={l} style={{ fontSize: 18, color: C.text2 }}>
          {l}
        </div>
      ))}
      <Button height={44} fontSize={17}>
        Book now
      </Button>
    </div>
    <div style={{ background: C.teal, borderRadius: 22, padding: '70px 64px', color: '#fff' }}>
      <div style={{ ...TYPE.headline, fontSize: 76 }}>Book your next visit.</div>
      <div style={{ fontSize: 23, color: C.tealMuted, marginTop: 18 }}>Hair, beard and colour in Camden. Open six days a week.</div>
      <Button variant="lime" height={60} fontSize={21} style={{ display: 'inline-flex', marginTop: 34 }}>
        Book now
      </Button>
    </div>
    <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em', margin: '50px 0 22px' }}>Services</div>
    <div style={{ display: 'flex', gap: 20 }}>
      {SERVICES.map(({ name, time, Icon }) => (
        <div key={name} style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: RADIUS.lg + 4, padding: 26 }}>
          <div style={{ width: 50, height: 50, borderRadius: RADIUS.lg, background: C.tealLight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={24} color={C.teal} strokeWidth={ICON.strokeWidth} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 18 }}>{name}</div>
          <div style={{ fontSize: 17, color: C.text2, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={16} strokeWidth={ICON.strokeWidth} /> {time}
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, color: C.teal, marginTop: 18 }}>Book</div>
        </div>
      ))}
    </div>
    <div style={{ marginTop: 50, border: `1px solid ${C.border}`, borderRadius: RADIUS.lg + 4, padding: '34px 38px' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} size={26} color={C.teal} fill={C.teal} strokeWidth={ICON.strokeWidth} />
        ))}
      </div>
      <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.03em', marginTop: 18 }}>
        &ldquo;Booked in under a minute. Easiest salon I&apos;ve ever used.&rdquo;
      </div>
      <div style={{ fontSize: 18, color: C.text2, marginTop: 12 }}>Priya R.</div>
    </div>
  </div>
);

export const Website = () => {
  const frame = useCurrentFrame();
  const scroll = ease(frame, 50, 62);
  const embed = appear(frame, 100, 50, 28);
  return (
    <SceneFrame>
      <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', padding: '0 110px 0 140px', gap: 60 }}>
        <div style={{ width: 560 }}>
          <Headline lines={[['A booking'], ['website,'], [{ text: 'built in.', accent: true }]]} size={112} />
          <div style={{ fontSize: 30, color: C.text2, marginTop: 34, lineHeight: 1.35, opacity: ease(frame, 26, 26) }}>
            Your services, reviews and a Book now button on one fast page.
          </div>
        </div>
        <div style={{ position: 'relative', ...appear(frame, 12, 60) }}>
          <Card style={{ width: W, height: H }}>
            <div style={{ height: CHROME, display: 'flex', alignItems: 'center', gap: 10, padding: '0 22px', borderBottom: `1px solid ${C.border}`, background: C.bg }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ width: 13, height: 13, borderRadius: 7, background: C.border }} />
              ))}
              <div
                style={{
                  marginLeft: 22,
                  flex: 1,
                  maxWidth: 520,
                  height: 34,
                  borderRadius: RADIUS.md,
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '0 14px',
                  fontSize: 16,
                  color: C.text2,
                }}
              >
                <Lock size={14} strokeWidth={ICON.strokeWidth} /> {BRAND.siteDomain}/studio-nova
              </div>
            </div>
            <div style={{ height: H - CHROME, overflow: 'hidden' }}>
              <div style={{ transform: `translateY(${-mix(scroll, 0, SCROLL)}px)` }}>
                <Site />
              </div>
            </div>
          </Card>
          <div style={{ position: 'absolute', right: -50, bottom: -56, ...embed }}>
            <Card style={{ width: 400, padding: 26, boxShadow: SHADOW.float, borderRadius: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 48, height: 48, borderRadius: RADIUS.lg, background: C.lime, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Code2 size={24} color={C.teal} strokeWidth={ICON.strokeWidth} />
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 600 }}>Embed anywhere</div>
                  <div style={{ fontSize: 17, color: C.text2, marginTop: 2 }}>Add booking to the site you have.</div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};
