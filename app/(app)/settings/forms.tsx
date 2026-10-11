import { RouteGuard } from '@/features/auth';
import { FormsSettingsScreen } from '@/features/forms/components';
import { RequirePermission } from '@/features/notifications/components';
import { RequireFeature } from '@/features/plans/components';

/** Add-on "Forms & Consent": hidden and refused while the add-on is off. */
export default function FormsRoute() {
  return (
    <RouteGuard>
      <RequirePermission permission="forms.manage">
        <RequireFeature feature="forms_consent">
          <FormsSettingsScreen />
        </RequireFeature>
      </RequirePermission>
    </RouteGuard>
  );
}
