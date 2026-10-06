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
import { rpcNull, unwrapRpc } from '@/lib/supabase/rpcResult';

import { type MovementKind } from '../inventoryLogic';
import { type ProductValues } from '../schemas/inventory.schemas';

export const productKeys = createQueryKeys('products');
export const movementKeys = createQueryKeys('stock-movements');
export const inventorySettingsKeys = createQueryKeys('inventory-settings');
export const lowStockKeys = createQueryKeys('low-stock-count');

const PAGE_SIZE = 20;

export type ProductItem = {
  id: string;
  branchId: string;
  name: string;
  sku: string | null;
  unit: string;
  priceMinor: number;
  currency: string;
  stockQty: number;
  lowStockThreshold: number | null;
  isActive: boolean;
};

type ProductRow = {
  id: string;
  branch_id: string;
  name: string;
  sku: string | null;
  unit: string;
  price_minor: number;
  currency: string;
  stock_qty: number;
  low_stock_threshold: number | null;
  is_active: boolean;
};

const PRODUCT_COLUMNS =
  'id, branch_id, name, sku, unit, price_minor, currency, stock_qty, low_stock_threshold, is_active';

function mapProduct(row: ProductRow): ProductItem {
  return {
    id: row.id,
    branchId: row.branch_id,
    name: row.name,
    sku: row.sku,
    unit: row.unit,
    priceMinor: row.price_minor,
    currency: row.currency,
    stockQty: row.stock_qty,
    lowStockThreshold: row.low_stock_threshold,
    isActive: row.is_active,
  };
}

type ProductPage = { rows: ProductItem[]; nextOffset: number | null };

/** Products of one branch: server-side search (name / SKU, trigram) and pages of 20. */
export function useProducts(
  businessId: string | null,
  branchId: string | null,
  options: { search?: string; includeInactive?: boolean } = {},
) {
  const { isAuthenticated } = useSession();
  const { search = '', includeInactive = true } = options;

  return useInfiniteQuery<ProductPage>({
    queryKey: productKeys.list({
      businessId: businessId ?? 'none',
      branchId,
      search,
      filters: { includeInactive },
    }),
    enabled: isAuthenticated && Boolean(businessId) && Boolean(branchId),
    staleTime: staleTimes.list,
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset,
    queryFn: async ({ pageParam }) => {
      const offset = pageParam as number;
      let query = getSupabase()
        .from('products')
        .select(PRODUCT_COLUMNS)
        .eq('business_id', businessId ?? '')
        .eq('branch_id', branchId ?? '')
        .is('deleted_at', null);
      if (!includeInactive) query = query.eq('is_active', true);
      if (search.length >= 2) query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);

      const { data, error } = await query
        .order('name', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE);
      if (error) throw new Error(error.message);

      const all = data ?? [];
      const hasMore = all.length > PAGE_SIZE;
      return {
        rows: (hasMore ? all.slice(0, PAGE_SIZE) : all).map(mapProduct),
        nextOffset: hasMore ? offset + PAGE_SIZE : null,
      };
    },
  });
}

/** Active products of a branch for the invoice editor's picker (at most 100: the server cap). */
export function useProductOptions(
  businessId: string | null,
  branchId: string | null,
  enabled: boolean,
): UseQueryResult<ProductItem[], Error> {
  const { isAuthenticated } = useSession();
  return useQuery({
    queryKey: productKeys.list({
      businessId: businessId ?? 'none',
      branchId,
      filters: { options: true },
      pageSize: 100,
    }),
    enabled: isAuthenticated && enabled && Boolean(businessId) && Boolean(branchId),
    staleTime: staleTimes.liveShort,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('products')
        .select(PRODUCT_COLUMNS)
        .eq('business_id', businessId ?? '')
        .eq('branch_id', branchId ?? '')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('name', { ascending: true })
        .limit(100);
      if (error) throw new Error(error.message);
      return (data ?? []).map(mapProduct);
    },
  });
}

export type StockMovementItem = {
  id: string;
  kind: MovementKind;
  quantity: number;
  stockAfter: number;
  reason: string | null;
  invoiceId: string | null;
  createdAt: string;
};

type MovementPage = { rows: StockMovementItem[]; nextOffset: number | null };

