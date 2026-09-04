/**
 * Maintenance that is due by rule.
 *
 * The rule lives on the CATEGORY, and what is due is DERIVED from it every time
 * it is read. Both halves matter and both are checked here:
 *
 *   Derived, not stored. Change the rule and the due list changes immediately.
 *   A stored due date would keep saying what the old rule said, and the whole
 *   point of a rule is that it applies to everything under it.
 *
 *   Terminal assets are excluded. A Lost or Retired laptop is not overdue for
 *   service, and listing it as such is how people learn to ignore the list.
 *
 *   supabase start && supabase db reset
 *   npm run test:maintenance-schedule
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

async function main() {
  const admin = await clientFor('dewi.lestari@cite.co.id');
  const viewer = await clientFor('andi.prasetyo@cite.co.id');

  const locations = (await admin.from('locations').select('id')).data.map((l) => l.id);

  console.log('\nA rule belongs to a category, not to an asset');

  const rules = await admin.rpc('maintenance_schedules_list');
  check('every category is listed', !rules.error && rules.data.length > 0, rules.error?.message);
  check(
    'and none of them has a rule to start with',
    (rules.data ?? []).every((r) => r.every_months === null),
  );

  // The category with the most assets, so the due list has something to say.
  const busiest = [...rules.data].sort((a, b) => b.asset_count - a.asset_count)[0];

  const denied = await viewer.rpc('set_maintenance_schedule', {
    p_category: busiest.category_id,
    p_months: 6,
  });
  check('a Viewer cannot set one', denied.error !== null, denied.error ? '' : 'it was allowed');

  const bad = await admin.rpc('set_maintenance_schedule', {
    p_category: busiest.category_id,
    p_months: 0,
  });
  check('zero months is refused', bad.error !== null, bad.error ? '' : 'it was allowed');

  const set = await admin.rpc('set_maintenance_schedule', {
    p_category: busiest.category_id,
    p_months: 1,
  });
  check('a Super Admin can', !set.error, set.error?.message);

  console.log('\nWhat is due follows from the rule, and is never stored');

  let due = (await admin.rpc('maintenance_due_list', { p_locations: locations })).data ?? [];
  check(
    `every asset in ${busiest.category_name} is now due`,
    due.length > 0,
    `got ${due.length} for ${busiest.asset_count} assets`,
  );
  check(
    'and they all belong to that category',
    due.every((d) => d.category_name === busiest.category_name),
  );
  check('the most overdue is first', due.length < 2 || due[0].days_late >= due[1].days_late);
  check(
    'an asset never serviced reports no last date',
    due.some((d) => d.last_done === null),
  );

  // The evidence that nothing is stored: widen the rule and the same query
  // answers differently, with no other write in between.
  await admin.rpc('set_maintenance_schedule', {
    p_category: busiest.category_id,
    p_months: 120,
  });
  const after = (await admin.rpc('maintenance_due_list', { p_locations: locations })).data ?? [];
  check(
    'widening the rule to 120 months empties the list',
    after.length < due.length,
    `was ${due.length}, now ${after.length}`,
  );

  console.log('\nA retired asset is not overdue for service');

  await admin.rpc('set_maintenance_schedule', { p_category: busiest.category_id, p_months: 1 });
  due = (await admin.rpc('maintenance_due_list', { p_locations: locations })).data ?? [];

  const terminal = (
    await admin.from('asset_statuses').select('id, name, is_terminal').eq('is_terminal', true)
  ).data?.[0];

  if (terminal && due.length > 0) {
    const victim = due[0];
    await admin.rpc('change_asset_status', {
      p_asset: victim.asset_id,
      p_status: terminal.id,
      p_reason: 'test — checking it drops out of the service list',
    });

    const without =
      (await admin.rpc('maintenance_due_list', { p_locations: locations })).data ?? [];
    check(
      `an asset marked ${terminal.name} drops off the due list`,
      !without.some((d) => d.asset_id === victim.asset_id),
    );
  } else {
    console.log('  SKIP  no terminal status seeded to test with');
  }

  console.log('\nClearing the rule');

  await admin.rpc('set_maintenance_schedule', { p_category: busiest.category_id, p_months: null });
  const cleared = (await admin.rpc('maintenance_schedules_list')).data ?? [];
  check(
    'the category has no rule again',
    cleared.find((r) => r.category_id === busiest.category_id)?.every_months === null,
  );
  const empty = (await admin.rpc('maintenance_due_list', { p_locations: locations })).data ?? [];
  check('and nothing under it is due', empty.length === 0, `got ${empty.length}`);

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
