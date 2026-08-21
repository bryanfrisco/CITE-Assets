/**
 * Two holders on one asset — the shared handy-talkie.
 *
 * One radio, two people on opposite shifts, both answerable. The document is
 * raised once for the pair and both sign it; shift changes are not recorded,
 * because two assign-and-return cycles a day would bury the asset's real
 * history under routine.
 *
 * The load-bearing assertion is the one about `complete`. If it returns true
 * after only the first recipient signs, the client finalises the PDF and locks
 * the status while one of the two people answerable for the radio has put
 * nothing on it. Everything else here is cheaper to get wrong.
 *
 *   supabase start && supabase db reset
 *   npm run test:two-holders
 */

import { createClient } from '@supabase/supabase-js';

import { assertLocal } from './_guard.mjs';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = 'cite-dev-2026';
// validate_signature_strokes() wants at least 12 points; three would be a
// stray tap, not a signature.
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

async function run() {
  if (!ANON) {
    console.error('EXPO_PUBLIC_SUPABASE_ANON_KEY is not set.');
    process.exit(1);
  }

  const admin = await clientFor('dewi.lestari@cite.co.id');

  const locations = (await admin.from('locations').select('id, code, name')).data ?? [];
  const ho = locations.find((l) => l.code === 'HO');
  const scope = locations.map((l) => l.id);
  const today = new Date().toISOString().slice(0, 10);

  const people = (await admin.rpc('assignable_employees', { p_locations: scope })).data ?? [];
  const [shiftA, shiftB] = people;
  if (!shiftB) throw new Error('This suite needs at least two assignable people in the seed.');

  const makeRadio = async (suffix) =>
    (
      await admin.rpc('create_asset', {
        p_name: `HT Motorola XiR P3688 ${suffix}`,
        p_category: (await admin.from('categories').select('id').eq('code', 'NET').single()).data
          .id,
        p_serial: `HT-${suffix}-${Date.now()}`,
        p_location: ho.id,
        p_status: (await admin.from('asset_statuses').select('id').eq('name', 'Available').single())
          .data.id,
        p_condition: (await admin.from('asset_conditions').select('id').eq('name', 'Good').single())
          .data.id,
      })
    ).data;

  const radio = await makeRadio('pair');

  console.log('\nGiving it to a pair');
  let bastId;
  {
    const noHolder = await admin.rpc('set_secondary_holder', {
      p_asset: radio.id,
      p_account: shiftB.id,
    });
    check(
      'a second holder needs a first one',
      /assign it first/i.test(noHolder.error?.message ?? ''),
      noHolder.error?.message,
    );

    await admin.rpc('assign_asset', {
      p_asset: radio.id,
      p_account: shiftA.id,
      p_location: ho.id,
      p_date: today,
      p_auto_bast: true,
    });
    bastId = (await admin.from('bast').select('id').eq('asset_id', radio.id).single()).data.id;

    const same = await admin.rpc('set_secondary_holder', {
      p_asset: radio.id,
      p_account: shiftA.id,
    });
    check(
      'the same person twice is refused',
      /already the first holder/i.test(same.error?.message ?? ''),
      same.error?.message,
    );

    const ok = await admin.rpc('set_secondary_holder', {
      p_asset: radio.id,
      p_account: shiftB.id,
    });
    check(
      'the second holder is set',
      ok.data?.secondaryName === shiftB.full_name,
      ok.error?.message,
    );

    const asset = (
      await admin
        .from('assets')
        .select('assigned_to, assigned_to_secondary')
        .eq('id', radio.id)
        .single()
    ).data;
    check(
      'both names are on the asset',
      asset.assigned_to === shiftA.id && asset.assigned_to_secondary === shiftB.id,
    );

    const asg = (
      await admin
        .from('assignments')
        .select('account_id, secondary_account_id')
        .eq('asset_id', radio.id)
        .eq('state', 'active')
        .single()
    ).data;
    check('and on the assignment', asg.secondary_account_id === shiftB.id);

    const stillOne = (
      await admin.from('assignments').select('id').eq('asset_id', radio.id).eq('state', 'active')
    ).data;
    check(
      'there is still exactly one active assignment',
      stillOne.length === 1,
      String(stillOne.length),
    );

    const draft = (await admin.rpc('bast_detail', { p_id: bastId })).data;
    check(
      'the draft document names the second recipient',
      draft.secondaryName === shiftB.full_name,
      draft.secondaryName,
    );
  }

  console.log('\nThe signature rule');
  {
    const first = await admin.rpc('sign_bast', {
      p_bast: bastId,
      p_role: 'handover',
      p_name: 'Rizky Hidayat',
      p_title: 'IT Support',
      p_strokes: STROKES,
    });
    check(
      'one signature is not complete',
      first.data?.complete === false,
      first.error?.message ?? JSON.stringify(first.data),
    );

    const second = await admin.rpc('sign_bast', {
      p_bast: bastId,
      p_role: 'receiver',
      p_name: shiftA.full_name,
      p_title: 'Operator',
      p_strokes: STROKES,
    });
    check(
      'TWO signatures are STILL not complete when there is a second recipient',
      second.data?.complete === false,
      second.error?.message ?? JSON.stringify(second.data),
    );

    const third = await admin.rpc('sign_bast', {
      p_bast: bastId,
      p_role: 'receiver_2',
      p_name: shiftB.full_name,
      p_title: 'Operator',
      p_strokes: STROKES,
    });
    check(
      'the third signature completes it',
      third.data?.complete === true,
      third.error?.message ?? JSON.stringify(third.data),
    );

    const detail = (await admin.rpc('bast_detail', { p_id: bastId })).data;
    check(
      'all three blocks are on the document',
      Boolean(
        detail.signatures?.handover && detail.signatures?.receiver && detail.signatures?.receiver_2,
      ),
      JSON.stringify(Object.keys(detail.signatures ?? {})),
    );
  }

  console.log('\nA single holder is unchanged');
  {
    const solo = await makeRadio('solo');
    await admin.rpc('assign_asset', {
      p_asset: solo.id,
      p_account: shiftA.id,
      p_location: ho.id,
      p_date: today,
      p_auto_bast: true,
    });
    const soloBast = (await admin.from('bast').select('id').eq('asset_id', solo.id).single()).data
      .id;

    await admin.rpc('sign_bast', {
      p_bast: soloBast,
      p_role: 'handover',
      p_name: 'Rizky Hidayat',
      p_title: 'IT Support',
      p_strokes: STROKES,
    });
    const done = await admin.rpc('sign_bast', {
      p_bast: soloBast,
      p_role: 'receiver',
      p_name: shiftA.full_name,
      p_title: 'Operator',
      p_strokes: STROKES,
    });
    check(
      'two signatures still complete a one-recipient document',
      done.data?.complete === true,
      done.error?.message ?? JSON.stringify(done.data),
    );
  }

  console.log('\nSearch finds it by either name');
  {
    const byFirst =
      (
        await admin.rpc('search_assets', {
          p_locations: scope,
          p_query: shiftA.full_name,
        })
      ).data ?? [];
    const bySecond =
      (
        await admin.rpc('search_assets', {
          p_locations: scope,
          p_query: shiftB.full_name,
        })
      ).data ?? [];

    check(
      'by the first holder',
      byFirst.some((x) => x.id === radio.id),
      `${byFirst.length} hits`,
    );
    check(
      'and by the second holder',
      bySecond.some((x) => x.id === radio.id),
      `${bySecond.length} hits`,
    );
  }

  console.log('\nReturning releases both');
  {
    const back = await admin.rpc('return_asset', {
      p_asset: radio.id,
      p_date: today,
      p_condition: (await admin.from('asset_conditions').select('id').eq('name', 'Good').single())
        .data.id,
      p_auto_bast: true,
    });
    check('the return succeeds', !back.error, back.error?.message);

    const asset = (
      await admin
        .from('assets')
        .select('assigned_to, assigned_to_secondary')
        .eq('id', radio.id)
        .single()
    ).data;
    check('the first holder is released', asset.assigned_to === null);
    check(
      'and so is the second',
      asset.assigned_to_secondary === null,
      JSON.stringify(asset.assigned_to_secondary),
    );

    const withdrawal = (await admin.rpc('bast_detail', { p_id: back.data.bastId })).data;
    check(
      'the withdrawal sheet carries the pair across',
      withdrawal.secondaryName === shiftB.full_name,
      withdrawal.secondaryName,
    );

    const one = await admin.rpc('sign_bast', {
      p_bast: back.data.bastId,
      p_role: 'handover',
      p_name: 'Rizky Hidayat',
      p_title: 'IT Support',
      p_strokes: STROKES,
    });
    const two = await admin.rpc('sign_bast', {
      p_bast: back.data.bastId,
      p_role: 'receiver',
      p_name: shiftA.full_name,
      p_title: 'Operator',
      p_strokes: STROKES,
    });
    check(
      '...and needs both of them to sign it back in too',
      one.data?.complete === false && two.data?.complete === false,
      JSON.stringify([one.data?.complete, two.data?.complete]),
    );
  }

  console.log('\nA BAST Perlengkapan can be signed at all');
  {
    // sign_bast() used to ask can_see_asset(), which is false for a document
    // with no asset — so this sheet could be raised and read but never signed.
    const category = (await admin.from('categories').select('id').eq('code', 'ACC').single()).data;
    const cable = (
      await admin.rpc('create_accessory', {
        p_input: {
          name: `Cable for signing ${Date.now()}`,
          categoryId: category.id,
          locationId: ho.id,
          totalQty: 4,
        },
      })
    ).data.id;
    const co = (
      await admin.rpc('assign_accessory', {
        p_accessory: cable,
        p_account: shiftA.id,
        p_qty: 1,
      })
    ).data.checkoutId;
    const paper = (
      await admin.rpc('create_accessory_bast', {
        p_account: shiftA.id,
        p_checkouts: [co],
      })
    ).data;

    const h = await admin.rpc('sign_bast', {
      p_bast: paper.bastId,
      p_role: 'handover',
      p_name: 'Rizky Hidayat',
      p_title: 'IT Support',
      p_strokes: STROKES,
    });
    check('the IT side can sign it', !h.error, h.error?.message);

    const r = await admin.rpc('sign_bast', {
      p_bast: paper.bastId,
      p_role: 'receiver',
      p_name: shiftA.full_name,
      p_title: 'Operator',
      p_strokes: STROKES,
    });
    check(
      'and so can the recipient, which completes it',
      r.data?.complete === true,
      r.error?.message ?? JSON.stringify(r.data),
    );
  }

  console.log(failures === 0 ? '\nAll good.\n' : `\n${failures} failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
