# Onboarding
Status: in progress · Phase: 1 · Last updated: 2026-10-02

## What it does
After a verified signup with no business, the owner creates one: name, booking
address (slug), industry, then country / currency / timezone and the first
location. Creating it starts the 14-day trial and makes them Owner.

## Business rules
- **One business per self-serve signup.** `create_business_with_owner` refuses a second (the owner can still be invited into others).
- Slug must pass format, length, the reserved list and uniqueness. Checked live in the form **and** enforced by the DB (`is_slug_available`, the reserved-slug trigger, CHECK constraints).
- The slug is suggested from the business name until the owner edits it; after that it is left alone.
- **Any country in the world can be chosen** (280 ISO countries), with **162 currencies** and **418 IANA timezones**. The 37-row table in `countries.ts` only PRE-FILLS currency and timezone; it never limits the choices. A country not in the table gets no pre-fill and the owner picks both.
- Multi-timezone countries (US, Canada, Brazil, Australia, Mexico, Indonesia, Russia) list their main zones first in the picker, with every other zone below.
- Currency is hard to change later (invoices), so the form warns about it.
- Trial = 14 days, `status = 'trialing'`, `plan = null`. The trial gets Business-level features (agreed); the real plan is assigned by super admin.
- First branch is `is_primary`, named after the business unless a name is given.
- `profiles.default_business_id` is set, so the next sign-in opens this business.

## Files
| Path | Purpose |
|---|---|
| app/(auth)/onboarding.tsx | Two-step wizard |
| src/features/onboarding/api/useBusiness.ts | `useMyBusinesses`, `useSlugAvailable`, `useCreateBusiness` |
| src/features/onboarding/schemas/onboarding.schemas.ts | zod schema + `slugify()` |
| src/config/countries.ts | Pre-fill defaults + `timezoneOptionsFor()` |
| src/config/localeData.generated.ts | GENERATED full lists: 280 countries, 162 currencies, 418 timezones |
| scripts/generate-locale-data.mjs | Regenerates that file from Node's ICU |
| src/components/ui/Select.tsx | Picker primitive (sheet based) |
| src/hooks/useDebounce.ts | Debounce for the slug check |

## Database
- RPC `create_business_with_owner(name, slug, country, currency, timezone, language, industry, branch_name) -> uuid`
  One transaction: business + first branch + Owner membership + role assignment + `default_business_id` + audit row. Any failure rolls back everything.
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

## Changelog
- 2026-10-02: Country/currency/timezone selects now use the full ICU lists (280/162/418); the table only pre-fills. Multi-zone countries show their main zones first.
- 2026-10-02: Signup RPC + two-step wizard. Verified end to end on web: gate redirects to onboarding, slug suggestion and live availability work, business created with 1 branch and 1 member, trial ends in 14 days, owner then lands in the app.
