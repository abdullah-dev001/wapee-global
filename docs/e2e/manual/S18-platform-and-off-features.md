# S18 — Screens, phone layout, PWA and hidden features (35 min)

**Goal:** every screen works at phone, tablet and desktop width; deep links, offline, back and keyboard behave; features that are OFF at launch are invisible and cannot be reached.
**Logins / windows:** A = `biz-owner`, `onb01` · B (Incognito) = `team-rec` · G = guest · your phone on the same Wi-Fi (`http://192.168.1.178:8090`, signed-in screens only).
**Ready first:** S01–S17 done. DevTools device toolbar (⇧⌘M) ready; widths: **320**, **375**, **800**, **1440**.

## Layout
1. A: log in as **biz-owner**. At **375**, **800** and **1440** wide, open: Today, Calendar, Clients, a client, Services, Staff, Team, Schedule, Invoices, an invoice, Reports, Commission, Packages, Inventory, Reviews, Website, Settings and each Settings page, More.
   You should see: under 768 a bottom bar (Today, Calendar, Clients, More); 768–1023 a side menu; 1024+ side menu plus top header; drawers full-screen on phone width, ~480 px wide panel on desktop. `[F20-01]`
2. Same screens at **320** and **375**, plus the public pages (`/`, `/e2e-multi`, `/e2e-multi/book`, a manage link, `/privacy`).
   You should see: no sideways scrolling of the page; no text cut off. `[F20-02]`
3. Phone width → **More**.
   You should see: the remaining menu items (Services, Staff, Team, Schedule, Invoices, Reports …) and **Sign out**. (Screen B16.)
4. Phone (real): open `http://192.168.1.178:8090/login`, log in as **team-rec**, open Clients → **New client**, type in each field; also Calendar → New appointment.
   You should see: the focused field stays visible above the keyboard; Enter / Next moves on or submits. (Public booking-form keyboard check: use 375 emulation on the Mac.) `[F20-09]`

## Links, offline, back
5. A: hard-refresh (⌘⇧R) each: a `/clients/<id>` page, `/settings/booking`, `/e2e-team/book`, a manage link from links.md.
   You should see: each reloads into the same screen; no bounce to `/` or to Today. `[F20-03]`
6. A (signed in): open `/`.
   You should see: the landing page with a signed-in header and a button into the app (to Today). `[F20-04]`
7. A: DevTools → Network → **Offline**. Click around the app; then open `/e2e-team/book`. Press **Try again**, then switch back to **No throttling** and press Try again.
   You should see: a full-screen "No internet connection" with **Try again**; after going online it recovers. `[F20-07]`
8. A: open a drawer (e.g. New appointment), type something, press browser **Back**; open a dialog, press **Escape**.
   You should see: Back / Escape closes the top drawer or dialog first (not the page); a drawer with typed text asks before discarding. Android Back button: reviewed in code, not run. `[F20-08]`

## Install and update (Mac Chrome; phones need the HTTPS preview)
9. A: Chrome address bar → **Install** icon (or ⋮ → Cast, save and share → Install Wapee). Open the installed app.
   You should see: it opens standalone at Today with the Wapee icon. Android / iPhone install and the iOS "Add to Home Screen" hint: **later**, on the HTTPS preview. `[F20-05]`
10. Leave the app open. Tell Claude **"run C-S18-01"** (Claude builds and serves a new version). Switch away and back to the app.
    You should see: "Update available" with **Reload**; after Reload the new version runs. `[F20-06]`

## States and messages
11. A: log in as **onb01** (E2E Onboard Spa, few data). Open Invoices, Reviews, Packages, Inventory, Clients search with no match, Message log.
    You should see: every empty list has an empty-state message (and an action where it makes sense). `[F20-12]`
12. DevTools → Network throttling **Slow 3G** → open Clients, Calendar. Then right-click one data request → **Block request URL** → reload.
    You should see: grey skeleton placeholders while loading (no spinner-only lists); with the blocked request an error message with **Try again**. Unblock after. `[F20-12]`
13. Think back over S02–S17: duplicate phone, staff limit, slot taken, locked currency, wrong password …
    You should see (you have): always a friendly sentence, never raw server text (codes like `23505`, "violates", "PGRST"). Report any you saw. `[F20-13]`
14. A: on `/login` and the New client drawer press **Tab** repeatedly. Look at small icon buttons (close X, delete bin, arrows).
    You should see: a visible focus ring on each control; small icons still have a big enough tap area (about a fingertip, 44 px). `[F20-14]`
    CLAUDE CHECK C-S18-02: no hard-coded user text, plurals correct, no raw translation keys (grep + lint + unit tests). `[F20-10]`
    CLAUDE CHECK C-S18-03: Android / iOS native apps — written code review only, "reviewed in code, not run". `[F20-15]`

## Features OFF at launch
15. A: log in as **biz-owner** → Settings (hub), **Customer notifications**, type `/settings/sms-credits`, **Roles and permissions** → open a role, a message preview (Customer notifications → What customers receive).
    You should see: no SMS card; "SMS messages are coming soon." instead of a switch; `/settings/sms-credits` goes back to Settings; no SMS permissions in the role matrix; no SMS preview. `[F21-01]`
    CLAUDE CHECK C-S18-04 (writes one setting, then puts it back; asks first): the API accepts `sms_enabled = true` (**KG-04**), but no SMS can leave (no Twilio secret: row skipped, no credit used). `[F21-02]`
16. A: **Website** editor tabs.
    You should see: Sections, Theme, Preview — **no Widget** tab. `[F21-03]`
17. Tell Claude **"run C-S18-05"** (it serves a test page on another port that tries to show `/e2e-multi/book` in a frame). Open the link it gives you.
    You should see: the frame stays empty / "refused to connect"; nothing of the booking page shows. `[F21-04]`
    CLAUDE CHECK C-S18-06: widget RPCs / `validate_widget` still answer for Team+ (**KG-04**) — recorded for a decision. `[F21-05]`
18. G: read `/terms`, `/privacy`, `/refund`, the `/e2e-team` website and one booking email in Gmail.
    You should see: no promise of SMS, a website widget, online payments or custom domains. `[F21-06]`

## Checklist
| Case | Pass | Fail | Notes |
|---|---|---|---|
| F20-01 | ☐ | ☐ | |
| F20-02 | ☐ | ☐ | |
| F20-03 | ☐ | ☐ | |
| F20-04 | ☐ | ☐ | |
| F20-05 | ☐ | ☐ | desktop now, phones later |
| F20-06 | ☐ | ☐ | + C-S18-01 |
| F20-07 | ☐ | ☐ | |
| F20-08 | ☐ | ☐ | Android: code only |
| F20-09 | ☐ | ☐ | |
| F20-10 | C | | C-S18-02 |
| F20-12 | ☐ | ☐ | |
| F20-13 | ☐ | ☐ | |
| F20-14 | ☐ | ☐ | |
| F20-15 | C | | C-S18-03 |
| F21-01 | ☐ | ☐ | |
| F21-02 | KG-04 C | | C-S18-04 |
| F21-03 | ☐ | ☐ | |
| F21-04 | ☐ | ☐ | + C-S18-05 |
| F21-05 | KG-04 C | | C-S18-06 |
| F21-06 | ☐ | ☐ | landing part in S01 |
