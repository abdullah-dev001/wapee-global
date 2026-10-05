import { staticFile, type CalculateMetadataFunction } from 'remotion';
import { VIDEO } from '../theme';
import { VO } from '../voiceover';

export type ShowreelProps = { voFrames: number[] | null };

/** Decode a file in the browser to learn its exact length (no extra dependency). */
const lengthInFrames = async (file: string) => {
  const res = await fetch(staticFile(file));
  if (!res.ok) throw new Error(`Voiceover is enabled but public/${file} is missing (HTTP ${res.status}).`);
  const audio = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(await res.arrayBuffer());
  return Math.ceil(audio.duration * VIDEO.fps);
};

/** Runs before rendering: measures each voiceover line so ducking follows the real recordings. */
export const calculateMetadata: CalculateMetadataFunction<ShowreelProps> = async () => ({
  props: { voFrames: VO.enabled ? await Promise.all(VO.lines.map((l) => lengthInFrames(l.file))) : null },
});
