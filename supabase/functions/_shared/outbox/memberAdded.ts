/**
 * The "you were added to a team" email (event `member_added`, addressed to the pending add's
 * email). Pure: no Deno, no I/O. The payload is built by `add_member_by_email` in the database
 * (migration 20261026100000): `{ member_id, role }`. It carries NO token: the only link is the
 * plain sign-in page, and the person joins when they sign in with this (verified) address.
 * English is the base and the fallback, like `templates.ts`; every sentence is a whole catalogue
 * string with {placeholders}. The product name never appears (messages are from the business).
 */

import type { Job } from './types.ts';

type Catalogue = { subject: string; intro: string; join: string; ignore: string };

const en: Catalogue = {
  subject: '{business} added you to their team',
  intro: '{business} added you to their team as {role}.',
  join: 'To join, sign in or create an account with this email address: {url}',
  ignore: 'If you did not expect this, you can ignore this email.',
};

const CATALOGUES: Record<string, Catalogue> = { en };

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k: string) => vars[k] ?? '');
}

function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderMemberAddedEmail(
  job: Job,
  loginUrl: string | null,
): { subject: string; text: string; html: string } | null {
  if (!loginUrl) return null;
  const role = typeof job.payload.role === 'string' ? job.payload.role : '';
  if (!role) return null;
  const primary = (job.language ?? 'en').toLowerCase().split(/[-_]/)[0] ?? 'en';
  const cat = CATALOGUES[primary] ?? en;
  const v = { business: job.business_name, role, url: loginUrl };
  const lines = [fill(cat.intro, v), fill(cat.join, v), cat.ignore];
  return {
    subject: fill(cat.subject, v),
    text: lines.join('\n\n'),
    html: lines
      .map(
        (l) =>
          `<p>${escapeText(l).replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}">${u}</a>`)}</p>`,
      )
      .join('\n'),
  };
}
