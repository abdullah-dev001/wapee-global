/**
 * Pure rules for inventory. The database decides everything (stock only moves through
 * `stock_movements`, `adjust_stock`, `issue_invoice`); these helpers only label a product
 * and map error codes.
 */

export type StockState = 'out' | 'low' | 'ok';

/** Out = nothing (or less) left; low = at or below the alert level; ok otherwise. */
export function stockState(stock: number, threshold: number | null): StockState {
  if (stock <= 0) return 'out';
  if (threshold !== null && stock <= threshold) return 'low';
  return 'ok';
}

/** The alert badge counts a product at/below its level (same rule as `low_stock_count`). */
export function isLowStock(stock: number, threshold: number | null, active: boolean): boolean {
  return active && threshold !== null && stock <= threshold;
}

export type MovementKind = 'purchase' | 'adjustment' | 'sale' | 'return';

/** Signed quantity as text: "+5", "-3". */
export function signedQuantity(quantity: number): string {
  return quantity > 0 ? `+${quantity}` : String(quantity);
}

/** Manual movement kinds a person may enter (sales/returns on invoices are automatic). */
export const MANUAL_KINDS = ['purchase', 'adjustment', 'return'] as const;
export type ManualKind = (typeof MANUAL_KINDS)[number];

/** A manual movement's signed quantity from the form: adjustments carry their own sign. */
export function manualQuantity(kind: ManualKind, amount: number, direction: 'in' | 'out'): number {
  if (kind === 'adjustment') return direction === 'out' ? -Math.abs(amount) : Math.abs(amount);
  return Math.abs(amount);
}

export const INVENTORY_ERROR_KEYS = {
  forbidden: 'inventory.errors.forbidden',
  feature_unavailable: 'inventory.errors.feature_unavailable',
  not_found: 'inventory.errors.not_found',
  invalid_name: 'inventory.errors.invalid_name',
  invalid_sku: 'inventory.errors.invalid_sku',
  invalid_unit: 'inventory.errors.invalid_unit',
  invalid_price: 'inventory.errors.invalid_price',
  invalid_threshold: 'inventory.errors.invalid_threshold',
  invalid_quantity: 'inventory.errors.invalid_quantity',
  invalid_kind: 'inventory.errors.invalid_kind',
  invalid_value: 'inventory.errors.invalid_value',
  duplicate_sku: 'inventory.errors.duplicate_sku',
  reason_required: 'inventory.errors.reason_required',
  insufficient_stock: 'inventory.errors.insufficient_stock',
  unknown: 'inventory.errors.unknown',
} as const;

export type InventoryErrorCode = keyof typeof INVENTORY_ERROR_KEYS;

export function inventoryErrorKey(
  code: string | null,
): (typeof INVENTORY_ERROR_KEYS)[InventoryErrorCode] {
  if (code && Object.prototype.hasOwnProperty.call(INVENTORY_ERROR_KEYS, code)) {
    return INVENTORY_ERROR_KEYS[code as InventoryErrorCode];
  }
  return INVENTORY_ERROR_KEYS.unknown;
}
