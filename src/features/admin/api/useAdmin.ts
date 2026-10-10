import {
  useInfiniteQuery,
  type InfiniteData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';

import { type FeatureMap, type PlanKey } from '@/features/plans/featureLogic';

import { callAdminRpc } from './adminRpc';
import { useAdminEnabled } from './useAdminAccess';

/**
 * Admin queries. Everything here is platform-level, not tenant data, so the key
 * scope is either one business (`{businessId}`) or the literal `platform`.
 * Every query is disabled unless the session is flag + aal2 (the RPCs refuse
 * anyway), and the whole cache is cleared on sign-out (SessionProvider).
 */
export const adminKeys = createQueryKeys('admin');
const PLATFORM = { businessId: 'platform' } as const;

export const ADMIN_PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type AdminBusinessRow = {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  createdAt: string;
  status: string;
  plan: string | null;
  trialEndsAt: string | null;
  isActive: boolean;
  branchCount: number;
  staffCount: number;
};

export type AdminFilters = { plan: string | null; status: string | null };
type TimeIdCursor = { created_at: string; id: string };
type BusinessPage = { items: AdminBusinessRow[]; nextCursor: TimeIdCursor | null };
type ReviewPage = { items: AdminReview[]; nextCursor: TimeIdCursor | null };

export type AdminAddon = {
  key: string;
  name: string;
  enabled: boolean;
  priceMonthlyMinor: number;
  currency: string;
};

export type AdminBusinessDetail = {
  business: {
    id: string;
    name: string;
    slug: string;
    industry: string | null;
    language: string | null;
    createdAt: string;
  };
  subscription: {
    plan: string | null;
    status: string;
    trialEndsAt: string | null;
    periodStart: string | null;
    periodEnd: string | null;
    notes: string | null;
  };
  isActive: boolean;
  limits: { plan: string | null; staffCap: number | null; maxBranches: number | null };
  addons: AdminAddon[];
  usage: {
    staffActive: number;
    branches: number;
    appointmentsThisMonth: number;
    invoicesIssued: number;
    smsBalance: number;
  };
};

export type AdminReview = {
  id: string;
  rating: number;
  comment: string | null;
  firstName: string;
  status: string;
  featured: boolean;
  createdAt: string;
};

export type SupportSummary = {
  business: { name: string; slug: string; industry: string | null };
  plan: string | null;
  status: string;
  isActive: boolean;
  branches: {
    id: string;
    name: string;
    isPrimary: boolean;
    country: string;
    currency: string;
    timezone: string;
  }[];
  membersByStatus: Record<string, number>;
  staffActive: number;
  appointmentsLast30d: Record<string, number>;
  addonsEnabled: string[];
  recentActivity: { action: string; at: string }[];
};

export type PlanRow = {
  key: string;
  name: string;
  staffCap: number | null;
  maxBranches: number | null;
  features: FeatureMap;
  priceMonthlyMinor: number;
  priceAnnualMinor: number;
  currency: string;
  active: boolean;
  /** Price is per location (each extra location billed the same). */
  pricedPerBranch: boolean;
};
export type AddonRow = {
  key: string;
  name: string;
  priceMonthlyMinor: number;
  priceAnnualMinor: number;
  currency: string;
  active: boolean;
  /** Plans it can be bought on; null = every plan. */
  availablePlans: PlanKey[] | null;
};
export type SmsRateRow = {
  dialCode: string;
  countryCode: string;
  creditsPerSegment: number;
  note: string | null;
};
export type PresetRow = {
  key: string;
  name: string;
  templateKey: string;
  active: boolean;
  terminology: Record<string, unknown>;
  starterFields: unknown;
};

// ---------------------------------------------------------------------------
// Parsing helpers (the RPCs return jsonb)
// ---------------------------------------------------------------------------
type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Rec) : {};
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const counts = (v: unknown): Record<string, number> =>
  Object.fromEntries(Object.entries(rec(v)).map(([k, n]) => [k, num(n)]));

function parseBusinessRow(v: unknown): AdminBusinessRow {
  const r = rec(v);
  return {
    id: str(r.id),
    name: str(r.name),
    slug: str(r.slug),
    industry: strOrNull(r.industry),
    createdAt: str(r.created_at),
    status: str(r.status),
    plan: strOrNull(r.plan),
    trialEndsAt: strOrNull(r.trial_ends_at),
    isActive: r.is_active === true,
    branchCount: num(r.branch_count),
    staffCount: num(r.staff_count),
  };
}

