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
  /** Which stock the sticker came from. Null for labels printed before 0033. */
  location_id: string | null;
  location_name: string | null;
}

export async function listTags(
  status?: TagStatus,
  scope?: string[],
  batchId?: string,
): Promise<TagRow[]> {
  const { data, error } = await supabase.rpc('list_tags', {
    p_status: status ?? null,
    p_batch: batchId ?? null,
    p_locations: scope && scope.length > 0 ? scope : null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as TagRow[];
}

/**
 * Which prefix each location in scope prints, and how much blank stock it has.
 *
 * The prefix is a property of the location (migration 0033), not something the
 * printing screen chooses — so this is a read, never a setting.
 */
export interface TagPrefix {
  location_id: string;
  location_name: string;
  prefix: string;
  blank: number;
}

export async function fetchTagPrefixes(scope: string[]): Promise<TagPrefix[]> {
  const { data, error } = await supabase.rpc('tag_prefixes', { p_locations: scope });
  if (error) throw new Error(error.message);
  return (data ?? []) as TagPrefix[];
}

export interface TagStock {
  untagged: number;
  tagged: number;
  void: number;
  total: number;
}

export async function fetchTagStock(scope?: string[]): Promise<TagStock> {
  const { data, error } = await supabase.rpc('tag_stock', {
    p_locations: scope && scope.length > 0 ? scope : null,
  });
  if (error) throw new Error(error.message);
  return (data ?? { untagged: 0, tagged: 0, void: 0, total: 0 }) as TagStock;
}

/**
 * A print run, for one location.
 *
 * There is deliberately no `prefix` argument. `CTH` and `CTS` are properties of
 * Head Office and Site, so asking for a location is the only way to ask for a
 * prefix — a prefix typed at print time would be a claim nothing downstream
 * could check, and one typo would produce a hundred stickers that say Site and
 * are not.
 */
export async function createTagBatch(
  count: number,
  locationId: string,
): Promise<{ batchId: string; codes: string[]; locationName: string; prefix: string }> {
  const { data, error } = await supabase.rpc('create_tag_batch', {
    p_count: count,
    p_location: locationId,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as {
    batch_id: string;
    code: string;
    location_name: string;
    prefix: string;
  }[];
  return {
    batchId: rows[0]?.batch_id ?? '',
    codes: rows.map((r) => r.code),
    locationName: rows[0]?.location_name ?? '',
    prefix: rows[0]?.prefix ?? '',
  };
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
    p_code_seq: input.codeSeq ?? null,
  });
  if (error) throw new Error(error.message);
  return data as { id: string; assetCode: string; name: string; tagCode: string };
}

export async function voidTag(code: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('void_tag', { p_code: code, p_reason: reason });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// One label, in detail
// ---------------------------------------------------------------------------

/**
 * The two identities a label carries, kept apart on purpose.
 *
 * `code` is the STICKER — CT-000001, printed once, physically on a device.
 * `asset.assetCode` is the ASSET — SPRLAP24-HO-006, the register's own name for
 * the thing. Attaching one to the other renames neither, which is exactly what
 * makes a mislabelled asset recoverable: void the sticker, attach another, and
 * the asset's code never moved.
 */
export interface TagDetail {
  code: string;
  status: TagStatus;
  batchId: string | null;
  /** The location this sticker was printed for — 'Head Office' / 'Site'. */
  stockLocation: string | null;
  printedAt: string | null;
  createdAt: string;
  taggedAt: string | null;
  taggedByName: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  voidedByName: string | null;
  asset: {
    id: string;
    assetCode: string;
    name: string;
    serialNumber: string;
    statusName: string;
    conditionName: string;
    locationName: string;
    holderName: string | null;
  } | null;
}

export async function fetchTagDetail(code: string): Promise<TagDetail | null> {
  const { data, error } = await supabase.rpc('tag_detail', { p_code: code });
  if (error) throw new Error(error.message);
  return (data ?? null) as TagDetail | null;
}

/**
 * Puts a printed sticker on an asset that already exists.
 *
 * The other direction — scanning a blank sticker to create an asset — has been
 * there since the tag lifecycle went in. This is the case an asset added
 * through the form falls into: it has no label, and until now nothing could
 * give it one.
 */
export async function attachTag(
  code: string,
  assetId: string,
): Promise<{ alreadyAttached: boolean }> {
  const { data, error } = await supabase.rpc('attach_tag', { p_code: code, p_asset: assetId });
  if (error) throw new Error(error.message);
  return data as { alreadyAttached: boolean };
}

/** The label currently on an asset, or null if it has none. */
export async function fetchAssetTagCode(assetId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('asset_tag_code', { p_asset: assetId });
  if (error) throw new Error(error.message);
  return (data ?? null) as string | null;
}
