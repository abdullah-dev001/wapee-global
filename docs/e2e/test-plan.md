# Wapee — end-to-end test plan (by business flow)

Written 2026-11-03 on `dev` (`cba67b2`). **DEV project only** (`rfuovquhultjydtswtqf`). Status of every case: **Not run**.
Results go in `results.md`, bugs in `bugs.md`. Inventory: `feature-inventory.md`. Fixtures and tools: `test-setup.md`.

**Size: 23 flows, 334 cases — P0 151 · P1 133 · P2 50; 77 negative cases; 9 "known gap" cases.** Round order is at the end.

## Conventions
- **Fixtures**: `FX-SOLO`, `FX-TEAM`, `FX-BIZ` (branches LDN / NYC / TYO), `FX-OTHER`, `FX-NOVA`, `FX-LAPSED`, `FX-QA-ADD`; users `U-*`; customers `C-MAIL`, `C-NOMAIL`, `C-FAKE`, `C-RTL` (see `test-setup.md`).
- **Roles**: Own = Owner, Mgr = Manager, Rec = Receptionist, Stf = Staff, Cust = custom role, SA = super admin, Guest = no account, Anon = raw HTTP with only the anon key.
- **Verify** codes: `UI` = browser at 375 and 1440 with screenshots · `SQL` = read-only SELECT on DEV · `REST` = PostgREST / RPC call as that user's JWT · `HTTP` = public Edge Function call · `OUT` = `message_outbox` / `messages` row · `AUD` = `audit_logs` row · `UT` = vitest · `SUITE nn` = existing pgTAP / script in `supabase/tests/` · `INBOX` = real email (only `wapeeglobal@gmail.com` gets Resend mail on DEV).
- **Priority**: P0 = launch blocker, P1 = must fix soon after / before wide launch, P2 = nice to have.
- **Negative cases** are marked **(neg)** in the title. "State unchanged" means: re-read the row(s) and compare every column to the before-snapshot (CLAUDE.md §5), not just the error code.
- "Known gap" = expected to fail today because the code lacks it (listed in `feature-inventory.md` §9); run it anyway so the result is recorded.

---

## F01 New owner: landing → signup → verify → onboarding → setup checklist → trial
| ID | Title | Role | Plan / add-ons | Preconditions | Steps | Expected | Verify | P | Status |
|---|---|---|---|---|---|---|---|---|---|
| F01-01 | Landing page loads signed out | Guest | — | Fresh browser | Open `/`; scroll all sections; toggle monthly/yearly | Hero, features, plans and add-ons with prices from `get_public_pricing()`, FAQ, legal links; no SMS / widget / online-payment claims; no horizontal scroll | UI, SQL (prices = `plans`/`addons`) | P1 | Not run |
| F01-02 | Plan choice carried to signup | Guest | — | — | Click Team (yearly) on `/` | Goes to `/signup?plan=team&interval=year`; intent saved (localStorage) | UI | P2 | Not run |
| F01-03 | Sign up with a new email | Guest | — | Fresh inbox address | Fill email + 8-char password; submit | Lands on `/verify`; confirmation email arrives; no session yet | UI, INBOX | P0 | Not run |
| F01-04 | Password length rules (neg) | Guest | — | — | Try 7 chars, then 73 chars | Both refused with a field error; no user created | UI, SQL `auth.users` | P1 | Not run |
| F01-05 | Duplicate email gives no hint (neg) | Guest | — | Email already registered | Sign up again with it | Same neutral answer as a new signup; no "already exists" text | UI | P1 | Not run |
| F01-06 | Sign in before confirming (neg) | Guest | — | F01-03 done, not confirmed | Sign in | Kept on `/verify`; no app access | UI | P0 | Not run |
| F01-07 | Confirm link opened cold | Guest | — | F01-03 email | Open the confirm link in an EMPTY browser | Signed in, lands on `/onboarding`; plan intent (team/year) still known | UI | P0 | Not run |
| F01-08 | Onboarding slug rules (neg) | Own | — | On step 1 | Type name; try slugs `today`, `admin`, `e2e-other` (taken), `Bad Slug!`, 1 char | Suggested slug follows the name until edited; reserved / taken / invalid all refused live and by the DB | UI, REST `is_slug_available` | P0 | Not run |
| F01-09 | Onboarding location step | Own | — | Step 2 | Pick UK (prefills GBP + Europe/London); then Pakistan (no prefill, pick PKR + Asia/Karachi) | Prefill only where known; any country/currency/tz allowed; currency warning shown | UI | P1 | Not run |
| F01-10 | Business created with trial | Own | trial | F01-09 | Submit | Lands on `/today`. DB: `business_subscriptions` status `trialing`, plan null, `trial_ends_at` ≈ now+14 d; primary branch with prefix; `booking_settings` row; Owner assignment; `profiles.default_business_id` set | UI, SQL | P0 | Not run |
| F01-11 | Second business by same user (neg) | Own | trial | F01-10 | Open `/onboarding` and submit again (or call `create_business_with_owner`) | Refused; no 2nd business row | UI, REST, SQL | P1 | Not run |
| F01-12 | Setup checklist drives first booking | Own | trial | Fresh business | Follow every checklist button: hours, service, add me as staff, link service, staff hours | Each step ticks; at the end the booking link is shown and copyable; matches `branch_is_bookable` = no reasons | UI, SQL | P0 | Not run |
| F01-13 | "Add me as staff" | Own | trial | Owner has no staff profile | Press "Add me as staff" | Staff profile linked to the owner's member row, assigned to branch | UI, SQL `staff_profiles.member_id` | P1 | Not run |
| F01-14 | Checklist dismiss and re-warn | Own | trial | Checklist complete | Dismiss; then switch online booking off | Checklist gone for this business; small banner appears when booking breaks | UI | P2 | Not run |
| F01-15 | Trial = Business level | Own | trial | F01-10 | Open menus | Commission, Locations, Roles, Advanced reports, all add-on screens visible and usable | UI, REST `my_features` | P1 | Not run |
| F01-16 | Trial warning banner (last 3 days) | Own, Mgr | trial | FX-QA-ADD (ends 2026-11-05) or any trial ≤3 days | Sign in as Owner, then a Manager | Owner sees banner (error tint on last day) → `/settings`; Manager sees none | UI | P1 | Not run |
| F01-17 | Forgot password, unknown email (neg) | Guest | — | — | Request reset for an unknown address | Same success message as a known one | UI | P1 | Not run |
| F01-18 | Reset password end to end | Own | — | Known user | Request reset; open link; set new password | Recovery session reaches `/reset-password` (not bounced to `/`); new password works, old fails | UI, INBOX | P0 | Not run |
| F01-19 | Signed-in user on auth pages | Own | — | Signed in | Open `/login`, `/signup` | Redirected into the app | UI | P2 | Not run |
| F01-20 | Sign out clears all data | Own → Own of FX-OTHER | — | Two accounts | Sign in A, open Clients; sign out; sign in B | No A data flashes or remains (query cache cleared) | UI | P0 | Not run |
| F01-21 | Google sign-in (dev build with flag) | Guest | — | `EXPO_PUBLIC_GOOGLE_SIGNIN=1` | Continue with Google (new account) | Lands on onboarding; profile name from Google | UI | P2 | Not run |

## F02 Business setup: branch, hours, holidays, rooms, services, categories, staff, schedule, booking settings, booking form
| ID | Title | Role | Plan / add-ons | Preconditions | Steps | Expected | Verify | P | Status |
|---|---|---|---|---|---|---|---|---|---|
| F02-01 | Branch opening hours | Own | FX-TEAM Team | No hours | Schedule → Opening hours: Mon-Sat 09-18; save | Saved in branch tz; booking warning `no_branch_hours` gone | UI, SQL `branch_hours` | P0 | Not run |
| F02-02 | Reduce hours with future bookings | Own | FX-TEAM | 2 future appts at 17:00 | Change Fri close to 16:00 | Warning with count (2); proceed allowed; appointments untouched | UI, SQL | P1 | Not run |
| F02-03 | Holiday / closure | Own | FX-TEAM | Future appt on date D | Add holiday on D | Warning with count; public page shows no slots on D | UI, HTTP `get_slots` | P1 | Not run |
| F02-04 | Rooms list and archive | Own | FX-BIZ Business | Room 1 with a future appt, Room 2 free | Archive Room 1, then Room 2 | Room 1 refused with reason; Room 2 archived | UI, SQL | P1 | Not run |
| F02-05 | Link a service to a room (known gap) | Own | FX-BIZ | `use_resources` on | Look for a way to say "Colour needs Room 1" and set capacity | Expected by doc §6.2; today no UI exists (SQL only) | UI | P1 | Not run |
| F02-06 | Categories | Own | FX-TEAM | — | Create, rename, delete a category used by 2 services | Works; the 2 services show "no category" (not a dead id) | UI, SQL `services.category_id` | P2 | Not run |
| F02-07 | Create service | Own | FX-TEAM | — | Haircut 30 min, price 25.00 at branch, staff Sam, online bookable | Saved; price stored `2500` minor + branch currency | UI, SQL | P0 | Not run |
| F02-08 | Service validation (neg) | Own | FX-TEAM | Haircut exists | Duplicate name; negative price; duration 0; letters in price | Each refused with a field error, no row written, no raw DB text | UI, SQL | P1 | Not run |
| F02-09 | Not online-bookable service | Own | FX-TEAM | Consult not bookable | Open `/e2e-team/book` and `/e2e-team` | Consult absent from both; still usable in the dashboard | UI, HTTP | P1 | Not run |
| F02-10 | Archive / restore service | Own | FX-TEAM | Service with past appts | Archive; open old appt; restore | Old appt keeps its name/price snapshot; restored service bookable again | UI, SQL | P2 | Not run |
| F02-11 | Create staff | Own | FX-TEAM | — | Add Sam: branch, services, online bookable | Saved; list shows "no working hours" badge until hours set | UI | P0 | Not run |
| F02-12 | Staff hours and break | Own | FX-TEAM | Sam exists | Mon-Sat 09-18, break 13:00-13:30 | Saved; public slots skip 13:00-13:30 | UI, HTTP `get_slots` | P0 | Not run |
| F02-13 | Time off stored at branch-local midnight | Own | FX-BIZ | Staff at NYC and LDN | Add a whole day off on date D for each | Range = D 00:00 → D+1 00:00 in each branch tz (UTC differs by branch) | UI, SQL `staff_time_off` | P1 | Not run |
| F02-14 | Reduce staff hours / add time off with bookings | Own | FX-TEAM | Sam has a future appt | Add time off covering it | Confirm dialog with count; proceed; appt kept | UI | P1 | Not run |
| F02-15 | Archive staff with future bookings (neg) | Own | FX-TEAM | Sam has a future appt | Archive Sam | Refused with count; Sam unchanged | UI, SQL | P1 | Not run |
| F02-16 | Booking settings save per branch | Own, Mgr | FX-BIZ | — | Change each §6.2 value at LDN; check NYC | Only LDN changed; Manager@LDN can save; values persisted | UI, SQL `booking_settings` | P0 | Not run |
| F02-17 | Booking settings read-only (neg) | Rec | FX-TEAM | — | Open `/settings/booking` by URL; call `save_booking_settings` | Screen read-only / not reachable; RPC refused, row unchanged | UI, REST, SQL | P1 | Not run |
| F02-18 | Lower people per slot below a future slot (neg) | Own | FX-BIZ NYC | Group slot holds 3 future bookings | Set people per slot 2 | Refused, offending slot named; setting unchanged | UI, SQL | P1 | Not run |
| F02-19 | Booking form: 5 field types | Own | FX-BIZ | — | Add short, long, dropdown (3 options), yes/no, number; one only for Colour | Saved; new form version created once | UI, SQL `form_versions` | P0 | Not run |
| F02-20 | Booking form rules (neg) | Own | FX-BIZ | Fields answered by a booking | Dropdown with 1 option; change a used field's type; turn sensitive OFF | All refused with clear messages | UI, SQL | P1 | Not run |
| F02-21 | Form version not bumped by a no-op save | Own | FX-BIZ | — | Save the form without changes | Version number unchanged | SQL | P2 | Not run |
| F02-22 | Location edit (Solo/Team) | Own | FX-SOLO | — | Settings → Business location: address, phone, tax 20 %, tax number | Saved; shown on invoice and website contact | UI, SQL `branches` | P1 | Not run |
| F02-23 | Booking link card and warnings | Own | FX-TEAM | Missing staff hours | Open Settings → Booking | Warning list with fix buttons; link not shown as active until clear | UI, SQL `branch_is_bookable` | P0 | Not run |

