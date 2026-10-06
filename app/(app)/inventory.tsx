import { InventoryScreen } from '@/features/inventory/components';
import { RouteGuard } from '@/features/auth';
import { RequireFeature } from '@/features/plans/components';

/** Add-on "Inventory": hidden and refused while the add-on is off. */
export default function InventoryRoute() {
  return (
    <RouteGuard>
      <RequireFeature feature="inventory">
        <InventoryScreen />
      </RequireFeature>
    </RouteGuard>
  );
}
