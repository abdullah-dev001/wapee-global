import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Eye, Lock, Pencil, Plus } from 'lucide-react-native';

import { Badge, Button, Card, Dialog, Skeleton, Text, useToast } from '@/components/ui';
import { theme } from '@/lib/theme';

import {
  useArchiveCustomField,
  useCustomFields,
  useReorderCustomField,
  type CustomField,
} from '../api/useCustomFields';
import { CustomFieldEditor } from './CustomFieldEditor';

export type CustomFieldListProps = {
  businessId: string | null;
  canEdit: boolean;
  services: { id: string; name: string }[];
  /** doc §6.1: email is the only default field whose required state can change. */
  requireClientEmail: boolean;
};

/**
 * The booking form builder: the fixed default fields, then the owner's own.
 *
 * The fixed fields are shown — not just the custom ones — because an owner opening
 * "the booking form" expects to see the whole form. Showing only the extras makes
 * it look as though name and phone are missing.
 */
export function CustomFieldList({
  businessId,
  canEdit,
  services,
  requireClientEmail,
}: CustomFieldListProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const fields = useCustomFields(businessId);
  const archive = useArchiveCustomField(businessId);
  const reorder = useReorderCustomField(businessId);

  const [editing, setEditing] = useState<CustomField | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState<CustomField | null>(null);

  const active = (fields.data ?? []).filter((f) => f.isActive);
  const archived = (fields.data ?? []).filter((f) => !f.isActive);

  const openNew = useCallback(() => {
    setEditing(null);
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback((field: CustomField) => {
    setEditing(field);
    setEditorOpen(true);
  }, []);

  const move = useCallback(
    (index: number, direction: -1 | 1) => {
      const current = active[index];
      const swapWith = active[index + direction];
      if (!current || !swapWith) return;
      reorder.mutate(
        { id: current.id, swapWithId: swapWith.id },
        { onError: () => toast.show({ message: t('bookingFields.saveFailed'), tone: 'error' }) },
      );
    },
    [active, reorder, toast, t],
  );

  return (
    <View style={styles.wrapper}>
      {/* ---------------- The fixed fields (doc §6.1) ---------------- */}
      <Card>
        <View style={styles.group}>
          <Text variant="cardTitle" color="textPrimary">
            {t('bookingFields.fixedTitle')}
          </Text>
          <Text variant="helper" color="textSecondary">
            {t('bookingFields.fixedHint')}
          </Text>

          <FixedFieldRow label={t('bookingPublic.form.name')} state="required" />
          <FixedFieldRow
            label={t('bookingPublic.form.phone')}
            state="required"
            // Worth saying: an owner who wants phone optional needs to know WHY it
            // cannot be, or they will keep looking for the toggle.
            note={t('bookingFields.phoneLockedReason')}
          />
          <FixedFieldRow
            label={t('bookingPublic.form.email')}
            state={requireClientEmail ? 'required' : 'optional'}
            note={t('bookingFields.emailToggleNote')}
          />
          <FixedFieldRow label={t('bookingPublic.form.notes')} state="optional" />
        </View>
      </Card>

      {/* ---------------- The owner's own fields ---------------- */}
      <Card>
        <View style={styles.group}>
          <View style={styles.titleRow}>
            <View style={styles.titleText}>
              <Text variant="cardTitle" color="textPrimary">
                {t('bookingFields.customTitle')}
              </Text>
              <Text variant="helper" color="textSecondary">
                {t('bookingFields.versionNote')}
              </Text>
            </View>
            {canEdit ? (
              <Button variant="secondary" size="sm" startIcon={Plus} onPress={openNew}>
                {t('bookingFields.add')}
              </Button>
            ) : null}
          </View>

          {fields.isPending ? (
            <>
              <Skeleton height={56} />
              <Skeleton height={56} />
            </>
          ) : active.length === 0 ? (
            <Text variant="helper" color="textMuted">
              {t('bookingFields.empty')}
            </Text>
          ) : (
            active.map((field, index) => (
              <CustomFieldRow
                key={field.id}
                field={field}
                canEdit={canEdit}
                canMoveUp={index > 0}
                canMoveDown={index < active.length - 1}
                onEdit={() => openEdit(field)}
                onArchive={() => setConfirmArchive(field)}
                onMoveUp={() => move(index, -1)}
                onMoveDown={() => move(index, 1)}
              />
            ))
          )}
        </View>
      </Card>

      {/* ---------------- Archived ---------------- */}
      {archived.length > 0 ? (
        <Card>
          <View style={styles.group}>
            <Text variant="cardTitle" color="textPrimary">
              {t('bookingFields.archivedTitle')}
            </Text>
            <Text variant="helper" color="textSecondary">
              {t('bookingFields.archivedHint')}
            </Text>
            {archived.map((field) => (
              <View key={field.id} style={styles.row}>
                <View style={styles.rowText}>
                  <Text variant="body" color="textSecondary" numberOfLines={1}>
                    {field.label}
                  </Text>
                </View>
                {canEdit ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() =>
                      archive.mutate(
                        { id: field.id, isActive: true },
                        {
                          onError: () =>
                            toast.show({ message: t('bookingFields.saveFailed'), tone: 'error' }),
                        },
                      )
                    }
                  >
                    {t('bookingFields.restore')}
                  </Button>
                ) : null}
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <CustomFieldEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        businessId={businessId}
        field={editing}
        services={services}
      />

      <Dialog
        open={confirmArchive !== null}
        onClose={() => setConfirmArchive(null)}
        title={t('bookingFields.archiveConfirmTitle')}
        message={t('bookingFields.archiveConfirmBody')}
        confirm={{
          label: t('bookingFields.archive'),
          onPress: () => {
            const target = confirmArchive;
            setConfirmArchive(null);
            if (target) {
              archive.mutate(
                { id: target.id, isActive: false },
                {
                  onError: () =>
                    toast.show({ message: t('bookingFields.saveFailed'), tone: 'error' }),
                },
              );
            }
          },
        }}
        cancelLabel={t('actions.cancel')}
      />
    </View>
  );
}

function FixedFieldRow({
  label,
  state,
  note,
}: {
  label: string;
  state: 'required' | 'optional';
  note?: string;
}) {
  const { t } = useTranslation();

  return (
    <View style={styles.row}>
      <Lock
        size={theme.iconSize.sm}
        strokeWidth={theme.iconStroke}
        color={theme.colors.textMuted}
        accessibilityElementsHidden
      />
      <View style={styles.rowText}>
        <Text variant="body" color="textPrimary" numberOfLines={1}>
          {label}
        </Text>
        {note ? (
          <Text variant="helper" color="textSecondary">
            {note}
          </Text>
        ) : null}
      </View>
      <Badge tone={state === 'required' ? 'primary' : 'neutral'}>
        {t(state === 'required' ? 'bookingFields.badgeRequired' : 'bookingFields.badgeOptional')}
      </Badge>
    </View>
  );
}

function CustomFieldRow({
  field,
  canEdit,
  canMoveUp,
  canMoveDown,
  onEdit,
  onArchive,
  onMoveUp,
  onMoveDown,
}: {
  field: CustomField;
  canEdit: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { t } = useTranslation();

  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text variant="body" color="textPrimary" numberOfLines={2}>
          {field.label}
        </Text>
        <View style={styles.badges}>
          <Badge tone="neutral">{t(`bookingFields.type_${field.fieldType}`)}</Badge>
          {field.isRequired ? (
            <Badge tone="primary">{t('bookingFields.badgeRequired')}</Badge>
          ) : null}
          {/* Sensitive is worth a loud badge: it changes who can read the answers. */}
          {field.isSensitive ? (
            <Badge
              tone="warning"
              icon={
                <Eye
                  size={theme.iconSize.xs}
                  strokeWidth={theme.iconStroke}
                  color={theme.colors.warning}
                />
              }
            >
              {t('bookingFields.badgeSensitive')}
            </Badge>
          ) : null}
          {!field.appliesToAllServices ? (
            <Badge tone="neutral">
              {t('bookingFields.badgeSomeServices', { count: field.serviceIds.length })}
            </Badge>
          ) : null}
        </View>
      </View>

      {canEdit ? (
        <View style={styles.rowActions}>
          <Button
            variant="ghost"
            size="sm"
            startIcon={ArrowUp}
            disabled={!canMoveUp}
            onPress={onMoveUp}
            accessibilityLabel={t('bookingFields.moveUp')}
          >
            {''}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            startIcon={ArrowDown}
            disabled={!canMoveDown}
            onPress={onMoveDown}
            accessibilityLabel={t('bookingFields.moveDown')}
          >
            {''}
          </Button>
          <Button variant="ghost" size="sm" startIcon={Pencil} onPress={onEdit}>
            {t('actions.edit')}
          </Button>
          <Button variant="ghost" size="sm" onPress={onArchive}>
            {t('bookingFields.archive')}
          </Button>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: theme.spacing[16],
  },
  group: {
    gap: theme.spacing[12],
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[12],
    flexWrap: 'wrap',
  },
  titleText: {
    flex: 1,
    gap: theme.spacing[2],
    minWidth: 180,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[10],
    minHeight: theme.layout.minTouchTarget,
    paddingVertical: theme.spacing[6],
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
    flexWrap: 'wrap',
  },
  rowText: {
    flex: 1,
    gap: theme.spacing[4],
    minWidth: 160,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[4],
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    flexWrap: 'wrap',
  },
});
