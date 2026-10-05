import type { ComponentType } from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { C, CROSSFADE, MUSIC, SCENES, VIDEO } from './theme';
import { ease } from './components/motion';
import { Hook } from './scenes/Hook';
import { Booking } from './scenes/Booking';
import { Calendar } from './scenes/Calendar';
import { Notifications } from './scenes/Notifications';
import { Money } from './scenes/Money';
import { Website } from './scenes/Website';
import { Industries } from './scenes/Industries';
import { Close } from './scenes/Close';

const ORDER: Array<[keyof typeof SCENES, ComponentType]> = [
  ['hook', Hook],
  ['booking', Booking],
  ['calendar', Calendar],
  ['notifications', Notifications],
  ['money', Money],
  ['website', Website],
  ['industries', Industries],
  ['close', Close],
];

const FadeIn = ({ children, first }: { children: React.ReactNode; first: boolean }) => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ opacity: first ? 1 : ease(frame, 0, CROSSFADE) }}>{children}</AbsoluteFill>;
};

const musicVolume = (f: number) =>
  interpolate(f, [0, 20, VIDEO.durationInFrames - 45, VIDEO.durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

export const Showreel = () => {
  let from = 0;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {ORDER.map(([key, Scene], i) => {
        const length = SCENES[key];
        const start = from;
        from += length;
        const isLast = i === ORDER.length - 1;
        return (
          <Sequence key={key} name={key} from={start} durationInFrames={length + (isLast ? 0 : CROSSFADE)}>
            <FadeIn first={i === 0}>
              <Scene />
            </FadeIn>
          </Sequence>
        );
      })}
      {MUSIC ? <Audio src={staticFile(MUSIC)} volume={musicVolume} /> : null}
    </AbsoluteFill>
  );
};
