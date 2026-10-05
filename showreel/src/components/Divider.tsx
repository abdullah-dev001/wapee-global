import { C } from '../theme';

/** 1px rule; `subtle` for rows inside a list. */
export const Divider = ({ subtle = false, margin = 0 }: { subtle?: boolean; margin?: number | string }) => (
  <div style={{ height: 1, background: subtle ? C.borderSubtle : C.border, margin }} />
);
