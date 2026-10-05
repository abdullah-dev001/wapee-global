import type { LucideIcon } from 'lucide-react';
import { C } from '../theme';
import { Card } from './Card';
import { IconTile } from './IconTile';

type Props = { Icon: LucideIcon; title: string; detail: string; width?: number };

/** Floating notice: lime icon tile, title, one line of detail. */
export const Toast = ({ Icon, title, detail, width = 440 }: Props) => (
  <Card float style={{ width, padding: '20px 22px', display: 'flex', gap: 16, alignItems: 'center', borderRadius: 18 }}>
    <IconTile Icon={Icon} size={50} tone="lime" />
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 21, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 18, color: C.text2, marginTop: 2, whiteSpace: 'nowrap' }}>{detail}</div>
    </div>
  </Card>
);
