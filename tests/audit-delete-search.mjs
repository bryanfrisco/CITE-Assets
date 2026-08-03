/**
 * Audit log, asset deletion and the narrowed search — migration 0026.
 *
 * Three things asked for on 2026-08-03, and one property each that matters more
 * than the feature itself:
 *
 *   * the audit log is READ-ONLY and not scoped by location — it is the one
 *     place that sees everything, which is also why not everyone may open it;
 *   * deleting an asset is refused for anything with history behind it, because
 *     an assignment pointing at nothing is worse than a stale row;
 *   * the category narrows BEFORE the text search, so a name is only looked for
 *     inside the category that was picked.
 *
 *   supabase start && supabase db reset
 *   npm run test:audit
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

  const { data: locations } = await admin.from('locations').select('id, code');
  const HO = locations.find((l) => l.code === 'HO').id;
  const scope = locations.map((l) => l.id);

  const { data: categories } = await admin.from('categories').select('id, name');
  const { data: statuses } = await admin.from('asset_statuses').select('id, name');
  const { data: conditions } = await admin.from('asset_conditions').select('id, name');
  const available = statuses.find((s) => s.name === 'Available').id;
  const good = conditions.find((c) => c.name === 'Good').id;

  const stamp = Date.now();

  async function newAsset(label, categoryId) {
    const created = await admin.rpc('create_asset', {
      p_name: `Audit Test ${label}`,
      p_category: categoryId ?? categories[0].id,
      p_serial: `SN-AUD-${label}-${stamp}`,
      p_location: HO,
      p_status: available,
      p_condition: good,
    });
    if (created.error) throw new Error(`create_asset ${label}: ${created.error.message}`);
    return created.data;
  }

  console.log('\nThe audit log reads what the triggers have been writing');
  {
    const before = await admin.rpc('audit_stats');
    const asset = await newAsset('READ');

    const stats = await admin.rpc('audit_stats');
    check('the stats load', !stats.error, stats.error?.message);
    check(
      'creating an asset shows up in the count',
      (stats.data?.total ?? 0) > (before.data?.total ?? 0),
      `${before.data?.total} → ${stats.data?.total}`,
    );

    const log = await admin.rpc('audit_list', { p_limit: 20 });
    check('the log loads', !log.error, log.error?.message);

    const entry = (log.data ?? []).find((e) => e.record_id === asset.id);
    check('the new asset has an entry', Boolean(entry), JSON.stringify(log.data?.[0]));
    check('it names the action', entry?.action === 'asset_created', entry?.action);
    check(
      'it names the person, not just a uuid',
      entry?.actor_name === 'Dewi Lestari',
      entry?.actor_name,
    );
    check(
      'and it summarises what was touched',
      (entry?.summary ?? '').includes(asset.assetCode),
      entry?.summary,
    );

    const filtered = await admin.rpc('audit_list', { p_action: 'asset_created', p_limit: 20 });
    check(
      'the action filter returns only that action',
      (filtered.data ?? []).length > 0 &&
        (filtered.data ?? []).every((e) => e.action === 'asset_created'),
      JSON.stringify([...new Set((filtered.data ?? []).map((e) => e.action))]),
    );

    const searched = await admin.rpc('audit_list', { p_search: 'Dewi', p_limit: 20 });
    check(
      'the search matches on the actor',
      (searched.data ?? []).every((e) => (e.actor_label ?? '').includes('Dewi')),
      JSON.stringify((searched.data ?? []).slice(0, 2)),
    );

    const page1 = await admin.rpc('audit_list', { p_limit: 5, p_offset: 0 });
    const page2 = await admin.rpc('audit_list', { p_limit: 5, p_offset: 5 });
    check(
      'paging returns different rows',
      (page1.data ?? []).length > 0 &&
        (page2.data ?? []).length > 0 &&
        page1.data[0].id !== page2.data[0].id,
    );
  }

  console.log('\nThe log cannot be written, and not everyone may read it');
  {
    const direct = await admin.from('audit_log').insert({
      action: 'asset_created',
      table_name: 'assets',
      actor_label: 'forged',
    });
    check(
      'inserting an entry is refused',
      Boolean(direct.error),
      direct.error?.message ?? 'the insert succeeded',
    );

    const rows = await admin.from('audit_log').select('id').limit(1);
    const updated = await admin
      .from('audit_log')
      .update({ actor_label: 'someone else' })
      .eq('id', rows.data[0].id);
    check('update is refused', Boolean(updated.error), updated.error?.message ?? 'it updated');

    const deleted = await admin.from('audit_log').delete().eq('id', rows.data[0].id);
    check('delete is refused', Boolean(deleted.error), deleted.error?.message ?? 'it deleted');

    const siteIt = await clientFor('siti.rahayu@cite.co.id');
    const theirs = await siteIt.rpc('audit_list', { p_limit: 5 });
    check('Site IT cannot open it', Boolean(theirs.error), theirs.error?.message ?? 'it opened');
  }

  console.log('\nDeleting an asset is for mistakes, not for history');
  {
    const fresh = await newAsset('FRESH');

    const noReason = await admin.rpc('delete_asset', { p_asset: fresh.id, p_reason: '  ' });
    check('a reason is required', Boolean(noReason.error), noReason.error?.message);

    const viewer = await clientFor('andi.prasetyo@cite.co.id');
    const byViewer = await viewer.rpc('delete_asset', {
      p_asset: fresh.id,
      p_reason: 'not my call',
    });
    check('a Viewer cannot', Boolean(byViewer.error), byViewer.error?.message);

    const deleted = await admin.rpc('delete_asset', {
      p_asset: fresh.id,
      p_reason: 'Entered twice by mistake',
    });
    check('a fresh mistake can be deleted', !deleted.error, deleted.error?.message);
    check('and it reports which one', deleted.data?.assetCode === fresh.assetCode);

    const gone = await admin.from('assets').select('id').eq('id', fresh.id);
    check('the row really went', (gone.data ?? []).length === 0);

    // The reason has to outlive the row it was about.
    const log = await admin.rpc('audit_list', { p_search: fresh.assetCode, p_limit: 5 });
    check(
      'the deletion and its reason are in the log',
      (log.data ?? []).some((e) => (e.target_label ?? '').includes('Entered twice by mistake')),
      JSON.stringify(log.data?.map((e) => e.target_label)),
    );

    const used = await newAsset('USED');
    const { data: employees } = await admin.rpc('assignable_employees', { p_locations: [HO] });
    await admin.rpc('assign_asset', {
      p_asset: used.id,
      p_account: employees[0].id,
      p_location: HO,
      p_date: new Date().toISOString().slice(0, 10),
      p_auto_bast: false,
    });

    const refused = await admin.rpc('delete_asset', {
      p_asset: used.id,
      p_reason: 'trying anyway',
    });
    check(
      'an asset with an assignment is refused',
      Boolean(refused.error),
      refused.error?.message ?? 'it deleted',
    );
    check(
      'and the message says what is holding it',
      (refused.error?.message ?? '').includes('an assignment'),
      refused.error?.message,
    );
    check(
      'and points at retiring instead',
      (refused.error?.message ?? '').includes('Retire it instead'),
      refused.error?.message,
    );
  }

  console.log('\nCategory narrows first, then the name is searched inside it');
  {
    const laptop = categories.find((c) => c.name === 'Laptop') ?? categories[0];
    const other = categories.find((c) => c.id !== laptop.id) ?? categories[1];

    const inLaptop = await newAsset('SHARED-A', laptop.id);
    const inOther = await newAsset('SHARED-B', other.id);

    // Both are named "Audit Test SHARED-…", so a search for SHARED matches both
    // unless the category has already narrowed the field.
    const everywhere = await admin.rpc('search_assets', {
      p_locations: scope,
      p_query: 'SHARED',
      p_status: null,
      p_category: null,
      p_sort: 'code',
    });
    check(
      'without a category, both are found',
      (everywhere.data ?? []).some((a) => a.id === inLaptop.id) &&
        (everywhere.data ?? []).some((a) => a.id === inOther.id),
      JSON.stringify((everywhere.data ?? []).map((a) => a.name)),
    );

    const narrowed = await admin.rpc('search_assets', {
      p_locations: scope,
      p_query: 'SHARED',
      p_status: null,
      p_category: laptop.id,
      p_sort: 'code',
    });
    check(
      'with a category, only that category is searched',
      (narrowed.data ?? []).some((a) => a.id === inLaptop.id) &&
        !(narrowed.data ?? []).some((a) => a.id === inOther.id),
      JSON.stringify((narrowed.data ?? []).map((a) => `${a.name}:${a.category_name}`)),
    );
    check(
      'and every row really is in it',
      (narrowed.data ?? []).every((a) => a.category_name === laptop.name),
    );

    const byName = await admin.rpc('search_assets', {
      p_locations: scope,
      p_query: null,
      p_status: null,
      p_category: null,
      p_sort: 'name',
    });
    const names = (byName.data ?? []).map((a) => a.name);
    check(
      'sorting by name really sorts by name',
      names.every((n, i) => i === 0 || names[i - 1].localeCompare(n) <= 0),
      JSON.stringify(names.slice(0, 4)),
    );

    const byCode = await admin.rpc('search_assets', {
      p_locations: scope,
      p_query: null,
      p_status: null,
      p_category: null,
      p_sort: 'code',
    });
    const codes = (byCode.data ?? []).map((a) => a.asset_code);
    check(
      'and the default sorts by asset code',
      codes.every((c, i) => i === 0 || codes[i - 1] <= c),
      JSON.stringify(codes.slice(0, 4)),
    );

    // The sort reaches a CASE whitelist, not an interpolated ORDER BY. A value
    // nobody offers must fall through rather than reach the planner.
    const injection = ['x', 'drop table assets', '--'].join('; ');
    const nonsense = await admin.rpc('search_assets', {
      p_locations: scope,
      p_query: null,
      p_status: null,
      p_category: null,
      p_sort: injection,
    });
    check(
      'an unknown sort falls back instead of failing',
      !nonsense.error && (nonsense.data ?? []).length > 0,
      nonsense.error?.message,
    );
    const stillThere = await admin.from('assets').select('id').limit(1);
    check('and the table is still there', (stillThere.data ?? []).length === 1);
  }

  console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