/** The immutable log of one product, newest first, pages of 20. */
export function useStockMovements(businessId: string | null, productId: string | null) {
  const { isAuthenticated } = useSession();
  return useInfiniteQuery<MovementPage>({
    queryKey: movementKeys.list({ businessId: businessId ?? 'none', filters: { productId } }),
    enabled: isAuthenticated && Boolean(businessId) && Boolean(productId),
    staleTime: staleTimes.liveShort,
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset,
    queryFn: async ({ pageParam }) => {
      const offset = pageParam as number;
      const { data, error } = await getSupabase()
        .from('stock_movements')
        .select('id, kind, quantity, stock_after, reason, invoice_id, created_at')
        .eq('product_id', productId ?? '')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + PAGE_SIZE);
      if (error) throw new Error(error.message);

      const all = data ?? [];
      const hasMore = all.length > PAGE_SIZE;
      return {
        rows: (hasMore ? all.slice(0, PAGE_SIZE) : all).map((row) => ({
          id: row.id,
          kind: row.kind,
          quantity: row.quantity,
          stockAfter: row.stock_after,
          reason: row.reason,
          invoiceId: row.invoice_id,
          createdAt: row.created_at,
        })),
        nextOffset: hasMore ? offset + PAGE_SIZE : null,
      };
    },
  });
}

/** The branch's "allow negative stock" switch (no row = off). */
export function useInventorySettings(businessId: string | null, branchId: string | null) {
  const { isAuthenticated } = useSession();
  return useQuery({
    queryKey: inventorySettingsKeys.detail(
      { businessId: businessId ?? 'none', branchId },
      'settings',
    ),
    enabled: isAuthenticated && Boolean(businessId) && Boolean(branchId),
    staleTime: staleTimes.static,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('inventory_settings')
        .select('allow_negative_stock')
        .eq('branch_id', branchId ?? '')
        .maybeSingle();
      if (error) throw new Error(error.message);
      return { allowNegativeStock: data?.allow_negative_stock ?? false };
    },
  });
}

/** Products at or below their alert level (the dashboard badge). 0 when the add-on is off (RLS). */
export function useLowStockCount(
  businessId: string | null,
  branchId: string | null,
  enabled: boolean,
): UseQueryResult<number, Error> {
  const { isAuthenticated } = useSession();
  return useQuery({
    queryKey: lowStockKeys.detail({ businessId: businessId ?? 'none', branchId }, 'count'),
    enabled: isAuthenticated && enabled && Boolean(businessId),
    staleTime: staleTimes.liveShort,
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc('low_stock_count', {
        p_business_id: businessId ?? '',
        p_branch_id: branchId ?? undefined,
      });
      if (error) throw new Error(error.message);
      return data ?? 0;
    },
  });
}

/** Everything a stock change touches: the lists, the log, the badge. */
export function invalidateInventory(
  queryClient: ReturnType<typeof useQueryClient>,
  businessId: string,
) {
  void queryClient.invalidateQueries({ queryKey: productKeys.business(businessId) });
  void queryClient.invalidateQueries({ queryKey: movementKeys.business(businessId) });
  void queryClient.invalidateQueries({ queryKey: lowStockKeys.business(businessId) });
}

export function useSaveProduct(businessId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      branchId: string;
      productId: string | null;
      values: ProductValues;
    }) => {
      const { values } = input;
      const { data, error } = await getSupabase().rpc('save_product', {
        p_branch_id: input.branchId,
        p_product_id: input.productId ?? rpcNull<string>(),
        p_name: values.name,
        p_sku: values.sku || rpcNull<string>(),
        p_unit: values.unit,
        p_price_minor: values.priceMinor,
        p_low_stock_threshold: values.lowStockThreshold ?? rpcNull<number>(),
        p_is_active: values.isActive,
        p_opening_stock: input.productId ? 0 : values.openingStock,
      });
      return unwrapRpc<{ product_id: string }>(data, error);
    },
    onSuccess: () => businessId && invalidateInventory(queryClient, businessId),
  });
}

export function useDeleteProduct(businessId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (productId: string) => {
      const { data, error } = await getSupabase().rpc('delete_product', {
        p_product_id: productId,
      });
      return unwrapRpc(data, error);
    },
    onSuccess: () => businessId && invalidateInventory(queryClient, businessId),
  });
}

export function useAdjustStock(businessId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      productId: string;
      kind: 'purchase' | 'adjustment' | 'return';
      quantity: number;
      reason: string;
    }) => {
      const { data, error } = await getSupabase().rpc('adjust_stock', {
        p_product_id: input.productId,
        p_kind: input.kind,
        p_quantity: input.quantity,
        p_reason: input.reason || undefined,
      });
      return unwrapRpc<{ stock: number }>(data, error);
    },
    onSuccess: () => businessId && invalidateInventory(queryClient, businessId),
  });
}

export function useSetInventorySettings(businessId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { branchId: string; allowNegativeStock: boolean }) => {
      const { data, error } = await getSupabase().rpc('set_inventory_settings', {
        p_branch_id: input.branchId,
        p_allow_negative_stock: input.allowNegativeStock,
      });
      return unwrapRpc(data, error);
    },
    onSuccess: () => {
      if (businessId) {
        void queryClient.invalidateQueries({
          queryKey: inventorySettingsKeys.business(businessId),
        });
      }
    },
  });
}
