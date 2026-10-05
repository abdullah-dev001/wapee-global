import { SCENES, type SceneKey } from './theme';
import { BOOKING_T } from './scenes/Booking';
import { KEY_FRAMES, PHONE } from './scenes/booking/Steps';
import { CALENDAR_T } from './scenes/Calendar';
import { NOTIFICATIONS_T } from './scenes/Notifications';
import { CLIENTS_T } from './scenes/Clients';
import { MONEY_T } from './scenes/Money';
import { PACKAGES_T } from './scenes/Packages';
import { FORMS_T } from './scenes/Forms';
import { REVIEWS_T } from './scenes/Reviews';
import { WEBSITE_T } from './scenes/Website';
import { TEAM_T } from './scenes/Team';
import { PHASES } from './scenes/Industries';

export type SfxFile =
  | 'whoosh'
  | 'tick'
  | 'key'
  | 'pop'
  | 'chime-1'
  | 'chime-2'
  | 'chime-3'
  | 'success'
  | 'paid'
  | 'sig'
  | 'hit'
  | 'riser';

/** `frame` is local to the scene (0 = the scene's first frame). */
export type Cue = { scene: SceneKey; frame: number; file: SfxFile; volume: number };

/** Master gain on top of each cue's volume. Set to 0 to mute all SFX. */
export const SFX_GAIN = 1;

const V = { whoosh: 0.16, tick: 0.25, key: 0.14, pop: 0.24, chime: 0.3, success: 0.3, paid: 0.3, sig: 0.22, hit: 0.35, riser: 0.28 };

/** Headlines start rising around frame 4 in every scene. */
const HEADLINE = 3;
const headlineWhooshes: Cue[] = (Object.keys(SCENES) as SceneKey[])
  .filter((s) => s !== 'close')
  .map((scene) => ({ scene, frame: HEADLINE, file: 'whoosh', volume: V.whoosh }));

/** One key tick per typed character (matches the typewriter maths in the scene). */
const phoneKeys: Cue[] = Array.from(PHONE, (_, i) => ({
  scene: 'booking',
  frame: BOOKING_T.type + Math.ceil(KEY_FRAMES * (i + 1)),
  file: 'key',
  volume: V.key,
}));

const searchKeys: Cue[] = Array.from(CLIENTS_T.query, (_, i) => ({
  scene: 'clients',
  frame: CLIENTS_T.type + i * CLIENTS_T.typeStep,
  file: 'key',
  volume: V.key,
}));

const chimes: Cue[] = (['chime-1', 'chime-2', 'chime-3'] as const).map((file, i) => ({
  scene: 'notifications',
  frame: NOTIFICATIONS_T.first + i * NOTIFICATIONS_T.step + NOTIFICATIONS_T.land,
  file,
  volume: V.chime,
}));

const stars: Cue[] = [0, 1, 2, 3, 4].map((i) => ({
  scene: 'reviews',
  frame: REVIEWS_T.stars + i * REVIEWS_T.starStep,
  file: 'key',
  volume: V.key,
}));

export const CUES: Cue[] = [
  { scene: 'hook', frame: 2, file: 'hit', volume: V.hit },
  ...headlineWhooshes,

  { scene: 'booking', frame: BOOKING_T.pickService, file: 'tick', volume: V.tick },
  { scene: 'booking', frame: BOOKING_T.pickTime, file: 'tick', volume: V.tick },
  ...phoneKeys,
  { scene: 'booking', frame: BOOKING_T.press, file: 'tick', volume: V.tick },
  { scene: 'booking', frame: BOOKING_T.toDone + 4, file: 'success', volume: V.success },

  { scene: 'calendar', frame: CALENDAR_T.live, file: 'pop', volume: V.pop },

  ...chimes,

  ...searchKeys,
  { scene: 'clients', frame: CLIENTS_T.select, file: 'tick', volume: V.tick },

  { scene: 'money', frame: MONEY_T.paid, file: 'paid', volume: V.paid },

  { scene: 'packages', frame: PACKAGES_T.sell - 3, file: 'tick', volume: V.tick },
  ...PACKAGES_T.uses.map((frame): Cue => ({ scene: 'packages', frame, file: 'tick', volume: V.tick })),

  ...FORMS_T.checks.map((frame): Cue => ({ scene: 'forms', frame, file: 'tick', volume: V.tick })),
  { scene: 'forms', frame: FORMS_T.sign, file: 'sig', volume: V.sig },
  { scene: 'forms', frame: FORMS_T.signed, file: 'success', volume: V.success * 0.7 },

  ...stars,
  { scene: 'reviews', frame: REVIEWS_T.reply, file: 'pop', volume: V.pop * 0.8 },

  { scene: 'website', frame: WEBSITE_T.embed, file: 'pop', volume: V.pop * 0.8 },

  { scene: 'team', frame: TEAM_T.toggle, file: 'tick', volume: V.tick },
  { scene: 'team', frame: TEAM_T.branch, file: 'tick', volume: V.tick },

  ...PHASES.slice(1).map((frame): Cue => ({ scene: 'industries', frame, file: 'tick', volume: V.tick })),

  // 2 s swell that peaks as the closing wordmark rises.
  { scene: 'industries', frame: SCENES.industries - 54, file: 'riser', volume: V.riser },
];
