/**
 * Label output for the Epson LW-700.
 *
 * WHAT THE HARDWARE ACTUALLY ALLOWS
 * ---------------------------------
 * The LW-700 is a standalone keyboard label maker that connects to a PC over
 * USB (the laptop key puts it in PC-link mode). It has no Bluetooth and no
 * Wi-Fi — only the "P" models such as the LW-600P do. So nothing can print to
 * it from a phone, by any route. That is a property of the printer, not a
 * shortcut taken here.
 *
 * The workflow that does work:
 *
 *   1. Print a batch in the app -> the codes are issued in the database
 *   2. Export from the phone (share sheet -> email/Drive/USB) to the PC
 *   3. On the PC, open Epson Label Editor, connect the LW-700 over USB, print
 *
 * Two files are produced because Label Editor and everything else want
 * different things:
 *
 *   CSV   for Label Editor's data-merge. Put a QR object and a text object on
 *         one template, bind them to the columns, and it prints the whole
 *         batch in one run. This is the route for the LW-700.
 *   PDF   already laid out, one page per label, sized to the tape. For any
 *         ordinary printer, or for a reprint when Label Editor is not to hand.
 *
 * Tape: the machine takes 6-24 mm. The cassette in the unit is 24 mm
 * (LK-6WBVN, black on white vinyl), which is the default below.
 */

import QRCode from 'qrcode';

/** Cassette widths the LW-700 accepts, in millimetres. */
export const TAPE_WIDTHS = [6, 9, 12, 18, 24] as const;
export type TapeWidth = (typeof TAPE_WIDTHS)[number];

export const DEFAULT_TAPE: TapeWidth = 24;

/**
 * Printable height per cassette. Smaller than the tape itself — the print head
 * cannot reach the edges — so laying out against the nominal width would push
 * the QR off the sticker.
 */
const PRINTABLE_MM: Record<TapeWidth, number> = {
  6: 4.2,
  9: 6.4,
  12: 9,
  18: 13.5,
  24: 18,
};

/** Enough tape for the QR plus the code printed beside it. */
const LABEL_LENGTH_MM: Record<TapeWidth, number> = {
  6: 22,
  9: 26,
  12: 32,
  18: 40,
  24: 48,
};

export interface LabelSheetOptions {
  tape?: TapeWidth;
  /** Printed above the code — which print run this sticker belongs to. */
  caption?: string;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

/**
 * Data-merge sheet for Epson Label Editor — the route to the LW-700.
 *
 * Label Editor reads the header row as field names, so the columns are named
 * for what they are rather than abbreviated. `qr` and `code` carry the same
 * value on purpose: one is bound to the QR object on the template, the other
 * to the text object beneath it.
 */
export function buildLabelCsv(codes: string[], caption?: string): string {
  const rows = [
    ['qr', 'code', 'caption'],
    ...codes.map((code) => [code, code, caption ?? 'CITE ASSETS']),
  ];

  // CRLF and quoted fields: Label Editor is a Windows application and is
  // stricter about both than a spreadsheet would be.
  return (
    rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\r\n') + '\r\n'
  );
}

/**
 * One page per label, each page exactly one label long, so a printer's cut
 * lands between stickers rather than through them.
 */
export async function buildLabelSheetHtml(
  codes: string[],
  { tape = DEFAULT_TAPE, caption }: LabelSheetOptions = {},
): Promise<string> {
  const height = PRINTABLE_MM[tape];
  const length = LABEL_LENGTH_MM[tape];
  const qrSize = height - 1.5;

  const pages = await Promise.all(
    codes.map(async (code) => {
      // `margin: 0` because the tape has its own unprintable border already;
      // adding a quiet zone here would shrink the QR below scanning size.
      const svg = await QRCode.toString(code, {
        type: 'svg',
        errorCorrectionLevel: 'M',
        margin: 0,
      });
      const qr = svg.replace('<svg', `<svg width="${qrSize}mm" height="${qrSize}mm"`);

      return `<section class="label">
        <div class="qr">${qr}</div>
        <div class="text">
          ${caption ? `<div class="caption">${escapeHtml(caption)}</div>` : ''}
          <div class="code">${escapeHtml(code)}</div>
          <div class="brand">CITE ASSETS</div>
        </div>
      </section>`;
    }),
  );

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  @page { size: ${length}mm ${height}mm; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Helvetica, Arial, sans-serif; color: #000; }
  .label {
    width: ${length}mm; height: ${height}mm;
    display: flex; align-items: center; gap: 1.6mm;
    padding: 0.6mm 1.2mm;
    page-break-after: always;
  }
  .label:last-child { page-break-after: auto; }
  .qr { flex: none; line-height: 0; }
  .qr svg { display: block; }
  .text { flex: 1; min-width: 0; }
  .caption { font-size: ${(height * 0.13).toFixed(2)}mm; color: #444; letter-spacing: .02em; }
  .code {
    font-size: ${(height * 0.26).toFixed(2)}mm; font-weight: 700;
    letter-spacing: .04em; font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .brand { font-size: ${(height * 0.11).toFixed(2)}mm; color: #666; letter-spacing: .16em; }
</style></head>
<body>${pages.join('')}</body></html>`;
}

/** A single QR as an SVG string — for showing a label on screen. */
export async function qrSvg(code: string, sizePx: number): Promise<string> {
  const svg = await QRCode.toString(code, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 0,
  });
  return svg.replace('<svg', `<svg width="${sizePx}" height="${sizePx}"`);
}
