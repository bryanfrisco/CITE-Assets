/**
 * Reports and export — migration 0025 (Phase 7).
 *
 * The risk with an export is not that it is wrong; it is that it contains a row
 * the person could never have seen on screen, and then keeps being readable
 * long after anyone remembers who could see what. So the assertions here are
 * mostly about SCOPE, and about the summary agreeing with the rows beneath it.
 *
 *   supabase start && supabase db reset
 *   npm run test:reports
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
  const { data: locations } = await admin.from('locations').select('id, code, name');
  const HO = locations.find((l) => l.code === 'HO');
  const SITE = locations.find((l) => l.code === 'SITE');
  const scope = locations.map((l) => l.id);

  console.log('\nThe report and its summary agree');
  {
    const rows = await admin.rpc('asset_report', { p_locations: scope });
    check('the report loads', !rows.error, rows.error?.message);
    check('it returns something', (rows.data ?? []).length > 0, String(rows.data?.length));

    const summary = await admin.rpc('report_summary', { p_locations: scope });
    check('the summary loads', !summary.error, summary.error?.message);
    check(
      'the total matches the number of rows',
      summary.data?.total === (rows.data ?? []).length,
      `${summary.data?.total} vs ${rows.data?.length}`,
    );

    const byStatus = Object.values(summary.data?.byStatus ?? {}).reduce((a, b) => a + b, 0);
    check(
      'and the status breakdown adds up to the same number',
      byStatus === summary.data?.total,
      `${byStatus} vs ${summary.data?.total}`,
    );

    const first = (rows.data ?? [])[0];
    check(
      'every row carries the columns a report needs, not just the list ones',
      first !== undefined &&
        'purchase_price' in first &&
        'warranty_days_left' in first &&
        'holder_nik' in first &&
        'notes' in first,
      JSON.stringify(Object.keys(first ?? {})),
    );
  }

  console.log('\nFilters narrow it, and only it');
  {
    const { data: statuses } = await admin.from('asset_statuses').select('id, name');
    const available = statuses.find((s) => s.name === 'Available').id;

    const filtered = await admin.rpc('asset_report', {
      p_locations: scope,
      p_status: available,
    });
    check(
      'a status filter returns only that status',
      (filtered.data ?? []).length > 0 &&
        (filtered.data ?? []).every((r) => r.status_name === 'Available'),
      JSON.stringify([...new Set((filtered.data ?? []).map((r) => r.status_name))]),
    );

    const hoOnly = await admin.rpc('asset_report', { p_locations: [HO.id] });
    check(
      'a location scope returns only that location',
      (hoOnly.data ?? []).every((r) => r.location_name === HO.name),
      JSON.stringify([...new Set((hoOnly.data ?? []).map((r) => r.location_name))]),
    );

    const impossible = await admin.rpc('asset_report', {
      p_locations: scope,
      p_from: '2099-01-01',
    });
    check(
      'a window with nothing in it returns nothing, not an error',
      !impossible.error && (impossible.data ?? []).length === 0,
      impossible.error?.message,
    );
  }

  console.log('\nAn export cannot contain what you could not see');
  {
    // siti.rahayu is site_it scoped to Head Office (supabase/seed.sql:24), so
    // asking for Site is asking for something RLS must not hand over.
    const scoped = await clientFor('siti.rahayu@cite.co.id');
    const overreach = await scoped.rpc('asset_report', { p_locations: [SITE.id] });
    check(
      'asking for another location returns nothing',
      (overreach.data ?? []).length === 0,
      JSON.stringify((overreach.data ?? []).map((r) => r.location_name)),
    );

    const everything = await scoped.rpc('asset_report', { p_locations: scope });
    check(
      'and asking for everything still only returns your own',
      (everything.data ?? []).every((r) => r.location_name === HO.name),
      JSON.stringify([...new Set((everything.data ?? []).map((r) => r.location_name))]),
    );

    const summary = await scoped.rpc('report_summary', { p_locations: scope });
    check(
      'the summary is scoped the same way',
      Object.keys(summary.data?.byLocation ?? {}).every((name) => name === HO.name),
      JSON.stringify(summary.data?.byLocation),
    );

    // A Viewer may read, which is the point of the role — they just cannot
    // change anything. An export they can produce is not a leak.
    const viewer = await clientFor('andi.prasetyo@cite.co.id');
    const byViewer = await viewer.rpc('asset_report', { p_locations: scope });
    check('a Viewer can still run a report', !byViewer.error, byViewer.error?.message);
  }

  console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
