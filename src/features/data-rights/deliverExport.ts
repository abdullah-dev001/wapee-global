import { Platform, Share } from 'react-native';

/**
 * Hands the exported JSON to the person: a file download on the web, the system share sheet on a phone
 * (react-native's own Share, no extra dependency).
 */
export async function deliverExport(json: string, fileName: string): Promise<void> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return;
  }
  await Share.share({ message: json, title: fileName });
}
