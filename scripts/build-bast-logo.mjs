/**
 * Bakes assets/cite-logo.png into a PDF-ready image stream for the
 * generate-bast-pdf Edge Function.
 *
 * The letterhead in README § BAST needs the real CITE mark, and a PDF can only
 * embed raw sample data — it has no PNG decoder. Rather than decoding the PNG
 * inside the function on every request (and shipping a static asset alongside
 * the bundled JS, which the Edge runtime does not guarantee), the decode
 * happens once, here, and the result is committed as a TypeScript module.
 *
 * Re-run after changing the logo:
 *   node scripts/build-bast-logo.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

const SOURCE = 'assets/cite-logo.png';
const TARGET = 'supabase/functions/generate-bast-pdf/logo.ts';
// The mark prints at 22pt; 96px keeps it crisp at any sane print scale while
// staying small enough to inline.
const OUT_W = 96;

function readChunks(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('Not a PNG');
  const chunks = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    chunks.push({ type, data: buffer.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  return chunks;
}

/** Reverses the per-scanline PNG filters. 8-bit RGBA, non-interlaced only. */
function unfilter(raw, width, height) {
  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const prev = y === 0 ? null : out.subarray((y - 1) * stride, y * stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);

    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let value = line[x];

      switch (filter) {
        case 0:
          break;
        case 1:
          value += a;
          break;
        case 2:
          value += b;
          break;
        case 3:
          value += (a + b) >> 1;
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
        default:
          throw new Error(`Unsupported PNG filter ${filter}`);
      }
      cur[x] = value & 0xff;
    }
  }
  return out;
}

const png = readFileSync(SOURCE);
const chunks = readChunks(png);

const ihdr = chunks.find((c) => c.type === 'IHDR');
const width = ihdr.data.readUInt32BE(0);
const height = ihdr.data.readUInt32BE(4);
const depth = ihdr.data[8];
const colorType = ihdr.data[9];
const interlace = ihdr.data[12];

if (depth !== 8 || colorType !== 6 || interlace !== 0) {
  throw new Error(`Expected 8-bit RGBA non-interlaced, got depth ${depth} type ${colorType}`);
}

const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
const rgba = unfilter(inflateSync(idat), width, height);

// Nearest-neighbour downsample, compositing the alpha over white — the sheet
// the logo sits on is white, so the PDF needs no soft mask.
const outH = Math.max(1, Math.round((OUT_W * height) / width));
const rgb = Buffer.alloc(OUT_W * outH * 3);

for (let y = 0; y < outH; y += 1) {
  const sy = Math.min(height - 1, Math.floor((y * height) / outH));
  for (let x = 0; x < OUT_W; x += 1) {
    const sx = Math.min(width - 1, Math.floor((x * width) / OUT_W));
    const s = (sy * width + sx) * 4;
    const d = (y * OUT_W + x) * 3;
    const alpha = rgba[s + 3] / 255;
    for (let ch = 0; ch < 3; ch += 1) {
      rgb[d + ch] = Math.round(rgba[s + ch] * alpha + 255 * (1 - alpha));
    }
  }
}

const stream = deflateSync(rgb, { level: 9 });
const base64 = stream.toString('base64');

const lines = [];
for (let i = 0; i < base64.length; i += 96) lines.push(`  '${base64.slice(i, i + 96)}',`);

writeFileSync(
  TARGET,
  `/**
 * CITE logo, baked for PDF embedding. GENERATED — do not edit by hand.
 *   node scripts/build-bast-logo.mjs
 *
 * ${OUT_W}×${outH} 8-bit RGB, alpha already composited over white, then
 * deflated. The PDF writer inlines this as a /FlateDecode /DeviceRGB XObject.
 */

export const logoWidth = ${OUT_W};
export const logoHeight = ${outH};

export const logoBase64 = [
${lines.join('\n')}
].join('');
`,
  'utf8',
);

console.log(
  `${SOURCE} ${width}×${height} → ${TARGET} ${OUT_W}×${outH}, ` +
    `${rgb.length} raw → ${stream.length} deflated (${base64.length} base64 chars)`,
);
