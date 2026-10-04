import { useLocalSearchParams } from 'expo-router';

import { ClientProfileScreen } from '@/features/clients/components/ClientProfileScreen';
import { RouteGuard } from '@/features/auth';

export default function ClientProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RouteGuard>
      <ClientProfileScreen clientId={id} />
    </RouteGuard>
  );
}
