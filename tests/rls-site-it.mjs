/**
 * RLS verification — IMPLEMENTATION_PLAN.md § Phase 1, "Done when":
 *
 *   "a Site IT user's asset list is location-limited *by RLS* (verify by
 *    querying with their token, not just by hiding UI)."
 *
 * This queries `assets` with a real signed-in token, so hiding things in the UI
 * cannot make it pass. Run against a local stack:
 *
 *   supabase start && supabase db reset
 *   npm run test:rls
 *
 * Seeded fixtures (supabase/seed.sql):
 *   Dewi Lestari  — super_admin, sees all 7 assets
 *   Siti Rahayu   — site_it at Head Office, must see only the 4 HO assets
 *   Andi Prasetyo — viewer at Head Office, reads only, writes must fail
 */

import { createClient } from '@supabase/supabase-js';

import { assertLocal } from './_guard.mjs';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = 'cite-dev-2026';

assertLocal(URL);

const HO_CODES = ['LPT045-24-118', 'MON122-24-205', 'SRV003-21-014', 'LPT099-21-004'];
const SITE_CODES = ['LPT012-23-076', 'PRN008-22-031', 'NET031-23-090'];

const SEEDED_ALL = [...HO_CODES, ...SITE_CODES];
const has = (rows, codes) =>
  codes.every((c) => (rows ?? []).some((r) => (r.asset_code ?? r) === c));

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
    console.error(
      'EXPO_PUBLIC_SUPABASE_ANON_KEY is not set. Run `supabase start` and copy the anon key into .env.',
    );
    process.exit(1);
  }

  console.log('\nSuper Admin — Dewi Lestari');
  {
    const db = await clientFor('dewi.lestari@cite.co.id');
    const { data, error } = await db.from('assets').select('asset_code');
    check('reads assets without error', !error, error?.message);
    const codes = (data ?? []).map((r) => r.asset_code).sort();
    check('sees every seeded asset, both locations', has(codes, SEEDED_ALL), codes.join(', '));

    const { data: session } = await db.rpc('bootstrap_session');
    check('bootstrap_session returns an account', Boolean(session?.account));
    check('role is super_admin', session?.account?.role === 'super_admin', session?.account?.role);
    check('allowed locations = 2', (session?.allowedLocations ?? []).length === 2);
  }

  console.log('\nScope persistence — account_scope_preferences');
  {
    const db = await clientFor('dewi.lestari@cite.co.id');
    const { data: locations } = await db.from('locations').select('id, code');
    const ho = locations.find((l) => l.code === 'HO');

    // Narrow the scope to Head Office only, through the RPC the header uses.
    const { data: kept } = await db.rpc('set_account_scope', { p_locations: [ho.id] });
    check('set_account_scope keeps the single chosen location', (kept ?? []).length === 1);

    // A brand-new session must come back with the stored scope, not the default.
    const fresh = await clientFor('dewi.lestari@cite.co.id');
    const { data: session } = await fresh.rpc('bootstrap_session');
    check(
      'a new session restores the persisted scope',
      (session?.scope ?? []).length === 1 && session.scope[0] === ho.id,
      JSON.stringify(session?.scope),
    );
    check(
      'allowed locations stay wider than the chosen scope',
      (session?.allowedLocations ?? []).length === 2,
    );

    // Restore both locations so re-runs start from the seeded state.
    await db.rpc('set_account_scope', { p_locations: locations.map((l) => l.id) });
    const { data: restored } = await db.rpc('bootstrap_session');
    check('scope can be widened again', (restored?.scope ?? []).length === 2);
  }

  console.log('\nSite IT — Siti Rahayu (Head Office)');
  {
    const db = await clientFor('siti.rahayu@cite.co.id');
    const { data, error } = await db.from('assets').select('asset_code, location_id');
    check('reads assets without error', !error, error?.message);

    const { data: locs } = await db.from('locations').select('id, code');
    const hoId = locs.find((l) => l.code === 'HO').id;
    const codes = (data ?? []).map((r) => r.asset_code).sort();

    // Stated by LOCATION rather than by a list of seeded codes: the claim is
    // "Site IT sees its own location and nothing else", which must stay true
    // however many assets the register grows to.
    check(
      'every visible asset is at Head Office',
      (data ?? []).length > 0 && (data ?? []).every((r) => r.location_id === hoId),
      codes.join(', '),
    );
    check('all the seeded Head Office assets are visible', has(codes, HO_CODES), codes.join(', '));
    check(
      'no Site asset leaks through',
      !SITE_CODES.some((c) => codes.includes(c)),
      codes.join(', '),
    );

    // Selecting a Site asset by code returns nothing — RLS, not a filter.
    const { data: siteRow } = await db
      .from('assets')
      .select('asset_code')
      .eq('asset_code', 'NET031-23-090');
    check('cannot read a Site asset by code', (siteRow ?? []).length === 0);

    const { data: session } = await db.rpc('bootstrap_session');
    check('allowed locations = 1', (session?.allowedLocations ?? []).length === 1);

    // Scope cannot be widened past what RLS allows.
    const { data: allLocations } = await db.from('locations').select('id');
    const widened = await db.rpc('set_account_scope', {
      p_locations: (allLocations ?? []).map((l) => l.id),
    });
    check(
      'set_account_scope clamps scope to the allowed location',
      (widened.data ?? []).length === 1,
      `kept ${(widened.data ?? []).length}`,
    );
  }

  console.log('\nViewer — Andi Prasetyo');
  {
    const db = await clientFor('andi.prasetyo@cite.co.id');
    const { data, error } = await db.from('assets').select('asset_code, location_id');
    check('reads assets without error', !error, error?.message);

    const { data: locs } = await db.from('locations').select('id, code');
    const hoId = locs.find((l) => l.code === 'HO').id;
    check(
      'a Viewer also sees only its own location',
      (data ?? []).length > 0 && (data ?? []).every((r) => r.location_id === hoId),
      (data ?? []).map((r) => r.asset_code).join(', '),
    );

    // A Viewer has no write policy on assets, so the update must affect nothing.
    const { data: updated } = await db
      .from('assets')
      .update({ notes: 'viewer tried to write' })
      .eq('asset_code', 'MON122-24-205')
      .select('asset_code');
    check('cannot update an asset', (updated ?? []).length === 0);

    // The audit log is admin-only.
    const { data: audit } = await db.from('audit_log').select('id').limit(1);
    check('cannot read the audit log', (audit ?? []).length === 0);
  }

  console.log('\nAppend-only tables');
  {
    const db = await clientFor('dewi.lestari@cite.co.id');

    const { error: moveErr } = await db.from('movements').delete().eq('reason', 'project rollout');
    check('movements reject delete even for Super Admin', Boolean(moveErr), 'delete succeeded');

    const { error: auditErr } = await db.from('audit_log').delete().gt('id', 0);
    check('audit_log rejects delete', Boolean(auditErr), 'delete succeeded');
  }

  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
