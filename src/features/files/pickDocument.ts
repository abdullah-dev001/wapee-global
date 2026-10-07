export type PickedDocument = { uri: string; name: string; mime: string; size: number | null };

/** PDFs can be chosen on every platform (`expo-document-picker`: native module, needs `npm run ios`). */
export const canPickPdf = true;

/**
 * Opens the system document chooser for a PDF. Resolves null when cancelled; rejects when the native
 * module is missing from an older dev build (the caller shows "needs an app update"). Loaded on use,
 * not at import, so an app build made before the module was added still starts.
 */
export async function pickPdf(): Promise<PickedDocument | null> {
  const DocumentPicker = await import('expo-document-picker');
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.name,
    mime: asset.mimeType ?? 'application/pdf',
    size: asset.size ?? null,
  };
}
