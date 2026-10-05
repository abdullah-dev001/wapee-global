import type { ReactNode } from 'react';
import { Check, Clock, MessageSquare } from 'lucide-react';
import { C, ICON, RADIUS, TYPE, ui } from '../../theme';
import { BOOKING, BOOKING_LINE, CLIENT, SERVICES } from '../../content';
import { ease, mix } from '../../components/motion';
import { Button } from '../../components/Button';
import { IconTile } from '../../components/IconTile';
import { Pill } from '../../components/Pill';

/** Booking card geometry. Layout and cursor targets both read these numbers. */
export const CARD = { w: 620, h: 640, pad: 40 } as const;
const INNER = CARD.w - CARD.pad * 2;
export const CONTENT_TOP = 160;
const TITLE = { h: 36, gap: 20 };
const LIST_TOP = CONTENT_TOP + TITLE.h + TITLE.gap;
const ROW = { h: 92, gap: 14 };
const DAYS = { h: 84, gap: 20 };
const SLOT = { h: 60, gap: 12, w: (INNER - 24) / 3 };
const GRID_TOP = LIST_TOP + DAYS.h + DAYS.gap;
const FIELD = { label: 26, labelGap: 8, h: 60, gap: 18 };
const SUMMARY = { h: 56, gap: 22 };
const PHONE_TOP = LIST_TOP + SUMMARY.h + SUMMARY.gap + (FIELD.label + FIELD.labelGap + FIELD.h + FIELD.gap) + FIELD.label + FIELD.labelGap;
const BUTTON = { top: PHONE_TOP + FIELD.h + 28, h: 64 };

const TIMES = ['9:00', '9:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00'];
const TAKEN = new Set(['10:00', '11:30']);
const PICKED = TIMES.indexOf(BOOKING.time);

export const TARGETS = {
  service: { x: CARD.pad + 210, y: LIST_TOP + ROW.h / 2 },
  time: { x: CARD.pad + (PICKED % 3) * (SLOT.w + SLOT.gap) + SLOT.w / 2, y: GRID_TOP + Math.floor(PICKED / 3) * (SLOT.h + SLOT.gap) + SLOT.h / 2 },
  phone: { x: CARD.pad + 300, y: PHONE_TOP + FIELD.h / 2 },
  confirm: { x: CARD.pad + INNER / 2, y: BUTTON.top + BUTTON.h / 2 },
} as const;

const PHONE = CLIENT.phone;

const Title = ({ children }: { children: string }) => (
  <div style={{ height: TITLE.h, lineHeight: `${TITLE.h}px`, marginBottom: TITLE.gap, fontSize: 28, fontWeight: 600, letterSpacing: '-0.03em' }}>
    {children}
  </div>
);

