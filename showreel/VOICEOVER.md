# Voiceover script

Tone: calm, confident, warm. Unhurried, like an Apple product film. About 100 words in 60 s.

Each line starts at the frame below (30 fps) and must finish within **Max**, so it ends before the next scene's line begins. Timings come from `src/voiceover.ts` (`startOffset`) and `SCENES` in `src/theme.ts`; if you change either, the starts move with them.

| # | Scene | File (in `public/`) | Start frame | Start time | Max frames | Max time | Line |
|---|---|---|---|---|---|---|---|
| 1 | hook | `vo/01-hook.mp3` | 12 | 0.40s | 74 | 2.5s | Booking shouldn't be this hard. |
| 2 | booking | `vo/02-booking.mp3` | 104 | 3.47s | 162 | 5.4s | With Wapee, clients book online in seconds, from any device. |
| 3 | calendar | `vo/03-calendar.mp3` | 284 | 9.47s | 132 | 4.4s | Your whole team's day, in one live calendar. |
| 4 | notifications | `vo/04-notifications.mp3` | 434 | 14.47s | 132 | 4.4s | Confirmations and reminders go out by email, SMS and push. |
| 5 | clients | `vo/05-clients.mp3` | 584 | 19.47s | 132 | 4.4s | Every client's history, notes and details, in one place. |
| 6 | money | `vo/06-money.mp3` | 734 | 24.47s | 132 | 4.4s | Turn any appointment into an invoice, and track revenue. |
| 7 | packages | `vo/07-packages.mp3` | 884 | 29.47s | 132 | 4.4s | Sell session packages and track every visit used. |
| 8 | forms | `vo/08-forms.mp3` | 1034 | 34.47s | 132 | 4.4s | Collect consent and signatures before they arrive. |
| 9 | reviews | `vo/09-reviews.mp3` | 1178 | 39.27s | 78 | 2.6s | Collect reviews that build trust. |
| 10 | website | `vo/10-website.mp3` | 1274 | 42.47s | 132 | 4.4s | Get a booking website, or embed booking on yours. |
| 11 | team | `vo/11-team.mp3` | 1424 | 47.47s | 132 | 4.4s | Roles, commissions, multiple branches. Grow without switching tools. |
| 12 | industries | `vo/12-industries.mp3` | 1574 | 52.47s | 102 | 3.4s | One engine for every appointment business. |
| 13 | close | `vo/13-close.mp3` | 1694 | 56.47s | 102 | 3.4s | Wapee. Your whole appointment business, set up in minutes. |
The product name in lines 2 and 13 comes from `BRAND.name` in `src/theme.ts`. If the product is renamed, re-record those two lines.

## Recording notes

- One file per line, named exactly as in the table (they match `VO.lines` in `src/voiceover.ts`).
- MP3 or WAV, 44.1 or 48 kHz, mono or stereo. Trim the silence at the start (about 50 ms of air is fine) so the line lands on its start frame.
- Normalise to about -16 LUFS integrated, peaks under -1 dBTP. The SFX sit well below that.
- Over the max time? Speed it up slightly in your editor or rephrase. Never let a line run into the next scene's line.
- Any source works: a studio recording, ElevenLabs or another TTS you're licensed to use, or the free macOS fallback (`scripts/make-vo-mac.sh`).

## Turning it on

1. Put the files in `public/vo/`.
2. In `src/voiceover.ts` set `enabled: true`.
3. `npm run render`. Music (if set) ducks to 30% under each line automatically.
