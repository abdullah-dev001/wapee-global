import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';

export const clientKeys = createQueryKeys('clients');

export type ClientListItem = {
  id: string;
  fullName: string;
  /** Null when the caller lacks `clients.view_contact` — the database returns NULL for it (clients_v), it is not merely hidden in the render. */
  phoneE164: string | null;
  email: string | null;
  isArchived: boolean;
  createdAt: string;
};

export type ClientListFilters = {
  search?: string;
  includeArchived?: boolean;
};

type ClientListPage = {
  rows: ClientListItem[];
  nextCursor: { fullName: string; id: string } | null;
};

const PAGE_SIZE = 20;

function mapRow(row: {
  id: string;
  full_name: string;
  phone_e164?: string;
  email?: string | null;
  deleted_at: string | null;
  created_at: string;
}): ClientListItem {
  return {
    id: row.id,
    fullName: row.full_name,
    phoneE164: row.phone_e164 ?? null,
    email: row.email ?? null,
    isArchived: row.deleted_at !== null,
    createdAt: row.created_at,
  };
}

/**
 * Server-side search (name/phone, trgm), keyset pagination on
 * `(full_name, id)` — CLAUDE.md §6: never fetch everything and filter in
 * JS. RLS (`clients_select`) is the scope boundary: an Own-scope Staff
 * member only ever gets back clients they have an appointment with.
 *
 * Reads `clients_v`, never `clients`: `authenticated` has no privilege on
 * `clients.phone_e164`/`email` (Phase 11A). The view returns them only for
 * callers holding `clients.view_contact` and NULL otherwise, so the gate is
 * the database's. `canViewContact` only decides whether phone search is
 * offered (the view would match nothing anyway) and keys the cache.
 */
export function useClients(
  businessId: string | null,
  filters: ClientListFilters,
  canViewContact: boolean,
) {
  const { isAuthenticated } = useSession();
  const { search = '', includeArchived = false } = filters;

  return useInfiniteQuery<ClientListPage>({
    queryKey: clientKeys.list({
      businessId: businessId ?? 'none',
      search,
      filters: { includeArchived, canViewContact },
    }),
    enabled: isAuthenticated && Boolean(businessId),
    staleTime: staleTimes.list,
    initialPageParam: null as { fullName: string; id: string } | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam as { fullName: string; id: string } | null;
      let query = getSupabase()
        .from('clients_v')
        .select('id, full_name, phone_e164, email, deleted_at, created_at')
        .eq('business_id', businessId ?? '');

      if (!includeArchived) query = query.is('deleted_at', null);
      if (search.length >= 2) {
        query = canViewContact
          ? query.or(`full_name.ilike.%${search}%,phone_e164.ilike.%${search}%`)
          : query.ilike('full_name', `%${search}%`);
      }
      if (cursor) {
        // Keyset on (full_name, id) ascending: strictly after the cursor row.
        query = query.or(
          `full_name.gt.${cursor.fullName},and(full_name.eq.${cursor.fullName},id.gt.${cursor.id})`,
        );
      }

      const { data, error } = await query
        .order('full_name', { ascending: true })
        .order('id', { ascending: true })
        .limit(PAGE_SIZE + 1);
      if (error) throw new Error(error.message);

      const rows = (data ?? []) as unknown as Parameters<typeof mapRow>[0][];
      const hasMore = rows.length > PAGE_SIZE;
      const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
      const last = page[page.length - 1];

      return {
        rows: page.map(mapRow),
        nextCursor: hasMore && last ? { fullName: last.full_name, id: last.id } : null,
      };
    },
  });
}

export type ClientDetail = ClientListItem & {
  notes: string | null;
  firstBranchId: string | null;
  /** Set once the client's personal data was erased (GDPR): the row stays, anonymised. */
  isErased: boolean;
};

