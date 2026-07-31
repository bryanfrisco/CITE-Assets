/**
 * Notifications — Phase 6.
 *
 * The inbox is per account and the database decides that, not this file:
 * notifications_list() filters on my_account_id(), so there is deliberately no
 * way to ask for someone else's.
 *
 * Rows are written by the scheduled jobs, never from here. An app that could
 * insert notifications could fill another person's inbox, and nothing in the
 * product needs that.
 */

import { supabase } from '@/lib/supabase';

export type NotificationKind =
  | 'warranty_expiring'
  | 'asset_returned'
  | 'new_assignment'
  | 'new_bast'
  | 'maintenance_reminder'
  | 'import_completed';

export interface NotificationRow {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  asset_id: string | null;
  asset_code: string | null;
  bast_id: string | null;
  bast_number: string | null;
  read_at: string | null;
  created_at: string;
}

export async function fetchNotifications(limit = 50): Promise<NotificationRow[]> {
  const { data, error } = await supabase.rpc('notifications_list', { p_limit: limit });
  if (error) throw new Error(error.message);
  return (data ?? []) as NotificationRow[];
}

/** Drives the red dot on the bell. */
export async function fetchUnreadCount(): Promise<number> {
  const { data, error } = await supabase.rpc('notification_unread_count');
  if (error) throw new Error(error.message);
  return (data ?? 0) as number;
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.rpc('mark_notification_read', { p_id: id });
  if (error) throw new Error(error.message);
}

export async function markAllNotificationsRead(): Promise<number> {
  const { data, error } = await supabase.rpc('mark_all_notifications_read');
  if (error) throw new Error(error.message);
  return (data as { marked: number }).marked;
}

/**
 * The weekly backup reminder rides on the `import_completed` kind, because the
 * enum is fixed in migration 0001 and Postgres will not let a value be added
 * and used in the same transaction. What actually identifies it is the dedupe
 * key, which the title carries plainly — so the icon is chosen from the title
 * rather than from a kind that would be misleading.
 */
export function isBackupReminder(row: NotificationRow): boolean {
  return row.kind === 'import_completed' && row.title.startsWith('Weekly backup');
}

// ---------------------------------------------------------------------------
// Operations — Super Admin only
// ---------------------------------------------------------------------------

export interface ScheduledJob {
  jobname: string;
  schedule: string;
  active: boolean;
}

/**
 * What the database is actually scheduled to do.
 *
 * An empty list is a real answer, not an error: it means pg_cron is not
 * installed, so nothing is running. That state is otherwise completely silent —
 * no error anywhere, and the first sign of trouble would be a warranty that
 * quietly expired.
 */
export async function fetchScheduledJobs(): Promise<ScheduledJob[]> {
  const { data, error } = await supabase.rpc('scheduled_jobs');
  if (error) throw new Error(error.message);
  return (data ?? []) as ScheduledJob[];
}

/**
 * Runs tonight's pass now — the same code the schedule runs, not a copy, so a
 * result here means the real thing works. Safe to press twice: the
 * notifications are keyed by what they are about, so nothing repeats.
 */
export async function runNotificationJobsNow(): Promise<{
  warranty: number;
  maintenance: number;
  backup: number;
}> {
  const { data, error } = await supabase.rpc('run_notification_jobs_now');
  if (error) throw new Error(error.message);
  return data as { warranty: number; maintenance: number; backup: number };
}
