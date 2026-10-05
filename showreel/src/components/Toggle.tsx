import { C, RADIUS } from '../theme';
import { mix } from './motion';

const W = 58;
const H = 32;
const THUMB = 22;
const INSET = 5;

/** Mock of the app Toggle (36×20 scaled up for video). `on` is 0..1. */
export const Toggle = ({ on }: { on: number }) => (
  <div style={{ position: 'relative', width: W, height: H, borderRadius: RADIUS.full, background: C.border, flexShrink: 0 }}>
    <div style={{ position: 'absolute', inset: 0, borderRadius: RADIUS.full, background: C.teal, opacity: on }} />
    <div
      style={{
        position: 'absolute',
        top: INSET,
        left: mix(on, INSET, W - THUMB - INSET),
        width: THUMB,
        height: THUMB,
        borderRadius: THUMB / 2,
        background: C.surface,
        boxShadow: '0 1px 2px rgba(17, 24, 39, 0.15)',
      }}
    />
  </div>
);
