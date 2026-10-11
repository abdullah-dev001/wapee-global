/**
 * Query key factory helper. Every feature builds its keys with this so keys are
 * always scoped by business (and branch) and invalidation stays precise.
 *
 * @example
 * export const clientKeys = createQueryKeys('clients');
 * clientKeys.list({ businessId, branchId, filters, sort });
 * clientKeys.detail({ businessId }, clientId);
 * queryClient.invalidateQueries({ queryKey: clientKeys.lists({ businessId }) });
 */

export type QueryScope = {
  businessId: string;
  branchId?: string | null;
};

export type ListParams = QueryScope & {
  filters?: Record<string, unknown>;
  sort?: string | Record<string, unknown>;
  search?: string;
  pageSize?: number;
};

function scopeOf({ businessId, branchId }: QueryScope) {
  return { businessId, branchId: branchId ?? null };
}

export function createQueryKeys<const TFeature extends string>(feature: TFeature) {
  const all = [feature] as const;
  return {
    /** Everything for this feature (all businesses). Use for logout-like resets only. */
    all,
    /**
     * Everything for this feature in one business, in EVERY branch. `scope({ businessId })` does
     * NOT do this: it stands for branch `null`, and TanStack matches `null` against a list keyed
     * by a real branch id as "different", so such a list would silently stay stale. Use this to
     * invalidate lists that carry a branch id.
     */
    business: (businessId: string) => [...all, { businessId }] as const,
    /** Everything for this feature inside one business/branch. */
    scope: (scope: QueryScope) => [...all, scopeOf(scope)] as const,
    /** All lists in a scope (invalidate after create/update/delete). */
    lists: (scope: QueryScope) => [...all, scopeOf(scope), 'list'] as const,
    /** One list with its filters/sort/search. */
    list: ({ filters, sort, search, pageSize, ...scope }: ListParams) =>
      [
        ...all,
        scopeOf(scope),
        'list',
        {
          filters: filters ?? {},
          sort: sort ?? null,
          search: search ?? '',
          pageSize: pageSize ?? null,
        },
      ] as const,
    /** All details in a scope. */
    details: (scope: QueryScope) => [...all, scopeOf(scope), 'detail'] as const,
    /** One record. */
    detail: (scope: QueryScope, id: string) => [...all, scopeOf(scope), 'detail', id] as const,
  };
}
