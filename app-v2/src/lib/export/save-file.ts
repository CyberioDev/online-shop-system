import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * Writes the file to the cache and opens the share sheet so the user can save
 * it to Files, send it by email, etc. Web uses `save-file.web.ts`.
 */
export async function saveFile(name: string, mimeType: string, content: Uint8Array | string) {
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(content);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device');
  }
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name });
}
