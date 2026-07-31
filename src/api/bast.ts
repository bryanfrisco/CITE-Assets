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

export interface BastListRow {
  id: string;
  bast_number: string;
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

/** Who signs which block on the document. */
export type SignatureRole = 'handover' | 'receiver';

export const SIGNATURE_ROLE_LABEL: Record<SignatureRole, string> = {
  handover: 'Yang Menyerahkan',
  receiver: 'Yang Menerima',
};

export interface BastSignature {
  signerName: string;
  signerTitle: string | null;
  strokes: SignatureStrokes;
  signedAt: string;
  recordedByName: string;
}

export interface BastDetail {
  id: string;
  bastNumber: string;
  status: BastStatus;
  bastDate: string;
  /** "Jumat, 24 Juli 2026" — rendered in SQL so the PDF cannot disagree. */
  longDate: string;
  currentVersion: number;
  description: string | null;
  assetId: string;
  assetCode: string;
  assetName: string;
  employeeName: string;
  departmentName: string;
  locationName: string;
  conditionText: string;
  handedOverBy: string;
  handedOverDept: string;
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

export async function fetchBastList(scope: string[]): Promise<BastListRow[]> {
  const { data, error } = await supabase.rpc('bast_list', { p_locations: scope });
  if (error) throw new Error(error.message);
  return (data ?? []) as BastListRow[];
}

export async function fetchBastStats(scope: string[]): Promise<BastStats> {
  const { data, error } = await supabase.rpc('bast_stats', { p_locations: scope });
  if (error) throw new Error(error.message);
  return (data ?? { total: 0, signed: 0, awaiting: 0, draft: 0 }) as BastStats;
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
