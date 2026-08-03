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
 *   CSV   for Label Editor's data-merge. Put a barcode object and a text
 *         object on one template, bind them to the columns, and it prints the
 *         whole batch in one run. This is the route for the LW-700, and the
 *         symbol is drawn by Label Editor at printer resolution rather than
 *         sent as a picture.
 *   PDF   already laid out, one page per label, sized to the tape. For any
 *         ordinary printer, or for a reprint when Label Editor is not to hand.
 *
 * Tape: the machine takes 6-24 mm. The cassette in the unit is 24 mm
 * (LK-6WBVN, black on white vinyl), which is the default below.
 */

import QRCode from 'qrcode';

import { code128Svg } from './barcode';

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

/** Enough tape for a QR plus the code printed beside it. */
const QR_LENGTH_MM: Record<TapeWidth, number> = {
  6: 22,
  9: 26,
  12: 32,
  18: 40,
  24: 48,
};

/**
 * Longer, because a linear barcode needs width the way a QR needs area.
 *
 * A `CT-000123` symbol is 134 modules including the quiet zones. At 48 mm that
 * is a 0.36 mm module, which is below what a thermal head at 180 dpi can hold
 * cleanly; at 60 mm it is 0.45 mm, which it can. A barcode printed too narrow
 * looks perfectly fine and simply refuses to scan.
 */
const BARCODE_LENGTH_MM: Record<TapeWidth, number> = {
  6: 46,
  9: 50,
  12: 54,
  18: 58,
  24: 62,
};

export function labelLengthMm(tape: TapeWidth, symbology: Symbology): number {
  return symbology === 'qr' ? QR_LENGTH_MM[tape] : BARCODE_LENGTH_MM[tape];
}

/**
 * Which symbol goes on the sticker.
 *
 * Client instruction, 2026-08-03: "ganti juga qr menjadi barcode yang bisa di
 * scan". Code 128 is the default now. QR stays available because the scanner
 * reads both and a stack of stickers already printed must keep working — and
 * because on the narrow cassettes a linear symbol runs out of width before a
 * square one runs out of height.
 */
export type Symbology = 'barcode' | 'qr';

export const DEFAULT_SYMBOLOGY: Symbology = 'barcode';

export interface LabelSheetOptions {
  tape?: TapeWidth;
  /** Printed above the code — which print run this sticker belongs to. */
  caption?: string;
  symbology?: Symbology;
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
  { tape = DEFAULT_TAPE, caption, symbology = DEFAULT_SYMBOLOGY }: LabelSheetOptions = {},
): Promise<string> {
  const height = PRINTABLE_MM[tape];
  const length = labelLengthMm(tape, symbology);

  const pages = await Promise.all(
    codes.map(async (code) => {
      const symbol =
        symbology === 'qr'
          ? await qrMarkup(code, height - 1.5)
          : // Bars take the height they can spare after the text underneath;
            // 60% keeps the code readable without starving the symbol.
            code128Svg(code, { widthMm: length - 3, heightMm: height * 0.6 });

      return `<section class="label ${symbology}">
        <div class="symbol">${symbol}</div>
        <div class="text">
          ${caption ? `<div class="caption">${escapeHtml(caption)}</div>` : ''}
          <div class="code">${escapeHtml(code)}</div>
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
    padding: 0.6mm 1.2mm;
    page-break-after: always;
  }
  .label:last-child { page-break-after: auto; }

  /* A QR sits beside its code; a barcode sits above it. */
  .label.qr { display: flex; align-items: center; gap: 1.6mm; }
  .label.qr .text { flex: 1; min-width: 0; text-align: left; }
  .label.barcode { display: flex; flex-direction: column; justify-content: center; }
  .label.barcode .text { text-align: center; }

  .symbol { line-height: 0; }
  .symbol svg { display: block; margin: 0 auto; }
  .caption { font-size: ${(height * 0.12).toFixed(2)}mm; color: #444; letter-spacing: .02em; }
  .code {
    font-size: ${(height * 0.22).toFixed(2)}mm; font-weight: 700;
    letter-spacing: .12em; font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
</style></head>
<body>${pages.join('')}</body></html>`;
}

async function qrMarkup(code: string, sizeMm: number): Promise<string> {
  // `margin: 0` because the tape has its own unprintable border already;
  // adding a quiet zone here would shrink the QR below scanning size.
  const svg = await QRCode.toString(code, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 0,
  });
  return svg.replace('<svg', `<svg width="${sizeMm}mm" height="${sizeMm}mm"`);
}

/** One symbol as an SVG string, for showing a label on screen. */
export async function symbolSvg(
  code: string,
  symbology: Symbology,
  widthPx: number,
  heightPx: number,
): Promise<string> {
  if (symbology === 'barcode') {
    // The helper thinks in millimetres; at screen scale the unit is arbitrary
    // as long as the aspect is right, so pixels are passed straight through.
    return code128Svg(code, { widthMm: widthPx, heightMm: heightPx }).replace(/mm"/g, '"');
  }
  return qrSvg(code, Math.min(widthPx, heightPx));
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
