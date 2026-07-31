/**
 * generate-bast-pdf — IMPLEMENTATION_PLAN.md § Phase 5, extended for E-BAST.
 *
 * Renders the letterhead layout from the prototype's paper preview (ASPIRE mark,
 * CITE mark, navy rule, underlined BERITA ACARA SERAH TERIMA, Indonesian body
 * sentence, bordered detail table, two signature blocks) and stores it in the
 * `bast` bucket.
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
 *
 * The page is A4. Every measurement below is the prototype's preview
 * measurement scaled to the sheet; the proportions are unchanged.
 */

import { Content, buildPdf, rgb, textWidth, wrap } from './pdf.ts';
import { logoBase64, logoHeight, logoWidth } from './logo.ts';
import { aspireLogoBase64, aspireLogoHeight, aspireLogoWidth } from './aspire-logo.ts';

// The paper preview's own palette (README § BAST). These belong to the printed
// document, not the app UI, so they live here rather than in the theme tokens.
const NAVY = rgb('#00072D');
const INK = rgb('#0B1220');
const BODY = rgb('#2B3346');
const MUTED = rgb('#5A6478');
const TABLE_BORDER = rgb('#E6EAF2');
const TABLE_LABEL_BG = rgb('#F6F8FB');
const SIGNATURE_LINE = rgb('#C7CEDB');
// Signatures are drawn in near-black rather than pure black so they read as ink
// on the page rather than as part of the printed rules around them.
const SIGNATURE_INK = rgb('#101828');

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 62;
const CONTENT_W = PAGE_W - MARGIN * 2;

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

