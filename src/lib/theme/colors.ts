/** Colour tokens. Source: CLAUDE.md §5 and docs/DESIGN_GUIDE.md §2. Light theme only (no dark mode). */
export const colors = {
  primary: '#024751',
  primaryHover: '#013640',
  primaryLight: '#e6f0f2',

  secondary: '#d8ff29',
  secondaryHover: '#c4eb1a',
  secondaryLight: '#f6ffd6',

  background: '#f8fafb',
  surface: '#ffffff',
  surfaceHover: '#f3f4f6',
  border: '#e5e7eb',
  borderSubtle: '#f0f0f0',

  textPrimary: '#111827',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
  textOnPrimary: '#ffffff',
  textOnSecondary: '#024751',

  sidebarBg: '#024751',
  sidebarText: '#a8c5ca',
  sidebarActive: '#d8ff29',
  sidebarActiveText: '#024751',
  sidebarHover: '#035f6e',

  success: '#10b981',
  successLight: '#ecfdf5',
  successBorder: '#a7f3d0',
  warning: '#f59e0b',
  warningLight: '#fffbeb',
  warningBorder: '#fde68a',
  error: '#ef4444',
  errorHover: '#dc2626',
  errorLight: '#fef2f2',
  errorBorder: '#fecaca',
  info: '#3b82f6',
  infoLight: '#eff6ff',
  infoBorder: '#bfdbfe',

  /**
   * Text-on-tint variants of the status colours. The base tokens are for fills, borders and icons: as small text
   * on their Light backgrounds they are 2.1-3.4:1. These are 5.2-6.8:1 (WCAG AA needs 4.5:1).
   */
  successText: '#047857',
  warningText: '#92400e',
  errorText: '#b91c1c',
  infoText: '#1d4ed8',

  overlay: 'rgba(0, 0, 0, 0.5)',
  lockedScrimTop: 'rgba(248, 250, 251, 0.72)',
  lockedScrimBottom: 'rgba(248, 250, 251, 0.92)',
  /** Base tint for shadows (#111827), not pure black. */
  shadow: '#111827',
  transparent: 'transparent',
} as const;

export type ColorToken = keyof typeof colors;
