/**
 * BAST Perlengkapan — a handover note with no asset on it.
 *
 * Migration 0046 made bast.asset_id nullable, and that column is what every
 * BAST policy resolved visibility through. The fallback to bast.location_id is
 * the most dangerous line written this session: get it wrong and Site IT reads
 * Head Office's handover notes. Most of this suite exists to prove it does not.
 *
 * The rest guards the reason the feature exists at all: a signed document must
 * never change. Accessories given later produce a NEW document, exactly as
 * they would on paper.
 *
 *   supabase start && supabase db reset
 *   npm run test:bast-accessory
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
  const site = locations.find((l) => l.code === 'SITE');
  const scope = locations.map((l) => l.id);
  const category = (await admin.from('categories').select('id').eq('code', 'ACC').single()).data;

  const people = (await admin.rpc('assignable_employees', { p_locations: scope })).data ?? [];
  const person = people[0];

  const stock = async (name, locationId, qty) =>
    (
      await admin.rpc('create_accessory', {
        p_input: { name, categoryId: category.id, locationId, totalQty: qty },
      })
    ).data.id;

  const handOut = async (accessoryId, qty) =>
    (
      await admin.rpc('assign_accessory', {
        p_accessory: accessoryId,
        p_account: person.id,
        p_qty: qty,
      })
    ).data.checkoutId;

  const mouseHo = await stock('Logitech M170 for BAST', ho.id, 20);
  const headsetHo = await stock('Headset H340 for BAST', ho.id, 10);

  console.log('\nA document with no asset');
  let accessoryBastId;
  {
    const c1 = await handOut(mouseHo, 2);
    const c2 = await handOut(headsetHo, 1);

    const made = await admin.rpc('create_accessory_bast', {
      p_account: person.id,
      p_checkouts: [c1, c2],
    });
    check('it is raised', !made.error, made.error?.message);
    accessoryBastId = made.data?.bastId;

    check(
      'the number comes from the same yearly sequence',
      /^BAST\/CITE\/\d{4}\/\d{4}$/.test(made.data?.bastNumber ?? ''),
      made.data?.bastNumber,
    );
    check('both accessories are on it', made.data?.lines === 2, String(made.data?.lines));

    const row = (
      await admin
        .from('bast')
        .select('asset_id, kind, location_id')
        .eq('id', accessoryBastId)
        .single()
    ).data;
    check('it carries no asset', row.asset_id === null, JSON.stringify(row.asset_id));
    check("its kind is 'accessory'", row.kind === 'accessory', row.kind);
    check('and it belongs to the location the stock came from', row.location_id === ho.id);

    const detail = (await admin.rpc('bast_detail', { p_id: accessoryBastId })).data;
    check('bast_detail survives a null asset', detail !== null);
    check(
      '...and the goods table is an array, not null',
      Array.isArray(detail?.items) && detail.items.length === 2,
      JSON.stringify(detail?.items),
    );
    check(
      '...naming the recipient',
      detail?.employeeName === person.full_name,
      detail?.employeeName,
    );

    const listed = (await admin.rpc('bast_list', { p_locations: scope })).data ?? [];
    check(
      'it appears in the list at all',
      listed.some((b) => b.id === accessoryBastId),
      `${listed.length} listed`,
    );

    const stats = (await admin.rpc('bast_stats', { p_locations: scope })).data;
    check('and the stat tiles count it', (stats.accessory ?? 0) >= 1, JSON.stringify(stats));
  }

  console.log('\nThe hand-outs it covers cannot be reused');
  {
    const c3 = await handOut(mouseHo, 1);
    const reuse = await admin.rpc('create_accessory_bast', {
      p_account: person.id,
      p_checkouts: [c3, c3],
    });
    // Passing the same id twice makes the count check disagree with the length.
    check('the same hand-out twice is refused', Boolean(reuse.error), reuse.error?.message);

    const stolen = await admin.rpc('create_accessory_bast', {
      p_account: people[1]?.id ?? person.id,
      p_checkouts: [c3],
    });
    if (people[1]) {
      check(
        "somebody else's hand-out is refused",
        /somebody else|already on a document/i.test(stolen.error?.message ?? ''),
        stolen.error?.message,
      );
    }
  }

  console.log('\nStock from two locations cannot share one sheet');
  {
    const mouseSite = await stock('Logitech M170 for BAST', site.id, 5);
    const a = await handOut(mouseHo, 1);
    const b = await handOut(mouseSite, 1);
    const mixed = await admin.rpc('create_accessory_bast', {
      p_account: person.id,
      p_checkouts: [a, b],
    });
    check(
      'a mixed-location document is refused',
      /different locations/i.test(mixed.error?.message ?? ''),
      mixed.error?.message,
    );
  }

  console.log('\nScope — the fallback that replaced can_see_asset');
  {
    // Siti Rahayu is Site IT, locked to ONE location by the seed. Whichever it
    // is, there is a document she must see and a document she must not — and
    // the deny direction is the one that matters, so it is built explicitly
    // rather than hoped for.
    const siteIt = await clientFor('siti.rahayu@cite.co.id');

    const hers = (await siteIt.rpc('accessories_list', { p_locations: scope })).data ?? [];
    const herLocation = hers[0]?.location_id ?? ho.id;
    const otherLocation = herLocation === ho.id ? site.id : ho.id;

    // A document belonging to the location she is NOT in.
    const farStock = await stock(`Cable for ${otherLocation}`, otherLocation, 5);
    const farPerson =
      (await admin.rpc('assignable_employees', { p_locations: [otherLocation] })).data?.[0] ??
      person;
    const farCheckout = (
      await admin.rpc('assign_accessory', {
        p_accessory: farStock,
        p_account: farPerson.id,
        p_qty: 1,
      })
    ).data.checkoutId;
    const farBast = (
      await admin.rpc('create_accessory_bast', {
        p_account: farPerson.id,
        p_checkouts: [farCheckout],
      })
    ).data.bastId;

    const listed = (await siteIt.rpc('bast_list', { p_locations: scope })).data ?? [];

    check(
      'a scoped user CANNOT see an accessory BAST from another location',
      !listed.some((b) => b.id === farBast),
      `saw ${farBast}`,
    );
    check(
      '...and bast_detail refuses it too',
      (await siteIt.rpc('bast_detail', { p_id: farBast })).data === null,
    );
    check(
      '...and so does its goods table',
      ((await siteIt.from('bast_items').select('id').eq('bast_id', farBast)).data ?? []).length ===
        0,
    );

    // The allow direction, so the policy is not simply denying everything.
    const nearStock = await stock(`Cable for ${herLocation}`, herLocation, 5);
    const nearPerson =
      (await admin.rpc('assignable_employees', { p_locations: [herLocation] })).data?.[0] ?? person;
    const nearCheckout = (
      await admin.rpc('assign_accessory', {
        p_accessory: nearStock,
        p_account: nearPerson.id,
        p_qty: 1,
      })
    ).data.checkoutId;
    const nearBast = (
      await admin.rpc('create_accessory_bast', {
        p_account: nearPerson.id,
        p_checkouts: [nearCheckout],
      })
    ).data.bastId;

    const listedAgain = (await siteIt.rpc('bast_list', { p_locations: scope })).data ?? [];
    check(
      '...but CAN see one from its own location',
      listedAgain.some((b) => b.id === nearBast),
      `${listedAgain.length} listed`,
    );
    check(
      '...and can read that one in full',
      (await siteIt.rpc('bast_detail', { p_id: nearBast })).data !== null,
    );
  }

  console.log('\nAccessories on an asset BAST');
  {
    const asset = (
      await admin.rpc('create_asset', {
        p_name: 'Dell Latitude for accessory BAST',
        p_category: (await admin.from('categories').select('id').eq('code', 'LPT').single()).data
          .id,
        p_serial: `ACCB-${Date.now()}`,
        p_location: ho.id,
        p_status: (await admin.from('asset_statuses').select('id').eq('name', 'Available').single())
          .data.id,
        p_condition: (await admin.from('asset_conditions').select('id').eq('name', 'Good').single())
          .data.id,
      })
    ).data;

    const assigned = await admin.rpc('assign_asset', {
      p_asset: asset.id,
      p_account: person.id,
      p_location: ho.id,
      p_date: new Date().toISOString().slice(0, 10),
      p_auto_bast: true,
    });
    const assetBastId = (await admin.from('bast').select('id').eq('asset_id', asset.id).single())
      .data.id;
    check('the asset got its own BAST', Boolean(assetBastId), assigned.error?.message);

    const c = await handOut(headsetHo, 1);
    const attached = await admin.rpc('attach_accessories_to_bast', {
      p_bast: assetBastId,
      p_checkouts: [c],
    });
    check(
      'an accessory is appended to it',
      attached.data?.added === 1,
      attached.error?.message ?? JSON.stringify(attached.data),
    );

    const detail = (await admin.rpc('bast_detail', { p_id: assetBastId })).data;
    check(
      "the laptop's own line survived the append",
      detail.items.some((i) => /Dell Latitude for accessory BAST/.test(i.jenis)),
      JSON.stringify(detail.items),
    );
    check(
      '...and the headset is on it too',
      detail.items.some((i) => /Headset H340/.test(i.jenis)),
      JSON.stringify(detail.items),
    );

    // Signing locks the contents. This is the whole reason a later accessory
    // gets its own document instead.
    await admin.rpc('sign_bast', {
      p_bast: assetBastId,
      p_role: 'handover',
      p_name: 'Rizky Hidayat',
      p_title: 'IT Support',
      p_strokes: [
        [
          [0.1, 0.1],
          [0.2, 0.2],
          [0.3, 0.15],
        ],
      ],
    });
    await admin.rpc('sign_bast', {
      p_bast: assetBastId,
      p_role: 'receiver',
      p_name: person.full_name,
      p_title: 'Staff',
      p_strokes: [
        [
          [0.1, 0.1],
          [0.2, 0.2],
          [0.3, 0.15],
        ],
      ],
    });
    await admin.from('bast').update({ status: 'signed' }).eq('id', assetBastId);

    const c2 = await handOut(mouseHo, 1);
    const late = await admin.rpc('attach_accessories_to_bast', {
      p_bast: assetBastId,
      p_checkouts: [c2],
    });
    check(
      'nothing can be appended once it is signed',
      /already signed/i.test(late.error?.message ?? ''),
      late.error?.message,
    );

    const edit = await admin.rpc('set_bast_items', {
      p_bast: assetBastId,
      p_items: [{ jenis: 'Sneaked in later' }],
    });
    check(
      'and the goods list still refuses to be rewritten',
      /already signed/i.test(edit.error?.message ?? ''),
      edit.error?.message,
    );

    const rescue = await admin.rpc('create_accessory_bast', {
      p_account: person.id,
      p_checkouts: [c2],
    });
    check(
      'the late accessory gets a document of its own instead',
      !rescue.error && rescue.data?.bastNumber !== undefined,
      rescue.error?.message,
    );
  }

  console.log('\nA BAST Perlengkapan can still have its list edited');
  {
    const edit = await admin.rpc('set_bast_items', {
      p_bast: accessoryBastId,
      p_items: [{ jenis: 'Logitech M170 × 2' }, { jenis: 'Headset H340 × 1' }],
    });
    check('set_bast_items works on a document with no asset', !edit.error, edit.error?.message);
  }

  console.log(failures === 0 ? '\nAll good.\n' : `\n${failures} failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
