import { z } from 'zod';

/** Error messages are i18n KEYS (translated by `FormField`), never display text. */
export const productSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'inventory.errors.invalid_name')
    .max(120, 'inventory.errors.invalid_name'),
  sku: z.string().trim().max(60, 'inventory.errors.invalid_sku'),
  unit: z
    .string()
    .trim()
    .min(1, 'inventory.errors.invalid_unit')
    .max(20, 'inventory.errors.invalid_unit'),
  priceMinor: z
    .number('inventory.errors.invalid_price')
    .int('inventory.errors.invalid_price')
    .min(0, 'inventory.errors.invalid_price')
    .max(100_000_000_000, 'inventory.errors.invalid_price'),
  lowStockThreshold: z
    .number('inventory.errors.invalid_threshold')
    .int('inventory.errors.invalid_threshold')
    .min(0, 'inventory.errors.invalid_threshold')
    .max(1_000_000, 'inventory.errors.invalid_threshold')
    .nullable(),
  /** Only used when creating: becomes the opening-stock movement. */
  openingStock: z
    .number('inventory.errors.invalid_quantity')
    .int('inventory.errors.invalid_quantity')
    .min(0, 'inventory.errors.invalid_quantity')
    .max(1_000_000, 'inventory.errors.invalid_quantity'),
  isActive: z.boolean(),
});

export type ProductValues = z.infer<typeof productSchema>;

export const emptyProduct: ProductValues = {
  name: '',
  sku: '',
  unit: 'piece',
  priceMinor: 0,
  lowStockThreshold: null,
  openingStock: 0,
  isActive: true,
};

export const stockMovementSchema = z
  .object({
    kind: z.enum(['purchase', 'adjustment', 'return']),
    direction: z.enum(['in', 'out']),
    quantity: z
      .number('inventory.errors.invalid_quantity')
      .int('inventory.errors.invalid_quantity')
      .min(1, 'inventory.errors.invalid_quantity')
      .max(1_000_000, 'inventory.errors.invalid_quantity'),
    reason: z.string().trim().max(500),
  })
  .superRefine((value, ctx) => {
    if (value.kind !== 'purchase' && value.reason.length < 3) {
      ctx.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'inventory.errors.reason_required',
      });
    }
  });

export type StockMovementValues = z.infer<typeof stockMovementSchema>;
