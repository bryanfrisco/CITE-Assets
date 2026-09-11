/**
 * Assignment & movement API — Phase 4.
 *
 * Working rule #2: every write here is a single RPC. assign_asset() touches
 * four tables in one transaction, so there is deliberately no client-side
 * equivalent to fall back on.
 */

import { supabase } from '@/lib/supabase';

export interface EmployeeRow {
  id: string;
  full_name: string;
  nik: string | null;
  department_name: string | null;
  location_name: string | null;
}

/** Wizard step 1 — README: name, `Department · Location · NIK`. */
export async function fetchAssignableEmployees(scope: string[]): Promise<EmployeeRow[]> {
  const { data, error } = await supabase.rpc('assignable_employees', { p_locations: scope });
  if (error) throw new Error(error.message);
  return (data ?? []) as EmployeeRow[];
}

export interface AssignableAssetRow {
  id: string;
  asset_code: string;
  name: string;
  location_name: string;
  condition_name: string;
  holder_name: string | null;
}

/**
 * Wizard step 2 — `Available` in assign mode, `Assigned` in return mode,
 * always inside the current scope.
 */
export async function fetchAssignableAssets(
  scope: string[],
  mode: 'assign' | 'return',
): Promise<AssignableAssetRow[]> {
  const { data, error } = await supabase.rpc('assignable_assets', {
    p_locations: scope,
    p_mode: mode,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as AssignableAssetRow[];
}

export interface AssignInput {
  assetId: string;
  accountId: string;
  locationId: string | null;
  date: string;
  expectedReturn?: string | null;
  notes?: string | null;
  /** README § step 3 — the "Auto-generate BAST" switch, default ON. */
  autoBast: boolean;
}

export interface AssignResult {
  assignmentId: string;
  /** null when the switch was off. */
  bastNumber: string | null;
  /**
   * The draft this handover raised, so the screen can open it.
   *
   * Without the id all the success step could do was announce a number and
   * send somebody to the register to go and find the document they had just
   * made. `returnAsset` has always returned this; assign did not.
   */
  bastId: string | null;
}

export async function assignAsset(input: AssignInput): Promise<AssignResult> {
  const { data, error } = await supabase.rpc('assign_asset', {
    p_asset: input.assetId,
    p_account: input.accountId,
    p_location: input.locationId,
    p_date: input.date,
    p_expected_return: input.expectedReturn ?? null,
    p_notes: input.notes ?? null,
    p_auto_bast: input.autoBast,
  });
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as
    { assignment_id: string; bast_number: string | null; bast_id: string | null } | undefined;
  if (!row) throw new Error('Assignment failed');
  return {
    assignmentId: row.assignment_id,
    bastNumber: row.bast_number,
    bastId: row.bast_id ?? null,
  };
}

export interface ReturnInput {
  assetId: string;
  date: string;
  conditionId: string;
  notes?: string | null;
  /** Raises the Berita Acara Penarikan Barang for the device coming back. */
  autoBast?: boolean;
}

export interface ReturnResult {
  assignmentId: string;
  bastId: string | null;
  bastNumber: string | null;
}

/**
 * Closes the assignment and, unless asked not to, raises the withdrawal BAST.
 *
 * Migration 0032 replaced the four-argument form outright rather than adding an
 * overload beside it — a defaulted parameter on a second overload makes every
 * named-argument call ambiguous, which is the fault migration 0029 exists to
 * clean up.
 */
export async function returnAsset(input: ReturnInput): Promise<ReturnResult> {
  const { data, error } = await supabase.rpc('return_asset', {
    p_asset: input.assetId,
    p_date: input.date,
    p_condition: input.conditionId,
    p_notes: input.notes ?? null,
    p_auto_bast: input.autoBast ?? true,
  });
  if (error) throw new Error(error.message);
  return data as ReturnResult;
}

/** README § Transfer / Movement — the reason select. */
export const MOVEMENT_REASONS = [
  'project rollout',
  'employee relocation',
  'repair',
  'redeployment',
  'audit support',
  'other',
] as const;

export type MovementReason = (typeof MOVEMENT_REASONS)[number];

export interface MovementInput {
  assetId: string;
  toLocationId: string;
  reason: string;
  remarks?: string | null;
  at?: string | null;
}

export async function recordMovement(input: MovementInput): Promise<string> {
  const { data, error } = await supabase.rpc('record_movement', {
    p_asset: input.assetId,
    p_to_location: input.toLocationId,
    p_reason: input.reason,
    p_remarks: input.remarks ?? null,
    p_at: input.at ?? new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export interface MovementRow {
  id: string;
  asset_id: string;
  asset_code: string;
  asset_name: string;
  from_location: string | null;
  to_location: string;
  moved_at: string;
  reason: string;
  remarks: string | null;
  moved_by_name: string | null;
}

/**
 * README § Transfer: "Movement history is append-only — never expose edit or
 * delete." There is no update or delete counterpart to this function anywhere
 * in the API layer, and none can be added: the database refuses both.
 */
export async function fetchMovements(scope: string[], assetId?: string): Promise<MovementRow[]> {
  const { data, error } = await supabase.rpc('movement_history', {
    p_locations: scope,
    p_asset: assetId ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as MovementRow[];
}

/**
 * The other shift on a shared asset — a handy-talkie carried by two people.
 *
 * Called after the assignment exists rather than folded into assignAsset(),
 * because widening a live RPC signature is the mistake migration 0029 exists
 * to clean up after. Passing null clears the second holder again.
 *
 * Setting one makes the document need a THIRD signature: it is not finished
 * until both holders have signed.
 */
/**
 * Replaces the list of extra holders outright.
 *
 * The array is holders 2..N in order; an empty array clears them. Passing the
 * whole list rather than adding one at a time is what lets a name be REMOVED —
 * an add-only call could never express "it is these two now, not those three".
 *
 * At most three extra, because each position needs a signature role of its own
 * and four of them exist. The printed document is no longer the limit: it runs
 * to a second page when the signature column fills up.
 */
export async function setAssetHolders(
  assetId: string,
  accountIds: string[],
): Promise<{ assetId: string; assignmentId: string; holderNames: string[] }> {
  const { data, error } = await supabase.rpc('set_asset_holders', {
    p_asset: assetId,
    p_accounts: accountIds,
  });
  if (error) throw new Error(error.message);
  return data as { assetId: string; assignmentId: string; holderNames: string[] };
}

export async function setSecondaryHolder(
  assetId: string,
  accountId: string | null,
): Promise<{ assetId: string; assignmentId: string; secondaryName: string | null }> {
  const { data, error } = await supabase.rpc('set_secondary_holder', {
    p_asset: assetId,
    p_account: accountId,
  });
  if (error) throw new Error(error.message);
  return data as { assetId: string; assignmentId: string; secondaryName: string | null };
}
