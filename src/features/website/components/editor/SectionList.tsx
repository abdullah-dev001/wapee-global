import { ArrowDown, ArrowUp, Pencil } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Badge, Card, Text, Toggle, useToast } from '@/components/ui';
import { theme } from '@/lib/theme';

import { type AdminSection } from '../../adminTypes';
import { useReorderWebsiteSections, useSaveWebsiteSection } from '../../api/useWebsiteAdmin';
import { sectionIsEmpty } from '../../previewModel';
import { moveItem } from '../../schemas/sectionForms.schema';
import { type WebsiteSectionType } from '../../types';
import { IconAction } from './IconAction';
import { websiteErrorMessage } from './websiteErrors';

/**
 * The seven sections in page order: show/hide, move up/down (buttons, no
 * drag) and edit. A section with nothing to show says so, because the public
 * site silently omits it.
 */
export function SectionList({
  businessId,
  sections,
  counts,
  onEdit,
}: {
  businessId: string | null;
  sections: readonly AdminSection[];
  counts: { serviceCount: number; reviewCount: number };
  onEdit: (section: AdminSection) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const save = useSaveWebsiteSection(businessId);
  const reorder = useReorderWebsiteSections(businessId);
  const ordered = [...sections].sort((a, b) => a.sortOrder - b.sortOrder);
  const busy = save.isPending || reorder.isPending;

  const fail = (error: Error) =>
    toast.show({ message: websiteErrorMessage(t, error), tone: 'error' });

  const move = (index: number, delta: -1 | 1) => {
    const next = moveItem(ordered, index, delta).map((s) => s.type) as WebsiteSectionType[];
    reorder.mutate({ order: next }, { onError: fail });
  };

  return (
    <View style={styles.list}>
      {ordered.map((section, index) => {
        const empty = sectionIsEmpty(section.type, section.content, counts);
        return (
          <Card key={section.id}>
            <View style={styles.row}>
              <View style={styles.title}>
                <Text variant="cardTitle">{t(`websiteEditor.sections.${section.type}`)}</Text>
                {section.isVisible && empty ? (
                  <Badge tone="warning">{t(`websiteEditor.sections.emptyBadge`)}</Badge>
                ) : null}
                {!section.isVisible ? (
                  <Badge tone="neutral">{t('websiteEditor.sections.hiddenBadge')}</Badge>
                ) : null}
              </View>
              <View style={styles.actions}>
                <IconAction
                  label={t('websiteEditor.moveUp')}
                  icon={ArrowUp}
                  disabled={busy || index === 0}
                  onPress={() => move(index, -1)}
                />
                <IconAction
                  label={t('websiteEditor.moveDown')}
                  icon={ArrowDown}
                  disabled={busy || index === ordered.length - 1}
                  onPress={() => move(index, 1)}
                />
                <IconAction
                  label={t('actions.edit')}
                  icon={Pencil}
                  disabled={busy}
                  onPress={() => onEdit(section)}
                />
              </View>
            </View>
            <View style={styles.toggle}>
              <Toggle
                label={t('websiteEditor.sections.show')}
                value={section.isVisible}
                disabled={busy}
                onValueChange={(isVisible) =>
                  save.mutate({ type: section.type, isVisible }, { onError: fail })
                }
              />
            </View>
            {section.isVisible && empty ? (
              <Text variant="helper" color="textSecondary">
                {t(`websiteEditor.sections.emptyHint.${section.type}`)}
              </Text>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: theme.spacing[12] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[8],
  },
  title: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing[8],
    flexShrink: 1,
  },
  actions: { flexDirection: 'row' },
  toggle: { marginTop: theme.spacing[8] },
});
