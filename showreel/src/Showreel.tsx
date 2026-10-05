import type { ComponentType } from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { C, SCENES, SCENE_ORDER, type SceneKey } from './theme';
import { sceneStart, transitionFrames, transitionInto, transitionOutOf } from './timeline';
import { SceneTimingProvider } from './components/Scene';
import { Soundtrack } from './audio/Soundtrack';
import type { ShowreelProps } from './audio/metadata';
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

/** Scenes overlap by their outgoing transition; the incoming scene renders on top. */
export const Showreel = ({ voFrames }: ShowreelProps) => (
  <AbsoluteFill style={{ background: C.bg }}>
    {SCENE_ORDER.map((key, i) => {
      const SceneComponent = COMPONENTS[key];
      const outType = transitionOutOf(key);
      return (
        <Sequence key={key} name={key} from={sceneStart(key)} durationInFrames={SCENES[key].frames + transitionFrames(outType)}>
          <SceneTimingProvider value={{ scene: key, inType: transitionInto(key), outType, dir: i % 2 === 0 ? 1 : -1 }}>
            <SceneComponent />
          </SceneTimingProvider>
        </Sequence>
      );
    })}
    <Soundtrack voFrames={voFrames} />
  </AbsoluteFill>
);
