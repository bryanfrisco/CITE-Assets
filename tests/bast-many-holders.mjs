/**
 * A document addressed to three or four people.
 *
 * `bast-two-holders.mjs` covers the pair. This one covers what the pair-shaped
 * schema could not express, and the rule that broke when it was generalised:
 *
 *   COMPLETENESS. sign_bast() used to name two roles and check the second only
 *   when secondary_account_id was set. With three holders that rule calls the
 *   document finished while somebody has not signed — and `complete` is what
 *   tells the client to render the final PDF and lock the record, so getting it
 *   wrong issues evidence of a handover that did not fully happen. Every
 *   assertion about `complete` below exists because of that.
 *
 *   supabase start && supabase db reset
 *   npm run test:many-holders
 */

import { createClient } from '@supabase/supabase-js';

import { assertLocal } from './_guard.mjs';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = 'cite-dev-2026';

/** The same scribble the two-holder suite uses — long enough to validate. */
const STROKES = [
  Array.from({ length: 40 }, (_, i) => [0.05 + i * 0.02, 0.5 + Math.sin(i / 3) * 0.25]),
];

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

  const locations = (await admin.from('locations').select('id')).data.map((l) => l.id);
  const people = (await admin.rpc('accounts_list', { p_search: null })).data.filter(
    (p) => p.full_name,
  );
  const free = (await admin.rpc('assignable_assets', { p_locations: locations })).data ?? [];

  if (free.length === 0 || people.length < 4) {
    console.log('\nSkipped: needs a free asset and four accounts in the seed.\n');
    process.exit(0);
  }

  const asset = free[0];
  const [first, second, third, fourth] = people;

  console.log('\nThree people, one document');

  const assigned = await admin.rpc('assign_asset', {
    p_asset: asset.id,
    p_account: first.id,
    p_location: locations[0],
    p_date: new Date().toISOString().slice(0, 10),
    p_auto_bast: true,
  });
  check('the asset is assigned', !assigned.error, assigned.error?.message);

  const tooMany = await admin.rpc('set_asset_holders', {
    p_asset: asset.id,
    p_accounts: [second.id, third.id, fourth.id, first.id],
  });
  check('more than four holders is refused', tooMany.error !== null);

  const dupe = await admin.rpc('set_asset_holders', {
    p_asset: asset.id,
    p_accounts: [second.id, second.id],
  });
  check(
    'the same person twice is refused',
    dupe.error !== null,
    dupe.error ? '' : 'it was allowed',
  );

  const set = await admin.rpc('set_asset_holders', {
    p_asset: asset.id,
    p_accounts: [second.id, third.id],
  });
  check('two extra holders are accepted', !set.error, set.error?.message);
  check('and both names come back', (set.data?.holderNames ?? []).length === 2);

  const bastId = (
    await admin
      .from('bast')
      .select('id')
      .eq('asset_id', asset.id)
      .neq('status', 'signed')
      .order('created_at', { ascending: false })
      .limit(1)
  ).data?.[0]?.id;

  const detail = (await admin.rpc('bast_detail', { p_id: bastId })).data;
  const holders = detail?.holders ?? [];

  check('the document lists three holders', holders.length === 3, `got ${holders.length}`);
  check(
    'in position order, first holder first',
    holders.map((h) => h.position).join(',') === '1,2,3',
    holders.map((h) => h.position).join(','),
  );
  check(
    'each with the signature role for its position',
    holders.map((h) => h.role).join(',') === 'receiver,receiver_2,receiver_3',
    holders.map((h) => h.role).join(','),
  );
  check(
    'and each carries its own NIK and job title',
    holders.every((h) => 'nik' in h && 'title' in h),
  );

  console.log('\nIt is not finished until all three have signed');

  const sign = (role, name) =>
    admin.rpc('sign_bast', {
      p_bast: bastId,
      p_role: role,
      p_name: name,
      p_title: 'Operator',
      p_strokes: STROKES,
    });

  const afterHandover = await sign('handover', 'Rizky Hidayat');
  check('handover alone does not complete it', afterHandover.data?.complete === false);

  const afterFirst = await sign('receiver', holders[0].name);
  check('nor does the first receiver', afterFirst.data?.complete === false);

  const afterSecond = await sign('receiver_2', holders[1].name);
  check(
    'nor the second — this is the bug the old rule had',
    afterSecond.data?.complete === false,
    `complete came back ${afterSecond.data?.complete}`,
  );

  const afterThird = await sign('receiver_3', holders[2].name);
  check('the third one completes it', afterThird.data?.complete === true);

  console.log('\nEach signature is stored under its own name');

  const signed = (await admin.rpc('bast_detail', { p_id: bastId })).data;
  const names = ['receiver', 'receiver_2', 'receiver_3'].map(
    (r) => signed.signatures?.[r]?.signerName,
  );
  check(
    'three different names, not the first one repeated',
    new Set(names).size === 3,
    names.join(' | '),
  );
  check(
    'and each matches the holder at that position',
    names.every((n, i) => n === holders[i].name),
    `${names.join(' | ')} vs ${holders.map((h) => h.name).join(' | ')}`,
  );

  console.log('\nThe register finds it by any of the three');

  for (const holder of holders) {
    const hit = (await admin.rpc('search_assets', { p_locations: locations, p_query: holder.name }))
      .data;
    check(
      `by ${holder.name}`,
      (hit ?? []).some((row) => row.asset_code === asset.asset_code),
    );
  }

  const listed = (
    await admin.rpc('bast_list', {
      p_locations: locations,
      p_kind: null,
      p_search: holders[2].name,
    })
  ).data;
  check(
    'and the e-BAST register finds it by the third holder',
    (listed ?? []).some((row) => row.id === bastId),
  );
  check(
    'whose row names every holder',
    (listed ?? [])[0]?.holder_label?.includes(holders[1].name) ?? false,
    (listed ?? [])[0]?.holder_label,
  );

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
