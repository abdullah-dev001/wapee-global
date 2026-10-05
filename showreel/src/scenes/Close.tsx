import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';
import { BRAND, C, LOGO } from '../theme';
import { Headline } from '../components/Headline';
import { SceneFrame } from '../components/SceneFrame';
import { Button } from '../components/Button';
import { appear, ease, mix } from '../components/motion';

const Wordmark = ({ frame }: { frame: number }) => {
  if (LOGO) {
    const p = ease(frame, 8, 30);
    return (
      <Img
        src={staticFile(LOGO)}
        style={{ height: 180, opacity: p, transform: `translateY(${mix(p, 40, 0)}px) scale(${mix(p, 0.97, 1)})` }}
      />
    );
  }
  const dot = ease(frame, 22, 20);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
      <Headline lines={[[BRAND.name]]} size={220} color="#fff" start={6} />
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          background: C.lime,
          marginLeft: 10,
          marginBottom: 36,
          opacity: dot,
          transform: `scale(${mix(dot, 0.97, 1)})`,
        }}
      />
    </div>
  );
};

export const Close = () => {
  const frame = useCurrentFrame();
  const tag = ease(frame, 30, 28);
  return (
    <SceneFrame dark>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Wordmark frame={frame} />
        <div
          style={{
            fontSize: 44,
            fontWeight: 500,
            color: '#fff',
            letterSpacing: '-0.03em',
            marginTop: 60,
            opacity: tag,
            transform: `translateY(${mix(tag, 24, 0)}px)`,
          }}
        >
          {BRAND.tagline}
        </div>
        <div style={{ marginTop: 64, ...appear(frame, 44, 40) }}>
          <Button variant="lime" height={80} fontSize={30}>
            {BRAND.cta}
          </Button>
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};
