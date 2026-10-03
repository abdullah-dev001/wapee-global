import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import type { PublicFormField, PublicService, PublicStaff } from '@/features/booking-public';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';

export const previewCatalogueKeys = createQueryKeys('booking-preview-catalogue');

export type PreviewCatalogue = {
  services: PublicService[];
  staff: PublicStaff[];
  fields: PublicFormField[];
  /** Non-zero per-service buffers, for the buffer explanation on the form. */
  serviceBufferMinutes: number[];
};

/**
 * The branch's real catalogue, shaped for the public booking components.
 *
 * The live preview shows the owner's OWN services, staff and form fields — that is
 * most of the value, since a preview of invented names cannot tell them whether
 * their catalogue reads well. Only the slot times are sample data.
 *
 * Filtered exactly as the engine filters: a service must be active, bookable
 * online and enabled at this branch; a staff member must be active, bookable
 * online and assigned here.
 */
export function usePreviewCatalogue(
  businessId: string | null,
  branchId: string | null,
  currency: string,
): UseQueryResult<PreviewCatalogue, Error> {
  const { isAuthenticated } = useSession();

  return useQuery({
    queryKey: previewCatalogueKeys.detail({ businessId: businessId ?? 'none' }, branchId ?? 'none'),
    enabled: isAuthenticated && Boolean(businessId && branchId),
    staleTime: staleTimes.static,
    queryFn: async () => {
      const supabase = getSupabase();

      const [servicesResult, staffResult, fieldsResult] = await Promise.all([
        // One embedded select as ONE string literal: a concatenation makes
        // supabase-js infer GenericStringError (context/_handoff.md).
        supabase
          .from('service_branches')
          .select(
            'price_minor, services!inner(id, name, duration_minutes, buffer_minutes, is_active, is_bookable_online, deleted_at, service_categories(name))',
          )
          .eq('branch_id', branchId ?? '')
          .eq('enabled', true),
        supabase
          .from('staff_branches')
          .select(
            'staff_profiles!inner(id, display_name, is_active, is_bookable_online, deleted_at, sort_order)',
          )
          .eq('branch_id', branchId ?? ''),
        supabase
          .from('custom_fields')
          .select('id, label, field_type, help_text, is_required, options, sort_order')
          .eq('business_id', businessId ?? '')
          .is('deleted_at', null)
          .eq('is_active', true)
          .order('sort_order')
          .order('id'),
      ]);

      if (servicesResult.error) throw servicesResult.error;
      if (staffResult.error) throw staffResult.error;
      if (fieldsResult.error) throw fieldsResult.error;

      const services: PublicService[] = [];
      const serviceBufferMinutes: number[] = [];

      for (const row of servicesResult.data ?? []) {
        const service = row.services;
        if (!service || service.deleted_at || !service.is_active || !service.is_bookable_online) {
          continue;
        }
        services.push({
          id: service.id,
          name: service.name,
          durationMinutes: service.duration_minutes,
          priceMinor: row.price_minor,
          currency,
          categoryName: service.service_categories?.name ?? null,
        });
        if (service.buffer_minutes > 0) serviceBufferMinutes.push(service.buffer_minutes);
      }

      services.sort((a, b) => a.name.localeCompare(b.name));

      const staff: PublicStaff[] = [];
      for (const row of staffResult.data ?? []) {
        const person = row.staff_profiles;
        if (!person || person.deleted_at || !person.is_active || !person.is_bookable_online) {
          continue;
        }
        staff.push({ id: person.id, displayName: person.display_name });
      }

      const fields: PublicFormField[] = (fieldsResult.data ?? []).map((f) => ({
        id: f.id,
        label: f.label,
        fieldType: f.field_type,
        helpText: f.help_text,
        isRequired: f.is_required,
        options: f.options,
      }));

      return { services, staff, fields, serviceBufferMinutes } satisfies PreviewCatalogue;
    },
  });
}
