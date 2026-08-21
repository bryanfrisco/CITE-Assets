/**
 * Employee import — run against the real Odoo export in the repo root.
 *
 * The file is the point. A synthetic fixture would have exactly the problems
 * somebody thought to invent; `Hr Employee (hr.employee).csv` has the ones that
 * are actually there — 23 blank employee IDs, one ID claimed twice, two
 * malformed email addresses, twelve addresses in mixed case, and phone numbers
 * still carrying Excel's text-forcing apostrophe.
 *
 * Assertions name identities, not totals, wherever a total would break the
 * next time HR exports.
 *
 *   supabase start && supabase db reset
 *   npm run test:import-accounts
 */

import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

import { assertLocal } from './_guard.mjs';
import { loadTs } from './_ts.mjs';

const { EMPLOYEE_IMPORT, parseImportCsv } = loadTs('src/lib/csv.ts');

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = 'cite-dev-2026';
const FILE = 'Hr Employee (hr.employee).csv';

assertLocal(URL);

let failures = 0;

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function clientFor(email) {
  const supabase = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`Sign in failed for ${email}: ${error.message}`);
  return supabase;
}

const warningsFor = (result, column) => result.warnings.filter((w) => w.column === column);

async function run() {
  if (!ANON) {
    console.error('EXPO_PUBLIC_SUPABASE_ANON_KEY is not set.');
    process.exit(1);
  }

  // The real export is deliberately NOT committed: this repository is public
  // and the file carries the name, employee number, job title, email and phone
  // of every person in the company. Drop it in the project root to run this
  // suite; without it there is nothing meaningful to assert, and inventing a
  // fixture would only prove that the fixture works.
  if (!existsSync(FILE)) {
    console.log(`\nSKIPPED — ${FILE} is not in the project root.`);
    console.log('  It is git-ignored on purpose; copy the Odoo export here to run it.\n');
    process.exit(0);
  }

  const admin = await clientFor('dewi.lestari@cite.co.id');

  const parsed = parseImportCsv(readFileSync(FILE, 'utf8'), EMPLOYEE_IMPORT);

  console.log('\nThe file itself');
  check(
    'every column is recognised',
    parsed.unknownColumns.length === 0,
    parsed.unknownColumns.join(', '),
  );
  check(
    'nothing required is missing',
    parsed.missingRequired.length === 0,
    parsed.missingRequired.join(', '),
  );
  check('527 rows parsed', parsed.rows.length === 527, `got ${parsed.rows.length}`);

  console.log('\nDry run — nothing may be written');
  const before = await admin.from('accounts').select('id', { count: 'exact', head: true });
  const dry = (
    await admin.rpc('import_accounts', {
      p_rows: parsed.rows,
      p_dry_run: true,
      p_file_name: FILE,
    })
  ).data;
  const afterDry = await admin.from('accounts').select('id', { count: 'exact', head: true });

  check(
    'a dry run adds no rows',
    before.count === afterDry.count,
    `${before.count} then ${afterDry.count}`,
  );
  check('one row is skipped', dry.skipped === 1, JSON.stringify(dry.errors));

  const skipped = dry.errors[0];
  check(
    'the skipped row is Heidi Lianawaty SMA',
    skipped?.name === 'Heidi Lianawaty SMA',
    skipped?.name,
  );
  check(
    '...because NH2565 is already used',
    (skipped?.problems ?? []).some((p) => p.column === 'employee_id' && /NH2565/.test(p.message)),
    JSON.stringify(skipped?.problems),
  );
  check(
    'everything else is importable',
    dry.created + dry.updated + dry.unchanged === 526,
    `${dry.created}/${dry.updated}/${dry.unchanged}`,
  );

  console.log('\nMessy values are reported, not fatal');
  check(
    'the two malformed addresses are dropped',
    warningsFor(dry, 'work_email').filter((w) => /Not an email/.test(w.message)).length === 2,
    JSON.stringify(warningsFor(dry, 'work_email')),
  );
  check(
    'every blank employee ID is reported',
    warningsFor(dry, 'employee_id').length === 23,
    String(warningsFor(dry, 'employee_id').length),
  );
  check('warnings are grouped for the screen', dry.warningSummary.length > 0);

  console.log('\nThe real import');
  const first = (
    await admin.rpc('import_accounts', {
      p_rows: parsed.rows,
      p_dry_run: false,
      p_file_name: FILE,
    })
  ).data;
  check(
    'numbers match the rehearsal exactly',
    first.created === dry.created && first.updated === dry.updated && first.skipped === dry.skipped,
    `${first.created}/${first.updated} vs ${dry.created}/${dry.updated}`,
  );

  const byName = async (name) =>
    (await admin.from('accounts').select('*').eq('full_name', name).maybeSingle()).data;

  const taufik = await byName('Achmad Taufik');
  check(
    'an address in mixed case is stored lower-cased',
    taufik?.email === 'achmad.taufik@aspire.id',
    taufik?.email,
  );
  check('...and its phone number survives', Boolean(taufik?.phone), taufik?.phone);

  const muliady = await byName('Muliady Sutio');
  check('somebody with no employee ID still imported', Boolean(muliady), 'President Director');
  check(
    '...with a null NIK rather than an empty string',
    muliady?.nik === null,
    JSON.stringify(muliady?.nik),
  );
  check(
    '...and their job position',
    muliady?.job_title === 'President Director',
    muliady?.job_title,
  );

  check('everyone arrives as Record only', muliady?.can_login === false && muliady?.role === null);

  const rendy = await byName('Rendy Martanto');
  check(
    'a malformed address is stored as null, and the person still exists',
    Boolean(rendy) && rendy?.email === null,
    JSON.stringify(rendy?.email),
  );

  // Both are "Ruli Tanio" at different companies, both without an employee ID.
  const ruliSpr = await byName('Ruli Tanio');
  const ruliSma = await byName('Ruli Tanio SMA');
  check(
    'two blank-ID people at two companies stay two people',
    Boolean(ruliSpr) && Boolean(ruliSma) && ruliSpr.id !== ruliSma.id,
  );

  const phones = (await admin.from('accounts').select('phone').not('phone', 'is', null)).data ?? [];
  check(
    "Excel's text-forcing apostrophe is stripped",
    phones.every((p) => !p.phone.startsWith("'")),
    JSON.stringify(phones.filter((p) => p.phone.startsWith("'")).slice(0, 3)),
  );

  console.log('\nImporting the same file again');
  const second = (
    await admin.rpc('import_accounts', {
      p_rows: parsed.rows,
      p_dry_run: false,
      p_file_name: FILE,
    })
  ).data;
  check('adds nobody', second.created === 0, String(second.created));
  check('changes nobody', second.updated === 0, String(second.updated));
  check('recognises everyone', second.unchanged === 526, String(second.unchanged));

  console.log('\nWhat an import must never touch');
  // Set up an imported person the way an admin would inside the app: a role, a
  // sign-in, a location, a department. Then ALSO change a column the import
  // DOES own, so the next import genuinely has to UPDATE this row. Without that
  // the row would count as "unchanged", no UPDATE would run at all, and the
  // assertions below would pass while testing nothing.
  const guineaPig = await byName('Achmad Taufik');
  const site = (await admin.from('locations').select('id').eq('code', 'SITE').single()).data;
  const dept = (await admin.from('departments').select('id').limit(1).single()).data;

  const setUp = await admin.rpc('update_account', {
    p_id: guineaPig.id,
    p_full_name: guineaPig.full_name,
    p_job_title: 'Something the export disagrees with',
    p_department: dept.id,
    p_location: site.id,
    p_role: 'site_it',
    p_can_login: true,
    p_is_active: true,
  });
  check('the person can be configured through the app', !setUp.error, setUp.error?.message);

  const third = (
    await admin.rpc('import_accounts', {
      p_rows: parsed.rows,
      p_dry_run: false,
      p_file_name: FILE,
    })
  ).data;
  check(
    'the import really does have to rewrite that row',
    third.updated === 1,
    String(third.updated),
  );

  const after = (await admin.from('accounts').select('*').eq('id', guineaPig.id).single()).data;

  check(
    'job position is corrected from the file',
    after.job_title === 'Tax Staff',
    after.job_title,
  );
  check('role survives', after.role === 'site_it', String(after.role));
  check('sign-in survives', after.can_login === true, String(after.can_login));
  check('location survives', after.location_id === site.id);
  check('department survives', after.department_id === dept.id);

  console.log('\nOnly a Super Admin may import');
  const siteIt = await clientFor('siti.rahayu@cite.co.id');
  const refused = await siteIt.rpc('import_accounts', {
    p_rows: parsed.rows.slice(0, 1),
    p_dry_run: true,
    p_file_name: FILE,
  });
  check('Site IT is refused', Boolean(refused.error), refused.error?.message ?? 'no error raised');

  console.log(failures === 0 ? '\nAll good.\n' : `\n${failures} failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
