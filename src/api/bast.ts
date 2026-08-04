/**
 * BAST API — Phase 5.
 *
 * Numbering never happens here. `bast.bast_number` defaults to
 * next_bast_number() in the database, so there is deliberately no client-side
 * function that could produce one.
 */

import { supabase } from '@/lib/supabase';
import type { SignatureStrokes } from '@/lib/signature';

export type BastStatus = 'draft' | 'awaiting_signature' | 'signed' | 'void';

/**
 * The two sheets the client actually uses.
 *
 * `handover` is the Berita Acara Serah Terima Barang — a device going out.
 * `return` is the Berita Acara Penarikan Barang — the same device coming back.
 * One record type, one numbering sequence, one signing flow; the kind decides
 * the title, two verbs in the body, and the two signature captions.
 */
export type BastKind = 'handover' | 'return';

export const BAST_KIND_TITLE: Record<BastKind, string> = {
  handover: 'BERITA ACARA SERAH TERIMA BARANG',
  return: 'BERITA ACARA PENARIKAN BARANG',
};

/** Short form, for list rows and the detail header. */
export const BAST_KIND_LABEL: Record<BastKind, string> = {
  handover: 'Serah Terima',
  return: 'Penarikan',
};

export interface BastListRow {
  id: string;
  bast_number: string;
  kind: BastKind;
  status: BastStatus;
  bast_date: string;
  asset_code: string;
  asset_name: string;
  employee_name: string;
  department_name: string | null;
  location_name: string;
  current_version: number;
}

export interface BastStats {
  total: number;
  signed: number;
  awaiting: number;
  draft: number;
  handover: number;
  returns: number;
}

export interface BastVersion {
  id: string;
  version: number;
  kind: 'generated' | 'signed';
  filePath: string;
  fileSize: number | null;
  mimeType: string | null;
  note: string | null;
  uploadedByName: string;
  uploadedByDept: string;
  createdAt: string;
}

/**
 * Who signs which block on the document.
 *
 * These are POSITIONS, not captions: `handover` is always the CITE/IT side and
 * always the left column, `receiver` is always the employee and always the
 * right. Both scanned documents are laid out that way — on a withdrawal the IT
 * officer signs on the left under "Yang Menerima". The caption is derived from
 * the kind, which is why it is a function rather than a lookup.
 */
export type SignatureRole = 'handover' | 'receiver';

export function signatureCaption(kind: BastKind, role: SignatureRole): string {
  if (kind === 'return') return role === 'handover' ? 'Yang Menerima' : 'Yang Memberikan';
  return role === 'handover' ? 'Yang Menyerahkan' : 'Yang Menerima';
}

/** The side each block belongs to, for copy that has to name it plainly. */
export const SIGNATURE_ROLE_SIDE: Record<SignatureRole, string> = {
  handover: 'Corporate IT',
  receiver: 'Employee',
};

export interface BastSignature {
  signerName: string;
  signerTitle: string | null;
  strokes: SignatureStrokes;
  signedAt: string;
  recordedByName: string;
}

/**
 * One line of the goods table: No | Jenis/Type | Serial Number | Kondisi.
 *
 * A BAST still covers exactly one asset — that is what RLS resolves through.
 * These rows are what physically changed hands, which on the client's own
 * paperwork is the laptop AND the charger AND the mouse. The charger has no
 * serial and nobody wants it in the register, so it lives on the document only.
 */
export interface BastItem {
  jenis: string;
  serial: string;
  kondisi: string;
}

export interface BastDetail {
  id: string;
  bastNumber: string;
  kind: BastKind;
  status: BastStatus;
  bastDate: string;
  /** "Jumat, 24 Juli 2026" — rendered in SQL so the PDF cannot disagree. */
  longDate: string;
  /** "Senin tanggal Dua puluh lima Bulan Mei Tahun Dua ribu dua puluh enam". */
  dateWords: string;
  /** "Jakarta, 25 Mei 2026" — the place line above the signatures. */
  placeDate: string;
  currentVersion: number;
  description: string | null;
  assetId: string;
  assetCode: string;
  assetName: string;
  employeeName: string;
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
  /** Only the newest signature per role; earlier attempts stay in the table. */
  signatures: Partial<Record<SignatureRole, BastSignature>>;
  versions: BastVersion[];
}

/** README § BAST list: the status badge label. */
export const BAST_STATUS_LABEL: Record<BastStatus, string> = {
  draft: 'Draft',
  awaiting_signature: 'Awaiting signature',
  signed: 'Signed',
  void: 'Void',
};