## F03 Team: add by email, join, link staff login, what each role can / cannot do
Code note: invite links were replaced on 2026-10-23 by **add by email** + automatic join on a verified sign-in; `/accept-invite` is a retired page.
| ID | Title | Role | Plan / add-ons | Preconditions | Steps | Expected | Verify | P | Status |
|---|---|---|---|---|---|---|---|---|---|
| F03-01 | Add an existing verified account as Manager | Own | FX-TEAM Team | U-TEAM-MGR has a confirmed account, no membership | Team → Add person: email, Manager, branch; user signs in | Row Pending (30 days); on sign-in user joins as Manager, lands on `/today`, no onboarding, toast "joined" | UI, SQL `business_members`, AUD `member.joined_by_email` | P0 | Not run |
| F03-02 | Add a brand-new email | Own | FX-TEAM | Email has no account | Add as Receptionist; person signs up + confirms | `member_added` outbox row (link `/login`, no token); after confirm joins automatically; no business / trial created | UI, OUT, SQL | P0 | Not run |
| F03-03 | Unverified account never joins (neg) | Own | FX-TEAM | Account with that email exists but unconfirmed | Add it; sign in attempt | Not joined until the email is confirmed; joins right after confirming | UI, SQL | P0 | Not run |
| F03-04 | Re-add, resend, cancel pending | Own | FX-TEAM | Pending add | Re-add with another role; Send again; Cancel | Role replaced; expiry renewed 30 d + new email; after cancel the person cannot join | UI, SQL, OUT, AUD `invite.revoked` | P1 | Not run |
| F03-05 | Expired pending add (neg) | Own | FX-TEAM | Pending row with `invite_expires_at` in the past (SQL clock or wait) | Person signs in | Not joined; list shows Expired | SQL, UI | P2 | Not run |
| F03-06 | Add-person errors (neg) | Own | FX-TEAM | — | Bad email; already a member; 31 adds in an hour | `invalid_email`, `already_member`, `rate_limited` shown as messages; counter survives (returns, not raises) | UI, SQL `rate_limit_*` | P2 | Not run |
| F03-07 | Manager cannot grant more than they hold (neg) | Mgr | FX-BIZ | U-BIZ-MGR-LDN | Add person as Owner; add as Manager at NYC | Owner not offered; NYC not offered; RPC returns `cannot_grant`; nothing written | UI, REST, SQL | P0 | Not run |
| F03-08 | Rec / Staff cannot add people (neg) | Rec, Stf | FX-TEAM | — | Look for Add; call `add_member_by_email` | No button; RPC `forbidden`; nothing written | UI, REST, SQL | P0 | Not run |
| F03-09 | Link a staff login to a staff profile | Own | FX-TEAM | U-TEAM-STF1 joined; profile "Sam" unlinked | Staff → Sam → App login → pick the member (or choose the profile at add time) | Linked; Stf now sees Sam's appointments as "own"; a second link of the same login is refused (`staff_has_login`) | UI, SQL `staff_profiles.member_id` | P0 | Not run |
| F03-10 | Staff role: what they see | Stf | FX-TEAM | Linked staff with 2 own + 2 other appts | Open every menu item; type `/invoices`, `/reports`, `/settings`, `/members` | Menu: Today, Calendar (own column only), Clients (own only, no phone/email), Schedule (own time off), Commission (own), Reviews (own). Typed URLs show the lock state | UI, REST (lists return own rows only) | P0 | Not run |
| F03-11 | Receptionist role: what they see | Rec | FX-TEAM | — | Open menus; try discount + credit note; try reports | All staff calendar, clients with contact, create invoice + payment; no discount, no credit note, no reports, no settings | UI, REST (`add_credit_note` refused, state unchanged) | P0 | Not run |
| F03-12 | Manager role: what they see | Mgr | FX-TEAM | — | Open menus; try Website, Billing, Roles | Branch ops, booking settings, services, staff, invoices incl. discount/credit, reports; no Website, no Billing, no Roles | UI, REST | P0 | Not run |
| F03-13 | Change a member's role | Own | FX-TEAM | Rec active | Manage drawer → change to Manager | Their menus update on next focus / ≤60 s without sign-out; audit row | UI, AUD `role.assignment_changed` | P1 | Not run |
| F03-14 | Remove member | Own | FX-TEAM | Rec active and signed in elsewhere | Remove member | Their next request shows no access; data they created stays | UI, REST | P0 | Not run |
| F03-15 | Last owner protected (neg) | Own | FX-TEAM | Single owner | Remove own Owner role; raw REST UPDATE of the assignment's `role_id`; deactivate own membership | All refused; still exactly one active Owner | REST, SQL, SUITE 41 | P0 | Not run |
| F03-16 | Rec / Staff reach Account and My notifications (known gap) | Rec, Stf | FX-TEAM | — | Find "Account" or "Delete my account" from the menus | Doc/store need it; today only reachable by typing `/settings/account` (Settings hub hidden) | UI | P1 | Not run |
| F03-17 | Member of two businesses (known gap) | Own | FX-TEAM + FX-OTHER | U-OTH-REC added to FX-TEAM | Sign in as U-OTH-REC | Joined both; no business switcher, cannot open FX-TEAM | UI, SQL | P2 | Not run |
| F03-18 | Old invite link | Guest | — | `/accept-invite?token=abc` | Open it | Retired page, "sign in with that email"; `?token` removed from the address bar | UI | P2 | Not run |
| F03-19 | Role label in header | any | FX-TEAM | — | Sign in as each role | Header / avatar menu shows the right role name | UI | P2 | Not run |

