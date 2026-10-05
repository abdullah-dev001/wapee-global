import { Composition } from 'remotion';
import { Showreel } from './Showreel';
import { VIDEO } from './theme';
import { loadFonts } from './fonts';

loadFonts();

export const RemotionRoot = () => (
  <Composition
    id="Showreel"
    component={Showreel}
    durationInFrames={VIDEO.durationInFrames}
    fps={VIDEO.fps}
    width={VIDEO.width}
    height={VIDEO.height}
  />
);