export async function fetchBastList(scope: string[], kind?: BastKind): Promise<BastListRow[]> {
  const { data, error } = await supabase.rpc('bast_list', {
    p_locations: scope,
    p_kind: kind ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as BastListRow[];
}

export async function fetchBastStats(scope: string[]): Promise<BastStats> {
  const { data, error } = await supabase.rpc('bast_stats', { p_locations: scope });
  if (error) throw new Error(error.message);
  return (data ?? {
    total: 0,
    signed: 0,
    awaiting: 0,
    draft: 0,
    handover: 0,
    returns: 0,
  }) as BastStats;
}

/**
 * Replaces the whole goods table in one call.
 *
 * Replace, not add-then-remove: the screen edits the table as a table, and four
 * calls where one failed would leave a line on a document nobody put there.
 * Refused once the BAST is signed — at that point its contents are evidence.
 */
export async function setBastItems(bastId: string, items: BastItem[]): Promise<{ items: number }> {
  const { data, error } = await supabase.rpc('set_bast_items', {
    p_bast: bastId,
    p_items: items.map((item) => ({
      jenis: item.jenis,
      serial: item.serial,
      kondisi: item.kondisi,
    })),
  });
  if (error) throw new Error(error.message);
  return data as { items: number };
}

/** Returns null when the record is missing OR RLS hides it — the same answer. */
export async function fetchBastDetail(id: string): Promise<BastDetail | null> {
  const { data, error } = await supabase.rpc('bast_detail', { p_id: id });
  if (error) throw new Error(error.message);
  return (data ?? null) as BastDetail | null;
}

export interface GeneratedBast {
  bastId: string;
  bastNumber: string;
  filePath: string;
  fileSize: number;
  signed: boolean;
}

/**
 * Calls the generate-bast-pdf Edge Function. It runs under the caller's token.
 *
 * `finalize` is the difference between a draft and the finished document:
 * without it the function writes `bast/<id>/v1.pdf` and records it through
 * attach_generated_bast(); with it — and only once both signatures exist — it
 * writes a new version and records it through attach_signed_bast(), which is
 * what sets the status to Signed.
 */
export async function generateBastPdf(bastId: string, finalize = false): Promise<GeneratedBast> {
  const { data, error } = await supabase.functions.invoke('generate-bast-pdf', {
    body: { bastId, finalize },
  });
  if (error) {
    // The function returns its own message in the body; surface that when present.
    const detail = (data as { error?: string } | null)?.error;
    throw new Error(detail ?? error.message);
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as GeneratedBast;
}

/** Short-lived signed URL — the bucket is private (DATABASE.md §12). */
export async function signedBastUrl(path: string, seconds = 600): Promise<string | null> {
  const { data, error } = await supabase.storage.from('bast').createSignedUrl(path, seconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export const MAX_SIGNED_BAST_BYTES = 10 * 1024 * 1024; // DATABASE.md §12

/**
 * Uploads the signed scan with REAL progress.
 *
 * README § Signed BAST card asks for `Uploading · n%` driven by the transfer,
 * not a timer. supabase-js's storage client gives no progress events, so this
 * talks to the Storage REST endpoint through XMLHttpRequest, which does.
 */
export function uploadSignedScan(
  bastId: string,
  version: number,
  file: Blob,
  fileName: string,
  onProgress: (percent: number) => void,
): Promise<{ path: string; size: number; mimeType: string }> {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? 'pdf';
  const path = `${bastId}/v${version}.${extension}`;
  const contentType = file.type || (extension === 'pdf' ? 'application/pdf' : 'image/jpeg');

  return new Promise((resolve, reject) => {
    void (async () => {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) {
        reject(new Error('Not signed in'));
        return;
      }

      const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const request = new XMLHttpRequest();
      request.open('POST', `${base}/storage/v1/object/bast/${path}`);
      request.setRequestHeader('Authorization', `Bearer ${token}`);
      request.setRequestHeader('apikey', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '');
      request.setRequestHeader('Content-Type', contentType);
      // Regenerating or re-uploading the same version replaces the object.
      request.setRequestHeader('x-upsert', 'true');

      request.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
        }
      };
      request.onload = () => {
        if (request.status >= 200 && request.status < 300) {
          onProgress(100);
          resolve({ path, size: file.size, mimeType: contentType });
        } else {
          let message = `Upload failed (${request.status})`;
          try {
            message = (JSON.parse(request.responseText) as { message?: string }).message ?? message;
          } catch {
            // Non-JSON error body — keep the status message.
          }
          reject(new Error(message));
        }
      };
      request.onerror = () => reject(new Error('Upload failed'));
      request.send(file);
    })();
  });
}

/**
 * Records the uploaded scan: bast_versions row, `current_version` bump, status
 * → signed, and the mirrored `documents` row — one transaction, one RPC
 * (DATABASE.md §7).
 */
export async function attachSignedBast(
  bastId: string,
  path: string,
  size: number,
  mimeType: string,
): Promise<{ version: number }> {
  const { data, error } = await supabase.rpc('attach_signed_bast', {
    p_bast: bastId,
    p_path: path,
    p_size: size,
    p_mime: mimeType,
  });
  if (error) throw new Error(error.message);
  return data as { version: number };
}

// ---------------------------------------------------------------------------
// E-BAST — signing on the screen
// ---------------------------------------------------------------------------

export interface Signatory {
  id: string;
  full_name: string;
  title: string | null;
  department_name: string | null;
}

/** The "Yang Menyerahkan" picker — Corporate IT staff who hand devices over. */
export async function fetchSignatories(): Promise<Signatory[]> {
  const { data, error } = await supabase.rpc('bast_signatories_list');
  if (error) throw new Error(error.message);
  return (data ?? []) as Signatory[];
}

/** Adding someone already on the list reactivates them rather than failing. */
export async function addSignatory(
  name: string,
  title?: string | null,
  departmentId?: string | null,
): Promise<{ id: string; created: boolean }> {
  const { data, error } = await supabase.rpc('add_bast_signatory', {
    p_name: name,
    p_title: title ?? null,
    p_department: departmentId ?? null,
  });
  if (error) throw new Error(error.message);
  return data as { id: string; created: boolean };
}

/**
 * Records one signature.
 *
 * This does not set the status to Signed — `complete` says whether both blocks
 * are now filled, and the caller then finalises the PDF. Splitting it that way
 * means a failure at the PDF step never loses a signature that has already been
 * given.
 */
export async function signBast(
  bastId: string,
  role: SignatureRole,
  signerName: string,
  signerTitle: string | null,
  strokes: SignatureStrokes,
): Promise<{ complete: boolean }> {
  const { data, error } = await supabase.rpc('sign_bast', {
    p_bast: bastId,
    p_role: role,
    p_name: signerName,
    p_title: signerTitle,
    p_strokes: strokes,
  });
  if (error) throw new Error(error.message);
  return data as { complete: boolean };
}
