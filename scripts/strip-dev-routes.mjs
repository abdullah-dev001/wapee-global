/**
 * Removes DEV-ONLY routes before a production web export, so no gallery or
 * debug screen is ever published. Runs automatically via `prebuild:web`.
 *
 * Expo Router turns every file under app/ into a route and Metro does not
 * tree-shake a `__DEV__` branch, so the file itself must be gone at build time.
 * The file is restored afterwards by `postbuild:web`.
 */
import { renameSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEV_ROUTES = ['app/_gallery.tsx'];
const SUFFIX = '.devonly';
const restore = process.argv.includes('--restore');

for (const route of DEV_ROUTES) {
  const live = resolve(root, route);
  const parked = `${live}${SUFFIX}`;
  if (restore) {
    if (existsSync(parked)) renameSync(parked, live);
  } else if (existsSync(live)) {
    renameSync(live, parked);
  }
}
