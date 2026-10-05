import { SectionShell } from './SectionShell';
import { WText } from './WText';

export function AboutSection({ title, body }: { title: string; body: string }) {
  return (
    <SectionShell title={title}>
      <WText variant="paragraph" color="textSecondary">
        {body}
      </WText>
    </SectionShell>
  );
}
