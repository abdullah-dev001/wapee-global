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
