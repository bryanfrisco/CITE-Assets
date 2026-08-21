/**
 * Value analytics and holdings.
 *
 * The figure that matters is the total, and the reason this suite exists is
 * that it used to be wrong by omission: Reports counted assets only, so 500
 * mice at 85,000 each simply were not there. A total that silently leaves
 * money out is worse than no total, because it looks complete.
 *
 * Accessories are valued at unit price × quantity OWNED, not quantity on the
 * shelf. Handing one out does not make the company poorer.
 *
 *   supabase start && supabase db reset
 *   npm run test:analytics
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

  const locations = (await admin.from('locations').select('id, code, name')).data ?? [];
  const ho = locations.find((l) => l.code === 'HO');
  const scope = locations.map((l) => l.id);
  const accCat = (await admin.from('categories').select('id').eq('code', 'ACC').single()).data;
  const today = new Date().toISOString().slice(0, 10);

  const analytics = async (extra = {}) =>
    (await admin.rpc('value_analytics', { p_locations: scope, ...extra })).data;

  const before = await analytics();

  console.log('\nAccessories are counted in the value');
  {
    await admin.rpc('create_accessory', {
      p_input: {
        name: `Mouse for value ${Date.now()}`,
        categoryId: accCat.id,
        locationId: ho.id,
        totalQty: 100,
        purchasePrice: '85000',
        purchaseDate: today,
      },
    });

    const after = await analytics();
    const added = Number(after.accessories.value) - Number(before.accessories.value);
    check('100 × 85,000 lands in the accessory value', added === 8500000, String(added));
    check(
      'the asset value is untouched by it',
      Number(after.assets.value) === Number(before.assets.value),
      `${before.assets.value} then ${after.assets.value}`,
    );
    check(
      'the quantity owned is reported too',
      Number(after.accessories.qty) - Number(before.accessories.qty) === 100,
      String(after.accessories.qty),
    );
  }

  console.log('\nHanding stock out does not change what it is worth');
  {
    const acc = (await admin.rpc('accessories_list', { p_locations: scope })).data.find((x) =>
      /Mouse for value/.test(x.name),
    );
    const person = (await admin.rpc('assignable_employees', { p_locations: scope })).data[0];

    const was = await analytics();
    await admin.rpc('assign_accessory', {
      p_accessory: acc.id,
      p_account: person.id,
      p_qty: 10,
    });
    const now = await analytics();

    check(
      'the value is the same after ten go out',
      Number(now.accessories.value) === Number(was.accessories.value),
      `${was.accessories.value} then ${now.accessories.value}`,
    );

    console.log('\nHoldings');
    const held = (await admin.rpc('account_holdings', { p_account: person.id })).data;
    check(
      'the ten appear against that person',
      held.accessories.some((h) => h.qty === 10 && /Mouse for value/.test(h.name)),
      JSON.stringify(held.accessories.slice(0, 2)),
    );

    // Give them an asset too, then check both kinds come back.
    const asset = (
      await admin.rpc('create_asset', {
        p_name: 'Laptop for holdings',
        p_category: (await admin.from('categories').select('id').eq('code', 'LPT').single()).data
          .id,
        p_serial: `HOLD-${Date.now()}`,
        p_location: ho.id,
        p_status: (await admin.from('asset_statuses').select('id').eq('name', 'Available').single())
          .data.id,
        p_condition: (await admin.from('asset_conditions').select('id').eq('name', 'Good').single())
          .data.id,
      })
    ).data;
    const assetCode = asset.assetCode;
    await admin.rpc('assign_asset', {
      p_asset: asset.id,
      p_account: person.id,
      p_location: ho.id,
      p_date: today,
      p_auto_bast: false,
    });

    const both = (await admin.rpc('account_holdings', { p_account: person.id })).data;
    check(
      'and so does the laptop',
      both.assets.some((h) => h.assetCode === assetCode),
      JSON.stringify(both.assets),
    );
    check(
      '...marked as the first holder',
      both.assets.find((h) => h.assetCode === assetCode)?.role === 'primary',
    );

    // The other shift sees the same radio, marked differently.
    const people = (await admin.rpc('assignable_employees', { p_locations: scope })).data;
    const second = people.find((x) => x.id !== person.id);
    await admin.rpc('set_secondary_holder', { p_asset: asset.id, p_account: second.id });

    const theirs = (await admin.rpc('account_holdings', { p_account: second.id })).data;
    check(
      'the second holder sees it too',
      theirs.assets.some((h) => h.assetCode === assetCode),
      JSON.stringify(theirs.assets),
    );
    check(
      '...marked as the second holder',
      theirs.assets.find((h) => h.assetCode === assetCode)?.role === 'secondary',
    );

    // Returning empties the list again.
    await admin.rpc('return_asset', {
      p_asset: asset.id,
      p_date: today,
      p_condition: (await admin.from('asset_conditions').select('id').eq('name', 'Good').single())
        .data.id,
      p_auto_bast: false,
    });
    const afterReturn = (await admin.rpc('account_holdings', { p_account: second.id })).data;
    check(
      'and a returned asset leaves both lists',
      !afterReturn.assets.some((h) => h.assetCode === assetCode),
    );
  }

  console.log('\nBreakdowns');
  {
    const a = await analytics();
    check(
      'assets break down by category, location and department',
      Array.isArray(a.assets.byCategory) &&
        Array.isArray(a.assets.byLocation) &&
        Array.isArray(a.assets.byDepartment),
    );
    check(
      'accessories break down by category and location',
      Array.isArray(a.accessories.byCategory) && Array.isArray(a.accessories.byLocation),
    );

    const narrowed = await analytics({ p_category: accCat.id });
    check(
      'a category filter narrows both sides',
      narrowed.assets.count <= a.assets.count &&
        Number(narrowed.accessories.value) <= Number(a.accessories.value),
    );
  }

  console.log('\nScope is not a suggestion');
  {
    const siteIt = await clientFor('siti.rahayu@cite.co.id');
    const theirs = (await siteIt.rpc('value_analytics', { p_locations: scope })).data;
    const all = await analytics();
    check(
      'a scoped user sees no more than an admin',
      Number(theirs.assets.value) <= Number(all.assets.value) &&
        Number(theirs.accessories.value) <= Number(all.accessories.value),
      `${theirs.assets.value}/${all.assets.value}`,
    );
  }

  console.log(failures === 0 ? '\nAll good.\n' : `\n${failures} failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
