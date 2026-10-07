import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Dialog, Input, Text, useToast } from '@/components/ui';
import { theme } from '@/lib/theme';

import { DataRightsError, useEraseClient } from '../api/useClientData';
import { dataRightsErrorKey, namesMatch } from '../dataRightsLogic';

export type EraseClientDialogProps = {
  open: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  onDone?: () => void;
};

/**
 * Erase one client's personal data. The person types the client's name to confirm; the dialog says plainly what is
 * removed and what is kept (financial records), and shows the reason inline when the server refuses (upcoming
 * appointment, draft invoice), so it is still readable after the toast is gone.
 */
export function EraseClientDialog(props: EraseClientDialogProps) {
  // Mounted only while open, so the typed text and any error start empty every time.
  return props.open ? <EraseClientDialogBody {...props} /> : null;
}

function EraseClientDialogBody({
  open,
  onClose,
  clientId,
  clientName,
  onDone,
}: EraseClientDialogProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const erase = useEraseClient();
  const [typed, setTyped] = useState('');
  const [errorKey, setErrorKey] = useState<ReturnType<typeof dataRightsErrorKey> | null>(null);

  const matches = namesMatch(typed, clientName);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={erase.isPending}
      title={t('dataRights.erase.title', { name: clientName })}
      confirm={{
        label: t('dataRights.erase.confirm'),
        variant: 'danger',
        loading: erase.isPending,
        disabled: !matches,
        onPress: () => {
          setErrorKey(null);
          erase.mutate(clientId, {
            onSuccess: (result) => {
              toast.show({
                message:
                  result.storagePending > 0
                    ? t('dataRights.erase.doneStoragePending')
                    : t('dataRights.erase.done'),
                tone: result.storagePending > 0 ? 'error' : 'success',
              });
              onDone?.();
              onClose();
            },
            onError: (error) =>
              setErrorKey(dataRightsErrorKey(error instanceof DataRightsError ? error.code : null)),
          });
        },
      }}
    >
      <View style={styles.block}>
        <Text variant="paragraph" color="textSecondary">
          {t('dataRights.erase.intro')}
        </Text>
        <Text variant="label">{t('dataRights.erase.removedTitle')}</Text>
        <Text variant="helper" color="textSecondary">
          {t('dataRights.erase.removedBody')}
        </Text>
        <Text variant="label">{t('dataRights.erase.keptTitle')}</Text>
        <Text variant="helper" color="textSecondary">
          {t('dataRights.erase.keptBody')}
        </Text>
        <Text variant="helper" color="textSecondary">
          {t('dataRights.erase.blockedNote')}
        </Text>
        <Input
          label={t('dataRights.erase.typeName', { name: clientName })}
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!erase.isPending}
          error={errorKey ? t(errorKey) : undefined}
        />
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  block: { gap: theme.spacing[8] },
});
