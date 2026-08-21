/**
 * Master data API — README § Master data, IMPLEMENTATION_PLAN.md § Phase 2.
 *
 * Working rule #2: every write goes through an RPC. Validation copy, the
 * duplicate check and the 23503 delete guard all live in migration 0007, so
 * this file only translates and never re-implements them.
 */

import { supabase } from '@/lib/supabase';

export type MasterEntity =
  | 'category'
  | 'brand'
  | 'model'
  | 'vendor'
  | 'department'
  | 'location'
  | 'status'
  | 'condition'
  | 'unit'
  | 'company';

export interface MasterEntityMeta {
  key: MasterEntity;
  /** Chip label and the word used in validation copy: "… already exists in Brand". */
  label: string;
}

/**
 * README § Master data — the eight entity chips, in the order the design lists them,
 * followed by the two the README does not cover.
 *
 * `unit` is a vehicle a fitted asset lives in (DT-042); `company` is the legal
 * entity a person belongs to. Both are appended rather than slotted in, so the
 * chip order the design specifies is still the order people see first.
 */
export const MASTER_ENTITIES: MasterEntityMeta[] = [
  { key: 'category', label: 'Category' },
  { key: 'brand', label: 'Brand' },
  { key: 'model', label: 'Model' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'department', label: 'Department' },
  { key: 'location', label: 'Location' },
  { key: 'status', label: 'Status' },
  { key: 'condition', label: 'Condition' },
  { key: 'unit', label: 'Unit' },
  { key: 'company', label: 'Company' },
];

export function labelFor(entity: MasterEntity): string {
  return MASTER_ENTITIES.find((e) => e.key === entity)?.label ?? 'Record';
}

export interface MasterRecord {
  id: string;
  name: string;
  isActive: boolean;
  /** Secondary text: the brand for a model, the city for a location, the code for a category. */
  detail: string | null;
  assetCount: number;
  totalCount: number;
  brandId?: string;
  code?: string;
  kind?: string;
  color?: string;
  locationId?: string;
}

/** Extra columns the schema requires that README's single name field does not cover. */
export interface MasterExtra {
  code?: string;
  kind?: 'head_office' | 'site';
  city?: string;
  icon?: string;
  brandId?: string;
  categoryId?: string;
  color?: string;
  locationId?: string;
}

export async function listMaster(entity: MasterEntity): Promise<MasterRecord[]> {
  const { data, error } = await supabase.rpc('master_list', { p_entity: entity });
  if (error) throw new Error(error.message);
  return (data ?? []) as MasterRecord[];
}

export async function createMaster(
  entity: MasterEntity,
  name: string,
  extra: MasterExtra = {},
): Promise<{ id: string; name: string }> {
  const { data, error } = await supabase.rpc('master_create', {
    p_entity: entity,
    p_name: name,
    p_extra: extra,
  });
  if (error) throw new Error(error.message);
  return data as { id: string; name: string };
}

export async function renameMaster(entity: MasterEntity, id: string, name: string): Promise<void> {
  const { error } = await supabase.rpc('master_rename', {
    p_entity: entity,
    p_id: id,
    p_name: name,
  });
  if (error) throw new Error(error.message);
}

/** Soft delete / restore via is_active — the default the README asks for. */
export async function setMasterActive(
  entity: MasterEntity,
  id: string,
  isActive: boolean,
): Promise<void> {
  const { error } = await supabase.rpc('master_set_active', {
    p_entity: entity,
    p_id: id,
    p_active: isActive,
  });
  if (error) throw new Error(error.message);
}

/**
 * Hard delete — Super Admin only, and blocked by the database when the record
 * is referenced. The RPC already returns
 * "Cannot delete <name> — still used by n assets".
 */
export async function deleteMaster(entity: MasterEntity, id: string): Promise<void> {
  const { error } = await supabase.rpc('master_delete', { p_entity: entity, p_id: id });
  if (error) throw new Error(error.message);
}

/**
 * What actually references a master data record.
 *
 * The list has always said "used by 12 assets". Twelve answers a question
 * nobody asks; "which twelve" is the one people have, and before deactivating
 * or renaming something it is the only one that matters.
 *
 * Assets and accessories come back filtered by RLS, so a scoped user sees the
 * ones they are allowed to see rather than a count they cannot reconcile.
 */
export interface UsageAsset {
  id: string;
  assetCode: string;
  name: string;
  categoryName: string;
  statusName: string;
  locationName: string;
  holderName: string | null;
  unitCode: string | null;
}

export interface UsageAccessory {
  id: string;
  name: string;
  locationName: string;
  totalQty: number;
  availableQty: number;
}

export interface UsagePerson {
  id: string;
  fullName: string;
  nik: string | null;
  jobTitle: string | null;
  departmentName: string | null;
  locationName: string | null;
  canLogin: boolean;
  isActive: boolean;
}

export interface MasterUsage {
  entity: MasterEntity;
  assets: UsageAsset[];
  accessories: UsageAccessory[];
  people: UsagePerson[];
}

export async function fetchMasterUsage(entity: MasterEntity, id: string): Promise<MasterUsage> {
  const { data, error } = await supabase.rpc('master_usage_list', {
    p_entity: entity,
    p_id: id,
  });
  if (error) throw new Error(error.message);
  return data as MasterUsage;
}
