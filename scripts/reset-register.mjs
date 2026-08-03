/**
 * Empties the register for go-live.
 *
 * WHAT IT REMOVES
 * ---------------
 * Every row the team will enter themselves: assets, assignments, movements,
 * E-BAST and their versions and signatures, documents, maintenance, labels,
 * status changes, notifications, import batches, the audit log, and the
 * signatory list. The three number counters are reset too, or the first real
 * laptop would start at LPT001-26-002 and the first document at
 * BAST/CITE/2026/0002.
 *
 * WHAT IT KEEPS
 * -------------
 * Master data (categories, brands, models, vendors, departments), locations,
 * asset statuses and conditions, and every account — including the sign-in you
 * are about to use. Those come from migrations and seed, not from the team.
 *
 * WHY TRUNCATE AND NOT DELETE
 * ---------------------------
 * movements, bast_versions, bast_signatures, asset_status_changes and audit_log
 * all carry a forbid_mutation() trigger that raises on DELETE — deliberately,
 * because those tables are the record. Row-level DELETE is refused for every
 * role including the service role. TRUNCATE bypasses row triggers, which is the
 * only reason this is possible at all, and it is why this script exists rather
 * than a "clear data" button in the app.
 *
 * THIS IS NOT REVERSIBLE. There is no undo and no soft delete.
 *
 *   SUPABASE_DB_URL='postgresql://…' node scripts/reset-register.mjs --yes
 *
 * The connection string is the one under Project Settings → Database →
 * Connection string → URI. It is read from the environment and never written
 * to a file.
 */

import { execFileSync } from 'node:child_process';

const url = process.env.SUPABASE_DB_URL;

if (!url) {
  console.error('SUPABASE_DB_URL is not set.');
  console.error('Project Settings → Database → Connection string → URI');
  process.exit(1);
}

if (!process.argv.includes('--yes')) {
  console.error('This empties the register and cannot be undone. Re-run with --yes.');
  process.exit(1);
}

// One transaction: a half-cleared register is worse than a full one, because
// the parts that survived would look like real records.
const sql = `
begin;

truncate table
  asset_status_changes,
  bast_signatures,
  bast_versions,
  bast,
  documents,
  maintenance_records,
  movements,
  assignments,
  asset_tags,
  assets,
  notifications,
  import_batches,
  audit_log,
  bast_signatories
restart identity cascade;

delete from asset_code_counters;
delete from bast_number_counters;
delete from tag_code_counters;

commit;

select 'assets'     as table, count(*) from assets
union all select 'bast',       count(*) from bast
union all select 'audit_log',  count(*) from audit_log
union all select 'asset_tags', count(*) from asset_tags
union all select 'accounts',   count(*) from accounts
union all select 'categories', count(*) from categories
union all select 'locations',  count(*) from locations;
`;

// psql from the local Supabase container, so nothing extra has to be installed.
const container = process.env.PSQL_CONTAINER ?? 'supabase_db_cite-assets';

try {
  const out = execFileSync(
    'docker',
    ['exec', '-i', container, 'psql', url, '-v', 'ON_ERROR_STOP=1'],
    { input: sql, encoding: 'utf8' },
  );
  console.log(out);
  console.log('Register cleared. Master data, locations and accounts are untouched.');
} catch (e) {
  console.error(e.stdout ?? '');
  console.error(e.stderr ?? e.message);
  process.exit(1);
}
