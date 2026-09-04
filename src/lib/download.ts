/**
 * Getting a file out of the app and into somebody's hands.
 *
 * Five screens each grew their own copy of the same helper — import, import
 * employees, import licenses, labels and reports. They were identical apart
 * from the MIME type, and all five carried the same latent bug:
 *
 *     if (await Sharing.isAvailableAsync()) { ...share... }
 *
 * On a phone that check always passes, so nobody noticed that when it does
 * NOT, the function returns having done nothing at all. On the web it always
 * fails — Sharing has no browser implementation — so every download button in
 * the app was a button that did nothing and said nothing.
 *
 * `download.web.ts` is the browser half. Metro picks it automatically, so
 * callers import from '@/lib/download' and never learn there are two.
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

/**
 * Writes text to a file and hands it to the share sheet.
 *
 * Throws rather than returning quietly when sharing is unavailable: a silent
 * no-op is what hid this for so long, and somebody who taps Download deserves
 * to be told when nothing came of it.
 */
export async function saveFile(
  name: string,
  contents: string,
  mimeType: string,
  dialogTitle: string,
): Promise<void> {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(contents);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('This device cannot share files');
  }
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle });
}

/**
 * Renders HTML to a PDF and hands it over.
 *
 * `name` is unused on this platform — the OS share sheet names the file — but
 * the browser needs it, and one signature for both keeps the callers honest.
 */
export async function savePdfFromHtml(
  html: string,
  _name: string,
  dialogTitle: string,
): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html });

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('This device cannot share files');
  }
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle });
}
