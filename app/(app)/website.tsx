import { RouteGuard } from '@/features/auth';
import { WebsiteEditorScreen } from '@/features/website/components/editor/WebsiteEditorScreen';

export default function WebsiteRoute() {
  return (
    <RouteGuard>
      <WebsiteEditorScreen />
    </RouteGuard>
  );
}
