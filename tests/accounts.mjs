/**
 * Account management — migration 0017 and the manage-account Edge Function.
 *
 * Client instruction, 2026-07-30: "nanti barulah saat bikin akun akunnya bisa
 * di custom apakah akunnya dapat di loginkan atau tidak. jadi admin rolenya
 * superadmin, sedangkan yang lain bisa admin saja atau rolenya".
 *
 * What matters here, in order:
 *
 *   1. Only a Super Admin can manage accounts, and the check happens in the
 *      database — not in the app, and not in the Edge Function's own opinion.
 *   2. The last Super Admin cannot be demoted, deactivated or locked out.
 *      Without that rule one mistap makes the system unadministrable.
 *   3. A person who cannot log in is a normal, complete record.
 *   4. Issuing credentials really does produce a usable sign-in, and revoking
 *      them really does stop it. Both are checked by signing in for real.
 *
 * REPEATABILITY
 * -------------
 * Every account here is created by the run and carries a timestamp in its
 * email, so nothing collides. Accounts created are deactivated at the end
 * rather than deleted — `accounts` has no delete grant, and rows are referenced
 * by assignments and BAST.
 *
 *   supabase start && supabase db reset
 *   npm run test:accounts
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

async function clientFor(email, password = PASSWORD) {
  const supabase = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign in failed for ${email}: ${error.message}`);
  return supabase;
}

/** Returns the error message instead of throwing, for the negative cases. */
async function trySignIn(email, password) {
  const supabase = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { ok: Boolean(data?.session), message: error?.message };
}