## F04 Public booking: `/<slug>/book`, location picker, staff choice, slot rules, form, approval, manage link
| ID | Title | Role | Plan / add-ons | Preconditions | Steps | Expected | Verify | P | Status |
|---|---|---|---|---|---|---|---|---|---|
| F04-01 | Happy path, single location | Guest | FX-TEAM, auto-confirm | Bookable setup | Service → staff → day → slot → form (C-MAIL) → book | Confirmation with manage link shown once (copy button); appt `confirmed`, `source` online; client created; `booking_confirmed` row with sealed token; staff push queued | UI, SQL, OUT, INBOX | P0 | Not run |
| F04-02 | Location picker | Guest | FX-BIZ 3 branches | All bookable | Open `/e2e-multi/book`; pick NYC; "Change location" | Picker shows name/address/tz; services, prices, currency, staff and times are NYC's; change resets choices | UI, HTTP | P0 | Not run |
| F04-03 | `?branch=` links (incl. neg) | Guest | FX-BIZ | — | `?branch=NYC` (code), `?branch=<LDN id>`, `?branch=<FX-OTHER branch id>`, archived branch code | First two preselect; the other two silently show the picker (no hint that the id exists) | UI, HTTP | P1 | Not run |
| F04-04 | Staff choice modes | Guest | FX-TEAM | Set hidden / optional / required in turn | Book each way | hidden: no staff step; optional: "Any available person" offered; required: must pick | UI | P1 | Not run |
| F04-05 | "Any staff" assignment | Guest | FX-TEAM | Sam 2 appts that day, Lee 0, both free | Book with Any | Assigned to Lee (fewest that local day, on schedule) | SQL `appointments.staff_id` | P1 | Not run |
| F04-06 | Minimum notice (incl. neg) | Guest | FX-TEAM notice 60 min | — | Look at today's first slot; HTTP `create_booking` at now+30 min | First slot ≥ now+60 min; HTTP refused `slot_unavailable`, nothing written | UI, HTTP, SQL | P0 | Not run |
| F04-07 | Booking window (incl. neg) | Guest | FX-TEAM window 30 d | — | Navigate to day 30 and 31; HTTP book on day 31 | Day 30 has slots, day 31 none; HTTP refused | UI, HTTP | P0 | Not run |
| F04-08 | Buffer | Guest | FX-TEAM Colour 90 + 15 | Colour booked 10:00-11:30 for Sam | Look at Sam's slots | No start between 11:30 and 11:45 (buffer), none overlapping | HTTP `get_slots`, SQL | P0 | Not run |
| F04-09 | Slot interval | Guest | FX-TEAM | Interval 15, then 60, then service length | Look at slots | Start times follow the interval | UI | P1 | Not run |
| F04-10 | No out-of-hours slots | Guest | FX-TEAM | Branch 09-18, Sam 10-17, break, holiday, time off | Browse days | Slots only inside branch ∩ staff hours, not in break, holiday or time off | HTTP, UI | P0 | Not run |
| F04-11 | People per slot | Guest ×4 | FX-BIZ NYC group class, 3 per slot | — | Book the same 18:00 slot 3 times; try a 4th | First 3 succeed; slot then hidden; 4th via HTTP `slot_unavailable`; exactly 3 rows | UI, HTTP, SQL | P0 | Not run |
| F04-12 | Rooms limit bookings | Guest | FX-BIZ LDN rooms on | Service needs Room 1 (capacity 1), 2 staff free | Book 10:00 with staff A; then 10:00 with staff B | Second refused / slot gone (room busy) | HTTP, SQL | P1 | Not run |
| F04-13 | Slot display "all, booked greyed" | Guest | FX-TEAM | Setting on | Open a day with bookings | Booked times visible but disabled | UI | P2 | Not run |
| F04-14 | Show prices off | Guest | FX-TEAM | Setting off | Open booking page + website | No price anywhere | UI | P1 | Not run |
| F04-15 | Custom fields validation | Guest | FX-BIZ | F02-19 fields | Leave required empty; letters in number; Colour-only field with Haircut; submit valid | Errors under fields; Colour field shown only for Colour; stored answers carry `form_version_id` | UI, HTTP, SQL `appointment_field_values` | P0 | Not run |
| F04-16 | Email optional / required | Guest | FX-TEAM | `require_client_email` off, then on | Book without email | Off: books (C-NOMAIL); On: "Enter your email." under the field (400) | UI, HTTP | P1 | Not run |
| F04-17 | Phone validation | Guest | FX-TEAM | — | Invalid number; valid UK number | Invalid refused; stored as E.164 (`+447700900123`) | UI, SQL | P0 | Not run |
| F04-18 | Owner approves mode | Guest | FX-BIZ LDN approve | — | Book | Status `pending`; slot held (gone for others); `pending_received` email + `staff_pending_approval` push rows | UI, SQL, OUT | P0 | Not run |
| F04-19 | Repeat customer never overwrites (neg) | Guest | FX-TEAM | Client exists with name "Ada Real" | Book again with same phone, name "Ada Typo" | Same response shape as new; client name unchanged; appt linked to existing client | HTTP, SQL | P0 | Not run |
| F04-20 | Bot protection (neg) | Anon | FX-TEAM | — | HTTP with honeypot filled; without / forged `start_token`; instant submit | Refused generically; UI auto-retries once on `too_fast` | HTTP, UI | P1 | Not run |
| F04-21 | Rate limit per IP (neg) | Anon | FX-TEAM | Budget fresh | 11 bookings in an hour from one IP | 11th = 429, calm message; counter rows kept | HTTP, SQL | P1 | Not run |
| F04-22 | Same slot, two customers at once (neg) | Guest ×2 | FX-TEAM | Two browsers on the same slot | Submit both together (and 10 parallel HTTP calls) | Exactly one booking; the loser gets `slot_unavailable`, is sent back to slots with typed answers kept | UI, HTTP, SQL, SUITE 09 | P0 | Not run |
| F04-23 | Not-bookable states look identical (neg) | Guest | various | Unknown slug, FX-LAPSED, booking switched off, setup incomplete | Open `/book` for each | Same "not available" page / 404 `not_bookable`; nothing reveals which case | UI, HTTP | P0 | Not run |
| F04-24 | Manage link view | Guest | FX-TEAM | F04-01 link | Open link | First name only, service, staff, local time + zone name; token gone from address bar; not in query string | UI | P0 | Not run |
| F04-25 | Guest cancels | Guest | FX-TEAM cancel allowed 24 h | Appt > 24 h away | Cancel with confirm | Cancelled view; `cancelled` email; unsent reminder superseded; slot free again | UI, SQL, OUT | P0 | Not run |
| F04-26 | Cancel after cut-off (neg) | Guest | FX-TEAM | Appt < 24 h away | Open link; HTTP cancel | No button, plain explanation; HTTP `cancel_window_passed`; appt unchanged | UI, HTTP, SQL | P0 | Not run |
| F04-27 | Guest reschedules | Guest | FX-TEAM | Appt > 24 h | Reschedule to another free time | Same staff; slots from the engine; `rescheduled` email; reminder re-made | UI, SQL, OUT | P0 | Not run |
| F04-28 | Bad tokens (neg) | Guest | FX-TEAM | — | Edited token, used-up token after cancel, token of FX-OTHER appt with FX-TEAM slug, random | One generic "not valid or expired" page every time | UI, HTTP | P0 | Not run |
| F04-29 | Customer cannot cancel setting | Guest | FX-TEAM | Setting off | Open link | No cancel button; HTTP `not_cancellable` | UI, HTTP | P1 | Not run |
| F04-30 | Browser Back inside the flow | Guest | FX-TEAM | Mid-flow with typed form | Press Back repeatedly | Steps back form→slot→staff→service; dirty form asks "Discard your details?" | UI | P2 | Not run |

## F05 Daily operations: calendar, create / edit / reschedule / cancel, walk-in, no-show, approve, freshness
Code note: there is **no Realtime** by design; "live update" = 30 s refetch on Today and Calendar while visible + refetch on focus + Refresh button.
| ID | Title | Role | Plan / add-ons | Preconditions | Steps | Expected | Verify | P | Status |
|---|---|---|---|---|---|---|---|---|---|
| F05-01 | Calendar Day / Week / List | Own | FX-TEAM | 10 appts this week, 3 staff | Switch views; page list; filter by status; search client | One column per staff; per-staff shading (hours, breaks, time off); week = 7-day strip + day grid; list paged 20, server-side search ≥2 chars | UI, SQL counts | P0 | Not run |
| F05-02 | Create appointment (existing client) | Rec | FX-TEAM | — | New appointment: client, service, Sam, time | `confirmed`; `booking_confirmed` email queued (no manage link); push to others | UI, SQL, OUT | P0 | Not run |
| F05-03 | Book outside hours from dashboard | Rec | FX-TEAM | Sam off at 19:00 | Create at 19:00 | Out-of-hours warning shown, booking allowed | UI, SQL | P1 | Not run |
| F05-04 | Create with a new client inline; refused booking leaves nothing (neg) | Rec | FX-TEAM | Sam busy at 10:00 | Create for a NEW client at Sam 10:00 | Refused `slot_unavailable`; **no orphan client row** | UI, SQL, SUITE 46 | P1 | Not run |
| F05-05 | Walk-in | Rec | FX-TEAM | — | Create walk-in now | Saved `source = walk_in`, no outbox rows | UI, SQL, OUT | P0 | Not run |
| F05-06 | Double-booking from dashboard (neg) | Own | FX-TEAM | Sam 10:00-10:30 booked | Create Sam 10:15 | Refused; existing appt unchanged | UI, SQL | P0 | Not run |
| F05-07 | Reschedule (time and staff) | Mgr | FX-TEAM | Confirmed appt | Reschedule form: new time + Lee | Saved; `rescheduled` email on time change; staff-only change sends nothing to the customer | UI, SQL, OUT | P0 | Not run |
| F05-08 | Staff hand-over (neg) | Stf | FX-TEAM | Own appt | Try to move it to Lee (UI + `update_appointment`) | No staff picker; RPC refused; row unchanged | UI, REST, SQL | P1 | Not run |
| F05-09 | Cancel is final | Rec | FX-TEAM | Confirmed appt | Cancel with reason; then try any status change | Cancelled; `cancelled` email + `staff_cancelled` push; every later transition refused | UI, REST, OUT | P0 | Not run |
| F05-10 | No-show not before start (neg) | Rec | FX-TEAM | Appt starting in 2 h | Mark no-show; after start mark again | First refused; second ok; reminder cancelled | UI, SQL, SUITE 47 | P1 | Not run |
| F05-11 | Complete → review request | Rec | FX-TEAM | Appt started | Mark completed | `completed`; review request created once + email; review-link dialog shows link to copy | UI, SQL `review_requests`, OUT | P0 | Not run |
| F05-12 | Approve pending | Mgr | FX-BIZ LDN | Pending appt | Approve | `confirmed`; `booking_confirmed` email | UI, SQL, OUT | P0 | Not run |
| F05-13 | Staff cannot approve or cancel (neg) | Stf | FX-BIZ | Pending own appt | Call `approve_appointment`, cancel | Refused (no permission); row unchanged | REST, SQL | P1 | Not run |
| F05-14 | Reopen rules | Own, Mgr, Rec | FX-TEAM | Completed appt without invoice, another with invoice | Reopen as Rec, as Mgr; reopen the invoiced one | Rec refused; Mgr ok (+ audit); invoiced one refused | UI, REST, AUD | P1 | Not run |
| F05-15 | Today screen | Rec | FX-BIZ | Appts at LDN and TYO today | Open Today at each branch near local midnight | "Today" = branch tz day; counts; next highlighted; quick actions open a confirm first | UI | P0 | Not run |
| F05-16 | New public booking shows up without reload | Rec | FX-TEAM | Calendar open on today | Book publicly in another browser; wait ≤30 s; also press Refresh | Appears within 30 s; Refresh works; no websocket opened (DevTools Network WS = 0) | UI | P0 | Not run |
| F05-17 | Appointment drawer details | Mgr, Rec | FX-BIZ | Booking with sensitive answer | Open drawer as Mgr then Rec | Answers labelled from their form version; sensitive answer hidden for Rec; message status + Try again for a rejected send | UI, REST | P1 | Not run |
| F05-18 | Staff sees own only | Stf | FX-TEAM | — | Calendar + list; REST `list_appointments` / `get_calendar_appointments` | Locked to own column; API returns own rows only | UI, REST | P0 | Not run |
| F05-19 | Inactive staff column kept | Own | FX-TEAM | Lee deactivated, keeps a future appt | Open that day | Lee's column shown labelled "(Inactive)" | UI | P2 | Not run |
| F05-20 | Branch switcher | Own | FX-BIZ | — | Switch LDN → NYC on desktop header and mobile Today | Calendar / Today data follow the branch | UI | P1 | Not run |

## F06 Clients: list, search, profile, notes, history, sensitive fields, export
| ID | Title | Role | Plan / add-ons | Preconditions | Steps | Expected | Verify | P | Status |
|---|---|---|---|---|---|---|---|---|---|
| F06-01 | List, search, pages | Rec | FX-TEAM | 45 clients | Type 1 char, then 2; scroll | No search at 1 char; server search after 300 ms; 20 per page, next page by keyset | UI, Network tab | P0 | Not run |
| F06-02 | Create / edit / duplicate phone | Rec | FX-TEAM | Ada exists | New client with Ada's phone | Clear message with link to Ada; no raw DB error | UI | P1 | Not run |
| F06-03 | Profile content | Mgr | FX-BIZ | Client visited LDN and NYC | Open profile | Contact, notes, upcoming, history across both branches (Manager@LDN: only rows in scope), invoices, booking answers | UI | P0 | Not run |
| F06-04 | Contact details gated by DB (neg) | Stf, Cust | FX-TEAM | Own client | Open profile; REST select `clients.phone_e164`; `clients_v`; search by phone | No phone/email/notes shown; REST 403 on the columns; view returns NULL; phone search matches nothing | UI, REST, SUITE 28 | P0 | Not run |
| F06-05 | Sensitive answers | Own, Mgr, Rec, Stf | FX-BIZ | Allergies answered | Open answers as each | Own/Mgr see; Rec not; Stf only on own clients | UI, REST, SUITE 43 | P0 | Not run |
| F06-06 | Staff sees own clients only (neg) | Stf | FX-TEAM | Clients with/without Sam appts | Open list; open other client by id | Only own clients; other id → not found | UI, REST | P0 | Not run |
| F06-07 | Archive / unarchive | Rec | FX-TEAM | — | Archive; show archived; unarchive | Hidden by default; back after unarchive; history intact | UI, SQL | P2 | Not run |
| F06-08 | Export one client | Own, Mgr, Rec | FX-TEAM | — | Export data as Own; as Rec (UI + `gdpr_export_client`) | JSON file with all client data; Rec no button + RPC refused; AUD `client.exported` | UI, REST, AUD | P1 | Not run |
| F06-09 | Erase personal data (incl. neg) | Own | FX-TEAM | Client with upcoming appt; another with past invoice only | Erase first; erase second (type name) | First refused `has_future_appointment`; second anonymised, invoices kept with name blanked, files queued for removal; second call idempotent | UI, SQL, SUITE 29 | P0 | Not run |
| F06-10 | Other business's client (neg) | Own | FX-OTHER | Id of an FX-TEAM client | Open `/clients/<id>`; REST select | Not found; 0 rows | UI, REST | P0 | Not run |
| F06-11 | Client list export (known gap) | Own | FX-TEAM | — | Look for CSV export of the list | Doc §9 permission exists; only per-client JSON exists today | UI | P2 | Not run |

