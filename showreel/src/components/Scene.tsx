import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, FONT, SCENES, TYPE, type SceneKey, type TransitionType } from '../theme';
import { transitionFrames } from '../timeline';
import { easeInOut, linear, mix } from './motion';

type SceneTiming = {
  scene: SceneKey;
  inType: TransitionType | null;
  outType: TransitionType | null;
  /** Camera drift direction for this scene (alternates so cuts feel organic). */
  dir: 1 | -1;
};

const TimingContext = createContext<SceneTiming>({ scene: 'hook', inType: null, outType: null, dir: 1 });
export const SceneTimingProvider = TimingContext.Provider;
export const useSceneTiming = () => useContext(TimingContext);

type Drift = { x: number; y: number };
const CameraContext = createContext<Drift>({ x: 0, y: 0 });

const PUSH = 1.02; // 2% push-in over a scene
const DRIFT = { x: 14, y: 8 }; // px of drift over a scene
const PUSH_OFFSET = 240; // px a push transition travels
const SCALE_IN = 0.94;
const SCALE_OUT = 1.06;

/** Parallax layer: z > 1 drifts further than the camera, z < 1 less. */
export const Depth = ({ z, children, style }: { z: number; children: ReactNode; style?: CSSProperties }) => {
  const cam = useContext(CameraContext);
  const k = z - 1;
  return <div style={{ transform: `translate(${cam.x * k}px, ${cam.y * k}px)`, ...style }}>{children}</div>;
};

const transitionStyle = (frame: number, length: number, inType: TransitionType | null, outType: TransitionType | null) => {
  const inDur = transitionFrames(inType);
  const outDur = transitionFrames(outType);
  const pin = inType ? easeInOut(frame, 0, inDur) : 1;
  const pout = outType && outType !== 'fade' ? easeInOut(frame, length, outDur) : 0;

  let x = 0;
  let scale = 1;
  let opacity = 1;
  if (inType === 'push') {
    x += mix(pin, PUSH_OFFSET, 0);
    opacity *= easeInOut(frame, 0, inDur * 0.7);
  } else if (inType === 'scale') {
    // Content arrives in the back two thirds, after the old scene has cleared: no double exposure.
    scale *= mix(pin, SCALE_IN, 1);
    opacity *= easeInOut(frame, inDur * 0.35, inDur * 0.65);
  }
  // 'fade': only the background dissolves; the incoming scene times its own entrances after it.
  if (outType === 'push') {
    x -= PUSH_OFFSET * pout;
    opacity *= 1 - easeInOut(frame, length, outDur * 0.7);
  } else if (outType === 'scale') {
    scale *= mix(pout, 1, SCALE_OUT);
    opacity *= 1 - easeInOut(frame, length, outDur * 0.6);
  }
  return { bg: pin, content: { opacity, transform: `translateX(${x}px) scale(${scale})` } };
};

/**
 * Every scene renders inside this: background tone, enter/exit transition,
 * and a slow camera push-in with drift that Depth layers parallax against.
 */
export const Scene = ({ children }: { children: ReactNode }) => {
  const frame = useCurrentFrame();
  const { scene, inType, outType, dir } = useSceneTiming();
  const { frames: length, tone } = SCENES[scene];
  const t = transitionStyle(frame, length, inType, outType);
  const p = linear(frame, 0, length + transitionFrames(outType));
  const drift = { x: dir * DRIFT.x * (0.5 - p) * 2, y: DRIFT.y * (0.5 - p) * 2 };
  const dark = tone === 'teal';
  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: dark ? '#fff' : C.text, ...TYPE.bodyStyle }}>
      <AbsoluteFill style={{ background: dark ? C.teal : C.bg, opacity: t.bg }} />
      <AbsoluteFill style={t.content}>
        <AbsoluteFill style={{ transform: `translate(${drift.x}px, ${drift.y}px) scale(${mix(p, 1, PUSH)})` }}>
          <CameraContext.Provider value={drift}>{children}</CameraContext.Provider>
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
