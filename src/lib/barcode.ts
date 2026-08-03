/**
 * Code 128 — a linear barcode, drawn as SVG.
 *
 * Written by hand rather than pulled in. Code 128 is a lookup table and a
 * weighted checksum; a library would be a dependency and a supply-chain
 * surface for about a hundred lines of arithmetic.
 *
 * WHY CODE 128 AND NOT QR
 * -----------------------
 * Client instruction, 2026-08-03: "ganti juga qr menjadi barcode yang bisa di
 * scan". On a 24 mm tape there is 18 mm of printable height and 48 mm of
 * length, which suits a linear symbol better than a square one: the bars can
 * use the full width, the human-readable code sits underneath, and a cheap
 * laser scanner reads it from further away than it reads a QR.
 *
 * Subset B throughout. The codes look like `CT-000123` — letters, a hyphen and
 * digits — and switching to subset C for the numeric run would save four
 * modules while adding a shift state that has to be got exactly right. Not
 * worth it on a symbol this short.
 *
 * IF THE TABLE BELOW IS WRONG, NOTHING SAYS SO. A mistyped pattern produces a
 * barcode that looks perfectly convincing and simply does not scan — with the
 * sticker already on the laptop. tests/barcode.mjs decodes the output back and
 * checks the structural invariants that hold for every Code 128 symbol.
 */

/**
 * Bar/space run lengths, six per symbol, in modules. Index is the Code 128
 * value: 0–102 are data in subset B order, 103–105 are the start codes, 106 is
 * stop. Every entry sums to 11 except stop, which is 13.
 */
const PATTERNS = [
  '212222',
  '222122',
  '222221',
  '121223',
  '121322',
  '131222',
  '122213',
  '122312',
  '132212',
  '221213',
  '221312',
  '231212',
  '112232',
  '122132',
  '122231',
  '113222',
  '123122',
  '123221',
  '223211',
  '221132',
  '221231',
  '213212',
  '223112',
  '312131',
  '311222',
  '321122',
  '321221',
  '312212',
  '322112',
  '322211',
  '212123',
  '212321',
  '232121',
  '111323',
  '131123',
  '131321',
  '112313',
  '132113',
  '132311',
  '211313',
  '231113',
  '231311',
  '112133',
  '112331',
  '132131',
  '113123',
  '113321',
  '133121',
  '313121',
  '211331',
  '231131',
  '213113',
  '213311',
  '213131',
  '311123',
  '311321',
  '331121',
  '312113',
  '312311',
  '332111',
  '314111',
  '221411',
  '431111',
  '111224',
  '111422',
  '121124',
  '121421',
  '141122',
  '141221',
  '112214',
  '112412',
  '122114',
  '122411',
  '142112',
  '142211',
  '241211',
  '221114',
  '413111',
  '241112',
  '134111',
  '111242',
  '121142',
  '121241',
  '114212',
  '124112',
  '124211',
  '411212',
  '421112',
  '421211',
  '212141',
  '214121',
  '412121',
  '111143',
  '111341',
  '131141',
  '114113',
  '114311',
  '411113',
  '411311',
  '113141',
  '114131',
  '311141',
  '411131',
  '211412',
  '211214',
  '211232',
  '2331112',
];

const START_B = 104;
const STOP = 106;

/** Subset B covers ASCII 32–126; value is the code point minus 32. */
export function isEncodable(value: string): boolean {
  return [...value].every((c) => {
    const code = c.codePointAt(0)!;
    return code >= 32 && code <= 126;
  });
}

/**
 * The Code 128 values for a string: start, data, checksum, stop.
 *
 * Exported so the test can check the checksum independently of the drawing.
 */
export function encodeCode128(value: string): number[] {
  if (!isEncodable(value)) {
    throw new Error('Code 128 subset B covers printable ASCII only');
  }

  const data = [...value].map((c) => c.codePointAt(0)! - 32);

  // Weighted modulo 103: the start code counts once, then each data value is
  // multiplied by its 1-based position.
  let sum = START_B;
  data.forEach((v, i) => {
    sum += v * (i + 1);
  });

  return [START_B, ...data, sum % 103, STOP];
}

/** The full bar/space run lengths for a string, in modules. */
export function code128Modules(value: string): number[] {
  return encodeCode128(value)
    .map((v) => PATTERNS[v]!)
    .join('')
    .split('')
    .map(Number);
}

export interface BarcodeOptions {
  /** Total width of the drawing, in millimetres. */
  widthMm: number;
  /** Height of the bars alone, in millimetres. */
  heightMm: number;
  /**
   * Blank margin at each end, in modules. The symbology requires at least 10;
   * a scanner that cannot see the quiet zone often will not read the symbol at
   * all, and this is the single most common reason a printed barcode fails.
   */
  quietModules?: number;
}

/**
 * An SVG for the bars only. The human-readable text is drawn by the caller, so
 * it can be positioned and styled with the rest of the label.
 *
 * Bars start at the first run and alternate bar, space, bar, space…
 */
export function code128Svg(value: string, options: BarcodeOptions): string {
  const quiet = options.quietModules ?? 10;
  const runs = code128Modules(value);
  const total = runs.reduce((a, b) => a + b, 0) + quiet * 2;

  // One module in millimetres. Everything is laid out in modules and scaled
  // once, so the bars stay on exact boundaries and no rounding accumulates
  // across the symbol.
  const unit = options.widthMm / total;

  let x = quiet;
  const bars: string[] = [];

  runs.forEach((run, i) => {
    // Even indices are bars, odd are spaces.
    if (i % 2 === 0) {
      bars.push(
        `<rect x="${(x * unit).toFixed(4)}" y="0" ` +
          `width="${(run * unit).toFixed(4)}" height="${options.heightMm}" fill="#000"/>`,
      );
    }
    x += run;
  });

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `width="${options.widthMm}mm" height="${options.heightMm}mm" ` +
    `viewBox="0 0 ${options.widthMm} ${options.heightMm}" shape-rendering="crispEdges">` +
    bars.join('') +
    `</svg>`
  );
}
