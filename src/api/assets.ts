/**
 * Assets API.
 *
 * Phase 2 needs only the pieces that prove master data is live: the form
 * pickers and the create path. Phase 3 adds search_assets(), the register list
 * and the full Asset Detail.
 */

import { supabase } from '@/lib/supabase';

export interface Option {
  id: string;
  name: string;
  code?: string;
  brandId?: string;
}

export interface AssetFormOptions {
  categories: Option[];
  brands: Option[];
  models: Option[];
  vendors: Option[];
  departments: Option[];
  locations: Option[];
  statuses: Option[];
  conditions: Option[];
}

/**
 * Only ACTIVE master data comes back, which is what gives soft delete its
 * meaning: deactivating a category hides it from new assets while every
 * existing asset keeps its reference.
 */
export async function fetchAssetFormOptions(): Promise<AssetFormOptions> {
  const { data, error } = await supabase.rpc('asset_form_options');
  if (error) throw new Error(error.message);
  return data as AssetFormOptions;
}

/** One row of the register list — the joined projection search_assets returns. */
export interface AssetListRow {
  id: string;
  asset_code: string;
  name: string;
  serial_number: string;
  category_name: string;
  category_icon: string | null;
  brand_name: string | null;
  model_name: string | null;
  status_name: string;
  condition_name: string;
  location_name: string;
  holder_name: string | null;
  department_name: string | null;
  warranty_end: string | null;
}

/** The sort orders offered on the register. */
export type AssetSort = 'code' | 'name' | 'newest' | 'oldest' | 'status' | 'location' | 'warranty';

export const ASSET_SORTS: { key: AssetSort; label: string }[] = [
  { key: 'code', label: 'Asset code' },
  { key: 'name', label: 'Name' },
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'status', label: 'Status' },
  { key: 'location', label: 'Location' },
  { key: 'warranty', label: 'Warranty ending' },
];

export interface AssetSearch {
  query?: string;
  statusId?: string | null;
  categoryId?: string | null;
  sort?: AssetSort;
}

/**
 * README § Assets. `scope` is the user's chosen locations; RLS narrows it
 * further for Site IT and Viewer, so the two are not interchangeable.
 *
 * Category narrows BEFORE the text search rather than filtering its results —
 * pick Laptop, then type a name, and the name is only looked for among laptops.
 * That is what the client asked for ("seperti odoo") and it is also the cheaper
 * query: the category is an indexed equality, the text is seven ILIKEs.
 *
 * The sort is a keyword, not a column name. It reaches a whitelist in SQL; any
 * other value falls through to asset code.
 */
