# Onboarding
Status: in progress · Phase: 1 · Last updated: 2026-10-14

## What it does
After a verified signup with no business, the owner creates one: name, booking
address (slug), industry, then country / currency / timezone and the first
location. Creating it starts the 14-day trial and makes them Owner.

## Business rules
- **One business per self-serve signup.** `create_business_with_owner` refuses a second (the owner can still be invited into others).
- Slug must pass format, length, the reserved list and uniqueness. Checked live in the form **and** enforced by the DB (`is_slug_available`, the reserved-slug trigger, CHECK constraints).
- The slug is suggested from the business name until the owner edits it; after that it is left alone.
- **Country, currency and timezone belong to the FIRST BRANCH**, not the business (decision 23). Step 2 is "Your first location" and says so, because other locations can differ.
- **Any country in the world can be chosen** (280 ISO countries), with **162 currencies** and **418 IANA timezones**. The 37-row table in `countries.ts` only PRE-FILLS currency and timezone; it never limits the choices. A country not in the table gets no pre-fill and the owner picks both.
- The branch gets an **invoice prefix** derived from the location name (first 3 letters, uppercased, suffixed on collision), unique within the business.
- Multi-timezone countries (US, Canada, Brazil, Australia, Mexico, Indonesia, Russia) list their main zones first in the picker, with every other zone below.
- Currency is hard to change later (invoices), so the form warns about it.
- Trial = 14 days, `status = 'trialing'`, `plan = null`. The trial gets Business-level features (agreed); the real plan is assigned by super admin.
- First branch is `is_primary`, named after the business unless a name is given.
- `profiles.default_business_id` is set, so the next sign-in opens this business.

- **Optional "How many people work here?"** (step 1, 2026-10-24): `TeamSizeQuestion` + pure `suggestPlan.ts`. Answers are built from the live plans' `staff_cap` (`teamSizeOptions`: one band per plan, e.g. Just me / 2 to 5 / 6 or more), so no size is hard-coded; hidden while `get_public_pricing` loads or fails. With no landing pick the answer is saved as the plan intent (`source: team_size`, monthly) for the Billing preselect; a landing pick wins and a soft warning shows when its cap is below the answer (`pickBelowTeamSize`). Not part of the form, not sent to the server, trial unchanged.

## Files
| Path | Purpose |
|---|---|
| app/(auth)/onboarding.tsx | Two-step wizard |
| src/features/onboarding/api/useBusiness.ts | `useMyBusinesses`, `useSlugAvailable`, `useCreateBusiness` |
| src/features/onboarding/schemas/onboarding.schemas.ts | zod schema + `slugify()` |
| src/features/auth/deletedAccount.ts | `isDeletedUserError()`, `useDeletedAccountNotice` — a deleted-user FK violation, same pattern as `accountDisabled.ts` |
| src/features/onboarding/components/TeamSizeQuestion.tsx | Optional team-size question + plan suggestion / note |
| src/features/onboarding/suggestPlan.ts (+ test) | `teamSizeOptions`, `pickBelowTeamSize` |
| src/config/countries.ts | Pre-fill defaults + `timezoneOptionsFor()` |
| src/config/localeData.generated.ts | GENERATED full lists: 280 countries, 162 currencies, 418 timezones |
| scripts/generate-locale-data.mjs | Regenerates that file from Node's ICU |
| src/components/ui/Select.tsx | Picker primitive (sheet based) |
| src/hooks/useDebounce.ts | Debounce for the slug check |

## Database
- RPC `create_business_with_owner(name, slug, country, currency, timezone, language, industry, branch_name) -> uuid`
  One transaction: business + first branch (**which owns country/currency/timezone and gets an invoice prefix**) + Owner membership + role assignment + `default_business_id` + audit row. The same locale values are copied to the business `default_*` columns to pre-fill a second location. Any failure rolls back everything.
- RPC `suggest_invoice_prefix(business_id, name) -> text` — a short unique prefix from a location name.
- RPC `is_slug_available(slug) -> boolean` — format, reserved list and uniqueness in one call.
- RPC `write_audit_log(...)` — the only way to write `audit_logs` (no INSERT policy).
- Migrations: `20261002093000_create_business_with_owner.sql`, `20261002094000_fix_role_guard_allow_first_owner.sql`

## Data & caching
`useMyBusinesses` uses key `['businesses','mine']` with `staleTime` = list (30s);
`useCreateBusiness` invalidates it so the gate re-reads immediately. Slug checks
are debounced 400ms and cached briefly.

