import { memo, type ReactNode } from 'react';
import { Star } from 'lucide-react';
import { BRAND, C, ICON, ui } from '../../theme';
import { BUSINESS } from '../../content';
import { Avatar } from '../../components/Avatar';

/** Dashboard chrome per DESIGN_GUIDE 13.1–13.3, drawn at a smaller scale than single cards. */
export const SHELL_SCALE = 1.25;
const s = (px: number) => ui(px, SHELL_SCALE);
export const SIDEBAR_W = s(240);
export const HEADER_H = s(64);

const NAV = ['Today', 'Calendar', 'Clients', 'Services', 'Staff', 'Invoices', 'Reports', 'Reviews', 'Website', 'Settings'];
const ACTIVE = 'Calendar';

const Sidebar = memo(() => (
  <div style={{ width: SIDEBAR_W, flexShrink: 0, background: C.teal, display: 'flex', flexDirection: 'column' }}>
    <div style={{ height: HEADER_H, display: 'flex', alignItems: 'center', padding: `0 ${s(20)}px` }}>
      <span style={{ color: C.lime, fontSize: s(22), fontWeight: 700, letterSpacing: '-0.04em' }}>{BRAND.name}</span>
    </div>
    <div style={{ flex: 1, padding: `${s(8)}px ${s(12)}px`, display: 'flex', flexDirection: 'column', gap: s(2) }}>
      {NAV.map((item) => {
        const active = item === ACTIVE;
        return (
          <div
            key={item}
            style={{
              padding: `${s(9)}px ${s(14)}px`,
              borderRadius: s(8),
              background: active ? C.lime : 'transparent',
              color: active ? C.teal : C.tealMuted,
              fontSize: s(14),
              fontWeight: active ? 600 : 500,
              display: 'flex',
              alignItems: 'center',
              gap: s(8),
            }}
          >
            {item}
            {item === 'Reviews' ? <Star size={s(13)} strokeWidth={ICON.strokeWidth} /> : null}
          </div>
        );
      })}
    </div>
    <div style={{ padding: s(12), borderTop: `1px solid ${C.tealLine}`, display: 'flex', alignItems: 'center', gap: s(10) }}>
      <Avatar initials={BUSINESS.initials} size={s(28)} square tone="dark" />
      <div>
        <div style={{ color: '#fff', fontSize: s(13), fontWeight: 600 }}>{BUSINESS.name}</div>
        <div style={{ color: C.tealMuted, fontSize: 16 }}>{BUSINESS.area}</div>
      </div>
    </div>
  </div>
));

const Header = memo(() => (
  <div
    style={{
      height: HEADER_H,
      flexShrink: 0,
      boxSizing: 'border-box',
      background: C.surface,
      borderBottom: `1px solid ${C.border}`,
      padding: `0 ${s(24)}px`,
      display: 'flex',
      alignItems: 'center',
      gap: s(12),
    }}
  >
    <Avatar initials={BUSINESS.initials} size={s(28)} square />
    <div style={{ flex: 1, fontSize: s(15), fontWeight: 600 }}>{BUSINESS.name}</div>
    <div style={{ fontSize: s(14), color: C.text2 }}>{BUSINESS.owner.name}</div>
    <Avatar initials={BUSINESS.owner.initials} size={s(32)} />
  </div>
));

/** Sidebar + header around a page body. */
export const AppShell = ({ children, width, height }: { children: ReactNode; width: number; height: number }) => (
  <div style={{ width, height, display: 'flex', background: C.bg }}>
    <Sidebar />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Header />
      <div style={{ flex: 1, position: 'relative', padding: s(24) }}>{children}</div>
    </div>
  </div>
);

export const shell = s;