export async function searchAssets(
  scope: string[],
  search: AssetSearch = {},
): Promise<AssetListRow[]> {
  const { data, error } = await supabase.rpc('search_assets', {
    p_locations: scope,
    p_query: search.query ?? null,
    p_status: search.statusId ?? null,
    p_category: search.categoryId ?? null,
    p_sort: search.sort ?? 'code',
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as AssetListRow[];
}

/**
 * Deletes an asset outright — Super Admin only, and refused for anything with
 * history behind it. See migration 0026: the point of the refusal is that an
 * assignment or an E-BAST stops making sense once the asset row is gone.
 */
export async function deleteAsset(assetId: string, reason: string): Promise<{ assetCode: string }> {
  const { data, error } = await supabase.rpc('delete_asset', {
    p_asset: assetId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  return data as { assetCode: string };
}

/** Feeds the "4 of 7 in scope · HO + Site" line. */
export async function countAssetsInScope(scope: string[]): Promise<number> {
  const { data, error } = await supabase.rpc('count_assets_in_scope', { p_locations: scope });
  if (error) throw new Error(error.message);
  return (data ?? 0) as number;
}

export interface Spec {
  key: string;
  value: string;
}

export interface AssetDetailAsset {
  id: string;
  assetCode: string;
  name: string;
  serialNumber: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string | null;
  brandId: string | null;
  brandName: string | null;
  modelId: string | null;
  modelName: string | null;
  vendorId: string | null;
  vendorName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  locationId: string;
  locationName: string;
  statusId: string;
  statusName: string;
  conditionId: string;
  conditionName: string;
  assignedToId: string | null;
  assignedToName: string | null;
  purchaseDate: string | null;
  purchasePrice: string | number | null;
  warrantyStart: string | null;
  warrantyEnd: string | null;
  specifications: Spec[];
  notes: string | null;
  photoPath: string | null;
  createdAt: string;
}

/** README § Asset Detail — the dot colour is resolved from `kind`. */
export type TimelineKind =
  | 'purchased'
  | 'registered'
  | 'assigned'
  | 'moved'
  | 'maintenance'
  | 'returned'
  | 'reassigned'
  | 'retired';

export interface TimelineEvent {
  kind: TimelineKind;
  title: string;
  at: string;
  detail: string;
  tag: string | null;
}

export interface AssignmentRow {
  id: string;
  accountName: string;
  departmentName: string | null;
  assignedDate: string;
  returnedDate: string | null;
  state: 'active' | 'returned';
  bastNumber: string | null;
}

export interface MaintenanceRow {
  id: string;
  title: string;
  detail: string | null;
  state: 'open' | 'in_progress' | 'completed' | 'cancelled';
  vendorName: string | null;
  cost: string | number | null;
  startedAt: string;
  completedAt: string | null;
  underWarranty: boolean;
}

export interface DocumentRow {
  id: string;
  kind: string;
  title: string;
  filePath: string;
  fileSize: number | null;
  mimeType: string | null;
  createdAt: string;
}

export interface BastRow {
  id: string;
  bastNumber: string;
  status: string;
  bastDate: string;
}

export interface AssetDetail {
  asset: AssetDetailAsset;
  timeline: TimelineEvent[];
  assignments: AssignmentRow[];
  maintenance: MaintenanceRow[];
  documents: DocumentRow[];
  bast: BastRow[];
}

/** Returns null when the asset does not exist OR RLS hides it — same answer. */
export async function fetchAssetDetail(assetCode: string): Promise<AssetDetail | null> {
  const { data, error } = await supabase.rpc('asset_detail', { p_code: assetCode });
  if (error) throw new Error(error.message);
  return (data ?? null) as AssetDetail | null;
}

export interface CreateAssetInput {
  name: string;
  categoryId: string;
  serialNumber: string;
  locationId: string;
  statusId: string;
  conditionId: string;
  brandId?: string | null;
  modelId?: string | null;
  vendorId?: string | null;
  departmentId?: string | null;
  purchaseDate?: string | null;
  purchasePrice?: number | null;
  warrantyStart?: string | null;
  warrantyEnd?: string | null;
  specifications?: { key: string; value: string }[];
  notes?: string | null;
  /** Super Admin only; omitted means next_asset_code() generates it. */
  assetCode?: string | null;
}

export async function createAsset(
  input: CreateAssetInput,
): Promise<{ id: string; assetCode: string; name: string }> {
  const { data, error } = await supabase.rpc('create_asset', {
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
  return data as { id: string; assetCode: string; name: string };
}

export async function updateAsset(
  id: string,
  input: CreateAssetInput,
): Promise<{ id: string; assetCode: string }> {
  const { data, error } = await supabase.rpc('update_asset', {
    p_id: id,
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
  return data as { id: string; assetCode: string };
}

/**
 * Change an asset's status, with the reason attached.
 *
 * The reason is required by the database, not by this function — it is the one
 * thing the generic audit trail cannot record, and the reason a retirement is
 * readable six months later rather than just a row diff.
 *
 * Assigning is deliberately not reachable from here: `Assigned` is what
 * assigning an asset to someone produces, not a label anyone declares.
 */
export async function changeAssetStatus(
  assetId: string,
  statusId: string,
  reason: string,
  conditionId?: string | null,
): Promise<{ status: string; terminal: boolean }> {
  const { data, error } = await supabase.rpc('change_asset_status', {
    p_asset: assetId,
    p_status: statusId,
    p_condition: conditionId ?? null,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  return data as { status: string; terminal: boolean };
}

/**
 * Photo upload — README § Asset Detail replaces the dashed placeholder with
 * "the real image, camera and gallery upload".
 *
 * Two steps on purpose: the bytes go to Storage under `<asset_id>/…` so the
 * bucket policies can check scope, then set_asset_photo() records the path so
 * the change flows through the normal asset audit trail (working rule #2).
 */
export async function uploadAssetPhoto(
  assetId: string,
  file: ArrayBuffer,
  contentType: string,
): Promise<string> {
  const extension = contentType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  const path = `${assetId}/${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from('asset-photos')
    .upload(path, file, { contentType, upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  const { error } = await supabase.rpc('set_asset_photo', {
    p_asset: assetId,
    p_path: path,
  });
  if (error) throw new Error(error.message);
  return path;
}

/** Private bucket, so the app always renders through a short-lived signed URL. */
export async function signedPhotoUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('asset-photos')
    .createSignedUrl(path, 60 * 10);
  if (error) return null;
  return data?.signedUrl ?? null;
}
