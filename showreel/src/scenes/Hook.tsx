import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C } from '../theme';
import { Headline } from '../components/Headline';
import { SceneFrame } from '../components/SceneFrame';
import { ease } from '../components/motion';

export const Hook = () => {
  const frame = useCurrentFrame();
  const line = ease(frame, 34, 34);
  return (
    <SceneFrame dark>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Headline
            lines={[["Booking shouldn't"], ['be', { text: 'this hard.', accent: true }]]}
            size={176}
            color="#fff"
            accent={C.lime}
            align="center"
            start={4}
          />
          <div
            style={{
              marginTop: 48,
              height: 6,
              width: 260,
              borderRadius: 3,
              background: C.lime,
              transform: `scaleX(${line})`,
              opacity: line > 0 ? 1 : 0,
            }}
          />
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};
