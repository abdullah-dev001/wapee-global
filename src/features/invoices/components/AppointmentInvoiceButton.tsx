import { Receipt } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button, useToast, type ButtonSize, type ButtonVariant } from '@/components/ui';
import { usePermission } from '@/lib/permissions';

import { useCreateInvoiceDraft } from '../api/useInvoices';
import { InvoiceRpcError } from '../types';

export type AppointmentInvoiceButtonProps = {
  businessId: string | null;
  appointmentId: string;
  /** The live invoice this appointment already has, if any. */
  invoiceId: string | null;
  size?: ButtonSize;
  variant?: ButtonVariant;
  /** Called right before navigating to the invoice, so the caller can close its drawer/overlay first. */
  onNavigate?: () => void;
};

/**
 * "Create invoice" / "View invoice" for a COMPLETED appointment. Creating makes
 * a draft prefilled by the server (service line at the booked price) and opens
 * it in the Invoices screen. Which one shows depends on the live link AND the
 * caller's permission (`invoices.create` / `invoices.view`).
 */
export function AppointmentInvoiceButton({
  businessId,
  appointmentId,
  invoiceId,
  size = 'md',
  variant = 'secondary',
  onNavigate,
}: AppointmentInvoiceButtonProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const canCreate = usePermission('invoices.create').allowed;
  const canView = usePermission('invoices.view').allowed;
  const create = useCreateInvoiceDraft(businessId);

  const open = (id: string) => {
    onNavigate?.();
    router.push({ pathname: '/invoices', params: { invoice: id } });
  };

  if (invoiceId) {
    if (!canView) return null;
    return (
      <Button size={size} variant={variant} startIcon={Receipt} onPress={() => open(invoiceId)}>
        {t('invoices.actions.viewInvoice')}
      </Button>
    );
  }
  if (!canCreate) return null;

  return (
    <Button
      size={size}
      variant={variant}
      startIcon={Receipt}
      loading={create.isPending}
      onPress={() =>
        create.mutate(
          { appointmentId },
          {
            onSuccess: (id) => {
              toast.show({ message: t('invoices.toast.draftFromAppointment'), tone: 'success' });
              open(id);
            },
            onError: (error) =>
              toast.show({
                message:
                  error instanceof InvoiceRpcError
                    ? t(`invoices.errors.${error.code}`)
                    : error.message,
                tone: 'error',
              }),
          },
        )
      }
    >
      {t('invoices.actions.createInvoice')}
    </Button>
  );
}
