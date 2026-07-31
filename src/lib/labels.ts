/**
 * Label sheets for the Epson LW-1700P.
 *
 * WHY A FILE AND NOT DIRECT PRINTING
 * ----------------------------------
 * The LW-1700P is a tape printer. Driving it from inside this app would mean
 * Epson's Bluetooth SDK, a custom native build, and a hard dependency on one
 * printer model — and it fails in the field the moment the team buys a
 * different unit. Producing a correctly sized PDF and handing it to the Epson
 * app (or any printer) works today and keeps working.
 *
 * The page is sized to the TAPE, not to A4: one label per page, so the printer
 * feeds and cuts exactly once per sticker.
 */

import QRCode from 'qrcode';

/** LW-1700P tape widths, in millimetres. */
export const TAPE_WIDTHS = [12, 18, 24, 36] as const;
export type TapeWidth = (typeof TAPE_WIDTHS)[number];

/**
 * Printable height is smaller than the tape itself — the head cannot reach the
 * edges. These are Epson's usable heights for each cassette.
 */
const PRINTABLE_MM: Record<TapeWidth, number> = { 12: 9, 18: 13.5, 24: 18, 36: 27 };

/** Enough tape for the QR plus the code printed beside it. */
const LABEL_LENGTH_MM: Record<TapeWidth, number> = { 12: 32, 18: 40, 24: 48, 36: 62 };

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
 * One page per label, each page exactly one label long, so the printer's
 * auto-cut lands between stickers rather than through them.
 */
export async function buildLabelSheetHtml(
  codes: string[],
  { tape = 24, caption }: LabelSheetOptions = {},
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
