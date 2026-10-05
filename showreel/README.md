# Showreel

Standalone Remotion 4 project for the 60 s product film (13 scenes, 1800 frames at 30 fps). It is **not** part of the app build and shares nothing with the root project.

```bash
cd showreel
npm install
npm run studio        # live preview
npm run render        # one render → master audio → out/wapee-showreel.mp4
npm run verify        # typecheck + duration, streams, size, loudness checks
npm run render:4k     # same at --scale=2 → out/wapee-showreel-4k.mp4
npm run stills        # contact sheet of the whole film (every 15th frame)
npm run stills -- 150 330 480        # specific frames, full size
npm run sfx           # regenerate the sound effects (needs numpy + scipy)
npm run typecheck
npm run profile       # per-scene render cost
```

Rendering needs Chrome (Remotion downloads one) and **ffmpeg** on your PATH for mastering (`brew install ffmpeg`). To use a local Chrome/Chromium instead of the download, set `REMOTION_BROWSER_EXECUTABLE=/path/to/chrome`.

## How it fits together

| Path | What |
|---|---|
| `src/theme.ts` | Brand name, tagline, CTA, `MUSIC`, `LOGO`, design tokens, type scale, easing, scene order/lengths/tone |
| `src/timeline.ts` | **Every event frame** (clicks, typing, badges, count-ups…) per scene, plus transitions and the hold check |
| `src/content.ts` | The story: Sara books a haircut with Amira; the same booking appears in every scene |
| `src/components/` | Shared primitives (Card, Badge, Button, Pill, Toast, IconTile, Avatar, Cursor, Toggle, Swap, Headline) and layouts (`Scene`, `SplitLayout`, `StackLayout`) |
| `src/scenes/*.tsx` | One file per scene |
| `src/audio/cues.ts` | Sound cues, placed on `timeline.ts` events (so audio follows any retime) |
| `src/audio/mix.ts` | Buses (bed, sfx, music, vo), gains, ducking and bed swells |
| `src/voiceover.ts` | Voice lines and where they start |
| `scripts/` | `make-sfx.py`, `render.mjs`, `master.mjs`, `verify.mjs`, `stills.mjs`, `profile.mjs`, `make-vo-mac.sh` |

Retiming: change a frame in `src/timeline.ts`. Picture and sound move together. The build fails if a finished state would hold less than 1 s (the logo less than 2 s).

Transitions follow tone: **push** between two light scenes, **scale-through** when the background changes between teal and light, **soft fade** into the logo.

## Sound

Everything is synthesised by `scripts/make-sfx.py` (numpy + scipy, no samples, no downloads): FM bells for the notifications, modal wood and glass ticks with three variants each, panned left/centre/right to match the screen, filtered-noise whooshes per transition type, a sub impact for the open and the logo, a 3 s riser, paper-scratch signature, and a seamless 12 s D-major ambient bed. Chimes, whooshes and impacts get a generated convolution reverb; UI ticks stay dry.

```bash
python3 -m venv .venv && .venv/bin/pip install numpy scipy
.venv/bin/python scripts/make-sfx.py
```

Mix (`src/audio/mix.ts`): SFX peak around -6 dBFS, bed around -30 dBFS, bed swells +3 dB at tone changes, and bed and music duck under voice lines (to 30%, 10-frame ramps) and briefly under the big impacts. `BED.pulse = true` adds an optional soft 75 BPM pulse.

Mastering (`scripts/master.mjs`, run by `npm run render`): EBU R128 measurement, then one gain to **-16 LUFS integrated** with a 4×-oversampled limiter so **true peak ≤ -1 dBTP**, re-measured after AAC encoding. Video is copied untouched. Output: H.264 CRF 17, yuv420p BT.709, AAC 192 kb/s, `+faststart`.

## Voiceover, music and logo

1. **Voiceover**: put the 13 files from `VOICEOVER.md` in `public/vo/` with the exact names listed, then set `enabled: true` in `src/voiceover.ts`. Before rendering, each file's real length is measured, so ducking follows the actual recording. A missing file stops the render with a clear message.
   - Free macOS fallback: `bash scripts/make-vo-mac.sh` (built-in `say` + ffmpeg). Any other TTS or a studio recording works the same way.
2. **Music**: add a licensed track (for example `public/music/track.mp3`) and set `MUSIC = 'music/track.mp3'` in `src/theme.ts`. It fades in over 20 frames and out over 45, and ducks under the voice.
3. **Logo**: set `LOGO = 'logo.svg'` (a file in `public/`) to replace the text wordmark.
4. `npm run render && npm run verify`.
