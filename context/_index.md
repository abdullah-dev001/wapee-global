# Context index

One file per feature with its current state (CLAUDE.md §13). Read the feature file before touching its code.

Shared files:

- [_handoff.md](_handoff.md): **start here** — what is done, what is next, traps and commands
- [_foundation.md](_foundation.md): project setup, theme, providers, env, query, supabase client, i18n, PWA, scripts
- [_database.md](_database.md): tables, RLS helpers, branch-owned settings, migration list

| Feature | File | Status | Phase | Summary |
| ------- | ---- | ------ | ----- | ------- |
| Auth | auth.md | done (Phase 1 scope) | 1 | Login, signup, verify, password reset, session + route guard |
| Onboarding | onboarding.md | done (Phase 1 scope) | 1 | Business creation wizard, signup RPC, 14-day trial, branch-owned locale |
| Roles & permissions | roles.md | DB + app gating done | 1 | Catalogue, 4 system roles, scope-aware checks, `usePermission`/`useFeature`, nav + route gating |
| Members & invites | members.md | done (Phase 1 scope) | 1 | Team list, invite with role + branch, one-time 7-day link, accept screen |
| Billing & trial lock | billing.md | trial lock + banner done; plans Phase 8 | 1 | Inactive business locks the app; Settings/Billing/More stay reachable; 3-day warning banner |
| Services (catalogue) | services.md | done (Phase 2 scope) | 2 | Categories, services, per-branch prices, resources |
| Staff | staff.md | done (Phase 2 scope) | 2 | Staff profiles (login optional), branch + service assignment |
| Schedule | schedule.md | done (Phase 2 scope) | 2 | Working hours, breaks, time off, branch hours, holidays, rooms |
| Booking settings & form | booking-settings.md | DB + UI done | 3 | Per-branch settings (doc §6.2) + form builder, live preview, warnings, booking link |
| Booking engine | booking-engine.md | backend complete, public UI done | 3 | Clients, appointments, no-double-booking, DST-correct slot engine, `create_booking` |
| Booking public API | booking-public-api.md | deployed + verified | 3 | 5 Edge Functions, rate-limited and bot-protected — the only public path |
| Booking public page | booking-public-page.md | done | 3 | `(public)/[slug]` booking flow: service → staff → slot → form → confirmation |
| Guest manage page | booking-manage.md | done | 3 | `(public)/[slug]/manage` — view, cancel, reschedule a booking by token |
| Dashboard appointments | appointments.md | backend done + closure round + B1/B2 fixes | 4 | create/update/cancel/no-show/complete/approve/reopen, list + calendar RPCs, Realtime (RLS proved live) |
| Dashboard appointments UI | appointments-ui.md | done (B1 + B2 fixes), sim-tested | 4 | Calendar screen (Day/Week/List), create/detail drawers, shared scheduler |
| Clients | clients.md | done (part B2) | 4 | Client list (search, pagination, archive), create/edit, profile (contact/notes/upcoming/history) |
| Today | today.md | done (part B2) | 4 | Mobile home: today's appointments, counts, quick actions |
| Invoices (backend) | invoices.md | backend done, no UI | 5A | Draft→issued invoices, gapless numbers, tax snapshot, payments, credit notes, reversals, list/print RPCs, basic reports |
| Website, reviews, widget | website-reviews-widget.md | backend + UI done | 7A/7B | Public website at `/<slug>` (booking moved to `/<slug>/book`), editor, reviews screen + review page, widget settings + embed gate, 4 Edge Functions, assets bucket |
| Packages & Sessions | packages-sessions.md | backend + UI done | 10A | Add-on: package definitions, sold as invoice lines at issue, session deduct/undo/reverse (immutable, concurrency-safe), balance on client + appointment |
| Inventory | inventory.md | backend + UI done | 10A | Add-on: products, immutable stock movements, stock drops at invoice issue and is restored by an exhausting credit note, low-stock badge + push/email alert |
| Notifications | notifications.md | backend + UI done, deployed | 6A/6B | Outbox, Resend email, Twilio SMS + credits, Expo push, reminders (pg_cron), unsubscribe, 3 Edge Functions, settings/credits/log/push screens |
