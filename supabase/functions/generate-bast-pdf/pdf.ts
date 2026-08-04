/**
 * A very small PDF 1.4 writer — just enough for the BAST letterhead.
 *
 * Written by hand rather than pulled from a library because the document needs
 * exactly five primitives (text, a filled rectangle, a line, an image, and a
 * page) and a dependency-free function cold-starts faster and cannot drift.
 *
 * Only the two base-14 Helvetica faces are used, so no font has to be embedded;
 * their WinAnsi advance widths are inlined below for accurate centring.
 */

// Helvetica / Helvetica-Bold advance widths (per 1000 units) for codes 32–126.
const W_REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const W_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
  611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
  278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/** The handful of non-ASCII characters this document actually uses. */
const WIN_ANSI: Record<string, { code: number; width: number }> = {
  '—': { code: 0x97, width: 1000 },
  '–': { code: 0x96, width: 556 },
  '·': { code: 0xb7, width: 278 },
  '“': { code: 0x93, width: 333 },
  '”': { code: 0x94, width: 333 },
  '’': { code: 0x92, width: 222 },
  '°': { code: 0xb0, width: 400 },
};

export type Face = 'regular' | 'bold';

export function textWidth(text: string, size: number, face: Face): number {
  const widths = face === 'bold' ? W_BOLD : W_REGULAR;
  let total = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code >= 32 && code <= 126) total += widths[code - 32]!;
    else if (WIN_ANSI[char]) total += WIN_ANSI[char]!.width;
    else total += widths[63 - 32]!; // unknown -> '?'
  }
  return (total * size) / 1000;
}

/** Escapes a string for a PDF literal, re-encoding the known non-ASCII glyphs. */
function literal(text: string): string {
  let out = '';
  for (const char of text) {
    if (char === '(' || char === ')' || char === '\\') out += `\\${char}`;
    else if (WIN_ANSI[char]) out += `\\${WIN_ANSI[char]!.code.toString(8).padStart(3, '0')}`;
    else {
      const code = char.codePointAt(0)!;
      out += code >= 32 && code <= 126 ? char : '?';
    }
  }
  return out;
}

/**
 * Greedy word wrap against the real advance widths.
 *
 * A single token wider than the column is broken by character rather than left
 * to overrun. That case is not hypothetical here: the goods table has a Serial
 * Number column, serials contain no spaces, and an overrunning serial does not
 * merely look wrong — it prints across the ruled border into the next column,
 * where it reads as that column's value.
 */
export function wrap(text: string, size: number, face: Face, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(candidate, size, face) <= maxWidth) {
      line = candidate;
      continue;
    }

    if (line) {
      lines.push(line);
      line = '';
    }

    if (textWidth(word, size, face) <= maxWidth) {
      line = word;
      continue;
    }

    // Too wide even alone. The `&& chunk` guard is what stops this looping
    // forever when the column is narrower than a single character.
    let chunk = '';
    for (const char of word) {
      if (textWidth(chunk + char, size, face) > maxWidth && chunk) {
        lines.push(chunk);
        chunk = char;
      } else {
        chunk += char;
      }
    }
    line = chunk;
  }

  if (line) lines.push(line);
  return lines;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function rgb(hex: string): Rgb {
  const value = parseInt(hex.replace('#', ''), 16);
  return {
    r: ((value >> 16) & 0xff) / 255,
    g: ((value >> 8) & 0xff) / 255,
    b: (value & 0xff) / 255,
  };
}

function n(value: number): string {
  return Number(value.toFixed(3)).toString();
}

/**
 * Page content builder. Coordinates are PDF user space: origin bottom-left,
 * units are points.
 */
export class Content {
  private ops: string[] = [];

  text(
    value: string,
    x: number,
    y: number,
    opts: { size: number; face?: Face; color?: Rgb; align?: 'left' | 'center' },
  ): this {
    const face = opts.face ?? 'regular';
    const color = opts.color ?? { r: 0, g: 0, b: 0 };
    const drawX = opts.align === 'center' ? x - textWidth(value, opts.size, face) / 2 : x;

    this.ops.push(
      'BT',
      `${n(color.r)} ${n(color.g)} ${n(color.b)} rg`,
      `/${face === 'bold' ? 'F2' : 'F1'} ${n(opts.size)} Tf`,
      `1 0 0 1 ${n(drawX)} ${n(y)} Tm`,
      `(${literal(value)}) Tj`,
      'ET',
    );
    return this;
  }