## F07 Money: appointment → invoice → tax → discount → payments → credit note → numbering → immutability
| ID | Title | Role | Plan / add-ons | Preconditions | Steps | Expected | Verify | P | Status |
|---|---|---|---|---|---|---|---|---|---|
| F07-01 | Invoice from a completed appointment | Rec | FX-TEAM | Completed Haircut 25.00 | Create invoice from the drawer | Draft with the appt's price snapshot; appt linked (`invoice_id`) | UI, SQL | P0 | Not run |
| F07-02 | Lines: service, free text, quantity | Rec | FX-TEAM | Draft | Add free-text line qty 3; qty 0 and 10000 | Valid line saved; 0 / 10000 refused | UI | P1 | Not run |
| F07-03 | Discount needs reason + permission | Mgr, Rec | FX-TEAM | Draft | Mgr: discount 5.00 without reason, then with; Rec: try discount (UI + RPC) | No reason → refused; with reason ok; Rec no control and RPC refused, draft unchanged | UI, REST, SQL | P0 | Not run |
| F07-04 | Tax maths and snapshot | Mgr | FX-TEAM 8.875 % | Draft net 47.50 | Issue; then change branch tax to 10 % | Tax = half-up of net × rate; total = net + tax; issued invoice keeps 8.875 % and old tax number | UI, SQL | P0 | Not run |
| F07-05 | Issue numbering | Mgr | FX-TEAM | Empty draft, zero-total draft, valid draft | Issue each | `no_items`, `zero_total` refused; valid gets `TEA-000001`, next `TEA-000002` | UI, SQL | P0 | Not run |
| F07-06 | Discarded draft uses no number | Mgr | FX-TEAM | Draft A, Draft B | Discard A; issue B | B gets the next number, no gap | SQL | P0 | Not run |
| F07-07 | Gapless under concurrency | Mgr ×2 | FX-TEAM | 2 drafts | Issue both in parallel | Consecutive numbers, no duplicate, no gap | SQL, SUITE 15 | P0 | Not run |
| F07-08 | Series per branch | Own | FX-BIZ | Drafts at LDN and NYC | Issue both | `LDN-000001` and `NYC-000001`; credit notes `LDN-CN-000001` series separate | SQL | P0 | Not run |
| F07-09 | Payments | Rec | FX-TEAM | Issued 51.72 | Pay 20 cash → partial; 31.72 card → paid; try 1.00 more; try `paid_at` tomorrow | Status partial → paid; overpay and future date refused | UI, SQL | P0 | Not run |
| F07-10 | Credit note + refund | Mgr | FX-TEAM | Paid invoice | Partial credit 10.00 net; then full; reverse a payment with reason | `TEA-CN-000001`; tax follows snapshot; no rounding drift; `refund_due`; reversal row; reversal of reversal refused | UI, SQL | P0 | Not run |
| F07-11 | Immutability (neg) | Own | FX-TEAM | Issued, paid invoice | REST UPDATE/DELETE on `invoices`, `invoice_items`, `invoice_payments`, `credit_notes` | All refused; rows byte-identical after | REST, SQL | P0 | Not run |
| F07-12 | One live invoice per appointment (neg) | Rec | FX-TEAM | Appt with draft | Create a 2nd invoice for it | Refused; fully credited invoice stays linked (no re-invoice) | UI, SQL | P1 | Not run |
| F07-13 | Branch locks after first invoice | Own | FX-BIZ NYC | First invoice issued | Change NYC currency; change prefix | `currency_locked`, `prefix_locked`; branch unchanged | UI, SQL | P0 | Not run |
| F07-14 | Zero-decimal currency | Rec | FX-BIZ TYO JPY | — | Invoice ¥3,300 incl. 10 % tax | Stored integer minor units with exponent 0; displayed "¥3,300" (no .00) | UI, SQL | P0 | Not run |
| F07-15 | Print view | Rec | FX-TEAM | Issued | Open print; browser print preview | Number, dates, branch address, tax number, lines, totals; only the invoice prints | UI | P1 | Not run |
| F07-16 | Audit rows | Mgr | FX-TEAM | F07-05..10 | Read audit log | `invoice.issued`, `payment_added`, `payment_reversed`, `credit_note_created`, `draft_discarded` | AUD | P1 | Not run |
| F07-17 | No invoice access (neg) | Stf, Own of FX-OTHER | FX-TEAM | Invoice id | Staff opens `/invoices`; other owner opens `/invoice-print/<id>` | Lock state / not found; RPC returns nothing | UI, REST | P0 | Not run |
| F07-18 | Client profile invoices | Rec | FX-TEAM | Client with 2 invoices | Open profile | Both listed with state badges | UI | P2 | Not run |

## F08 Reports: basic + advanced, periods / compare, CSV / print, scheduled email, branch comparison, multi-currency
| ID | Title | Role | Plan / add-ons | Preconditions | Steps | Expected | Verify | P | Status |
|---|---|---|---|---|---|---|---|---|---|
| F08-01 | Basic report today / month | Own | FX-TEAM | Paid invoices today and this month | Open Reports | Revenue, appointments, top services match SQL; day/month boundaries in branch tz | UI, SQL | P0 | Not run |
| F08-02 | Revenue visibility (neg) | Rec, Stf, Mgr | FX-BIZ | — | Open `/reports` as each | Rec/Stf: no menu, lock state; Mgr@LDN: LDN only | UI, REST | P0 | Not run |
| F08-03 | Multi-currency never summed | Own | FX-BIZ all branches | Revenue in GBP, USD, JPY | All-branch scope in basic, advanced, combined overview | Separate totals per currency, no grand total across currencies | UI, SQL | P0 | Not run |
| F08-04 | Advanced periods and compare | Own | FX-TEAM | 2 months of data | Weekly, monthly, custom (≤366 d; 367 refused) | Previous equal period shown; numbers match SQL | UI, SQL | P1 | Not run |
| F08-05 | Advanced sections | Own | FX-TEAM | Data incl. cancels / no-shows, new + returning | Revenue, staff, services, clients, appointments | Values match hand-computed SQL (rates, retention, commission) | UI, SQL | P1 | Not run |
| F08-06 | Branch comparison only on Business (neg) | Own | FX-TEAM vs FX-BIZ | — | Look for Branches section; RPC section `branches` on Team | Business: shown; Team: hidden + `feature_unavailable` | UI, REST | P1 | Not run |
| F08-07 | CSV export | Own | FX-BIZ | Client named `=HYPERLINK(...)` | Export CSV | Cell neutralised; currency column per row; opens in a spreadsheet correctly | UI, file | P1 | Not run |
| F08-08 | Print / PDF | Own | FX-TEAM | — | Print a section | Print view only, readable; PDF via browser "Save as PDF" | UI | P2 | Not run |
| F08-09 | Scheduled email | Own | FX-TEAM | Weekly schedule, send hour = next hour | Wait for cron (≤15 min after hour) | One `report_summary` row per eligible recipient (ALL-scope `reports.view_advanced`; revenue only with `view_revenue`); payload emptied after send; real mail to C-MAIL owner only if address matches | OUT, SQL, INBOX | P1 | Not run |
| F08-10 | Solo has no advanced reports (neg) | Own | FX-SOLO | — | Open `/settings/advanced-reports`; call `get_advanced_report` | "Not included" state; `feature_unavailable` | UI, REST | P0 | Not run |
| F08-11 | DST week boundaries | Own | FX-BIZ LDN | Data around 2027-03-28 (seeded via dashboard) | Weekly report for that week | Mon 00:00 London → Sun 24:00 London, no missing / double hour | SQL | P2 | Not run |
| F08-12 | Packages report (known gap) | Own | FX-BIZ packages on | — | Look for packages section | Doc §8.3 "when on"; not built | UI | P2 | Not run |

## F09 Notifications: email outbox, reminders, unsubscribe, web push, client with no email
| ID | Title | Role | Plan / add-ons | Preconditions | Steps | Expected | Verify | P | Status |
|---|---|---|---|---|---|---|---|---|---|
| F09-01 | Booking confirmation reaches a real inbox | Guest | FX-TEAM | Customer C-MAIL | Book publicly | Email arrives (not spam) with business, local time + zone, manage link that opens the booking | INBOX, OUT `sent` + provider id | P0 | Not run |
| F09-02 | Pending received email | Guest | FX-BIZ LDN approve | C-MAIL | Book | "Request received" wording, not "confirmed"; "Location: LDN" line (multi-branch) | INBOX, OUT | P1 | Not run |
| F09-03 | Reminder timing | Guest | FX-TEAM reminders 24 h | Book for tomorrow 15:00 | Check outbox; wait until T-24h + 5 min | `reminder:<appt>:<epoch>` due at T-24h branch wall clock; sent within one cron tick; `staff_reminder` push row | SQL, OUT, INBOX | P0 | Not run |
| F09-04 | Reschedule replaces the reminder | Guest | FX-TEAM | F09-03 appt | Reschedule by manage link | Old reminder `cancelled/rescheduled`; `rescheduled` email; new reminder at the new time | OUT | P0 | Not run |
| F09-05 | Cancel stops messages | Rec | FX-TEAM | Appt with queued reminder | Cancel | Reminder superseded; `cancelled` email; `staff_cancelled` push | OUT | P0 | Not run |
| F09-06 | Client with no email | Guest | FX-TEAM SMS off | C-NOMAIL | Book, reschedule, complete | No client rows queued at all (SMS off); staff push still queued; drawer shows nothing sent | OUT, UI | P0 | Not run |
| F09-07 | Walk-in sends nothing | Rec | FX-TEAM | — | Walk-in for C-MAIL | No outbox rows | OUT | P1 | Not run |
| F09-08 | Dashboard-made booking email | Rec | FX-TEAM | C-MAIL | Create in Calendar | `booking_confirmed` sent; no manage link inside (by design) | INBOX, OUT | P1 | Not run |
| F09-09 | Unsubscribe | Guest | FX-TEAM | Reminder email | Open link (do not press); then press; forged token POST | Page alone changes nothing; button suppresses `reminder` + `review_request` only; confirmations still sent; forged = same reply, nothing changes | UI, HTTP, SQL `message_suppressions` | P1 | Not run |
| F09-10 | Message log screen | Mgr, Rec | FX-TEAM | Mixed sent/dead rows | Open Settings → Messages; filters | Masked recipient, channel/status/branch filters, 20 per page; Rec has no access | UI, REST | P1 | Not run |
| F09-11 | Failed send + Try again | Rec | FX-TEAM | C-FAKE booking (Resend refuses) | Open drawer; Try again | Reason hint (`resend_403`); retry gets a fresh key; `ambiguous_send` rows not retryable | UI, OUT | P2 | Not run |
| F09-12 | No token or address in logs | — | FX-TEAM | Sent + dead rows | SELECT `messages`, `message_outbox.sealed`, `audit_logs` | No raw token, address or body; sealed nulled after sent/dead | SQL | P1 | Not run |
| F09-13 | Web push on desktop Chrome / Android PWA | Rec | FX-TEAM | Push enabled in My notifications | Book publicly | Notification shown; tap opens the app; sign out unregisters the token | UI (real device for Android), SQL `push_tokens` | P1 | Not run |
| F09-14 | iPhone Safari tab push | Rec | FX-TEAM | Safari not installed as app | Open My notifications | "Install first" state, no prompt | UI (real iPhone) | P2 | Not run |
| F09-15 | Push preferences | Rec | FX-TEAM | Turn off "new booking" | Book publicly | No `staff_new_booking` row for that user | OUT | P2 | Not run |
| F09-16 | Daily / recipient caps | — | FX-TEAM | 6 messages to one address in 24 h | Trigger them | 6th skipped `recipient_cap`, logged | OUT, SUITE 17 | P2 | Not run |
| F09-17 | Cron health | — | DEV | — | `cron.job_run_details` last runs for outbox-worker / reminders / maintenance / report-schedules | All recent runs `succeeded`; no growing `dead` backlog | SQL | P0 | Not run |
| F09-18 | Manage link resend from dashboard (known gap) | Rec | FX-TEAM | Guest lost the link | Look for "Send manage link again" in the drawer | Doc §0 #3 requires it; Edge Function exists, no button | UI | P1 | Not run |

