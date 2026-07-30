/**
 * Generates the square launcher icons a native build needs.
 *
 * `assets/cite-logo.png` is 636×599. Expo requires a SQUARE icon: anything else
 * gets stretched or cropped by the Android and iOS icon pipelines, so the ring
 * would come out oval on a real home screen. This pads the mark onto a square
 * navy canvas at the sizes each platform expects.
 *
 *   assets/icon.png           1024×1024, navy field, mark at 62%  — iOS + fallback
 *   assets/adaptive-icon.png  1024×1024, navy field, mark at 52%  — Android foreground,
 *                             which is masked to a circle/squircle, so the mark has to
 *                             sit inside the inner 66% safe zone.
 *
 * Re-run after changing the logo:
 *   node scripts/build-app-icons.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

const SOURCE = 'assets/cite-logo.png';
// README § Colors — the navy the splash screen already uses.
const NAVY = [0x00, 0x07, 0x2d];

function readChunks(buffer) {
  const chunks = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    chunks.push({
      type: buffer.toString('ascii', offset + 4, offset + 8),
      data: buffer.subarray(offset + 8, offset + 8 + length),
    });
    offset += 12 + length;
  }
  return chunks;
}

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

      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) {
        throw new Error(`Unsupported PNG filter ${filter}`);
      }
      cur[x] = value & 0xff;
    }
  }
  return out;
}

// --- minimal PNG writer -----------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/** Writes 8-bit RGB, one filter-0 scanline per row. */
function writePng(path, rgb, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  const stride = size * 3;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

// --- source -----------------------------------------------------------------
const png = readFileSync(SOURCE);
const chunks = readChunks(png);
const ihdr = chunks.find((c) => c.type === 'IHDR').data;
const srcW = ihdr.readUInt32BE(0);
const srcH = ihdr.readUInt32BE(4);
if (ihdr[8] !== 8 || ihdr[9] !== 6 || ihdr[12] !== 0) {
  throw new Error('Expected 8-bit RGBA non-interlaced source');
}
const rgba = unfilter(
  inflateSync(Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data))),
  srcW,
  srcH,
);

/**
 * Composites the mark, scaled to `fraction` of the canvas and centred, onto a
 * flat navy square. Bilinear so the ring stays smooth when it is scaled up.
 */
function render(size, fraction) {
  const out = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i += 1) {
    out[i * 3] = NAVY[0];
    out[i * 3 + 1] = NAVY[1];
    out[i * 3 + 2] = NAVY[2];
  }

  const scale = Math.min((size * fraction) / srcW, (size * fraction) / srcH);
  const drawW = Math.round(srcW * scale);
  const drawH = Math.round(srcH * scale);
  const offsetX = Math.round((size - drawW) / 2);
  const offsetY = Math.round((size - drawH) / 2);

  for (let y = 0; y < drawH; y += 1) {
    const sy = ((y + 0.5) * srcH) / drawH - 0.5;
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(srcH - 1, y0 + 1);
    const wy = sy - y0;

    for (let x = 0; x < drawW; x += 1) {
      const sx = ((x + 0.5) * srcW) / drawW - 0.5;
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(srcW - 1, x0 + 1);
      const wx = sx - x0;

      const sample = (ch) => {
        const p = (yy, xx) => rgba[(yy * srcW + xx) * 4 + ch];
        return (
          p(y0, x0) * (1 - wx) * (1 - wy) +
          p(y0, x1) * wx * (1 - wy) +
          p(y1, x0) * (1 - wx) * wy +
          p(y1, x1) * wx * wy
        );
      };

      const alpha = sample(3) / 255;
      if (alpha <= 0.002) continue;

      const d = ((offsetY + y) * size + offsetX + x) * 3;
      for (let ch = 0; ch < 3; ch += 1) {
        out[d + ch] = Math.round(sample(ch) * alpha + NAVY[ch] * (1 - alpha));
      }
    }
  }
  return out;
}

writePng('assets/icon.png', render(1024, 0.62), 1024);
writePng('assets/adaptive-icon.png', render(1024, 0.52), 1024);

console.log('assets/icon.png and assets/adaptive-icon.png written (1024×1024, navy field)');
