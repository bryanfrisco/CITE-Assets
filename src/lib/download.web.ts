/**
 * Getting a file out of the app, in a browser.
 *
 * The phone version writes to the cache directory and calls the OS share
 * sheet. Neither exists here: `expo-file-system`'s File/Paths API has no
 * meaningful browser implementation, and `Sharing.isAvailableAsync()` always
 * returns false — which is exactly why every download button in the app did
 * nothing on the web.
 *
 * A Blob and an anchor is the browser's own answer, and it is a better one:
 * the file lands in the Downloads folder with the name we chose, rather than
 * going through a share dialog nobody wanted.
 *
 * Metro picks this file over download.ts on web. The signatures match exactly,
 * so no caller knows there are two.
 */

import * as Print from 'expo-print';

/** Triggers a download and cleans up the object URL afterwards. */
function offer(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;

  // Firefox will not follow a click on a node that is not in the document.
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Released on the next tick rather than immediately: revoking it while the
  // browser is still reading gives an empty file in some versions.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function saveFile(
  name: string,
  contents: string,
  mimeType: string,
  _dialogTitle: string,
): Promise<void> {
  // The BOM makes Excel open a UTF-8 CSV as UTF-8 instead of guessing the
  // system codepage, which is what turns "Ahmad Taufik" into mojibake.
  const body = mimeType.startsWith('text/csv') ? `\ufeff${contents}` : contents;
  offer(new Blob([body], { type: `${mimeType};charset=utf-8` }), name);
}

/**
 * There is no printToFileAsync on the web, so this opens the browser's own
 * print dialog with the rendered HTML. Every desktop browser offers "Save as
 * PDF" there, which is the same destination by a different road — and it also
 * lets somebody send it straight to the label printer, which is what the
 * labels screen is for in the first place.
 */
export async function savePdfFromHtml(
  html: string,
  _name: string,
  _dialogTitle: string,
): Promise<void> {
  await Print.printAsync({ html });
}