## F10 Reviews: request on Completed, stars / comment, reply, testimonials, Google link rules
| ID | Title | Role | Plan / add-ons | Preconditions | Steps | Expected | Verify | P | Status |
|---|---|---|---|---|---|---|---|---|---|
| F10-01 | One request per appointment | Rec | FX-TEAM | Completed appt | Reopen (Mgr) and complete again | Still exactly one `review_requests` row; no 2nd email | SQL, OUT | P0 | Not run |
| F10-02 | Leave a review | Guest | FX-TEAM | Review link | 2 stars + comment; another with 5 stars | Same thank-you and the same Google button (if URL set) for both; first name only stored; no "name the staff" prompt | UI, SQL | P0 | Not run |
| F10-03 | Bad review links (neg) | Guest | FX-TEAM | — | Reuse a used link; edited token; expired (31 d, SQL clock) | One generic page each | UI, HTTP | P1 | Not run |
| F10-04 | Reply and visibility | Own, Rec, Stf | FX-TEAM | 2 reviews (Sam's and Lee's) | Own replies; Rec tries reply; Stf (Sam) opens list | Reply saved + audit; Rec no button, RPC refused; Sam sees only his review | UI, REST, AUD | P1 | Not run |
| F10-05 | Testimonials | Mgr | FX-TEAM | 13 reviews | Feature 12; try 13th; view website | 13th refused (cap message); website shows featured ones with first name only | UI, SQL | P1 | Not run |
| F10-06 | Customer words immutable (neg) | Own | FX-TEAM | Review | REST UPDATE `reviews.comment` / rating | Refused; unchanged | REST, SQL | P1 | Not run |
| F10-07 | Set the Google review link (known gap) | Own | FX-TEAM | — | Look for a field for the Google review URL | Doc §6.4; column exists, no UI — no Google button can ever show | UI | P1 | Not run |
| F10-08 | Reissue link | Mgr | FX-TEAM | Completed, not reviewed | Reissue | Old token dead, new email queued; refused once reviewed | UI, OUT | P2 | Not run |
| F10-09 | Super admin removes a review | SA | FX-TEAM | Abusive review | Remove with reason | Hidden from website/testimonials; owner sees reason in audit | UI, AUD | P2 | Not run |

## F11 Website builder: sections, branding, publish, SEO, Book buttons
| ID | Title | Role | Plan / add-ons | Preconditions | Steps | Expected | Verify | P | Status |
|---|---|---|---|---|---|---|---|---|---|
| F11-01 | Edit all 7 sections | Own | FX-TEAM | — | Edit, hide, reorder Hero/About/Services/Gallery/Testimonials/FAQs/Contact | Preview matches; public page follows order/visibility; empty sections dropped | UI | P1 | Not run |
| F11-02 | Content validation (neg) | Own | FX-TEAM | — | `http://` link, over-long text, unknown key via RPC | Refused `invalid_content` with field detail | UI, REST | P1 | Not run |
| F11-03 | Branding | Own | FX-TEAM | — | Pale yellow brand colour, serif font, radius, logo + hero upload | Accent text stays readable (≥4.5:1); uploads jpeg/png/webp ≤5 MB ok; SVG / 6 MB refused | UI | P1 | Not run |
| F11-04 | Publish / unpublish | Own | FX-TEAM | — | Publish; open `/e2e-team`; unpublish; reopen | Live; after unpublish same "not found" as an unknown slug | UI, HTTP | P0 | Not run |
| F11-05 | Manager cannot edit / publish (neg) | Mgr | FX-TEAM | — | Open `/website`; call `set_website_published` | No menu / lock state; RPC refused | UI, REST | P1 | Not run |
| F11-06 | Live services and prices | Guest | FX-TEAM | Show prices on/off; Consult not bookable | View site | Bookable services only; prices follow the setting | UI | P1 | Not run |
| F11-07 | SEO tags | Guest | FX-TEAM | Published | View source / head | Title, meta description, OG, valid LocalBusiness JSON-LD; `/e2e-team` indexable; `/e2e-team/book` noindex | UI, HTTP | P1 | Not run |
| F11-08 | Book buttons | Guest | FX-BIZ | Published | Click every Book button | Opens `/e2e-multi/book` (location picker for 3 branches) | UI | P0 | Not run |
| F11-09 | Contact section | Guest | FX-TEAM | Address, phone, hours set | View | Data from the website's branch; hours in branch tz | UI | P2 | Not run |
| F11-10 | Inactive business site (neg) | Guest | FX-LAPSED | Published before expiry | Open `/<slug>` | Not found (same as unknown) | UI, HTTP | P1 | Not run |
| F11-11 | Asset path isolation (neg) | Own | FX-OTHER | — | Upload to `website-assets/<FX-TEAM id>/x.jpg` via Storage API | Refused | REST | P1 | Not run |
| F11-12 | Text is never HTML (neg) | Own | FX-TEAM | — | Put `<script>alert(1)</script>` in About and FAQ | Rendered as plain text; no script runs | UI | P0 | Not run |

## F12 Multi-branch: timezones, currencies, tax per branch, combined view, locks
| ID | Title | Role | Plan / add-ons | Preconditions | Steps | Expected | Verify | P | Status |
|---|---|---|---|---|---|---|---|---|---|
| F12-01 | Create a branch | Own | FX-BIZ | LDN exists | Add NYC (USD, New York) copying hours; add TYO (JPY) | Created with own booking settings; same-currency prices copied only | UI, SQL | P0 | Not run |
| F12-02 | Branch limit (neg) | Own | FX-TEAM, FX-SOLO | — | Open Locations; call `create_branch` | Not included / `branch_limit_reached`; nothing written | UI, REST | P0 | Not run |
| F12-03 | Each branch's own "today" | Rec | FX-BIZ | Same UTC instant 23:30 London | Today at LDN vs TYO | Different local dates, correct appointments | UI | P0 | Not run |
| F12-04 | Per-branch tax and currency on invoices | Rec | FX-BIZ | — | Invoice at LDN and NYC | GBP 20 % vs USD 8.875 %, each with branch tax number and prefix | UI, SQL | P0 | Not run |
| F12-05 | Locks (neg) | Own | FX-BIZ | NYC has invoice + upcoming appts | Change NYC currency, timezone, prefix | `currency_locked`, `timezone_in_use`, `prefix_locked`; branch unchanged | UI, SQL | P0 | Not run |
| F12-06 | Archive rules | Own | FX-BIZ | — | Archive primary; branch with upcoming appts; branch with open draft; empty branch | First three refused with reason; empty one archived, hidden from public picker; its prefix retired | UI, HTTP, SQL | P1 | Not run |
| F12-07 | Set primary | Own | FX-BIZ | — | Make NYC primary | Website / default booking branch follows | UI | P2 | Not run |
| F12-08 | Combined overview | Own | FX-BIZ | Data in 3 branches | Locations → combined view | Per-branch rows, totals per currency, archived branches with history | UI, SQL | P1 | Not run |
| F12-09 | Branch-scoped Manager (neg) | Mgr@LDN | FX-BIZ | Data at NYC | REST lists: appointments, invoices, staff, services, booking settings for NYC | 0 NYC rows; NYC updates refused (0 rows) | REST, SUITE 21 | P0 | Not run |
| F12-10 | Switcher | Own | FX-BIZ | — | Desktop header switcher, mobile Today switcher, More | Data follow the branch everywhere | UI | P1 | Not run |
| F12-11 | Emails name the location | Guest | FX-BIZ | C-MAIL | Book at NYC | Email has "Location: NYC, <address>" and NYC local time | INBOX, OUT | P2 | Not run |

## F13 Commission: rules, auto on paid invoice, staff sees only own
| ID | Title | Role | Plan / add-ons | Preconditions | Steps | Expected | Verify | P | Status |
|---|---|---|---|---|---|---|---|---|---|
| F13-01 | Rules | Own | FX-TEAM | — | Sam: 40 % on Haircut; flat 5.00 on Colour; default 10 % | Saved as versions; Mgr cannot edit rules (no `manage_rules`) | UI, REST | P1 | Not run |
| F13-02 | Earned on full payment | Rec | FX-TEAM | Invoice: Haircut 25.00 (Sam), tax 8.875 % | Pay in full | Commission = 40 % of line net excl. tax, half-up = 10.00 | SQL `commission_entries`, UI | P0 | Not run |
| F13-03 | Partial payment earns nothing yet | Rec | FX-TEAM | — | Pay half | No entry until fully paid | SQL | P1 | Not run |
| F13-04 | Credit note reverses proportionally | Mgr | FX-TEAM | Paid invoice with commission | Credit 50 % net, then rest | Reversal rows; final total 0, no drift | SQL | P1 | Not run |
| F13-05 | Visibility | Stf, Mgr, Rec | FX-TEAM | Sam + Lee earnings | Open Commission as each | Sam: own only; Mgr: team; Rec: no menu; REST as Sam for Lee → nothing | UI, REST | P0 | Not run |
| F13-06 | Rule change is not retroactive | Own | FX-TEAM | Earned entry | Change Sam to 50 % | Old entry unchanged; new invoices use 50 % | SQL | P1 | Not run |
| F13-07 | Solo has no commission (neg) | Own | FX-SOLO | — | Open `/commission`; call `set_commission_rule` | Not included; `feature_unavailable`; paid invoices create `feature_off` lines only | UI, REST, SQL | P1 | Not run |
| F13-08 | Parallel payments | Rec ×2 | FX-TEAM | — | Two final payments at once | Exactly one set of entries | SUITE 20 | P2 | Not run |

