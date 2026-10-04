# Context files: rules and template

Moved from CLAUDE.md §13. Read only when creating a new context file.

Purpose: any future session understands a feature by reading **one short file**, not the whole code.

**When:**
- New feature started → create `context/<feature>.md` from the template below and add it to `context/_index.md`.
- Any change to a feature (code, DB, rules, UI) → update its context file **in the same task**, before marking the task done.
- Any migration → also update `context/_database.md`.
- New shared component / hook / util → add it to `context/_foundation.md`.
- A task is **not done** until its context files match the code.

**Rules:**
- Always the **current** state. Rewrite outdated lines; do not append "update:" notes. History belongs in the Changelog section only (one line per change, newest first, max ~15 lines).
- Short and factual: bullets, tables, file paths. No code dumps (a function signature or tiny snippet is fine).
- Target under ~200 lines per file. If bigger, split the feature (e.g. `invoices.md` + `invoices-tax.md`).
- If you find the context file wrong while working, fix it and tell the user.

**Template — `context/<feature>.md`:**
```md
# <Feature name>
Status: planned | in progress | done   ·   Phase: <n>   ·   Last updated: <YYYY-MM-DD>

## What it does
2–5 lines, user-facing behaviour.

## Business rules
- Rules from the product doc as actually implemented (limits, defaults, edge cases).

## Files
| Path | Purpose |
|---|---|
| app/(app)/clients/index.tsx | list screen |
| src/features/clients/api/useClients.ts | list query (server-side search + filters) |

## Database
- Tables: name → key columns
- RLS: who can read/write what
- RPC / Edge Functions: name(params) → returns, what it does
- Migrations: filenames

## Data & caching
- Query keys, staleTime, which mutations invalidate what, realtime channels
- Pagination type, available filters/sort

## Permissions & gating
- Permissions used, plan/add-on required

## UI
- Screens and main reusable components used; mobile vs desktop differences

## i18n
- Namespace(s)

## Known limits / TODO
- Open items, deferred parts, open questions for the user

## Changelog
- YYYY-MM-DD: one line
```

**`context/_index.md` format:**
```md
| Feature | File | Status | Phase | Summary |
|---|---|---|---|---|
| Clients | clients.md | done | 4 | Client list, profile, notes, history |
```
