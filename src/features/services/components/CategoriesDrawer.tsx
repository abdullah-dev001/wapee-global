import { Pencil, Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  Dialog,
  Drawer,
  EmptyState,
  Input,
  Skeleton,
  Text,
  useToast,
} from '@/components/ui';
import { useInteractionState } from '@/components/ui/useInteractionState';
import { focusRing, theme } from '@/lib/theme';

import {
  useCreateCategory,
  useDeleteCategory,
  useServiceCategories,
  useUpdateCategory,
  type ServiceCategory,
} from '../api/useServices';
import { categorySchema } from '../schemas/service.schemas';
import { categoryErrorKey } from '../serviceErrorKey';

/**
 * Create / rename / delete categories. Deleting one does not touch its
 * services (they move to "Uncategorised" — `useDeleteCategory`); there is no
 * "in use" refusal, unlike deleting a service or a role.
 */
export function CategoriesDrawer({
  businessId,
  open,
  onClose,
}: {
  businessId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const categories = useServiceCategories(businessId);
  const create = useCreateCategory(businessId);
  const update = useUpdateCategory(businessId);
  const remove = useDeleteCategory(businessId);

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<ServiceCategory | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ServiceCategory | null>(null);

  const submitCreate = () => {
    const parsed = categorySchema.safeParse({ name });
    if (!parsed.success) {
      setNameError(parsed.error.issues[0]?.message ?? 'services.categories.errors.invalidInput');
      return;
    }
    setNameError(null);
    create.mutate(
      { name: parsed.data.name },
      {
        onSuccess: () => {
          setName('');
          toast.show({ message: t('services.categories.saved'), tone: 'success' });
        },
        onError: (error) => toast.show({ message: t(categoryErrorKey(error)), tone: 'error' }),
      },
    );
  };

  const openRename = (category: ServiceCategory) => {
    setRenaming(category);
    setRenameValue(category.name);
    setRenameError(null);
  };

  const submitRename = () => {
    if (!renaming) return;
    const parsed = categorySchema.safeParse({ name: renameValue });
    if (!parsed.success) {
      setRenameError(parsed.error.issues[0]?.message ?? 'services.categories.errors.invalidInput');
      return;
    }
    update.mutate(
      { id: renaming.id, name: parsed.data.name },
      {
        onSuccess: () => {
          toast.show({ message: t('services.categories.saved'), tone: 'success' });
          setRenaming(null);
        },
        onError: (error) => toast.show({ message: t(categoryErrorKey(error)), tone: 'error' }),
      },
    );
  };

  const list = categories.data ?? [];

  return (
    <>
      <Drawer open={open} onClose={onClose} title={t('services.categories.title')}>
        <View style={styles.body}>
          <View style={styles.addRow}>
            <View style={styles.addInput}>
              <Input
                value={name}
                onChangeText={(value) => {
                  setName(value);
                  setNameError(null);
                }}
                placeholder={t('services.categories.namePlaceholder')}
                error={nameError ? t(nameError as never) : undefined}
              />
            </View>
            <Button size="sm" startIcon={Plus} loading={create.isPending} onPress={submitCreate}>
              {t('services.categories.create')}
            </Button>
          </View>

          {categories.isPending ? (
            <Skeleton height={56} radius="lg" />
          ) : list.length === 0 ? (
            <EmptyState
              compact
              title={t('services.categories.empty.title')}
              description={t('services.categories.empty.description')}
            />
          ) : (
            <Card noPadding>
              {list.map((category, index) => (
                <View
                  key={category.id}
                  style={[styles.row, index === list.length - 1 ? null : styles.rowDivider]}
                >
                  <Text variant="body" style={styles.rowName} numberOfLines={1}>
                    {category.name}
                  </Text>
                  <View style={styles.rowActions}>
                    <IconButton
                      icon={Pencil}
                      label={t('services.categories.rename')}
                      onPress={() => openRename(category)}
                    />
                    <IconButton
                      icon={Trash2}
                      label={t('services.categories.delete')}
                      tone="error"
                      onPress={() => setDeleting(category)}
                    />
                  </View>
                </View>
              ))}
            </Card>
          )}
        </View>
      </Drawer>

      <Dialog
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title={t('services.categories.renameTitle')}
        busy={update.isPending}
        confirm={{ label: t('actions.save'), loading: update.isPending, onPress: submitRename }}
        cancelLabel={t('actions.cancel')}
      >
        <Input
          label={t('services.categories.fields.name')}
          value={renameValue}
          onChangeText={(value) => {
            setRenameValue(value);
            setRenameError(null);
          }}
          error={renameError ? t(renameError as never) : undefined}
          autoFocus
        />
      </Dialog>

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t('services.categories.deleteConfirm.title')}
        message={t('services.categories.deleteConfirm.message')}
        busy={remove.isPending}
        confirm={{
          label: t('actions.delete'),
          variant: 'danger',
          loading: remove.isPending,
          onPress: () => {
            if (!deleting) return;
            remove.mutate(deleting.id, {
              onSuccess: () => setDeleting(null),
              onError: (error) =>
                toast.show({ message: t(categoryErrorKey(error)), tone: 'error' }),
            });
          },
        }}
        cancelLabel={t('actions.cancel')}
      />
    </>
  );
}

function IconButton({
  icon: Icon,
  label,
  onPress,
  tone = 'default',
}: {
  icon: typeof Trash2;
  label: string;
  onPress: () => void;
  tone?: 'default' | 'error';
}) {
  const { handlers, showHover, showFocusRing } = useInteractionState(false);
  const color = tone === 'error' ? theme.colors.error : theme.colors.textSecondary;

  return (
    <Pressable
      {...handlers}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.iconButton,
        showHover ? { backgroundColor: theme.colors.surfaceHover } : null,
        showFocusRing ? focusRing() : null,
      ]}
    >
      <Icon size={theme.iconSize.sm} strokeWidth={theme.iconStroke} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { gap: theme.spacing[16] },
  addRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing[8] },
  addInput: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[10],
    paddingHorizontal: theme.spacing[16],
    minHeight: theme.layout.minTouchTarget,
  },
  rowDivider: {
    borderBottomWidth: theme.borderWidth.hairline,
    borderBottomColor: theme.colors.borderSubtle,
  },
  rowName: { flex: 1 },
  rowActions: { flexDirection: 'row', gap: theme.spacing[4] },
  iconButton: {
    width: theme.layout.minTouchTarget,
    height: theme.layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
  },
});
