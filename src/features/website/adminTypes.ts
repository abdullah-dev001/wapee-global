import { type WebsiteSectionType } from './types';

export type AdminWebsite = {
  id: string;
  branchId: string;
  templateKey: string;
  isPublished: boolean;
  publishedAt: string | null;
  brandColor: string | null;
  fontKey: string | null;
  radiusKey: string | null;
  logoPath: string | null;
  heroImagePath: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

export type AdminSection = {
  id: string;
  type: WebsiteSectionType;
  isVisible: boolean;
  sortOrder: number;
  /** jsonb as stored; validated server-side per type. */
  content: Record<string, unknown>;
};

export type WebsiteAdminData = { website: AdminWebsite | null; sections: AdminSection[] };

export type WebsiteErrorCode =
  | 'forbidden'
  | 'no_website'
  | 'no_branch'
  | 'invalid_settings'
  | 'invalid_content'
  | 'invalid_order'
  | 'unknown_section'
  | 'unknown';

const KNOWN: readonly string[] = [
  'forbidden',
  'no_website',
  'no_branch',
  'invalid_settings',
  'invalid_content',
  'invalid_order',
  'unknown_section',
];

export class WebsiteRpcError extends Error {
  readonly code: WebsiteErrorCode;
  readonly field?: string;
  readonly detail?: string;
  constructor(code: string, extra?: { field?: string; detail?: string }) {
    super(code);
    this.name = 'WebsiteRpcError';
    this.code = KNOWN.includes(code) ? (code as WebsiteErrorCode) : 'unknown';
    this.field = extra?.field;
    this.detail = extra?.detail;
  }
}

export const TEMPLATE_KEYS = ['default', 'salon', 'barber', 'clinic'] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];
