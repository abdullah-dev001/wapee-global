import { Platform } from 'react-native';

export type PickedDocument = { uri: string; name: string; mime: string; size: number };

/** A PDF can be chosen from the device on the WEB build only (native needs a document picker module, not installed). */
export const canPickPdf = Platform.OS === 'web';

/** Opens the browser's file chooser for a PDF. Resolves null when cancelled. Web only. */
export function pickPdf(): Promise<PickedDocument | null> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      resolve({
        uri: URL.createObjectURL(file),
        name: file.name,
        mime: file.type || 'application/pdf',
        size: file.size,
      });
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
