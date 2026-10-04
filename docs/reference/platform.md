# Platform, screen edges, screenshots, Android review

Moved from CLAUDE.md §4. Read only when the task touches UI/layout/system bars.

### Breakpoints (from `useBreakpoint()` only)
| Width | Name | Layout |
|---|---|---|
| < 768 | mobile | **Bottom tab bar** (Today, Calendar, Clients, More), single column, full-screen sheets |
| 768–1023 | tablet | **Sidebar** (collapsible), two columns where useful |
| ≥ 1024 | desktop | **Fixed 240px sidebar + 64px header**, multi-column, 480px right drawer |

- **Mobile is the primary design.** Build and check every screen at mobile width first.
- **Android app, iOS app and mobile web must look and behave the same.** Same screens, same bottom tabs, same sheets. No "desktop-ish" leftovers on a phone browser.
- Tablet/desktop (incl. iPad and Android tablets) switch to the sidebar layout. Same features, layout only changes. Support portrait and landscape on tablets.
- Never branch on `Platform.OS` for layout. Use breakpoint. Use `Platform.select` / `Platform.OS` only for real platform differences (system UI, push, hover, service worker, haptics).
- Touch targets ≥ 44px on mobile.

### Screen edges, system bars, devices (STRICT — must be perfect on every phone)
- **Every screen uses the shared `Screen` / `PageContainer` layout component** that handles safe areas. Never hard-code top/bottom padding for notches or nav bars.
- Use `useSafeAreaInsets()` (react-native-safe-area-context) — never fixed values. `SafeAreaProvider` at the root.
- **iOS:** notch, Dynamic Island and home indicator → top + bottom insets. Bottom tab bar and bottom sheets/sticky buttons sit above the home indicator.
- **Android:** app runs **edge-to-edge**. Handle all three cases correctly:
  1. **3-button navigation bar** (back/home/recents) → bottom inset ≈ 48px, content and tab bar must not hide behind it.
  2. **Gesture navigation** (thin bar) → small bottom inset.
  3. **No visible nav bar** → inset 0.
  The bottom tab bar, sticky action buttons, sheets, FABs and toasts all add `insets.bottom`. Navigation bar colour/button style set with expo-navigation-bar to match the screen (light background → dark buttons).
- Status bar: expo-status-bar, style matches each screen background (dark icons on light screens, light icons on the primary-colour areas). Translucent; content never under it unintentionally.
- **Android hardware/gesture back** must work everywhere: closes sheet/dialog/drawer first, then goes back; on a root tab it exits (or confirms) — never a dead back press. Unsaved form → confirm before leaving.
- **iOS swipe-back** gesture enabled on stack screens; disabled only where data would be lost (then confirm).
- **Keyboard:** inputs never hidden by the keyboard on either platform. Forms scroll to the focused field; sticky submit buttons move above the keyboard; tap outside dismisses. Correct `keyboardType`, `autoComplete`, `textContentType` (iOS) and `returnKeyType` for every input.
- **Font scaling:** layouts must not break with large system font sizes (Android + iOS accessibility). Use `maxFontSizeMultiplier` only on tight UI like tab labels and badges.
- **Small and large screens:** test from ~320px wide (small Android / iPhone SE) up to large phones; no horizontal overflow, no cut text (use `numberOfLines` + ellipsis where needed).
- Orientation: phones portrait-locked; tablets allow both.
- Lists use `FlatList`/`FlashList` with `contentContainerStyle` bottom padding = tab bar height + `insets.bottom`.
- Pull-to-refresh on lists (native), haptics on key actions (iOS + Android, no-op on web).
- Date/time pickers, sheets and modals must feel native on both platforms (use the shared components, which handle platform differences internally).
- **PWA standalone on iPhone:** use `viewport-fit=cover` and `env(safe-area-inset-*)` so the web app respects the notch and home indicator just like the native app.

### Testing matrix (check before marking a UI task done)
| Target | Check |
|---|---|
| Android phone | 3-button nav, gesture nav, small screen, large font, hardware back, keyboard |
| iOS phone | notch/Dynamic Island, home indicator, SE-size screen, swipe-back, keyboard |
| Mobile web / PWA | Chrome Android + Safari iOS, installed (standalone) and in-browser |
| Tablet | iPad / Android tablet, portrait + landscape, sidebar layout |
| Desktop web | ≥1024 sidebar layout, hover, keyboard focus |
If you could not check a target, say so in the task report.

### Screenshots are mandatory (STRICT)

**A UI task is not done until you have LOOKED at the changed screen in a real
screenshot at mobile width AND at desktop width.** Attach or reference both in
the task report. Reading the code is not a substitute: the gap and width bugs
fixed on 2026-10-05 were all plainly visible in one screenshot and invisible in
a code review, because they came from how two `flex` siblings shared the
height, not from a wrong value.

- Mobile ~375px and desktop 1440px are the minimum. Add tablet (768) when the
  screen changes layout at that breakpoint.
- Web screenshots: Playwright against the dev server is enough and is the
  fastest route for all three widths.
- Native screenshots: `xcrun simctl io <device> screenshot <file>` on the iOS
  simulator.
- If a screen needs login and you have no credentials, **ask for them** rather
  than marking the task done on a code review alone, and say in the report
  exactly which screens you could not see.
- Look for: dead vertical gaps, content not using the full width, horizontal
  overflow, clipped text, title/body misalignment, overlapping bars.

**Android cannot be run on this machine (no emulator, no storage for Android Studio).** The written **Android code review** of changed files is required ONLY at the END of a phase, or when the task touches Android-specific areas (safe areas, system bars, back handling, keyboard, shadows, fonts, native modules). It is NOT required for every UI task. Check by reading the code:
- All bottom spacing (tab bar, sticky buttons, sheets, FABs, toasts) uses `insets.bottom`; nothing assumes 0 on Android.
- Layout works with edge-to-edge and a 3-button nav bar (about 48px inset), gesture nav, and no nav bar.
- Hardware back is handled (overlays close first, root tab behaviour, unsaved-form confirm) via the shared hook.
- Keyboard: focused input is never covered; sticky submit moves above the keyboard.
- Text uses the per-weight DM Sans font names (no `fontWeight` that makes Android fall back to the system font); no clipped text with large font scale.
- No iOS-only or web-only API is called without a `Platform` guard; no `boxShadow`/hover-only logic leaking to native; shadows go through `shadow()` (elevation on Android).
- Any new native module is listed, because it needs a rebuild.
Do not claim "works on Android". Say "reviewed in code, not run". When the user can run an Android build (real phone via EAS build, or an emulator later), the Android column of the matrix gets tested for real.
