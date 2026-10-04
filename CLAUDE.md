# CLAUDE.md — Wapee

**Wapee**: international appointment-booking SaaS (salons, clinics, barbers, etc.). One **Expo** codebase → Android app, iOS app, web/PWA. Backend: **Supabase**.
Release: Android + PWA first, iOS later — **code must be production-perfect for iOS from day one** (zero rework). Every screen is built for Android, iOS and web (mobile + tablet + desktop).

Source of truth: `docs/Wapee_Product_Overview_v2.md` (rules), `docs/Wapee_Build_Plan.md` (phases), `docs/DESIGN_GUIDE.md` (design), `context/` (state of each built feature).
If code and these docs disagree, **stop and ask**.

## Reference docs (read `docs/reference/X.md` only when the task touches it)
- `design-system.md` — colour tokens, type/shape/motion, component specs, reusable component rules (any UI work)
- `platform.md` — breakpoints, safe areas, system bars, back/keyboard, testing matrix, screenshot rules, Android review checklist
- `pwa.md` — manifest, service worker, install hint · `push.md` — push tables, Expo/Web Push, `send-push`
- `data-caching.md` — server-side pagination/search rules, TanStack Query keys, staleTime, invalidation, realtime
- `context-files.md` — context file rules + template (only when creating a feature file)

## 1. Working rules (STRICT)
0. **Read context first.** Read `context/_handoff.md` and the ONE `context/<feature>.md` for the feature. Do not read other context files; use `grep` for anything else. Open code only for files you change, or if the context file is missing/wrong.
1. **Todo list first** (TaskCreate / TodoWrite), small steps. Last todo is always "Update context file(s)".
2. **One task at a time.** In progress → finish → verify → complete → next.
3. **Stop on real doubt, not small things.**
   - **STOP and ask** (short question + recommended option) for: product behaviour, data model/migrations, permissions/security, money, UI flow, new dependency, anything destructive. Never guess.
   - **Do NOT stop** for small technical choices covered here or by obvious best practice; pick one and list it in the report.
   - Ask all questions together at the start of a task.
4. **Stay in scope.** No extra features or "while I'm here" refactors; list them as suggestions.
5. **Reuse before you create.** Search for an existing component/hook/util/query first.
6. **Verify before done.** `npx tsc --noEmit`, lint, check the affected screen/function. DB changes: migration applied + types regenerated.
7. **End-of-task report** (short): files changed, migrations, open items, next step.
8. Talk to the user in simple, clear English. Short.
9. Never delete data, drop tables/columns or run destructive commands without explicit confirmation.
10. Never commit secrets (.env, keys, service role, tokens).
11. **Heavy checks only when needed.** The written Android code review, the smoke test (`npm run smoke:public`) and the SQL suites are NOT run on every task. Run them only at the END of a phase, or when the task touches that area (Android-specific UI / public endpoints / DB or RPC changes).
12. **UI tasks need real screenshots** at mobile (~375) and desktop (1440) before done (details in `platform.md`). Simulator: **do not try to tap it**; use screenshots and deep links only. If login is needed and you have no credentials, ask. Android is never run here: say "reviewed in code, not run".

## 2. Tech stack (no new libraries without asking: say why + name the alternative)
Expo (latest stable) + **Expo Router** + React Native Web, TypeScript **strict** · Supabase (Postgres, Auth, Storage, Realtime, Edge Functions/Deno) · **@tanstack/react-query** (all server state) · Zustand (small client-only UI state; never server data) · react-hook-form + zod · i18next + react-i18next + expo-localization · **lucide-react-native** only (stroke 1.75, sizes 14/16/18/20/22) · DM Sans (@expo-google-fonts/dm-sans) · date-fns + date-fns-tz · Resend (email) and Twilio (SMS), Edge Functions only · Push: Expo push (Android/iOS), Web Push VAPID (web) · react-native-safe-area-context, expo-status-bar, expo-navigation-bar, keyboard-controller (or KeyboardAvoidingView — ask) · Charts: one lib for web+native (ask before choosing).

## 3. Folder structure
```
app/            # Expo Router routes only (thin): (auth) (app) (public)/[slug] (portal) (admin)
src/
  components/ui/ layout/ shared/   # primitives / Screen, AppShell, PageContainer… / composites
  features/<feature>/ api/ components/ schemas/ types.ts
  lib/ supabase/ query/ i18n/ theme/ time/ money/ permissions/ push/
  hooks/   config/brand.ts         # brand.ts = the ONLY place the name "Wapee" lives
supabase/ migrations/ functions/ seed.sql tests/
public/ (PWA)   docs/ (read-only unless asked)   context/ (_index, _foundation, _database, _handoff, <feature>.md)
```
Routes stay thin; business logic in `features/`. No file over ~300 lines.

## 4. Hard rules
**Platform/UI**
- Mobile is the primary design (<768 bottom tabs, 768–1023 sidebar, ≥1024 sidebar+header). Use `useBreakpoint()`; never branch on `Platform.OS` for layout. Touch targets ≥ 44px.
- Every screen uses the shared `Screen`/`PageContainer`; safe areas via `useSafeAreaInsets()`, never fixed values. Bottom spacing always adds `insets.bottom`.
- Never hard-code colour, font size, spacing, radius, shadow (use `theme.*`, `shadow()`). Primitives in `components/ui`, composites in `components/shared`; no one-off styled buttons/inputs/cards.
- Skeleton loaders, empty states on every list, error state with retry on every query. No dark mode.

