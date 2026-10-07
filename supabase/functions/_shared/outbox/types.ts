/**
 * The shapes shared by the outbox worker. Pure types: no Deno, no I/O.
 * The job object is what `outbox_claim()` returns (see migration
 * 20261008120000_phase6_worker_rpcs.sql, `outbox_job`).
 */

export type Channel = 'email' | 'sms' | 'push';

export type OutboxEvent =
  | 'booking_confirmed'
  | 'pending_received'
  | 'reminder'
  | 'rescheduled'
  | 'cancelled'
  | 'manage_link'
  | 'review_request'
  | 'staff_new_booking'
  | 'staff_pending_approval'
  | 'staff_cancelled'
  | 'staff_reminder'
  | 'report_summary'
  | 'staff_low_stock'
  | 'low_stock'
  | 'form_request';

export type Job = {
  id: string;
  channel: Channel;
  event: OutboxEvent;
  attempt: number;
  idempotency_key: string;
  business_id: string;
  branch_id: string;
  business_name: string;
  language: string | null;
  slug: string;
  branch_name: string | null;
  branch_address: string | null;
  branch_phone: string | null;
  timezone: string;
  starts_at: string | null;
  appointment_status: string | null;
  service_name: string | null;
  staff_name: string | null;
  client_first_name: string | null;
  client_name: string | null;
  payload: Record<string, unknown>;
  /** The RAW token (manage / review link), unsealed by the database. Never logged. */
  token: string | null;
  /** Email address or E.164 phone. Null for push. */
  to: string | null;
  recipient_hash: string | null;
  tokens: { id: string; token: string }[];
};

export type ProviderResult =
  | { ok: true; id: string | null }
  | { ok: false; retryable: boolean; code: string | null; message: string; definite?: boolean };

export type PushOutcome = {
  /** At least one device accepted it. */
  delivered: boolean;
  /** Token row ids Expo reported as dead (DeviceNotRegistered). */
  deadTokenIds: string[];
  retryable: boolean;
  message: string;
};

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Stable per outbox row, so a repeated call can never send twice. */
  idempotencyKey: string;
  unsubscribeUrl: string | null;
  /** The Edge POST endpoint for the List-Unsubscribe one-click header. */
  oneClickUrl: string | null;
};

export type PushMessage = { id: string; token: string; title: string; body: string };

export type ReserveResult =
  | { ok: true; to: string; segments: number; encoding: string; credits: number }
  | { ok: false; code: string };

export type Deps = {
  db: {
    reserveSms(id: string, body: string): Promise<ReserveResult>;
    complete(
      id: string,
      provider: string,
      providerId: string | null,
      deadTokens: string[],
    ): Promise<void>;
    fail(id: string, error: string, retryable: boolean, definite?: boolean): Promise<void>;
    suppress(
      businessId: string,
      channel: 'email' | 'sms',
      hash: string,
      source: 'unsubscribe_link' | 'provider_stop',
    ): Promise<void>;
    removeDeadTokens(id: string, tokenIds: string[]): Promise<void>;
  };
  providers: {
    sendEmail(m: EmailMessage): Promise<ProviderResult>;
    sendSms(m: { to: string; body: string }): Promise<ProviderResult>;
    sendPush(messages: PushMessage[]): Promise<PushOutcome>;
  };
  config: {
    /** Base URL of the public site, no trailing slash. */
    publicSiteUrl: string;
    /** Full URL of the unsubscribe Edge function (POST), no trailing slash. */
    unsubscribeUrl: string;
    signingKey: string;
    now: () => number;
  };
};

export type Outcome = 'sent' | 'retry' | 'dead' | 'skipped';
