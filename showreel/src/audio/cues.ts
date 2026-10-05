import { SCENE_ORDER, SCENES, type SceneKey } from '../theme';
import { T, keyFrames, transitionInto } from '../timeline';
import { CLIENT, SEARCH_QUERY } from '../content';
import { CLICK_DELAY } from '../components/Cursor';

/** Stereo position baked into the file variant, chosen from where the event is on screen. */
type Pan = 'l' | 'c' | 'r';

/** `frame` is local to the scene; `db` is the cue's gain on the SFX bus. */
export type Cue = { scene: SceneKey; frame: number; sound: string; db: number };

/** Cue gains (dB). Files peak at -3 dBFS; with the SFX bus at -3 dB the loudest land near -6 dBFS. */
const LEVEL = {
  hit: 0,
  impact: 0,
  riser: -3,
  push: -5,
  scale: -6,
  chime: -4,
  success: -3,
  confirm: -6,
  paid: -2,
  click: -7,
  tick: -9,
  key: -13,
  pop: -7,
  sparkle: -11,
  roll: -8,
  sig: -3,
} as const;

/** Rotate through the three variants of a sound so repeats never sound identical. */
const rotate = (() => {
  const counters = new Map<string, number>();
  return (base: 'click' | 'tick' | 'key', pan: Pan) => {
    const n = counters.get(base) ?? 0;
    counters.set(base, n + 1);
    return `${base}-${(n % 3) + 1}.${pan}`;
  };
})();

const at = (scene: SceneKey, frame: number, sound: string, db: number): Cue => ({ scene, frame, sound, db });
const click = (scene: SceneKey, frame: number, pan: Pan) => at(scene, frame + CLICK_DELAY, rotate('click', pan), LEVEL.click);
const tick = (scene: SceneKey, frame: number, pan: Pan) => at(scene, frame, rotate('tick', pan), LEVEL.tick);
const keys = (scene: SceneKey, start: number, count: number, every: number, pan: Pan) =>
  keyFrames(start, count, every).map((f) => at(scene, f, rotate('key', pan), LEVEL.key));

/** One whoosh per transition, matching its type; the riser carries the fade into the logo. */
const transitions = (() => {
  let push = 0;
  let scale = 0;
  return SCENE_ORDER.flatMap((scene): Cue[] => {
    const type = transitionInto(scene);
    if (type === 'push') return [at(scene, 0, `whoosh-push-${(push++ % 2) + 1}`, LEVEL.push)];
    if (type === 'scale') return [at(scene, 0, `whoosh-scale-${(scale++ % 3) + 1}`, LEVEL.scale)];
    return [];
  });
})();

const { booking: B, calendar: K, notifications: N, clients: CL, money: M, packages: P, forms: F, reviews: R, website: W, team: TM, industries: I, close: CS } =
  T;

/** Frames the riser swells before its peak; it peaks on the logo impact. */
const RISER_FRAMES = 90;

export const CUES: Cue[] = [
  at('hook', 0, 'hit', LEVEL.hit),
  ...transitions,

  click('booking', B.clickService, 'r'),
  click('booking', B.clickTime, 'r'),
  click('booking', B.clickPhone, 'r'),
  ...keys('booking', B.typeStart, CLIENT.phone.length, B.keyFrames, 'r'),
  click('booking', B.clickConfirm, 'r'),
  at('booking', B.booked + 4, 'success', LEVEL.success),

  at('calendar', K.live, 'pop.c', LEVEL.pop),
  click('calendar', K.clickBlock, 'c'),

  at('notifications', N.cards[0] + N.land, 'chime-email', LEVEL.chime),
  at('notifications', N.cards[1] + N.land, 'chime-sms', LEVEL.chime),
  at('notifications', N.cards[2] + N.land, 'chime-push', LEVEL.chime),

  ...keys('clients', CL.typeStart, SEARCH_QUERY.length, CL.keyFrames, 'r'),
  tick('clients', CL.select, 'r'),

  at('money', M.countStart, 'roll', LEVEL.roll),
  at('money', M.paid, 'paid', LEVEL.paid),

  click('packages', P.sell - 2, 'c'),
  at('packages', P.sell + 2, 'confirm', LEVEL.confirm),
  ...P.uses.map((f) => tick('packages', f, 'c')),

  ...F.checks.map((f) => tick('forms', f, 'r')),
  at('forms', F.sign, 'sig', LEVEL.sig),
  at('forms', F.signed, 'confirm', LEVEL.confirm),

  ...Array.from({ length: 5 }, (_, i) => at('reviews', R.stars + i * R.starStep, `sparkle-${i + 1}`, LEVEL.sparkle)),
  at('reviews', R.reply, 'pop.c', LEVEL.pop - 2),

  click('website', W.clickBook, 'l'),
  at('website', W.embed, 'pop.r', LEVEL.pop - 2),

  tick('team', TM.toggle, 'l'),
  tick('team', TM.branch, 'r'),

  ...I.phases.slice(1).map((f) => tick('industries', f, 'r')),
  at('industries', SCENES.industries.frames + CS.impact - RISER_FRAMES, 'riser', LEVEL.riser),

  at('close', CS.impact, 'impact', LEVEL.impact),
];

/** Big impacts briefly duck the bed and music. */
export const IMPACTS = CUES.filter((c) => c.sound === 'hit' || c.sound === 'impact');
