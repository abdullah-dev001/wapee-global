import { Audio, Sequence, staticFile } from 'remotion';
import { MUSIC, VIDEO } from '../theme';
import { abs } from '../timeline';
import { VO } from '../voiceover';
import { CUES } from './cues';
import { BED, createMix, db, sfxVolume, voTiming, voVolume } from './mix';
import type { ShowreelProps } from './metadata';

/** Repeat a seamless loop across the whole video; `volume` receives the absolute frame. */
const Loop = ({ file, frames, volume }: { file: string; frames: number; volume: (f: number) => number }) => (
  <>
    {Array.from({ length: Math.ceil(VIDEO.durationInFrames / frames) }, (_, i) => (
      <Sequence key={i} name={`loop ${file}`} from={i * frames} durationInFrames={frames} layout="none">
        <Audio src={staticFile(file)} volume={(f) => volume(i * frames + f)} />
      </Sequence>
    ))}
  </>
);

/** Buses: bed (+ optional pulse), SFX cues, music, voiceover. Levels and ducking live in mix.ts. */
export const Soundtrack = ({ voFrames }: ShowreelProps) => {
  const vo = voTiming(voFrames);
  const { bedVolume, musicVolume } = createMix(vo);
  return (
    <>
      <Loop file={BED.file} frames={BED.loopFrames} volume={bedVolume} />
      {BED.pulse ? <Loop file={BED.pulseFile} frames={BED.pulseLoopFrames} volume={(f) => bedVolume(f) * db(BED.pulseDb)} /> : null}
      {CUES.map((c, i) => (
        <Sequence key={i} name={`sfx ${c.sound}`} from={abs(c.scene, c.frame)} layout="none">
          <Audio src={staticFile(`sfx/${c.sound}.wav`)} volume={sfxVolume(c.db)} />
        </Sequence>
      ))}
      {MUSIC ? <Audio src={staticFile(MUSIC)} volume={musicVolume} /> : null}
      {VO.lines.map((l, i) =>
        vo[i] ? (
          <Sequence key={l.file} name={`vo ${l.scene}`} from={vo[i].start} durationInFrames={vo[i].frames} layout="none">
            <Audio src={staticFile(l.file)} volume={voVolume} />
          </Sequence>
        ) : null,
      )}
    </>
  );
};
