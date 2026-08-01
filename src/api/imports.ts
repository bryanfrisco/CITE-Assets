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

export interface ImportBatch {
  id: string;
  file_name: string;
  total_rows: number;
  imported_rows: number;
  skipped_rows: number;
  errors: RowError[];
  imported_by_name: string;
  created_at: string;
}

export async function fetchImportHistory(limit = 25): Promise<ImportBatch[]> {
  const { data, error } = await supabase.rpc('import_history', { p_limit: limit });
  if (error) throw new Error(error.message);
  return (data ?? []) as ImportBatch[];
}
