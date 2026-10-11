import { describe, expect, it } from 'vitest';

import {
  inventoryErrorKey,
  isLowStock,
  manualQuantity,
  signedQuantity,
  stockState,
} from './inventoryLogic';

describe('stockState', () => {
  it('out at zero or below, low at or below the level, ok above', () => {
    expect(stockState(0, 5)).toBe('out');
    expect(stockState(-3, null)).toBe('out');
    expect(stockState(5, 5)).toBe('low');
    expect(stockState(6, 5)).toBe('ok');
    expect(stockState(2, null)).toBe('ok');
  });
});

describe('isLowStock', () => {
  it('needs a level, an active product, and stock at or below the level (as low_stock_count)', () => {
    expect(isLowStock(5, 5, true)).toBe(true);
    expect(isLowStock(6, 5, true)).toBe(false);
    expect(isLowStock(1, null, true)).toBe(false);
    expect(isLowStock(1, 5, false)).toBe(false);
  });
});

describe('quantities', () => {
  it('signs a movement', () => {
    expect(signedQuantity(5)).toBe('+5');
    expect(signedQuantity(-3)).toBe('-3');
  });
  it('purchases and returns are always positive, adjustments follow the direction', () => {
    expect(manualQuantity('purchase', 4, 'out')).toBe(4);
    expect(manualQuantity('return', -4, 'in')).toBe(4);
    expect(manualQuantity('adjustment', 4, 'out')).toBe(-4);
    expect(manualQuantity('adjustment', 4, 'in')).toBe(4);
  });
});

describe('inventoryErrorKey', () => {
  it('maps known codes and falls back', () => {
    expect(inventoryErrorKey('insufficient_stock')).toBe('inventory.errors.insufficient_stock');
    expect(inventoryErrorKey('nope')).toBe('inventory.errors.unknown');
    expect(inventoryErrorKey(null)).toBe('inventory.errors.unknown');
  });
});
