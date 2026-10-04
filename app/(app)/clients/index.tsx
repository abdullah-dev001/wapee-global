import { ClientsScreen } from '@/features/clients/components/ClientsScreen';
import { RouteGuard } from '@/features/auth';

export default function Clients() {
  return (
    <RouteGuard>
      <ClientsScreen />
    </RouteGuard>
  );
}
