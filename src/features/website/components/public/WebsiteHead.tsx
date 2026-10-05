import Head from 'expo-router/head';
import { Platform } from 'react-native';

import { type WebsiteModel } from '../../types';

/**
 * JSON for a `<script type="application/ld+json">`: `<` is escaped so owner text
 * can never close the script tag early.
 */
export function safeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/** Page title, meta description, Open Graph and LocalBusiness JSON-LD. Web only. */
export function WebsiteHead({ model }: { model: WebsiteModel }) {
  if (Platform.OS !== 'web') return null;
  const { title, description, canonicalUrl } = model.seo;

  return (
    <Head>
      <title>{title}</title>
      {description ? <meta name="description" content={description} /> : null}
      <meta property="og:title" content={title} />
      {description ? <meta property="og:description" content={description} /> : null}
      <meta property="og:type" content="website" />
      {canonicalUrl ? <link rel="canonical" href={canonicalUrl} /> : null}
      {canonicalUrl ? <meta property="og:url" content={canonicalUrl} /> : null}
      {model.theme.logoUrl ? <meta property="og:image" content={model.theme.logoUrl} /> : null}
      {model.jsonLd ? <script type="application/ld+json">{safeJsonLd(model.jsonLd)}</script> : null}
    </Head>
  );
}
