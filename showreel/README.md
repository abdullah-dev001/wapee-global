# Showreel

Standalone Remotion 4 project for the ~37 s product explainer video. It is **not** part of the app build and shares nothing with the root project.

```bash
cd showreel
npm install
npm run studio      # live preview
npm run typecheck
npm run render      # -> out/wapee-showreel.mp4 (H.264, CRF 17)
npm run still -- stills/f150.png --frame=150
```

If Remotion cannot download its own Chrome, pass a local one:
`npm run render -- --browser-executable=/path/to/chrome-headless-shell`

- Brand name, tagline, CTA, optional `MUSIC` / `LOGO` paths and all tokens: `src/theme.ts` (files go in `public/`).
- Scenes: `src/scenes/*.tsx`, one per scene, timed by `SCENES` in `theme.ts`.
- Fonts: DM Sans 400–700 bundled from `@fontsource/dm-sans` (no network).