function parseDetail(r: Rec): AdminBusinessDetail {
  const b = rec(r.business);
  const s = rec(r.subscription);
  const l = rec(r.limits);
  const u = rec(r.usage);
  return {
    business: {
      id: str(b.id),
      name: str(b.name),
      slug: str(b.slug),
      industry: strOrNull(b.industry),
      language: strOrNull(b.language),
      createdAt: str(b.created_at),
    },
    subscription: {
      plan: strOrNull(s.plan),
      status: str(s.status),
      trialEndsAt: strOrNull(s.trial_ends_at),
      periodStart: strOrNull(s.current_period_start),
      periodEnd: strOrNull(s.current_period_end),
      notes: strOrNull(s.notes),
    },
    isActive: r.is_active === true,
    limits: {
      plan: strOrNull(l.plan),
      staffCap: numOrNull(l.staff_cap),
      maxBranches: numOrNull(l.max_branches),
    },
    addons: arr(r.addons).map((a) => {
      const x = rec(a);
      return {
        key: str(x.key),
        name: str(x.name),
        enabled: x.enabled === true,
        priceMonthlyMinor: num(x.price_monthly_minor),
        currency: str(x.currency),
      };
    }),
    usage: {
      staffActive: num(u.staff_active),
      branches: num(u.branches),
      appointmentsThisMonth: num(u.appointments_this_month_utc),
      invoicesIssued: num(u.invoices_issued),
      smsBalance: num(u.sms_balance),
    },
  };
}

function parseSupport(r: Rec): SupportSummary {
  const b = rec(r.business);
  return {
    business: { name: str(b.name), slug: str(b.slug), industry: strOrNull(b.industry) },
    plan: strOrNull(r.plan),
    status: str(r.status),
    isActive: r.is_active === true,
    branches: arr(r.branches).map((x) => {
      const y = rec(x);
      return {
        id: str(y.id),
        name: str(y.name),
        isPrimary: y.is_primary === true,
        country: str(y.country_code),
        currency: str(y.currency),
        timezone: str(y.timezone),
      };
    }),
    membersByStatus: counts(r.members_by_status),
    staffActive: num(r.staff_active),
    appointmentsLast30d: counts(r.appointments_last_30d_by_status),
    addonsEnabled: arr(r.addons_enabled).filter((k): k is string => typeof k === 'string'),
    recentActivity: arr(r.recent_activity).map((x) => ({
      action: str(rec(x).action),
      at: str(rec(x).at),
    })),
  };
}

// ---------------------------------------------------------------------------
// Businesses
// ---------------------------------------------------------------------------
export function useAdminBusinesses(search: string, filters: AdminFilters) {
  const enabled = useAdminEnabled();
  return useInfiniteQuery<
    BusinessPage,
    Error,
    InfiniteData<BusinessPage, TimeIdCursor | null>,
    readonly unknown[],
    TimeIdCursor | null
  >({
    queryKey: adminKeys.list({ ...PLATFORM, search, filters, pageSize: ADMIN_PAGE_SIZE }),
    enabled,
    staleTime: staleTimes.list,
    initialPageParam: null as TimeIdCursor | null,
    getNextPageParam: (last) => last.nextCursor,
    queryFn: async ({ pageParam }: { pageParam: TimeIdCursor | null }) => {
      const r = await callAdminRpc(() =>
        getSupabase().rpc('list_businesses', {
          p_search: search || undefined,
          p_status: filters.status ?? undefined,
          p_plan: filters.plan ?? undefined,
          p_limit: ADMIN_PAGE_SIZE,
          p_cursor_created_at: pageParam?.created_at,
          p_cursor_id: pageParam?.id,
        }),
      );
      const cursor = rec(r.next_cursor);
      return {
        items: arr(r.items).map(parseBusinessRow),
        nextCursor:
          typeof cursor.created_at === 'string' && typeof cursor.id === 'string'
            ? ({ created_at: cursor.created_at, id: cursor.id } satisfies TimeIdCursor)
            : null,
      };
    },
  });
}

export function useAdminBusinessDetail(id: string) {
  const enabled = useAdminEnabled();
  return useQuery({
    queryKey: adminKeys.detail({ businessId: id }, 'detail'),
    enabled,
    staleTime: staleTimes.live,
    queryFn: async () =>
      parseDetail(
        await callAdminRpc(() => getSupabase().rpc('get_business_detail', { p_business_id: id })),
      ),
  });
}

/** Support view: read-only, and EVERY call is audited, so it only runs on demand. */
export function useSupportView(id: string) {
  return useMutation({
    mutationFn: async () =>
      parseSupport(
        await callAdminRpc(() => getSupabase().rpc('support_view_business', { p_business_id: id })),
      ),
  });
}

