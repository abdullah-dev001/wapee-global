/**
 * The real providers: Resend (email), Twilio (SMS), Expo (push). Deno-only (reads
 * Deno.env, uses fetch). Each call has a timeout and returns a classified result;
 * none of them ever puts a response BODY into an error string (it can echo the
 * recipient), only a status and a provider error code/name.
 *
 * Secrets (Edge Function secrets, never in the app):
 *   RESEND_API_KEY, RESEND_FROM_EMAIL
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and ONE of
 *     TWILIO_MESSAGING_SERVICE_SID (preferred) or TWILIO_FROM_NUMBER
 *   EXPO_ACCESS_TOKEN (optional; only if Expo "enhanced push security" is on)
 */

import type { EmailMessage, ProviderResult, PushMessage, PushOutcome } from './types.ts';

const TIMEOUT_MS = 15_000;

export function emailConfigured(): boolean {
  return Boolean(Deno.env.get('RESEND_API_KEY') && Deno.env.get('RESEND_FROM_EMAIL'));
}

export function smsConfigured(): boolean {
  return Boolean(
    Deno.env.get('TWILIO_ACCOUNT_SID') &&
    Deno.env.get('TWILIO_AUTH_TOKEN') &&
    (Deno.env.get('TWILIO_MESSAGING_SERVICE_SID') || Deno.env.get('TWILIO_FROM_NUMBER')),
  );
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

async function errorField(res: Response, field: string): Promise<string | null> {
  try {
    const j = (await res.json()) as Record<string, unknown>;
    const v = j[field];
    return typeof v === 'string' || typeof v === 'number' ? String(v) : null;
  } catch {
    return null;
  }
}

export async function sendEmail(m: EmailMessage): Promise<ProviderResult> {
  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('RESEND_FROM_EMAIL');
  if (!key || !from)
    return {
      ok: false,
      retryable: true,
      code: 'not_configured',
      message: 'resend secrets missing',
    };

  const headers: Record<string, string> = {};
  if (m.oneClickUrl) {
    headers['List-Unsubscribe'] = `<${m.oneClickUrl}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': m.idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: [m.to],
      subject: m.subject,
      text: m.text,
      html: m.html,
      headers,
    }),
  });
  if (res.ok) {
    const id = await errorField(res, 'id');
    return { ok: true, id };
  }
  return {
    ok: false,
    retryable: retryableStatus(res.status),
    code: `resend_${res.status}`,
    message: (await errorField(res, 'name')) ?? 'request failed',
    // A 4xx (other than timeout / conflict) means Resend refused it: no email was
    // created, so the retry may safely use a fresh idempotency key. Anything
    // else (5xx, 408, 409, a thrown timeout) is ambiguous and keeps the same key.
    definite: res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 409,
  };
}

export async function sendSms(m: { to: string; body: string }): Promise<ProviderResult> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const service = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID');
  const fromNumber = Deno.env.get('TWILIO_FROM_NUMBER');
  if (!sid || !token || (!service && !fromNumber)) {
    return {
      ok: false,
      retryable: true,
      code: 'not_configured',
      message: 'twilio secrets missing',
    };
  }
  const form = new URLSearchParams({ To: m.to, Body: m.body });
  if (service) form.set('MessagingServiceSid', service);
  else form.set('From', fromNumber as string);

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    },
  );
  if (res.ok) return { ok: true, id: await errorField(res, 'sid') };
  const code = await errorField(res, 'code');
  return {
    ok: false,
    // A Twilio error CODE is a verdict on the number or message (invalid, blocked,
    // opted out): retrying cannot help. Only transport-level trouble retries.
    retryable: retryableStatus(res.status),
    code: code ?? `twilio_${res.status}`,
    message: `twilio ${res.status}`,
  };
}

export async function sendPush(messages: PushMessage[]): Promise<PushOutcome> {
  if (messages.length === 0)
    return { delivered: false, deadTokenIds: [], retryable: false, message: 'no_tokens' };
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const access = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (access) headers.Authorization = `Bearer ${access}`;

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers,
    body: JSON.stringify(
      messages.map((m) => ({ to: m.token, title: m.title, body: m.body, sound: 'default' })),
    ),
  });
  if (!res.ok) {
    return {
      delivered: false,
      deadTokenIds: [],
      retryable: retryableStatus(res.status),
      message: `expo ${res.status}`,
    };
  }
  let data: { status?: string; details?: { error?: string } }[] = [];
  try {
    data = ((await res.json()) as { data?: typeof data }).data ?? [];
  } catch {
    return { delivered: false, deadTokenIds: [], retryable: true, message: 'expo bad response' };
  }
  const dead: string[] = [];
  let delivered = false;
  messages.forEach((m, i) => {
    const t = data[i];
    if (t?.status === 'ok') delivered = true;
    else if (t?.details?.error === 'DeviceNotRegistered') dead.push(m.id);
  });
  return {
    delivered,
    deadTokenIds: dead,
    retryable: !delivered && dead.length < messages.length,
    message: delivered ? 'ok' : 'expo rejected',
  };
}
