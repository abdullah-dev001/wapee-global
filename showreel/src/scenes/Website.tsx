import { useCurrentFrame } from 'remotion';
import { Code2, Lock } from 'lucide-react';
import { BRAND, C, ICON, RADIUS } from '../theme';
import { T } from '../timeline';
import { BUSINESS } from '../content';
import { Depth, Scene } from '../components/Scene';
import { StackLayout } from '../components/Layout';
import { Card } from '../components/Card';
import { Toast } from '../components/Toast';
import { Cursor, cursorAt, pressAt, type Waypoint } from '../components/Cursor';
import { appear, ease, mix } from '../components/motion';
import { PAGE_H, Site, SITE_TARGETS } from './website/Site';

const W = T.website;
const BROWSER = { w: 1240, h: 676, chrome: 56 };
// Scroll exactly to the end of the page, so no sliver of the hero is left showing.
const SCROLL = PAGE_H - (BROWSER.h - BROWSER.chrome);

/** Page point → browser-card point at a given scroll offset. */
const onScreen = (p: { x: number; y: number }, scroll: number) => ({ x: p.x, y: BROWSER.chrome + p.y - scroll });

const PATH: Waypoint[] = [
  { at: W.cursorIn, x: BROWSER.w - 260, y: BROWSER.h - 110 },
  { at: W.hoverHero, ...onScreen(SITE_TARGETS.heroBook, 0), travel: 14 },
  { at: W.clickBook, ...onScreen(SITE_TARGETS.serviceBook, SCROLL), click: true, travel: 14 },
];

export const Website = () => {
  const frame = useCurrentFrame();
  const scroll = mix(ease(frame, W.scroll, W.scrollFrames), 0, SCROLL);
  const tip = cursorAt(frame, PATH);
  const hero = onScreen(SITE_TARGETS.heroBook, scroll);
  const heroHover = Math.max(0, 1 - Math.hypot(tip.x - hero.x, tip.y - hero.y) / 90);
  const embed = appear(frame, W.embed, 40, 24);
  return (
    <Scene>
      <StackLayout headline={[['A booking website,', { text: 'built in.', accent: true }]]} headlineAt={W.headline}>
        <div style={{ position: 'relative', width: BROWSER.w, height: BROWSER.h, ...appear(frame, W.browser, 56) }}>
          <Card style={{ width: BROWSER.w, height: BROWSER.h, borderRadius: 20 }}>
            <div style={{ height: BROWSER.chrome, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 10, padding: '0 22px', borderBottom: `1px solid ${C.border}`, background: C.bg }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ width: 13, height: 13, borderRadius: 7, background: C.border }} />
              ))}
              <div
                style={{
                  marginLeft: 22,
                  width: 520,
                  height: 34,
                  boxSizing: 'border-box',
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
                <Lock size={14} strokeWidth={ICON.strokeWidth} /> {BRAND.siteDomain}/{BUSINESS.slug}
              </div>
            </div>
            <div style={{ height: BROWSER.h - BROWSER.chrome, overflow: 'hidden' }}>
              <div style={{ transform: `translateY(${-scroll}px)` }}>
                <Site heroHover={heroHover} bookPressed={pressAt(frame, W.clickBook) + (frame > W.clickBook ? 1 : 0)} />
              </div>
            </div>
          </Card>
          <div style={{ position: 'absolute', right: -40, bottom: -40, ...embed }}>
            <Depth z={1.6}>
              <Toast Icon={Code2} title="Embed anywhere" detail="Add booking to the site you already have." width={470} />
            </Depth>
          </div>
          <Cursor path={PATH} />
        </div>
      </StackLayout>
    </Scene>
  );
};