## F14 Custom roles: create / clone, safety rules, audit
| ID | Title | Role | Plan / add-ons | Preconditions | Steps | Expected | Verify | P | Status |
|---|---|---|---|---|---|---|---|---|---|
| F14-01 | Plan gate | Own | FX-TEAM no add-on → add-on on; FX-BIZ | — | Open Settings → Roles; `create_custom_role` | Team without add-on: not included + `feature_unavailable`; with add-on / Business: works | UI, REST | P0 | Not run |
| F14-02 | Create from scratch | Own | FX-BIZ | — | "Front desk lite": appointments view/create (Branch), clients view (Branch) | Saved; matrix hides add-on perms only when the add-on is off; SMS perms hidden | UI, SQL | P0 | Not run |
| F14-03 | Clone with billing stripped | Own | FX-BIZ | — | Clone Owner | `settings.billing` removed and reported; clone otherwise equal | UI, SQL | P1 | Not run |
| F14-04 | Cannot grant what you lack (neg) | Cust | FX-BIZ | A custom role with `roles.manage` at Branch only | Define a role with `reports.view_revenue` at All; assign it at NYC | Refused (`can_define_at` / `can_grant_at`); nothing written | REST, SQL | P0 | Not run |
| F14-05 | Default roles immutable (neg) | Own | FX-BIZ | — | Edit / delete Manager role (UI + REST on `role_permissions`) | Refused (system role); unchanged | UI, REST, SQL | P0 | Not run |
| F14-06 | Assign and take effect | Own | FX-BIZ | U-BIZ-CUSTOM | Assign "Front desk lite" @ LDN | User's menus show exactly those areas within ≤60 s (permissions_version); RLS returns LDN rows only | UI, REST | P0 | Not run |
| F14-07 | Delete a role in use | Own | FX-BIZ | Role assigned to 1 member | Delete; then delete with replacement | `role_in_use` + count; with replacement members moved in one step | UI, SQL | P1 | Not run |
| F14-08 | Audit | Own | FX-BIZ | F14-02..07 | Read audit log | `role.created/updated/deleted/assigned/unassigned` with before/after | AUD | P1 | Not run |
| F14-09 | Downgrade keeps assignments | SA, Own | FX-BIZ → Team | Custom role assigned | SA assigns Team (no add-on); owner tries to edit role | Existing member keeps working; edits refused | UI, REST | P1 | Not run |
| F14-10 | Last owner via roles (neg) | Own | FX-BIZ | Single owner | Assign self a custom role and remove Owner | Refused; one Owner remains | REST, SUITE 41 | P0 | Not run |

## F15 Add-ons ON and OFF
Run each add-on twice: **OFF** (FX-TEAM without it) and **ON** (FX-BIZ, or FX-TEAM after SA enables it). Turning one off then on again must keep its data.
| ID | Title | Role | Plan / add-ons | Preconditions | Steps | Expected | Verify | P | Status |
|---|---|---|---|---|---|---|---|---|---|
| F15-01 | Any add-on OFF is hidden and blocked (neg) | Own | FX-TEAM none | — | Look for Packages, Inventory, Files tab, Forms, Portal; type their URLs; call one RPC each | Nothing shown; lock / not-included state; RPCs `feature_unavailable`; portal & sign endpoints generic not-found | UI, REST, HTTP | P0 | Not run |
| F15-02 | OFF → ON → OFF keeps data | SA, Own | FX-TEAM | Packages with data | SA disables, re-enables | Data hidden then back unchanged | UI, SQL | P1 | Not run |
| F15-03 | Packages: define and sell | Rec | FX-BIZ | Package "5 Haircuts + 1 bonus, 30 d" | Add to invoice for Ada; issue | `client_packages` snapshot (6 sessions, price = line net, expiry = local day after sold+30) | UI, SQL | P0 | Not run |
| F15-04 | Packages: deduct rules (incl. neg) | Rec, Stf | FX-BIZ | Ada's package | Deduct on confirmed appt; deduct twice same appt; on another client's appt; after expiry; past balance | First ok; others refused with codes; balance never < 0 | UI, REST, SQL | P0 | Not run |
| F15-05 | Undo / reverse | Rec, Mgr | FX-BIZ | Deduction | Creator undo at 9 min; Rec at 11 min; Mgr reverse with reason | 9 min ok; 11 min refused for Rec; Mgr ok; reversal rows, deduction row kept | UI, SQL | P1 | Not run |
| F15-06 | Customer cancel returns the session | Guest | FX-BIZ | Deducted appt | Cancel by manage link | Session returned (reversal row) | SQL, SUITE 48 | P1 | Not run |
| F15-07 | Credit note and packages | Mgr | FX-BIZ | Package invoice | Partial credit; full credit with a session used; full credit unused | Partial: nothing; used: `package_sessions_used`; unused: package cancelled | SQL | P1 | Not run |
| F15-08 | Inventory: stock on sale | Rec | FX-BIZ | Shampoo stock 3 | Invoice qty 2 → issue; then qty 2 again | First: stock 1; second whole issue refused `insufficient_stock` (no partial write) | UI, SQL | P0 | Not run |
| F15-09 | Inventory: negative stock switch | Mgr | FX-BIZ | Stock 1 | Allow negative; sell 2 | Stock −1 recorded | UI, SQL | P2 | Not run |
| F15-10 | Low-stock alert once | Mgr | FX-BIZ | Low level 2 | Drop from 3 to 1; then to 0 | One `low_stock` email + `staff_low_stock` push on crossing only | OUT | P1 | Not run |
| F15-11 | Exhausting credit note restores stock | Mgr | FX-BIZ | Issued product invoice | Full credit | Stock restored (`return` movement) | SQL | P1 | Not run |
| F15-12 | Staff has no inventory (neg) | Stf | FX-BIZ | — | Open `/inventory` | Lock state; REST 0 rows | UI, REST | P1 | Not run |
| F15-13 | Files: consent gate | Rec | FX-BIZ | Client without photo consent | Upload a JPEG; set consent; upload again; upload PDF | First refused; then ok; PDF ok without consent; audit consent change | UI, SQL, AUD | P0 | Not run |
| F15-14 | Files: type and size (neg) | Rec | FX-BIZ | — | `.exe` renamed `.jpg`; HEIC; 11 MB JPEG | All refused (bytes sniffed, size cap) | UI, HTTP | P0 | Not run |
| F15-15 | Files: private access (neg) | Anon, Own | FX-BIZ | Uploaded file | Direct Storage URL, list, public URL; signed URL after 5 min | All refused; signed URL works < 5 min then expires | HTTP | P0 | Not run |
| F15-16 | Files: staff own scope | Stf | FX-BIZ | Files on own + other clients | Open Files tab | Only own clients' files | UI, REST | P1 | Not run |
| F15-17 | Forms: template + send + sign | Mgr, Rec, Guest | FX-BIZ | — | Create consent template; send link to C-MAIL; sign with signature | Email with `/sign#token=`; signed copy immutable with strokes; drawer shows Signed | UI, INBOX, SQL | P0 | Not run |
| F15-18 | Forms: single use + bad links (neg) | Guest | FX-BIZ | Signing link | Submit twice in parallel; reuse; edit token | One signed copy; others generic invalid | HTTP, SQL | P1 | Not run |
| F15-19 | Forms: versions and void | Mgr | FX-BIZ | Signed copy | Edit template; void copy | New version; old copy kept but voided | UI, SQL | P1 | Not run |
| F15-20 | Portal OFF (neg) | Guest | FX-TEAM no portal | — | Open `/e2e-team/portal`; request link | Generic not found / `{sent:true}` with nothing stored or sent | UI, HTTP, OUT | P0 | Not run |
| F15-21 | Portal sign-in | Guest | FX-BIZ | C-MAIL is a client; random email is not | Request link for both | Identical answers; only C-MAIL gets `portal_login` email; link → session | UI, INBOX, OUT | P0 | Not run |
| F15-22 | Portal content | Guest | FX-BIZ | Ada has bookings, package, issued + draft invoice, consented photo, signed form | Open each tab | Own data only; draft invoice NOT shown; no internal notes; photos only with consent | UI | P0 | Not run |
| F15-23 | Portal book / cancel / reschedule | Guest | FX-BIZ | Session | Book (location picker), cancel within / after cut-off, reschedule | Same rules as the public page (engine); messages queued | UI, SQL | P1 | Not run |
| F15-24 | Portal My data | Guest, Own | FX-BIZ | Session | Request a copy; request again | Request row; repeat says already open; Owner sees it in Settings → Data requests | UI, SQL | P1 | Not run |
| F15-25 | Portal session isolation (neg) | Guest, Own | FX-BIZ | — | Use a dashboard JWT as portal session; portal token on REST | Both refused | HTTP, REST | P1 | Not run |
| F15-26 | Portal rate limit (neg) | Guest | FX-BIZ | — | 4 link requests for one email in an hour | 4th not sent (same answer); counted | OUT, SQL | P2 | Not run |

