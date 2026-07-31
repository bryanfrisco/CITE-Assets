/**
 * Asset label API — the QR / barcode lifecycle.
 *
 * A label is a physical sticker that exists before the asset does. Everything
 * here goes through an RPC because the moment that matters — a blank sticker
 * becoming a registered asset — has to be one transaction (migration 0014).
 */

import { supabase } from '@/lib/supabase';
import type { CreateAssetInput } from '@/api/assets';

export type TagStatus = 'untagged' | 'tagged' | 'void';

/** Everything the scanner screen needs to decide what to show next. */
export interface ScanResult {
  found: boolean;
  code: string;
  status?: TagStatus;
  /** True when the label is on an asset this user is not allowed to see. */
  outOfScope?: boolean;
  assetId?: string;
  assetCode?: string;
  assetName?: string;
  statusName?: string;
  locationName?: string;
  holderName?: string | null;
}

export async function scanTag(code: string): Promise<ScanResult> {
  const { data, error } = await supabase.rpc('scan_tag', { p_code: code });
  if (error) throw new Error(error.message);
  return data as ScanResult;
}

export interface TagRow {
  id: string;
  code: string;
  status: TagStatus;
  batch_id: string | null;
  asset_code: string | null;
  asset_name: string | null;
  tagged_at: string | null;
  created_at: string;
}

export async function listTags(status?: TagStatus, batchId?: string): Promise<TagRow[]> {
  const { data, error } = await supabase.rpc('list_tags', {
    p_status: status ?? null,
    p_batch: batchId ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as TagRow[];
}

export interface TagStock {
  untagged: number;
  tagged: number;
  void: number;
  total: number;
}

export async function fetchTagStock(): Promise<TagStock> {
  const { data, error } = await supabase.rpc('tag_stock');
  if (error) throw new Error(error.message);
  return (data ?? { untagged: 0, tagged: 0, void: 0, total: 0 }) as TagStock;
}

/** A print run. The codes come back so labels can be generated for them. */
export async function createTagBatch(
  count: number,
  prefix = 'CT',
): Promise<{ batchId: string; codes: string[] }> {
  const { data, error } = await supabase.rpc('create_tag_batch', {
    p_count: count,
    p_prefix: prefix,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { batch_id: string; code: string }[];
  return { batchId: rows[0]?.batch_id ?? '', codes: rows.map((r) => r.code) };
}

/**
 * The sticker goes on a device. Creates the asset and claims the label in one
 * transaction, so a label can never end up on a device with no record behind it.
 */
export async function tagAsset(
  code: string,
  input: CreateAssetInput,
): Promise<{ id: string; assetCode: string; name: string; tagCode: string }> {
  const { data, error } = await supabase.rpc('tag_asset', {
    p_code: code,
    p_name: input.name,
    p_category: input.categoryId,
    p_serial: input.serialNumber,
    p_location: input.locationId,
    p_status: input.statusId,
    p_condition: input.conditionId,
    p_brand: input.brandId ?? null,
    p_model: input.modelId ?? null,
    p_vendor: input.vendorId ?? null,
    p_department: input.departmentId ?? null,
    p_purchase_date: input.purchaseDate ?? null,
    p_purchase_price: input.purchasePrice ?? null,
    p_warranty_start: input.warrantyStart ?? null,
    p_warranty_end: input.warrantyEnd ?? null,
    p_specifications: input.specifications ?? [],
    p_notes: input.notes ?? null,
    p_asset_code: input.assetCode ?? null,
  });
  if (error) throw new Error(error.message);
  return data as { id: string; assetCode: string; name: string; tagCode: string };
}

export async function voidTag(code: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('void_tag', { p_code: code, p_reason: reason });
  if (error) throw new Error(error.message);
}
