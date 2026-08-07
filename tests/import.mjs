/**
 * CSV import — migration 0024 (Phase 7).
 *
 * IMPLEMENTATION_PLAN.md § Phase 7, "Done when":
 *
 *   "a file with 45 rows and 3 bad rows imports 42 and returns a downloadable
 *    error report."
 *
 * That is built literally below: 45 rows, three of them deliberately broken in
 * three different ways, and the run is checked to import exactly 42 and report
 * exactly 3 — with the reasons attached, which is what makes the report worth
 * downloading.
 *
 * The other thing asserted here is that the PREVIEW IS HONEST: the dry run and
 * the real run are the same call with one flag changed, so a preview that said
 * 42 and then imported 40 would be a bug the criterion above would not catch on
 * its own.
 *
 * REPEATABILITY
 * -------------
 * Serial numbers carry the run's timestamp, so a second run collides with
 * nothing. Assets cannot be deleted (movements and BAST reference them), so
 * nothing is cleaned up and no assertion counts the register.
 *
 *   supabase start && supabase db reset
 *   npm run test:import
 */

import { createClient } from '@supabase/supabase-js';

import { assertLocal } from './_guard.mjs';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = 'cite-dev-2026';

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

async function run() {
  if (!ANON) {
    console.error('EXPO_PUBLIC_SUPABASE_ANON_KEY is not set.');
    process.exit(1);
  }

  const admin = await clientFor('dewi.lestari@cite.co.id');

  const { data: categories } = await admin.from('categories').select('name').limit(1);
  const category = categories[0].name;
  const stamp = Date.now();

  const goodRow = (i) => ({
    asset_code: '',
    name: `Imported Device ${i}`,
    category,
    brand: '',
    model: '',
    serial_number: `SN-IMP-${stamp}-${i}`,
    status: 'Available',
    condition: 'Good',
    location: 'Head Office',
    department: '',
    vendor: '',
    purchase_date: '2025-02-10',
    purchase_price: '9500000',
    warranty_start: '2025-02-10',
    warranty_end: '2028-02-10',
    notes: '',
  });

  console.log('\nThe acceptance criterion — 45 rows, 3 bad');
  let preview;
  {
    const rows = [];
    for (let i = 1; i <= 42; i += 1) rows.push(goodRow(i));

    // Three different kinds of wrong, because a validator that only catches one
    // of them would pass a test built from three copies of the same mistake.
    rows.push({ ...goodRow(43), category: 'Flying Machine' }); // unknown master value
    rows.push({ ...goodRow(44), serial_number: '' }); // missing required field
    rows.push({ ...goodRow(45), purchase_date: 'last Tuesday' }); // unreadable date

    preview = await admin.rpc('import_assets', {
      p_rows: rows,
      p_dry_run: true,
      p_file_name: 'acceptance.csv',
    });

    check('the preview runs', !preview.error, preview.error?.message);
    check('it counts all 45 rows', preview.data?.total === 45, String(preview.data?.total));
    check('42 can be imported', preview.data?.valid === 42, String(preview.data?.valid));
    check('3 cannot', preview.data?.invalid === 3, String(preview.data?.invalid));
    check(
      'and nothing was written — it was only a rehearsal',
      preview.data?.batchId === null && (preview.data?.created ?? []).length === 0,
      JSON.stringify(preview.data?.batchId),
    );

    const errors = preview.data?.errors ?? [];
    const problemFor = (row) =>
      (errors.find((e) => e.row === row)?.problems ?? []).map((p) => `${p.column}:${p.message}`);

    check(
      'the unknown category is named as such',
      problemFor(43).some((p) => p.startsWith('category:') && p.includes('master data')),
      JSON.stringify(problemFor(43)),
    );
    check(
      'the missing serial is reported as required',
      problemFor(44).some((p) => p === 'serial_number:Required'),
      JSON.stringify(problemFor(44)),
    );
    check(
      'and the unreadable date says what a date should look like',
      problemFor(45).some((p) => p.startsWith('purchase_date:') && p.includes('YYYY-MM-DD')),
      JSON.stringify(problemFor(45)),
    );
    check(
      'every error carries the row number, so the report lines up with the file',
      errors.every((e) => Number.isInteger(e.row) && e.row >= 1 && e.row <= 45),
      JSON.stringify(errors.map((e) => e.row)),
    );

    // The real run.
    const rows2 = rows;
    const done = await admin.rpc('import_assets', {
      p_rows: rows2,
      p_dry_run: false,
      p_file_name: 'acceptance.csv',
    });

    check('the import runs', !done.error, done.error?.message);
    check(
      'the preview told the truth — 42 imported',
      done.data?.valid === 42 && done.data?.invalid === 3,
      JSON.stringify({ valid: done.data?.valid, invalid: done.data?.invalid }),
    );
    check(
      'and 42 assets came back with codes',
      (done.data?.created ?? []).length === 42 &&
        // SPRLPT25-HO-0001 — migration 0034.
        (done.data?.created ?? []).every((a) => /^[A-Z]+\d{2}-[A-Z]+-\d{4}$/.test(a.assetCode)),
      JSON.stringify((done.data?.created ?? []).slice(0, 2)),
    );
    check('a batch was recorded', Boolean(done.data?.batchId));

    const history = await admin.rpc('import_history', { p_limit: 5 });
    const batch = (history.data ?? []).find((b) => b.id === done.data.batchId);
    check(
      'the history says who did it and how it went',
      batch?.imported_rows === 42 &&
        batch?.skipped_rows === 3 &&
        batch?.imported_by_name === 'Dewi Lestari',
      JSON.stringify(batch),
    );
    check(
      'and keeps the errors, so the report can be produced again later',
      (batch?.errors ?? []).length === 3,
      String(batch?.errors?.length),
    );

    // The register really has them.
    const search = await admin.rpc('search_assets', {
      p_locations: (await admin.from('locations').select('id')).data.map((l) => l.id),
      p_query: `Imported Device 1`,
      p_status: null,
    });
    check(
      'the assets are findable in the register',
      (search.data ?? []).some((a) => a.name === 'Imported Device 1'),
      JSON.stringify(search.data?.map((a) => a.name)),
    );
  }

  console.log('\nRunning the same file twice does not double the register');
  {
    const rows = [goodRow(1)]; // already imported above
    const again = await admin.rpc('import_assets', {
      p_rows: rows,
      p_dry_run: true,
      p_file_name: 'again.csv',
    });
    check(
      'an already-imported serial is reported, not re-added',
      again.data?.valid === 0 && again.data?.invalid === 1,
      JSON.stringify(again.data),
    );
    check(
      'and it says why',
      (again.data?.errors?.[0]?.problems ?? []).some((p) =>
        p.message.includes('Already in the register'),
      ),
      JSON.stringify(again.data?.errors?.[0]),
    );
  }

  console.log('\nA duplicate inside one file is caught before it is written');
  {
    const serial = `SN-DUP-${stamp}`;
    const rows = [
      { ...goodRow(101), serial_number: serial },
      { ...goodRow(102), serial_number: serial },
    ];
    const result = await admin.rpc('import_assets', {
      p_rows: rows,
      p_dry_run: true,
      p_file_name: 'dupes.csv',
    });
    check(
      'the first is fine and the second is refused',
      result.data?.valid === 1 && result.data?.invalid === 1,
      JSON.stringify(result.data),
    );
    check(
      'and it points at the file, not the register',
      (result.data?.errors?.[0]?.problems ?? []).some((p) =>
        p.message.includes('Duplicated earlier in this file'),
      ),
      JSON.stringify(result.data?.errors?.[0]),
    );
  }

  console.log('\nDates people actually type');
  {
    const rows = [
      { ...goodRow(201), purchase_date: '18/03/2024' },
      { ...goodRow(202), purchase_date: '18-03-2024' },
      { ...goodRow(203), warranty_start: '2026-01-01', warranty_end: '2025-01-01' },
    ];
    const result = await admin.rpc('import_assets', {
      p_rows: rows,
      p_dry_run: true,
      p_file_name: 'dates.csv',
    });
    check(
      'DD/MM/YYYY and DD-MM-YYYY are accepted',
      result.data?.valid === 2,
      JSON.stringify(result.data?.errors),
    );
    check(
      'a warranty that ends before it starts is refused',
      (result.data?.errors?.[0]?.problems ?? []).some((p) =>
        p.message.includes('Ends before it starts'),
      ),
      JSON.stringify(result.data?.errors?.[0]),
    );
  }

  console.log('\nScope and role');
  {
    const viewer = await clientFor('andi.prasetyo@cite.co.id');
    const byViewer = await viewer.rpc('import_assets', {
      p_rows: [goodRow(301)],
      p_dry_run: true,
      p_file_name: 'nope.csv',
    });
    check('a Viewer cannot import', Boolean(byViewer.error), byViewer.error?.message);

    // siti.rahayu is site_it at Head Office (supabase/seed.sql:24), so Site is
    // the location she must not be able to write to.
    const scoped = await clientFor('siti.rahayu@cite.co.id');
    const outOfScope = await scoped.rpc('import_assets', {
      p_rows: [{ ...goodRow(302), location: 'Site' }],
      p_dry_run: true,
      p_file_name: 'scope.csv',
    });
    check(
      'a location outside your scope is refused',
      outOfScope.data?.invalid === 1 &&
        (outOfScope.data?.errors?.[0]?.problems ?? []).some((p) =>
          p.message.includes('Outside the locations'),
        ),
      JSON.stringify(outOfScope.data?.errors?.[0] ?? outOfScope.error?.message),
    );
  }

  console.log('\nFiles that are not really files');
  {
    const empty = await admin.rpc('import_assets', {
      p_rows: [],
      p_dry_run: true,
      p_file_name: 'empty.csv',
    });
    check('an empty file is refused', Boolean(empty.error), empty.error?.message);

    const huge = Array.from({ length: 5001 }, (_, i) => goodRow(9000 + i));
    const tooBig = await admin.rpc('import_assets', {
      p_rows: huge,
      p_dry_run: true,
      p_file_name: 'huge.csv',
    });
    check('an enormous one is refused with a number', Boolean(tooBig.error), tooBig.error?.message);
  }

  console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
