import { Redirect } from 'expo-router';

import { ComponentGallery } from '@/dev/ComponentGallery';

/**
 * DEV-ONLY route for the component gallery (`/_gallery`).
 * In a production build this redirects away, and the gallery itself is never imported.
 * DELETE this file with src/dev/ComponentGallery.tsx once real screens exist.
 */
export default function GalleryRoute() {
  if (!__DEV__) return <Redirect href="/" />;
  return <ComponentGallery />;
}
