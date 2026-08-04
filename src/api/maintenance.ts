/**
 * Maintenance — a log, not a workflow.
 *
 * Client instruction, 2026-08-04: "ubah juga maintenance sifatnya menjadi
 * pencatatan saja. dari tanggal berapa ke berapa laptop ini di maintenance kan.
 * tidak perlu status open sampai cancelled."
 *
 * So a record is a title and a date range. An end date means it is over; no end
 * date means it is still in the shop. There is no state to keep in step with
 * anything.
 *
 * WHAT IT DOES TO THE ASSET
 * -------------------------
 * The dates drive the asset's status, in both directions:
 *
 *   no end date   ->  the asset shows as Maintenance
 *   end date set  ->  back to Assigned if somebody holds it, else Available
 *
 * Migration 0030 cut that link entirely, which over-corrected. The original bug
 * was one-directional — opening a repair set Maintenance and closing it cleared
 * nothing, so assets stuck there. The missing half was the way back, not the
 * way in, and migration 0032 restores both in one helper so they cannot drift
 * apart again. Every hop is written to the status history with a reason.
 */

import { supabase } from '@/lib/supabase';

export interface MaintenanceRecord {
  id: string;
  asset_id: string;
  asset_code: string;
  asset_name: string;
  title: string;
  detail: string | null;
  vendor_name: string | null;
  is_internal: boolean;
  cost: string | number | null;
  under_warranty: boolean;
  started_at: string;
  completed_at: string | null;
  next_due_at: string | null;
  /** Elapsed days; counts up to today while it is still ongoing. */
  days: number;
  ongoing: boolean;
  location_name: string;
}

export interface MaintenanceStats {
  ongoing: number;
  finished: number;
  cost: string | number;
  /** Total days the fleet has spent in the shop. */
  days: number;
}

export async function fetchMaintenance(
  scope: string[],
  ongoing?: boolean,
): Promise<MaintenanceRecord[]> {
  const { data, error } = await supabase.rpc('maintenance_log', {
    p_locations: scope,
    p_ongoing: ongoing ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as MaintenanceRecord[];
}

export async function fetchMaintenanceStats(scope: string[]): Promise<MaintenanceStats> {
  const { data, error } = await supabase.rpc('maintenance_stats', { p_locations: scope });
  if (error) throw new Error(error.message);
  return (data ?? { ongoing: 0, finished: 0, cost: 0, days: 0 }) as MaintenanceStats;
}

export interface MaintenanceInput {
  assetId: string;
  title: string;
  startedAt: string;
  /** null while it is still in the shop. */
  completedAt?: string | null;
  detail?: string | null;
  vendorId?: string | null;
  isInternal?: boolean;
  underWarranty?: boolean;
  cost?: number | null;
  nextDueAt?: string | null;
}

export interface MaintenanceResult {
  ongoing: boolean;
  /** What the asset's status is now — the RPC reads it back after the hop. */
  assetStatus: string | null;
}

export async function logMaintenance(input: MaintenanceInput): Promise<MaintenanceResult> {
  const { data, error } = await supabase.rpc('log_maintenance', {
    p_asset: input.assetId,
    p_title: input.title,
    p_started: input.startedAt,
    p_completed: input.completedAt ?? null,
    p_detail: input.detail ?? null,
    p_vendor: input.vendorId ?? null,
    p_is_internal: input.isInternal ?? false,
    p_warranty: input.underWarranty ?? false,
    p_cost: input.cost ?? null,
    p_next_due: input.nextDueAt ?? null,
  });
  if (error) throw new Error(error.message);
  return data as MaintenanceResult;
}

export async function editMaintenance(
  id: string,
  changes: {
    title?: string | null;
    startedAt?: string | null;
    completedAt?: string | null;
    detail?: string | null;
    vendorId?: string | null;
    cost?: number | null;
    nextDueAt?: string | null;
    /** Explicit: a null completedAt means "leave it", not "reopen it". */
    clearCompleted?: boolean;
  },
): Promise<MaintenanceResult> {
  const { data, error } = await supabase.rpc('edit_maintenance', {
    p_id: id,
    p_title: changes.title ?? null,
    p_started: changes.startedAt ?? null,
    p_completed: changes.completedAt ?? null,
    p_detail: changes.detail ?? null,
    p_vendor: changes.vendorId ?? null,
    p_cost: changes.cost ?? null,
    p_next_due: changes.nextDueAt ?? null,
    p_clear_completed: changes.clearCompleted ?? false,
  });
  if (error) throw new Error(error.message);
  return data as MaintenanceResult;
}
