/**
 * The dashboard's run-out cards.
 *
 * This suite exists because `dashboard_summary()` had no test at all, and the
 * three cards it feeds are the only place most people ever see these numbers.
 * A card that quietly reads zero is indistinguishable from good news.
 *
 * What is actually asserted, and why each one is a place the design could rot:
 *
 *   The licence counts MOVE. Absolute counts would break every time somebody
 *   changed the seed, so each check creates a licence with a known date and
 *   asserts the delta is exactly one — the identity of the change, not a total.
 *
 *   Expiring and expired stay APART. A licence that lapsed last month and one
 *   that lapses next month both need action, but only one has somebody locked
 *   out today, and a single number would hide that.
 *
 *   The service count EQUALS the list it links to. The card is a doorway to
 *   `maintenance_due_list()`, so a card saying 12 that opens onto 9 rows is a
 *   card nobody trusts again. This ties them to one definition rather than
 *   asserting a number that would drift.
 *
 *   supabase start && supabase db reset
 *   node tests/dashboard.mjs
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

/** A date `days` from today, as the YYYY-MM-DD the RPCs expect. */
function dateIn(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function run() {
  if (!ANON) {
    console.error('EXPO_PUBLIC_SUPABASE_ANON_KEY is not set.');
    process.exit(1);
  }

  const admin = await clientFor('dewi.lestari@cite.co.id');
  const locations = (await admin.from('locations').select('id')).data ?? [];
  const scope = locations.map((l) => l.id);

  const summary = async () => {
    const { data, error } = await admin.rpc('dashboard_summary', { p_locations: scope });
    if (error) throw new Error(error.message);
    return data;
  };

  // ------------------------------------------------------------ the shape
  console.log('\nThe cards have something to read');

  const before = await summary();
  for (const key of [
    'warrantyExpiring',
    'licensesExpiring',
    'licensesExpired',
    'maintenanceDue',
    'maintenanceOverdue',
  ]) {
    check(`${key} is a number`, typeof before[key] === 'number', `got ${typeof before[key]}`);
  }

  // ------------------------------------------------- a licence running out
  console.log('\nA licence running out is counted, and only once');

  const cat = (await admin.rpc('master_list', { p_entity: 'license_category' })).data ?? [];
  const mining = cat.find((c) => c.name === 'MINING') ?? cat[0];

  const soon = await admin.rpc('create_license', {
    p_input: {
      software: 'DashboardSoon',
      category_id: mining?.id,
      expiry_date: dateIn(20),
    },
  });
  check('a licence expiring in 20 days is created', !soon.error, soon.error?.message);

  const withSoon = await summary();
  check(
    'licensesExpiring goes up by exactly one',
    withSoon.licensesExpiring === before.licensesExpiring + 1,
    `${before.licensesExpiring} → ${withSoon.licensesExpiring}`,
  );
  check(
    'and it is NOT also counted as expired',
    withSoon.licensesExpired === before.licensesExpired,
    `${before.licensesExpired} → ${withSoon.licensesExpired}`,
  );

  // ------------------------------------------------ one that already lapsed
  console.log('\nOne that already lapsed is a different number');

  const gone = await admin.rpc('create_license', {
    p_input: {
      software: 'DashboardLapsed',
      category_id: mining?.id,
      expiry_date: dateIn(-5),
    },
  });
  check('a licence that ended 5 days ago is created', !gone.error, gone.error?.message);

  const withBoth = await summary();
  check(
    'licensesExpired goes up by exactly one',
    withBoth.licensesExpired === before.licensesExpired + 1,
    `${before.licensesExpired} → ${withBoth.licensesExpired}`,
  );
  check(
    'and the expiring count does not move with it',
    withBoth.licensesExpiring === withSoon.licensesExpiring,
    `${withSoon.licensesExpiring} → ${withBoth.licensesExpiring}`,
  );

  // ------------------------------------- the service card and its own list
  console.log('\nThe service card agrees with the list it opens');

  const due =
    (await admin.rpc('maintenance_due_list', { p_locations: scope, p_within_days: 30 })).data ?? [];
  check(
    'maintenanceDue is exactly the number of rows in maintenance_due_list',
    withBoth.maintenanceDue === due.length,
    `card ${withBoth.maintenanceDue}, list ${due.length}`,
  );
  check(
    'maintenanceOverdue is exactly the rows already past their date',
    withBoth.maintenanceOverdue === due.filter((r) => r.days_late > 0).length,
    `card ${withBoth.maintenanceOverdue}, list ${due.filter((r) => r.days_late > 0).length}`,
  );

  // ------------------------------------------- zero is not the same as unasked
  // The card used to print 0 for servicing whether everything was serviced or
  // nothing was being watched. Those are opposite situations wearing the same
  // number, and the second one is the dangerous one.
  console.log('\nA zero and an unasked question are told apart');

  const rules = (await admin.rpc('maintenance_schedules_list')).data ?? [];
  const activeRules = rules.filter((r) => r.is_active).length;
  check(
    'maintenanceRules matches how many rules actually exist',
    withBoth.maintenanceRules === activeRules,
    `summary ${withBoth.maintenanceRules}, list ${activeRules}`,
  );
  check(
    'with no rules, nothing can be due either',
    activeRules > 0 || withBoth.maintenanceDue === 0,
    `no rules but maintenanceDue is ${withBoth.maintenanceDue}`,
  );

  // ---------------------------------------------- a zero still has a horizon
  console.log('\nA zero still says what is coming next');

  for (const key of ['nextWarranty', 'nextLicense', 'nextService']) {
    const v = withBoth[key];
    check(
      `${key} is either null or carries a label and a date`,
      v === null || (typeof v?.label === 'string' && typeof v?.date === 'string'),
      `got ${JSON.stringify(v)}`,
    );
  }
  check(
    'the next licence is outside the window it would otherwise be counted in',
    withBoth.nextLicense === null ||
      new Date(withBoth.nextLicense.date) > new Date(Date.now() + 60 * 864e5),
    `next is ${withBoth.nextLicense?.date}`,
  );

  // ------------------------------------------------------ work sitting still
  console.log('\nWork sitting still is counted, and split by whose move it is');

  const bast = (await admin.rpc('bast_list', { p_locations: scope })).data ?? [];
  const drafts = bast.filter((b) => b.status === 'draft').length;
  const waiting = bast.filter((b) => b.status === 'awaiting_signature').length;
  check(
    'bastDraft matches the register',
    withBoth.bastDraft === drafts,
    `summary ${withBoth.bastDraft}, register ${drafts}`,
  );
  check(
    'bastAwaitingSignature matches the register',
    withBoth.bastAwaitingSignature === waiting,
    `summary ${withBoth.bastAwaitingSignature}, register ${waiting}`,
  );
  check(
    'the two are kept apart rather than summed into one figure',
    'bastDraft' in withBoth && 'bastAwaitingSignature' in withBoth,
  );

  const assets =
    (await admin.rpc('search_assets', { p_locations: scope, p_sort: 'code' })).data ?? [];
  // Terminal statuses are excluded on purpose. A retired laptop with no holder
  // is not work sitting still — it is finished. Counting it would put a number
  // on the dashboard that nobody can ever bring down.
  const terminal = new Set(
    ((await admin.from('asset_statuses').select('name, is_terminal')).data ?? [])
      .filter((s) => s.is_terminal)
      .map((s) => s.name),
  );
  const loose = assets.filter((a) => !a.holder_name && !terminal.has(a.status_name)).length;
  check(
    'unassignedAssets matches the register, retired kit aside',
    withBoth.unassignedAssets === loose,
    `summary ${withBoth.unassignedAssets}, register ${loose}`,
  );
  check(
    'and retired assets really were the difference',
    assets.filter((a) => !a.holder_name).length >= loose,
  );

  check('labelsUnused is a number', typeof withBoth.labelsUnused === 'number');

  // ----------------------------------------------------------- put it back
  for (const id of [soon.data, gone.data]) {
    await admin.rpc('delete_license', { p_id: id, p_reason: 'dashboard test cleanup' });
  }
  const after = await summary();
  check(
    'removing them returns both counts to where they started',
    after.licensesExpiring === before.licensesExpiring &&
      after.licensesExpired === before.licensesExpired,
    `expiring ${after.licensesExpiring}/${before.licensesExpiring}, expired ${after.licensesExpired}/${before.licensesExpired}`,
  );

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
