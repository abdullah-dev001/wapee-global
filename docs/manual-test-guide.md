# Wapee — Manual test guide (Phases 0–7 + Phase 6 notifications)

Built from the `context/*.md` files (state: 2026-10-09). Only things a context file says are **built** are listed as testable. Anything else is in section 6.
Pass/Fail column: write `P`, `F` (then file a bug, section 7) or `N/A`. IDs are stable: quote them in bug reports.
Roles: **O** Owner · **M** Manager · **R** Receptionist · **S** Staff · **Anon** not signed in (customer) · **Any** every signed-in role.

---

## 1. Setup

### 1.1 Run the app
| What | Command / action |
|---|---|
| Web dev server | `npm run web` (or `npx expo start --web --port 8090 --non-interactive --clear` after code edits; stale bundle = `--clear`). Open `http://localhost:8090` |
| iOS simulator (first time, or after a new native module: `expo-clipboard`, `expo-image-picker`) | `npm run ios` |
| iOS simulator (already built) | `npx expo start --port 8092 --non-interactive`, then launch the dev client: `xcrun simctl openurl booted "exp+wapee://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8092"` |
| Reload the bundle | Simulator: Cmd+R (or shake → Reload). Web: browser refresh; if a fix seems missing restart Metro with `--clear` |
| Deep links (simulator) | `xcrun simctl openurl booted "wapee://<route>"`, e.g. `wapee://nova-hair-studio/book`. **Do not try to tap the simulator by script**; use screenshots + deep links. Tap by hand. |
| Manage / review link on native | `wapee://<slug>/manage#token=<token>` and `wapee://<slug>/review#token=<token>` |
| Dev-only gallery | `/_gallery` (dev builds only; every UI primitive; no login) |
| Smoke test of the public API | `npm run smoke:public` (needs `SMOKE_*` env, see booking-public-api.md). It spends the per-IP 10/hour `create_booking` budget: do it **last** or in a quiet hour. |

### 1.2 Existing dev accounts (passwords: **ask the owner**, never written here)
| Email | Business (slug) | Role | Branch timezone |
|---|---|---|---|
| wapee.owner.1790890259@gmail.com | Nova Hair Studio (`nova-hair-studio`) | Owner | America/New_York |
| wapee.br.1790909857@gmail.com | Buenos Clinic (`buenos-clinic`) | Owner | America/New_York |
| wapee.br2.1790911062@gmail.com | Rosario Clinic 19481 (`rosario-clinic-19481`) | Owner | America/New_York |

`nova-hair-studio` was seeded in Phase 3 with branch hours Mon–Fri 09:00–17:00, one service "Haircut (test)" ($30) and staff "Alex (test)". Treat it as shared, do not delete it. A fresh business (1.3) is better for destructive tests.

