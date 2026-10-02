import { CalendarPlus, Plus, SearchX, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Badge,
  Button,
  Card,
  Dialog,
  Drawer,
  EmptyState,
  Input,
  Skeleton,
  Spinner,
  Tabs,
  Text,
  Toggle,
  useToast,
} from '@/components/ui';
import {
  Calendar,
  DateRangePicker,
  MoneyInput,
  SearchInput,
  TimePicker,
} from '@/components/shared';
import { theme, useBreakpoint } from '@/lib/theme';

/**
 * DEV-ONLY component gallery, rendered by `app/_gallery.tsx` at `/_gallery`.
 * Lives outside `app/` so a production build can tree-shake it away.
 * DELETE this file and its route once real screens cover these components.
 */
export function ComponentGallery() {
  const insets = useSafeAreaInsets();
  const [calendarDay, setCalendarDay] = useState<string | null>('2026-06-15');
  const [range, setRange] = useState<{ startDate: string | null; endDate: string | null }>({
    startDate: null,
    endDate: null,
  });
  const [minute, setMinute] = useState<number | null>(540);
  const [price, setPrice] = useState<number | null>(2500);
  const [searchTerm, setSearchTerm] = useState('');
  const { breakpoint, width, isMobile } = useBreakpoint();
  const padding = isMobile ? theme.layout.pagePaddingMobile : theme.layout.pagePadding;

  const toast = useToast();
  const [tab, setTab] = useState('buttons');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toggleOn, setToggleOn] = useState(true);
  const [toggleOff, setToggleOff] = useState(false);
  const [text, setText] = useState('');

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{
        padding,
        paddingTop: insets.top + padding,
        paddingBottom: insets.bottom + padding * 2,
        gap: theme.spacing[24],
      }}
    >
      <View style={styles.header}>
        <Text variant={isMobile ? 'pageTitleMobile' : 'pageTitle'}>Component gallery</Text>
        <Text variant="small" color="textMuted">
          {breakpoint} · {Math.round(width)}px · {Platform.OS} · dev only
        </Text>
      </View>

      <Tabs
        items={[
          { value: 'buttons', label: 'Buttons' },
          { value: 'forms', label: 'Forms' },
          { value: 'feedback', label: 'Feedback' },
          { value: 'overlays', label: 'Overlays' },
        ]}
        value={tab}
        onChange={setTab}
      />

      <Section title="Button · variants">
        <Row>
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
        </Row>
      </Section>

      <Section title="Button · sizes, icon, states">
        <Row>
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </Row>
        <Row>
          <Button startIcon={Plus}>With icon</Button>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
          <Button variant="ghost" startIcon={Trash2} disabled>
            Ghost disabled
          </Button>
        </Row>
        <Button fullWidth size="lg">
          Full width
        </Button>
      </Section>

      <Section title="Input">
        <Input
          label="Business name"
          placeholder="Wapee Salon"
          value={text}
          onChangeText={setText}
          required
        />
        <Input label="Slug" prefix="wapee.site/" placeholder="my-salon" autoCapitalize="none" />
        <Input
          label="Email"
          placeholder="name@example.com"
          hint="We send booking confirmations here."
          keyboardType="email-address"
        />
        <Input
          label="Phone"
          placeholder="+44 7700 900000"
          error="Enter a valid phone number."
          keyboardType="phone-pad"
        />
        <Input label="Notes" placeholder="Anything we should know?" multiline numberOfLines={3} />
        <Input label="Disabled" value="Cannot edit" editable={false} />
      </Section>

      <Section title="Badge">
        <Row>
          <Badge tone="neutral" dot>
            Inactive
          </Badge>
          <Badge tone="success" dot>
            Active
          </Badge>
          <Badge tone="warning">Pending</Badge>
          <Badge tone="error">Cancelled</Badge>
          <Badge tone="info">45 min</Badge>
          <Badge tone="primary">Haircut</Badge>
        </Row>
      </Section>

      <Section title="Card">
        <Card>
          <Text variant="sectionTitle">Flat card</Text>
          <Text variant="small" color="textSecondary">
            White surface, 1px border, radius 12, no shadow at rest.
          </Text>
        </Card>
        <Card onPress={() => toast.show({ message: 'Card pressed', tone: 'info' })}>
          <Text variant="sectionTitle">Pressable card</Text>
          <Text variant="small" color="textSecondary">
            Hover on web shows a primary border and md shadow.
          </Text>
        </Card>
        <Card featured>
          <Text variant="sectionTitle">Featured card</Text>
          <Text variant="small" color="textSecondary">
            Primary-light border and ring.
          </Text>
        </Card>
      </Section>

      <Section title="Toggle">
        <Toggle value={toggleOn} onValueChange={setToggleOn} label="Accept online bookings" />
        <Toggle value={toggleOff} onValueChange={setToggleOff} label="Require approval" />
        <Toggle value disabled onValueChange={() => undefined} label="Disabled on" />
      </Section>

      <Section title="Skeleton">
        <Card>
          <View style={styles.skeletonRow}>
            <Skeleton width={44} height={44} radius="full" />
            <View style={styles.skeletonLines}>
              <Skeleton width="70%" height={14} />
              <Skeleton width="40%" height={12} />
              <Skeleton width="55%" height={12} />
            </View>
          </View>
        </Card>
      </Section>

      <Section title="Spinner">
        <Row>
          <Spinner size={16} />
          <Spinner size={22} color="textMuted" />
          <Spinner size={28} color="primary" trackColor="border" />
        </Row>
      </Section>

      <Section title="Empty state">
        <Card noPadding>
          <EmptyState
            title="No appointments yet"
            description="When a customer books online, it appears here straight away."
            icon={CalendarPlus}
            action={{
              children: 'Add appointment',
              startIcon: Plus,
              onPress: () => setDrawerOpen(true),
            }}
          />
        </Card>
        <Card noPadding>
          <EmptyState
            compact
            title="No results"
            description="No clients match this search."
            icon={SearchX}
            action={{ children: 'Clear filters', variant: 'ghost', onPress: () => undefined }}
          />
        </Card>
      </Section>

      <Section title="Toast">
        <Row>
          <Button
            variant="ghost"
            onPress={() => toast.show({ message: 'Appointment saved.', tone: 'success' })}
          >
            Success
          </Button>
          <Button
            variant="ghost"
            onPress={() => toast.show({ message: 'Could not save. Try again.', tone: 'error' })}
          >
            Error
          </Button>
          <Button
            variant="ghost"
            onPress={() => toast.show({ message: 'Trial ends in 3 days.', tone: 'warning' })}
          >
            Warning
          </Button>
          <Button
            variant="ghost"
            onPress={() => toast.show({ message: 'Update available.', tone: 'info', duration: 0 })}
          >
            Info (manual)
          </Button>
        </Row>
      </Section>

      <Section title="Calendar · single day">
        <Calendar
          value={calendarDay}
          onChange={setCalendarDay}
          timeZone="Europe/London"
          // A fortnight of selectable days, with one blocked out, so the
          // disabled states are visible at a glance.
          minDate="2026-06-08"
          maxDate="2026-06-30"
          disabledDates={['2026-06-17']}
          initialMonth="2026-06-01"
        />
      </Section>

      <Section title="Calendar · range (via DateRangePicker)">
        <DateRangePicker
          startDate={range.startDate}
          endDate={range.endDate}
          onChange={setRange}
          timeZone="Europe/London"
        />
      </Section>

      <Section title="Shared inputs">
        <TimePicker label="Time" value={minute} onChange={setMinute} />
        <MoneyInput
          label="Price"
          value={price}
          onChange={setPrice}
          currency="GBP"
          locale="en-GB"
          symbol="£"
        />
        <SearchInput onSearch={setSearchTerm} placeholder="Search" />
        <Text variant="helper" color="textSecondary">
          Debounced term: {searchTerm === '' ? '(none)' : searchTerm}
        </Text>
      </Section>

      <Section title="Overlays">
        <Row>
          <Button onPress={() => setDialogOpen(true)}>Open dialog</Button>
          <Button variant="ghost" onPress={() => setDrawerOpen(true)}>
            Open drawer
          </Button>
        </Row>
      </Section>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Cancel this appointment?"
        message="The customer is told by email or SMS. This cannot be undone."
        confirm={{
          label: 'Cancel appointment',
          onPress: () => {
            setDialogOpen(false);
            toast.show({ message: 'Appointment cancelled.', tone: 'success' });
          },
        }}
        cancelLabel="Keep it"
      />

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="New appointment"
        subtitle="Walk-in or phone booking"
        footer={
          <>
            <Button variant="ghost" onPress={() => setDrawerOpen(false)}>
              Cancel
            </Button>
            <Button
              onPress={() => {
                setDrawerOpen(false);
                toast.show({ message: 'Appointment saved.', tone: 'success' });
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <Input label="Client name" placeholder="Jane Cooper" required />
        <Input label="Phone" placeholder="+44 7700 900000" keyboardType="phone-pad" required />
        <Input label="Notes" placeholder="Anything we should know?" multiline numberOfLines={3} />
        <Toggle value={toggleOn} onValueChange={setToggleOn} label="Send confirmation" />
      </Drawer>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="caption" color="textMuted">
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    gap: theme.spacing[4],
  },
  section: {
    gap: theme.spacing[12],
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing[8],
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: theme.spacing[12],
    alignItems: 'center',
  },
  skeletonLines: {
    flex: 1,
    gap: theme.spacing[8],
  },
});
