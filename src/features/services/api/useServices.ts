import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';

import { type ServiceValues } from '../schemas/service.schemas';

export const serviceKeys = createQueryKeys('services');
export const categoryKeys = createQueryKeys('service-categories');

export type ServiceCategory = {
  id: string;
  name: string;
  sortOrder: number;
};

export type ServiceListItem = {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  durationMinutes: number;
  bufferMinutes: number;
  isActive: boolean;
  isBookableOnline: boolean;
  /** Price at the CURRENT branch, in minor units. Null = not priced there yet. */
  priceMinor: number | null;
  /** Whether this branch offers it. */
  enabledAtBranch: boolean;
  staffIds: string[];
};

/** Categories for the picker and for grouping the list. */
export function useServiceCategories(
  businessId: string | null,
): UseQueryResult<ServiceCategory[], Error> {
  const { isAuthenticated } = useSession();

  return useQuery({
    queryKey: categoryKeys.list({ businessId: businessId ?? 'none' }),
    enabled: isAuthenticated && Boolean(businessId),
    staleTime: staleTimes.static,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('service_categories')
        .select('id, name, sort_order')
        .eq('business_id', businessId ?? '')
        .is('deleted_at', null)
        .order('sort_order')
        .order('name');
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        sortOrder: row.sort_order,
      }));
    },
  });
}

/**
 * Services with their price at the current branch.
 *
 * Price is per branch (`service_branches`), so the row is embedded and filtered to
 * the branch in hand. A service with no row there has not been priced yet, which
 * the UI shows as "no price" rather than as free.
 *
 * Search is server-side (`ilike`, backed by the `pg_trgm` index), per CLAUDE.md §6.
 */
export function useServices(
  businessId: string | null,
  branchId: string | null,
  options: { search?: string; includeInactive?: boolean } = {},
): UseQueryResult<ServiceListItem[], Error> {
  const { isAuthenticated } = useSession();
  const { search = '', includeInactive = true } = options;

  return useQuery({
    queryKey: serviceKeys.list({
      businessId: businessId ?? 'none',
      branchId,
      search,
      filters: { includeInactive },
    }),
    enabled: isAuthenticated && Boolean(businessId),
    staleTime: staleTimes.static,
    queryFn: async () => {
      // One string literal: supabase-js infers the row type from it.
      let query = getSupabase()
        .from('services')
        .select(
          'id, name, description, category_id, duration_minutes, buffer_minutes, is_active, is_bookable_online, sort_order, service_categories(name), service_branches(branch_id, price_minor, enabled), service_staff(staff_id)',
        )
        .eq('business_id', businessId ?? '')
        .is('deleted_at', null);

      if (search) query = query.ilike('name', `%${search}%`);
      if (!includeInactive) query = query.eq('is_active', true);

      const { data, error } = await query.order('sort_order').order('name');
      if (error) throw new Error(error.message);

      return (data ?? []).map((row) => {
        // Only this branch's price row matters.
        const priceRow = (row.service_branches ?? []).find((entry) => entry.branch_id === branchId);
        return {
          id: row.id,
          name: row.name,
          description: row.description,
          categoryId: row.category_id,
          categoryName: row.service_categories?.name ?? null,
          durationMinutes: row.duration_minutes,
          bufferMinutes: row.buffer_minutes,
          isActive: row.is_active,
          isBookableOnline: row.is_bookable_online,
          priceMinor: priceRow?.price_minor ?? null,
          // No row yet counts as offered; the price is simply unset.
          enabledAtBranch: priceRow?.enabled ?? true,
          staffIds: (row.service_staff ?? []).map((entry) => entry.staff_id),
        };
      });
    },
  });
}

/** Everything a service mutation has to invalidate. */
function invalidateServices(
  queryClient: ReturnType<typeof useQueryClient>,
  businessId: string | null,
) {
  void queryClient.invalidateQueries({
    queryKey: serviceKeys.scope({ businessId: businessId ?? 'none' }),
  });
}

/**
 * Creates or updates a service and its price at the current branch.
 *
 * Two tables in one action, because a service without a price is not something a
 * business can sell. They are not atomic: if the price write fails the service
 * still exists, which is recoverable (edit it again) and does not corrupt
 * anything. A single RPC would be tidier and is noted in context/services.md.
 */
export function useSaveService(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<string, Error, ServiceValues & { id?: string }>({
    mutationFn: async (values) => {
      if (!businessId) throw new Error('No business selected');
      const supabase = getSupabase();

      const fields = {
        business_id: businessId,
        category_id: values.categoryId,
        name: values.name,
        description: values.description ?? null,
        duration_minutes: values.durationMinutes,
        buffer_minutes: values.bufferMinutes,
        is_active: values.isActive,
        is_bookable_online: values.isBookableOnline,
      };

      let serviceId = values.id;
      if (serviceId) {
        const { error } = await supabase.from('services').update(fields).eq('id', serviceId);
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await supabase
          .from('services')
          .insert(fields)
          .select('id')
          .single();
        if (error) throw new Error(error.message);
        serviceId = data.id;
      }

      // The price belongs to the branch (decision 23).
      if (branchId && values.priceMinor !== null) {
        const { error } = await supabase.from('service_branches').upsert(
          {
            service_id: serviceId,
            branch_id: branchId,
            business_id: businessId,
            price_minor: values.priceMinor,
            enabled: true,
          },
          { onConflict: 'service_id,branch_id' },
        );
        if (error) throw new Error(error.message);
      }

      // Replace the staff assignment wholesale: simpler than diffing, and the
      // table is a plain join with no history.
      const { error: clearError } = await supabase
        .from('service_staff')
        .delete()
        .eq('service_id', serviceId);
      if (clearError) throw new Error(clearError.message);

      if (values.staffIds.length > 0) {
        const { error: linkError } = await supabase.from('service_staff').insert(
          values.staffIds.map((staffId) => ({
            service_id: serviceId,
            staff_id: staffId,
            business_id: businessId,
          })),
        );
        if (linkError) throw new Error(linkError.message);
      }

      return serviceId;
    },
    onSuccess: () => invalidateServices(queryClient, businessId),
  });
}

/** Soft-deletes a service. History keeps pointing at the row (CLAUDE.md §6). */
export function useDeleteService(businessId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<undefined, Error, string>({
    mutationFn: async (serviceId) => {
      const { error } = await getSupabase()
        .from('services')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', serviceId);
      if (error) throw new Error(error.message);
      return undefined;
    },
    onSuccess: () => invalidateServices(queryClient, businessId),
  });
}

/** Creates a category. */
export function useCreateCategory(businessId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<string, Error, { name: string }>({
    mutationFn: async ({ name }) => {
      if (!businessId) throw new Error('No business selected');
      const { data, error } = await getSupabase()
        .from('service_categories')
        .insert({ business_id: businessId, name })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      return data.id;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: categoryKeys.scope({ businessId: businessId ?? 'none' }),
      });
    },
  });
}