export const ServiceStep = ({ selected, hover }: { selected: number; hover: number }) => (
  <div>
    <Title>Choose a service</Title>
    <div style={{ display: 'flex', flexDirection: 'column', gap: ROW.gap }}>
      {SERVICES.map(({ name, minutes, Icon }, i) => {
        const on = i === 0 ? selected : 0;
        const lit = on > 0.5;
        return (
          <div
            key={name}
            style={{
              height: ROW.h,
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              padding: '0 20px',
              borderRadius: RADIUS.lg,
              border: `${lit ? 2 : 1}px solid ${lit ? C.teal : C.border}`,
              background: lit ? C.tealLight : i === 0 ? `rgba(243, 244, 246, ${hover})` : C.surface,
            }}
          >
            <IconTile Icon={Icon} tone={lit ? 'white' : 'teal'} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 23, fontWeight: 600 }}>{name}</div>
              <div style={{ fontSize: 18, color: lit ? C.teal : C.text2, display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <Clock size={16} strokeWidth={ICON.strokeWidth} /> {minutes} min
              </div>
            </div>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: RADIUS.full,
                background: C.teal,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: on,
                transform: `scale(${mix(on, 0.97, 1)})`,
              }}
            >
              <Check size={18} color="#fff" strokeWidth={2.5} />
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

const WEEK = [
  ['Mon', '13'],
  ['Tue', '14'],
  ['Wed', '15'],
  ['Thu', '16'],
  ['Fri', '17'],
];

export const TimeStep = ({ selected }: { selected: number }) => (
  <div>
    <Title>Pick a time</Title>
    <div style={{ display: 'flex', gap: 10, height: DAYS.h, marginBottom: DAYS.gap }}>
      {WEEK.map(([d, n]) => {
        const on = d === BOOKING.weekday;
        return (
          <div
            key={d}
            style={{
              flex: 1,
              boxSizing: 'border-box',
              borderRadius: RADIUS.lg,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: on ? C.teal : C.surface,
              border: `1px solid ${on ? C.teal : C.border}`,
              color: on ? '#fff' : C.text,
            }}
          >
            <div style={{ fontSize: 16, color: on ? C.tealLight : C.text2 }}>{d}</div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 2 }}>{n}</div>
          </div>
        );
      })}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(3, ${SLOT.w}px)`, gap: SLOT.gap }}>
      {TIMES.map((t, i) => {
        const taken = TAKEN.has(t);
        const on = i === PICKED && selected > 0.5;
        return (
          <div
            key={t}
            style={{
              height: SLOT.h,
              boxSizing: 'border-box',
              borderRadius: RADIUS.md,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 21,
              fontWeight: 600,
              background: on ? C.teal : C.surface,
              border: `1px solid ${on ? C.teal : C.border}`,
              color: on ? '#fff' : taken ? C.text2 : C.text,
              textDecoration: taken ? 'line-through' : 'none',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {t}
          </div>
        );
      })}
    </div>
  </div>
);

const Label = ({ children }: { children: string }) => (
  <div style={{ height: FIELD.label, lineHeight: `${FIELD.label}px`, marginBottom: FIELD.labelGap, fontSize: ui(13), fontWeight: 600 }}>
    {children}
  </div>
);

const Field = ({ children, focused = false }: { children: ReactNode; focused?: boolean }) => (
  <div
    style={{
      height: FIELD.h,
      boxSizing: 'border-box',
      padding: '0 18px',
      display: 'flex',
      alignItems: 'center',
      fontSize: 22,
      borderRadius: RADIUS.md,
      border: `1px solid ${focused ? C.teal : C.border}`,
      boxShadow: focused ? `0 0 0 ${ui(3)}px ${C.tealLight}` : 'none',
    }}
  >
    {children}
  </div>
);

export const PhoneStep = ({ frame, typed, focused, hover, pressed }: { frame: number; typed: number; focused: boolean; hover: number; pressed: number }) => {
  const caretOn = typed > 0 && typed < PHONE.length ? true : Math.floor(frame / 8) % 2 === 0;
  return (
    <div>
      <Title>Your details</Title>
      <div
        style={{
          height: SUMMARY.h,
          marginBottom: SUMMARY.gap,
          boxSizing: 'border-box',
          padding: '0 20px',
          display: 'flex',
          alignItems: 'center',
          borderRadius: RADIUS.lg,
          background: C.tealLight,
          color: C.teal,
          fontSize: 20,
          fontWeight: 600,
        }}
      >
        {BOOKING.service.name} · {BOOKING.weekday} {BOOKING.date}, {BOOKING.time}
      </div>
      <Label>Full name</Label>
      <Field>{CLIENT.name}</Field>
      <div style={{ height: FIELD.gap }} />
      <Label>Phone number</Label>
      <Field focused={focused}>
        <span style={{ color: C.text2, paddingRight: 14, marginRight: 14, borderRight: `1px solid ${C.border}` }}>{CLIENT.dial}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{PHONE.slice(0, typed)}</span>
        <span style={{ width: 2, height: 26, background: C.teal, marginLeft: 2, opacity: focused && caretOn ? 1 : 0 }} />
      </Field>
      <Button height={BUTTON.h} fontSize={22} hover={hover} pressed={pressed} style={{ marginTop: BUTTON.top - (PHONE_TOP + FIELD.h) }}>
        Confirm booking
      </Button>
    </div>
  );
};

export const Success = ({ frame, start, linkAt }: { frame: number; start: number; linkAt: number }) => {
  const p = ease(frame, start, 22);
  const link = ease(frame, linkAt, 18);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <div
        style={{
          width: 112,
          height: 112,
          borderRadius: RADIUS.full,
          background: C.success,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: p,
          transform: `scale(${mix(p, 0.97, 1)})`,
          boxShadow: `0 0 0 14px ${C.successLight}`,
        }}
      >
        <Check size={58} color="#fff" strokeWidth={2.5} />
      </div>
      <div style={{ ...TYPE.headlineStyle, fontSize: 52, marginTop: 44, opacity: p }}>You&apos;re booked.</div>
      <div style={{ fontSize: 21, color: C.text2, marginTop: 14, opacity: p }}>{BOOKING_LINE}</div>
      <div style={{ marginTop: 34, opacity: link, transform: `translateY(${mix(link, 14, 0)}px)` }}>
        <Pill tone="success" height={52}>
          <MessageSquare size={20} strokeWidth={ICON.strokeWidth} /> Manage booking link sent
        </Pill>
      </div>
    </div>
  );
};
