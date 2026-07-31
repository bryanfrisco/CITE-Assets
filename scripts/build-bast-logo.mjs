/**
 * Bakes the letterhead logos into PDF-ready image streams for the
 * generate-bast-pdf Edge Function.
 *
 * The letterhead needs the real marks, and a PDF can only embed raw sample data
 * — it has no PNG decoder. Rather than decoding the PNG inside the function on
 * every request (and shipping a static asset alongside the bundled JS, which the
 * Edge runtime does not guarantee), the decode happens once, here, and the
 * result is committed as a TypeScript module.
 *
 * Two logos, in the order they print (client instruction, 2026-07-30:
 * "tambahkan logo aspire di paling pertama"):
 *
 *   assets/aspire-logo.png  ->  aspire-logo.ts   the company mark, leftmost
 *   assets/cite-logo.png    ->  logo.ts          the CITE mark
 *
 * A MISSING SOURCE IS NOT AN ERROR. It emits an empty module, the PDF writer
 * skips the XObject, and the letterhead prints without that mark. The
 * alternative — failing the build — would mean a logo file nobody has yet
 * blocks every other change to the document.
 *
 * Re-run after changing either logo:
 *   node scripts/build-bast-logo.mjs
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

const LOGOS = [
  {
    source: 'assets/aspire-logo.png',
    target: 'supabase/functions/generate-bast-pdf/aspire-logo.ts',
    prefix: 'aspireLogo',
    label: 'ASPIRE',
    // Wider than the CITE mark because it is a wordmark, not a monogram: the
    // lettering has to survive being printed at ~70pt across.
    outWidth: 320,
  },
  {
    source: 'assets/cite-logo.png',
    target: 'supabase/functions/generate-bast-pdf/logo.ts',
    prefix: 'logo',
    label: 'CITE',
    // The mark prints at 22pt; 96px keeps it crisp at any sane print scale
    // while staying small enough to inline.
    outWidth: 96,
  },
];

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

/** Reverses the per-scanline PNG filters. 8-bit, non-interlaced only. */
function unfilter(raw, width, height, bpp) {
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

function emptyModule({ prefix, label, source }) {
  return `/**
 * ${label} logo — NOT AVAILABLE.
 *
 * ${source} was not present when this module was generated, so the letterhead
 * prints without this mark. Drop the file in and re-run:
 *   node scripts/build-bast-logo.mjs
 */

export const ${prefix}Width = 0;
export const ${prefix}Height = 0;
export const ${prefix}Base64 = '';
`;
}

function bake({ source, target, prefix, label, outWidth }) {
  if (!existsSync(source)) {
    writeFileSync(target, emptyModule({ prefix, label, source }), 'utf8');
    console.log(`${source} missing → ${target} written empty (letterhead skips this mark)`);
    return;
  }

  const chunks = readChunks(readFileSync(source));
  const ihdr = chunks.find((c) => c.type === 'IHDR');
  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const depth = ihdr.data[8];
  const colorType = ihdr.data[9];
  const interlace = ihdr.data[12];

  // A 1×1 transparent PNG is the committed stand-in — the file has to exist for
  // Metro to resolve the `require` in the on-screen preview, but there is no
  // artwork in it yet. Treated as missing so nothing invisible is embedded.
  if (width <= 2 && height <= 2) {
    writeFileSync(target, emptyModule({ prefix, label, source }), 'utf8');
    console.log(`${source} is the ${width}×${height} placeholder → ${target} written empty`);
    return;
  }

  // 6 = RGBA, 2 = RGB. Anything else (palette, greyscale, 16-bit, interlaced)
  // is rejected rather than guessed at — re-export the file instead.
  if (depth !== 8 || (colorType !== 6 && colorType !== 2) || interlace !== 0) {
    throw new Error(
      `${source}: expected 8-bit RGB or RGBA, non-interlaced; got depth ${depth} ` +
        `type ${colorType} interlace ${interlace}`,
    );
  }

  const bpp = colorType === 6 ? 4 : 3;
  const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  const pixels = unfilter(inflateSync(idat), width, height, bpp);

  // Box-filter downsample, compositing alpha over white — the sheet the logo
  // sits on is white, so the PDF needs no soft mask. Averaging rather than
  // nearest-neighbour because a wordmark's thin strokes break up badly when
  // samples are simply dropped.
  const outW = Math.min(outWidth, width);
  const outH = Math.max(1, Math.round((outW * height) / width));
  const rgb = Buffer.alloc(outW * outH * 3);

  for (let y = 0; y < outH; y += 1) {
    const y0 = Math.floor((y * height) / outH);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / outH));

    for (let x = 0; x < outW; x += 1) {
      const x0 = Math.floor((x * width) / outW);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / outW));

      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;

      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const s = (sy * width + sx) * bpp;
          const alpha = bpp === 4 ? pixels[s + 3] / 255 : 1;
          r += pixels[s] * alpha + 255 * (1 - alpha);
          g += pixels[s + 1] * alpha + 255 * (1 - alpha);
          b += pixels[s + 2] * alpha + 255 * (1 - alpha);
          count += 1;
        }
      }

      const d = (y * outW + x) * 3;
      rgb[d] = Math.round(r / count);
      rgb[d + 1] = Math.round(g / count);
      rgb[d + 2] = Math.round(b / count);
    }
  }

  const stream = deflateSync(rgb, { level: 9 });
  const base64 = stream.toString('base64');

  const lines = [];
  for (let i = 0; i < base64.length; i += 96) lines.push(`  '${base64.slice(i, i + 96)}',`);

  writeFileSync(
    target,
    `/**
 * ${label} logo, baked for PDF embedding. GENERATED — do not edit by hand.
 *   node scripts/build-bast-logo.mjs
 *
 * ${outW}×${outH} 8-bit RGB, alpha already composited over white, then
 * deflated. The PDF writer inlines this as a /FlateDecode /DeviceRGB XObject.
 */

export const ${prefix}Width = ${outW};
export const ${prefix}Height = ${outH};

export const ${prefix}Base64 = [
${lines.join('\n')}
].join('');
`,
    'utf8',
  );

  console.log(
    `${source} ${width}×${height} → ${target} ${outW}×${outH}, ` +
      `${rgb.length} raw → ${stream.length} deflated (${base64.length} base64 chars)`,
  );
}

for (const logo of LOGOS) bake(logo);
