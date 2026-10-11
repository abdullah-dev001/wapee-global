import { Platform, Share } from 'react-native';

export type SaveResult = 'downloaded' | 'shared' | 'cancelled';

/**
 * Hands a text file to the person.
 * - Web: a real download (Blob + a temporary link), with a UTF-8 byte-order mark
 *   for CSV so Excel reads accents and non-Latin names correctly.
 * - Native: the system share sheet with the text itself. (A file attachment would
 *   need expo-sharing + expo-file-system, a separate decision; the text can still
 *   be saved to Files / Notes, or pasted into a spreadsheet.)
 */
export async function saveTextFile(
  name: string,
  text: string,
  mime = 'text/csv',
): Promise<SaveResult> {
  if (Platform.OS === 'web') {
    const withBom = mime.startsWith('text/csv') ? `﻿${text}` : text;
    const blob = new Blob([withBom], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'downloaded';
  }
  const result = await Share.share({ message: text, title: name });
  return result.action === Share.dismissedAction ? 'cancelled' : 'shared';
}
