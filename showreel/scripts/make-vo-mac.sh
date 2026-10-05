#!/usr/bin/env bash
# Free macOS fallback: generate the voiceover with the built-in `say` voices.
# For the real film, record a human voice or use a licensed TTS (see VOICEOVER.md).
#
#   cd showreel && bash scripts/make-vo-mac.sh            # default voice: Ava
#   VOICE=Samantha RATE=170 bash scripts/make-vo-mac.sh
#
# Needs: macOS `say`, ffmpeg (brew install ffmpeg). Writes public/vo/NN-scene.mp3.
set -euo pipefail

cd "$(dirname "$0")/.."

# Keep in sync with BRAND.name in src/theme.ts.
BRAND="${BRAND:-Wapee}"
VOICE="${VOICE:-Ava}"
RATE="${RATE:-165}"
OUT="public/vo"

command -v say >/dev/null || { echo "This script needs macOS 'say'." >&2; exit 1; }
command -v ffmpeg >/dev/null || { echo "Install ffmpeg first (brew install ffmpeg)." >&2; exit 1; }
if ! say -v '?' | grep -q "^${VOICE} "; then
  echo "Voice '${VOICE}' not installed; falling back to Samantha." >&2
  echo "(Add better voices in System Settings > Accessibility > Spoken Content.)" >&2
  VOICE="Samantha"
fi

mkdir -p "$OUT"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# file | max seconds | text   (mirrors src/voiceover.ts and VOICEOVER.md)
while IFS='|' read -r file max text; do
  [ -z "$file" ] && continue
  say -v "$VOICE" -r "$RATE" -o "$tmp/line.aiff" "$text"
  ffmpeg -loglevel error -y -i "$tmp/line.aiff" \
    -af "silenceremove=start_periods=1:start_threshold=-50dB,loudnorm=I=-16:TP=-1.5:LRA=11" \
    -ar 44100 -ac 2 -b:a 192k "$OUT/$file"
  dur="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/$file")"
  flag=""
  awk -v d="$dur" -v m="$max" 'BEGIN { exit !(d > m) }' && flag="  <-- longer than ${max}s, raise RATE or trim"
  printf '%-22s %5.2fs / %ss%s\n' "$file" "$dur" "$max" "$flag"
done <<LINES
01-hook.mp3|2.5|Booking shouldn't be this hard.
02-booking.mp3|5.4|With ${BRAND}, clients book online in seconds, from any device.
03-calendar.mp3|4.4|Your whole team's day, in one live calendar.
04-notifications.mp3|4.4|Confirmations and reminders go out by email, S M S and push.
05-clients.mp3|4.4|Every client's history, notes and details, in one place.
06-money.mp3|4.4|Turn any appointment into an invoice, and track revenue.
07-packages.mp3|4.4|Sell session packages and track every visit used.
08-forms.mp3|4.4|Collect consent and signatures before they arrive.
09-reviews.mp3|2.6|Collect reviews that build trust.
10-website.mp3|4.4|Get a booking website, or embed booking on yours.
11-team.mp3|4.4|Roles, commissions, multiple branches. Grow without switching tools.
12-industries.mp3|3.4|One engine for every appointment business.
13-close.mp3|3.4|${BRAND}. Your whole appointment business, set up in minutes.
LINES

echo "Done. Set enabled: true in src/voiceover.ts and run npm run render."
