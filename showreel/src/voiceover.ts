import { BRAND, SCENES, sceneStart, type SceneKey } from './theme';

export type VoLine = {
  scene: SceneKey;
  /** Path under /public. The file only needs to exist when `enabled` is true. */
  file: string;
  /** Frames after the scene starts (headline starts at ~4, so this lands just after it). */
  startOffset: number;
  /** Script line, used by scripts/make-vo-mac.sh and VOICEOVER.md. */
  text: string;
};

const OFFSET = 14;

const line = (n: number, scene: SceneKey, text: string, startOffset = OFFSET): VoLine => ({
  scene,
  file: `vo/${String(n).padStart(2, '0')}-${scene}.mp3`,
  startOffset,
  text,
});

export const VO = {
  /** Flip to true once the files exist in public/vo/. */
  enabled: false,
  /** Linear gain applied to every VO line. */
  volume: 1,
  /** Music level while a line plays (auto-duck). */
  duckTo: 0.3,
  duckRamp: 10,
  lines: [
    line(1, 'hook', "Booking shouldn't be this hard.", 12),
    line(2, 'booking', `With ${BRAND.name}, clients book online in seconds, from any device.`),
    line(3, 'calendar', "Your whole team's day, in one live calendar."),
    line(4, 'notifications', 'Confirmations and reminders go out by email, SMS and push.'),
    line(5, 'clients', "Every client's history, notes and details, in one place."),
    line(6, 'money', 'Turn any appointment into an invoice, and track revenue.'),
    line(7, 'packages', 'Sell session packages and track every visit used.'),
    line(8, 'forms', 'Collect consent and signatures before they arrive.'),
    line(9, 'reviews', 'Collect reviews that build trust.', 8),
    line(10, 'website', 'Get a booking website, or embed booking on yours.'),
    line(11, 'team', 'Roles, commissions, multiple branches. Grow without switching tools.'),
    line(12, 'industries', 'One engine for every appointment business.'),
    line(13, 'close', `${BRAND.name}. Your whole appointment business, set up in minutes.`),
  ] satisfies VoLine[],
};

/** Absolute start frame of a line. */
export const voStart = (l: VoLine) => sceneStart(l.scene) + l.startOffset;

/** Longest a line may run so it ends before the next scene's line starts. */
export const voMaxFrames = (l: VoLine) => SCENES[l.scene] - l.startOffset - 4;
