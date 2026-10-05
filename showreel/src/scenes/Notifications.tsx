import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Bell, Mail, MessageSquare } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { C, ICON, RADIUS } from '../theme';
import { Headline } from '../components/Headline';
import { SceneFrame } from '../components/SceneFrame';
import { Card } from '../components/Card';
import { appear } from '../components/motion';

type Note = { Icon: LucideIcon; channel: string; to: string; title: string; body: string; meta: string };

const NOTES: Note[] = [
  {
    Icon: Mail,
    channel: 'Email',
    to: 'To client',
    title: 'Your booking is confirmed',
    body: 'Hi Sara, see you on Tue 14 Oct at 10:30 with Amira.',
    meta: 'Manage booking',
  },
  {
    Icon: MessageSquare,
    channel: 'SMS',
    to: 'To client',
    title: 'Reminder for tomorrow',
    body: 'Studio Nova: your Haircut & style is tomorrow at 10:30. Need to change it? Use your booking link.',
    meta: 'Delivered',
  },
  {
    Icon: Bell,
    channel: 'Push',
    to: 'To your team',
    title: 'New booking',
    body: 'Noor A. booked Haircut & style at 11:30 with Daniel.',
    meta: 'Just now',
  },
];

/** Local timeline, shared with the SFX cue list. */
export const NOTIFICATIONS_T = { first: 22, step: 14, land: 8 } as const;

export const Notifications = () => {
  const frame = useCurrentFrame();
  return (
    <SceneFrame dark>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', paddingBottom: 40 }}>
        <Headline
          lines={[['Everyone stays', { text: 'in the loop.', accent: true }]]}
          size={112}
          color="#fff"
          accent={C.lime}
          align="center"
        />
        <div style={{ display: 'flex', gap: 40, marginTop: 100, alignItems: 'flex-start' }}>
          {NOTES.map((n, i) => {
            const bob = Math.sin((frame - i * 18) / 22) * 7;
            const offset = [0, 36, 8][i];
            return (
              <div key={n.channel} style={{ ...appear(frame, NOTIFICATIONS_T.first + i * NOTIFICATIONS_T.step, 70, 30) }}>
                <div style={{ transform: `translateY(${bob + offset}px)` }}>
                  <Card onTeal style={{ width: 470, padding: 32, boxSizing: 'border-box' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div
                        style={{ width: 52, height: 52, borderRadius: RADIUS.lg, background: C.tealLight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <n.Icon size={26} color={C.teal} strokeWidth={ICON.strokeWidth} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 22, fontWeight: 600, color: C.text }}>{n.channel}</div>
                        <div style={{ fontSize: 17, color: C.text2 }}>{n.to}</div>
                      </div>
                      <div style={{ fontSize: 16, color: C.text3 }}>{n.meta === 'Manage booking' ? '9:41' : n.meta}</div>
                    </div>
                    <div style={{ height: 1, background: C.borderSubtle, margin: '24px 0' }} />
                    <div style={{ fontSize: 25, fontWeight: 600, color: C.text, letterSpacing: '-0.03em' }}>{n.title}</div>
                    <div style={{ fontSize: 20, color: C.text2, marginTop: 10, lineHeight: 1.45 }}>{n.body}</div>
                    {n.meta === 'Manage booking' && (
                      <div
                        style={{
                          display: 'inline-flex',
                          marginTop: 20,
                          padding: '10px 18px',
                          borderRadius: RADIUS.md,
                          background: C.teal,
                          color: '#fff',
                          fontSize: 17,
                          fontWeight: 600,
                        }}
                      >
                        Manage booking
                      </div>
                    )}
                  </Card>
                </div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};