export function useClient(
  businessId: string | null,
  clientId: string | null,
  options: { enabled?: boolean } = {},
): UseQueryResult<ClientDetail, Error> {
  const { isAuthenticated } = useSession();

  return useQuery({
    queryKey: clientKeys.detail({ businessId: businessId ?? 'none' }, clientId ?? 'none'),
    enabled: (options.enabled ?? true) && isAuthenticated && Boolean(businessId && clientId),
    staleTime: staleTimes.list,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('clients_v')
        .select(
          'id, full_name, phone_e164, email, notes, deleted_at, created_at, first_branch_id, erased_at',
        )
        .eq('id', clientId ?? '')
        .single();
      if (error) throw new Error(error.message);
      const row = data as unknown as Parameters<typeof mapRow>[0] & {
        notes: string | null;
        first_branch_id: string | null;
        erased_at: string | null;
      };
      return {
        ...mapRow(row),
        notes: row.notes,
        firstBranchId: row.first_branch_id,
        isErased: row.erased_at !== null,
      };
    },
  });
}

function invalidateClients(
  queryClient: ReturnType<typeof useQueryClient>,
  businessId: string | null,
) {
  void queryClient.invalidateQueries({
    queryKey: clientKeys.business(businessId ?? 'none'),
  });
}

export type SaveClientInput = {
  id?: string;
  fullName: string;
  /** Left out (with email and notes) when the caller cannot see contact data: an edit then changes the name only. */
  phoneE164?: string;
  email?: string | null;
  notes?: string | null;
};

/** `clients.create`/`clients.edit` RLS is the boundary; the phone-uniqueness constraint surfaces as a `23505` the caller maps to a clear message. */
export function useSaveClient(businessId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<string, Error & { code?: string }, SaveClientInput>({
    mutationFn: async (values) => {
      if (!businessId) throw new Error('No business selected');
      const supabase = getSupabase();
      if (values.id) {
        const fields =
          values.phoneE164 === undefined
            ? { full_name: values.fullName }
            : {
                business_id: businessId,
                full_name: values.fullName,
                phone_e164: values.phoneE164,
                email: values.email ?? null,
                notes: values.notes ?? null,
              };
        const { error } = await supabase.from('clients').update(fields).eq('id', values.id);
        if (error) throw Object.assign(new Error(error.message), { code: error.code });
        return values.id;
      }

      const { data, error } = await supabase
        .from('clients')
        .insert({
          business_id: businessId,
          full_name: values.fullName,
          phone_e164: values.phoneE164 ?? '',
          email: values.email ?? null,
          notes: values.notes ?? null,
        })
        .select('id')
        .single();
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return data.id;
    },
    onSuccess: () => invalidateClients(queryClient, businessId),
  });
}

/** Archives a client (soft delete via `deleted_at`, same pattern as staff/resources). */
export function useArchiveClient(businessId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<undefined, Error, { id: string; archived: boolean }>({
    mutationFn: async ({ id, archived }) => {
      const { error } = await getSupabase()
        .from('clients')
        .update({ deleted_at: archived ? new Date().toISOString() : null })
        .eq('id', id);
      if (error) throw new Error(error.message);
      return undefined;
    },
    onSuccess: () => invalidateClients(queryClient, businessId),
  });
}

/** The existing client a phone number already belongs to, for the "clear message with a link" rule. */
export function useFindClientByPhone(businessId: string | null, phoneE164: string | null) {
  const { isAuthenticated } = useSession();

  return useQuery({
    queryKey: clientKeys.list({
      businessId: businessId ?? 'none',
      search: `phone:${phoneE164 ?? ''}`,
    }),
    enabled: isAuthenticated && Boolean(businessId && phoneE164),
    staleTime: staleTimes.list,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('clients_v')
        .select('id, full_name')
        .eq('business_id', businessId ?? '')
        .eq('phone_e164', phoneE164 ?? '')
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data && data.id && data.full_name ? { id: data.id, full_name: data.full_name } : null;
    },
  });
}
