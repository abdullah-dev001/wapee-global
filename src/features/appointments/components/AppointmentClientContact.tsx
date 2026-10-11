import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { Copy, Mail, MessageCircle, Phone, type LucideIcon } from 'lucide-react-native';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text, useToast } from '@/components/ui';
import { useClient } from '@/features/clients/api/useClients';
import {
  contactState,
  formatPhoneDisplay,
  mailtoUrl,
  telUrl,
  whatsappUrl,
} from '@/features/clients/contactLinks';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { theme } from '@/lib/theme';

type Props = { clientId: string; onNavigate: () => void };

/**
 * Phone / email of the appointment's client, with Call, WhatsApp, Email and Copy.
 *
 * The data comes from `clients_v`, which the DATABASE blanks without `clients.view_contact`
 * and which only returns clients the viewer may see (Own / Branch / All via RLS). This
 * component additionally skips the request and renders nothing for viewers without the
 * permission, so the name-only view is the default for anyone not allowed.
 */
export function AppointmentClientContact({ clientId, onNavigate }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const { businessId } = useCurrentScope();
  const canContact = usePermission('clients.view_contact');
  const canViewClient = usePermission('clients.view');
  const client = useClient(businessId, clientId, { enabled: canContact.allowed });

  // A client the viewer cannot read (Own scope) errors: stay on the name only.
  const readable = canContact.allowed && !client.isError;
  const phoneState = contactState(readable, client.data?.phoneE164);
  const emailState = contactState(readable, client.data?.email);

  const copy = (value: string) => {
    void Clipboard.setStringAsync(value).then(() =>
      toast.show({ message: t('appointments.detail.copied'), tone: 'success' }),
    );
  };
  const open = (url: string) => {
    void Linking.openURL(url).catch(() =>
      toast.show({ message: t('appointments.detail.openFailed'), tone: 'error' }),
    );
  };

  const phone = client.data?.phoneE164 ?? '';
  const email = client.data?.email ?? '';

  return (
    <View style={styles.block}>
      {phoneState === 'present' ? (
        <ContactRow
          text={formatPhoneDisplay(phone)}
          actions={[
            { icon: Phone, label: t('appointments.detail.call'), onPress: () => open(telUrl(phone)) },
            {
              icon: MessageCircle,
              label: t('appointments.detail.whatsapp'),
              onPress: () => open(whatsappUrl(phone)),
            },
            { icon: Copy, label: t('appointments.detail.copy'), onPress: () => copy(phone) },
          ]}
        />
      ) : phoneState === 'missing' && client.isSuccess ? (
        <Text variant="helper" color="textSecondary">
          {t('appointments.detail.noPhone')}
        </Text>
      ) : null}

      {emailState === 'present' ? (
        <ContactRow
          text={email}
          actions={[
            {
              icon: Mail,
              label: t('appointments.detail.sendEmail'),
              onPress: () => open(mailtoUrl(email)),
            },
            { icon: Copy, label: t('appointments.detail.copy'), onPress: () => copy(email) },
          ]}
        />
      ) : emailState === 'missing' && client.isSuccess ? (
        <Text variant="helper" color="textSecondary">
          {t('appointments.detail.noEmail')}
        </Text>
      ) : null}

      {canViewClient.allowed ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            onNavigate();
            router.push({ pathname: '/clients/[id]', params: { id: clientId } });
          }}
          style={styles.link}
        >
          <Text variant="bodyStrong" color="primary">
            {t('appointments.detail.viewClient')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

type Action = { icon: LucideIcon; label: string; onPress: () => void };

function ContactRow({ text, actions }: { text: string; actions: Action[] }) {
  return (
    <View style={styles.contactRow}>
      <Text variant="body" numberOfLines={1} style={styles.contactText} selectable>
        {text}
      </Text>
      {actions.map(({ icon: Icon, label, onPress }) => (
        <Pressable
          key={label}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={styles.iconButton}
        >
          <Icon size={theme.iconSize.md} strokeWidth={theme.iconStroke} color={theme.colors.primary} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: theme.spacing[4] },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] },
  contactText: { flex: 1, minWidth: 0 },
  iconButton: {
    width: theme.layout.minTouchTarget,
    height: theme.layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
  },
  link: { minHeight: theme.layout.minTouchTarget, justifyContent: 'center' },
});
