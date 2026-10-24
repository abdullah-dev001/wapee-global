import type en from '../i18n/en.json';
import { escapeHtml, interpolate } from '../pricingModel.ts';

export type LandingStrings = typeof en;

/** Everything a section needs. Built once by the build script. */
export type PageContext = {
  s: LandingStrings;
  brandName: string;
  supportEmail: string;
  /** Absolute public origin, no trailing slash (canonical, Open Graph, sitemap). */
  siteUrl: string;
  year: number;
  paths: {
    login: string;
    signup: string;
    terms: string;
    privacy: string;
    refund: string;
    /** Where a signed-in visitor goes (the app). */
    dashboard: string;
    /** Where a signed-in visitor's plan button goes (with `?plan=…&interval=…`). */
    billing: string;
  };
};

/** Translate + escape for HTML. `name` is always available as the product name. */
export function tx(
  ctx: PageContext,
  template: string,
  vars: Record<string, string | number> = {},
): string {
  return escapeHtml(
    interpolate(template, { name: ctx.brandName, email: ctx.supportEmail, ...vars }),
  );
}

/** An attribute-safe value. */
export const attr = escapeHtml;

/** JSON for an inline <script> (never lets the content close the tag). */
export function inlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}
