/**
 * Documents — the per-asset library (Phase 6).
 *
 * Two steps, like the photo upload: the bytes go to Storage under
 * `<asset_id>/…` so the bucket policies can check scope, then add_document()
 * records the row. The path is checked against the asset on both sides, so a
 * document cannot be filed against an asset its file does not belong to.
 */

import { supabase } from '@/lib/supabase';

export type DocumentKind =
  'invoice' | 'purchase_order' | 'warranty_card' | 'manual' | 'photo' | 'signed_bast' | 'other';

/** README § Documents tab — the seven kinds, in the order they are offered. */
export const DOCUMENT_KINDS: { id: Exclude<DocumentKind, 'signed_bast'>; name: string }[] = [
  { id: 'invoice', name: 'Invoice' },
  { id: 'purchase_order', name: 'Purchase order' },
  { id: 'warranty_card', name: 'Warranty card' },
  { id: 'manual', name: 'Manual' },
  { id: 'photo', name: 'Photo' },
  { id: 'other', name: 'Other' },
];

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  invoice: 'Invoice',
  purchase_order: 'Purchase order',
  warranty_card: 'Warranty card',
  manual: 'Manual',
  photo: 'Photo',
  signed_bast: 'Signed E-BAST',
  other: 'Other',
};

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

/** Short-lived signed URL — the bucket is private. */
export async function signedDocumentUrl(path: string, seconds = 600): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('asset-documents')
    .createSignedUrl(path, seconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/**
 * Uploads with real progress, the same way the signed E-BAST scan does:
 * supabase-js's storage client reports none, and a fake progress bar on a
 * 20 MB manual over site Wi-Fi is worse than no bar at all.
 */
export function uploadDocumentFile(
  assetId: string,
  file: Blob,
  fileName: string,
  onProgress: (percent: number) => void,
): Promise<{ path: string; size: number; mimeType: string }> {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? 'pdf';
  // A uuid rather than the file name: two people uploading "invoice.pdf" for
  // the same asset must not overwrite one another.
  const path = `${assetId}/${globalThis.crypto.randomUUID()}.${extension}`;
  const contentType = file.type || 'application/octet-stream';

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
      request.open('POST', `${base}/storage/v1/object/asset-documents/${path}`);
      request.setRequestHeader('Authorization', `Bearer ${token}`);
      request.setRequestHeader('apikey', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '');
      request.setRequestHeader('Content-Type', contentType);

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

export async function addDocument(
  assetId: string,
  kind: DocumentKind,
  title: string,
  path: string,
  size: number,
  mimeType: string,
): Promise<{ id: string }> {
  const { data, error } = await supabase.rpc('add_document', {
    p_asset: assetId,
    p_kind: kind,
    p_title: title,
    p_path: path,
    p_size: size,
    p_mime: mimeType,
  });
  if (error) throw new Error(error.message);
  return data as { id: string };
}

/**
 * Removes the row, then the object. A signed E-BAST is refused by the database
 * — it is the record of a handover, not a file someone filed.
 */
export async function deleteDocument(id: string): Promise<void> {
  const { data, error } = await supabase.rpc('delete_document', { p_id: id });
  if (error) throw new Error(error.message);

  const { filePath } = data as { filePath: string };
  // Best effort: if the object removal fails the listing is already correct,
  // and an orphaned object is a storage bill, not a wrong answer.
  await supabase.storage.from('asset-documents').remove([filePath]);
}
