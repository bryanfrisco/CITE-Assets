/**
 * Units — fitting an asset into a vehicle.
 *
 * The client's decision was that a unit is a PLACE, not a person: no holder,
 * no BAST. That makes two things load-bearing, and both are checked here:
 *
 *   * the mandatory reason, because audit_log can record who and when but
 *     never why, and why is the only thing an auditor will actually ask; and
 *   * the 'Installed' status, because without it a radio already bolted into a
 *     truck keeps appearing in the assign wizard and can be handed to a person
 *     while still in the vehicle.
 *
 *   supabase start && supabase db reset
 *   npm run test:units
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

  console.log('\nUnits are master data');
  {
    const noCode = await admin.rpc('master_create', {
      p_entity: 'unit',
      p_name: 'Nameless truck',
      p_extra: {},
    });
    check(
      'a unit without a code is refused',
      /unit code/i.test(noCode.error?.message ?? ''),
      noCode.error?.message,
    );

    const noLoc = await admin.rpc('master_create', {
      p_entity: 'unit',
      p_name: 'Homeless truck',
      p_extra: { code: 'DT-999' },
    });
    check(
      'a unit without a location is refused',
      /location/i.test(noLoc.error?.message ?? ''),
      noLoc.error?.message,
    );
  }

  const mk = async (code, name, locationId) => {
    const r = await admin.rpc('master_create', {
      p_entity: 'unit',
      p_name: name,
      p_extra: { code, locationId },
    });
    if (r.error) throw new Error(`Could not create ${code}: ${r.error.message}`);
    return r.data.id;
  };

  const dtSite = await mk('DT-042', 'Dump Truck Komatsu HD465 #42', site.id);
  const lvHo = await mk('LV-007', 'Light Vehicle Hilux', ho.id);

  {
    const list = (await admin.rpc('master_list', { p_entity: 'unit' })).data ?? [];
    const row = list.find((u) => u.id === dtSite);
    check(
      'a unit lists its code and location',
      row?.detail === `DT-042 · ${site.name}`,
      row?.detail,
    );
  }

  console.log('\nCompanies are master data too');
  {
    const list = (await admin.rpc('master_list', { p_entity: 'company' })).data ?? [];
    const spr = list.find((c) => c.code === 'SPR');
    check('the three companies are seeded', list.length >= 3, String(list.length));
    check(
      'Stargate Pasific Resources is one of them',
      spr?.name === 'PT Stargate Pasific Resources',
      spr?.name,
    );
  }

  // A radio at Site, so fitting it to DT-042 needs no movement.
  const radio = (
    await admin.rpc('create_asset', {
      p_name: 'Radio Rig Motorola XiR M3688',
      p_category: (await admin.from('categories').select('id').eq('code', 'NET').single()).data.id,
      p_serial: `RIG-${Date.now()}`,
      p_location: site.id,
      p_status: (await admin.from('asset_statuses').select('id').eq('name', 'Available').single())
        .data.id,
      p_condition: (await admin.from('asset_conditions').select('id').eq('name', 'Good').single())
        .data.id,
    })
  ).data;

  console.log('\nFitting it');
  {
    const noReason = await admin.rpc('install_asset_to_unit', {
      p_asset: radio.id,
      p_unit: dtSite,
      p_reason: '   ',
    });
    check(
      'a blank reason is refused',
      /why/i.test(noReason.error?.message ?? ''),
      noReason.error?.message,
    );

    const done = await admin.rpc('install_asset_to_unit', {
      p_asset: radio.id,
      p_unit: dtSite,
      p_reason: 'Fitted for the Konawe haul road rollout',
    });
    check(
      'it reports the unit back',
      done.data?.unitCode === 'DT-042',
      done.error?.message ?? JSON.stringify(done.data),
    );

    const a = (await admin.from('assets').select('*').eq('id', radio.id).single()).data;
    const status = (
      await admin.from('asset_statuses').select('name').eq('id', a.status_id).single()
    ).data;
    check('unit_id is set', a.unit_id === dtSite);
    check("status becomes 'Installed'", status.name === 'Installed', status.name);

    const changes =
      (await admin.from('asset_status_changes').select('*').eq('asset_id', radio.id)).data ?? [];
    check(
      'the reason is recorded, and it is the one given',
      changes.some((c) => c.reason === 'Fitted for the Konawe haul road rollout'),
      JSON.stringify(changes.map((c) => c.reason)),
    );
  }

  console.log('\nAn installed asset is out of reach of the assign wizard');
  {
    const offered =
      (
        await admin.rpc('assignable_assets', {
          p_locations: scope,
          p_mode: 'assign',
        })
      ).data ?? [];
    check(
      'it is not offered',
      !offered.some((x) => x.id === radio.id),
      `${offered.length} offered`,
    );
  }

  console.log('\nThe asset follows the vehicle');
  {
    // LV-007 lives at Head Office; the radio is at Site.
    const moved = await admin.rpc('install_asset_to_unit', {
      p_asset: radio.id,
      p_unit: lvHo,
      p_reason: 'Moved onto the light vehicle',
    });
    check('refitting to a unit elsewhere succeeds', !moved.error, moved.error?.message);

    const a = (
      await admin.from('assets').select('location_id, unit_id').eq('id', radio.id).single()
    ).data;
    check('the asset is now at Head Office', a.location_id === ho.id);
    check('and it belongs to LV-007', a.unit_id === lvHo);

    const movements =
      (await admin.from('movements').select('*').eq('asset_id', radio.id)).data ?? [];
    check('one movement row records the trip', movements.length === 1, String(movements.length));
    check(
      '...naming the unit in its remarks',
      /LV-007/.test(movements[0]?.remarks ?? ''),
      movements[0]?.remarks,
    );
  }

  console.log('\nTaking it out again');
  {
    const out = await admin.rpc('remove_asset_from_unit', {
      p_asset: radio.id,
      p_reason: 'Vehicle sold',
    });
    check(
      'it says where it came from',
      out.data?.removedFrom === 'LV-007',
      out.error?.message ?? JSON.stringify(out.data),
    );

    const a = (await admin.from('assets').select('*').eq('id', radio.id).single()).data;
    const status = (
      await admin.from('asset_statuses').select('name').eq('id', a.status_id).single()
    ).data;
    check('unit_id is cleared', a.unit_id === null);
    check("status returns to 'Available'", status.name === 'Available', status.name);

    const again = await admin.rpc('remove_asset_from_unit', {
      p_asset: radio.id,
      p_reason: 'Vehicle sold',
    });
    check(
      'removing it twice is refused',
      /not fitted/i.test(again.error?.message ?? ''),
      again.error?.message,
    );
  }

  console.log("\nAn asset in somebody's hands cannot be fitted");
  {
    const person = (await admin.rpc('assignable_employees', { p_locations: scope })).data?.[0];
    await admin.rpc('assign_asset', {
      p_asset: radio.id,
      p_account: person.id,
      p_location: ho.id,
      p_date: new Date().toISOString().slice(0, 10),
      p_auto_bast: false,
    });

    const refused = await admin.rpc('install_asset_to_unit', {
      p_asset: radio.id,
      p_unit: lvHo,
      p_reason: 'Trying it on anyway',
    });
    check(
      'it is refused, and the message names the holder',
      /Return this asset first/i.test(refused.error?.message ?? ''),
      refused.error?.message,
    );
  }

  console.log('\nWhat a unit is carrying');
  {
    const contents = (await admin.rpc('unit_assets', { p_unit: dtSite })).data ?? [];
    check('an empty unit reports nothing', contents.length === 0, String(contents.length));
  }

  console.log('\nA Viewer may not fit anything');
  {
    const viewer = await clientFor('andi.prasetyo@cite.co.id');
    const refused = await viewer.rpc('install_asset_to_unit', {
      p_asset: radio.id,
      p_unit: dtSite,
      p_reason: 'Should not be allowed',
    });
    check('a Viewer is refused', Boolean(refused.error), refused.error?.message ?? 'no error');
  }

  console.log(failures === 0 ? '\nAll good.\n' : `\n${failures} failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