  rect(x: number, y: number, width: number, height: number, color: Rgb): this {
    this.ops.push(
      `${n(color.r)} ${n(color.g)} ${n(color.b)} rg`,
      `${n(x)} ${n(y)} ${n(width)} ${n(height)} re f`,
    );
    return this;
  }

  line(x1: number, y1: number, x2: number, y2: number, width: number, color: Rgb): this {
    this.ops.push(
      `${n(color.r)} ${n(color.g)} ${n(color.b)} RG`,
      `${n(width)} w`,
      `${n(x1)} ${n(y1)} m ${n(x2)} ${n(y2)} l S`,
    );
    return this;
  }

  /** Draws one of the embedded images into the given box. */
  image(name: string, x: number, y: number, width: number, height: number): this {
    this.ops.push('q', `${n(width)} 0 0 ${n(height)} ${n(x)} ${n(y)} cm`, `/${name} Do`, 'Q');
    return this;
  }

  /**
   * Freehand strokes — a signature.
   *
   * Round caps and round joins matter more than they look: with the default
   * butt cap every change of direction leaves a visible notch, and handwriting
   * is nothing but changes of direction. A single-point stroke (a dot on an
   * "i") is drawn as a zero-length segment, which a round cap renders as a dot.
   */
  strokes(paths: [number, number][][], width: number, color: Rgb): this {
    if (paths.length === 0) return this;

    this.ops.push(
      'q',
      `${n(color.r)} ${n(color.g)} ${n(color.b)} RG`,
      `${n(width)} w`,
      '1 J', // round cap
      '1 j', // round join
    );

    for (const path of paths) {
      if (path.length === 0) continue;
      const [x0, y0] = path[0]!;
      this.ops.push(`${n(x0)} ${n(y0)} m`);
      if (path.length === 1) this.ops.push(`${n(x0)} ${n(y0)} l`);
      else for (const [x, y] of path.slice(1)) this.ops.push(`${n(x)} ${n(y)} l`);
      this.ops.push('S');
    }

    this.ops.push('Q');
    return this;
  }

  toString(): string {
    return this.ops.join('\n');
  }
}

export interface ImageXObject {
  width: number;
  height: number;
  /** Deflated 8-bit RGB samples. */
  data: Uint8Array;
}

/**
 * Assembles the objects into a complete file. Built as byte chunks so the
 * cross-reference offsets stay exact once binary image data is in the mix.
 *
 * `images` is keyed by the name used in the content stream (`Im1`, `Im2`, …).
 * An entry with no data is skipped entirely rather than embedded empty — that
 * is how a missing letterhead logo degrades to no logo instead of a PDF a
 * reader refuses to open.
 */
export function buildPdf(
  content: Content,
  images: Record<string, ImageXObject>,
  pageWidth: number,
  pageHeight: number,
): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const offsets: number[] = [];

  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };

  const startObject = () => {
    offsets.push(length);
  };

  // Objects 1-6 are fixed; the images follow from 7 upwards.
  const embedded = Object.entries(images).filter(([, image]) => image.data.length > 0);
  const xobjects = embedded.map(([name], i) => `/${name} ${7 + i} 0 R`).join(' ');

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  startObject();
  push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  startObject();
  push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  startObject();
  push(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R ' +
      `/MediaBox [0 0 ${n(pageWidth)} ${n(pageHeight)}] ` +
      `/Resources << /Font << /F1 5 0 R /F2 6 0 R >> /XObject << ${xobjects} >> >> ` +
      '/Contents 4 0 R >>\nendobj\n',
  );

  const stream = content.toString();
  startObject();
  push(`4 0 obj\n<< /Length ${encoder.encode(stream).length} >>\nstream\n`);
  push(stream);
  push('\nendstream\nendobj\n');

  startObject();
  push(
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica ' +
      '/Encoding /WinAnsiEncoding >>\nendobj\n',
  );

  startObject();
  push(
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold ' +
      '/Encoding /WinAnsiEncoding >>\nendobj\n',
  );

  embedded.forEach(([, image], i) => {
    startObject();
    push(
      `${7 + i} 0 obj\n<< /Type /XObject /Subtype /Image ` +
        `/Width ${image.width} /Height ${image.height} ` +
        '/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode ' +
        `/Length ${image.data.length} >>\nstream\n`,
    );
    push(image.data);
    push('\nendstream\nendobj\n');
  });

  const xrefAt = length;
  const count = offsets.length + 1;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let cursor = 0;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  return out;
}
