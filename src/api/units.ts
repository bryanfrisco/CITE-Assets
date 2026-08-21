/**
 * Units — the vehicles a fitted asset lives in.
 *
 * A unit is a PLACE, not a person. Nothing here assigns anything to anybody:
 * an asset fitted to DT-042 has no holder and produces no BAST, which is the
 * client's decision and the reason `reason` is compulsory on both calls. It is
 * the only thing the audit trail cannot work out for itself.
 *
 * Units themselves are created and renamed through the master data RPCs
 * (`src/api/masterData.ts`, entity `unit`), like every other reference table.
 */

import { supabase } from '@/lib/supabase';

export interface UnitAssetRow {
  id: string;
  asset_code: string;
  name: string;
  category_name: string;
  status_name: string;
  condition_name: string;
  location_name: string;
}

export interface FittedResult {
  assetId: string;
  unitCode?: string;
  unitName?: string;
  removedFrom?: string;
}

export async function installAssetToUnit(
  assetId: string,
  unitId: string,
  reason: string,
): Promise<FittedResult> {
  const { data, error } = await supabase.rpc('install_asset_to_unit', {
    p_asset: assetId,
    p_unit: unitId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  return data as FittedResult;
}

export async function removeAssetFromUnit(assetId: string, reason: string): Promise<FittedResult> {
  const { data, error } = await supabase.rpc('remove_asset_from_unit', {
    p_asset: assetId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  return data as FittedResult;
}

/** What one unit is carrying — "everything on DT-042". */
export async function fetchUnitAssets(unitId: string): Promise<UnitAssetRow[]> {
  const { data, error } = await supabase.rpc('unit_assets', { p_unit: unitId });
  if (error) throw new Error(error.message);
  return (data ?? []) as UnitAssetRow[];
}
