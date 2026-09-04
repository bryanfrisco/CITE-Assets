/**
 * Importing the real licence spreadsheet.
 *
 * Run against the actual converted file, not a fixture, because every hard part
 * of this importer came from something in that file:
 *
 *   Avenza has 28 seats and names nobody. Those seats have no account to be
 *   identified by, so the file is read as a COUNT and topped up to — which is
 *   the only reason re-importing does not create 28 more.
 *
 *   3DMine carries three different manager accounts across five seats. That is
 *   the evidence that the account belongs to the SEAT; a schema that hung it
 *   off the licence would silently keep one and lose two.
 *
 *   AutoCAD and Canva have no licence number at all. An earlier reading of this
 *   sheet filled those blanks from the row above and gave Canva the number
 *   belonging to Avenza. The regression check for that is explicit below.
 *
 * The file is gitignored — it contains five real passwords — so the suite skips
 * cleanly rather than failing when it is not there.
 *
 *   supabase start && supabase db reset
 *   npm run test:import-licenses
 */

import { existsSync, readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';

import { assertLocal } from './_guard.mjs';
import { loadTs } from './_ts.mjs';

const { LICENSE_IMPORT, parseImportCsv } = loadTs('src/lib/csv.ts');

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = 'cite-dev-2026';
const FILE = 'SOFTWARE LICENSING sta.csv';

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

async function main() {
  if (!existsSync(FILE)) {
    console.log(`\nSkipped: ${FILE} is not here (it is gitignored — it holds real passwords).`);
    console.log('Convert the spreadsheet first, then run this again.\n');
    process.exit(0);
  }

  const supabase = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await supabase.auth.signInWithPassword({
    email: 'dewi.lestari@cite.co.id',
    password: PASSWORD,
  });
  if (signIn.error) throw new Error(`Sign in failed: ${signIn.error.message}`);

  console.log('\nThe file parses with the app’s own parser');

  const parsed = parseImportCsv(readFileSync(FILE, 'utf8'), LICENSE_IMPORT);
  check(
    'no parse errors',
    (parsed.errors ?? []).length === 0,
    JSON.stringify(parsed.errors)?.slice(0, 200),
  );
  check('71 rows — one per seat', parsed.rows.length === 71, `got ${parsed.rows.length}`);

  console.log('\nA dry run reports what would happen without writing');

  const dry = await supabase.rpc('import_licenses', {
    p_rows: parsed.rows,
    p_dry_run: true,
    p_file_name: FILE,
  });
  check('the dry run succeeds', !dry.error, dry.error?.message);
  check('15 licences', dry.data?.created === 15, `got ${dry.data?.created}`);
  check('71 seats', dry.data?.seats === 71, `got ${dry.data?.seats}`);
  check(
    'nothing was skipped',
    dry.data?.skipped === 0,
    JSON.stringify(dry.data?.errors)?.slice(0, 200),
  );

  // The converter already splits Username/Password cells into two columns, so
  // the server's own splitter is a safety net for an unconverted file and does
  // not fire here. That the five passwords survived the trip is checked against
  // the imported data further down.

  const before = (await supabase.rpc('licenses_list', {})).data ?? [];
  check('and nothing was written', before.length === 0, `${before.length} licences already there`);

  console.log('\nThe real import');

  const run = await supabase.rpc('import_licenses', {
    p_rows: parsed.rows,
    p_dry_run: false,
    p_file_name: FILE,
  });
  check('it succeeds', !run.error, run.error?.message);

  const list = (await supabase.rpc('licenses_list', {})).data ?? [];
  check('15 licences are in the register', list.length === 15, `got ${list.length}`);

  const total = list.reduce((n, l) => n + l.total_seats, 0);
  check('71 seats in total', total === 71, `got ${total}`);

  const avenza = list.find((l) => l.software === 'Avenza');
  check('Avenza has 28 seats', avenza?.total_seats === 28, `got ${avenza?.total_seats}`);
  check('and none of them is in use', avenza?.used_seats === 0, `got ${avenza?.used_seats}`);

  const threeD = list.find((l) => l.software === '3DMine');
  const threeDDetail = (await supabase.rpc('license_detail', { p_id: threeD.id })).data;
  const accounts = new Set(
    threeDDetail.seats.map((s) => s.seat_account).filter((a) => a && a.length > 0),
  );
  check(
    '3DMine carries three different manager accounts',
    accounts.size === 3,
    `got ${accounts.size}: ${[...accounts].join(', ')}`,
  );

  console.log('\nBlank licence numbers stay blank — the bug that was found and fixed');

  const autocad = list.find((l) => l.software === 'AutoCAD');
  check('AutoCAD has no licence number', !autocad?.license_number, String(autocad?.license_number));

  const canva = list.find((l) => l.software === 'Canva');
  check('Canva has none either', !canva?.license_number, String(canva?.license_number));
  check(
    'and specifically not the one belonging to Avenza',
    canva?.license_number !== avenza?.license_number,
    `both are ${canva?.license_number}`,
  );

  console.log('\nThe five stored passwords are reachable only through the audited RPC');

  let withSecret = 0;
  for (const l of list) {
    const d = (await supabase.rpc('license_detail', { p_id: l.id })).data;
    withSecret += (d?.seats ?? []).filter((s) => s.has_secret).length;
  }
  check('five seats carry a password', withSecret === 5, `got ${withSecret}`);

  // The RPC would be decorative if the column were readable directly. It is
  // not granted, so PostgREST refuses the request at the database.
  const direct = await supabase.from('license_seats').select('seat_secret').limit(1);
  check(
    'selecting the column directly is refused',
    direct.error !== null,
    direct.error ? '' : `it returned ${JSON.stringify(direct.data)}`,
  );

  // `select *` expands to every column server-side, so a column grant that
  // withholds one refuses the whole request. Stricter than strictly needed,
  // and the right way round: the app reads seats through license_detail().
  const sneaky = await supabase.from('license_seats').select('*').limit(1);
  check(
    'and select(*) is refused rather than quietly trimmed',
    sneaky.error !== null,
    sneaky.error ? '' : JSON.stringify(Object.keys(sneaky.data?.[0] ?? {})),
  );

  const allowed = await supabase.from('license_seats').select('id, seat_account').limit(1);
  check(
    'while the columns that are granted still read fine',
    !allowed.error,
    allowed.error?.message,
  );

  console.log('\nDates, in the shape Excel writes them');

  const arcgis = list.find((l) => l.software === 'Arcgis creator');
  check(
    '46448 became 2027-03-02',
    arcgis?.expiry_date === '2027-03-02',
    String(arcgis?.expiry_date),
  );
  check(
    'a licence with "-" has no end date',
    threeD?.expiry_date === null,
    String(threeD?.expiry_date),
  );

  console.log('\nImporting the same file again changes nothing');

  const again = await supabase.rpc('import_licenses', {
    p_rows: parsed.rows,
    p_dry_run: false,
    p_file_name: FILE,
  });
  check('the second run succeeds', !again.error, again.error?.message);

  const list2 = (await supabase.rpc('licenses_list', {})).data ?? [];
  check('still 15 licences', list2.length === 15, `got ${list2.length}`);

  const total2 = list2.reduce((n, l) => n + l.total_seats, 0);
  check('still 71 seats — no duplicates', total2 === 71, `got ${total2}`);

  const avenza2 = list2.find((l) => l.software === 'Avenza');
  check('Avenza still has 28, not 56', avenza2?.total_seats === 28, `got ${avenza2?.total_seats}`);

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
