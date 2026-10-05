import { useCurrentFrame } from 'remotion';
import { Bell, Mail, MessageSquare, type LucideIcon } from 'lucide-react';
import { C, RADIUS } from '../theme';
import { T } from '../timeline';
import { BOOKING, BUSINESS, CLIENT } from '../content';
import { Scene } from '../components/Scene';
import { StackLayout } from '../components/Layout';
import { Card } from '../components/Card';
import { IconTile } from '../components/IconTile';
import { Divider } from '../components/Divider';
import { appear } from '../components/motion';

const N = T.notifications;

type Note = { Icon: LucideIcon; channel: string; to: string; meta: string; title: string; body: string; action?: string };

/** Left to right on screen; audio/cues.ts pans each card's chime to match. */
const NOTES: Note[] = [
  {
    Icon: Mail,
    channel: 'Email',
    to: 'To client',
    meta: '9:41',
    title: 'Your booking is confirmed',
    body: `Hi ${CLIENT.first}, see you on ${BOOKING.weekday} ${BOOKING.date} at ${BOOKING.time} with ${BOOKING.staff}.`,
    action: 'Manage booking',
  },
  {
    Icon: MessageSquare,
    channel: 'SMS',
    to: 'To client',
    meta: 'Delivered',
    title: 'Reminder for tomorrow',
    body: `${BUSINESS.name}: your ${BOOKING.service.name} is tomorrow at ${BOOKING.time}. Need to change it? Use your booking link.`,
  },
  {
    Icon: Bell,
    channel: 'Push',
    to: 'To your team',
    meta: 'Just now',
    title: 'New booking',
    body: `${CLIENT.name} booked ${BOOKING.service.name}, ${BOOKING.weekday} ${BOOKING.time} with ${BOOKING.staff}.`,
  },
];

const CARD_W = 520;
const OFFSETS = [0, 34, 10];

export const Notifications = () => {
  const frame = useCurrentFrame();
  return (
    <Scene>
      <StackLayout headline={[['Everyone stays', { text: 'in the loop.', accent: true }]]} headlineAt={N.headline} gap={72}>
        <div style={{ display: 'flex', gap: 36, alignItems: 'flex-start' }}>
          {NOTES.map((n, i) => {
            const bob = Math.sin((frame - i * 18) / 22) * 6;
            return (
              <div key={n.channel} style={appear(frame, N.cards[i], 64, 30)}>
                <div style={{ transform: `translateY(${bob + OFFSETS[i]}px)` }}>
                  <Card style={{ width: CARD_W, padding: 34, boxSizing: 'border-box', color: C.text }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <IconTile Icon={n.Icon} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 22, fontWeight: 600 }}>{n.channel}</div>
                        <div style={{ fontSize: 17, color: C.text2 }}>{n.to}</div>
                      </div>
                      <div style={{ fontSize: 16, color: C.text2 }}>{n.meta}</div>
                    </div>
                    <Divider subtle margin="24px 0" />
                    <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.03em' }}>{n.title}</div>
                    <div style={{ fontSize: 21, color: C.text2, marginTop: 10, lineHeight: 1.45 }}>{n.body}</div>
                    {n.action ? (
                      <div
                        style={{
                          display: 'inline-flex',
                          marginTop: 22,
                          padding: '11px 20px',
                          borderRadius: RADIUS.md,
                          background: C.teal,
                          color: '#fff',
                          fontSize: 18,
                          fontWeight: 600,
                        }}
                      >
                        {n.action}
                      </div>
                    ) : null}
                  </Card>
                </div>
              </div>
            );
          })}
        </div>
      </StackLayout>
    </Scene>
  );
};