## F16 Plans and lifecycle: caps, trial expiry lock, suspended, reactivation
| ID | Title | Role | Plan / add-ons | Preconditions | Steps | Expected | Verify | P | Status |
|---|---|---|---|---|---|---|---|---|---|
| F16-01 | Solo staff cap (neg) | Own | FX-SOLO | 1 staff | Add a 2nd staff profile | `staff_cap_reached` message; no ghost profile left | UI, SQL | P0 | Not run |
| F16-02 | Team cap per location (neg) | Own | FX-TEAM | 5 active staff | Add 6th; deactivate one, add; reactivate the old one | 6th refused; after deactivation ok; reactivation over cap refused | UI, SQL | P0 | Not run |
| F16-03 | Business unlimited | Own | FX-BIZ | — | Add 8 staff at LDN | All ok | UI | P2 | Not run |
| F16-04 | Solo feature set (neg) | Own | FX-SOLO | — | Menus + RPCs: commission, advanced reports, locations, roles | All "not included" / refused | UI, REST | P0 | Not run |
| F16-05 | Team feature set (neg) | Own | FX-TEAM | — | Locations, roles (no add-on), branch comparison | Not included / refused | UI, REST | P0 | Not run |
| F16-06 | Solo "owner only" roles (known gap) | Own | FX-SOLO | — | Add a Manager by email | Doc §10 says Owner only; today accepted | UI, SQL | P1 | Not run |
| F16-07 | Trial expiry lock | Own, Rec | FX-LAPSED (or a trial set to end) | Data exists | Sign in; open each screen; try a write via REST | Lock screen on operational routes; Settings, Billing, More open; data intact (SQL count same); writes refused; public booking + website "not available" | UI, REST, HTTP, SQL | P0 | Not run |
| F16-08 | Assign plan unlocks at once | SA, Own | FX-LAPSED | Locked | SA assigns Team | Owner unlocked on next refetch (≤30 s) without sign-out | UI | P0 | Not run |
| F16-09 | Suspend blocks sign-in | SA, Own | FX-TEAM | Auth hook ON on DEV (check first) | SA suspends; owner signs in; an open session refocuses | Sign-in refused "account disabled"; open session signed out / locked; unsuspend → works | UI, SQL | P0 | Not run |
| F16-10 | Paid period ended | SA, Own | FX-TEAM | `current_period_end` near future | Let it pass | Locked with "period ended" wording (not "trial"); reactivation clears a stale past end | UI, SQL | P1 | Not run |
| F16-11 | Downgrade over limits (neg) | SA | FX-BIZ 3 branches, 8 staff | — | Assign Team | Refused `over_limit` with branches / staff details; nothing changes | UI, SQL | P1 | Not run |
| F16-12 | Extend trial | SA | trial business | — | Extend 7 days; extend an active paid business | Trial end moved; paid business refused `not_extendable` | UI, SQL | P2 | Not run |
| F16-13 | GDPR still works when locked | Own | FX-LAPSED | — | Export a client | Works (rights do not depend on plan) | UI | P2 | Not run |
| F16-14 | Billing screen | Own | each fixture | — | Open Settings → Billing | Plan, status, trial / period end, staff per location vs cap, locations vs limit, add-ons, Contact us; Manager no access | UI | P1 | Not run |

## F17 Super admin
Code note: TOTP was removed on 2026-10-23 (founder decision). Access = profile flag + a **password** sign-in in the last 12 hours.
| ID | Title | Role | Plan / add-ons | Preconditions | Steps | Expected | Verify | P | Status |
|---|---|---|---|---|---|---|---|---|---|
| F17-01 | Password sign-in | SA | — | — | Sign in with password; open `/admin` | Admin area visible; AUD `admin.signed_in`; alert row queued (`admin_signin_alerts`) | UI, SQL | P0 | Not run |
| F17-02 | Non-password session refused (neg) | SA | — | Magic link or Google session | Open `/admin`; call an admin RPC | `/admin/sign-in-again`; RPC `reauth_required`; tenant tables empty for this session | UI, REST | P0 | Not run |
| F17-03 | 12-hour rule | SA | — | Session older than 12 h (or UT) | Use admin | Reauth required | UT `adminLogic`, SUITE 18 | P1 | Not run |
| F17-04 | Non-admin (neg) | Own | — | — | Open `/admin`; call `list_businesses` | Not found; `forbidden` | UI, REST | P0 | Not run |
| F17-05 | Businesses list | SA | — | — | Search by name, slug, owner email (≥2 chars); filter status / plan; next page | Correct results; FX-LAPSED shows as trial ended | UI | P1 | Not run |
| F17-06 | Business detail usage | SA | FX-TEAM | — | Open detail | Staff, branches, appts this month, invoices match SQL | UI, SQL | P1 | Not run |
| F17-07 | Lifecycle actions | SA | throwaway trial | — | Assign plan, set status, extend trial, toggle add-on (with notes) | Each works with confirm; audited; admin notes NOT in audit rows | UI, AUD | P0 | Not run |
| F17-08 | Prices | SA | — | Note current prices | Change Team monthly; check landing; revert | Landing shows new price; reverted after | UI, SQL | P1 | Not run |
| F17-09 | Support view | SA | FX-TEAM | — | Open support view twice | Read-only summary without client PII; audit row on every press; owner can see that support viewed | UI, AUD | P1 | Not run |
| F17-10 | Remove review | SA | FX-TEAM | — | Remove with reason | See F10-09 | UI | P2 | Not run |
| F17-11 | Industry presets | SA | — | — | Save a preset | Saves; no effect on signup (known gap) | UI | P2 | Not run |
| F17-12 | SMS credits / rates | SA | FX-TEAM | — | Add credits, set a rate | Saved, audited (SMS itself off) | UI, AUD | P2 | Not run |
| F17-13 | Add-on outside its plan | SA | FX-SOLO | — | Enable `custom_roles` on Solo | Accepted today (`available_plans` not checked) — record | UI, SQL | P2 | Not run |

## F18 Security: tenant isolation, RLS per role, public surface, rate limits, GDPR
| ID | Title | Role | Plan / add-ons | Preconditions | Steps | Expected | Verify | P | Status |
|---|---|---|---|---|---|---|---|---|---|
| F18-01 | Tenant isolation, all tables (neg) | Own of FX-OTHER | — | FX-TEAM data | REST SELECT every public table; RPCs with FX-TEAM ids (appointment, client, invoice, branch, staff, review, website) | 0 rows / `not_found` / `forbidden`; FX-TEAM rows unchanged | REST, SQL, SUITE 01 | P0 | Not run |
| F18-02 | Writes across tenants (neg) | Own of FX-OTHER | — | — | UPDATE / DELETE FX-TEAM rows via REST and RPCs | 0 rows affected; before = after | REST, SQL | P0 | Not run |
| F18-03 | RLS per role suites | — | DEV | — | Run suites 01, 02, 07, 21, 28, 31, 41, 43 | All green | SUITE | P0 | Not run |
| F18-04 | Anon surface | Anon | — | — | List anon-executable functions; REST SELECT on tables with anon key | Only `get_public_pricing`; no table readable except the public `reserved_slugs` list | SQL, REST | P0 | Not run |
| F18-05 | Public payloads are minimal | Anon | FX-TEAM | — | Inspect `get_booking_page`, `get_slots`, `get_website`, `manage_booking get` | Only services, staff display names, free slots, branch display info; no client data, no emails, no internal ids beyond needed | HTTP | P0 | Not run |
| F18-06 | Rate limits per endpoint (neg) | Anon | FX-TEAM | Fresh budget | Exceed each limit in `rate_limit_rules` once (spread over rounds) | 429 / `rate_limited`; counter survives (no rollback) | HTTP, SQL | P1 | Not run |
| F18-07 | Manage token scope (neg) | Guest | FX-TEAM | Token for appt A | Use it to cancel appt B | Refused; B unchanged; tokens stored only as hashes | HTTP, SQL | P0 | Not run |
| F18-08 | No secrets in the web bundle | — | build | `npm run build:web` | grep `dist/` for `service_role`, `sk_`, `RESEND`, `TWILIO`, private VAPID | Nothing found; only the publishable anon key | file grep | P0 | Not run |
| F18-09 | Security headers | Guest | build / host | Served build | Check `/today`, `/settings` → `X-Robots-Tag: noindex`; `/<slug>/book` → `frame-ancestors 'self'`; others `'none'` | Headers present | HTTP | P1 | Not run |
| F18-10 | Script injection everywhere (neg) | Guest, Own | FX-TEAM | — | `<img src=x onerror=alert(1)>` as client name, booking note, custom answer, review comment, service name | Shown as text in dashboard, emails, website, portal | UI, INBOX | P0 | Not run |
| F18-11 | Audit log visibility | Own, Mgr | FX-TEAM | Audit rows exist | Read audit_logs as Owner, Manager, FX-OTHER owner | Owner: own business only; others per scope; other tenant 0 | REST | P1 | Not run |
| F18-12 | GDPR data requests screen | Own | FX-BIZ | Portal request (F15-24) | Export → closes; another: Erase; another: Decline | Each closes the request; AUD `data_request.done/declined`; email forgotten on resolve | UI, SQL | P1 | Not run |
| F18-13 | Business erase | Own | throwaway business with files | — | Settings → Delete this business, type name | Storage emptied first, business + data gone, `erasure_log` row with ids/counts only, signed-in users stay; Manager cannot | UI, SQL | P0 | Not run |
| F18-14 | Delete my account | Own (sole), Rec | FX-TEAM | — | Sole owner tries; Rec deletes own account | Owner refused with business names; Rec removed, staff profile + appointments kept, sign-in fails | UI, SQL | P0 | Not run |
| F18-15 | Super admin flag cannot be self-set (neg) | Own | — | — | REST UPDATE `profiles.is_super_admin = true` | Refused | REST, SQL | P0 | Not run |
| F18-16 | Leaked-password protection | — | prod only | — | n/a on DEV (Pro feature) | Recorded for prod checklist | — | P2 | Not run |

## F19 Time and data correctness: UTC, branch timezone, DST, DB double-booking, minor units
| ID | Title | Role | Plan / add-ons | Preconditions | Steps | Expected | Verify | P | Status |
|---|---|---|---|---|---|---|---|---|---|
| F19-01 | Stored in UTC | Guest | FX-BIZ LDN | — | Book 10:00 London on a winter date and a summer date | `starts_at` = 10:00Z (GMT) and 09:00Z (BST) | SQL | P0 | Not run |
| F19-02 | US spring-forward day | Guest | FX-BIZ NYC, window 180 d | Hours 00:00-06:00 test staff that day | Open slots on 2027-03-14 | No 02:00-02:59 slots; 09:00 = 13:00Z; 01:30 then 03:00 adjacent | HTTP, SQL | P0 | Not run |
| F19-03 | EU spring-forward day | Guest | FX-BIZ LDN | — | Book 09:00 on 2027-03-28 | 08:00Z stored; displayed 09:00 everywhere (dashboard, email, manage page) | SQL, UI, OUT | P0 | Not run |
| F19-04 | Reminder across DST | — | FX-BIZ LDN | Appt 2027-03-29 10:00, reminder 24 h | Check outbox due time | Due 2027-03-28 10:00 London wall clock (09:00Z), not 24 real hours | SQL, SUITE 17 | P1 | Not run |
| F19-05 | Branch day boundaries | Rec | FX-BIZ TYO + NYC | Appts at 23:30 and 00:30 local | Today, reports, "whole day off" | Each counted on its local day | UI, SQL | P1 | Not run |
| F19-06 | DB exclusion constraints present | — | DEV | — | `pg_constraint` on appointments | Staff + time and resource + time EXCLUDE constraints (exclusive, not cancelled/no_show) | SQL | P0 | Not run |
| F19-07 | Parallel public bookings | Anon ×10 | FX-TEAM | Same slot | 10 simultaneous `create_booking` (distinct IPs/phones within limits) | Exactly 1 row; others `slot_unavailable` | HTTP, SQL, SUITE 09 | P0 | Not run |
| F19-08 | Dashboard vs public race | Rec + Guest | FX-TEAM | Same slot | Submit both at once | Exactly 1 row; no orphan client | UI, HTTP, SQL, SUITE 49 | P0 | Not run |
| F19-09 | Money in minor units | — | FX-BIZ | Invoices in GBP / USD / JPY | Check columns and UI | All `*_minor` bigint integers + currency; UI formats per currency exponent; no float anywhere | SQL, UI | P0 | Not run |
| F19-10 | Odd-offset timezone | Guest | throwaway branch Asia/Kathmandu (+05:45) | — | Book 10:00 local | Stored 04:15Z; slots on interval grid in local time | SQL | P2 | Not run |

