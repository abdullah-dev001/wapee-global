import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, type ReactNode } from 'react';
import { useForm, type Control, type DefaultValues, type FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { type z } from 'zod';

import { Dialog, Text, useToast, type ButtonVariant } from '@/components/ui';
import { theme } from '@/lib/theme';

import { useAdminMessage } from './useAdminMessage';

export type AdminFormDialogProps<TValues extends FieldValues> = {
  open: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  /** Shown under the form: the admin is told what gets logged. */
  auditNote?: string;
  confirmLabel: string;
  confirmVariant?: ButtonVariant;
  schema: z.ZodType<TValues>;
  defaultValues: DefaultValues<TValues>;
  /** Runs the mutation; throw to show the error under the form (toast). */
  onSubmit: (values: TValues) => Promise<unknown>;
  successMessage: string;
  children: (control: Control<TValues>) => ReactNode;
};

/**
 * Confirm dialog with a small react-hook-form + zod form inside. Resets whenever
 * it opens, disables the confirm while submitting, toasts the result and maps the
 * server's reason code to a message.
 */
export function AdminFormDialog<TValues extends FieldValues>({
  open,
  onClose,
  title,
  message,
  auditNote,
  confirmLabel,
  confirmVariant = 'primary',
  schema,
  defaultValues,
  onSubmit,
  successMessage,
  children,
}: AdminFormDialogProps<TValues>) {
  const { t } = useTranslation();
  const toast = useToast();
  const messageOf = useAdminMessage();
  const form = useForm<TValues>({
    resolver: zodResolver(schema as never),
    defaultValues,
  });
  const { isSubmitting } = form.formState;

  useEffect(() => {
    if (open) form.reset(defaultValues);
    // Reset on open only; the defaults are fresh per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(values);
      toast.show({ message: successMessage, tone: 'success' });
      onClose();
    } catch (error) {
      toast.show({ message: messageOf(error), tone: 'error' });
    }
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      message={message}
      cancelLabel={t('actions.cancel')}
      busy={isSubmitting}
      confirm={{
        label: confirmLabel,
        variant: confirmVariant,
        loading: isSubmitting,
        onPress: () => void submit(),
      }}
    >
      <View style={styles.body}>
        {children(form.control)}
        {auditNote ? (
          <Text variant="helper" color="textSecondary">
            {auditNote}
          </Text>
        ) : null}
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({ body: { gap: theme.spacing[12] } });