export function useAdminReviews(id: string, enabled: boolean) {
  const adminOn = useAdminEnabled();
  return useInfiniteQuery<
    ReviewPage,
    Error,
    InfiniteData<ReviewPage, TimeIdCursor | null>,
    readonly unknown[],
    TimeIdCursor | null
  >({
    queryKey: adminKeys.list({
      businessId: id,
      filters: { kind: 'reviews' },
      pageSize: ADMIN_PAGE_SIZE,
    }),
    enabled: adminOn && enabled,
    staleTime: staleTimes.live,
    initialPageParam: null as TimeIdCursor | null,
    getNextPageParam: (last) => last.nextCursor,
    queryFn: async ({ pageParam }: { pageParam: TimeIdCursor | null }) => {
      const r = await callAdminRpc(() =>
        getSupabase().rpc('admin_list_reviews', {
          p_business_id: id,
          p_limit: ADMIN_PAGE_SIZE,
          p_cursor_created_at: pageParam?.created_at,
          p_cursor_id: pageParam?.id,
        }),
      );
      const cursor = rec(r.next_cursor);
      return {
        items: arr(r.items).map((x): AdminReview => {
          const y = rec(x);
          return {
            id: str(y.id),
            rating: num(y.rating),
            comment: strOrNull(y.comment),
            firstName: str(y.reviewer_first_name),
            status: str(y.status),
            featured: y.featured_on_website === true,
            createdAt: str(y.created_at),
          };
        }),
        nextCursor:
          typeof cursor.created_at === 'string' && typeof cursor.id === 'string'
            ? ({ created_at: cursor.created_at, id: cursor.id } satisfies TimeIdCursor)
            : null,
      };
    },
  });
}

function invalidateBusiness(qc: QueryClient, id: string) {
  void qc.invalidateQueries({ queryKey: adminKeys.business(id) });
  void qc.invalidateQueries({ queryKey: adminKeys.lists(PLATFORM) });
}

export function useAssignPlan(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { plan: string; periodEnd: string | null; notes: string }) =>
      callAdminRpc(() =>
        getSupabase().rpc('assign_plan', {
          p_business_id: id,
          p_plan: v.plan,
          p_period_end: v.periodEnd ?? undefined,
          p_notes: v.notes || undefined,
        }),
      ),
    onSuccess: () => invalidateBusiness(qc, id),
  });
}

export function useSetStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { status: string; note: string }) =>
      callAdminRpc(() =>
        getSupabase().rpc('set_business_status', {
          p_business_id: id,
          p_status: v.status,
          p_note: v.note || undefined,
        }),
      ),
    onSuccess: () => invalidateBusiness(qc, id),
  });
}

export function useSetAddon(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { addon: string; enabled: boolean }) =>
      callAdminRpc(() =>
        getSupabase().rpc('set_addon', {
          p_business_id: id,
          p_addon: v.addon,
          p_enabled: v.enabled,
        }),
      ),
    onSuccess: () => invalidateBusiness(qc, id),
  });
}

export function useExtendTrial(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (days: number) =>
      callAdminRpc(() => getSupabase().rpc('extend_trial', { p_business_id: id, p_days: days })),
    onSuccess: () => invalidateBusiness(qc, id),
  });
}

export function useAddSmsCredits(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { amount: number; note: string }) =>
      callAdminRpc(() =>
        getSupabase().rpc('admin_add_sms_credits', {
          p_business: id,
          p_credits: v.amount,
          p_note: v.note || undefined,
        }),
      ),
    onSuccess: () => invalidateBusiness(qc, id),
  });
}

export function useRemoveReview(businessId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { reviewId: string; reason: string }) =>
      callAdminRpc(() =>
        getSupabase().rpc('remove_review', { p_review_id: v.reviewId, p_reason: v.reason }),
      ),
    onSuccess: () => invalidateBusiness(qc, businessId),
  });
}