## F20 Platform / UI: layouts, PWA, keyboard / back, i18n, empty / error / loading states
| ID | Title | Role | Plan / add-ons | Preconditions | Steps | Expected | Verify | P | Status |
|---|---|---|---|---|---|---|---|---|---|
| F20-01 | Layout per breakpoint | Own | FX-BIZ | — | Every main screen at 375, 800, 1440 | <768 bottom tabs (Today, Calendar, Clients, More); 768-1023 sidebar; ≥1024 sidebar + header; drawers full-screen on mobile, 480 px on desktop | UI | P0 | Not run |
| F20-02 | No horizontal scroll | any | all | — | Every screen at 320 and 375 | No page-level horizontal scroll; text not clipped | UI | P1 | Not run |
| F20-03 | Deep links after hard refresh | Own | FX-TEAM | Served build | Reload `/clients/<id>`, `/settings/booking`, `/e2e-team/book`, `/e2e-team/manage#token=` | Each loads its own screen (host rewrite to shell works); no bounce to `/` | UI | P0 | Not run |
| F20-04 | Signed-in `/` | Own | — | Signed in | Open `/` | Landing with signed-in header → `/today` button | UI | P2 | Not run |
| F20-05 | PWA install | Own | — | Android Chrome, iPhone Safari | Install; open from home screen | Opens `/today` standalone; icons ok; iOS shows Add-to-Home hint | UI (real devices) | P1 | Not run |
| F20-06 | Update toast | Own | — | Installed / open tab; new build deployed | Return to app | "New version" toast; reload gets new build | UI | P1 | Not run |
| F20-07 | Offline screen | Own, Guest | — | DevTools offline | Go offline on app and on `/book`; press Retry online | Full-screen "No internet connection" with Retry; recovers | UI | P1 | Not run |
| F20-08 | Back behaviour | Own | — | Drawer / dialog open | Browser Back, Escape, Android Back (reviewed in code) | Closes the top overlay first; dirty forms confirm | UI | P1 | Not run |
| F20-09 | Keyboard on mobile web | Rec | — | 375 emulation + real phone | Fill client form, booking form | Focused input stays visible; Enter submits / next | UI | P2 | Not run |
| F20-10 | i18n: no hard-coded strings | — | repo | — | Grep `app/` + `src/` for user-facing literals in JSX; run lint; scan UI for raw keys like `appointments.errors.` | None found; plurals right (1 appointment / 2 appointments); dates and money via `lib/time` / `lib/money` | UT, grep, UI | P1 | Not run |
| F20-11 | RTL / Unicode readiness | Guest | FX-TEAM | C-RTL | Book with an Arabic name | Name renders correctly in dashboard, email, manage page | UI, INBOX | P2 | Not run |
| F20-12 | Empty, loading, error states | Own | empty fixture | — | Every list empty; throttle network; block one request | Empty state with action on every list; skeletons (no list spinners); error state with Retry | UI | P1 | Not run |
| F20-13 | No raw server text | Own, Rec | FX-TEAM | — | Trigger known refusals (duplicate phone, cap, slot taken, locked currency) | Friendly translated message every time | UI | P1 | Not run |
| F20-14 | Touch targets and focus | any | — | 375 + keyboard on desktop | Tab through a form; measure small icons | ≥44 px hit areas; visible focus ring on web | UI | P2 | Not run |
| F20-15 | Native apps | — | — | — | Android: written review only; iOS: not runnable here | Recorded as "reviewed in code, not run" | code review | P2 | Not run |

## F21 OFF-at-launch features: SMS, embed widget (+ Google sign-in, self-service billing flags)
| ID | Title | Role | Plan / add-ons | Preconditions | Steps | Expected | Verify | P | Status |
|---|---|---|---|---|---|---|---|---|---|
| F21-01 | SMS hidden in the app | Own, Mgr | FX-BIZ | Production-like build (no flags) | Settings hub, Notifications, `/settings/sms-credits`, role matrix, message preview | No SMS card; "coming soon" text instead of toggle; credits URL redirects to `/settings`; `sms.*` hidden in matrix; no SMS preview | UI | P0 | Not run |
| F21-02 | SMS blocked on the server (neg) | Mgr | FX-BIZ | — | REST UPDATE `notification_settings.sms_enabled = true`; book for C-NOMAIL | Record whether the API accepts it (code: accepted). With no Twilio secret no SMS may leave: outbox row skipped / not claimed, no credit debit | REST, SQL, OUT | P0 | Not run |
| F21-03 | Widget tab hidden | Own | FX-BIZ | Production-like build | Website editor | No Widget tab | UI | P0 | Not run |
| F21-04 | Booking page cannot be framed (neg) | Guest | FX-BIZ | Served with `vercel.json` headers | Embed `/e2e-multi/book` in an iframe on another origin; load `public/widget.js` from a test page | Browser refuses the frame (CSP frame-ancestors 'self'); widget shows nothing | UI | P0 | Not run |
| F21-05 | Widget backend still answers | Own, Anon | FX-BIZ | — | REST `ensure_widget_key`; HTTP `validate_widget validate` from an allowed origin | Record what answers (code: works for Team+). Decide if a server-side launch switch is needed | REST, HTTP | P1 | Not run |
| F21-06 | No promises on public pages | Guest | — | — | Landing, website, booking emails, legal pages | No SMS, widget, online payment, custom domain claims | UI | P1 | Not run |
| F21-07 | Self-service billing hidden | Own | FX-TEAM | Build without `EXPO_PUBLIC_BILLING_CHECKOUT` | Billing screen; trial-ended lock screen | No checkout / "Choose a plan"; Contact us only | UI | P0 | Not run |
| F21-08 | Google button hidden | Guest | — | Build without `EXPO_PUBLIC_GOOGLE_SIGNIN` | `/login`, `/signup` | No Google button | UI | P1 | Not run |

## F22 Account self-service (found in code: `context/account.md`)
| ID | Title | Role | Plan / add-ons | Preconditions | Steps | Expected | Verify | P | Status |
|---|---|---|---|---|---|---|---|---|---|
| F22-01 | Change password | Rec | FX-TEAM | Signed in on 2 browsers | Wrong current password; then correct | Wrong refused; success keeps this device, signs out the other; AUD `account.password_changed` | UI, AUD | P1 | Not run |
| F22-02 | Change email | Rec | FX-TEAM | Real inbox | Request change; confirm link | Pending state + resend; after confirm `profiles.email` updated | UI, INBOX, SQL | P1 | Not run |
| F22-03 | Public delete-account page | Guest | — | — | Open `/delete-account` | Explains steps + what is kept; reachable signed out | UI | P1 | Not run |
| F22-04 | Delete account via typed URL by Staff | Stf | FX-TEAM | — | Type `/settings/delete-account`; delete with password | Works (see F03-16 for the missing menu path) | UI, SQL | P1 | Not run |

## F23 Self-service billing with Polar (found in code; OFF at launch, DEV sandbox only)
Run only if you want the flag tested before it is switched on. Uses the Polar **sandbox** on DEV and test card 4242.
| ID | Title | Role | Plan / add-ons | Preconditions | Steps | Expected | Verify | P | Status |
|---|---|---|---|---|---|---|---|---|---|
| F23-01 | Checkout a plan during trial | Own | trial | Build with `EXPO_PUBLIC_BILLING_CHECKOUT=1`, web | Billing → Team yearly → pay | Webhook applies Team, `billing_source = polar`, remaining trial days kept | UI, SQL | P1 | Not run |
| F23-02 | Add-on checkout | Own | Team via Polar | — | Buy `custom_roles` | Same Polar customer; add-on on with `access_until` | UI, SQL | P2 | Not run |
| F23-03 | Change plan / seats / cancel / portal | Own | Polar business | — | Each action | Applied once; audit `billing.subscription_updated` | UI, SQL, AUD | P2 | Not run |
| F23-04 | Bad webhook (neg) | Anon | — | — | POST `polar_webhook` with a wrong signature / replayed id | 4xx/5xx; nothing applied; replay deduped | HTTP, SQL | P1 | Not run |
| F23-05 | Only the Owner can buy (neg) | Mgr | Polar business | — | Call `billing` Edge Function | Refused | HTTP | P1 | Not run |
| F23-06 | Nightly reconcile | — | — | Polar secrets set | Check `billing-reconcile` run | Succeeded, no drift | SQL | P2 | Not run |

---

## Summary per flow
| Flow | Cases | | Flow | Cases |
|---|---|---|---|---|
| F01 New owner → trial | 21 | | F13 Commission | 8 |
| F02 Business setup | 23 | | F14 Custom roles | 10 |
| F03 Team and roles | 19 | | F15 Add-ons ON / OFF | 26 |
| F04 Public booking | 30 | | F16 Plans and lifecycle | 14 |
| F05 Daily operations | 20 | | F17 Super admin | 13 |
| F06 Clients | 11 | | F18 Security | 16 |
| F07 Money | 18 | | F19 Time and data | 10 |
| F08 Reports | 12 | | F20 Platform / UI | 15 |
| F09 Notifications | 18 | | F21 OFF at launch | 8 |
| F10 Reviews | 9 | | F22 Account (extra) | 4 |
| F11 Website | 12 | | F23 Polar billing (extra, flag OFF) | 6 |
| F12 Multi-branch | 11 | | **Total** | **334** |

## Recommended test rounds
| Round | Content | Why first |
|---|---|---|
| 0 Health + fixtures | Network access to DEV; F09-17 cron health, F18-03 RLS suites, F18-04 anon surface, F19-06 constraints, F18-08 bundle secrets, `npm test`; build fixtures (this also runs F01 for FX-SOLO and F17-07 for plans) | Cheap, no UI; proves the ground is solid before clicking |
| 1 Money path (P0) | F01, F02, F04, F05, F07, F19 | A business must be able to sign up, get booked and get paid correctly |
| 2 Access and isolation (P0) | F03, F06, F12-09, F14, F18 | Data leaks are the worst launch failure |
| 3 Plans, admin, OFF features | F16, F17, F21 | Billing lock and hidden features decide what customers can reach |
| 4 Communication and growth | F09, F10, F11, F12, F08, F13 | Emails, reviews, website, multi-branch, reports |
| 5 Add-ons and account | F15, F22 | Paid modules; account deletion (store rule) |
| 6 Platform + P2 sweep | F20, all remaining P2, F23 (optional) | Layout / PWA polish, then everything else |
| Re-test | Every failed case after its fix, plus the P0 set of the touched flow | — |

Rate-limit budget: spread public-booking-heavy cases (F04, F19-07, F18-06) across rounds or fixtures; do not clear DEV counters without asking.
