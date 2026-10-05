import { memo } from 'react';
import { Clock, Star } from 'lucide-react';
import { C, ICON, RADIUS, TYPE } from '../../theme';
import { BUSINESS, CLIENT, REVIEW, SERVICES } from '../../content';
import { Button } from '../../components/Button';
import { IconTile } from '../../components/IconTile';

/** The single-page business website. Heights are fixed so the cursor can target elements. */
export const SITE = { padX: 48, nav: 88, hero: 360, heroPad: 64, gap: 52, heading: 40, headingGap: 22, card: 224, cardPad: 26, review: 190, bottom: 40 } as const;
const SERVICES_TOP = SITE.nav + SITE.hero + SITE.gap + SITE.heading + SITE.headingGap;
export const PAGE_H = SERVICES_TOP + SITE.card + SITE.gap + SITE.review + SITE.bottom;

const HERO_TITLE = 82;
const HERO_SUB = { gap: 18, h: 31 };
const HERO_BUTTON = { gap: 36, h: 62, w: 176 };

/** Page-space targets (before scrolling). */
export const SITE_TARGETS = {
  heroBook: { x: SITE.padX + SITE.heroPad + HERO_BUTTON.w / 2, y: SITE.nav + SITE.heroPad + HERO_TITLE + HERO_SUB.gap + HERO_SUB.h + HERO_BUTTON.gap + HERO_BUTTON.h / 2 },
  serviceBook: { x: SITE.padX + SITE.cardPad + 22, y: SERVICES_TOP + SITE.card - SITE.cardPad - 12 },
} as const;

const Nav = memo(() => (
  <div style={{ height: SITE.nav, display: 'flex', alignItems: 'center', gap: 34 }}>
    <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', flex: 1 }}>{BUSINESS.name}</div>
    {['Services', 'Reviews', 'Contact'].map((l) => (
      <div key={l} style={{ fontSize: 18, color: C.text2 }}>
        {l}
      </div>
    ))}
    <Button height={46} fontSize={17}>
      Book now
    </Button>
  </div>
));

const Services = memo(({ bookPressed }: { bookPressed: number }) => (
  <div style={{ display: 'flex', gap: 20 }}>
    {SERVICES.map(({ name, minutes, Icon }, i) => (
      <div key={name} style={{ flex: 1, height: SITE.card, boxSizing: 'border-box', border: `1px solid ${C.border}`, borderRadius: RADIUS.lg, padding: SITE.cardPad }}>
        <IconTile Icon={Icon} size={50} />
        <div style={{ fontSize: 22, fontWeight: 600, marginTop: 18 }}>{name}</div>
        <div style={{ fontSize: 18, color: C.text2, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Clock size={16} strokeWidth={ICON.strokeWidth} /> {minutes} min
        </div>
        <div
          style={{
            display: 'inline-block',
            fontSize: 18,
            fontWeight: 600,
            color: i === 0 && bookPressed > 0.5 ? C.tealHover : C.teal,
            marginTop: 18,
            textDecoration: i === 0 && bookPressed > 0 ? 'underline' : 'none',
          }}
        >
          Book
        </div>
      </div>
    ))}
  </div>
));

const Review = memo(() => (
  <div style={{ height: SITE.review, boxSizing: 'border-box', border: `1px solid ${C.border}`, borderRadius: RADIUS.lg, padding: '34px 38px' }}>
    <div style={{ display: 'flex', gap: 6 }}>
      {Array.from({ length: REVIEW.stars }, (_, i) => (
        <Star key={i} size={26} color={C.star} fill={C.star} strokeWidth={ICON.strokeWidth} />
      ))}
    </div>
    <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.03em', marginTop: 18, textIndent: '-0.42em' }}>&ldquo;{REVIEW.text}&rdquo;</div>
    <div style={{ fontSize: 18, color: C.text2, marginTop: 12 }}>{CLIENT.short}</div>
  </div>
));

export const Site = ({ heroHover, bookPressed }: { heroHover: number; bookPressed: number }) => (
  <div style={{ padding: `0 ${SITE.padX}px ${SITE.bottom}px`, height: PAGE_H, boxSizing: 'border-box' }}>
    <Nav />
    <div style={{ height: SITE.hero, boxSizing: 'border-box', background: C.teal, borderRadius: 22, padding: SITE.heroPad, color: '#fff' }}>
      <div style={{ ...TYPE.headlineStyle, fontSize: 80, height: HERO_TITLE }}>Book your next visit.</div>
      <div style={{ fontSize: 24, color: C.tealMuted, marginTop: HERO_SUB.gap, height: HERO_SUB.h }}>{BUSINESS.blurb}</div>
      <Button variant="lime" height={HERO_BUTTON.h} fontSize={21} hover={heroHover} style={{ width: HERO_BUTTON.w, boxSizing: 'border-box', marginTop: HERO_BUTTON.gap }}>
        Book now
      </Button>
    </div>
    <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em', height: SITE.heading, marginTop: SITE.gap, marginBottom: SITE.headingGap }}>Services</div>
    <Services bookPressed={bookPressed} />
    <div style={{ height: SITE.gap }} />
    <Review />
  </div>
);
