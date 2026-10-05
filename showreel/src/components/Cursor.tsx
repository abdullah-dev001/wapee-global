import { interpolate, useCurrentFrame } from 'remotion';
import { C, EASE_MOVE } from '../theme';
import { ease, linear, mix } from './motion';

/** Arrive at (x, y) on frame `at`, travelling for `travel` frames. `click` presses on arrival. */
export type Waypoint = { at: number; x: number; y: number; click?: boolean; travel?: number };

const TRAVEL = 16;
/** Frames between arriving and the press, shared with the click sound cues. */
export const CLICK_DELAY = 1;
const RIPPLE = 18;

const move = (frame: number, start: number, travel: number) =>
  interpolate(frame, [start, start + travel], [0, 1], { easing: EASE_MOVE, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

/** Cursor tip position; paths bow slightly like a real hand movement. */
export const cursorAt = (frame: number, path: Waypoint[]) => {
  let pos = { x: path[0].x, y: path[0].y };
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1];
    const to = path[i];
    const travel = to.travel ?? TRAVEL;
    if (frame < to.at - travel) break;
    const t = move(frame, to.at - travel, travel);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy) || 1;
    const bow = Math.sin(Math.PI * t) * dist * 0.08;
    pos = { x: from.x + dx * t + (-dy / dist) * bow, y: from.y + dy * t + (dx / dist) * bow };
  }
  return pos;
};

/** Hovering within `radius` px of a point, eased by distance (for button hover states). */
export const hoverAt = (frame: number, path: Waypoint[], x: number, y: number, radius = 60) => {
  const p = cursorAt(frame, path);
  return Math.max(0, Math.min(1, 1 - (Math.hypot(p.x - x, p.y - y) - radius * 0.4) / radius));
};

/** 0..1 while a click at `at` is being pressed. */
export const pressAt = (frame: number, at: number) => ease(frame, at + CLICK_DELAY, 3) - ease(frame, at + CLICK_DELAY + 4, 8);

/** macOS-style pointer with click ripples. Place inside a box whose origin matches the path coordinates. */
export const Cursor = ({ path, hideAt }: { path: Waypoint[]; hideAt?: number }) => {
  const frame = useCurrentFrame();
  const { x, y } = cursorAt(frame, path);
  const visible = ease(frame, path[0].at - 8, 10) * (hideAt === undefined ? 1 : 1 - ease(frame, hideAt, 10));
  const pressed = path.reduce((m, w) => (w.click ? Math.max(m, pressAt(frame, w.at)) : m), 0);
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {path
        .filter((w) => w.click && frame >= w.at + CLICK_DELAY && frame < w.at + CLICK_DELAY + RIPPLE)
        .map((w) => {
          const t = linear(frame, w.at + CLICK_DELAY, RIPPLE);
          const r = mix(ease(frame, w.at + CLICK_DELAY, RIPPLE), 8, 38);
          return (
            <div
              key={w.at}
              style={{
                position: 'absolute',
                left: w.x - r,
                top: w.y - r,
                width: r * 2,
                height: r * 2,
                borderRadius: '50%',
                background: C.teal,
                opacity: 0.22 * (1 - t) * visible,
              }}
            />
          );
        })}
      <svg
        width={30}
        height={40}
        viewBox="0 0 24 32"
        style={{
          position: 'absolute',
          left: x - 2,
          top: y - 1,
          opacity: visible,
          transform: `scale(${1 - pressed * 0.14})`,
          transformOrigin: '2px 1px',
          filter: 'drop-shadow(0 2px 3px rgba(17, 24, 39, 0.3))',
        }}
      >
        <path d="M2 1 L2 24.5 L7.6 19.2 L11.4 28.4 L15.4 26.7 L11.6 17.7 L19.3 17.7 Z" fill={C.text} stroke="#fff" strokeWidth={1.8} strokeLinejoin="round" />
      </svg>
    </div>
  );
};
