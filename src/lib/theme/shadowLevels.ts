/**
 * Elevation levels (DESIGN_GUIDE §7). Import-free so build scripts (the static landing
 * page CSS) can read the same tokens; `shadow()` in shadow.ts applies them. Shadows tint #111827, never pure black.
 * Web uses the exact CSS values; iOS uses the strongest layer as shadow* props;
 * Android uses elevation.
 */
export const shadowLevels = {
  sm: {
    web: '0 1px 2px 0 rgba(17, 24, 39, 0.05)',
    ios: { offsetX: 0, offsetY: 1, radius: 2, opacity: 0.05 },
    elevation: 1,
  },
  md: {
    web: '0 4px 6px -1px rgba(17, 24, 39, 0.07), 0 2px 4px -2px rgba(17, 24, 39, 0.05)',
    ios: { offsetX: 0, offsetY: 4, radius: 6, opacity: 0.07 },
    elevation: 3,
  },
  lg: {
    web: '0 10px 15px -3px rgba(17, 24, 39, 0.08), 0 4px 6px -4px rgba(17, 24, 39, 0.05)',
    ios: { offsetX: 0, offsetY: 10, radius: 15, opacity: 0.08 },
    elevation: 8,
  },
  drawer: {
    web: '-8px 0 24px -4px rgba(17, 24, 39, 0.12)',
    ios: { offsetX: -8, offsetY: 0, radius: 24, opacity: 0.12 },
    elevation: 16,
  },
} as const;
