import { cancelRender, continueRender, delayRender } from 'remotion';
import w400 from '@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff2';
import w500 from '@fontsource/dm-sans/files/dm-sans-latin-500-normal.woff2';
import w600 from '@fontsource/dm-sans/files/dm-sans-latin-600-normal.woff2';
import w700 from '@fontsource/dm-sans/files/dm-sans-latin-700-normal.woff2';

const files: Array<[string, string]> = [
  ['400', w400],
  ['500', w500],
  ['600', w600],
  ['700', w700],
];

let started = false;

/** Registers bundled DM Sans faces. Never touches the network. */
export const loadFonts = () => {
  if (started || typeof document === 'undefined') return;
  started = true;
  const handle = delayRender('Loading DM Sans');
  Promise.all(
    files.map(([weight, url]) => {
      const face = new FontFace('DM Sans', `url(${url}) format('woff2')`, { weight, style: 'normal' });
      return face.load().then((loaded) => {
        document.fonts.add(loaded);
      });
    }),
  )
    .then(() => continueRender(handle))
    .catch((err: unknown) => cancelRender(err));
};
