import { Composition } from 'remotion';
import { Showreel } from './Showreel';
import { VIDEO } from './theme';
import { assertHolds } from './timeline';
import { loadFonts } from './fonts';
import { calculateMetadata } from './audio/metadata';

assertHolds();
loadFonts();

export const RemotionRoot = () => (
  <Composition
    id="Showreel"
    component={Showreel}
    durationInFrames={VIDEO.durationInFrames}
    fps={VIDEO.fps}
    width={VIDEO.width}
    height={VIDEO.height}
    defaultProps={{ voFrames: null }}
    calculateMetadata={calculateMetadata}
  />
);