interface BastDocument {
  id: string;
  bastNumber: string;
  longDate: string;
  assetCode: string;
  assetName: string;
  employeeName: string;
  departmentName: string;
  locationName: string;
  conditionText: string;
  handedOverBy: string;
  handedOverDept: string;
  signatures: { handover?: Signature; receiver?: Signature };
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

function render(doc: BastDocument): Uint8Array {
  const c = new Content();
  const top = PAGE_H - MARGIN;
  const centreX = PAGE_W / 2;

  // ---- letterhead ----------------------------------------------------------
  // Client instruction: the ASPIRE mark comes first, then CITE. The two are
  // separated by a hairline so that neither reads as a sub-brand of the other:
  // ASPIRE is the company, CITE is the department raising the document.
  const bandH = 30;
  const bandTop = top;
  const bandBottom = bandTop - bandH;
  let x = MARGIN;

  if (aspireLogoWidth > 0) {
    const aspireH = 24;
    const aspireW = (aspireH * aspireLogoWidth) / aspireLogoHeight;
    c.image('Im2', x, bandBottom + (bandH - aspireH) / 2, aspireW, aspireH);
    x += aspireW + 14;

    c.line(x, bandBottom + 3, x, bandTop - 3, 0.8, TABLE_BORDER);
    x += 14;
  }

  const citeW = 26;
  const citeH = (citeW * logoHeight) / logoWidth;
  if (logoWidth > 0) {
    c.image('Im1', x, bandBottom + (bandH - citeH) / 2, citeW, citeH);
    x += citeW + 10;
  }

  c.text('CORPORATE IT — CITE', x, bandBottom + 16, { size: 11, face: 'bold', color: INK });
  c.text('IT ASSET MANAGEMENT', x, bandBottom + 4, { size: 7.5, color: MUTED });

  const ruleY = bandBottom - 12;
  c.line(MARGIN, ruleY, MARGIN + CONTENT_W, ruleY, 2, NAVY);

  // ---- title, underlined, with the number beneath --------------------------
  const titleY = ruleY - 40;
  const title = 'BERITA ACARA SERAH TERIMA';
  const titleW = textWidth(title, 14, 'bold');
  c.text(title, centreX, titleY, { size: 14, face: 'bold', color: INK, align: 'center' });
  c.line(centreX - titleW / 2, titleY - 4, centreX + titleW / 2, titleY - 4, 0.9, INK);
  c.text(`No. ${doc.bastNumber}`, centreX, titleY - 18, {
    size: 9.5,
    color: MUTED,
    align: 'center',
  });

  // ---- opening sentence ----------------------------------------------------
  const sentence = `Pada hari ini, ${doc.longDate}, telah dilakukan serah terima aset IT sebagai berikut:`;
  const lines = wrap(sentence, 10, 'regular', CONTENT_W);
  let y = titleY - 48;
  for (const line of lines) {
    c.text(line, MARGIN, y, { size: 10, color: BODY });
    y -= 17;
  }

  // ---- bordered detail table ----------------------------------------------
  const rows: [string, string][] = [
    ['Asset Code', doc.assetCode],
    ['Nama Aset', doc.assetName],
    ['Penerima', doc.employeeName],
    ['Departemen', doc.departmentName],
    ['Lokasi', doc.locationName],
    ['Kondisi', doc.conditionText],
  ];

  const rowH = 24;
  const labelW = 132;
  const tableTop = y - 10;
  const tableBottom = tableTop - rows.length * rowH;

  rows.forEach(([label, value], i) => {
    const rowTop = tableTop - i * rowH;
    c.rect(MARGIN, rowTop - rowH, labelW, rowH, TABLE_LABEL_BG);
    c.text(label, MARGIN + 10, rowTop - rowH + 8.5, { size: 9.5, color: MUTED });
    c.text(value, MARGIN + labelW + 10, rowTop - rowH + 8.5, {
      size: 9.5,
      face: 'bold',
      color: INK,
    });
    if (i > 0) {
      c.line(MARGIN, rowTop, MARGIN + CONTENT_W, rowTop, 1, TABLE_BORDER);
    }
  });

  // Outer frame + the column divider.
  c.line(MARGIN, tableTop, MARGIN + CONTENT_W, tableTop, 1, TABLE_BORDER);
  c.line(MARGIN, tableBottom, MARGIN + CONTENT_W, tableBottom, 1, TABLE_BORDER);
  c.line(MARGIN, tableTop, MARGIN, tableBottom, 1, TABLE_BORDER);
  c.line(MARGIN + CONTENT_W, tableTop, MARGIN + CONTENT_W, tableBottom, 1, TABLE_BORDER);
  c.line(MARGIN + labelW, tableTop, MARGIN + labelW, tableBottom, 1, TABLE_BORDER);

  // ---- two signature blocks ------------------------------------------------
  const gap = 46;
  const colW = (CONTENT_W - gap) / 2;
  const handover = doc.signatures?.handover;
  const receiver = doc.signatures?.receiver;

  const blocks: [string, Signature | undefined, string, string, number][] = [
    [
      'Yang Menyerahkan',
      handover,
      handover?.signerName ?? doc.handedOverBy,
      handover?.signerTitle ?? doc.handedOverDept,
      MARGIN + colW / 2,
    ],
    [
      'Yang Menerima',
      receiver,
      receiver?.signerName ?? doc.employeeName,
      receiver?.signerTitle ?? doc.departmentName,
      MARGIN + colW + gap + colW / 2,
    ],
  ];

  const sigTop = tableBottom - 52;
  const lineY = sigTop - 62;

  for (const [caption, signature, name, dept, cx] of blocks) {
    c.text(caption, cx, sigTop, { size: 9.5, color: MUTED, align: 'center' });
    if (signature) drawSignature(c, signature, cx, lineY, colW - 40, 50);
    c.line(cx - colW / 2 + 14, lineY, cx + colW / 2 - 14, lineY, 1, SIGNATURE_LINE);
    c.text(name, cx, lineY - 14, { size: 9.5, face: 'bold', color: INK, align: 'center' });
    c.text(dept, cx, lineY - 26, { size: 8.5, color: MUTED, align: 'center' });

    // The timestamp is the part a wet signature cannot carry, and it is the
    // reason this counts as evidence rather than decoration.
    if (signature) {
      const when = new Date(signature.signedAt).toISOString().slice(0, 16).replace('T', ' ');
      c.text(`Ditandatangani secara elektronik · ${when} UTC`, cx, lineY - 38, {
        size: 6.5,
        color: MUTED,
        align: 'center',
      });
    }
  }

  return buildPdf(
    c,
    {
      Im1: { width: logoWidth, height: logoHeight, data: decode(logoBase64) },
      Im2: { width: aspireLogoWidth, height: aspireLogoHeight, data: decode(aspireLogoBase64) },
    },
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
