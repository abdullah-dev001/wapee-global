import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { AlertTriangle, CheckCircle2, Circle, Copy, Globe, UserPlus } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Badge, Button, Card, ProgressBar, Text, useToast } from '@/components/ui';
import { brand } from '@/config/brand';
import { type PermissionKey } from '@/config/permissions';
import { useMyStaffProfile } from '@/features/appointments/api/useMyStaffProfile';
import { planErrorKey } from '@/features/plans/planErrors';
import { useAddMeAsStaff } from '@/features/staff/api/useStaff';
import { linkErrorKey } from '@/features/staff/staffLogin';
import { useWebsiteAdmin } from '@/features/website/api/useWebsiteAdmin';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { theme } from '@/lib/theme';

import { useBranchBookable, useDismissSetupChecklist } from '../api';
import { bookingUrl, fixRouteFor, type BookableReason } from '../bookingWarnings';
import {
  firstMissingReason,
  nextSetupStep,
  setupCardMode,
  setupProgress,
  setupSteps,
  setupStepsComplete,
  type SetupStep,
  type SetupStepId,
} from '../setupChecklist';

/** Who can DO each step (the same permission its screen needs). */
const STEP_PERMISSION: Record<SetupStepId, PermissionKey> = {
  hours: 'settings.business',
  service: 'services.manage',
  staff: 'staff.manage',
  link_service: 'services.manage',
  staff_hours: 'staff.manage_schedule',
  enable_booking: 'settings.booking',
};

/**
 * "Get ready for your first booking" on Today.
 *
 * Shown to people with `settings.booking` only. What is done and what is missing is derived from
 * `branch_is_bookable()` (see `setupChecklist.ts`); the only thing stored is the dismissal, per
 * business. After a dismissal it becomes a small banner again if booking becomes unavailable.
 */
export function SetupChecklist() {
  const { businessId, branchId, business } = useCurrentScope();
  const canSee = usePermission('settings.booking', branchId);
  const bookable = useBranchBookable(canSee.allowed ? businessId : null, branchId);

  if (!canSee.allowed || !business) return null;

  const mode = setupCardMode(bookable.data, business.setup_checklist_dismissed_at !== null);
  if (mode === 'hidden') return null;
  if (mode === 'banner') return <SetupBanner reason={firstMissingReason(bookable.data)} />;

  return (
    <Checklist
      steps={setupSteps(bookable.data)}
      complete={setupStepsComplete(bookable.data)}
      slug={business.slug}
      businessId={business.id}
    />
  );
}

