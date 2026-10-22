/**
 * Super admin sign-in alerts (migration 20261026130000). The auth hook queues one row in
 * `admin_signin_alerts` per non-refresh super admin sign-in, or per refused Google / OAuth
 * attempt; the outbox worker emails the admin's own address. Not a business message, so it
 * does not go through `message_outbox` (which is business-scoped).
 *
 * `renderAdminAlertEmail` is pure; `sendAdminAlerts` takes its I/O as arguments so it is
 * testable without Deno. English only (one platform admin).
 */

import type { EmailMessage, ProviderResult } from './types.ts';

export type AdminAlert = {
  id: string;
  to: string | null;
  method: string;
  outcome: 'allowed' | 'refused';
  at: string;
};

function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "2026-10-23 14:05 UTC" (the admin may be anywhere; UTC is unambiguous). */
export function formatAlertTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function renderAdminAlertEmail(
  alert: AdminAlert,
  siteUrl: string,
): { subject: string; text: string; html: string } {
  const when = formatAlertTime(alert.at);
  const resetUrl = `${siteUrl}/forgot-password`;
  const lines =
    alert.outcome === 'refused'
      ? [
          `Someone tried to sign in to your super admin account with Google (or another provider) at ${when}. It was refused: super admin accounts sign in with email and password only.`,
          `If this was not you, nothing was opened, but someone knows your email address. If you are worried, change your password: ${resetUrl}`,
        ]
      : [
          `Your super admin account signed in (${alert.method}) at ${when}.`,
          `If this was not you, change your password now: ${resetUrl}`,
        ];
  return {
    subject:
      alert.outcome === 'refused'
        ? 'Refused sign-in attempt on your super admin account'
        : 'New sign-in to your super admin account',
    text: lines.join('\n\n'),
    html: lines
      .map(
        (l) =>
          `<p>${escapeText(l).replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}">${u}</a>`)}</p>`,
      )
      .join('\n'),
  };
}

export type AdminAlertDeps = {
  claim: (limit: number) => Promise<AdminAlert[]>;
  finish: (id: string, ok: boolean, error: string | null) => Promise<void>;
  sendEmail: (m: EmailMessage) => Promise<ProviderResult>;
  siteUrl: string;
};

/** Claims and sends one batch of due alerts. Returns how many were sent. */
export async function sendAdminAlerts(deps: AdminAlertDeps): Promise<number> {
  const alerts = await deps.claim(10);
  let sent = 0;
  for (const a of alerts) {
    if (!a.to) {
      await deps.finish(a.id, false, 'no_address');
      continue;
    }
    const mail = renderAdminAlertEmail(a, deps.siteUrl);
    let result: ProviderResult;
    try {
      result = await deps.sendEmail({
        to: a.to,
        ...mail,
        idempotencyKey: `admin_alert:${a.id}`,
        unsubscribeUrl: null,
        oneClickUrl: null,
      });
    } catch (err) {
      result = {
        ok: false,
        retryable: true,
        code: 'exception',
        message: err instanceof Error ? err.message : 'error',
      };
    }
    if (result.ok) sent += 1;
    await deps.finish(
      a.id,
      result.ok,
      result.ok ? null : `${result.code ?? 'error'}: ${result.message}`,
    );
  }
  return sent;
}
