/**
 * CSV import — Phase 7.
 *
 * Preview and commit are the same database call with one flag changed, so the
 * list a person approves is produced by the code that does the work. A separate
 * "validate" endpoint would eventually disagree with the importer, and the
 * disagreement would only surface as rows that vanished.
 */

import { supabase } from '@/lib/supabase';
import type { CsvRow, RowError } from '@/lib/csv';

export interface ImportResult {
  dryRun: boolean;
  total: number;
  valid: number;
  invalid: number;
  errors: RowError[];
  batchId: string | null;
  created: { id: string; assetCode: string }[];
}

export async function importAssets(
  rows: CsvRow[],
  dryRun: boolean,
  fileName: string,
): Promise<ImportResult> {
  const { data, error } = await supabase.rpc('import_assets', {
    p_rows: rows,
    p_dry_run: dryRun,
    p_file_name: fileName,
  });
  if (error) throw new Error(error.message);
  return data as ImportResult;
}

/**
 * The employee import.
 *
 * A different shape of answer from importAssets(): assets are only ever
 * created, whereas an employee import runs again every month and mostly
 * *updates*. So the counts a person needs to see before committing are
 * created / updated / unchanged / skipped, not valid / invalid.
 */
export interface EmployeeWarning {
  row: number;
  name: string;
  column: string;
  message: string;
}

export interface WarningCount {
  message: string;
  count: number;
}

export interface EmployeeImportResult {
  dryRun: boolean;
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  errors: RowError[];
  /** Values that were dropped and reported; the row still imported. */
  warnings: EmployeeWarning[];
  /** The same warnings grouped, so 23 blank IDs read as one line. */
  warningSummary: WarningCount[];
  batchId: string | null;
}

export async function importAccounts(
  rows: CsvRow[],
  dryRun: boolean,
  fileName: string,
): Promise<EmployeeImportResult> {
  const { data, error } = await supabase.rpc('import_accounts', {
    p_rows: rows,
    p_dry_run: dryRun,
    p_file_name: fileName,
  });
  if (error) throw new Error(error.message);
  return data as EmployeeImportResult;
}

export type ImportKind = 'assets' | 'employees';

export interface ImportBatch {
  id: string;
  /** Which importer wrote it — the two share one table and one history call. */
  kind: ImportKind;
  file_name: string;
  total_rows: number;
  imported_rows: number;
  skipped_rows: number;
  errors: RowError[];
  imported_by_name: string;
  created_at: string;
}

/**
 * Past imports of one kind.
 *
 * Filtering here rather than in SQL keeps import_history() at one argument —
 * migration 0029 is a monument to what adding a parameter to a live function
 * costs. The list is capped at 100 rows server-side, so this is cheap.
 */
export async function fetchImportHistory(
  kind: ImportKind = 'assets',
  limit = 25,
): Promise<ImportBatch[]> {
  const { data, error } = await supabase.rpc('import_history', { p_limit: 100 });
  if (error) throw new Error(error.message);
  return ((data ?? []) as ImportBatch[]).filter((b) => b.kind === kind).slice(0, limit);
}
