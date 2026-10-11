# Design system reference (tokens + component specs)

Moved from CLAUDE.md §5. Read only when the task touches UI.

Full spec: `docs/DESIGN_GUIDE.md`. All values live in `src/lib/theme/`. **Never hard-code a colour, font size, spacing, radius or shadow in a component.** Always `theme.*`.

### Colours
```
primary          #024751   primary-hover #013640   primary-light #e6f0f2
secondary (lime) #d8ff29   secondary-hover #c4eb1a secondary-light #f6ffd6
background       #f8fafb   surface #ffffff         surface-hover #f3f4f6
border           #e5e7eb   border-subtle #f0f0f0
text-primary     #111827   text-secondary #4b5563  text-muted #6b7280
text-on-primary  #ffffff   text-on-secondary #024751
sidebar-bg #024751  sidebar-text #a8c5ca  sidebar-active #d8ff29  sidebar-active-text #024751  sidebar-hover #035f6e
success #10b981 / light #ecfdf5 / border #a7f3d0
warning #f59e0b / light #fffbeb / border #fde68a
error   #ef4444 (hover #dc2626) / light #fef2f2 / border #fecaca
info    #3b82f6 / light #eff6ff / border #bfdbfe
overlay rgba(0,0,0,0.5)
```
### Type, shape, motion
- Font **DM Sans** everywhere. Letter-spacing -0.02em body, -0.03em headings.
- Radius: sm 6, md 8, lg 12, xl 16, full 9999.
- Shadows via `shadow(level)` helper (sm, md, lg, drawer) → iOS shadow*, Android elevation, web boxShadow.
- Motion: 120 / 180 / 260 ms, ease. Animate colour/opacity only.
- Spacing: page padding 24 (16 mobile), card padding 24 (18 mobile).
- Z-index: header 30, sidebar 40, overlay 50, drawer 60, toast 70.
- **No dark mode.**

### Component specs (must match)
- **Button:** variants primary, secondary (lime), ghost, danger; sizes sm 34 / md 41 / lg 48; radius 8; disabled opacity 0.55; loading state built in.
- **Input:** label above (13px / 600), 1px border, radius 8, ~40px height, focus = primary border + 3px `primary-light` ring, error = red border + message below.
- **Card:** white, 1px border, radius 12, flat.
- **Badge:** pill, 11px / 600, tinted (status colours).
- **Drawer:** 480px from right on desktop; full-screen sheet on mobile.
- **Dialog:** max width 26rem (416px).
- **Tabs:** underline style. **Segmented control**. **Toggle:** 36×20.
- **Loading:** skeleton loaders for lists/cards. **Never** a full-screen spinner for lists. One spinner style, 600ms rotation.
- **Empty states** on every list. **Error states** with retry on every query.
- Hover styles only on web. Visible keyboard focus ring on web.

### Reusable component rules
- Every UI primitive lives in `src/components/ui/` and is used everywhere. **No one-off styled buttons/inputs/cards inside features.**
- Reusable composites in `src/components/shared/`: `ListView` (infinite/paginated), `DataTable` (desktop), `FilterBar`, `SearchInput` (debounced), `Pagination`, `EmptyState`, `ErrorState`, `ConfirmDialog`, `FormField`, `PhoneInput` (country code), `DatePicker`, `DateRangePicker`, `TimeSlotPicker`, `MoneyInput`, `StatusBadge`, `Avatar`, `Sheet/Drawer` (responsive).
- Lists: on mobile render as cards/rows (`ListView`); on desktop the same data may render as `DataTable`. Same hook, same query.
- Props typed, variants via props (not copy-paste). Each primitive must work on **Android, iOS and web**, and handle platform differences inside the component (never in feature code).
- New reusable component needed? Build it once in `ui/` or `shared/`, then use it.