// ---------------------------------------------------------------------------
// Platform settings (catalogue tables are readable by the aal2 super admin)
// ---------------------------------------------------------------------------
export function usePlansCatalogue() {
  const enabled = useAdminEnabled();
  return useQuery({
    queryKey: adminKeys.list({ ...PLATFORM, filters: { kind: 'plans' } }),
    enabled,
    staleTime: staleTimes.live,
    queryFn: async (): Promise<{ plans: PlanRow[]; addons: AddonRow[] }> => {
      const supabase = getSupabase();
      const [plans, addons] = await Promise.all([
        supabase
          .from('plans')
          .select(
            'key, name, staff_cap, max_branches, features, price_monthly_minor, price_annual_minor, currency, active, priced_per_branch',
          )
          .order('sort_order'),
        supabase
          .from('addons')
          .select(
            'key, name, price_monthly_minor, price_annual_minor, currency, active, available_plans',
          )
          .order('sort_order'),
      ]);
      if (plans.error) throw new Error(plans.error.message);
      if (addons.error) throw new Error(addons.error.message);
      return {
        plans: (plans.data ?? []).map((p) => ({
          key: p.key,
          name: p.name,
          staffCap: p.staff_cap,
          maxBranches: p.max_branches,
          features: rec(p.features) as FeatureMap,
          priceMonthlyMinor: p.price_monthly_minor,
          priceAnnualMinor: p.price_annual_minor,
          currency: p.currency,
          active: p.active,
          pricedPerBranch: p.priced_per_branch,
        })),
        addons: (addons.data ?? []).map((a) => ({
          key: a.key,
          name: a.name,
          priceMonthlyMinor: a.price_monthly_minor,
          priceAnnualMinor: a.price_annual_minor,
          currency: a.currency,
          active: a.active,
          availablePlans: a.available_plans,
        })),
      };
    },
  });
}

export function useSavePlanPrices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      key: string;
      monthly: number;
      annual: number;
      currency: string;
      name: string;
      active: boolean;
      pricedPerBranch: boolean;
    }) =>
      callAdminRpc(() =>
        getSupabase().rpc('set_plan_prices', {
          p_key: v.key,
          p_monthly_minor: v.monthly,
          p_annual_minor: v.annual,
          p_currency: v.currency,
          p_name: v.name,
          p_active: v.active,
          p_priced_per_branch: v.pricedPerBranch,
        }),
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminKeys.lists(PLATFORM) }),
  });
}

export function useSaveAddonPrices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      key: string;
      monthly: number;
      annual: number;
      currency: string;
      name: string;
      active: boolean;
      /** Empty = every plan. */
      availablePlans: PlanKey[];
    }) =>
      callAdminRpc(() =>
        getSupabase().rpc('set_addon_prices', {
          p_key: v.key,
          p_monthly_minor: v.monthly,
          p_annual_minor: v.annual,
          p_currency: v.currency,
          p_name: v.name,
          p_active: v.active,
          p_available_plans: v.availablePlans,
        }),
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminKeys.lists(PLATFORM) }),
  });
}

export function useSmsRates() {
  const enabled = useAdminEnabled();
  return useQuery({
    queryKey: adminKeys.list({ ...PLATFORM, filters: { kind: 'sms-rates' } }),
    enabled,
    staleTime: staleTimes.live,
    queryFn: async (): Promise<SmsRateRow[]> => {
      const { data, error } = await getSupabase()
        .from('sms_country_rates')
        .select('dial_code, country_code, credits_per_segment, note')
        .order('country_code');
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({
        dialCode: r.dial_code,
        countryCode: r.country_code,
        creditsPerSegment: r.credits_per_segment,
        note: r.note,
      }));
    },
  });
}

export function useSaveSmsRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { dial: string; country: string; credits: number; note: string }) =>
      callAdminRpc(() =>
        getSupabase().rpc('admin_set_sms_rate', {
          p_dial: v.dial,
          p_country: v.country,
          p_credits: v.credits,
          p_note: v.note || undefined,
        }),
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminKeys.lists(PLATFORM) }),
  });
}

export function usePresets() {
  const enabled = useAdminEnabled();
  return useQuery({
    queryKey: adminKeys.list({ ...PLATFORM, filters: { kind: 'presets' } }),
    enabled,
    staleTime: staleTimes.live,
    queryFn: async (): Promise<PresetRow[]> => {
      const { data, error } = await getSupabase()
        .from('industry_presets')
        .select('key, name, template_key, active, terminology, starter_custom_fields')
        .order('sort_order')
        .order('name');
      if (error) throw new Error(error.message);
      return (data ?? []).map((p) => ({
        key: p.key,
        name: p.name,
        templateKey: p.template_key,
        active: p.active,
        terminology: rec(p.terminology),
        starterFields: p.starter_custom_fields,
      }));
    },
  });
}

export function useSavePreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      key: string;
      name: string;
      templateKey: string;
      active: boolean;
      terminology: Record<string, string>;
      fields: unknown[];
    }) =>
      callAdminRpc(() =>
        getSupabase().rpc('upsert_industry_preset', {
          p_key: v.key,
          p_name: v.name,
          p_terminology: v.terminology,
          p_starter_fields: v.fields as never,
          p_template_key: v.templateKey,
          p_active: v.active,
        }),
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminKeys.lists(PLATFORM) }),
  });
}
