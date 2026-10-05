import { useCurrentFrame } from 'remotion';
import { Globe, Star } from 'lucide-react';
import { C, ICON, RADIUS } from '../theme';
import { T } from '../timeline';
import { BOOKING, BUSINESS, CLIENT, REVIEW } from '../content';
import { Scene } from '../components/Scene';
import { StackLayout } from '../components/Layout';
import { Card } from '../components/Card';
import { Avatar } from '../components/Avatar';
import { appear, ease, mix } from '../components/motion';

const R = T.reviews;

export const Reviews = () => {
  const frame = useCurrentFrame();
  const reply = ease(frame, R.reply, 22);
  const featured = ease(frame, R.featured, 18);
  return (
    <Scene>
      <StackLayout headline={[['Reviews that', { text: 'build trust.', accent: true }]]} headlineAt={R.headline} gap={72}>
        <div style={appear(frame, R.card, 56)}>
          <Card style={{ width: 920, padding: 42, boxSizing: 'border-box', color: C.text }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Avatar initials={CLIENT.initials} size={56} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 23, fontWeight: 600 }}>{CLIENT.short}</div>
                <div style={{ fontSize: 18, color: C.text2 }}>
                  {BOOKING.service.name} with {BOOKING.staff} · {REVIEW.when}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {Array.from({ length: REVIEW.stars }, (_, i) => {
                  const p = ease(frame, R.stars + i * R.starStep, 12);
                  return (
                    <div key={i} style={{ display: 'grid' }}>
                      <Star size={32} color={C.border} strokeWidth={ICON.strokeWidth} style={{ gridArea: '1 / 1' }} />
                      <Star size={32} color={C.star} fill={C.star} strokeWidth={ICON.strokeWidth} style={{ gridArea: '1 / 1', opacity: p, transform: `scale(${mix(p, 0.8, 1)})` }} />
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.03em', marginTop: 28, lineHeight: 1.3, textIndent: '-0.42em', textWrap: 'balance' }}>
              &ldquo;{REVIEW.text}&rdquo;
            </div>
            <div
              style={{
                marginTop: 28,
                padding: '18px 22px',
                borderRadius: RADIUS.lg,
                background: C.bg,
                borderLeft: `4px solid ${C.teal}`,
                opacity: reply,
                transform: `translateY(${mix(reply, 16, 0)}px)`,
              }}
            >
              <div style={{ fontSize: 17, fontWeight: 600, color: C.teal }}>Reply from {BUSINESS.name}</div>
              <div style={{ fontSize: 21, marginTop: 4 }}>{REVIEW.reply}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20, fontSize: 18, color: C.text2, opacity: featured }}>
              <Globe size={18} strokeWidth={ICON.strokeWidth} /> Featured on your website
            </div>
          </Card>
        </div>
      </StackLayout>
    </Scene>
  );
};
