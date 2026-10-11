import { z } from 'zod';

/**
 * Per-branch notification settings. Mirrors the CHECK constraints on
 * `notification_settings` (the database validates again): reminder hours 1-72,
 * quiet hours are minutes from local midnight.
 */
export const notificationSettingsSchema = z.object({
  remindersEnabled: z.boolean(),
  reminderHoursBefore: z.number().int().min(1).max(72),
  smsEnabled: z.boolean(),
  reviewRequestsEnabled: z.boolean(),
  quietStartMinute: z.number().int().min(0).max(1439),
  quietEndMinute: z.number().int().min(0).max(1439),
});

export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  remindersEnabled: true,
  reminderHoursBefore: 24,
  smsEnabled: false,
  reviewRequestsEnabled: true,
  quietStartMinute: 1260,
  quietEndMinute: 480,
};

export function sameSettings(a: NotificationSettings, b: NotificationSettings): boolean {
  return (
    a.remindersEnabled === b.remindersEnabled &&
    a.reminderHoursBefore === b.reminderHoursBefore &&
    a.smsEnabled === b.smsEnabled &&
    a.reviewRequestsEnabled === b.reviewRequestsEnabled &&
    a.quietStartMinute === b.quietStartMinute &&
    a.quietEndMinute === b.quietEndMinute
  );
}
