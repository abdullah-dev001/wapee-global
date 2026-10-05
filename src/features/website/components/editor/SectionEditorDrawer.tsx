import { useTranslation } from 'react-i18next';

import { Drawer } from '@/components/ui';

import { type AdminSection } from '../../adminTypes';
import { isSimpleSection } from '../../schemas/sectionForms.schema';
import { ContactForm } from './ContactForm';
import { FaqForm } from './FaqForm';
import { GalleryForm } from './GalleryForm';
import { SimpleSectionForm } from './SimpleSectionForm';

/** One drawer for all seven section types; the body is picked by type. Keyed so a form never keeps another section's state. */
export function SectionEditorDrawer({
  businessId,
  section,
  defaultCountry,
  onClose,
}: {
  businessId: string | null;
  section: AdminSection | null;
  defaultCountry?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Drawer
      open={section !== null}
      onClose={onClose}
      title={section ? t(`websiteEditor.sections.${section.type}`) : ''}
      subtitle={section ? t(`websiteEditor.sections.${section.type}Hint`) : undefined}
    >
      {section ? (
        isSimpleSection(section.type) ? (
          <SimpleSectionForm
            key={section.id}
            businessId={businessId}
            type={section.type}
            content={section.content}
            onDone={onClose}
          />
        ) : section.type === 'faqs' ? (
          <FaqForm
            key={section.id}
            businessId={businessId}
            content={section.content}
            onDone={onClose}
          />
        ) : section.type === 'gallery' ? (
          <GalleryForm
            key={section.id}
            businessId={businessId}
            content={section.content}
            onDone={onClose}
          />
        ) : (
          <ContactForm
            key={section.id}
            businessId={businessId}
            content={section.content}
            defaultCountry={defaultCountry}
            onDone={onClose}
          />
        )
      ) : null}
    </Drawer>
  );
}
