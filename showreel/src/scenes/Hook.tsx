import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, TYPE } from '../theme';
import { T } from '../timeline';
import { Headline } from '../components/Headline';
import { Depth, Scene } from '../components/Scene';
import { ease } from '../components/motion';

export const Hook = () => {
  const frame = useCurrentFrame();
  const line = ease(frame, T.hook.line, T.hook.lineFrames);
  return (
    <Scene>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Depth z={0.9} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Headline
            lines={[["Booking shouldn't"], ['be', { text: 'this hard.', accent: true }]]}
            start={T.hook.words}
            size={TYPE.display}
            tone="teal"
            align="center"
          />
          <div style={{ marginTop: 52, height: 6, width: 260, borderRadius: 3, background: C.lime, transform: `scaleX(${line})` }} />
        </Depth>
      </AbsoluteFill>
    </Scene>
  );
};
