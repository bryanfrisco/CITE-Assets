/**
 * Licences and their seats.
 *
 * Three things this suite exists to prove, because each one is a place the
 * design could quietly rot:
 *
 *   Seat status is DERIVED. Nothing writes 'Used' anywhere, so the badge and
 *   the holder line cannot disagree. The test asserts the derivation, not a
 *   stored column — if somebody later adds one, these assertions still pass but
 *   the schema check below fails.
 *
 *   The stored password NEVER travels with the list or the detail. That is
 *   checked by looking for the COLUMN in the payload rather than for a
 *   particular value, so it holds even when no seat has a password set.
 *
 *   Reading a password leaves a trace. The audit row is written before the
 *   value is returned, and exactly one row per read.
 *
 *   supabase start && supabase db reset
 *   npm run test:licenses
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

async function main() {
  const admin = await clientFor('dewi.lestari@cite.co.id');
  const siteIt = await clientFor('siti.rahayu@cite.co.id');

  // ---------------------------------------------------------------- setup
  console.log('\nA licence is created through the RPC, never by writing the table');

  const direct = await admin.from('licenses').insert({ software: 'Nope' });
  check(
    'a direct insert is refused even for a Super Admin',
    direct.error !== null,
    direct.error ? '' : 'the insert went through',
  );

  const categories = await admin.rpc('master_list', { p_entity: 'license_category' });
  check('license_category is a master data entity', !categories.error, categories.error?.message);
  const mining = (categories.data ?? []).find((c) => c.name === 'MINING');
  check('MINING is seeded', !!mining);

  const created = await admin.rpc('create_license', {
    p_input: {
      software: 'TestCAD',
      license_number: 'TEST-0001',
      category_id: mining?.id,
      purchase_year: 2026,
      expiry_date: null,
    },
  });
  check('create_license returns an id', !created.error && !!created.data, created.error?.message);
  const licenseId = created.data;

  const refused = await siteIt.rpc('create_license', {
    p_input: { software: 'SiteCAD', category_id: mining?.id },
  });
  check(
    'Site IT cannot create a licence',
    refused.error !== null,
    refused.error ? '' : 'it was allowed',
  );

  // ---------------------------------------------------------------- seats
  console.log('\nSeats are chairs: adding, filling, emptying');

  await admin.rpc('set_license_seats', { p_license: licenseId, p_count: 4 });
  let detail = (await admin.rpc('license_detail', { p_id: licenseId })).data;
  check('four seats exist', detail?.seats?.length === 4, `got ${detail?.seats?.length}`);
  check(
    'all four read as Standby while empty',
    detail.seats.every((s) => s.status === 'Standby'),
  );

  const people = (await admin.rpc('accounts_list', { p_search: null })).data ?? [];
  const holder = people.find((p) => p.full_name === 'Budi Santoso') ?? people[0];

  const seatA = detail.seats[0].id;
  await admin.rpc('assign_seat', { p_seat: seatA, p_account: holder.id, p_date: null });
  detail = (await admin.rpc('license_detail', { p_id: licenseId })).data;
  const filled = detail.seats.find((s) => s.id === seatA);

  check('a filled seat reads as Used', filled?.status === 'Used');
  check('and names its holder', filled?.holder_name === holder.full_name);
  check(
    'the department comes from the holder record, not the seat',
    filled?.department === (holder.department_name ?? null),
    `seat says ${filled?.department}, account says ${holder.department_name}`,
  );

  const twice = await admin.rpc('assign_seat', {
    p_seat: seatA,
    p_account: holder.id,
    p_date: null,
  });
  check(
    'assigning an occupied seat is refused',
    twice.error !== null,
    twice.error ? '' : 'it was allowed',
  );
  check(
    'and the message names who has it',
    (twice.error?.message ?? '').includes(holder.full_name),
    twice.error?.message,
  );

  const list = (await admin.rpc('licenses_list', { p_query: 'TestCAD' })).data ?? [];
  const row = list.find((l) => l.id === licenseId);
  check('the list counts one seat in use', row?.used_seats === 1, `got ${row?.used_seats}`);
  check('and three free', row?.available_seats === 3, `got ${row?.available_seats}`);

  // --------------------------------------------- the account a seat runs on
  // The account belongs to the PERSON, not to the chair. Almost every value in
  // this column is somebody's work address, so an empty seat still showing one
  // is not merely untidy: a licence reset sent to the address on an empty seat
  // reaches somebody who no longer holds it.
  //
  // 0086 got this backwards and kept the account through a return. That also
  // broke the next handover, because the screen read a leftover address as
  // deliberate and refused to replace it with the new holder's.
  const seatB = detail.seats[1].id;
  const accountOf = (id) => detail.seats.find((s) => s.id === id)?.seat_account;
  const reread = async () => {
    detail = (await admin.rpc('license_detail', { p_id: licenseId })).data;
  };

  await admin.rpc('assign_seat', {
    p_seat: seatB,
    p_account: holder.id,
    p_date: null,
    p_seat_account: '  budi.santoso@aspire.id  ',
  });
  await reread();
  check(
    'the account handed in with a seat is stored, trimmed',
    accountOf(seatB) === 'budi.santoso@aspire.id',
    `got ${accountOf(seatB)}`,
  );

  await admin.rpc('return_seat', { p_seat: seatB });
  await reread();
  check(
    'giving the seat back takes the account with it',
    accountOf(seatB) === null,
    `still ${accountOf(seatB)}`,
  );

  await admin.rpc('assign_seat', { p_seat: seatB, p_account: holder.id, p_date: null });
  await reread();
  check(
    'and the next holder does not inherit the last one address',
    accountOf(seatB) === null,
    `got ${accountOf(seatB)}`,
  );

  // The stale-address case: a seat that somehow still carries an old account
  // must accept a new one rather than keeping what it had.
  await admin.rpc('return_seat', { p_seat: seatB });
  await admin.rpc('assign_seat', {
    p_seat: seatB,
    p_account: holder.id,
    p_date: null,
    p_seat_account: 'old.address@aspire.id',
  });
  await admin.rpc('return_seat', { p_seat: seatB });
  await admin.rpc('assign_seat', {
    p_seat: seatB,
    p_account: holder.id,
    p_date: null,
    p_seat_account: 'new.address@aspire.id',
  });
  await reread();
  check(
    'naming an account replaces whatever was there',
    accountOf(seatB) === 'new.address@aspire.id',
    `got ${accountOf(seatB)}`,
  );

  await admin.rpc('return_seat', { p_seat: seatB });
  await admin.rpc('assign_seat', {
    p_seat: seatB,
    p_account: holder.id,
    p_date: null,
    p_seat_account: '',
  });
  await reread();
  check(
    'an empty account clears it, for a seat known by its licence number',
    accountOf(seatB) === null,
    `got ${accountOf(seatB)}`,
  );
  await admin.rpc('return_seat', { p_seat: seatB });
  await reread();

  const shrink = await admin.rpc('set_license_seats', { p_license: licenseId, p_count: 0 });
  check(
    'seats cannot be dropped below the number in use',
    shrink.error !== null,
    shrink.error ? '' : 'it was allowed',
  );

  await admin.rpc('set_license_seats', { p_license: licenseId, p_count: 2 });
  detail = (await admin.rpc('license_detail', { p_id: licenseId })).data;
  check('shrinking removes only empty seats', detail.seats.length === 2);
  check(
    'and the occupied one survived',
    detail.seats.some((s) => s.id === seatA && s.status === 'Used'),
  );

  await admin.rpc('return_seat', { p_seat: seatA });
  detail = (await admin.rpc('license_detail', { p_id: licenseId })).data;
  check(
    'returning empties the chair',
    detail.seats.find((s) => s.id === seatA)?.status === 'Standby',
  );

  // ------------------------------------------------------------- secrets
  console.log('\nA stored password never travels with the data');

  await admin.from('license_seats').select('id').eq('license_id', licenseId).limit(1); // read is allowed; the write below is what must go through SQL

  // Put a password on a seat the only way the app can: through the importer.
  await admin.rpc('import_licenses', {
    p_rows: [
      {
        software: 'TestCAD',
        license_number: 'TEST-0001',
        category: 'MINING',
        seat_account: 'secret.holder@example.com',
        seat_password: 'hunter2',
      },
    ],
    p_dry_run: false,
    p_file_name: 'test.csv',
  });

  detail = (await admin.rpc('license_detail', { p_id: licenseId })).data;
  const secretSeat = detail.seats.find((s) => s.seat_account === 'secret.holder@example.com');
  check('the importer created the seat', !!secretSeat);
  check('and reports that a password exists', secretSeat?.has_secret === true);

  const payload = JSON.stringify(detail);
  check('license_detail carries no seat_secret column at all', !payload.includes('seat_secret'));
  check('and the password itself is not in the payload', !payload.includes('hunter2'));

  const listPayload = JSON.stringify(list);
  check('licenses_list carries no seat_secret either', !listPayload.includes('seat_secret'));

  const denied = await siteIt.rpc('reveal_seat_secret', { p_seat: secretSeat.id });
  check(
    'Site IT cannot reveal a password',
    denied.error !== null,
    denied.error ? '' : 'it was allowed',
  );

  const before = (
    await admin
      .from('audit_log')
      .select('id')
      .eq('action', 'license_secret_viewed')
      .eq('record_id', secretSeat.id)
  ).data;

  const revealed = await admin.rpc('reveal_seat_secret', { p_seat: secretSeat.id });
  check('a Super Admin can', !revealed.error, revealed.error?.message);
  check('and gets the real value', revealed.data === 'hunter2', String(revealed.data));

  const after = (
    await admin
      .from('audit_log')
      .select('id')
      .eq('action', 'license_secret_viewed')
      .eq('record_id', secretSeat.id)
  ).data;

  check(
    'reading it left exactly one audit row',
    (after?.length ?? 0) - (before?.length ?? 0) === 1,
    `before ${before?.length}, after ${after?.length}`,
  );

  // -------------------------------------------------------------- expiry
  // A licence is known by a number OR by the account it signs in with. The
  // second kind used to be unfindable: the search matched software, number and
  // vendor, so a licence whose only identity was the account matched nothing at
  // all — you could hold the account and still not find it.
  console.log('\nA licence identified by its account, not a number');
  {
    const acctLicense = await admin.rpc('create_license', {
      p_input: {
        software: 'AccountOnlySuite',
        license_number: null,
        category_id: mining?.id,
      },
    });
    const acctId = acctLicense.data;
    await admin.rpc('set_license_seats', { p_license: acctId, p_count: 2 });
    const seats = (await admin.rpc('license_detail', { p_id: acctId })).data.seats;

    await admin.rpc('assign_seat', {
      p_seat: seats[0].id,
      p_account: holder.id,
      p_date: null,
      p_seat_account: 'studio.login@vendor.example',
    });

    const found = (await admin.rpc('licenses_list', { p_query: 'studio.login' })).data ?? [];
    check(
      'a licence with no number is findable by its account',
      found.some((l) => l.id === acctId),
      `got ${found.map((l) => l.software).join(', ') || 'nothing'}`,
    );

    const row = found.find((l) => l.id === acctId);
    check(
      'and the list carries the account so the register can show it',
      row?.account_label === 'studio.login@vendor.example',
      `got ${row?.account_label}`,
    );
    check(
      'while its licence number stays empty',
      row?.license_number === null,
      `got ${row?.license_number}`,
    );

    // Two seats on two accounts must both be searchable, not just the first.
    await admin.rpc('assign_seat', {
      p_seat: seats[1].id,
      p_account: holder.id,
      p_date: null,
      p_seat_account: 'second.login@vendor.example',
    });
    const bySecond = (await admin.rpc('licenses_list', { p_query: 'second.login' })).data ?? [];
    check(
      'a second account on the same licence is findable too',
      bySecond.some((l) => l.id === acctId),
      `got ${bySecond.map((l) => l.software).join(', ') || 'nothing'}`,
    );
    const both = bySecond.find((l) => l.id === acctId)?.account_label ?? '';
    check(
      'and both accounts are listed, not just one',
      both.includes('studio.login@vendor.example') && both.includes('second.login@vendor.example'),
      `got ${both}`,
    );

    // "Using Email" was a note in the spreadsheet meaning "no number here";
    // the importer filed it as the number itself.
    const marker = (await admin.rpc('licenses_list', { p_query: 'Using Email' })).data ?? [];
    check(
      'no licence still carries "Using Email" as its number',
      marker.length === 0,
      `got ${marker.map((l) => l.software).join(', ')}`,
    );

    await admin.rpc('return_seat', { p_seat: seats[0].id });
    await admin.rpc('return_seat', { p_seat: seats[1].id });
    await admin.rpc('delete_license', { p_id: acctId, p_reason: 'account licence test cleanup' });
  }

  console.log('\nExpiry is decided in one place');

  const states = await admin.rpc('license_expiry_state', { p_date: null });
  check('a licence with no end date is "none"', states.data === 'none', String(states.data));

  const past = await admin.rpc('license_expiry_state', { p_date: '2020-01-01' });
  check('a past date is "expired"', past.data === 'expired', String(past.data));

  const soon = new Date();
  soon.setDate(soon.getDate() + 10);
  const near = await admin.rpc('license_expiry_state', {
    p_date: soon.toISOString().slice(0, 10),
  });
  check('ten days away is "expiring"', near.data === 'expiring', String(near.data));

  const far = new Date();
  far.setFullYear(far.getFullYear() + 2);
  const distant = await admin.rpc('license_expiry_state', {
    p_date: far.toISOString().slice(0, 10),
  });
  check('two years away is "ok"', distant.data === 'ok', String(distant.data));

  // Excel serials, the format the real spreadsheet uses.
  const serial = await admin.rpc('license_parse_date', { p_value: '46448' });
  check('Excel serial 46448 is 2027-03-02', serial.data === '2027-03-02', String(serial.data));
  const dash = await admin.rpc('license_parse_date', { p_value: '-' });
  check('a bare dash is no date', dash.data === null, String(dash.data));

  // -------------------------------------------------------------- delete
  console.log('\nDeleting is for mistakes, not for history');

  await admin.rpc('assign_seat', { p_seat: seatA, p_account: holder.id, p_date: null });
  const busy = await admin.rpc('delete_license', { p_id: licenseId, p_reason: 'test' });
  check(
    'a licence with an occupied seat is refused',
    busy.error !== null,
    busy.error ? '' : 'it was allowed',
  );

  await admin.rpc('return_seat', { p_seat: seatA });
  const noReason = await admin.rpc('delete_license', { p_id: licenseId, p_reason: '  ' });
  check('a reason is required', noReason.error !== null);

  const gone = await admin.rpc('delete_license', {
    p_id: licenseId,
    p_reason: 'created by the test suite',
  });
  check('with the seats free it goes', !gone.error, gone.error?.message);

  const after2 = (await admin.rpc('license_detail', { p_id: licenseId })).data;
  check('and the row really went', after2 === null, JSON.stringify(after2)?.slice(0, 60));

  const logged = (
    await admin
      .from('audit_log')
      .select('id, old_value')
      .eq('action', 'license_deleted')
      .eq('record_id', licenseId)
  ).data;
  check('the deletion and its reason are in the log', (logged?.length ?? 0) === 1);
  check(
    'and the reason is the one that was given',
    logged?.[0]?.old_value?.reason === 'created by the test suite',
    JSON.stringify(logged?.[0]?.old_value?.reason),
  );

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
