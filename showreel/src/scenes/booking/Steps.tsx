import { Check, Clock, Scissors, Sparkles, Palette, MessageSquare } from 'lucide-react';
import { C, ICON, RADIUS, TYPE } from '../../theme';
import { ease, mix } from '../../components/motion';
import { Button } from '../../components/Button';

const title = { fontSize: 30, fontWeight: 600, letterSpacing: '-0.03em', marginBottom: 22 } as const;

const SERVICES = [
  { name: 'Haircut & style', time: '45 min', Icon: Scissors },
  { name: 'Beard trim', time: '20 min', Icon: Sparkles },
  { name: 'Colour & gloss', time: '90 min', Icon: Palette },
];

export const ServiceStep = ({ selected }: { selected: number }) => (
  <div>
    <div style={title}>Choose a service</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {SERVICES.map(({ name, time, Icon }, i) => {
        const on = i === 0 ? selected : 0;
        return (
          <div
            key={name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              padding: '18px 20px',
              borderRadius: RADIUS.lg + 2,
              border: `${on > 0.5 ? 2 : 1}px solid ${on > 0.5 ? C.teal : C.border}`,
              background: on > 0.5 ? C.tealLight : C.surface,
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: RADIUS.md + 2,
                background: on > 0.5 ? C.surface : C.tealLight,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon size={24} color={C.teal} strokeWidth={ICON.strokeWidth} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 23, fontWeight: 600 }}>{name}</div>
              <div style={{ fontSize: 18, color: C.text2, display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <Clock size={16} strokeWidth={ICON.strokeWidth} /> {time}
              </div>
            </div>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
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

const DAYS = [
  ['Mon', '13'],
  ['Tue', '14'],
  ['Wed', '15'],
  ['Thu', '16'],
  ['Fri', '17'],
];
const TIMES = ['9:00', '9:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00'];
const TAKEN = new Set(['10:00', '11:30']);

export const TimeStep = ({ selected }: { selected: number }) => (
  <div>
    <div style={title}>Pick a time</div>
    <div style={{ display: 'flex', gap: 10, marginBottom: 22 }}>
      {DAYS.map(([d, n]) => {
        const on = d === 'Tue';
        return (
          <div
            key={d}
            style={{
              flex: 1,
              padding: '12px 0',
              borderRadius: RADIUS.lg,
              textAlign: 'center',
              background: on ? C.teal : C.surface,
              border: `1px solid ${on ? C.teal : C.border}`,
              color: on ? '#fff' : C.text,
            }}
          >
            <div style={{ fontSize: 16, opacity: on ? 0.8 : 1, color: on ? '#fff' : C.text2 }}>{d}</div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 2 }}>{n}</div>
          </div>
        );
      })}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
      {TIMES.map((t) => {
        const taken = TAKEN.has(t);
        const on = t === '10:30' && selected > 0.5;
        return (
          <div
            key={t}
            style={{
              height: 58,
              borderRadius: RADIUS.md + 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 21,
              fontWeight: 600,
              background: on ? C.teal : taken ? C.surfaceHover : C.surface,
              border: `1px solid ${on ? C.teal : taken ? C.surfaceHover : C.border}`,
              color: on ? '#fff' : taken ? C.text3 : C.text,
              textDecoration: taken ? 'line-through' : 'none',
            }}
          >
            {t}
          </div>
        );
      })}
    </div>
  </div>
);

export const PHONE = '7700 900 123';
export const KEY_FRAMES = 1.8;

export const PhoneStep = ({ frame, typeStart, pressAt }: { frame: number; typeStart: number; pressAt: number }) => {
  const chars = Math.max(0, Math.min(PHONE.length, Math.floor((frame - typeStart) / KEY_FRAMES)));
  const caretOn = Math.floor(frame / 8) % 2 === 0 || (chars > 0 && chars < PHONE.length);
  const pressed = ease(frame, pressAt, 4) - ease(frame, pressAt + 5, 6);
  const focused = frame >= typeStart - 4 && frame < pressAt;
  return (
    <div>
      <div style={title}>Your details</div>
      <div
        style={{
          padding: '16px 20px',
          borderRadius: RADIUS.lg,
          background: C.tealLight,
          color: C.teal,
          fontSize: 20,
          fontWeight: 600,
          marginBottom: 24,
        }}
      >
        Haircut & style · Tue 14 Oct, 10:30
      </div>
      <Label>Full name</Label>
      <Field>Sara Khan</Field>
      <div style={{ height: 18 }} />
      <Label>Phone number</Label>
      <Field focused={focused}>
        <span style={{ color: C.text2, paddingRight: 14, marginRight: 14, borderRight: `1px solid ${C.border}` }}>+44</span>
        <span>{PHONE.slice(0, chars)}</span>
        <span style={{ width: 2, height: 26, background: C.teal, marginLeft: 2, opacity: focused && caretOn ? 1 : 0 }} />
      </Field>
      <Button height={64} fontSize={22} pressed={pressed} style={{ marginTop: 30 }}>
        Confirm booking
      </Button>
    </div>
  );
};

const Label = ({ children }: { children: string }) => (
  <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>{children}</div>
);

const Field = ({ children, focused = false }: { children: React.ReactNode; focused?: boolean }) => (
  <div
    style={{
      height: 58,
      padding: '0 18px',
      display: 'flex',
      alignItems: 'center',
      fontSize: 22,
      borderRadius: RADIUS.md + 2,
      border: `1px solid ${focused ? C.teal : C.border}`,
      boxShadow: focused ? `0 0 0 4px ${C.tealLight}` : 'none',
    }}
  >
    {children}
  </div>
);

export const Success = ({ frame, start }: { frame: number; start: number }) => {
  const p = ease(frame, start, 22);
  const link = ease(frame, start + 12, 22);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <div
        style={{
          width: 116,
          height: 116,
          borderRadius: 58,
          background: C.success,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: p,
          transform: `scale(${mix(p, 0.97, 1)})`,
          boxShadow: `0 0 0 14px ${C.successLight}`,
        }}
      >
        <Check size={60} color="#fff" strokeWidth={2.5} />
      </div>
      <div style={{ ...TYPE.headline, fontSize: 56, marginTop: 44, opacity: p }}>You&apos;re booked.</div>
      <div style={{ fontSize: 22, color: C.text2, marginTop: 14, opacity: p }}>
        Tue 14 Oct · 10:30 · Haircut & style with Amira
      </div>
      <div
        style={{
          marginTop: 36,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 22px',
          borderRadius: RADIUS.full,
          background: C.successLight,
          border: `1px solid ${C.successBorder}`,
          color: '#047857',
          fontSize: 20,
          fontWeight: 600,
          opacity: link,
          transform: `translateY(${mix(link, 16, 0)}px)`,
        }}
      >
        <MessageSquare size={20} strokeWidth={ICON.strokeWidth} /> Manage booking link sent
      </div>
    </div>
  );
};
