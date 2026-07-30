/**
 * generate-bast-pdf — IMPLEMENTATION_PLAN.md § Phase 5.
 *
 * "Renders the exact letterhead layout from the prototype's paper preview
 *  (CITE logo, navy rule, underlined BERITA ACARA SERAH TERIMA, Indonesian body
 *  sentence, bordered detail table, two signature blocks), stores
 *  bast/<id>/v1.pdf, inserts bast_versions."
 *
 * The function runs with the CALLER'S token, never the service role, so RLS
 * decides whether this user may see the BAST at all and the storage policies
 * decide whether the file may be written. The bast_versions row is inserted by
 * attach_generated_bast() (working rule #2), never from here.
 *
 * The page is A4. Every measurement below is the prototype's preview
 * measurement scaled to the sheet; the proportions are unchanged.
 */

import { Content, buildPdf, rgb, textWidth, wrap } from './pdf.ts';
import { logoBase64, logoHeight, logoWidth } from './logo.ts';

// The paper preview's own palette (README § BAST). These belong to the printed
// document, not the app UI, so they live here rather than in the theme tokens.
const NAVY = rgb('#00072D');
const INK = rgb('#0B1220');
const BODY = rgb('#2B3346');
const MUTED = rgb('#5A6478');
const TABLE_BORDER = rgb('#E6EAF2');
const TABLE_LABEL_BG = rgb('#F6F8FB');
const SIGNATURE_LINE = rgb('#C7CEDB');

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 62;
const CONTENT_W = PAGE_W - MARGIN * 2;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
}

function decodeLogo(): Uint8Array {
  const binary = atob(logoBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function render(doc: BastDocument): Uint8Array {
  const c = new Content();
  const top = PAGE_H - MARGIN;
  const centreX = PAGE_W / 2;

  // ---- letterhead: logo + wordmark over a 2px navy rule --------------------
  const logoW = 34;
  const logoH = (logoW * logoHeight) / logoWidth;
  c.image(MARGIN, top - logoH, logoW, logoH);

  const wordmarkX = MARGIN + logoW + 11;
  c.text('CORPORATE IT — CITE', wordmarkX, top - 12, { size: 11, face: 'bold', color: INK });
  c.text('IT ASSET MANAGEMENT', wordmarkX, top - 24, { size: 7.5, color: MUTED });

  const ruleY = top - logoH - 12;
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
  const blocks: [string, string, string, number][] = [
    ['Yang Menyerahkan', doc.handedOverBy, doc.handedOverDept, MARGIN + colW / 2],
    ['Yang Menerima', doc.employeeName, doc.departmentName, MARGIN + colW + gap + colW / 2],
  ];

  const sigTop = tableBottom - 52;
  for (const [caption, name, dept, x] of blocks) {
    c.text(caption, x, sigTop, { size: 9.5, color: MUTED, align: 'center' });
    c.line(x - colW / 2 + 14, sigTop - 62, x + colW / 2 - 14, sigTop - 62, 1, SIGNATURE_LINE);
    c.text(name, x, sigTop - 76, { size: 9.5, face: 'bold', color: INK, align: 'center' });
    c.text(dept, x, sigTop - 88, { size: 8.5, color: MUTED, align: 'center' });
  }

  return buildPdf(c, { width: logoWidth, height: logoHeight, data: decodeLogo() }, PAGE_W, PAGE_H);
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

    const { bastId } = (await request.json()) as { bastId?: string };
    if (!bastId) return json({ error: 'bastId is required' }, 400);

    const api = new Api(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      authorization,
    );

    // RLS decides this — an out-of-scope BAST comes back null, not forbidden.
    const doc = await api.rpc<BastDocument | null>('bast_detail', { p_id: bastId });
    if (!doc) return json({ error: 'BAST not found' }, 404);

    const bytes = render(doc);
    const path = `${bastId}/v1.pdf`;

    // Regenerating replaces the same object, which is why v1 stays v1 and the
    // append-only version history never has to be rewritten.
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
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500);
  }
});
