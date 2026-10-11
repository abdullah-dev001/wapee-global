import { useRouter } from 'expo-router';
import { AlertTriangle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import { Badge } from '@/components/ui';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { theme } from '@/lib/theme';

import { useLowStockCount } from '../api/useInventory';

/**
 * "N products low on stock": shown to holders of `inventory.view` while the Inventory add-on is
 * on (`usePermission` already includes the add-on gate) and at least one product is at or
 * below its alert level. Pressing it opens Inventory.
 */
export function LowStockBadge() {
  const { t } = useTranslation();
  const router = useRouter();
  const { businessId, branchId } = useCurrentScope();
  const canView = usePermission('inventory.view', branchId);
  const count = useLowStockCount(businessId, branchId, canView.allowed);

  if (!canView.allowed || !count.data) return null;
  const label = t('inventory.lowBadge', { count: count.data });
  return (
    <Pressable
      onPress={() => router.push('/inventory')}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${t('inventory.lowBadgeOpen')}`}
    >
      <Badge
        tone="warning"
        icon={<AlertTriangle size={11} strokeWidth={2} color={theme.colors.warning} />}
      >
        {label}
      </Badge>
    </Pressable>
  );
}
