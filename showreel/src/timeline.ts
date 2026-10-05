import { SCENES, SCENE_ORDER, TRANSITIONS, type SceneKey, type TransitionType } from './theme';

/**
 * Event frames, local to each scene (0 = the scene's first frame).
 * Scenes animate from these and audio/cues.ts places sounds on them, so picture
 * and sound stay frame-accurate when anything is retimed. `settled` is the frame
 * the scene's final state is complete; it must hold ≥ 1 s (the logo ≥ 2 s).
 */
export const T = {
  hook: { words: -4, line: 26, lineFrames: 30, settled: 56 },
  booking: {
    headline: 4,
    sub: 22,
    card: 10,
    cursorIn: 22,
    clickService: 38,
    toTime: 48,
    clickTime: 66,
    toPhone: 76,
    clickPhone: 84,
    typeStart: 88,
    keyFrames: 1.8,
    clickConfirm: 116,
    booked: 122,
    linkSent: 132,
    settled: 150,
  },
  calendar: { headline: 4, window: 10, blocks: 22, live: 66, toast: 76, cursorIn: 80, clickBlock: 98, settled: 110 },
  notifications: { headline: 4, cards: [18, 30, 42], land: 8, settled: 72 },
  clients: { headline: 4, sub: 22, card: 10, typeStart: 22, keyFrames: 4, select: 40, profile: 52, note: 56, history: 60, settled: 92 },
  money: { headline: 4, invoice: 12, revenue: 18, countStart: 30, countFrames: 56, bars: 34, paid: 70, settled: 100 },
  packages: { headline: 4, card: 14, sell: 34, uses: [62, 90], settled: 112 },
  forms: { headline: 4, sub: 22, card: 10, checks: [30, 36], sign: 46, signFrames: 40, signed: 92, settled: 110 },
  reviews: { headline: 2, card: 6, stars: 12, starStep: 4, reply: 30, featured: 38, settled: 56 },
  website: { headline: 4, browser: 10, cursorIn: 22, hoverHero: 36, scroll: 42, scrollFrames: 42, clickBook: 92, embed: 96, settled: 120 },
  team: { headline: 4, cards: [12, 18, 24], countStart: 34, countFrames: 50, toggle: 54, branch: 80, settled: 100 },
  industries: { headline: 4, sub: 22, card: 8, phases: [8, 38, 66], rowDelay: 4, swapFrames: 14, settled: 88 },
  close: { wordmark: 14, impact: 16, dot: 26, tagline: 28, cta: 32, settled: 58 },
} as const satisfies Record<SceneKey, { readonly settled: number; readonly [event: string]: number | readonly number[] }>;

const MIN_HOLD = 30;
const LOGO_HOLD = 60;

/** Absolute first frame of a scene. */
export const sceneStart = (key: SceneKey) => {
  let from = 0;
  for (const k of SCENE_ORDER) {
    if (k === key) return from;
    from += SCENES[k].frames;
  }
  return from;
};

export const abs = (key: SceneKey, local: number) => sceneStart(key) + local;

/** Characters shown by a typewriter that types one every `every` frames from `start`. */
export const typedCount = (frame: number, start: number, every: number, total: number) =>
  frame < start ? 0 : Math.min(total, Math.floor((frame - start) / every) + 1);

/** Frame each character appears (inverse of typedCount), for key-click cues. */
export const keyFrames = (start: number, count: number, every: number) =>
  Array.from({ length: count }, (_, i) => start + Math.ceil(every * i));

const prevScene = (key: SceneKey) => SCENE_ORDER[SCENE_ORDER.indexOf(key) - 1];
const nextScene = (key: SceneKey) => SCENE_ORDER[SCENE_ORDER.indexOf(key) + 1];

/** How a scene enters: same tone → push, tone change → scale-through, logo → fade. */
export const transitionInto = (key: SceneKey): TransitionType | null => {
  const prev = prevScene(key);
  if (!prev) return null;
  if (key === 'close') return 'fade';
  return SCENES[prev].tone === SCENES[key].tone ? 'push' : 'scale';
};

export const transitionOutOf = (key: SceneKey): TransitionType | null => {
  const next = nextScene(key);
  return next ? transitionInto(next) : null;
};

export const transitionFrames = (type: TransitionType | null) => (type ? TRANSITIONS[type] : 0);

/** Throws at bundle time if a finished state would not be readable. */
export const assertHolds = () => {
  const problems = SCENE_ORDER.flatMap((k) => {
    const hold = SCENES[k].frames - T[k].settled;
    const need = k === 'close' ? LOGO_HOLD : MIN_HOLD;
    return hold < need ? [`${k}: holds ${hold}f, needs ${need}f`] : [];
  });
  if (problems.length) throw new Error(`Timeline holds too short:\n${problems.join('\n')}`);
};
