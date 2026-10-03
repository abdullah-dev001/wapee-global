import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';

import {
  parseOptions,
  type CustomFieldFormValues,
  type CustomFieldType,
} from '../schemas/customField.schemas';

export const customFieldKeys = createQueryKeys('custom-fields');

export type CustomField = {
  id: string;
  label: string;
  fieldType: CustomFieldType;
  helpText: string | null;
  isRequired: boolean;
  isSensitive: boolean;
  appliesToAllServices: boolean;
  options: string[] | null;
  isActive: boolean;
  sortOrder: number;
  /** Which services it is asked for. Empty when it applies to all. */
  serviceIds: string[];
};

/**
 * Every custom field of the business, active and archived.
 *
 * Archived ones are included because they are soft-deleted, not gone: past
 * bookings still have answers to them, and the owner may want to bring one back.
 * The list separates them.
 */
export function useCustomFields(businessId: string | null): UseQueryResult<CustomField[], Error> {
  const { isAuthenticated } = useSession();

  return useQuery({
    queryKey: customFieldKeys.list({ businessId: businessId ?? 'none' }),
    enabled: isAuthenticated && Boolean(businessId),
    staleTime: staleTimes.static,
    queryFn: async () => {
      // ONE string literal: a concatenation makes supabase-js infer
      // GenericStringError instead of the row type (context/_handoff.md).
      const { data, error } = await getSupabase()
        .from('custom_fields')
        .select(
          'id, label, field_type, help_text, is_required, is_sensitive, applies_to_all_services, options, is_active, sort_order, custom_field_services(service_id)',
        )
        .eq('business_id', businessId ?? '')
        .is('deleted_at', null)
        .order('sort_order')
        .order('id');

      if (error) throw error;

      return (data ?? []).map((row) => ({
        id: row.id,
        label: row.label,
        fieldType: row.field_type,
        helpText: row.help_text,
        isRequired: row.is_required,
        isSensitive: row.is_sensitive,
        appliesToAllServices: row.applies_to_all_services,
        options: row.options,
        isActive: row.is_active,
        sortOrder: row.sort_order,
        serviceIds: (row.custom_field_services ?? []).map((s) => s.service_id),
      })) satisfies CustomField[];
    },
  });
}

/**
 * Create or update a field, plus its service scope.
 *
 * NOT atomic: the field row and its `custom_field_services` rows are separate
 * writes, so a failure between them can leave the scope half-applied. That is the
 * same limitation `useSaveService` and `useSaveStaff` already have (see
 * context/_handoff.md), and the blast radius here is small — a field asked on the
 * wrong set of services, fixable by saving again. An RPC would fix it properly and
 * is worth doing when those two are fixed together.
 *
 * Every write bumps the form version in the DB, in the same transaction as the
 * field row, via `touch_form_version`. So the UI never has to think about versions
 * — it only has to tell the owner that changes apply to NEW bookings.
 */
export function useSaveCustomField(
  businessId: string | null,
): UseMutationResult<void, Error, { id: string | null; values: CustomFieldFormValues }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, values }) => {
      if (!businessId) throw new Error('No business selected');
      const supabase = getSupabase();

      const options = values.fieldType === 'dropdown' ? parseOptions(values.optionsText) : null;

      const row = {
        business_id: businessId,
        label: values.label.trim(),
        field_type: values.fieldType,
        help_text: values.helpText,
        is_required: values.isRequired,
        is_sensitive: values.isSensitive,
        applies_to_all_services: values.appliesToAllServices,
        options,
      };

      let fieldId = id;

      if (fieldId) {
        const { error } = await supabase.from('custom_fields').update(row).eq('id', fieldId);
        if (error) throw error;
      } else {
        // New fields go to the end of the list.
        const { data: maxRow } = await supabase
          .from('custom_fields')
          .select('sort_order')
          .eq('business_id', businessId)
          .order('sort_order', { ascending: false })
          .limit(1)
          .maybeSingle();

        const { data: inserted, error } = await supabase
          .from('custom_fields')
          .insert({ ...row, sort_order: (maxRow?.sort_order ?? -1) + 1 })
          .select('id')
          .single();
        if (error) throw error;
        fieldId = inserted.id;
      }

      // Replace the service scope. Delete-then-insert rather than a diff: the set
      // is tiny and a diff is more code to get wrong.
      const { error: deleteError } = await supabase
        .from('custom_field_services')
        .delete()
        .eq('custom_field_id', fieldId);
      if (deleteError) throw deleteError;

      if (!values.appliesToAllServices && values.serviceIds.length > 0) {
        const { error: insertError } = await supabase.from('custom_field_services').insert(
          values.serviceIds.map((serviceId) => ({
            custom_field_id: fieldId,
            service_id: serviceId,
            business_id: businessId,
          })),
        );
        if (insertError) throw insertError;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: customFieldKeys.list({ businessId: businessId ?? 'none' }),
      });
    },
  });
}

/**
 * Archive or restore a field.
 *
 * `is_active`, not `deleted_at`: a field with answers must keep existing so those
 * answers stay readable, and `appointment_field_values.custom_field_id` is ON
 * DELETE RESTRICT precisely to stop a hard delete. Archiving stops it being asked
 * and leaves history intact.
 */
export function useArchiveCustomField(
  businessId: string | null,
): UseMutationResult<void, Error, { id: string; isActive: boolean }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isActive }) => {
      const { error } = await getSupabase()
        .from('custom_fields')
        .update({ is_active: isActive })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: customFieldKeys.list({ businessId: businessId ?? 'none' }),
      });
    },
  });
}

/**
 * Move a field up or down.
 *
 * Two writes, swapping `sort_order`. The order only affects display, so a failure
 * between them leaves the list in a valid if unexpected order rather than losing
 * anything — which is why this is not worth an RPC.
 */
export function useReorderCustomField(
  businessId: string | null,
): UseMutationResult<void, Error, { id: string; swapWithId: string }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, swapWithId }) => {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from('custom_fields')
        .select('id, sort_order')
        .in('id', [id, swapWithId]);
      if (error) throw error;

      const a = data?.find((r) => r.id === id);
      const b = data?.find((r) => r.id === swapWithId);
      if (!a || !b) throw new Error('Field not found');

      // Equal sort_orders would make the swap a no-op and leave the list stuck, so
      // they are nudged apart instead.
      const [aNext, bNext] =
        a.sort_order === b.sort_order
          ? [b.sort_order + 1, b.sort_order]
          : [b.sort_order, a.sort_order];

      const first = await supabase
        .from('custom_fields')
        .update({ sort_order: aNext })
        .eq('id', a.id);
      if (first.error) throw first.error;

      const second = await supabase
        .from('custom_fields')
        .update({ sort_order: bNext })
        .eq('id', b.id);
      if (second.error) throw second.error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: customFieldKeys.list({ businessId: businessId ?? 'none' }),
      });
    },
  });
}
