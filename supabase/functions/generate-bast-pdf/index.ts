/**
 * generate-bast-pdf — the Berita Acara, rendered to match the client's own
 * paperwork rather than to resemble it.
 *
 * WHAT THIS SHEET IS
 * ------------------
 * Two scanned documents were provided on 2026-08-04 as the reference: a Berita
 * Acara Serah Terima Barang and a Berita Acara Penarikan Barang. They are the
 * same sheet with four differences — the title, the verb in the opening
 * sentence, the verb in the second paragraph, and the two signature captions —
 * so `doc.kind` picks those four and everything else is shared.
 *
 * Structure, top to bottom, exactly as on the scans:
 *
 *   ASPIRE lockup, alone            (no CITE roundel, no "CORPORATE IT" line)
 *   BERITA ACARA … BARANG           centred, bold, underlined
 *   "Pada hari ini Senin tanggal Dua puluh lima Bulan Mei Tahun …"
 *   Nama / NIK / Jabatan / Dept.    a four-line block, aligned colons
 *   "Alat Tersebut akan …"
 *   No | Jenis/Type | Serial Number | Kondisi     fully ruled
 *   "Demikian Berita Acara …"
 *   Jakarta, 25 Mei 2026
 *   Yang Menyerahkan            Yang Menerima     names bold and underlined
 *   PT. STARGATE PASIFIC RESOURCES + address      page footer
 *
 * The date is spelled out because the scans spell it out; terbilang() in
 * migration 0032 does that in SQL so the on-screen preview and this file cannot
 * disagree about what the sentence says.
 *
 * TWO OUTPUTS, ONE RENDERER
 * -------------------------
 *   finalize: false (default)  ->  bast/<id>/v1.pdf, attach_generated_bast()
 *   finalize: true             ->  bast/<id>/v<n>.pdf, attach_signed_bast()
 *
 * The second is only allowed once both signatures exist. It is the digital
 * equivalent of uploading a scan of a signed sheet, and it goes through the same
 * RPC, so `status = 'signed'` continues to mean exactly one thing: a signed
 * document exists. Nothing about the layout differs between the two — the
 * signed one simply has ink in the signature blocks.
 *
 * The function runs with the CALLER'S token, never the service role, so RLS
 * decides whether this user may see the BAST at all and the storage policies
 * decide whether the file may be written. Version rows are inserted by the
 * RPCs (working rule #2), never from here.
 */

import { Content, buildPdf, rgb, textWidth, wrap } from './pdf.ts';
import { aspireLogoBase64, aspireLogoHeight, aspireLogoWidth } from './aspire-logo.ts';

// The printed document's palette. Near-black rules and near-black text, because
// this is a sheet that gets photocopied and signed in biro — the soft greys the
// app UI uses vanish on the second photocopy.
const INK = rgb('#000000');
const BODY = rgb('#111111');
const MUTED = rgb('#444444');
const TABLE_BORDER = rgb('#000000');
// Signatures are drawn in near-black rather than pure black so they read as ink
// on the page rather than as part of the printed rules around them.
const SIGNATURE_INK = rgb('#101828');

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 62;
const MARGIN_TOP = 52;
const CONTENT_W = PAGE_W - MARGIN * 2;

/** The four things that differ between the two documents. */
interface Wording {
  title: string;
  /** "… telah diserah terimakan 1 (Satu) unit X dari Divisi IT kepada :" */
  opening: (unit: string) => string;
  /** "Alat Tersebut akan dipergunakan untuk …" */
  purpose: (company: string) => string;
  closing: string;
  captions: [string, string];
}

