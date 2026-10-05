# Showreel

Standalone Remotion 4 project for the 60 s product explainer video (13 scenes, 1800 frames at 30 fps). It is **not** part of the app build and shares nothing with the root project.

```bash
cd showreel
npm install
npm run studio      # live preview
npm run typecheck
npm run render      # -> out/wapee-showreel.mp4 (H.264, CRF 17, AAC audio)
npm run still -- stills/f150.png --frame=150
```

If Remotion cannot download its own Chrome, pass a local one:
`npm run render -- --browser-executable=/path/to/chrome-headless-shell`

## Where things live

| Path | What |
|---|---|
| `src/theme.ts` | Brand name, tagline, CTA, `MUSIC`, `LOGO`, design tokens, easing, and `SCENES` (order + lengths; the video length is their sum) |
| `src/scenes/*.tsx` | One file per scene. Each exports its local timeline (`BOOKING_T`, `FORMS_T`, ...) |
| `src/sfx.ts` | Sound-effect cue list `{ scene, frame, file, volume }`, built from those timelines so sounds stay in sync if timing changes |
| `src/voiceover.ts` | Voiceover lines, start offsets, ducking settings |
| `scripts/make-sfx.py` | Synthesises every sound effect into `public/sfx/` |
| `scripts/make-vo-mac.sh` | Free macOS voiceover fallback |
| `VOICEOVER.md` | The script with start frames and max durations |

Fonts: DM Sans 400–700 bundled from `@fontsource/dm-sans` (no network).

## Sound effects

All SFX are synthesised from scratch (no samples, no downloads). The WAVs are committed; to regenerate:

```bash
python3 -m venv .venv && .venv/bin/pip install numpy
.venv/bin/python scripts/make-sfx.py
```

Volumes are per cue in `src/sfx.ts` (0.14–0.35). `SFX_GAIN` scales them all; set it to `0` to mute.

## Voiceover, music and logo

1. **Voiceover.** Record or generate the 13 lines in `VOICEOVER.md`, named as listed there, into `public/vo/`. Then set `enabled: true` in `src/voiceover.ts`. With it off (the default) nothing is loaded and the files don't need to exist.
   - macOS fallback: `bash scripts/make-vo-mac.sh` (built-in `say` + ffmpeg). Try `VOICE=Samantha` or `RATE=170`.
   - Any other TTS (ElevenLabs, etc.) or a studio recording works the same way: just match the file names.
2. **Music.** Put a licensed track in `public/` (e.g. `public/music/track.mp3`) and set `MUSIC = 'music/track.mp3'` in `src/theme.ts`. It fades in over 20 frames and out over the last 45. While a VO line plays it ducks to 30% (`VO.duckTo`) with a 10-frame ramp.
3. **Logo.** Set `LOGO = 'logo.svg'` (a file in `public/`) to replace the text wordmark on the closing scene.
4. `npm run render`.
