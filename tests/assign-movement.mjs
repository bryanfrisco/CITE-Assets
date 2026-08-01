/**
 * Assignment & movement — IMPLEMENTATION_PLAN.md § Phase 4, "Done when":
 *
 *   "assigning an asset changes its status and holder, writes an assignment
 *    row, a movement row (if the location changed), and audit entries — and the
 *    movement row cannot be edited or deleted even with a raw SQL call from the
 *    client."
 *
 * Every assertion goes through the same RPCs the wizard calls, plus two raw
 * PostgREST writes that must fail.
 *
 * REPEATABILITY
 * -------------
 * The assign/return flow is fully reversible and is undone at the end. The
 * movement half is not: movements are append-only by design, so nothing can
 * remove those rows. The test therefore moves LPT099 out and straight back, so
 * asset counts are restored even though two history rows remain — that is the
 * honest consequence of an append-only table, not a leak.
 *
 *   supabase start && supabase db reset
 *   npm run test:assign
 */

import { createClient } from '@supabase/supabase-js';

import { assertLocal } from './_guard.mjs';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = 'cite-dev-2026';

assertLocal(URL);
const TODAY = '2026-07-29';

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

  const { data: locations } = await admin.from('locations').select('id, code, name');
  const HO = locations.find((l) => l.code === 'HO');
  const SITE = locations.find((l) => l.code === 'SITE');
  const scope = locations.map((l) => l.id);

  const { data: conditions } = await admin.from('asset_conditions').select('id, name');
  const good = conditions.find((c) => c.name === 'Good').id;

  const idOf = async (code) => (await admin.rpc('asset_detail', { p_code: code })).data.asset.id;
  const detailOf = async (code) => (await admin.rpc('asset_detail', { p_code: code })).data.asset;

  const monitor = await idOf('MON122-24-205'); // Available, Head Office
  const broken = await idOf('LPT099-21-004'); // Broken, Head Office — the movement subject

  const { data: people } = await admin.rpc('assignable_employees', { p_locations: scope });
  const dewi = people.find((p) => p.full_name === 'Dewi Lestari');

  console.log('\nWizard steps — README § Assign / Return Asset');
  {
    check('step 1 lists employees in scope', people.length >= 5, `got ${people.length}`);
    check(
      'each employee row carries Department · Location · NIK',
      Boolean(dewi?.department_name && dewi?.location_name && dewi?.nik),
      JSON.stringify(dewi),
    );

    const available = await admin.rpc('assignable_assets', {
      p_locations: scope,
      p_mode: 'assign',
    });
    check(
      // assignable_assets filters by status in SQL and does not return it, so
      // the holder is the observable proxy: an Available asset has nobody.
      'step 2 (assign) lists only Available assets',
      (available.data ?? []).some((a) => a.asset_code === 'MON122-24-205') &&
        (available.data ?? []).every((a) => a.holder_name === null),
      JSON.stringify(available.data?.map((a) => `${a.asset_code}:${a.holder_name}`)),
    );

    const monitorRow = (available.data ?? []).find((a) => a.asset_code === 'MON122-24-205');
    check(
      'the asset row shows location and condition',
      monitorRow?.location_name === 'Head Office' && monitorRow?.condition_name === 'Good',
      JSON.stringify(monitorRow),
    );

    // Stated by identity, not by count. A total would be a claim about how many
    // assets the seed happens to leave assigned, and it would fail the moment
    // any other suite — or a real import — added one.
    const assigned = await admin.rpc('assignable_assets', { p_locations: scope, p_mode: 'return' });
    check(
      'step 2 (return) lists only Assigned assets',
      (assigned.data ?? []).length > 0 &&
        (assigned.data ?? []).every((a) => Boolean(a.holder_name)),
      JSON.stringify(assigned.data?.map((a) => `${a.asset_code}:${a.holder_name}`)),
    );
    check(
      'return rows carry the current holder',
      (assigned.data ?? []).every((a) => Boolean(a.holder_name)),
    );

    const hoOnly = await admin.rpc('assignable_assets', { p_locations: [HO.id], p_mode: 'return' });
    check(
      'step 2 respects the scope',
      (hoOnly.data ?? []).length > 0 &&
        (hoOnly.data ?? []).every((a) => a.location_name === 'Head Office'),
      JSON.stringify(hoOnly.data?.map((a) => `${a.asset_code}:${a.location_name}`)),
    );
  }

  console.log('\nValidation — the exact copy from README § step 1/2/3');
  {
    const noEmployee = await admin.rpc('assign_asset', {
      p_asset: monitor,
      p_account: null,
      p_location: HO.id,
      p_date: TODAY,
    });
    check(
      'no employee → "Select an employee to continue"',
      noEmployee.error?.message === 'Select an employee to continue',
      noEmployee.error?.message,
    );

    const noAsset = await admin.rpc('assign_asset', {
      p_asset: null,
      p_account: dewi.id,
      p_location: HO.id,
      p_date: TODAY,
    });
    check(
      'no asset → "Select an asset to continue"',
      noAsset.error?.message === 'Select an asset to continue',
      noAsset.error?.message,
    );

    const noDate = await admin.rpc('assign_asset', {
      p_asset: monitor,
      p_account: dewi.id,
      p_location: HO.id,
      p_date: null,
    });
    check(
      'no date → "Assignment date is required"',
      noDate.error?.message === 'Assignment date is required',
      noDate.error?.message,
    );

    const backwards = await admin.rpc('assign_asset', {
      p_asset: monitor,
      p_account: dewi.id,
      p_location: HO.id,
      p_date: TODAY,
      p_expected_return: '2026-01-01',
    });
    check(
      'expected return before the assignment date is rejected',
      backwards.error?.message === 'Expected return cannot be before the assignment date',
      backwards.error?.message,
    );
  }

  console.log('\nPermissions');
  {
    const viewer = await clientFor('andi.prasetyo@cite.co.id');
    const denied = await viewer.rpc('assign_asset', {
      p_asset: monitor,
      p_account: dewi.id,
      p_location: HO.id,
      p_date: TODAY,
    });
    check(
      'a Viewer cannot assign',
      denied.error?.message === 'You do not have permission to assign assets',
      denied.error?.message,
    );

    const deniedMove = await viewer.rpc('record_movement', {
      p_asset: broken,
      p_to_location: SITE.id,
      p_reason: 'redeployment',
    });
    check(
      'a Viewer cannot record a movement',
      deniedMove.error?.message === 'You do not have permission to move assets',
      deniedMove.error?.message,
    );

    const siteIt = await clientFor('siti.rahayu@cite.co.id');
    const outOfScope = await siteIt.rpc('assign_asset', {
      p_asset: await idOf('NET031-23-090'), // Site — invisible to Siti
      p_account: dewi.id,
      p_location: HO.id,
      p_date: TODAY,
    });
    check(
      'Site IT cannot assign an asset outside its own location',
      outOfScope.error?.message === 'Asset not found',
      outOfScope.error?.message,
    );

    const outward = await siteIt.rpc('record_movement', {
      p_asset: broken,
      p_to_location: SITE.id,
      p_reason: 'redeployment',
    });
    check(
      'Site IT cannot move an asset out of its scope',
      outward.error?.message === 'That location is outside your scope',
      outward.error?.message,
    );
  }

  console.log('\nAssign — status, holder, assignment row, audit entry');
  {
    const before = await admin
      .from('audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('action', 'assignment_created');

    const assigned = await admin.rpc('assign_asset', {
      p_asset: monitor,
      p_account: dewi.id,
      p_location: HO.id,
      p_date: TODAY,
      p_notes: 'Handover condition, accessories included',
      p_auto_bast: false,
    });
    const row = assigned.data?.[0];
    check('assign returns an assignment id', Boolean(row?.assignment_id), assigned.error?.message);
    check('Auto-generate BAST off → no number', row?.bast_number === null, row?.bast_number);

    const after = await detailOf('MON122-24-205');
    check('the asset status becomes Assigned', after.statusName === 'Assigned', after.statusName);
    check('the holder line updates', after.assignedToName === 'Dewi Lestari', after.assignedToName);

    const { data: asg } = await admin
      .from('assignments')
      .select('id, state, assigned_date, notes')
      .eq('id', row.assignment_id)
      .single();
    check('an assignment row exists and is active', asg?.state === 'active', asg?.state);
    check(
      'the assignment carries the date and notes',
      asg?.assigned_date === TODAY && !!asg?.notes,
    );

    const auditAfter = await admin
      .from('audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('action', 'assignment_created');
    check(
      'an audit entry is written',
      auditAfter.count === before.count + 1,
      // The error is included because a null count is otherwise
      // indistinguishable from a count that is genuinely wrong, and the two
      // need completely different fixes.
      auditAfter.error?.message ?? `${before.count} → ${auditAfter.count}`,
    );

    const twice = await admin.rpc('assign_asset', {
      p_asset: monitor,
      p_account: dewi.id,
      p_location: HO.id,
      p_date: TODAY,
    });
    check(
      'the same asset cannot be assigned twice',
      twice.error?.message === 'This asset is already assigned',
      twice.error?.message,
    );

    const noMovement = await admin.rpc('movement_history', {
      p_locations: scope,
      p_asset: monitor,
    });
    check(
      'no movement row when the location did not change',
      noMovement.data?.length === 0,
      `got ${noMovement.data?.length}`,
    );
  }

  console.log('\nReturn');
  {
    const early = await admin.rpc('return_asset', {
      p_asset: monitor,
      p_date: '2020-01-01',
      p_condition: good,
    });
    check(
      'a return before the assignment date is rejected',
      early.error?.message === 'Return date cannot be before the assignment date',
      early.error?.message,
    );

    const returned = await admin.rpc('return_asset', {
      p_asset: monitor,
      p_date: TODAY,
      p_condition: good,
      p_notes: 'Back in the HO store room',
    });
    check('return closes the assignment', Boolean(returned.data), returned.error?.message);

    const after = await detailOf('MON122-24-205');
    check('the asset status becomes Available', after.statusName === 'Available', after.statusName);
    check('the holder is cleared', after.assignedToName === null, after.assignedToName);

    const { data: asg } = await admin
      .from('assignments')
      .select('state, returned_date')
      .eq('id', returned.data)
      .single();
    check('the assignment row is marked returned', asg?.state === 'returned', asg?.state);
    check('the return date is recorded', asg?.returned_date === TODAY, asg?.returned_date);

    const again = await admin.rpc('return_asset', {
      p_asset: monitor,
      p_date: TODAY,
      p_condition: good,
    });
    check(
      'returning an unassigned asset is rejected',
      again.error?.message === 'This asset has no active assignment',
      again.error?.message,
    );
  }

  console.log('\nAuto-generate BAST — the number comes from the database');
  {
    const assigned = await admin.rpc('assign_asset', {
      p_asset: monitor,
      p_account: dewi.id,
      p_location: HO.id,
      p_date: TODAY,
      p_auto_bast: true,
    });
    const number = assigned.data?.[0]?.bast_number;
    check(
      'the BAST number matches BAST/CITE/<year>/<seq>',
      /^BAST\/CITE\/\d{4}\/\d{4}$/.test(number ?? ''),
      number,
    );
    check(
      'it continues the sequence past the seeded numbers',
      Number((number ?? '').split('/')[3]) > 182,
      number,
    );

    const { data: bast } = await admin
      .from('bast')
      .select('status, assignment_id, asset_id, account_id')
      .eq('bast_number', number)
      .single();
    check('the BAST is created as a draft', bast?.status === 'draft', bast?.status);
    check(
      'it is linked to the assignment it documents',
      bast?.assignment_id === assigned.data[0].assignment_id,
    );

    // Put the monitor back the way the seed left it.
    await admin.rpc('return_asset', { p_asset: monitor, p_date: TODAY, p_condition: good });
    const after = await detailOf('MON122-24-205');
    check(
      'cleanup left the monitor Available and unassigned',
      after.statusName === 'Available' && after.assignedToName === null,
    );
  }

  console.log('\nMovement — README § Transfer / Movement');
  {
    const sameLocation = await admin.rpc('record_movement', {
      p_asset: broken,
      p_to_location: HO.id,
      p_reason: 'redeployment',
    });
    check(
      'destination must differ from origin',
      sameLocation.error?.message === 'Destination must be different from the origin',
      sameLocation.error?.message,
    );

    const noReason = await admin.rpc('record_movement', {
      p_asset: broken,
      p_to_location: SITE.id,
      p_reason: '  ',
    });
    check(
      'a reason is required',
      noReason.error?.message === 'Select a reason',
      noReason.error?.message,
    );

    const moved = await admin.rpc('record_movement', {
      p_asset: broken,
      p_to_location: SITE.id,
      p_reason: 'repair',
      p_remarks: 'To the site workshop for a motherboard swap',
    });
    check('the movement is recorded', Boolean(moved.data), moved.error?.message);

    const after = await detailOf('LPT099-21-004');
    check(
      'the asset location follows the movement',
      after.locationName === 'Site',
      after.locationName,
    );

    const history = await admin.rpc('movement_history', { p_locations: scope, p_asset: broken });
    const newest = history.data?.[0];
    check(
      'the rail reads Origin → Destination',
      newest?.from_location === 'Head Office' && newest?.to_location === 'Site',
      JSON.stringify(newest),
    );
    check(
      'the rail carries date, user, reason and remarks',
      Boolean(
        newest?.moved_at &&
        newest?.moved_by_name === 'Dewi Lestari' &&
        newest?.reason === 'repair' &&
        newest?.remarks?.startsWith('To the site workshop'),
      ),
      JSON.stringify(newest),
    );

    const audit = await admin
      .from('audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('action', 'movement_recorded');
    check('movements are audited', (audit.count ?? 0) >= 2, `got ${audit.count}`);

    console.log('\n  Append-only — the acceptance criterion, from a real client token');
    const rawUpdate = await admin
      .from('movements')
      .update({ reason: 'tampered' })
      .eq('id', moved.data)
      .select();
    check(
      'a raw UPDATE on movements fails',
      Boolean(rawUpdate.error),
      rawUpdate.error?.message ?? 'no error returned',
    );

    const rawDelete = await admin.from('movements').delete().eq('id', moved.data).select();
    check(
      'a raw DELETE on movements fails',
      Boolean(rawDelete.error),
      rawDelete.error?.message ?? 'no error returned',
    );

    const stillThere = await admin.rpc('movement_history', { p_locations: scope, p_asset: broken });
    check(
      'the row survived both attempts, unchanged',
      stillThere.data?.[0]?.id === moved.data && stillThere.data[0].reason === 'repair',
    );

    // Move it home again so scope counts match the seed on the next run.
    const back = await admin.rpc('record_movement', {
      p_asset: broken,
      p_to_location: HO.id,
      p_reason: 'redeployment',
      p_remarks: 'Returned to Head Office after the test run',
    });
    check('cleanup moved it back', Boolean(back.data), back.error?.message);
    const restored = await detailOf('LPT099-21-004');
    check('the asset is at Head Office again', restored.locationName === 'Head Office');
  }

  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
