/**
 * Status changes and disposal — migration 0016.
 *
 * Client instruction, 2026-07-30: "langsung ubah saja tapi ada lognya pastinya
 * ttg siapa yang mengganti ganti".
 *
 * The four things worth proving:
 *
 *   1. Every change carries a reason and a person, and both survive.
 *   2. The record cannot be edited or deleted afterwards. A disposal note that
 *      can be rewritten is worth nothing.
 *   3. An asset still in someone's hands cannot be retired or lost — otherwise
 *      the register would claim a device is gone while a person is carrying it.
 *   4. 'Assigned' cannot be declared. It is what assigning produces.
 *
 * REPEATABILITY
 * -------------
 * Each run creates its own asset. Nothing is cleaned up and nothing can be:
 * asset_status_changes is append-only. No assertion counts rows.
 *
 *   supabase start && supabase db reset
 *   npm run test:status
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

  const { data: categories } = await admin.from('categories').select('id').limit(1);
  const { data: statuses } = await admin.from('asset_statuses').select('id, name, is_terminal');
  const { data: conditions } = await admin.from('asset_conditions').select('id, name');

  const byName = (list, name) => list.find((row) => row.name === name).id;
  const available = byName(statuses, 'Available');
  const assignedStatus = byName(statuses, 'Assigned');
  const broken = byName(statuses, 'Broken');
  const retired = byName(statuses, 'Retired');
  const good = byName(conditions, 'Good');
  const poor = byName(conditions, 'Poor');

  const stamp = Date.now();

  async function newAsset(label) {
    const created = await admin.rpc('create_asset', {
      p_name: `Status Test ${label}`,
      p_category: categories[0].id,
      p_serial: `SN-ST-${label}-${stamp}`,
      p_location: HO,
      p_status: available,
      p_condition: good,
    });
    if (created.error) throw new Error(`create_asset: ${created.error.message}`);
    return created.data;
  }

  const spare = await newAsset('SPARE');

  console.log('\nA change needs a reason');
  {
    const noReason = await admin.rpc('change_asset_status', {
      p_asset: spare.id,
      p_status: broken,
      p_condition: null,
      p_reason: '   ',
    });
    check('a blank reason is refused', Boolean(noReason.error), noReason.error?.message);

    const unknown = await admin.rpc('change_asset_status', {
      p_asset: spare.id,
      p_status: '00000000-0000-0000-0000-000000000000',
      p_condition: null,
      p_reason: 'anything',
    });
    check('an unknown status is refused', Boolean(unknown.error), unknown.error?.message);

    const declareAssigned = await admin.rpc('change_asset_status', {
      p_asset: spare.id,
      p_status: assignedStatus,
      p_condition: null,
      p_reason: 'trying to shortcut the wizard',
    });
    check(
      'Assigned cannot be declared — it is what assigning produces',
      Boolean(declareAssigned.error),
      declareAssigned.error?.message,
    );
  }

  console.log('\nThe change is applied, and it is logged');
  {
    const changed = await admin.rpc('change_asset_status', {
      p_asset: spare.id,
      p_status: broken,
      p_condition: poor,
      p_reason: 'Screen cracked in transit',
    });
    check('the status changes', !changed.error, changed.error?.message);
    check('the response says which status', changed.data?.status === 'Broken');
    check('and whether it ended the asset', changed.data?.terminal === false);

    const row = await admin
      .from('assets')
      .select('status_id, condition_id')
      .eq('id', spare.id)
      .single();
    check(
      'the asset row really moved',
      row.data?.status_id === broken && row.data?.condition_id === poor,
      JSON.stringify(row.data),
    );

    const history = await admin.rpc('asset_status_history', { p_asset: spare.id });
    const latest = history.data?.[0];
    check(
      'the history records where it came from and where it went',
      latest?.from_status === 'Available' && latest?.to_status === 'Broken',
      JSON.stringify(latest),
    );
    check(
      'the condition change is on the record too',
      latest?.from_condition === 'Good' && latest?.to_condition === 'Poor',
      JSON.stringify(latest),
    );
    check('the reason survives', latest?.reason === 'Screen cracked in transit');
    check('so does the person', latest?.changed_by_name === 'Dewi Lestari');

    const repeat = await admin.rpc('change_asset_status', {
      p_asset: spare.id,
      p_status: broken,
      p_condition: poor,
      p_reason: 'same thing again',
    });
    check(
      'changing to the status it already has is refused',
      Boolean(repeat.error),
      repeat.error?.message,
    );

    // The rail on Asset Detail reads this, so a change nobody can see would be
    // a change that did not really happen as far as the team is concerned.
    const detail = await admin.rpc('asset_detail', { p_code: spare.asset_code ?? spare.assetCode });
    check(
      'it shows up on the Timeline with its reason',
      (detail.data?.timeline ?? []).some(
        (e) =>
          e.title === 'Available → Broken' &&
          (e.detail ?? '').includes('Screen cracked in transit'),
      ),
      JSON.stringify(detail.data?.timeline?.map((e) => e.title)),
    );
  }

  console.log('\nThe log cannot be rewritten');
  {
    const row = await admin
      .from('asset_status_changes')
      .select('id')
      .eq('asset_id', spare.id)
      .limit(1)
      .single();

    const direct = await admin.from('asset_status_changes').insert({
      asset_id: spare.id,
      to_status: retired,
      reason: 'forged',
    });
    check(
      'writing the log directly is refused',
      Boolean(direct.error),
      direct.error?.message ?? 'the insert succeeded',
    );

    const updated = await admin
      .from('asset_status_changes')
      .update({ reason: 'something else' })
      .eq('id', row.data.id);
    check('update is refused', Boolean(updated.error), updated.error?.message ?? 'it updated');

    const deleted = await admin.from('asset_status_changes').delete().eq('id', row.data.id);
    check('delete is refused', Boolean(deleted.error), deleted.error?.message ?? 'it deleted');
  }

  console.log('\nAn asset in someone’s hands cannot be disposed of');
  {
    const held = await newAsset('HELD');
    const { data: employees } = await admin.rpc('assignable_employees', { p_locations: [HO] });
    const assigned = await admin.rpc('assign_asset', {
      p_asset: held.id,
      p_account: employees[0].id,
      p_location: HO,
      p_date: new Date().toISOString().slice(0, 10),
      p_expected_return: null,
      p_notes: 'status test',
      p_auto_bast: false,
    });
    check('the asset is in someone’s hands', !assigned.error, assigned.error?.message);

    const disposed = await admin.rpc('change_asset_status', {
      p_asset: held.id,
      p_status: retired,
      p_condition: null,
      p_reason: 'end of life',
    });
    check(
      'retiring it is refused while it is held',
      Boolean(disposed.error),
      disposed.error?.message ?? 'it was retired',
    );
    check(
      'and the message names who has it',
      (disposed.error?.message ?? '').includes(employees[0].full_name ?? employees[0].fullName),
      disposed.error?.message,
    );

    // Non-terminal statuses are still allowed — a device can break while
    // someone is using it, and pretending otherwise would force a fake return.
    const brokenWhileHeld = await admin.rpc('change_asset_status', {
      p_asset: held.id,
      p_status: broken,
      p_condition: null,
      p_reason: 'Keyboard failed while in use',
    });
    check(
      'but marking it Broken while held is allowed',
      !brokenWhileHeld.error,
      brokenWhileHeld.error?.message,
    );
  }

  console.log('\nRetiring clears the claims on the asset');
  {
    const scrap = await newAsset('SCRAP');
    const retire = await admin.rpc('change_asset_status', {
      p_asset: scrap.id,
      p_status: retired,
      p_condition: null,
      p_reason: 'Beyond economical repair, disposed',
    });
    check('an unheld asset can be retired', !retire.error, retire.error?.message);
    check('the response marks it terminal', retire.data?.terminal === true);

    const row = await admin
      .from('assets')
      .select('status_id, department_id, assigned_to')
      .eq('id', scrap.id)
      .single();
    check(
      'it leaves its department and holds nobody',
      row.data?.status_id === retired &&
        row.data?.department_id === null &&
        row.data?.assigned_to === null,
      JSON.stringify(row.data),
    );

    const assignable = await admin.rpc('assignable_assets', { p_locations: [HO] });
    check(
      'and it can no longer be handed out',
      !(assignable.data ?? []).some((a) => a.id === scrap.id),
    );
  }

  console.log('\nScope and role still decide who may change a status');
  {
    const viewer = await clientFor('andi.prasetyo@cite.co.id');
    const byViewer = await viewer.rpc('change_asset_status', {
      p_asset: spare.id,
      p_status: retired,
      p_condition: null,
      p_reason: 'not my call',
    });
    check('a Viewer cannot', Boolean(byViewer.error), byViewer.error?.message ?? 'it changed');

    const created = await admin.rpc('create_asset', {
      p_name: `Status Test SITE ${stamp}`,
      p_category: categories[0].id,
      p_serial: `SN-ST-SITE-${stamp}`,
      p_location: locations.find((l) => l.code === 'SITE').id,
      p_status: available,
      p_condition: good,
    });

    const scoped = await clientFor('siti.rahayu@cite.co.id');
    const outOfScope = await scoped.rpc('change_asset_status', {
      p_asset: created.data.id,
      p_status: broken,
      p_condition: null,
      p_reason: 'out of my locations',
    });
    check(
      'an asset outside your locations cannot be touched',
      outOfScope.error?.message === 'Asset not found',
      outOfScope.error?.message ?? 'it changed',
    );
  }

  console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
