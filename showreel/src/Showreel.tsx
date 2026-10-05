import type { ComponentType, ReactNode } from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { C, CROSSFADE, MUSIC, SCENES, SCENE_ORDER, VIDEO, sceneStart, type SceneKey } from './theme';
import { ease } from './components/motion';
import { CUES, SFX_GAIN } from './sfx';
import { VO, voMaxFrames, voStart } from './voiceover';
import { Hook } from './scenes/Hook';
import { Booking } from './scenes/Booking';
import { Calendar } from './scenes/Calendar';
import { Notifications } from './scenes/Notifications';
import { Clients } from './scenes/Clients';
import { Money } from './scenes/Money';
import { Packages } from './scenes/Packages';
import { Forms } from './scenes/Forms';
import { Reviews } from './scenes/Reviews';
import { Website } from './scenes/Website';
import { Team } from './scenes/Team';
import { Industries } from './scenes/Industries';
import { Close } from './scenes/Close';

const COMPONENTS: Record<SceneKey, ComponentType> = {
  hook: Hook,
  booking: Booking,
  calendar: Calendar,
  notifications: Notifications,
  clients: Clients,
  money: Money,
  packages: Packages,
  forms: Forms,
  reviews: Reviews,
  website: Website,
  team: Team,
  industries: Industries,
  close: Close,
};

const FadeIn = ({ children, first }: { children: ReactNode; first: boolean }) => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ opacity: first ? 1 : ease(frame, 0, CROSSFADE) }}>{children}</AbsoluteFill>;
};

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** 1 normally, VO.duckTo while a voice line plays, with smooth ramps. */
const duck = (f: number) => {
  if (!VO.enabled) return 1;
  let depth = 0;
  for (const l of VO.lines) {
    const start = voStart(l);
    const end = start + voMaxFrames(l);
    const r = VO.duckRamp;
    depth = Math.max(depth, interpolate(f, [start - r, start, end, end + r], [0, 1, 1, 0], clamp));
  }
  return 1 - depth * (1 - VO.duckTo);
};

const musicVolume = (f: number) =>
  interpolate(f, [0, 20, VIDEO.durationInFrames - 45, VIDEO.durationInFrames], [0, 1, 1, 0], clamp) * duck(f);

export const Showreel = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    {SCENE_ORDER.map((key, i) => {
      const Scene = COMPONENTS[key];
      const isLast = i === SCENE_ORDER.length - 1;
      return (
        <Sequence key={key} name={key} from={sceneStart(key)} durationInFrames={SCENES[key] + (isLast ? 0 : CROSSFADE)}>
          <FadeIn first={i === 0}>
            <Scene />
          </FadeIn>
        </Sequence>
      );
    })}
    {CUES.map((cue, i) => (
      <Sequence key={`sfx-${i}`} name={`sfx ${cue.file}`} from={sceneStart(cue.scene) + cue.frame} layout="none">
        <Audio src={staticFile(`sfx/${cue.file}.wav`)} volume={cue.volume * SFX_GAIN} />
      </Sequence>
    ))}
    {VO.enabled &&
      VO.lines.map((l) => (
        <Sequence key={l.file} name={`vo ${l.scene}`} from={voStart(l)} durationInFrames={voMaxFrames(l) + 16} layout="none">
          <Audio src={staticFile(l.file)} volume={VO.volume} />
        </Sequence>
      ))}
    {MUSIC ? <Audio src={staticFile(MUSIC)} volume={musicVolume} /> : null}
  </AbsoluteFill>
);
