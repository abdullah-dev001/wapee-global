import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';
import { BRAND, C, LOGO, TYPE } from '../theme';
import { T } from '../timeline';
import { Headline } from '../components/Headline';
import { Depth, Scene } from '../components/Scene';
import { Button } from '../components/Button';
import { appear, ease, mix } from '../components/motion';

const K = T.close;
const DOT = { size: 40, gap: 10 };

const Wordmark = ({ frame }: { frame: number }) => {
  if (LOGO) {
    const p = ease(frame, K.wordmark, 30);
    return <Img src={staticFile(LOGO)} style={{ height: 180, opacity: p, transform: `translateY(${mix(p, 40, 0)}px) scale(${mix(p, 0.97, 1)})` }} />;
  }
  const dot = ease(frame, K.dot, 20);
  return (
    // The dot hangs outside the optical centre: shift by half its width so the word itself is centred.
    <div style={{ display: 'flex', alignItems: 'flex-end', transform: `translateX(${(DOT.size + DOT.gap) / 2}px)` }}>
      <Headline lines={[[BRAND.name]]} start={K.wordmark} size={TYPE.wordmark} tone="teal" />
      <div
        style={{
          width: DOT.size,
          height: DOT.size,
          borderRadius: DOT.size / 2,
          background: C.lime,
          marginLeft: DOT.gap,
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
  const tag = ease(frame, K.tagline, 26);
  return (
    <Scene>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Depth z={0.9} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Wordmark frame={frame} />
          <div style={{ fontSize: TYPE.lead, fontWeight: 500, color: '#fff', letterSpacing: '-0.03em', marginTop: 56, opacity: tag, transform: `translateY(${mix(tag, 20, 0)}px)` }}>
            {BRAND.tagline}
          </div>
          <div style={{ marginTop: 60, ...appear(frame, K.cta, 32, 24) }}>
            <Button variant="lime" height={80} fontSize={30} pill>
              {BRAND.cta}
            </Button>
          </div>
        </Depth>
      </AbsoluteFill>
    </Scene>
  );
};