async function run() {
  if (!ANON) {
    console.error('EXPO_PUBLIC_SUPABASE_ANON_KEY is not set.');
    process.exit(1);
  }

  const admin = await clientFor('dewi.lestari@cite.co.id');
  const {
    data: { session },
  } = await admin.auth.getSession();

  const manage = (body) =>
    fetch(`${URL}/functions/v1/manage-account`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: ANON,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

  const { data: locations } = await admin.from('locations').select('id, code');
  const HO = locations.find((l) => l.code === 'HO').id;

  const stamp = Date.now();
  const created = [];

  async function newPerson(fields) {
    const result = await admin.rpc('create_account', {
      p_full_name: fields.name,
      p_nik: fields.nik ?? null,
      p_email: fields.email ?? null,
      p_phone: null,
      p_department: null,
      p_location: fields.location ?? null,
      p_role: fields.role ?? null,
      p_can_login: false,
    });
    if (result.error) throw new Error(`create_account: ${result.error.message}`);
    created.push(result.data.id);
    return result.data.id;
  }

  console.log('\nA person who never signs in is a complete record');
  {
    const id = await newPerson({ name: `Record Only ${stamp}`, nik: `NIK-${stamp}` });
    const list = await admin.rpc('accounts_list', { p_search: `Record Only ${stamp}` });
    const row = list.data?.[0];
    check('they are created', Boolean(id));
    check('with no role and no login', row?.role === null && row?.can_login === false);
    check('and no credentials behind them', row?.has_credentials === false);
    check('they are active', row?.is_active === true, JSON.stringify(row));

    // They exist so a BAST can name them — that is the whole reason for the
    // record-only case, so it is worth asserting rather than assuming.
    const assignable = await admin.rpc('assignable_employees', { p_locations: [HO] });
    check(
      'and they can still be assigned an asset',
      (assignable.data ?? []).some((e) => e.id === id),
      'not offered in the assign picker',
    );
  }

  console.log('\nA login needs a role and an email');
  {
    const noRole = await admin.rpc('create_account', {
      p_full_name: `Bad Login ${stamp}`,
      p_nik: null,
      p_email: `bad-${stamp}@aspire.id`,
      p_phone: null,
      p_department: null,
      p_location: null,
      p_role: null,
      p_can_login: true,
    });
    check('no role is refused', Boolean(noRole.error), noRole.error?.message);

    const noEmail = await admin.rpc('create_account', {
      p_full_name: `Bad Login 2 ${stamp}`,
      p_nik: null,
      p_email: null,
      p_phone: null,
      p_department: null,
      p_location: null,
      p_role: 'corporate_it',
      p_can_login: true,
    });
    check('no email is refused', Boolean(noEmail.error), noEmail.error?.message);

    const noLocation = await admin.rpc('create_account', {
      p_full_name: `Bad Login 3 ${stamp}`,
      p_nik: null,
      p_email: `bad3-${stamp}@aspire.id`,
      p_phone: null,
      p_department: null,
      p_location: null,
      p_role: 'site_it',
      p_can_login: false,
    });
    check(
      'a location-bound role without a location is refused',
      Boolean(noLocation.error),
      noLocation.error?.message,
    );

    const badRole = await admin.rpc('create_account', {
      p_full_name: `Bad Login 4 ${stamp}`,
      p_nik: null,
      p_email: null,
      p_phone: null,
      p_department: null,
      p_location: null,
      p_role: 'wizard',
      p_can_login: false,
    });
    check('an unknown role is refused', Boolean(badRole.error), badRole.error?.message);
  }

  console.log('\nIssuing a sign-in produces one that really works');
  const email = `viewer-${stamp}@aspire.id`;
  const secret = 'Aspire123!test';
  let viewerId;
  {
    viewerId = await newPerson({
      name: `Issued Viewer ${stamp}`,
      email,
      role: 'viewer',
      location: HO,
    });

    const before = await trySignIn(email, secret);
    check('there is nothing to sign in with yet', !before.ok, before.message);

    const short = await manage({ accountId: viewerId, action: 'enable', password: 'abc' });
    check('a short password is refused', short.status === 400, `HTTP ${short.status}`);

    const enabled = await manage({ accountId: viewerId, action: 'enable', password: secret });
    check('the sign-in is created', enabled.ok, JSON.stringify(await enabled.clone().json()));

    const after = await trySignIn(email, secret);
    check('and it actually signs in', after.ok, after.message);

    // link_auth_user_to_account() (migration 0004) is what ties the new auth
    // user to the waiting row. If the order were wrong this is what would fail.
    const list = await admin.rpc('accounts_list', { p_search: email });
    const row = list.data?.[0];
    check('the account is linked to the auth user', row?.has_credentials === true);
    check('and marked as able to log in', row?.can_login === true);

    const session2 = await clientFor(email, secret);
    const boot = await session2.rpc('bootstrap_session');
    check(
      'the new user gets the role they were given',
      boot.data?.account?.role === 'viewer',
      JSON.stringify(boot.data?.account),
    );
  }

  console.log('\nResetting and revoking');
  {
    const next = 'Aspire456!test';
    const reset = await manage({ accountId: viewerId, action: 'reset', password: next });
    check('the password can be changed', reset.ok);

    const oldOne = await trySignIn(email, secret);
    check('the old password stops working', !oldOne.ok, oldOne.message);

    const newOne = await trySignIn(email, next);
    check('the new one works', newOne.ok, newOne.message);

    const revoked = await manage({ accountId: viewerId, action: 'disable' });
    check('the sign-in can be removed', revoked.ok);

    const afterRevoke = await trySignIn(email, next);
    check('and then nothing signs in', !afterRevoke.ok, afterRevoke.message);

    const list = await admin.rpc('accounts_list', { p_search: email });
    check('the person is still on the register', (list.data ?? []).length === 1);
    check(
      'just without a login',
      list.data?.[0]?.can_login === false && list.data?.[0]?.has_credentials === false,
      JSON.stringify(list.data?.[0]),
    );

    const nothingToReset = await manage({
      accountId: viewerId,
      action: 'reset',
      password: 'Aspire789!test',
    });
    check(
      'resetting a password that does not exist is refused',
      nothingToReset.status === 400,
      `HTTP ${nothingToReset.status}`,
    );
  }

  console.log('\nThe last Super Admin cannot be locked out');
  {
    const me = await admin.rpc('accounts_list', { p_search: 'Dewi Lestari' });
    const dewi = me.data?.[0];
    check('the seeded Super Admin is found', dewi?.role === 'super_admin', JSON.stringify(dewi));

    const others = await admin.rpc('other_super_admins', { p_except: dewi.id });
    check(
      'and is currently the only one',
      others.error ? false : others.data === 0,
      others.error?.message ?? `${others.data} others`,
    );

    const demote = await admin.rpc('update_account', {
      p_id: dewi.id,
      p_full_name: dewi.full_name,
      p_nik: dewi.nik,
      p_email: dewi.email,
      p_phone: dewi.phone,
      p_department: dewi.department_id,
      p_location: dewi.location_id,
      p_role: 'viewer',
      p_can_login: null,
      p_is_active: null,
    });
    check('demoting them is refused', Boolean(demote.error), demote.error?.message);

    const deactivate = await admin.rpc('update_account', {
      p_id: dewi.id,
      p_full_name: dewi.full_name,
      p_nik: dewi.nik,
      p_email: dewi.email,
      p_phone: dewi.phone,
      p_department: dewi.department_id,
      p_location: dewi.location_id,
      p_role: 'super_admin',
      p_can_login: null,
      p_is_active: false,
    });
    check('deactivating them is refused', Boolean(deactivate.error), deactivate.error?.message);

    const strip = await manage({ accountId: dewi.id, action: 'disable' });
    check('and removing their sign-in is refused', strip.status === 400, `HTTP ${strip.status}`);

    const stillIn = await trySignIn('dewi.lestari@cite.co.id', PASSWORD);
    check('they can still sign in afterwards', stillIn.ok, stillIn.message);

    // With a second Super Admin in place the rule stops applying, which is what
    // makes it a guard rather than a permanent lock.
    const secondId = await newPerson({
      name: `Second Admin ${stamp}`,
      email: `second-${stamp}@aspire.id`,
      role: 'super_admin',
    });
    await manage({ accountId: secondId, action: 'enable', password: 'Aspire123!two' });

    const nowDemote = await admin.rpc('update_account', {
      p_id: dewi.id,
      p_full_name: dewi.full_name,
      p_nik: dewi.nik,
      p_email: dewi.email,
      p_phone: dewi.phone,
      p_department: dewi.department_id,
      p_location: dewi.location_id,
      p_role: 'viewer',
      p_can_login: null,
      p_is_active: null,
    });
    check(
      'with a second Super Admin, demoting the first is allowed',
      !nowDemote.error,
      nowDemote.error?.message,
    );

    // Put it back so the rest of the suite still has its Super Admin.
    const secondAdmin = await clientFor(`second-${stamp}@aspire.id`, 'Aspire123!two');
    const restore = await secondAdmin.rpc('update_account', {
      p_id: dewi.id,
      p_full_name: dewi.full_name,
      p_nik: dewi.nik,
      p_email: dewi.email,
      p_phone: dewi.phone,
      p_department: dewi.department_id,
      p_location: dewi.location_id,
      p_role: 'super_admin',
      p_can_login: null,
      p_is_active: null,
    });
    check('and the role can be restored', !restore.error, restore.error?.message);

    await secondAdmin.rpc('update_account', {
      p_id: secondId,
      p_full_name: `Second Admin ${stamp}`,
      p_nik: null,
      p_email: `second-${stamp}@aspire.id`,
      p_phone: null,
      p_department: null,
      p_location: null,
      p_role: 'viewer',
      p_can_login: null,
      p_is_active: false,
    });
  }

  console.log('\nOnly a Super Admin may manage accounts');
  {
    for (const [label, who] of [
      ['Corporate IT', 'budi.santoso@cite.co.id'],
      ['Site IT', 'siti.rahayu@cite.co.id'],
      ['a Viewer', 'andi.prasetyo@cite.co.id'],
    ]) {
      let client;
      try {
        client = await clientFor(who);
      } catch {
        continue; // not in this seed
      }

      const attempt = await client.rpc('create_account', {
        p_full_name: `Sneaky ${label} ${stamp}`,
        p_nik: null,
        p_email: null,
        p_phone: null,
        p_department: null,
        p_location: null,
        p_role: null,
        p_can_login: false,
      });
      check(`${label} cannot create an account`, Boolean(attempt.error), attempt.error?.message);

      // The Edge Function must reach the same answer, and it must reach it
      // using the caller's token rather than its own privileged key.
      const {
        data: { session: theirs },
      } = await client.auth.getSession();
      const viaFunction = await fetch(`${URL}/functions/v1/manage-account`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${theirs.access_token}`,
          apikey: ANON,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accountId: viewerId, action: 'enable', password: 'Aspire999!x' }),
      });
      check(
        `${label} cannot issue credentials either`,
        !viaFunction.ok,
        `HTTP ${viaFunction.status}`,
      );
    }

    // The row itself is closed too, so a Super Admin cannot skip the guards by
    // writing it directly (working rule #2).
    const direct = await admin.from('accounts').update({ role: 'viewer' }).eq('id', viewerId);
    check(
      'even a Super Admin cannot write the row directly',
      Boolean(direct.error),
      direct.error?.message ?? 'the update succeeded',
    );
  }

  // Leave the register tidy: deactivate what this run created.
  for (const id of created) {
    const row = (await admin.rpc('accounts_list', { p_search: '' })).data?.find((a) => a.id === id);
    if (!row || !row.is_active) continue;
    await admin.rpc('update_account', {
      p_id: id,
      p_full_name: row.full_name,
      p_nik: row.nik,
      p_email: row.email,
      p_phone: row.phone,
      p_department: row.department_id,
      p_location: row.location_id,
      p_role: row.role,
      p_can_login: null,
      p_is_active: false,
    });
  }

  console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
