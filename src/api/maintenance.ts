/**
 * Maintenance — Phase 6.
 *
 * `next_due_at` is what feeds the maintenance reminder job, so it is worth
 * setting even on a job that is already finished: a service completed today
 * with a next date in six months is the only thing that will remind anybody.
 */

import { supabase } from '@/lib/supabase';

export type MaintenanceState = 'open' | 'in_progress' | 'completed' | 'cancelled';

export const MAINTENANCE_STATE_LABEL: Record<MaintenanceState, string> = {
  open: 'Open',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export interface MaintenanceListRow {
  id: string;
  asset_id: string;
  asset_code: string;
  asset_name: string;
  title: string;
  detail: string | null;
  state: MaintenanceState;
  vendor_name: string | null;
  cost: string | number | null;
  under_warranty: boolean;
  started_at: string;
  completed_at: string | null;
  next_due_at: string | null;
  location_name: string;
}

export interface MaintenanceStats {
  open: number;
  inProgress: number;
  completed: number;
  cost: string | number;
}

export async function fetchMaintenance(
  scope: string[],
  state?: MaintenanceState,
): Promise<MaintenanceListRow[]> {
  const { data, error } = await supabase.rpc('maintenance_list', {
    p_locations: scope,
    p_state: state ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as MaintenanceListRow[];
}

export async function fetchMaintenanceStats(scope: string[]): Promise<MaintenanceStats> {
  const { data, error } = await supabase.rpc('maintenance_stats', { p_locations: scope });
  if (error) throw new Error(error.message);
  return (data ?? { open: 0, inProgress: 0, completed: 0, cost: 0 }) as MaintenanceStats;
}

export interface OpenMaintenanceInput {
  assetId: string;
  title: string;
  detail?: string | null;
  vendorId?: string | null;
  isInternal?: boolean;
  underWarranty?: boolean;
  startedAt?: string | null;
  nextDueAt?: string | null;
}

export async function openMaintenance(input: OpenMaintenanceInput): Promise<{ id: string }> {
  const { data, error } = await supabase.rpc('open_maintenance', {
    p_asset: input.assetId,
    p_title: input.title,
    p_detail: input.detail ?? null,
    p_vendor: input.vendorId ?? null,
    p_is_internal: input.isInternal ?? false,
    p_warranty: input.underWarranty ?? false,
    p_started: input.startedAt ?? null,
    p_next_due: input.nextDueAt ?? null,
  });
  if (error) throw new Error(error.message);
  return data as { id: string };
}

export async function updateMaintenance(
  id: string,
  changes: {
    state?: MaintenanceState;
    cost?: number | null;
    detail?: string | null;
    completedAt?: string | null;
    nextDueAt?: string | null;
  },
): Promise<{ state: MaintenanceState }> {
  const { data, error } = await supabase.rpc('update_maintenance', {
    p_id: id,
    p_state: changes.state ?? null,
    p_cost: changes.cost ?? null,
    p_detail: changes.detail ?? null,
    p_completed: changes.completedAt ?? null,
    p_next_due: changes.nextDueAt ?? null,
  });
  if (error) throw new Error(error.message);
  return data as { state: MaintenanceState };
}