## Permissions & gating
Creating a business needs only a signed-in, verified user. The founding Owner
assignment is the one case exempt from the escalation guard (see below).

## UI
`AuthLayout` card, two steps with a "Step n of 2" footer. `Select` opens a sheet
on every platform rather than a native picker, so the three platforms match.

## i18n
Namespace `common`, key `onboarding.*`.

## Known limits / TODO
- Industry presets (starter custom fields, terminology, website template) are **not** built; only the industry key is stored. Preset content is defined by the owner outside development (product doc §3).
- Country/currency/timezone lists are a **build-time snapshot** of Node's ICU data, because **Hermes has no `Intl.Locale` or `Intl.supportedValuesOf`** (verified on device — they exist in Node and browsers but are `undefined` on native). Re-run `node scripts/generate-locale-data.mjs` after a Node upgrade. Names are English-only for now; translating them needs a per-language snapshot.
- No business switcher yet; `default_business_id` is set but nothing reads it for switching.
- Adding a SECOND location is not built yet (Phase 9 multi-branch UI); the schema already supports it.

## Changelog
- 2026-10-24: Optional team-size question suggesting a plan (see Business rules).
- 2026-10-14: QA audit (feature 3) + FIX a real production bug. **Root cause confirmed live against dev** (throwaway `set_config('request.jwt.claims', ...)` call inside a rolled-back transaction, no data left behind): a stale browser session whose `auth.users`/`profiles` row was deleted elsewhere (JWT stays cryptographically valid for its own lifetime regardless) hits `businesses_created_by_fkey` on the INSERT inside `create_business_with_owner` — confirmed exact text `insert or update on table "businesses" violates foreign key constraint "businesses_created_by_fkey"`, SQLSTATE `23503`. Previously this surfaced as raw DB text via `error.message`. **Fix**: new `isDeletedUserError()` (`src/features/auth/deletedAccount.ts`) matches the stable `code: '23503'` plus the constraint name in `message`/`details`; `onboarding.tsx`'s submit handler now catches it specifically, signs out locally (`scope:'local'` — a global sign-out could itself fail against the same missing user row, and must not be what the redirect depends on), and sends the user to `/login` with a clear, translated `auth.accountDeleted` message (same "notice survives the sign-out → redirect" pattern as `useDisabledNotice`, new sibling `useDeletedAccountNotice`). Scoped narrowly to this one constraint, not a blanket "any FK violation signs you out." 5 new unit tests. **Everything else audited and found correct, no other bugs**: `create_business_with_owner` (read in full, both the original and the Phase-2 redefinition in `20261002120000_branch_owns_locale_and_tax.sql` that actually runs today) correctly does business + branch (with `invoice_prefix` via `suggest_invoice_prefix`, country/currency/timezone on the BRANCH) + Owner membership + role assignment + `default_business_id` + audit row, all in one transaction, refuses a second business per user (`23505`) and an unavailable slug (`23514`) before any write; the founding-Owner escalation-guard exemption is correctly narrow (only the first role assignment in a business). Double-submit is blocked at the UI (`Button`'s `loading` prop disables presses) and would be refused server-side anyway even in a genuine race. A user who already has a business visiting `/onboarding` directly is correctly redirected to `/` by `authGateDecision()`; a user with a pending (unaccepted) invite visiting `/onboarding` is unaffected — the two flows are independent, invite acceptance only adds a `business_members` row. **`industry_presets` is empty on both dev and prod (confirmed live)** — not a bug: onboarding's industry step uses a hardcoded `INDUSTRY_KEYS` list and never queries that table at all; `industry_presets`/terminology are admin-only editing surfaces for a future feature, not read anywhere at signup. i18n complete (every `onboarding.*` key the screen uses exists in `common.json`); no raw strings. 812/812 full suite green, tsc/lint clean. **No migration** — the fix is entirely client-side. **Not verified live in a browser** — no browser tool this session; the FK scenario itself WAS verified live via SQL (see above), just not clicked through in the actual app UI.
- 2026-10-02: Step 2 is now "Your first location": the branch owns country, currency and timezone. Fixed a render loop in `Select` (an inline `onDismiss` re-ran `useOverlayDismiss`'s effect every render); the hook now holds the callback in a ref so any caller is safe.
- 2026-10-02: Country/currency/timezone selects now use the full ICU lists (280/162/418); the table only pre-fills. Multi-zone countries show their main zones first.
- 2026-10-02: Signup RPC + two-step wizard. Verified end to end on web: gate redirects to onboarding, slug suggestion and live availability work, business created with 1 branch and 1 member, trial ends in 14 days, owner then lands in the app.
