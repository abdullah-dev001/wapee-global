import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Globe, Star } from 'lucide-react';
import { C, ICON, RADIUS } from '../theme';
import { Headline } from '../components/Headline';
import { SceneFrame } from '../components/SceneFrame';
import { Card } from '../components/Card';
import { appear, ease, mix } from '../components/motion';

/** Local timeline, shared with the SFX cue list. */
export const REVIEWS_T = { card: 8, stars: 18, starStep: 4, reply: 44 } as const;

export const Reviews = () => {
  const frame = useCurrentFrame();
  const T = REVIEWS_T;
  const reply = ease(frame, T.reply, 22);
  const web = ease(frame, T.reply + 12, 18);
  return (
    <SceneFrame dark>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', paddingBottom: 20 }}>
        <Headline
          lines={[['Reviews that', { text: 'build trust.', accent: true }]]}
          size={108}
          color="#fff"
          accent={C.lime}
          align="center"
          start={4}
        />
        <div style={{ marginTop: 76, ...appear(frame, T.card, 60) }}>
          <Card onTeal style={{ width: 900, padding: 40, boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 54, height: 54, borderRadius: 27, background: C.tealLight, color: C.teal, fontWeight: 700, fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                PR
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 23, fontWeight: 600, color: C.text }}>Priya R.</div>
                <div style={{ fontSize: 17, color: C.text2 }}>Colour & gloss with Mei · 2 days ago</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[0, 1, 2, 3, 4].map((i) => {
                  const p = ease(frame, T.stars + i * T.starStep, 12);
                  return (
                    <div key={i} style={{ display: 'grid' }}>
                      <Star size={30} color={C.border} strokeWidth={ICON.strokeWidth} style={{ gridArea: '1 / 1' }} />
                      <Star
                        size={30}
                        color={C.star}
                        fill={C.star}
                        strokeWidth={ICON.strokeWidth}
                        style={{ gridArea: '1 / 1', opacity: p, transform: `scale(${mix(p, 0.97, 1)})` }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.03em', color: C.text, marginTop: 26, lineHeight: 1.3 }}>
              &ldquo;Lovely team, easy to book, and they remembered every detail from last time.&rdquo;
            </div>
            <div
              style={{
                marginTop: 26,
                padding: '18px 22px',
                borderRadius: RADIUS.lg,
                background: C.bg,
                borderLeft: `4px solid ${C.teal}`,
                opacity: reply,
                transform: `translateY(${mix(reply, 16, 0)}px)`,
              }}
            >
              <div style={{ fontSize: 17, fontWeight: 600, color: C.teal }}>Reply from Studio Nova</div>
              <div style={{ fontSize: 20, color: C.text, marginTop: 4 }}>Thank you, Priya! See you at your next visit.</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20, fontSize: 17, color: C.text2, opacity: web }}>
              <Globe size={17} strokeWidth={ICON.strokeWidth} /> Featured on your website
            </div>
          </Card>
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};