### 1.3 Create a throwaway business and one user per role
1. **Owner:** `/signup` with a real inbox you can read. Confirm the email by link or (non-team address) ask the owner to run `update auth.users set email_confirmed_at = now() where email = '…';`. Sign in → onboarding wizard (section ONB) → business "QA Salon" slug `qa-salon-<yymmdd>`.
2. **Manager / Receptionist / Staff:** as the Owner open `/members` → Invite (email + role + branch) → copy the one-time link. Open it in a private window, sign up with that email, confirm the email (SQL as above), reopen the link while signed in with that same address. Repeat for the 3 roles (3 different emails; Gmail `+alias` addresses work: `you+mgr@gmail.com`).
3. **Real-email tests may use ONLY `wapeeglobal@gmail.com`** (Resend's test sender delivers to its account owner only). Any other address → Resend 403 and the message goes `dead`. Use it as the *client email* in the booking form for all notification tests (NOT for the user accounts above, unless you can read that inbox).
4. Supabase's built-in auth email only reaches Supabase team members and is rate-limited (429): wait, don't retry in a loop.

### 1.4 Seed data first (needed by almost every later section)
| # | Seed | Where | Value |
|---|---|---|---|
| 1 | Branch hours | `/schedule` → Opening hours | Mon–Fri 09:00–17:00 (+ Sat 10:00–14:00 to test a second weekday shape) |
| 2 | Category (DB/hook only: no UI) | skip | uncategorised is fine |
| 3 | Service A | `/services` | "Cut" 30 min, price 30.00, buffer 0 |
| 4 | Service B | `/services` | "Colour" 90 min, price 120.00, buffer 15 |
| 5 | Staff 1, Staff 2 | `/staff` | both assigned to the branch + both services; no login |
| 6 | Staff hours | Staff → schedule drawer | Staff 1 Mon–Fri 09:00–17:00 with 12:00–13:00 break; Staff 2 Mon–Wed 10:00–16:00 |
| 7 | Booking settings | `/settings/booking` | defaults, then see BKS |
| 8 | Client | `/clients` | "Test Client" +15551234567 |
| 9 | Branch Google review URL | DB/branch field if available (https only) | needed for REV google button check |

---

## 2. Feature sections (run in this order)

### 2.1 AUTH — `/login /signup /verify /forgot-password /reset-password`
| ID | Where | Steps | Expected | Role | P/F |
|---|---|---|---|---|---|
| AUTH-01 | `/signup` | Open signed out | Centred 400px card, wordmark, same card on mobile + desktop | Anon | ☐ |
| AUTH-02 | `/signup` | Submit empty form | Field errors under each field; submit not sent | Anon | ☐ |
| AUTH-03 | `/signup` | Invalid email (`abc`) | Email-invalid message under field | Anon | ☐ |
| AUTH-04 | `/signup` | Password 7 chars | Min-8 error | Anon | ☐ |
| AUTH-05 | `/signup` | Password 73 chars | Max-72 error | Anon | ☐ |
| AUTH-06 | `/signup` | Password field show/hide toggle | Text shown/hidden; works on all platforms | Anon | ☐ |
| AUTH-07 | `/signup` | Valid signup | Submit button disabled while sending; lands on `/verify`; toast/result | Anon | ☐ |
| AUTH-08 | `/signup` | Sign up with an already-registered email | Clear error, no crash, no account enumeration beyond Supabase default | Anon | ☐ |
| AUTH-09 | `/verify` | Waiting screen | Shows address, "resend" action; no app access | Anon (unverified) | ☐ |
| AUTH-10 | `/verify` | Press resend repeatedly | Works once; fast repeats may return 429 → wait message, not crash | Anon | ☐ |
| AUTH-11 | `/verify` | Confirm email (link or SQL) then return | Auto-redirects away from `/verify` (to onboarding if no business) | Anon | ☐ |
| AUTH-12 | `/login` | Wrong password | Error message, stays on screen, no session | Anon | ☐ |
| AUTH-13 | `/login` | Correct credentials | Lands on `/today` (or onboarding if no business) | Any | ☐ |
| AUTH-14 | `/login` | Unverified account login | Redirected to `/verify` | Anon | ☐ |
| AUTH-15 | `/login` | Reload the page / kill and reopen the app | Session persists (localStorage web, SecureStore native), no re-login | Any | ☐ |
| AUTH-16 | `/forgot-password` | Request reset for a real and for an unknown address | **Same success message both times** (no enumeration) | Anon | ☐ |
| AUTH-17 | `/forgot-password` | Request reset for team-member address | Reset email arrives (non-team address: none arrives, expected) | Anon | ☐ |
| AUTH-18 | `/reset-password` | Open the email link; set password < 8 | Validation error | Anon | ☐ |
| AUTH-19 | `/reset-password` | Set valid new password; log in with it | Works; old password no longer works | Anon | ☐ |
| AUTH-20 | Route guard | Signed out, open `/services`, `/calendar`, `/invoices` by URL | Redirect to `/login` (not an empty screen) | Anon | ☐ |
| AUTH-21 | Route guard | Signed in + verified, open `/login` | Redirect to `/` | Any | ☐ |
| AUTH-22 | Sign out | Sidebar (tablet/desktop) and More (mobile) → Sign out | Back to `/login`; back button doesn't reveal private data; re-login as another user shows no data of the previous one (query cache cleared) | Any | ☐ |
| AUTH-23 | Public groups | Signed out open `/<slug>`, `/<slug>/book`, `/<slug>/manage`, `/unsubscribe` | Open without login (only `(auth)`/`(public)` are public) | Anon | ☐ |
| AUTH-24 | `/accept-invite` | Open an invite link while signed out | Renders (not redirected); names the business; offers sign-up/sign-in | Anon | ☐ |

### 2.2 ONB — `/onboarding`
| ID | Where | Steps | Expected | Role | P/F |
|---|---|---|---|---|---|
| ONB-01 | `/onboarding` | Verified user with no business logs in | Gate redirects to `/onboarding`; "Step 1 of 2" | O | ☐ |
| ONB-02 | Step 1 | Type business name | Slug auto-suggested from name | O | ☐ |
| ONB-03 | Step 1 | Edit the slug manually, then change the name | Slug no longer follows the name | O | ☐ |
| ONB-04 | Step 1 | Slug of an existing business (`nova-hair-studio`) | Live "not available" message (debounced ~400 ms) | O | ☐ |
| ONB-05 | Step 1 | Reserved slug (`admin`, `unsubscribe`, `www` …) | Not available | O | ☐ |
| ONB-06 | Step 1 | Bad format (spaces, uppercase, `--`, too short/long, leading dash) | Format error | O | ☐ |
| ONB-07 | Step 1 | Industry select | Opens a sheet on every platform (not native picker) | O | ☐ |
| ONB-08 | Step 2 | Heading "Your first location" | Says country/currency/timezone belong to this location | O | ☐ |
| ONB-09 | Step 2 | Pick Pakistan | Currency PKR + timezone Asia/Karachi pre-filled; all fields still changeable | O | ☐ |
| ONB-10 | Step 2 | Pick a country not in the 37-row table (e.g. Iceland) | No pre-fill; owner picks currency and timezone | O | ☐ |
| ONB-11 | Step 2 | Pick US / Canada / Brazil / Australia / Mexico / Indonesia / Russia | Main time zones listed first, all others below | O | ☐ |
| ONB-12 | Step 2 | Lists | 280 countries, 162 currencies, 418 timezones searchable; no crash on device | O | ☐ |
| ONB-13 | Step 2 | Read currency hint | Warns that currency is hard to change later (invoices) | O | ☐ |
| ONB-14 | Step 2 | Location name blank vs filled | Blank → branch named after the business | O | ☐ |
| ONB-15 | Submit | Create business | Submit disabled while sending; lands in app (`/today`); branch is primary | O | ☐ |
| ONB-16 | After create | Check trial | Trial banner **not** shown yet (only last 3 days); business active; status trialing 14 days | O | ☐ |
| ONB-17 | After create | `/members` | One member (you) with Owner role | O | ☐ |
| ONB-18 | After create | Sign out/in | Opens the same business (default_business_id) | O | ☐ |
| ONB-19 | Second business | Same user tries to create another via `/onboarding` | Refused (one business per self-serve signup) | O | ☐ |
| ONB-20 | Invoice prefix | After creating, create+issue an invoice later (INV) | Number starts with first 3 letters of the location name, uppercased | O | ☐ |
| ONB-21 | Failure | Create with network off | Error shown, nothing half-created, retry works | O | ☐ |

### 2.3 ROLE — roles, permissions, nav gating
| ID | Where | Steps | Expected | Role | P/F |
|---|---|---|---|---|---|
| ROLE-01 | Nav | Owner opens app | Mobile bottom tabs <768, sidebar 768–1023, sidebar+header ≥1024; all areas visible | O | ☐ |
| ROLE-02 | Nav | Manager nav | Same as Owner except Wapee billing; **no Website** (website.edit not held) | M | ☐ |
| ROLE-03 | Nav | Receptionist nav | Today, Calendar, Clients, Invoices; **no** Reports, Website, Members-manage, Services/Staff manage | R | ☐ |
| ROLE-04 | Nav | Staff nav | Today, Calendar (own column), Clients (own), Reviews (own); **no** Invoices, Reports, Website, Settings hub for business | S | ☐ |
| ROLE-05 | Nav | Today and More | Always present for every role (bottom bar never collapses) | Any | ☐ |
| ROLE-06 | Loading | Reload and watch the menu | Skeleton rows while permissions load; nothing flashes in then vanishes | Any | ☐ |
| ROLE-07 | Direct URL | As Staff open `/invoices`, `/reports`, `/website`, `/settings/booking` | "No access" lock empty state (URL kept, no redirect, no crash) | S | ☐ |
| ROLE-08 | Direct URL | As Receptionist open `/reports`, `/website`, `/settings/booking` | No-access state | R | ☐ |
| ROLE-09 | Direct URL | As Manager open `/website` | No-access state | M | ☐ |
| ROLE-10 | Settings hub | Manager opens `/settings` | Reachable via "settings.booking" (Booking, Notifications, Messages cards); Business-only cards hidden | M | ☐ |
| ROLE-11 | Settings hub | Receptionist/Staff `/settings` | Only "My notifications" card (every member) | R/S | ☐ |
| ROLE-12 | Escalation | Manager invites someone as **Owner** | Refused ("You cannot grant …"); role picker should not offer Owner | M | ☐ |
| ROLE-13 | Last owner | Try to remove/demote the only Owner (no UI: DB guard) | Not possible from the UI; note as covered by SQL | O | ☐ |
| ROLE-14 | Role change | After invite accepted, new member's nav updates | Matches role table (permissions cached 10 min, refreshed on accept) | Any | ☐ |
| ROLE-15 | Super admin | `/admin` as a normal user | Not usable (placeholder/blocked); no admin data | Any | ☐ |
| ROLE-16 | Plan gating | Business with `plan = null` (trial) | All Business-level features available | O | ☐ |

### 2.4 MEM — `/members`, `/accept-invite`
| ID | Where | Steps | Expected | Role | P/F |
|---|---|---|---|---|---|
| MEM-01 | `/members` | Open | List with Active/Invited/Expired/Disabled badges; skeleton on load; empty/error+retry states | O/M | ☐ |
| MEM-02 | `/members` | Receptionist/Staff open | Staff.view needed for list; no Invite button for anyone without `users.invite` | R/S | ☐ |
| MEM-03 | Invite drawer | Open "Invite" | Drawer (480px desktop / full sheet mobile); email, role, branch fields | O/M | ☐ |
| MEM-04 | Invite drawer | Submit empty / bad email | Field errors | O/M | ☐ |
| MEM-05 | Invite drawer | Role picker as Manager | Only roles the Manager may grant (no Owner) | M | ☐ |
| MEM-06 | Invite drawer | Valid invite | One-time link shown as selectable text + copy button; row appears as "Invited" | O/M | ☐ |
| MEM-07 | Invite drawer | Copy button | Link copied (needs native rebuild for `expo-clipboard`); failure shown not silent | O/M | ☐ |
| MEM-08 | Invite link | Shape | https link (never `wapee://`), token in query `?token=` | O/M | ☐ |
| MEM-09 | Invite | Re-invite same email | Old link stops working; one pending row | O/M | ☐ |
| MEM-10 | Invite | Invite an active member's email | Refused (already a member) | O/M | ☐ |
| MEM-11 | Accept | Open link signed in as the invited address | Business named; accept → joined, role applied, nav per role | Any | ☐ |
| MEM-12 | Accept | Open link signed in as a **different** account | Generic "not valid" screen; no membership created | Any | ☐ |
| MEM-13 | Accept | Reuse the same link after accepting | Same generic failure | Any | ☐ |
| MEM-14 | Accept | Expired invite (>7 days; set `invite_expires_at` in the past in DB) | Same generic failure, preview empty | Any | ☐ |
| MEM-15 | Accept | Unknown/garbage token | Same generic failure | Anon | ☐ |
| MEM-16 | Accept | Signed out, new invitee | Sent to sign-up → `/verify`; must reopen link after confirming; still valid ≤7 days | Anon | ☐ |
| MEM-17 | Accept | Existing account joins a 2nd business | First membership untouched | Any | ☐ |
| MEM-18 | Rate limit | 11+ wrong attempts on one token in an hour | Throttled (generic failure); counter persists | Anon | ☐ |
| MEM-19 | Expired badge | Pending invite older than 7 days | Shows "Expired" (error tint) | O/M | ☐ |
| MEM-20 | Known gaps | Look for change role / remove member / revoke / resend invite | **Not built** (confirm absent; not a bug) | O | ☐ |

### 2.5 BIL — trial lock + banner
| ID | Where | Steps | Expected | Role | P/F |
|---|---|---|---|---|---|
| BIL-01 | Banner | Set `trial_ends_at` to now+2 days | Banner "Your trial ends in 2 days." (warning tint) with "Contact us" | O | ☐ |
| BIL-02 | Banner | now+30 hours | Reads "ends tomorrow" | O | ☐ |
| BIL-03 | Banner | now+10 hours | "ends today", **error tint** | O | ☐ |
| BIL-04 | Banner | now+5 days | No banner | O | ☐ |
| BIL-05 | Banner | Other roles during last 3 days | Not shown (needs `settings.billing`, Owner only) | M/R/S | ☐ |
| BIL-06 | Banner | Tap | Goes to `/settings` (no `/billing` route yet) | O | ☐ |
| BIL-07 | Banner layout | Mobile 375 | No doubled top gap (banner carries the inset; screens skip theirs) | O | ☐ |
| BIL-08 | Lock | Set `trial_ends_at` in the past; reload | Every operational screen shows "Your trial has ended" lock card; says nothing was deleted | Any | ☐ |
| BIL-09 | Lock | Still reachable while locked | `/settings`, `/more` (mobile); `/billing` does not exist yet | O | ☐ |
| BIL-10 | Lock | Buttons | "Contact us" opens mail (support placeholder) and Sign out works | Any | ☐ |
| BIL-11 | Lock | Status suspended | Same lock, different wording | Any | ☐ |
| BIL-12 | Lock | While open at expiry | Locks within ~30 s without reload | O | ☐ |
| BIL-13 | Lock | Public booking `/<slug>/book` of a locked business | Generic "not available" (see BKP) | Anon | ☐ |
| BIL-14 | Lock | Write attempts when locked (e.g. invite) | Refused (server `can()`), UI doesn't offer them | O | ☐ |
| BIL-15 | Unlock | Restore `trial_ends_at` | App works again, data intact | O | ☐ |
| BIL-16 | Super admin | Super admin on a locked business | Never locked out (needs a super-admin account; may be N/A) | SA | ☐ |

### 2.6 SVC — `/services`
| ID | Where | Steps | Expected | Role | P/F |
|---|---|---|---|---|---|
| SVC-01 | `/services` | Empty business | Empty state with add action; skeleton while loading | O | ☐ |
| SVC-02 | Create | "+" → name, duration 30, price 30.00 | Drawer; saves; appears in list immediately | O | ☐ |
| SVC-03 | Create | Empty name | Field error | O | ☐ |
| SVC-04 | Create | Duration 4 and 1441 | Rejected (5–1440) | O | ☐ |
| SVC-05 | Create | Price negative | Rejected | O | ☐ |
| SVC-06 | Create | Price 0 | Allowed (free service) | O | ☐ |
| SVC-07 | Create | MoneyInput | Stores minor units; currency symbol/exponent from the **branch** (PKR/JPY no decimals; KWD 3) | O | ☐ |
| SVC-08 | Create | Duplicate name (case-insensitive: "cut" vs "Cut") | Refused with clear message | O | ☐ |
| SVC-09 | Create | Buffer minutes | Saved; hint explains service buffer **replaces** branch buffer (10 vs 15 = 15, not 25) | O | ☐ |
| SVC-10 | Create | Toggles: active / bookable online | Hidden/not-online services show a Badge | O | ☐ |
| SVC-11 | Create | Assign staff in the form | Staff list saved (see STF) | O | ☐ |
| SVC-12 | Create | Per-branch enable switch | `enabled=false` → service not offered at that branch | O | ☐ |
| SVC-13 | Edit | Open, change price, save | List updates; reopen shows saved value; no duplicate price row | O | ☐ |
| SVC-14 | Edit | Dirty form, close drawer | Confirm before discarding (if implemented) / no data loss | O | ☐ |
| SVC-15 | Search | Type 1 char / 2 chars | 1 char: no search; ≥2 chars after 300 ms debounce → server-side filter | O | ☐ |
| SVC-16 | Search | No match | Empty-search state | O | ☐ |
| SVC-17 | Delete | Delete → dialog | Dialog says history is kept; confirm → disappears; old appointments still show the name | O | ☐ |
| SVC-18 | Grouping | Services with/without category | Grouped by category, uncategorised last (categories only via DB) | O | ☐ |
| SVC-19 | Permission | Staff/Receptionist open `/services` | Read only for those who can view catalogue; no add/edit/delete buttons; server refuses writes | R/S | ☐ |
| SVC-20 | Error | Network off during load | Error state with Retry | O | ☐ |
| SVC-21 | Layout | Drawer keyboard | Focused field/footer not covered by keyboard (iOS) | O | ☐ |
| SVC-22 | Non-atomic | Known limit | If price write fails the service still exists; editing again fixes it | O | ☐ |

### 2.7 STF — `/staff`
| ID | Where | Steps | Expected | Role | P/F |
|---|---|---|---|---|---|
| STF-01 | `/staff` | Empty | Empty state + add action | O/M | ☐ |
| STF-02 | Create | Name only, no email/phone | Saves; "No app access" badge shown | O/M | ☐ |
| STF-03 | Create | Display name vs login | display_name independent (e.g. "Dr. A") | O/M | ☐ |
| STF-04 | Create | Email field | Labelled as contact detail, says it creates **no** login | O/M | ☐ |
| STF-05 | Create | Assign branch + services | Saved; reopen confirms | O/M | ☐ |
| STF-06 | Create | `is_active` off | No new bookings; history kept | O/M | ☐ |
| STF-07 | Create | `is_bookable_online` off | Missing from the public page staff list, still bookable in dashboard | O/M | ☐ |
| STF-08 | List | Branch filter / search | Branch filter in-memory; staff with no branch still listed | O/M | ☐ |
| STF-09 | Edit | Change services, save | Service's staff list also updated (cross-invalidation) | O/M | ☐ |
| STF-10 | Delete | Remove → dialog | Says history is kept; soft delete | O/M | ☐ |
| STF-11 | Schedule button | Owner/Manager/Staff | Visible to holders of `staff.manage_schedule` (Staff for own row only) | O/M/S | ☐ |
| STF-12 | Permission | Receptionist | View only (no Add/Edit/Remove) | R | ☐ |
| STF-13 | Permission | Staff | Cannot add staff (server refuses) | S | ☐ |
| STF-14 | Known gap | Look for "give app access" link to invite | **Not built** | O | ☐ |
| STF-15 | Known gap | Photo upload, reorder | **Not built** | O | ☐ |

### 2.8 SCH — `/schedule` and per-staff schedule drawer
| ID | Where | Steps | Expected | Role | P/F |
|---|---|---|---|---|---|
| SCH-01 | `/schedule` | Open | 4 tabs: Opening hours · Time off · Holidays · Rooms | O | ☐ |
| SCH-02 | Opening hours | Toggle a weekday on/off | Off = closed (no row); on shows interval | O | ☐ |
| SCH-03 | Opening hours | Add a split shift 09:00–12:00 + 12:00–17:00 | Accepted (half-open, adjacent legal) | O | ☐ |
| SCH-04 | Opening hours | Overlapping intervals same day | Refused; **previous week survives unchanged** | O | ☐ |
| SCH-05 | Opening hours | End ≤ start; overnight 22:00–02:00 | Refused (no overnight; needs a row per day) | O | ☐ |
| SCH-06 | Opening hours | Save → leave → reopen | Same hours (RPC committed) | O | ☐ |
| SCH-07 | Opening hours | Manager | Read-only/disabled (settings.business is Owner only), still visible | M | ☐ |
| SCH-08 | Time off tab | Add whole-day absence 1 day | Saved; list shows the real last day (no off-by-one) | O/M | ☐ |
| SCH-09 | Time off tab | Past start date | Cannot start in the past (minDate = today in branch tz) | O/M | ☐ |
| SCH-10 | Time off tab | Overlap with existing time off | Refused | O/M | ☐ |
| SCH-11 | Time off tab | Multi-day range | Stored end = start of day after last day | O/M | ☐ |
| SCH-12 | Holidays tab | Add single-day closure (25 Dec) | Shows 25th (not 24th: UTC format) | O | ☐ |
| SCH-13 | Holidays tab | Add a **past** closure | Allowed (no past floor) | O | ☐ |
| SCH-14 | Holidays tab | Overlapping closures / two sharing an end day | Refused | O | ☐ |
| SCH-15 | Holidays | Public effect | On a closure date `/<slug>/book` shows no slots | O/Anon | ☐ |
| SCH-16 | Rooms tab | Add a room | Listed; page states rooms don't affect bookings yet (no capacity editor, always 1) | O | ☐ |
| SCH-17 | Staff drawer | Set Mon–Fri 09–17 + break 12–13 | Saved in one transaction; reopen same | O/M | ☐ |
| SCH-18 | Staff drawer | Overlap / overnight payload | Refused, previous week survives | O/M | ☐ |
| SCH-19 | Staff drawer | Break outside working hours | Accepted (no effect, cosmetic; no warning yet) | O/M | ☐ |
| SCH-20 | Staff drawer | Staff edits **own** hours | Allowed | S | ☐ |
| SCH-21 | Staff drawer | Staff tries another person's hours | Not offered / refused (42501) | S | ☐ |
| SCH-22 | Staff drawer | Staff time off for self | Allowed; for others refused | S | ☐ |
| SCH-23 | Weekday names | Switch language/locale if possible | Names from Intl; week start per locale | Any | ☐ |
| SCH-24 | DateRangePicker | Native/mobile | Calendar month grid, RTL-ready, works | Any | ☐ |
| SCH-25 | Effect | Time off on a day → `/<slug>/book` | That staff has no slots that day | O/Anon | ☐ |
| SCH-26 | Known limits | Half-day time off, per-staff overnight, approval flow | **Not built** | O | ☐ |

### 2.9 BKS — `/settings` hub and `/settings/booking`
| ID | Where | Steps | Expected | Role | P/F |
|---|---|---|---|---|---|
| BKS-01 | `/settings` | Open hub as Owner | Cards: Booking, Notifications, SMS credits, Messages, My notifications | O | ☐ |
| BKS-02 | `/settings/booking` | Open | Two tabs **Settings** and **Booking form**; warnings + booking link on both | O/M | ☐ |
| BKS-03 | Warnings | Fresh branch (no hours/services/staff) | Warnings list each unmet reason (booking disabled, no branch hours, no bookable service, no bookable staff, no staffed service) each with a **fix route** | O | ☐ |
| BKS-04 | Link card | While not bookable | Link NOT shown as active | O | ☐ |
| BKS-05 | Link card | After fixing all warnings | Link `<site>/<slug>/book` active + copy | O | ☐ |
| BKS-06 | Link card | Website unpublished | Extra line "Your website is not published yet, but your booking link works." (only for people who can read the website row) | O | ☐ |
| BKS-07 | Defaults | New branch | staff choice optional, slot display only_available, confirmation auto, show prices on, interval 15, buffer 0, notice 60 min, window 30 days, cancel allowed 24h, rooms off, people per slot 1, online booking on | O | ☐ |
| BKS-08 | Settings tab | Basics visible, Advanced collapsed | Collapsible works | O/M | ☐ |
| BKS-09 | Settings tab | Change each: staff choice (optional/required/hidden) | Hint text changes **with** the chosen value; saves only changed keys | O/M | ☐ |
| BKS-10 | Settings tab | Slot display (only_available / all_greyed) | Preview and public page reflect | O/M | ☐ |
| BKS-11 | Settings tab | Confirmation auto vs approve | Approve → public bookings arrive `pending` | O/M | ☐ |
| BKS-12 | Settings tab | Show prices off | Prices hidden on public page and website | O/M | ☐ |
| BKS-13 | Settings tab | Slot interval options | Slots on grid change | O/M | ☐ |
| BKS-14 | Settings tab | Buffer / min notice / window / cancel cutoff / customer can cancel | Steppers/limits; saved; effect proved in BKP/BKM | O/M | ☐ |
| BKS-15 | Settings tab | Buffer explanation | UI states service buffer replaces branch buffer; service buffer 0 = no setting | O/M | ☐ |
| BKS-16 | Settings tab | Use rooms toggle | Saved | O/M | ☐ |
| BKS-17 | Settings tab | People per slot 1→3 | Always allowed | O/M | ☐ |
| BKS-18 | Settings tab | People per slot 3→1 while a **future** slot holds 2 bookings | Refused, names the offending slot (date/time/service/staff/booked/limit); existing bookings untouched | O/M | ☐ |
| BKS-19 | Settings tab | Same downgrade when only **past** slots exceed | Allowed (past never blocks) | O/M | ☐ |
| BKS-20 | Settings tab | Online booking off | Public page → generic not-available; warning "booking disabled" | O/M | ☐ |
| BKS-21 | Settings tab | Require client email on | Email required on public form (BKP) | O/M | ☐ |
| BKS-22 | Preview | Desktop ≥1024 | Permanent 400px column beside settings | O/M | ☐ |
| BKS-23 | Preview | Mobile/tablet | "Show customer preview" button → full-screen Drawer | O/M | ☐ |
| BKS-24 | Preview | Content | Real service names/prices; **sample times** only (header says so); never claims to apply notice/window/breaks | O/M | ☐ |
| BKS-25 | Form tab | Default fields | Fixed default fields listed locked with reasons (name, phone required; email conditional; notes) | O/M | ☐ |
| BKS-26 | Form tab | Add field of each type: short text, long text, dropdown, yes/no, number | Created; appears in list and preview | O/M | ☐ |
| BKS-27 | Form tab | Dropdown with 1 option / 51 options / blank option | Refused (2–50 non-empty) | O/M | ☐ |
| BKS-28 | Form tab | Required toggle; help text; applies to all services vs chosen services | Saved; public form filters correctly | O/M | ☐ |
| BKS-29 | Form tab | Mark sensitive | Confirm dialog says existing answers are escalated too | O/M | ☐ |
| BKS-30 | Form tab | Turn sensitive off again | Refused (can only escalate) | O/M | ☐ |
| BKS-31 | Form tab | Edit type after a booking answered it | Type frozen: archive + add a new field instead | O/M | ☐ |
| BKS-32 | Form tab | Reorder up/down; archive; restore | Works; order shows in public form | O/M | ☐ |
| BKS-33 | Form version | Save field set unchanged | No new form version (digest dedupe) – no visible effect | O/M | ☐ |
| BKS-34 | Permission | Receptionist/Staff `/settings/booking` | No-access screen | R/S | ☐ |
| BKS-35 | Permission | Manager | Full access (settings.booking) | M | ☐ |
| BKS-36 | Layout | 375 and 1280 | Each screen checked; no overflow | Any | ☐ |
| BKS-37 | Branch scope | Settings are per branch | Changing one branch doesn't change another (single branch now; N/A if only one) | O | ☐ |

### 2.10 BKP — Public booking page `/<slug>/book`
Use a bookable business (QA Salon after seeds). Role: Anon, signed-out private window.
| ID | Where | Steps | Expected | Role | P/F |
|---|---|---|---|---|---|
| BKP-01 | `/<slug>/book` | Open | Page title/meta set; `noindex` (web); skeleton while loading | Anon | ☐ |
| BKP-02 | Unknown slug `/zzz-nope/book` | Open | Generic "not available" empty state | Anon | ☐ |
| BKP-03 | Not bookable (booking off / no hours / locked trial / unpublished state) | Open | **Identical** generic state: reveals nothing | Anon | ☐ |
| BKP-04 | Load failure | Network off then retry | ErrorState with retry | Anon | ☐ |
| BKP-05 | Step 1 service | List | Only online-bookable active services; price shown only if show_prices on | Anon | ☐ |
| BKP-06 | Step 2 staff | staff_choice optional | Staff list limited to who performs the chosen service; "Any" option | Anon | ☐ |
| BKP-07 | Step 2 staff | staff_choice hidden | Staff step skipped entirely; staff names never shown | Anon | ☐ |
| BKP-08 | Step 2 staff | staff_choice required | Must pick a person | Anon | ☐ |
| BKP-09 | Step 2 staff | Staff with is_bookable_online off | Not listed | Anon | ☐ |
| BKP-10 | Step 3 slot | Calendar + SlotGrid | Past dates disabled; beyond window disabled; timezone note shows branch zone | Anon | ☐ |
| BKP-11 | Step 3 slot | Min notice 60 min | Slots within the next hour absent today | Anon | ☐ |
| BKP-12 | Step 3 slot | Booking window 30 days | Day 31+ not offered | Anon | ☐ |
| BKP-13 | Step 3 slot | Break 12–13 / time off / closure | No slots inside; closure day empty | Anon | ☐ |
| BKP-14 | Step 3 slot | Interval 15 vs 30 | Grid spacing changes | Anon | ☐ |
| BKP-15 | Step 3 slot | Service buffer 15 (Colour) | Next slot after a booking starts after duration+buffer | Anon | ☐ |
| BKP-16 | Step 3 slot | slot_display all_greyed | Booked slots shown greyed, unclickable, nothing about who | Anon | ☐ |
| BKP-17 | Step 3 slot | Day with no slots | Calm empty message | Anon | ☐ |
| BKP-18 | Step 3 slot | "Any staff" tie-break | Person with fewest appointments that local day; ties by sort order | Anon | ☐ |
| BKP-19 | Step 4 form | Fixed fields | Name, phone required; notes optional; email optional unless require_client_email | Anon | ☐ |
| BKP-20 | Step 4 form | PhoneInput | Country-code picker + national number; reports E.164; letters rejected | Anon | ☐ |
| BKP-21 | Step 4 form | Invalid phone (`+1`, `123`) | Field error / server `invalid_phone` mapped to message | Anon | ☐ |
| BKP-22 | Step 4 form | Custom fields of each type | Render correctly; required enforced; number rejects text; dropdown only listed options | Anon | ☐ |
| BKP-23 | Step 4 form | Field not applicable to chosen service | Not shown | Anon | ☐ |
| BKP-24 | Step 4 form | Honeypot `company_website` | Not visible, not tabbable, autocomplete off (inspect DOM: off-screen at left −9999, not `display:none`/hidden) | Anon | ☐ |
| BKP-25 | Step 4 form | Submit disabled while submitting; double click | Only one booking created | Anon | ☐ |
| BKP-26 | Submit | Valid booking (client email wapeeglobal@gmail.com) | Confirmation step: status (confirmed or "awaiting confirmation" if approval mode), summary, local time + zone | Anon | ☐ |
| BKP-27 | Confirmation | Manage link | Shown once with copy button + "save this link, shown once"; URL has `#token=` (fragment, not `?`) | Anon | ☐ |
| BKP-28 | Confirmation | Copy failure | Handled gracefully (no unhandled error) | Anon | ☐ |
| BKP-29 | Submit | Repeat booking, same phone, different name/email | Succeeds; existing client **not overwritten** (check in Clients); response indistinguishable from new | Anon | ☐ |
| BKP-30 | Submit | Same slot taken meanwhile (two windows) | Second gets slot_unavailable → returned to slot step, re-fetched, **typed answers kept** | Anon | ☐ |
| BKP-31 | Submit | Submit within ~3 s of loading slots (fast autofill) | `too_fast` → one automatic retry after ~1.2 s, then success; not shown as an error | Anon | ☐ |
| BKP-32 | Submit | Filled honeypot (DevTools) | Generic bad-request style failure; no booking | Anon | ☐ |
| BKP-33 | Submit | 429 (spend per-IP 10/hour or per-phone 5/day) | Calm "too many attempts" message on form step, no retry loop | Anon | ☐ |
| BKP-34 | Group | people_per_slot 2: two customers book same slot | Both accepted; third refused slot_unavailable | Anon | ☐ |
| BKP-35 | Capacity | Capacity-1 staff double-book attempt | Impossible (DB exclusion) | Anon | ☐ |
| BKP-36 | DST | Branch tz with DST (London): browse 27–28 Mar 2027 and 30–31 Oct 2027 | No duplicated/missing slot; 01:00 on fall-back day offered once | Anon | ☐ |
| BKP-37 | Timezone | Customer device tz ≠ branch tz | Times shown in **branch** timezone with zone name | Anon | ☐ |
| BKP-38 | Back | Back button / Escape / hardware back on each step | Steps back (form→slot→staff→service) without leaving page; clears only fields that became invalid | Anon | ☐ |
| BKP-39 | Back | Dirty form + back | Confirm dialog before discarding | Anon | ☐ |
| BKP-40 | Dashboard link | New booking appears in `/calendar` + `/clients` | Source "online"; correct staff; price/duration snapshot | O | ☐ |
| BKP-41 | Embed | `/<slug>/book?embed=…` | See WGT | Anon | ☐ |
| BKP-42 | Layout | 375 / 768 / 1440 | Desktop centred 560px column; no overflow; 320px text wraps | Anon | ☐ |

### 2.11 BKM — Guest manage page `/<slug>/manage#token=…`
| ID | Where | Steps | Expected | Role | P/F |
|---|---|---|---|---|---|
| BKM-01 | Open link from confirmation | Open | Token stripped from address bar (web), page shows business/branch, service, staff, local time + zone, status, **first name only** | Anon | ☐ |
| BKM-02 | Privacy | Inspect page/network | No phone, surname, email, ids | Anon | ☐ |
| BKM-03 | Invalid token / garbage / short (<32 chars) | Open | Same generic "This link is not valid or has expired" | Anon | ☐ |
| BKM-04 | Expired (after appointment end), revoked (cancelled), replayed | Open | Same generic page | Anon | ☐ |
| BKM-05 | Query-string token `?token=` | Open | Not accepted (fragment only) | Anon | ☐ |
| BKM-06 | Pending booking | Open | Status "Awaiting confirmation"; can cancel (withdraw) | Anon | ☐ |
| BKM-07 | Cancel | Press Cancel booking | Confirm dialog ("This cannot be undone…") → success message; status Cancelled; slot free again in `/<slug>/book` | Anon | ☐ |
| BKM-08 | Cancel | Dismiss dialog | Nothing changes | Anon | ☐ |
| BKM-09 | Cancel window | Booking within cancel cutoff (24 h) | No cancel button; explanation "can no longer be changed online (within Nh)" | Anon | ☐ |
| BKM-10 | customer_can_cancel off | Open booking | No cancel/reschedule offered | Anon | ☐ |
| BKM-11 | After cancel | Reload same link | Generic invalid page (token revoked) | Anon | ☐ |
| BKM-12 | Reschedule | Press Reschedule | Calendar + SlotGrid for the **same staff** with real availability | Anon | ☐ |
| BKM-13 | Reschedule | Pick slot → confirm dialog → confirm | "Your booking has been moved"; view shows new time; **same token still works** | Anon | ☐ |
| BKM-14 | Reschedule | Approval mode | "Your new time needs the business to confirm it again" | Anon | ☐ |
| BKM-15 | Reschedule | Slot taken meanwhile | "That time was just taken" → back to slots; **original booking unchanged** | Anon | ☐ |
| BKM-16 | Reschedule | Back / Escape / Android back from reschedule | Returns to view screen (not out of page) | Anon | ☐ |
| BKM-17 | Reschedule | "Any staff" booking, original staff busy | No slots that day (known limit: no staff reselection) | Anon | ☐ |
| BKM-18 | Rate limit | 21+ cancel/reschedule or 61+ get in an hour | 429 calm message, no loop | Anon | ☐ |
| BKM-19 | Network error | Offline load | Error with retry button | Anon | ☐ |
| BKM-20 | Dashboard sync | After guest cancel/reschedule | `/calendar` shows new state/time; appointment detail shows "cancelled by guest" if shown | O | ☐ |
| BKM-21 | Resend link | Owner/Receptionist action `resend_manage_link` (if surfaced in drawer) | New token issued; **old link dies**; new works. If no UI: N/A | O/R | ☐ |
| BKM-22 | Head | Web | `noindex`, `no-referrer` | Anon | ☐ |
| BKM-23 | Native deep link | `wapee://<slug>/manage#token=…` | Same screen on simulator | Anon | ☐ |

### 2.12 API — Public endpoints (curl) — optional technical checks
Base `https://rfuovquhultjydtswtqf.supabase.co/functions/v1/<fn>` with the publishable key (see booking-public-api.md for payloads). Use throwaway data; many consume rate limits.
| ID | Where | Steps | Expected | Role | P/F |
|---|---|---|---|---|---|
| API-01 | get_booking_page | slug of bookable business | 200 catalogue; unknown slug 404 `not_bookable` | Anon | ☐ |
| API-02 | get_slots | slug+service+dates | 200 with timezone, slots, `start_token` (4 parts) | Anon | ☐ |
| API-03 | create_booking | Valid + token after 4 s | 201 + raw manage token once | Anon | ☐ |
| API-04 | create_booking | Immediately after get_slots | 400 `too_fast` | Anon | ☐ |
| API-05 | create_booking | No token / tampered HMAC / backdated / token from other slug | 400 each | Anon | ☐ |
| API-06 | create_booking | honeypot filled | generic 400 `bad_request` | Anon | ☐ |
| API-07 | create_booking | Same slot twice | 409 `slot_unavailable` | Anon | ☐ |
| API-08 | create_booking | Missing required answer | 400 `missing_answer` + field_id | Anon | ☐ |
| API-09 | create_booking | Existing vs new phone | Byte-identical response keys | Anon | ☐ |
| API-10 | create_booking | 11th call within hour (or 6th for one phone/day) | 429 with `Retry-After` | Anon | ☐ |
| API-11 | manage_booking | get with bad tokens | 404 `invalid_token` identical | Anon | ☐ |
| API-12 | manage_booking | cancel then replay | 200 then 404 | Anon | ☐ |
| API-13 | resend_manage_link | anon key only / no auth / with owner JWT | 404 / 400 / 200 new token, old dies | Anon/O | ☐ |
| API-14 | Direct REST on tables/RPCs as anon (`get_booking`, `cancel_booking`, `booking_manage_tokens`, `public_request_attempts`) | Call | 404/401: sealed out | Anon | ☐ |
| API-15 | `npm run smoke:public` | Run once from quiet hour | Passes (~40 checks); exit 3 if budget already spent (expected, not a bug) | dev | ☐ |

### 2.13 CAL — `/calendar` (Day / Week / List, create + detail drawers)
Seed: ≥2 staff with hours, ≥2 services, ≥1 client, one pending (approval mode) and one confirmed appointment.
| ID | Where | Steps | Expected | Role | P/F |
|---|---|---|---|---|---|
| CAL-01 | `/calendar` | Open | Tabs Day / Week / List; state in URL params (web); "New appointment" button | O | ☐ |
| CAL-02 | Day | Desktop/tablet | One column per staff, hour ruler, horizontal scroll if overflow | O/M/R | ☐ |
| CAL-03 | Day | Mobile | One column + staff Select; column fills phone width | O/M/R | ☐ |
| CAL-04 | Day | Staff role | Locked to own column; no switcher | S | ☐ |
| CAL-05 | Day | Shaded hours | Closed hours shaded per **staff** hours/breaks/time off, branch hours as fallback | O | ☐ |
| CAL-06 | Day | Today | Current-time line visible only on today | O | ☐ |
| CAL-07 | Day | Overlapping appointments | Laid out side by side, readable | O | ☐ |
| CAL-08 | Day | Date nav (prev/next/Today) | Works; label shrinks not overflow at 320 px | O | ☐ |
| CAL-09 | Day | Cancelled appointments | Not drawn on the grid | O | ☐ |
| CAL-10 | Week | Strip of 7 days | Locale week start; selecting a day shows its grid; **single** date navigator | O | ☐ |
| CAL-11 | List | Filters status / staff / service / search | Server-side; search ≥2 chars debounced 300 ms | O/M/R | ☐ |
| CAL-12 | List | Pagination | 20 per page via end-reached; pull-to-refresh | O | ☐ |
| CAL-13 | List | Empty / error | Empty state; error with Retry | O | ☐ |
| CAL-14 | Create | "New appointment" | Drawer: client search/new, service, staff, date/time, notes, walk-in toggle | O/M/R | ☐ |
| CAL-15 | Create | Tap an empty slot | Drawer opens pre-filled with that staff/time | O/M/R | ☐ |
| CAL-16 | Create | Client search (name/phone) | Server-side; pick existing | O/M/R | ☐ |
| CAL-17 | Create | New client inline with duplicate phone | Existing client reused / clear message; **never overwrites** existing data | O/M/R | ☐ |
| CAL-18 | Create | Validation | Required fields errors; invalid phone/email messages | O/M/R | ☐ |
| CAL-19 | Create | Out-of-hours time | **Warning only**, booking still allowed | O/M/R | ☐ |
| CAL-20 | Create | Inside minimum notice / beyond window | Allowed for staff (rules apply only to public) | O/M/R | ☐ |
| CAL-21 | Create | Double-book the same staff/time | Refused (slot_unavailable/slot_taken) with message; **no row created** | O/M/R | ☐ |
| CAL-22 | Create | Staff = "any" | Least-loaded rule picks someone | O/M/R | ☐ |
| CAL-23 | Create | Group capacity (people_per_slot 2) overflow | Refused at 3rd | O/M/R | ☐ |
| CAL-24 | Create | Walk-in toggle | Created with source walk_in; no notification sent (NOT-08) | O/M/R | ☐ |
| CAL-25 | Create | auto-confirm | Created as confirmed | O/M/R | ☐ |
| CAL-26 | Create | Dirty close (X, scrim, Android back) | Confirm before discarding | O/M/R | ☐ |
| CAL-27 | Create | Staff role (Own scope) | Staff forced to own profile whatever is chosen; cannot book for someone else | S | ☐ |
| CAL-28 | Create | Receptionist/Manager booking for other staff | Allowed (branch scope) | R/M | ☐ |
| CAL-29 | Detail | Tap an appointment | Drawer: client, service, staff, time, status badge, notes, price, source | O | ☐ |
| CAL-30 | Detail | Pending → actions | Approve and Cancel only | O/M/R | ☐ |
| CAL-31 | Detail | Confirmed → actions | Cancel, Complete, No-show (+ edit/reschedule if offered) | O/M/R | ☐ |
| CAL-32 | Detail | Each action | Confirm dialog first; result toast; calendar/Today/List refresh | O/M/R | ☐ |
| CAL-33 | Detail | Cancelled | **No** actions (terminal forever) | Any | ☐ |
| CAL-34 | Detail | Completed / no-show | Only "Reopen" for O/M | O/M | ☐ |
| CAL-35 | Detail | Reopen as Receptionist | Button absent; server refuses | R | ☐ |
| CAL-36 | Detail | Reopen after an invoice exists | Refused (`invoiced`) — button absent/disabled | O/M | ☐ |
| CAL-37 | Detail | Reopen without invoice | Back to confirmed; audit entry | O/M | ☐ |
| CAL-38 | Detail | Staff role actions | No cancel/approve; may complete/no-show own if permitted; no reopen | S | ☐ |
| CAL-39 | Detail | Forbidden transitions: cancel→anything; completed→cancelled; no_show→completed; pending→completed | Not offered; server returns invalid_transition | Any | ☐ |
| CAL-40 | Detail | Edit notes only | Saves without collision check | O/M/R | ☐ |
| CAL-41 | Detail | Reschedule to a busy time (if UI) | Refused; original unchanged | O/M/R | ☐ |
| CAL-42 | Detail | Completed: invoice button | "Create invoice" / "View invoice" (see INV) | O/M/R | ☐ |
| CAL-43 | Detail | Completed: review link | "Get review link again" if unreviewed (REV) | O/M/R | ☐ |
| CAL-44 | Detail | Message status | Shows sent/failed messages for the appointment (event/channel/status only); Staff (Own) see none | O/M/R | ☐ |
| CAL-45 | Pending badge | Pending count | Tab badge (mobile) / header chip (tablet+desktop) only for `appointments.approve` holders (O/M/R); none for Staff | O/M/R/S | ☐ |
| CAL-46 | Freshness | Two windows: book publicly while calendar open | Calendar updates within ~30 s or on Refresh; Staff window gets only own appointments; browser network tab shows no websocket | O/S | ☐ |
| CAL-47 | Freshness | Sign out then in as other business | Nothing from the previous business (query cache cleared) | Any | ☐ |
| CAL-48 | Drag and drop | Try to drag a block | **Not supported by design** | O | ☐ |
| CAL-49 | Timezone | Branch ≠ device tz | All times in branch tz; "today" boundaries by branch | O | ☐ |
| CAL-50 | DST | Appointment spanning a DST change day (create on 28 Mar 2027 London) | Correct local time, no off-by-one hour | O | ☐ |
| CAL-51 | Layout | 375/768/1440 | No dead gap under tabs; title aligned with body | Any | ☐ |

### 2.14 TOD — Today
| ID | Where | Steps | Expected | Role | P/F |
|---|---|---|---|---|---|
| TOD-01 | `/today` | Open with no appointments | Counts 0, empty state | Any | ☐ |
| TOD-02 | `/today` | With appointments | Counts: total, pending (approvers only), completed; list ordered by time | O/M/R | ☐ |
| TOD-03 | `/today` | "Today" is branch date | Create appointment at 23:30 local branch time: lands on branch's today | O | ☐ |
| TOD-04 | `/today` | Next appointment | Earliest confirmed/pending still ahead highlighted (primary border/tint) | O | ☐ |
| TOD-05 | Row | Quick actions | Approve / Complete / No-show per status & permission; each opens a confirm Dialog | O/M/R | ☐ |
| TOD-06 | Row | Tap summary | Opens same detail drawer as Calendar | O | ☐ |
| TOD-07 | Row | Completed row | Create/View invoice button; review link dialog on completing | O/M/R | ☐ |
| TOD-08 | Row | Layout 375 | Name not squeezed out; no button-in-button | O | ☐ |
| TOD-09 | Freshness | Public booking while Today open | List updates within ~30 s; pull to refresh works on native | O | ☐ |
| TOD-10 | Staff | Staff role | Only own appointments; no approve | S | ☐ |
| TOD-11 | Pending count | Receptionist | Shown (holds approve); Staff not | R/S | ☐ |
| TOD-12 | Both screens | Open Today and Calendar both | Neither screen blanks; only the focused one polls | O | ☐ |
| TOD-13 | Known limits | In-progress appointment | No separate visual state (by design) | O | ☐ |

### 2.15 CLI — Clients
| ID | Where | Steps | Expected | Role | P/F |
|---|---|---|---|---|---|
| CLI-01 | `/clients` | Open | Tab present in bottom bar; list (mobile cards, tablet/desktop DataTable); skeleton/empty/error | O/M/R | ☐ |
| CLI-02 | Search | 1 char / ≥2 chars | Debounced 300 ms server-side (name/phone/email trgm) | O/M/R | ☐ |
| CLI-03 | Archived toggle | "Show archived" | Archived appear with badge; state in URL params | O/M/R | ☐ |
| CLI-04 | Pagination | >20 clients | Keyset load-more, no duplicates | O | ☐ |
| CLI-05 | Create | New client | Drawer: name, phone (PhoneInput E.164), email optional, notes | O/M/R | ☐ |
| CLI-06 | Create | Duplicate phone in same business | Banner "already exists" with link to existing client; no raw DB error | O/M/R | ☐ |
| CLI-07 | Create | Same phone in a different business | Allowed | O | ☐ |
| CLI-08 | Create | Validation (name, phone, email) | Field errors under fields | O/M/R | ☐ |
| CLI-09 | Edit | Change name/notes | Saved; list/profile refresh | O/M/R | ☐ |
| CLI-10 | Profile | Tap row | Real route `/clients/<id>` (back button, shareable URL) | O/M/R | ☐ |
| CLI-11 | Profile | Header + contact + notes | Avatar, name, contact card, notes | O/M/R | ☐ |
| CLI-12 | Profile | Contact for Staff (no `clients.view_contact`) | Locked placeholder; phone/email columns absent in list/table (hidden, not blank) | S | ☐ |
| CLI-13 | Profile | Upcoming | Ascending, soonest first | O | ☐ |
| CLI-14 | Profile | Visit history | Descending, paginated, spans **every branch**; tap a row = no-op by design | O | ☐ |
| CLI-15 | Profile | Invoice section | Labelled placeholder "coming in a later phase" | O | ☐ |
| CLI-16 | Archive | Archive → confirm dialog → unarchive | Disappears from default list; shown with toggle; restored; **no data deleted** | O/M/R | ☐ |
| CLI-17 | Staff scope | Staff sees only clients they have an appointment with | Others absent in list and by direct URL | S | ☐ |
| CLI-18 | Export | `clients.export` | **Not built** (Phase 11) | O | ☐ |
| CLI-19 | Layout | Tablet | Phone/email columns collapse (compact); table fills page width | O | ☐ |
| CLI-20 | Booking link | A public booking creates/updates client | New phone → new client; existing → untouched | O | ☐ |
| CLI-21 | Sensitive answers | Custom field marked sensitive | Not shown in profile (not surfaced yet); RLS hides from Receptionist | R | ☐ |

### 2.16 INV — Invoices (`/invoices`, drawer, print)
Seed: a completed appointment with a client, a second completed one for the discount/credit tests.
| ID | Where | Steps | Expected | Role | P/F |
|---|---|---|---|---|---|
| INV-01 | `/invoices` | Open (O/M/R) | List newest first; mobile cards / desktop table; skeleton/empty/error | O/M/R | ☐ |
| INV-02 | `/invoices` | Staff | Nav hidden; direct URL no-access | S | ☐ |
| INV-03 | Filters | Status (Drafts/Issued), payment state (Unpaid/Part paid/Paid/Credited), date from/to, search | Server-side; search ≥2 chars on number/bill-to/client; `%`/`_` literal | O/M/R | ☐ |
| INV-04 | Filters | Branch select | Only with >1 branch; default current branch; `?branch=all` widens | O | ☐ |
| INV-05 | Filters | Client chip (from detail "Show this client's invoices") | Chip with clear; "Clear filters" resets | O | ☐ |
| INV-06 | Filters | No match | "No invoices match" empty-search state | O | ☐ |
| INV-07 | Create from appointment | Completed appt → "Create invoice" | Draft with service line prefilled (price snapshot); appointment linked | O/M/R | ☐ |
| INV-08 | Create from appointment | Non-completed appt | Not offered / refused `not_completed` | O/M/R | ☐ |
| INV-09 | Create from appointment | Second invoice for the same appointment | Refused `already_invoiced`; button becomes "View invoice" | O/M/R | ☐ |
| INV-10 | Create manual | "New invoice" | Drawer editor; add service line (name+price prefilled) or free text | O/M/R | ☐ |
| INV-11 | Editor | Quantity 0 / 10000 / decimal | Rejected (1–9999 integer) | O/M/R | ☐ |
| INV-12 | Editor | Price negative / > 1e11 minor | Rejected | O/M/R | ☐ |
| INV-13 | Editor | Description blank | Rejected | O/M/R | ☐ |
| INV-14 | Editor | 101 lines | Refused (max 100) | O/M/R | ☐ |
| INV-15 | Editor | Totals preview | Subtotal, discounts, net, tax at branch rate, total; matches server after save (tax exclusive, half-up) | O/M/R | ☐ |
| INV-16 | Editor | Discount as Owner/Manager with reason ≥3 chars | Accepted; shows "Discount: reason" | O/M | ☐ |
| INV-17 | Editor | Discount with 2-char reason / > line gross | Rejected (`discount_reason_required` / `discount_too_large`) | O/M | ☐ |
| INV-18 | Editor | Receptionist tries discount | Field not offered / `discount_forbidden`; draft already carrying a discount: Save disabled with explanation | R | ☐ |
| INV-19 | Editor | Client picker | Search; "No client" (walk-in) allowed | O/M/R | ☐ |
| INV-20 | Editor | Notes + clear | Saved/cleared | O/M/R | ☐ |
| INV-21 | Draft | Edit a draft | Replaces all lines; no number shown ("Draft") | O/M/R | ☐ |
| INV-22 | Draft | Discard → confirm | Soft-deleted; appointment unlinked; can create a new invoice | O/M/R | ☐ |
| INV-23 | Issue | Issue with 0 lines / total 0 | Refused `no_items` / `zero_total` | O/M/R | ☐ |
| INV-24 | Issue | Issue a valid draft | Number `<PREFIX>-000001`; tax rate + tax number snapshotted; becomes immutable | O/M/R | ☐ |
| INV-25 | Issue | Second invoice | `-000002` (gapless; discarded drafts consume no number) | O | ☐ |
| INV-26 | Issue | Change branch tax rate afterwards | Issued invoice unchanged | O | ☐ |
| INV-27 | Issue | Edit/delete issued invoice | No edit/delete action; server refuses for every role | O | ☐ |
| INV-28 | Issue | Reopen the appointment | Refused (invoice linked) from first draft onward | O/M | ☐ |
| INV-29 | Currency | Change branch currency after first non-discarded invoice | Refused (locked); allowed if only discarded drafts | O | ☐ |
| INV-30 | Payment | Add payment cash/card/bank transfer partial | State → "Part paid", balance shown | O/M/R | ☐ |
| INV-31 | Payment | Amount > balance | Refused `overpayment` | O/M/R | ☐ |
| INV-32 | Payment | Amount 0/negative; `paid_at` before issue / > now+5 min | Refused | O/M/R | ☐ |
| INV-33 | Payment | Pay remaining | State "Paid"; balance 0; further payment refused | O/M/R | ☐ |
| INV-34 | Payment | Payment on a draft | Not offered / `not_issued` | O/M/R | ☐ |
| INV-35 | Credit note | Owner/Manager full credit with reason | Number `<PREFIX>-CN-000001`; state "Credited"; reason required | O/M | ☐ |
| INV-36 | Credit note | Partial by net amount; then rest | Last credit takes remaining tax exactly (no rounding drift) | O/M | ☐ |
| INV-37 | Credit note | Over remaining / blank reason | Refused `invalid_amount` / `reason_required`; fully credited → `fully_credited` | O/M | ☐ |
| INV-38 | Credit note | Receptionist | Not offered; server refuses | R | ☐ |
| INV-39 | Credit note | Credited appointment | Stays linked; cannot be re-invoiced | O | ☐ |
| INV-40 | Refund | Credit a paid invoice | "Refund due" shown; **no auto reversal** | O/M | ☐ |
| INV-41 | Reversal | Reverse payment (partial) with reason | New row; amount ≤ what that payment holds; refund due drops | O/M | ☐ |
| INV-42 | Reversal | Reverse a reversal / without reason / over amount | Refused (`not_a_payment`, `reason_required`, `invalid_amount`) | O/M | ☐ |
| INV-43 | Reversal | Receptionist | Not offered | R | ☐ |
| INV-44 | Drawer | Sub-forms (payment, reversal, credit) | Replace drawer content (no stacked overlay); Escape/back steps back first | O | ☐ |
| INV-45 | Drawer | URL params | `?invoice=<id>` / `new` opens; browser back closes | O | ☐ |
| INV-46 | Print/share | Web: open print view | Standalone page `/invoice-print/<id>` (no sidebar/header); Print prints only the invoice; toolbar hidden in print | O/M/R | ☐ |
| INV-47 | Print/share | Draft preview | Works for drafts | O/M/R | ☐ |
| INV-48 | Print/share | iOS | System Share sheet with plain-text summary (no PDF: known) | O/M/R | ☐ |
| INV-49 | Print | Client contact on invoice | Shown only if `clients.view_contact` | O/M/R | ☐ |
| INV-50 | Numbering | Concurrent issuers (2 browsers click issue at once) | Distinct consecutive numbers, no gap | O | ☐ |
| INV-51 | Multi-branch | Prefix per branch | N/A until a second branch exists (Phase 9) | O | ☐ |
| INV-52 | Appointment buttons | Calendar drawer + Today row | Create/View invoice only on COMPLETED; no link shown to roles without `invoices.view` | O/M/R | ☐ |
| INV-53 | Known limits | Per-line credit notes; free (0) invoice; native PDF | **Not built / refused by design** | O | ☐ |
| INV-54 | Cache | After each mutation | List, appointment drawer, Reports refresh without reload | O | ☐ |

### 2.17 REP — `/reports`
| ID | Where | Steps | Expected | Role | P/F |
|---|---|---|---|---|---|
| REP-01 | `/reports` | Open | Today / This month toggle; revenue block per currency; appointment counts; top services | O/M | ☐ |
| REP-02 | Access | Receptionist/Staff | Nav hidden; direct URL no-access | R/S | ☐ |
| REP-03 | Revenue | Issue invoice 100 + tax then a credit note 20 | invoiced incl. tax, credited, tax, net revenue (ex tax minus credit notes), collected (payments − reversals by paid_at), invoice count correct | O/M | ☐ |
| REP-04 | Revenue | Drafts / discarded | Not counted | O | ☐ |
| REP-05 | Counts | Appointment totals by status for today / month | Match Calendar List filters | O/M | ☐ |
| REP-06 | Top services | Completed appointments | Ranked; revenue from issued invoice lines (does **not** net credit notes: known) | O/M | ☐ |
| REP-07 | Branch tz | Appointment/invoice at 23:30 local on last day of month | Falls in correct local day/month window | O | ☐ |
| REP-08 | Currencies | Branches with 2 currencies (Phase 9) | Never summed; N/A with 1 branch | O | ☐ |
| REP-09 | Revenue permission | Role with basic but not revenue | Revenue block hidden (server returns null) — N/A with default roles | — | ☐ |
| REP-10 | States | Empty period / error | Empty state; error + retry; skeleton | O/M | ☐ |
| REP-11 | Charts | Bars are plain Views | Render at 375 and 1440; no chart library | O | ☐ |

### 2.18 WEB — Website editor `/website` and public site `/<slug>`
| ID | Where | Steps | Expected | Role | P/F |
|---|---|---|---|---|---|
| WEB-01 | `/website` | Open as Owner first time | Website ensured (draft); sections list, theme tab, widget tab, live preview | O | ☐ |
| WEB-02 | `/website` | Manager/Receptionist/Staff | No access (website.edit is Owner-only) | M/R/S | ☐ |
| WEB-03 | Sections | 7 fixed types: hero, about, services, gallery, testimonials, FAQs, contact | One each; cannot add/delete | O | ☐ |
| WEB-04 | Sections | Show/hide toggle | Hidden section absent on public site | O | ☐ |
| WEB-05 | Sections | Up/down reorder | Order saved and shown publicly | O | ☐ |
| WEB-06 | Section drawer | Hero/About/Services/Testimonials text forms | Lengths capped; save; preview updates (section text = saved draft) | O | ☐ |
| WEB-07 | Section drawer | FAQ add/remove/edit | Saved; accordion on public page | O | ☐ |
| WEB-08 | Section drawer | Contact form | Address/phone/hours come from branch (live); links `tel:`/maps/WhatsApp work | O | ☐ |
| WEB-09 | Section drawer | Gallery images: choose file | Type check (jpeg/png/webp only, no SVG), > 5 MB rejected; uploaded to `website-assets`; hint says location data in photos is NOT removed | O | ☐ |
| WEB-10 | Section drawer | Replace/remove image | Old file deleted (best effort); 60-file cap not eaten | O | ☐ |
| WEB-11 | Section drawer | Invalid content: URL `http://` / javascript:, unknown keys | Refused with detail (https only) | O | ☐ |
| WEB-12 | Theme | Brand colour preset + hex; invalid hex | Invalid → default; contrast: text on accent always ≥4.5:1 (try pale yellow) | O | ☐ |
| WEB-13 | Theme | Font dm_sans / system_sans / serif; radius none→full | Preview updates before saving | O | ☐ |
| WEB-14 | Theme | Logo / hero image; template key; SEO title/description | Saved; used on public page head | O | ☐ |
| WEB-15 | Preview | Live data | Services/prices/featured reviews/address/hours are live; may differ slightly from public page (online-bookable only) | O | ☐ |
| WEB-16 | Publish | Publish → confirm | Public `/<slug>` becomes live; audited | O | ☐ |
| WEB-17 | Publish | Unpublish → confirm | `/<slug>` shows generic not-found | O | ☐ |
| WEB-18 | Publish | "Booking isn't ready" warning | Shown when branch not bookable | O | ☐ |
| WEB-19 | Public site | `/<slug>` unpublished / unknown / inactive | **Identical** generic not-found | Anon | ☐ |
| WEB-20 | Public site | Published | Sections in order, hidden/empty dropped; services with prices if show_prices; contact; testimonials = featured reviews, first names only | Anon | ☐ |
| WEB-21 | Public site | Book buttons | Only when `booking.bookable`; link to `/<slug>/book` | Anon | ☐ |
| WEB-22 | Public site | Head + JSON-LD | `<title>`, description, LocalBusiness JSON-LD (view source) | Anon | ☐ |
| WEB-23 | Public site | 429 | 61+ loads/min per IP → calm failure | Anon | ☐ |
| WEB-24 | Public site | Touch targets / layout | ≥44 px, no overflow 375/1440 | Anon | ☐ |
| WEB-25 | Public site | iOS deep link `wapee://<slug>` | Renders | Anon | ☐ |
| WEB-26 | Reserved slug | `/unsubscribe` | Is the unsubscribe page, not a business | Anon | ☐ |
| WEB-27 | Booking settings link | Link card says `<site>/<slug>/book` | Consistent everywhere (widget, settings) | O | ☐ |

### 2.19 REV — Reviews (`/reviews`, review link, `/<slug>/review`)
| ID | Where | Steps | Expected | Role | P/F |
|---|---|---|---|---|---|
| REV-01 | Complete an appointment | Mark completed (Today or Calendar) | Dialog shows the **raw review link once** with copy button | O/M/R | ☐ |
| REV-02 | Link dialog | Close and reopen drawer | Link not shown again; "Get review link again" offered (completed + unreviewed) | O/M/R | ☐ |
| REV-03 | Reissue | Press "Get review link again" | New link; **old link dies** | O/M/R | ☐ |
| REV-04 | Reissue | Already reviewed appointment | Not offered / refused | O/M/R | ☐ |
| REV-05 | Reopen + complete again | Reopen then complete | No second request created (one per appointment ever) | O/M | ☐ |
| REV-06 | `/<slug>/review#token=…` | Open | Stars, comment, honeypot; **no staff prompt** | Anon | ☐ |
| REV-07 | Review page | Submit without stars | Validation | Anon | ☐ |
| REV-08 | Review page | Submit rating 1–5 + comment | Thanks page; **same thanks and same Google button for every rating** | Anon | ☐ |
| REV-09 | Review page | Reuse link after submit | Generic invalid page | Anon | ☐ |
| REV-10 | Review page | Unknown / expired (>30 days) / reopened-appointment token | One generic invalid page, identical | Anon | ☐ |
| REV-11 | Review page | Honeypot filled | Generic failure, no review | Anon | ☐ |
| REV-12 | Review page | Rate limit (11th submit/h; 61 loads/h) | Calm message | Anon | ☐ |
| REV-13 | `/reviews` | Open | List with rating / reply / featured (+branch) filters in URL params; keyset 20/page; skeleton/empty/error | O/M/R | ☐ |
| REV-14 | `/reviews` | Staff | Sees only reviews of own appointments | S | ☐ |
| REV-15 | Reply | Open reply drawer, save reply | Shown under the review; audited | O/M | ☐ |
| REV-16 | Feature | Feature on website | Appears in Testimonials (first name only) after publish | O | ☐ |
| REV-17 | Feature | 13th featured | Refused with cap-of-12 message | O | ☐ |
| REV-18 | Feature | Unfeature | Removed from website | O | ☐ |
| REV-19 | Immutable | Edit customer's words | Not possible (immutable) | O | ☐ |
| REV-20 | Known gaps | Remove a review UI, review reminders/expiry job | **Not built** | O | ☐ |
| REV-21 | Notification | review_request email | See NOT-09 | O | ☐ |
| REV-22 | Native | `wapee://<slug>/review#token=` | Same page on simulator | Anon | ☐ |

### 2.20 WGT — Widget (settings tab + `public/widget.js` + embed gate)
| ID | Where | Steps | Expected | Role | P/F |
|---|---|---|---|---|---|
| WGT-01 | `/website` → Widget tab | Open | Key `wk_…`, on/off, allowed sites, snippet + copy, rotate | O | ☐ |
| WGT-02 | Allowed sites | Add `example.com`, `HTTPS://Example.com/path`, 11th site, invalid host | Normalised to lowercase hostname; >10 or invalid refused | O | ☐ |
| WGT-03 | Toggle | Turn widget off | Embeds stop working | O | ☐ |
| WGT-04 | Rotate | Rotate key → confirm | Old snippet stops; new works | O | ☐ |
| WGT-05 | Snippet | Copy | Clipboard has the script tag | O | ☐ |
| WGT-06 | Local page | Make `widget-test.html` with the snippet, serve from allowed host (`localhost` added to allowed list) | Booking form renders in an iframe at `/<slug>/book?embed=…` | Anon | ☐ |
| WGT-07 | Local page | Open from a host **not** allowed (`127.0.0.1`) | Nothing rendered | Anon | ☐ |
| WGT-08 | Direct frame | Frame `/<slug>/book` without token | "This booking form isn't available here" | Anon | ☐ |
| WGT-09 | Direct open | Open `/<slug>/book` normally (not framed) | Works, no embed token needed | Anon | ☐ |
| WGT-10 | Booking in iframe | Complete a booking | Works like BKP | Anon | ☐ |
| WGT-11 | Rate limit | 121+ validate calls/min | Refused | Anon | ☐ |
| WGT-12 | Known | frame-ancestors header | **Launch blocker (host header not set): anyone can still frame the page. Expected until Phase 12** | — | ☐ |

### 2.21 NOT — Notifications (`/settings/notifications`, `sms-credits`, `messages`, `my-notifications`, emails)
Use client email **wapeeglobal@gmail.com** only. Worker latency up to ~1 minute (cron every minute).
| ID | Where | Steps | Expected | Role | P/F |
|---|---|---|---|---|---|
| NOT-01 | `/settings/notifications` | Open as Owner/Manager | Per-branch: reminders on/off, hours before (1–72), review requests, SMS on/off + readiness, quiet hours, live message preview with segment/credit hint | O/M | ☐ |
| NOT-02 | Settings | Hours before 0 / 73 | Rejected | O/M | ☐ |
| NOT-03 | Settings | Quiet hours default | 21:00–08:00 local | O/M | ☐ |
| NOT-04 | Preview | Switch event/channel | Real template rendered; SMS shows segments (GSM-7 160/153 vs UCS-2 70/67) and credits for branch country | O/M | ☐ |
| NOT-05 | Permission | Receptionist/Staff | No access to notifications/messages screens; hub cards hidden; **My notifications** available to all | R/S | ☐ |
| NOT-06 | Confirmation email | Public booking (auto confirm) with email wapeeglobal@gmail.com | "booking confirmed" email arrives in ~1 min with manage link | Anon | ☐ |
| NOT-07 | Pending email | Approval mode booking | "request received" email; staff push event queued | Anon | ☐ |
| NOT-08 | Walk-in | Dashboard walk-in | **No** message sent | O | ☐ |
| NOT-09 | Review request email | Mark completed | Email with review link (raw token not in log) | O | ☐ |
| NOT-10 | Reminder | Branch reminders 24 h; appointment tomorrow | Reminder email ~24 h before (branch wall clock) within the 5-min cron tick | O | ☐ |
| NOT-11 | Reminder skips | Cancelled / completed / no-show / pending / walk-in; booked after reminder time | No reminder | O | ☐ |
| NOT-12 | Reschedule | Reschedule (guest or dashboard) | "rescheduled" email; unsent reminder cancelled and re-created; no manage link in this email (known) | O | ☐ |
| NOT-13 | Cancel | Cancel | "cancelled" email; staff-cancelled push | O | ☐ |
| NOT-14 | Resend link | `resend_manage_link` | `manage_link` email; old link dies | O | ☐ |
| NOT-15 | Channel rule | Client with email + SMS enabled | Email only, never both | O | ☐ |
| NOT-16 | Channel rule | Client without email, SMS off | Nothing sent | O | ☐ |
| NOT-17 | SMS | Needs Twilio secrets | **Not testable** (secrets unset) — only preview/credits UI | O | ☐ |
| NOT-18 | `/settings/messages` | Open | Log: channel/status/branch filters, 20/page keyset, masked recipient, cost, scrubbed error; no token/body | O/M | ☐ |
| NOT-19 | Log | Sent row | Status sent, provider id; failed row for non-owner address shows rejected | O/M | ☐ |
| NOT-20 | Non-allowed address | Book with another email | Row `dead`/rejected (Resend 403) — expected, not a bug | O | ☐ |
| NOT-21 | `/settings/sms-credits` | Open (holder of `sms.send`) | Balance + ledger keyset 20/page; "add credits" is only text (super admin Phase 8) | O | ☐ |
| NOT-22 | Credits | No rate row (e.g. Pakistan) | SMS refused `no_rate` (visible in log if SMS on) | O | ☐ |
| NOT-23 | `/settings/my-notifications` | Open on web | State "unsupported on web" | Any | ☐ |
| NOT-24 | `/settings/my-notifications` | iOS simulator | State not_configured/blocked (no EAS projectId); no permission prompt on load; button only | Any | ☐ |
| NOT-25 | Push preferences | Per-event switches | Saved; enqueue honours them (verify via messages) | Any | ☐ |
| NOT-26 | Sign out | Sign out on a device with push | Token unregistered (best effort) | Any | ☐ |
| NOT-27 | Appointment detail | Messages block | Event/channel/status/code only; Staff Own: none | O/M/R/S | ☐ |
| NOT-28 | Caps | >5 messages to one recipient in 24 h | Skipped `recipient_cap`, visible in log | O | ☐ |
| NOT-29 | Quiet hours | SMS reminder inside quiet window | Deferred (needs SMS: N/A without Twilio) | O | ☐ |
| NOT-30 | Retry | Failure → retry 1,4,16,64 min then dead | SQL/unit covered; not exercised over HTTP | dev | ☐ |
| NOT-31 | Layout | 375 / 1440 | Lists in non-scrolling Screen with padding; no overflow | O | ☐ |

### 2.22 UNS — `/unsubscribe`
| ID | Where | Steps | Expected | Role | P/F |
|---|---|---|---|---|---|
| UNS-01 | Email | Open the unsubscribe link in a reminder email | App page `/unsubscribe#t=…` renders a confirm **button**; no request until pressed (link scanners harmless) | Anon | ☐ |
| UNS-02 | Press confirm | Click | Same neutral confirmation; later reminders to that address suppressed (`suppressed` in log) | Anon | ☐ |
| UNS-03 | Tampered / expired / garbage token | Open + confirm | Identical neutral result; nothing changes | Anon | ☐ |
| UNS-04 | Scope | After unsubscribing | Booking confirmations still sent (only reminders/review requests suppressible) | Anon | ☐ |
| UNS-05 | Host | Email link host | Placeholder domain (`wapee.site`) does **not resolve yet**: test by editing host to localhost | Anon | ☐ |
| UNS-06 | List-Unsubscribe header | View email source | `List-Unsubscribe` + `List-Unsubscribe-Post` present | Anon | ☐ |

---

## 3. Cross-role matrix
Mark each cell `V` visible/allowed, `H` hidden, `B` blocked (UI shows no-access / server refuses). Per doc §9. Tick after testing as that role.
| ID | Feature | Owner | Manager | Receptionist | Staff (Own) | Other business user | Anon |
|---|---|---|---|---|---|---|---|
| X-01 | Today | V | V | V | V (own) | H | B |
| X-02 | Calendar all staff columns | V | V | V | H (own only) | B | B |
| X-03 | Create appointment for others | V | V | V | B (forced own) | B | B |
| X-04 | Approve appointment / pending badge | V | V | V | H/B | B | B |
| X-05 | Cancel appointment | V | V | V | B | B | B (guest via token only) |
| X-06 | Complete / no-show | V | V | V | own (if permitted) | B | B |
| X-07 | Reopen completed/no-show | V | V | B | B | B | B |
| X-08 | Clients list | V (all) | V (branch) | V (branch) | V (only own appts) | B | B |
| X-09 | Client phone/email | V | V | V | H | B | B |
| X-10 | Sensitive answers | V | V | B | own clients | B | B |
| X-11 | Archive/edit client | V | V | V | B | B | B |
| X-12 | Services (add/edit/delete) | V | V | H (view) | H | B | B |
| X-13 | Staff add/edit | V | V | H (view) | B | B | B |
| X-14 | Staff schedule | all | branch | view | own only | B | B |
| X-15 | Branch hours / holidays | V | read-only | H | H | B | B |
| X-16 | Booking settings + form | V | V | H | H | B | B |
| X-17 | Notifications + message log settings | V | V | H | H | B | B |
| X-18 | SMS credits | V | per `sms.send` | per `sms.send` | H | B | B |
| X-19 | My notifications (push) | V | V | V | V | B | B |
| X-20 | Members list | V | V | V (staff.view) | V | B | B |
| X-21 | Invite members | V (any role) | V (not Owner) | H | H | B | B |
| X-22 | Invoices view/create/payment | V | V | V | H | B | B |
| X-23 | Line discounts | V | V | B | B | B | B |
| X-24 | Credit note / reverse payment | V | V | B | B | B | B |
| X-25 | Reports | V | V | H | H | B | B |
| X-26 | Website editor + publish | V | H | H | H | B | B |
| X-27 | Widget settings | V | H | H | H | B | B |
| X-28 | Reviews list / reply / feature | V | V (view/reply) | view | own only | B | B |
| X-29 | Trial banner (last 3 days) | V | H | H | H | — | — |
| X-30 | Billing/settings when trial locked | V (settings, more) | per `settings.business/billing` | H | H | — | — |
| X-31 | Public booking / website / manage / review | — | — | — | — | — | V |
| X-32 | Data isolation | Create data in business A; sign in to business B (other account) | Nothing from A visible in lists, search, URLs by id, invoice-print id | all | all | B | B |
| X-33 | Super admin / `/admin` | B | B | B | B | B | B |

---

## 4. End-to-end flows
Use the throwaway business (1.3) with seeds (1.4), roles O/M/R/S and one private window as customer. Client email: **wapeeglobal@gmail.com**.

### 4.A Customer books → owner handles → invoice → review → report
| ID | Steps | Expected | Role | P/F |
|---|---|---|---|---|
| E2E-A-01 | Set confirmation = **approve** (BKS-11) | Saved | O | ☐ |
| E2E-A-02 | Publish website (WEB-16); open `/<slug>`, press Book | Lands on `/<slug>/book` | Anon | ☐ |
| E2E-A-03 | Book "Cut", Staff 1, tomorrow 10:00; email wapeeglobal@gmail.com; copy manage link | Confirmation "awaiting confirmation"; link has `#token=` | Anon | ☐ |
| E2E-A-04 | Within ~1 min check inbox | "Request received" email | Anon | ☐ |
| E2E-A-05 | Owner dashboard `/calendar` + `/today` (tomorrow) | Pending block, pending badge on Calendar tab/header, source online | O | ☐ |
| E2E-A-06 | Open `/clients` | New client with the booking details | O | ☐ |
| E2E-A-07 | Approve in detail drawer (confirm dialog) | Status confirmed; confirmation email | O | ☐ |
| E2E-A-08 | Public page: that slot now unavailable for Staff 1 | Slot gone / greyed | Anon | ☐ |
| E2E-A-09 | To test "today": create a second appointment for today (dashboard), approve, then "Mark completed" | Review link dialog (REV-01) | O | ☐ |
| E2E-A-10 | Detail → Create invoice | Draft with Cut 30.00 + tax | O | ☐ |
| E2E-A-11 | Issue → number `<PREFIX>-000001` | Immutable | O | ☐ |
| E2E-A-12 | Add payment cash full | State Paid | O/R | ☐ |
| E2E-A-13 | Print (web) | Only the invoice prints | O | ☐ |
| E2E-A-14 | Open review link in private window; 5 stars + comment | Thanks + Google button | Anon | ☐ |
| E2E-A-15 | `/reviews` → reply → feature; publish site | Review appears in Testimonials (first name) | O | ☐ |
| E2E-A-16 | `/reports` Today | Revenue = invoiced incl. tax; collected = payment; completed count 1; top service Cut | O | ☐ |
| E2E-A-17 | Issue credit note full; reverse payment | Credited; refund due 0 after reversal; report net revenue drops, collected drops | O | ☐ |
| E2E-A-18 | Receptionist repeats A-09..A-12 | Works; discount/credit/reverse unavailable (INV-18/38/43) | R | ☐ |
| E2E-A-19 | Staff sees only own appointments/clients/reviews; no invoices/reports | As matrix | S | ☐ |

### 4.B Manage link: reschedule and cancel
| ID | Steps | Expected | Role | P/F |
|---|---|---|---|---|
| E2E-B-01 | Book a slot ≥ 2 days ahead (auto-confirm); open manage link | View (BKM-01) | Anon | ☐ |
| E2E-B-02 | Reschedule to another time, confirm | Moved; same link works; dashboard + email "rescheduled" | Anon/O | ☐ |
| E2E-B-03 | Old slot free again publicly | Yes | Anon | ☐ |
| E2E-B-04 | Reschedule into a taken slot (second window books it first) | Refused, original intact | Anon | ☐ |
| E2E-B-05 | Cancel via link | Cancelled; link now invalid; "cancelled" email; staff push event; dashboard shows cancelled | Anon/O | ☐ |
| E2E-B-06 | Set cancel cutoff 24 h; book for tomorrow 1 hour before the cutoff | No cancel/reschedule offered | Anon | ☐ |
| E2E-B-07 | Owner resends manage link (if UI) | Old link dies | O | ☐ |

### 4.C Review link and featuring on website
| ID | Steps | Expected | Role | P/F |
|---|---|---|---|---|
| E2E-C-01 | Complete appointment → link dialog → copy | Link copied | O | ☐ |
| E2E-C-02 | Submit 2-star review | Same thanks and Google button as 5-star | Anon | ☐ |
| E2E-C-03 | Link reuse | Generic invalid | Anon | ☐ |
| E2E-C-04 | Feature it | Visible in Testimonials after publish | O | ☐ |
| E2E-C-05 | Feature 13 | Cap message at 13th | O | ☐ |
| E2E-C-06 | Reopen + complete again | No new review request | O | ☐ |

### 4.D Widget embed on a local HTML page
| ID | Steps | Expected | Role | P/F |
|---|---|---|---|---|
| E2E-D-01 | Widget tab: add `localhost`, copy snippet | Saved | O | ☐ |
| E2E-D-02 | Save `widget-test.html` with the snippet; serve `python3 -m http.server 8123`; open `http://localhost:8123/widget-test.html` | Booking form in iframe (`/<slug>/book?embed=…`) | Anon | ☐ |
| E2E-D-03 | Book through it | Booking appears in dashboard | Anon/O | ☐ |
| E2E-D-04 | Open as `http://127.0.0.1:8123/widget-test.html` | Nothing renders | Anon | ☐ |
| E2E-D-05 | Rotate key; reload old page | Stops working | O | ☐ |

### 4.E Notification emails and message log
| ID | Steps | Expected | Role | P/F |
|---|---|---|---|---|
| E2E-E-01 | Enable reminders 24 h, review requests on | Saved | O | ☐ |
| E2E-E-02 | Book (email wapeeglobal@gmail.com), confirm in inbox | Confirmation + manage link | Anon | ☐ |
| E2E-E-03 | Within the next 24 h window: reminder arrives (or move appointment to ~25 h ahead and wait) | Reminder email with unsubscribe link | Anon | ☐ |
| E2E-E-04 | Complete → review request email | Link works | O | ☐ |
| E2E-E-05 | `/settings/messages` | One row per email, status sent, masked recipient, no token | O | ☐ |
| E2E-E-06 | Press unsubscribe in reminder (UNS-01..02), reschedule to trigger another reminder | Reminder suppressed; confirmation still sent | O | ☐ |
| E2E-E-07 | Book with a non-allowed email | Row dead/rejected (expected) | O | ☐ |
| E2E-E-08 | Appointment drawer messages block | Same events | O | ☐ |

### 4.F Trial-expired lock
| ID | Steps | Expected | Role | P/F |
|---|---|---|---|---|
| E2E-F-01 | Ask owner to set `trial_ends_at = now() - 1 day` for the QA business | — | dev | ☐ |
| E2E-F-02 | Reload as Owner | Lock screen on Today/Calendar/Clients/Invoices etc. | O | ☐ |
| E2E-F-03 | Open `/settings` and More | Reachable | O | ☐ |
| E2E-F-04 | Receptionist/Staff | Locked too | R/S | ☐ |
| E2E-F-05 | Public `/<slug>/book`, `/<slug>`, manage link, review link of the locked business | Generic not-available / invalid | Anon | ☐ |
| E2E-F-06 | No emails/reminders go out for locked business | Log shows nothing new | O | ☐ |
| E2E-F-07 | Restore trial | Everything back, data intact | O | ☐ |

---

## 5. Platform checks
Run each screen group at: **iOS simulator**, **web 375**, **web 768**, **web 1440**. A screen passes layout when: title visible and aligned with body, no empty vertical gap, no horizontal overflow, bottom content not hidden behind tab bar/home indicator, touch targets ≥ 44 px.
| ID | Where | Steps | Expected | Role | P/F |
|---|---|---|---|---|---|
| PLT-01 | Shell | Resize web 375 → 768 → 1024+ | Bottom tabs → sidebar → sidebar+header; no layout flash | O | ☐ |
| PLT-02 | iOS simulator | Launch dev client, sign in, walk Today → Calendar → Clients → More | Works; safe areas correct (notch/home indicator); status bar readable | O | ☐ |
| PLT-03 | iOS simulator | Rotate / iPad device | Sidebar layout on iPad | O | ☐ |
| PLT-04 | iOS simulator | Background then foreground mid-form | No crash, session kept | O | ☐ |
| PLT-05 | Screens (375/768/1440/iOS) | Auth, Onboarding, Today, Calendar (Day/Week/List), Clients (+profile), Services, Staff, Schedule (4 tabs), Members, Invoices (+drawer), Reports, Reviews, Website editor (4 tabs), Settings hub, Booking settings, Notifications, SMS credits, Messages, My notifications | Layout sanity rule above on each; list one result per screen in your notes | O | ☐ |
| PLT-06 | Screens | Public: `/<slug>`, `/<slug>/book` (5 steps), `/manage`, `/review`, `/unsubscribe`, invite accept | Same rule, desktop centred 560/480 px column | Anon | ☐ |
| PLT-07 | Keyboard | Focus lowest input in: invite drawer, service form, staff form, custom field editor, invoice editor, payment form, review comment, booking form | Input and sticky footer not covered by keyboard (iOS) | O | ☐ |
| PLT-08 | Drawer | Long drawer content | Body scrolls; footer pinned above keyboard; no nested scroll bug | O | ☐ |
| PLT-09 | Select/PhoneInput sheets | Open with keyboard up | Keyboard dismissed before the sheet opens | O | ☐ |
| PLT-10 | Large text / 320 px width | Public booking confirmation, step title, Today row | Text wraps/shrinks, no overflow | Anon | ☐ |
| PLT-11 | RTL spot check | Switch device/browser to Arabic if locale available (or flip `dir=rtl` in DevTools) | Layout mirrors (start/end), icons/back arrows sensible, calendar RTL-ready; strings stay English (only English shipped) | Any | ☐ |
| PLT-12 | Safe area | Mobile trial banner + tab bar | No doubled top gap, no 48 px dead space at bottom | O | ☐ |
| PLT-13 | Gallery | `/_gallery` (dev) | All primitives render | dev | ☐ |
| PLT-14 | PWA | Web: install prompt/hint, update toast after redeploy | Present per `pwa.md` (if enabled in dev: otherwise N/A) | Any | ☐ |
| PLT-15 | Print | Web print preview of invoice | Only invoice, no chrome | O | ☐ |
| PLT-16 | Back | Browser back/forward on drawers (`?invoice=`, clients profile, calendar tabs) | Predictable; closes drawer first | O | ☐ |
| PLT-17 | Hardware back (Android) | **Not testable here.** Written review only: reschedule sub-view, booking steps use `useOverlayDismiss` | Note as "reviewed in code, not run" | — | ☐ |
| PLT-18 | Loading/empty/error | Every list: toggle network off | Skeleton → data; empty state; error + retry | O | ☐ |
| PLT-19 | Console | Browser console while walking everything | No red errors/warnings such as nested-button, VirtualizedList in ScrollView | dev | ☐ |
| PLT-20 | i18n | Look for raw keys (`clients.xyz`) or hard-coded English fragments / product name outside brand config | None | Any | ☐ |
| PLT-21 | Time | Device clock/timezone set to UTC+14 and UTC−11 | "Today", slot dates and closure dates still correct per branch/UTC rules | O | ☐ |
| PLT-22 | Money | PKR/JPY (no minor unit), KWD (3 decimals) branch | Amounts and inputs correct; no ×100 error | O | ☐ |

---

## 6. Not testable yet / known limits (from the context files)
- **Android never run** (no emulator): everything reviewed in code only; hardware back, `content://` image URIs, Android 13+ push prompt unverified.
- **Real push notifications**: needs a real device + EAS `projectId` in `app.config.ts`; no token ever issued. Web push not built.
- **SMS**: Twilio secrets not set; only preview/credits UI. No `no_rate` countries (e.g. Pakistan) can send. Credit purchase / `admin_add_sms_credits` is super-admin (Phase 8).
- **Real inbox delivery** only to `wapeeglobal@gmail.com` (Resend test sender); other addresses → 403, row dead. Domain not verified. Email host `wapee.site` is a placeholder: links do not resolve; swap host to test.
- **Supabase auth email** only reaches team members and is rate-limited (429).
- **Native PDF** for invoices (text Share only); per-line credit notes; free (total 0) invoices cannot be issued; top-service revenue ignores credit notes.
- **`/billing`, plans, add-ons, checkout** — Phase 8 (banner points to `/settings`). Add-on gating is a stub (counts as ON). Widget plan gate seam always true.
- **Custom domain/SSL, online payments, waitlist, dark mode, drag-and-drop calendar, recurring/multi-service bookings, marketing email** — out of scope by design.
- **Widget `frame-ancestors` host header** — launch blocker (Phase 12): any site can frame the booking page; embed gate is UI-only.
- **Members**: no change role, remove member, revoke/resend invite UI. No "give this staff profile app access" link. No category management screen. Rooms have no capacity editor/service linking. No business/branch switcher UI; second branch UI is Phase 9. No custom roles UI (Phase 9).
- **Time off** whole days only; no approval; overnight shifts unsupported; breaks outside hours accepted silently.
- **Clients**: `clients.export` (Phase 11); view_contact gate is client-side column omission (not server-enforced); history rows are not tappable; sensitive answers not shown in profile; invoice list on profile is a placeholder.
- **Reviews**: no UI to remove a review (`removed` is super-admin only); no reminder/expiry job; review link tied to completion.
- **Notifications**: latency up to ~1 min; no log retention job; no Twilio/Resend webhooks; English only; rescheduled/cancelled emails carry no manage link; crashed SMS send is never re-sent; email spam vector bounded only by caps; retry path not exercised over HTTP.
- **Group capacity / resource capacity > 1** are counted checks under a lock, not a DB constraint; true parallel proof needs CI.
- **Bot protection** stops naive automation only; Turnstile is off.
- **Leaked-password protection** cannot be enabled on the FREE plan (pre-launch item).
- **Simulator tap automation does not work**: tap by hand; the Calendar create/detail drawers, client profile/forms, manage confirm dialogs, quick-action dialogs and "Get review link again" have **never been clicked through** — treat sections CAL, CLI, BKM, TOD, REV as first-time manual coverage.
- **Reschedule by guest keeps the same staff** (no "any staff" fallback).
- **Not built for notifications UI to appear**: SMS credits purchase screen; push on web.

---

## 7. Bug report template
Copy per bug into your tracker / notes.

```
Bug ID:        BUG-<yyyymmdd>-<nn>
Test ID:       <e.g. CAL-21>   (step that failed)
Title:         <one line>
Steps:         1. …  2. …  3. …
Expected:      <from the guide>
Actual:        <what happened, exact message>
Platform:      iOS simulator <device/OS> | Web <Chrome/Safari version> | Android (code review only)
Width:         375 | 768 | 1440 | n/a
Role / user:   Owner | Manager | Receptionist | Staff | Anon  (email)
Business/slug: <slug>   Branch tz: <IANA>
Data:          <ids / times used; appointment id, invoice number>
Screenshot:    <file or link; include the URL bar on web>
Console/log:   <errors, Supabase function logs if relevant>
Severity:      S1 blocker (data loss, security, cannot book/pay) | S2 major (feature broken, wrong money/time) | S3 minor (layout, copy) | S4 cosmetic
Regression?:   yes/no (worked in an earlier run)
```
Severity hints: wrong time/timezone, double-booking, wrong totals/numbering gaps, data visible to the wrong role/business, or a token leak are always S1.

---

## 8. Check counts per section
| Prefix | Checks |
|---|---|
| AUTH | 24 |
| ONB | 21 |
| ROLE | 16 |
| MEM | 20 |
| BIL | 16 |
| SVC | 22 |
| STF | 15 |
| SCH | 26 |
| BKS | 37 |
| BKP | 42 |
| BKM | 23 |
| API | 15 |
| CAL | 51 |
| TOD | 13 |
| CLI | 21 |
| INV | 54 |
| REP | 11 |
| WEB | 27 |
| REV | 22 |
| WGT | 12 |
| NOT | 31 |
| UNS | 6 |
| X | 33 |
| E2E-A | 19 |
| E2E-B | 7 |
| E2E-C | 6 |
| E2E-D | 5 |
| E2E-E | 8 |
| E2E-F | 7 |
| PLT | 22 |
| **Total** | **632** |