const WORDING: Record<'handover' | 'return' | 'accessory', Wording> = {
  handover: {
    title: 'BERITA ACARA SERAH TERIMA BARANG',
    opening: (unit) => `telah diserah terimakan 1 (Satu) unit ${unit} dari Divisi IT kepada :`,
    purpose: (company) =>
      `Alat Tersebut akan dipergunakan untuk kegiatan operasional perusahaan ${company} dengan rincian sebagai berikut :`,
    closing:
      'Demikian Berita Acara serah terima barang ini buat, agar dapat diketahui serta ditandatangani bersama serta diketahui oleh pihak - pihak yang berkepentingan.',
    captions: ['Yang Menyerahkan', 'Yang Menerima'],
  },
  return: {
    title: 'BERITA ACARA PENARIKAN BARANG',
    opening: (unit) => `telah diberikan 1 (Satu) unit ${unit} kepada Divisi IT dari :`,
    purpose: (company) =>
      `Alat Tersebut akan dikembalikan ke perusahaan ${company} dengan rincian sebagai berikut :`,
    closing:
      'Demikian Berita Acara penarikan barang ini buat, agar dapat diketahui serta ditandatangani bersama serta diketahui oleh pihak - pihak yang berkepentingan.',
    // Note the left column is still the CITE side. On a withdrawal the IT
    // officer is the one RECEIVING, which is why these are not simply swapped.
    captions: ['Yang Menerima', 'Yang Memberikan'],
  },
  // Perlengkapan handed over on its own: mice, headsets, cables. There is no
  // asset on this sheet, so the opening sentence names no unit and counts
  // nothing — the goods table below carries the quantities instead.
  accessory: {
    title: 'BERITA ACARA SERAH TERIMA PERLENGKAPAN',
    opening: () => 'telah diserah terimakan perlengkapan IT dari Divisi IT kepada :',
    purpose: (company) =>
      `Perlengkapan Tersebut akan dipergunakan untuk kegiatan operasional perusahaan ${company} dengan rincian sebagai berikut :`,
    closing:
      'Demikian Berita Acara serah terima perlengkapan ini buat, agar dapat diketahui serta ditandatangani bersama serta diketahui oleh pihak - pihak yang berkepentingan.',
    captions: ['Yang Menyerahkan', 'Yang Menerima'],
  },
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Signature {
  signerName: string;
  signerTitle: string | null;
  /** Polylines, normalised by the pad width — see migration 0015. */
  strokes: [number, number][][];
  signedAt: string;
}

interface BastVersionRow {
  version: number;
}

/** One line of the goods table. */
interface BastItem {
  jenis: string;
  serial: string;
  kondisi: string;
}

interface BastDocument {
  id: string;
  bastNumber: string;
  kind: 'handover' | 'return' | 'accessory';
  longDate: string;
  /** "Senin tanggal Dua puluh lima Bulan Mei Tahun Dua ribu dua puluh enam". */
  dateWords: string;
  /** "Jakarta, 25 Mei 2026". */
  placeDate: string;
  /** Both null on a BAST Perlengkapan — that sheet has no asset. */
  assetCode: string | null;
  assetName: string | null;
  employeeName: string;
  /** The other shift on a shared asset. Null on every other document. */
  secondaryName?: string | null;
  employeeNik: string;
  employeeTitle: string;
  departmentName: string;
  locationName: string;
  companyName: string;
  officeLabel: string;
  addressLine: string;
  conditionText: string;
  handedOverBy: string;
  handedOverDept: string;
  items: BastItem[];
  signatures: { handover?: Signature; receiver?: Signature; receiver_2?: Signature };
  versions: BastVersionRow[];
}

function decode(base64: string): Uint8Array {
  if (!base64) return new Uint8Array(0);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Places a captured signature inside a box, keeping its aspect ratio and
 * sitting it on the signature rule.
 *
 * The strokes arrive in screen coordinates (y grows downward) normalised by the
 * pad's width; PDF user space has y growing upward, hence the flip. The drawing
 * is fitted to its own bounding box rather than to the pad, so a small signature
 * in the corner of the pad still prints at a readable size.
 */
function drawSignature(
  c: Content,
  signature: Signature,
  centreX: number,
  baselineY: number,
  maxWidth: number,
  maxHeight: number,
) {
  const points = signature.strokes.flat();
  if (points.length === 0) return;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  // A signature that is a single horizontal line has zero height; the epsilon
  // keeps the scale finite rather than producing NaN coordinates.
  const width = Math.max(maxX - minX, 1e-4);
  const height = Math.max(maxY - minY, 1e-4);
  const scale = Math.min(maxWidth / width, maxHeight / height);

  const left = centreX - (width * scale) / 2;
  const bottom = baselineY + 3;

  const paths = signature.strokes
    .filter((stroke) => stroke.length > 0)
    .map(
      (stroke) =>
        stroke.map(([x, y]) => [left + (x - minX) * scale, bottom + (maxY - y) * scale]) as [
          number,
          number,
        ][],
    );

  // 1.1pt is about what a fine-tip pen leaves; thinner disappears in a scan of
  // the printout, thicker turns tight loops into blobs.
  c.strokes(paths, 1.1, SIGNATURE_INK);
}

/** Draws wrapped body copy and returns the y the next block starts from. */
function paragraph(
  c: Content,
  text: string,
  x: number,
  y: number,
  width: number,
  size = 10,
  leading = 15.5,
): number {
  let cursor = y;
  for (const line of wrap(text, size, 'regular', width)) {
    c.text(line, x, cursor, { size, color: BODY });
    cursor -= leading;
  }
  return cursor;
}

function render(doc: BastDocument): Uint8Array {
  const c = new Content();
  const centreX = PAGE_W / 2;
  const w = WORDING[doc.kind] ?? WORDING.handover;
  const items = doc.items?.length ? doc.items : [];

  // ---- letterhead ----------------------------------------------------------
  // ASPIRE alone. The CITE roundel and the "CORPORATE IT — CITE" wordmark are
  // gone at the client's instruction — the department raising the document is
  // named in the body sentence ("dari Divisi IT"), which is where their own
  // paperwork puts it, and a second mark on the letterhead reads as a second
  // company.
  let y = PAGE_H - MARGIN_TOP;

  if (aspireLogoWidth > 0) {
    const logoH = 44;
    const logoW = (logoH * aspireLogoWidth) / aspireLogoHeight;
    c.image('Im2', MARGIN, y - logoH, logoW, logoH);
    y -= logoH;
  }

  // ---- title, centred and underlined ---------------------------------------
  y -= 42;
  const titleW = textWidth(w.title, 11.5, 'bold');
  c.text(w.title, centreX, y, { size: 11.5, face: 'bold', color: INK, align: 'center' });
  c.line(centreX - titleW / 2, y - 3.5, centreX + titleW / 2, y - 3.5, 1, INK);

  // The document number is not on the scans, but a Berita Acara without its own
  // number cannot be referenced in a later audit. It goes under the title,
  // small, where it does not compete with the heading.
  y -= 16;
  c.text(`No. ${doc.bastNumber}`, centreX, y, { size: 8.5, color: MUTED, align: 'center' });

  // ---- opening sentence ----------------------------------------------------
  y -= 32;
  y = paragraph(
    c,
    `Pada hari ini ${doc.dateWords}, ${w.opening(doc.assetName ?? '')}`,
    MARGIN,
    y,
    CONTENT_W,
  );

  // ---- the four-line party block -------------------------------------------
  // Aligned colons, because the scans align them and a ragged colon column is
  // the first thing that makes a document look retyped rather than issued.
  y -= 6;
  const blockX = MARGIN + 18;
  const colonX = blockX + 92;
  const partyRows: [string, string][] = [
    ['Nama', doc.employeeName],
    // The withdrawal scan calls it NOKAR, the handover scan calls it NIK. They
    // are the same employee number; one label beats guessing per document.
    ['NIK', doc.employeeNik || '-'],
    ['Jabatan', doc.employeeTitle || '-'],
    ['Dept./Divisi', doc.departmentName || '-'],
  ];
  for (const [label, value] of partyRows) {
    c.text(label, blockX, y, { size: 10, color: BODY });
    c.text(':', colonX, y, { size: 10, color: BODY });
    c.text(value, colonX + 10, y, { size: 10, color: INK });
    y -= 15.5;
  }

  // ---- what happens to it, and the goods table -----------------------------
  y -= 8;
  y = paragraph(c, w.purpose(`${doc.companyName} ${doc.officeLabel}`), MARGIN, y, CONTENT_W);

  y -= 10;
  const cols = [34, 186, 140, CONTENT_W - 34 - 186 - 140];
  const edges = cols.reduce<number[]>(
    (acc, width) => [...acc, acc[acc.length - 1]! + width],
    [MARGIN],
  );
  const headers = ['No', 'Jenis/Type', 'Serial Number', 'Kondisi'];

  const tableTop = y;
  const headerH = 21;

  headers.forEach((label, i) => {
    const cx = (edges[i]! + edges[i + 1]!) / 2;
    c.text(label, cx, tableTop - 14, { size: 9.5, face: 'bold', color: INK, align: 'center' });
  });

  // Rows grow to fit: a long model name wraps rather than running under the
  // next column, which is the one failure mode that would make the table lie.
  let rowTop = tableTop - headerH;
  const rowBounds: number[] = [tableTop, rowTop];

  items.forEach((item, index) => {
    const jenisLines = wrap(item.jenis, 9.5, 'regular', cols[1]! - 12);
    const serialLines = wrap(item.serial || '-', 9.5, 'regular', cols[2]! - 12);
    const kondisiLines = wrap(item.kondisi || '-', 9.5, 'regular', cols[3]! - 12);
    const lines = Math.max(jenisLines.length, serialLines.length, kondisiLines.length, 1);
    const rowH = lines * 12 + 10;

    const firstBaseline = rowTop - 15;
    c.text(String(index + 1), (edges[0]! + edges[1]!) / 2, firstBaseline, {
      size: 9.5,
      color: INK,
      align: 'center',
    });
    jenisLines.forEach((line, i) => {
      c.text(line, edges[1]! + 6, firstBaseline - i * 12, { size: 9.5, color: INK });
    });
    serialLines.forEach((line, i) => {
      c.text(line, (edges[2]! + edges[3]!) / 2, firstBaseline - i * 12, {
        size: 9.5,
        color: INK,
        align: 'center',
      });
    });
    kondisiLines.forEach((line, i) => {
      c.text(line, (edges[3]! + edges[4]!) / 2, firstBaseline - i * 12, {
        size: 9.5,
        color: INK,
        align: 'center',
      });
    });

    rowTop -= rowH;
    rowBounds.push(rowTop);
  });

  const tableBottom = rowTop;
  for (const edgeY of rowBounds) {
    c.line(MARGIN, edgeY, MARGIN + CONTENT_W, edgeY, 0.8, TABLE_BORDER);
  }
  for (const edgeX of edges) {
    c.line(edgeX, tableTop, edgeX, tableBottom, 0.8, TABLE_BORDER);
  }

  // ---- closing, place line -------------------------------------------------
  y = tableBottom - 26;
  y = paragraph(c, w.closing, MARGIN, y, CONTENT_W);

  y -= 12;
  c.text(doc.placeDate, MARGIN, y, { size: 10, color: BODY });

  // ---- signature blocks ----------------------------------------------------
  //
  // Left column is always the CITE side. The right column carries one block per
  // recipient, STACKED rather than spread: a shared handy-talkie has two, and
  // widening the sheet is not an option on A4.
  //
  // The second block is made room for by moving the first one up, never by
  // shrinking the signature box — strokes are normalised 0..1 and would shrink
  // with it, which is how a signature turns into a smudge.
  const rightX = MARGIN + CONTENT_W * 0.56;
  const handover = doc.signatures?.handover;
  const receiver = doc.signatures?.receiver;
  const receiver2 = doc.signatures?.receiver_2;
  const hasSecond = Boolean(doc.secondaryName);

  // The gap between a caption and its ruled name IS the signature box, so its
  // height is fixed rather than derived — the strokes are normalised 0..1 and
  // would shrink into a smudge along with any smaller box.
  const BLOCK_H = 96;
  // Clear of the first block's electronic-signature timestamp, which sits 14pt
  // below its ruled name.
  const STACK_GAP = 24;
  const captionY = y - 15;

  // [caption, signature, printed name, x, the y its own caption sits on]
  const blocks: [string, Signature | undefined, string, number, number][] = [
    [w.captions[0], handover, handover?.signerName ?? doc.handedOverBy, MARGIN, captionY],
    [w.captions[1], receiver, receiver?.signerName ?? doc.employeeName, rightX, captionY],
  ];

  if (hasSecond) {
    blocks.push([
      w.captions[1],
      receiver2,
      receiver2?.signerName ?? doc.secondaryName ?? '',
      rightX,
      captionY - BLOCK_H - STACK_GAP,
    ]);
  }

  for (const [caption, signature, name, x, blockCaptionY] of blocks) {
    const nameY = blockCaptionY - BLOCK_H;

    c.text(caption, x, blockCaptionY, { size: 10, color: BODY });
    if (signature) drawSignature(c, signature, x + 80, nameY, 170, 78);

    c.text(name, x, nameY, { size: 10, face: 'bold', color: INK });
    const nameW = textWidth(name, 10, 'bold');
    c.line(x, nameY - 3, x + nameW, nameY - 3, 0.8, INK);

    // The timestamp is the part a wet signature cannot carry, and it is the
    // reason this counts as evidence rather than decoration.
    if (signature) {
      const when = new Date(signature.signedAt).toISOString().slice(0, 16).replace('T', ' ');
      c.text(`Ditandatangani secara elektronik - ${when} UTC`, x, nameY - 14, {
        size: 6.5,
        color: MUTED,
      });
    }
  }

  // ---- footer --------------------------------------------------------------
  c.text(doc.companyName.toUpperCase(), MARGIN, 52, { size: 8, face: 'bold', color: BODY });
  if (doc.addressLine) {
    c.text(doc.addressLine, MARGIN, 42, { size: 7.5, color: MUTED });
  }

  return buildPdf(
    c,
    { Im2: { width: aspireLogoWidth, height: aspireLogoHeight, data: decode(aspireLogoBase64) } },
    PAGE_W,
    PAGE_H,
  );
}

/**
 * The Postgrest and Storage calls go over plain fetch rather than through
 * supabase-js: three requests do not justify pulling a bundle off a CDN on
 * every cold start, and the function stays dependency-free.
 */
class Api {
  constructor(
    private readonly baseUrl: string,
    private readonly anonKey: string,
    private readonly authorization: string,
  ) {}

  private get headers(): Record<string, string> {
    return { apikey: this.anonKey, Authorization: this.authorization };
  }

  async rpc<T>(name: string, args: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { ...this.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error((JSON.parse(body) as { message?: string }).message ?? body);
    }
    return (body ? JSON.parse(body) : null) as T;
  }

  async upload(bucket: string, path: string, bytes: Uint8Array, contentType: string) {
    const response = await fetch(`${this.baseUrl}/storage/v1/object/${bucket}/${path}`, {
      method: 'POST',
      headers: { ...this.headers, 'Content-Type': contentType, 'x-upsert': 'true' },
      body: bytes,
    });
    if (!response.ok) throw new Error(await response.text());
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) return json({ error: 'Not signed in' }, 401);

    const { bastId, finalize } = (await request.json()) as {
      bastId?: string;
      finalize?: boolean;
    };
    if (!bastId) return json({ error: 'bastId is required' }, 400);

    const api = new Api(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      authorization,
    );

    // RLS decides this — an out-of-scope BAST comes back null, not forbidden.
    const doc = await api.rpc<BastDocument | null>('bast_detail', { p_id: bastId });
    if (!doc) return json({ error: 'BAST not found' }, 404);

    const complete = Boolean(doc.signatures?.handover && doc.signatures?.receiver);
    if (finalize && !complete) {
      return json({ error: 'Both signatures are needed before this can be finalised' }, 400);
    }

    const bytes = render(doc);

    if (finalize) {
      // A new version each time, so re-finalising after a corrected signature
      // leaves the earlier document in the history rather than replacing it.
      const version = Math.max(0, ...doc.versions.map((v) => v.version)) + 1;
      const path = `${bastId}/v${version}.pdf`;

      await api.upload('bast', path, bytes, 'application/pdf');
      await api.rpc('attach_signed_bast', {
        p_bast: bastId,
        p_path: path,
        p_size: bytes.length,
        p_mime: 'application/pdf',
      });

      return json({
        bastId,
        bastNumber: doc.bastNumber,
        filePath: path,
        fileSize: bytes.length,
        signed: true,
      });
    }

    // Regenerating replaces the same object, which is why v1 stays v1 and the
    // append-only version history never has to be rewritten.
    const path = `${bastId}/v1.pdf`;
    await api.upload('bast', path, bytes, 'application/pdf');
    await api.rpc('attach_generated_bast', {
      p_bast: bastId,
      p_path: path,
      p_size: bytes.length,
    });

    // No signed URL is returned on purpose. Inside the Edge runtime
    // SUPABASE_URL is the stack's INTERNAL host, so a URL minted here is not
    // reachable from a phone. The client mints its own from `filePath`.
    return json({
      bastId,
      bastNumber: doc.bastNumber,
      filePath: path,
      fileSize: bytes.length,
      signed: false,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500);
  }
});
