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
  /** Null when the caller lacks `clients.view_contact` — never fetched in that case, not merely hidden in the render. */
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
 * `canViewContact` controls whether `phone_e164`/`email` are even SELECTed
 * (doc §9: "Client contact details" is Yes/Yes/Yes/No — Staff Own-scope
 * does not get them even for a client row they CAN see). There is no
 * column-level RLS for this; omitting the columns from the query itself,
 * rather than hiding them after the fact in the render, is the closest a
 * client-side query gets to a real boundary without new backend surface
 * (asked the user, 2026-10-05: no new RPC this round).
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
      const columns = canViewContact
        ? 'id, full_name, phone_e164, email, deleted_at, created_at'
        : 'id, full_name, deleted_at, created_at';

      let query = getSupabase()
        .from('clients')
        .select(columns)
        .eq('business_id', businessId ?? '');

      if (!includeArchived) query = query.is('deleted_at', null);
      if (search.length >= 2) {
        // Filtering on phone_e164 is fine even when it is not SELECTed — a
        // WHERE clause does not require the column in the projection.
        query = query.or(`full_name.ilike.%${search}%,phone_e164.ilike.%${search}%`);
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
};

export function useClient(
  businessId: string | null,
  clientId: string | null,
  canViewContact: boolean,
): UseQueryResult<ClientDetail, Error> {
  const { isAuthenticated } = useSession();

  return useQuery({
    queryKey: clientKeys.detail({ businessId: businessId ?? 'none' }, clientId ?? 'none'),
    enabled: isAuthenticated && Boolean(businessId && clientId),
    staleTime: staleTimes.list,
    queryFn: async () => {
      const columns = canViewContact
        ? 'id, full_name, phone_e164, email, notes, deleted_at, created_at, first_branch_id'
        : 'id, full_name, notes, deleted_at, created_at, first_branch_id';

      const { data, error } = await getSupabase()
        .from('clients')
        .select(columns)
        .eq('id', clientId ?? '')
        .single();
      if (error) throw new Error(error.message);
      const row = data as unknown as Parameters<typeof mapRow>[0] & {
        notes: string | null;
        first_branch_id: string | null;
      };
      return {
        ...mapRow(row),
        notes: row.notes,
        firstBranchId: row.first_branch_id,
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
  phoneE164: string;
  email: string | null;
  notes: string | null;
};

/** `clients.create`/`clients.edit` RLS is the boundary; the phone-uniqueness constraint surfaces as a `23505` the caller maps to a clear message. */
export function useSaveClient(businessId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<string, Error & { code?: string }, SaveClientInput>({
    mutationFn: async (values) => {
      if (!businessId) throw new Error('No business selected');
      const supabase = getSupabase();
      const fields = {
        business_id: businessId,
        full_name: values.fullName,
        phone_e164: values.phoneE164,
        email: values.email,
        notes: values.notes,
      };

      if (values.id) {
        const { error } = await supabase.from('clients').update(fields).eq('id', values.id);
        if (error) throw Object.assign(new Error(error.message), { code: error.code });
        return values.id;
      }

      const { data, error } = await supabase.from('clients').insert(fields).select('id').single();
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
        .from('clients')
        .select('id, full_name')
        .eq('business_id', businessId ?? '')
        .eq('phone_e164', phoneE164 ?? '')
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
}