**Database / Supabase**
- Every DB change = a migration file in `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql` written FIRST, applied exactly as written, types regenerated into `src/lib/supabase/database.types.ts`, advisors run. Never change schema with `execute_sql`/dashboard (read-only checks only). Never edit an applied migration. Destructive changes → ask first. Each migration includes tables, indexes, constraints, **RLS + policies**, triggers, grants.
- Tenant tables: `business_id` (+ `branch_id`), `created_at`, `updated_at`, `deleted_at`, `created_by` where useful. **RLS ON for every table**, policies via helpers (`is_member`, `has_permission`). UI hiding is never the boundary.
- Times: `timestamptz` UTC; branch `timezone` (IANA); slot math respects DST. Money: integer minor units (`amount_minor bigint`) + `currency`; never floats.
- **No double-booking**: Postgres exclusion constraints (staff + time, resource + time).
- Booking-page previews must NEVER re-implement buffer, minimum-notice, booking-window or capacity rules; those live only in the slot engine (`get_free_slots` / `create_booking`). Previews show labelled sample times or call the engine.
- Financial records are **immutable** (credit notes / reversal rows). Invoice numbers `<branch prefix>-<n>`, gapless per branch (DB). Prefix unique per business, fixed after first invoice.
- Country, currency, timezone, address, tax belong to the **BRANCH** (business keeps only `default_*`). Branch currency is fixed once it has an invoice/payment. "Today", slots, reminders use branch timezone.
- Reports never add different currencies (group by currency). Audit-log: role changes, financial actions, soft deletes, super-admin access.
- Index every FK and filter/sort column; `pg_trgm` for text search. Atomic/heavy work → RPC or Edge Function. Secrets only in Edge Function secrets; service role key never in the app.
- **All** pagination, filter, sort, search server-side (page 20, max 100, search ≥2 chars debounced 300ms, no `select('*')` in lists). Every read via a hook in `features/<x>/api/` (TanStack Query, key factory scoped by business/branch); no Supabase calls in components. Clear query cache on logout/business switch. Details: `data-caching.md`.

**Permissions** — `area.action` + scope (Own/Branch/All); catalogue in product doc §9. Enforce in RLS, Edge Function/RPC and UI (`usePermission`). Plan/add-on gating via `useFeature`; off = hidden and blocked.

**i18n** — zero hard-coded user strings (`t('feature.key')`, English base); plurals/interpolation, no concatenation; dates/numbers/money via `lib/time` / `lib/money`; RTL-ready (`start`/`end`); product name only from `config/brand.ts`.

**Forms** — react-hook-form + zod schema in `features/<x>/schemas/`; server validates again. Field errors under field, disable submit while submitting, toast result. Phone = `PhoneInput`, E.164. Email optional unless doc says otherwise.

**Code** — no `any`, no `@ts-ignore` without comment, generated Supabase types only, functional components, `PascalCase.tsx` / `useXxx.ts` / `camelCase.ts` / `snake_case` SQL, no `console.log`, no raw-value inline styles, never swallow errors.

**Security checklist (every feature)** — RLS tested per role (owner, manager, receptionist, staff, other business); permission checked in Edge Function/RPC; public endpoints rate-limited and minimal; private files via short-lived signed URLs; sensitive client fields gated by `clients.view_sensitive`; no secrets in client.

**Context files** — any feature change updates `context/<feature>.md` in the same task (current state, changelog one line); migration → `_database.md`; new shared component/hook/util → `_foundation.md`. Task is not done until they match the code. Template: `context-files.md`.

## 5. Testing rules (STRICT)
**Every mutating RPC needs a test proving the original data survives EVERY failure path** — assert the row is exactly as it was, not just that an error returned.

**Validation must finish before any mutation.** In PL/pgSQL a `RETURN` does **not** roll anything back; only an exception does. Broken shape (shipped once in `reschedule_booking`, caught by one assertion):
```sql
update appointments set status = 'cancelled' where id = v_id;  -- "free the slot"
if slot_is_taken then return jsonb_build_object('ok', false, 'code', 'slot_unavailable'); end if;  -- BUG
```
Pattern: (1) read and validate everything first (permissions, state, windows, capacity); (2) return every failure **before** the first write; (3) mutate once, as late as possible, ideally one statement; (4) if a check needs the new state, use the exclusion constraint as backstop and catch its exception — never mutate to make a query come out right (`reschedule_booking` excludes the row from its own collision check with `a.id <> v_id`).

Also:
- A public RPC behind a rate limiter must **return** `{ok:false,code}`, never raise (a raise rolls back the counter it just incremented — the `accept_invite` trap).
- Assert on **stored values**, not only return codes (`create_booking` discarded its own answer normalisation while the code looked fine).
- Test every new trigger against `delete from businesses`; a tenant-action guard also fires on the tenant-delete cascade.

## 6. Git workflow (STRICT)
- Remote `origin` = `https://github.com/abdullah-dev001/wapee-global.git`. Work only on **`dev`**; never commit to `main`, never force-push or rewrite pushed history.
- After each verified task (context updated): `git status` (no secrets, `.env`, `ios/`, `android/`, `dist/`, `node_modules/`), typecheck + lint pass, Conventional Commit (`feat(ui): …`, `fix(web): …`, `db: …`), then `git push origin dev`. Migration + regenerated types go in the same commit as the code using them. If a push fails, stop and tell the user.
- Merge `dev` → `main` only when the user says so: `git checkout main && git pull origin main && git merge --no-ff dev -m "merge: dev into main (<summary>)" && git push origin main && git checkout dev`. Never delete branches/tags/remote history without confirmation.

## 7. Do NOT
- Build anything out of scope in the product doc (waitlist, custom domain/SSL, online payments, dark mode, drag-and-drop calendar, recurring or multi-service bookings, marketing email).
- Hard-code colours, strings, product name, timezones or currencies. Fetch everything and filter client-side. Change the DB without a migration. Duplicate an existing component. Continue past a doubt. Finish without updating context files. Commit to `main`, force-push, or push secrets.
