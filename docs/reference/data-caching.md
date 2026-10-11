# Pagination and caching details

Moved from CLAUDE.md §6. Read only when the task adds/changes a list or query.

### Server-side pagination, filtering, sorting, search
- **All** pagination, filters, sorting and search happen **on the server**. Never fetch a full table and filter in JS.
- Default page size 20 (max 100). Use keyset/cursor pagination for large or fast-growing lists (appointments, invoices, messages, audit log); `range()` + exact count only where a page-number UI needs it.
- Search: debounced 300ms, minimum 2 chars, server-side (`ilike` with trgm index or full-text).
- Filters and sort live in the URL search params on web (shareable, back button works) and in the query key.
- Select only needed columns (no `select('*')` in list queries).

### Caching with TanStack Query
- Every server read goes through a hook in `features/<x>/api/` using `useQuery` / `useInfiniteQuery`. **No Supabase calls inside components.**
- **Query key factory** per feature, always scoped by business (and branch):
  `appointmentKeys.list({ businessId, branchId, filters, sort })`, `appointmentKeys.detail(id)`.
- Default `staleTime` by data type (set in `lib/query`):
  - static-ish (services, staff, settings, roles, plan): 5–10 min
  - lists (clients, invoices): 30–60 s
  - live (calendar, today): 0–15 s, plus `refetchInterval` 30 s while the screen is focused and the tab/app visible (`useLiveRefetchInterval`)
- Use `placeholderData: keepPreviousData` for paginated lists (no flicker between pages).
- Mutations: invalidate **exactly** the affected keys (or `setQueryData` for precise updates). Optimistic updates only for simple toggles/status, with rollback on error.
- **No Realtime anywhere.** Freshness comes from `refetchOnWindowFocus`, `refetchOnReconnect`, the 30 s interval on Today and Calendar only, and manual refresh (pull-to-refresh on native lists and Today, Refresh button on the Calendar).
- Prefetch the next page and likely next screen where cheap.
- On logout or business switch: clear the query cache.
- Every query handles loading (skeleton), empty, and error (retry) states.