function Checklist({
  steps,
  complete,
  slug,
  businessId,
}: {
  steps: SetupStep[];
  complete: boolean;
  slug: string;
  businessId: string;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const dismiss = useDismissSetupChecklist(businessId);
  const progress = setupProgress(steps);
  const next = nextSetupStep(steps);
  const url = bookingUrl(brand.urls.site, slug);

  const finish = async (copyLink: boolean) => {
    if (copyLink) {
      await Clipboard.setStringAsync(url);
      toast.show({ message: t('bookingSettings.linkCopied'), tone: 'success' });
    }
    dismiss.mutate(undefined, {
      onError: (error) => toast.show({ message: error.message, tone: 'error' }),
    });
  };

  return (
    <Card>
      <View style={styles.stack}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text variant="cardTitle">{t('setup.title')}</Text>
            <Text variant="helper" color="textSecondary">
              {t('setup.subtitle')}
            </Text>
          </View>
          <Button
            variant="ghost"
            size="sm"
            loading={dismiss.isPending}
            onPress={() => void finish(false)}
          >
            {t('setup.dismiss')}
          </Button>
        </View>

        <View style={styles.progress}>
          <ProgressBar
            ratio={progress.ratio}
            accessibilityLabel={t('setup.progress', { done: progress.done, total: progress.total })}
          />
          <Text variant="helper" color="textSecondary">
            {t('setup.progress', { done: progress.done, total: progress.total })}
          </Text>
        </View>

        <View style={styles.steps}>
          {steps.map((step) => (
            <StepRow key={step.id} step={step} highlighted={next?.id === step.id} />
          ))}

          <ShareRow
            ready={complete}
            url={url}
            busy={dismiss.isPending}
            onCopy={() => void finish(true)}
          />
          <WebsiteRow />
        </View>
      </View>
    </Card>
  );
}

function StepRow({ step, highlighted }: { step: SetupStep; highlighted: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const router = useRouter();
  const { businessId, branchId } = useCurrentScope();
  const canDo = usePermission(STEP_PERMISSION[step.id], branchId);
  const canAddStaff = usePermission('staff.manage', branchId);
  const myProfile = useMyStaffProfile(businessId);
  const addMe = useAddMeAsStaff(businessId, branchId);

  // The solo-owner explanation + one-click fix belongs to the "add staff" step: the owner is not
  // a staff member by default, and a business with nobody to book cannot take bookings.
  const showAddMe =
    step.id === 'staff' &&
    !step.done &&
    canAddStaff.allowed &&
    myProfile.isSuccess &&
    myProfile.data === null;

  return (
    <View style={styles.row}>
      {step.done ? (
        <CheckCircle2
          size={theme.iconSize.md}
          strokeWidth={theme.iconStroke}
          color={theme.colors.success}
        />
      ) : (
        <Circle
          size={theme.iconSize.md}
          strokeWidth={theme.iconStroke}
          color={theme.colors.textMuted}
        />
      )}

      <View style={styles.rowText}>
        <Text variant="bodyStrong" color={step.done ? 'textSecondary' : 'textPrimary'}>
          {t(`setup.steps.${step.id}.title`)}
        </Text>
        {!step.done ? (
          <Text variant="helper" color="textSecondary">
            {t(`setup.steps.${step.id}.description`)}
          </Text>
        ) : null}

        {showAddMe ? (
          <View style={styles.addMe}>
            <Text variant="helper" color="textSecondary">
              {t('setup.solo')}
            </Text>
            <Button
              size="sm"
              variant="secondary"
              startIcon={UserPlus}
              loading={addMe.isPending}
              onPress={() =>
                addMe.mutate(undefined, {
                  onSuccess: () => toast.show({ message: t('staff.addMe.done'), tone: 'success' }),
                  onError: (error) => {
                    const key = planErrorKey(error) ?? linkErrorKey(error);
                    toast.show({ message: key ? t(key) : error.message, tone: 'error' });
                  },
                })
              }
            >
              {t('staff.addMe.action')}
            </Button>
          </View>
        ) : null}

        {!step.done && !canDo.allowed ? (
          <Text variant="helper" color="textMuted">
            {t('setup.askOwner')}
          </Text>
        ) : null}
      </View>

      {!step.done && canDo.allowed ? (
        <Button
          size="sm"
          variant={highlighted ? 'primary' : 'secondary'}
          onPress={() => router.push(step.route as '/schedule')}
        >
          {t(`setup.steps.${step.id}.action`)}
        </Button>
      ) : null}
    </View>
  );
}

function ShareRow({
  ready,
  url,
  busy,
  onCopy,
}: {
  ready: boolean;
  url: string;
  busy: boolean;
  onCopy: () => void;
}) {
  const { t } = useTranslation();

  return (
    <View style={styles.row}>
      <Circle
        size={theme.iconSize.md}
        strokeWidth={theme.iconStroke}
        color={theme.colors.textMuted}
      />
      <View style={styles.rowText}>
        <Text variant="bodyStrong" color={ready ? 'textPrimary' : 'textSecondary'}>
          {t('setup.steps.share.title')}
        </Text>
        <Text variant="helper" color="textSecondary" selectable={ready}>
          {ready ? url : t('setup.steps.share.locked')}
        </Text>
      </View>
      {ready ? (
        <Button size="sm" startIcon={Copy} loading={busy} onPress={onCopy}>
          {t('setup.steps.share.action')}
        </Button>
      ) : null}
    </View>
  );
}

/** Optional: only people who can edit the website see it, and only while it is unpublished. */
function WebsiteRow() {
  const { t } = useTranslation();
  const router = useRouter();
  const { businessId } = useCurrentScope();
  const canEdit = usePermission('website.edit');
  const site = useWebsiteAdmin(canEdit.allowed ? businessId : null);

  if (!canEdit.allowed || !site.isSuccess || site.data.website?.isPublished === true) return null;

  return (
    <View style={styles.row}>
      <Globe
        size={theme.iconSize.md}
        strokeWidth={theme.iconStroke}
        color={theme.colors.textMuted}
      />
      <View style={styles.rowText}>
        <View style={styles.titleLine}>
          <Text variant="bodyStrong">{t('setup.steps.website.title')}</Text>
          <Badge tone="neutral">{t('setup.optional')}</Badge>
        </View>
        <Text variant="helper" color="textSecondary">
          {t('setup.steps.website.description')}
        </Text>
      </View>
      <Button size="sm" variant="secondary" onPress={() => router.push('/website')}>
        {t('setup.steps.website.action')}
      </Button>
    </View>
  );
}

/** After a dismissal: a small reminder that booking is not available right now. */
function SetupBanner({ reason }: { reason: BookableReason | null }) {
  const { t } = useTranslation();
  const router = useRouter();
  if (!reason) return null;
  const route = fixRouteFor(reason);

  return (
    <Card style={styles.banner}>
      <View style={styles.bannerRow}>
        <AlertTriangle
          size={theme.iconSize.md}
          strokeWidth={theme.iconStroke}
          color={theme.colors.warning}
        />
        <View style={styles.rowText}>
          <Text variant="bodyStrong">{t('setup.banner.title')}</Text>
          <Text variant="helper" color="textSecondary">
            {t(`bookingSettings.warning.${reason}`)}
          </Text>
        </View>
        {route ? (
          <Button size="sm" variant="secondary" onPress={() => router.push(route)}>
            {t('setup.banner.action')}
          </Button>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[16] },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing[12] },
  headerText: { flex: 1, gap: theme.spacing[2] },
  progress: { gap: theme.spacing[6] },
  steps: { gap: theme.spacing[14] },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing[12] },
  rowText: { flex: 1, gap: theme.spacing[4] },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[8],
    flexWrap: 'wrap',
  },
  addMe: { gap: theme.spacing[8], alignItems: 'flex-start', marginTop: theme.spacing[4] },
  banner: {
    borderColor: theme.colors.warningBorder,
    backgroundColor: theme.colors.warningLight,
  },
  bannerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing[12] },
});
