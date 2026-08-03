/**
 * Audit log — the reader for a table that has been filling up since day one.
 *
 * Every mutable table has carried an audit trigger since migration 0001, so
 * nothing here writes: `audit_list()` is a read, and the log is append-only
 * three ways underneath it.
 *
 * Deliberately not scoped by location. The log records who did what across
 * every location, which is the point of it — and the reason it is limited to
 * Corporate IT and above rather than narrowed like everything else.
 */

import { supabase } from '@/lib/supabase';

export type AuditAction =
  | 'asset_created'
  | 'asset_updated'
  | 'status_changed'
  | 'assignment_created'
  | 'assignment_returned'
  | 'movement_recorded'
  | 'bast_generated'
  | 'bast_signed'
  | 'maintenance_updated'
  | 'document_uploaded'
  | 'master_created'
  | 'master_updated'
  | 'master_deleted'
  | 'account_created'
  | 'account_updated'
  | 'import_completed';

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  asset_created: 'Asset created',
  asset_updated: 'Asset updated',
  status_changed: 'Status changed',
  assignment_created: 'Assigned',
  assignment_returned: 'Returned',
  movement_recorded: 'Moved',
  bast_generated: 'E-BAST generated',
  bast_signed: 'E-BAST signed',
  maintenance_updated: 'Maintenance',
  document_uploaded: 'Document uploaded',
  master_created: 'Master data added',
  master_updated: 'Master data updated',
  master_deleted: 'Master data removed',
  account_created: 'Account created',
  account_updated: 'Account updated',
  import_completed: 'Import',
};

/** The filter chips, in the order they are offered. */
export const AUDIT_FILTERS: { key: AuditAction | 'all'; label: string }[] = [
  { key: 'all', label: 'Everything' },
  { key: 'asset_created', label: 'Created' },
  { key: 'asset_updated', label: 'Edited' },
  { key: 'status_changed', label: 'Status' },
  { key: 'assignment_created', label: 'Assigned' },
  { key: 'assignment_returned', label: 'Returned' },
  { key: 'movement_recorded', label: 'Moved' },
  { key: 'bast_signed', label: 'Signed' },
  { key: 'account_updated', label: 'Accounts' },
];

export interface AuditEntry {
  id: number;
  action: AuditAction;
  table_name: string;
  record_id: string | null;
  target_label: string | null;
  actor_label: string | null;
  actor_name: string;
  device: string | null;
  created_at: string;
  /** One readable line, built in SQL so an export cannot disagree with the screen. */
  summary: string;
}

export interface AuditStats {
  total: number;
  today: number;
  week: number;
  actors: number;
}

export const AUDIT_PAGE_SIZE = 60;

export async function fetchAuditLog(options: {
  action?: AuditAction | null;
  search?: string | null;
  offset?: number;
}): Promise<AuditEntry[]> {
  const { data, error } = await supabase.rpc('audit_list', {
    p_action: options.action ?? null,
    p_table: null,
    p_search: options.search ?? null,
    p_limit: AUDIT_PAGE_SIZE,
    p_offset: options.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as AuditEntry[];
}

export async function fetchAuditStats(): Promise<AuditStats> {
  const { data, error } = await supabase.rpc('audit_stats');
  if (error) throw new Error(error.message);
  return data as AuditStats;
}
