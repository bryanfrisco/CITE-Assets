/**
 * E-BAST digital signature — migration 0015.
 *
 * Client instruction, 2026-07-30: "ganti BAST menjadi E-BAST yang serba
 * digital" and "saya mau ttd digital dengan langsung tanda tangan dari layar
 * secara langsung".
 *
 * What is asserted here, in the order it matters:
 *
 *   1. A signature cannot be forged. bast_signatures has no insert grant, so
 *      the only way in is sign_bast(), which validates the strokes.
 *   2. A signature cannot be erased. The table is append-only three ways, and
 *      re-signing adds a row rather than replacing one.
 *   3. "Signed" still means a document exists. Recording both signatures does
 *      NOT flip the status; only finalising the PDF does.
 *   4. The ink actually reaches the paper — the finalised PDF is fetched back
 *      out of the private bucket and checked for the stroke operators.
 *
 * REPEATABILITY
 * -------------
 * A fresh BAST is raised for this run through assign_asset(), so nothing here
 * depends on seed totals. The BAST and its signatures are not cleaned up and
 * cannot be: both are append-only. Nothing asserts a count, so a second run
 * passes.
 *
 *   supabase start && supabase db reset
 *   npm run test:signature
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

/**
 * A plausible signature: two strokes of 40 points each, inside the normalised
 * box (x 0..1, y 0..1/2.6). Sine waves rather than straight lines so the
 * bounding-box fit in the renderer has a real height to work with.
 */
function scribble(seed = 0) {
  const stroke = (offset) =>
    Array.from({ length: 40 }, (_, i) => {
      const x = 0.08 + (i / 39) * 0.84;
      const y = 0.19 + Math.sin(i / 4 + offset + seed) * 0.11;
      return [Number(x.toFixed(4)), Number(y.toFixed(4))];
    });
  return [stroke(0), stroke(1.6)];
}

async function run() {
  if (!ANON) {
    console.error('EXPO_PUBLIC_SUPABASE_ANON_KEY is not set.');
    process.exit(1);
  }

  const admin = await clientFor('dewi.lestari@cite.co.id');

  const { data: locations } = await admin.from('locations').select('id, code');
  const HO = locations.find((l) => l.code === 'HO').id;
  const scope = locations.map((l) => l.id);

  const SITE = locations.find((l) => l.code === 'SITE').id;

  const { data: categories } = await admin.from('categories').select('id').limit(1);
  const { data: statuses } = await admin.from('asset_statuses').select('id, name');
  const { data: conditions } = await admin.from('asset_conditions').select('id, name');
  const available = statuses.find((s) => s.name === 'Available').id;
  const good = conditions.find((c) => c.name === 'Good').id;

  const stamp = Date.now();

  /**
   * Raises a BAST on an asset created for this run.
   *
   * Deliberately not "take the first available asset": that couples the suite
   * to how many assets the seed happens to leave unassigned, and the second run
   * would find none left.
   */
  async function raiseBast(location, label) {
    const created = await admin.rpc('create_asset', {
      p_name: `E-BAST Signature Test ${label}`,
      p_category: categories[0].id,
      p_serial: `SN-SIG-${label}-${stamp}`,
      p_location: location,
      p_status: available,
      p_condition: good,
    });
    if (created.error) throw new Error(`create_asset: ${created.error.message}`);

    const { data: employees } = await admin.rpc('assignable_employees', {
      p_locations: [location],
    });
    if (!employees?.length) throw new Error(`No employee to assign to at ${label}`);

    const assigned = await admin.rpc('assign_asset', {
      p_asset: created.data.id,
      p_account: employees[0].id,
      p_location: location,
      p_date: new Date().toISOString().slice(0, 10),
      p_expected_return: null,
      p_notes: 'E-BAST signature test',
      p_auto_bast: true,
    });
    if (assigned.error) throw new Error(`assign_asset: ${assigned.error.message}`);

    const { data: row } = await admin
      .from('bast')
      .select('id')
      .eq('bast_number', assigned.data[0].bast_number)
      .single();
    return row.id;
  }

  const bastId = await raiseBast(HO, 'HO');
  check('assigning with auto-BAST produced a BAST', Boolean(bastId));

  console.log('\nThe signatory list is customisable');
  {
    const name = `Test Signatory ${Date.now()}`;
    const added = await admin.rpc('add_bast_signatory', {
      p_name: name,
      p_title: 'IT Support Officer',
      p_department: null,
    });
    check(
      'a person can be added',
      !added.error && added.data?.created === true,
      added.error?.message,
    );

    // The client asked for "harus ditambahkan jika tidak ada" — adding the same
    // person twice must not be a dead end.
    const again = await admin.rpc('add_bast_signatory', {
      p_name: name.toUpperCase(),
      p_title: null,
      p_department: null,
    });
    check(
      'adding the same person again reactivates instead of failing',
      !again.error && again.data?.created === false && again.data?.id === added.data?.id,
      again.error?.message,
    );

    const list = await admin.rpc('bast_signatories_list');
    check(
      'the picker shows them with their title',
      (list.data ?? []).some((s) => s.full_name === name && s.title === 'IT Support Officer'),
      list.error?.message,
    );

    const blank = await admin.rpc('add_bast_signatory', {
      p_name: '   ',
      p_title: null,
      p_department: null,
    });
    check('a blank name is refused', Boolean(blank.error), blank.error?.message ?? 'accepted');
  }

  console.log('\nA signature cannot be forged');
  {
    const direct = await admin.from('bast_signatures').insert({
      bast_id: bastId,
      role: 'handover',
      signer_name: 'Forged',
      strokes: scribble(),
    });
    check(
      'writing the table directly is refused — sign_bast() is the only way in',
      Boolean(direct.error),
      direct.error?.message ?? 'the insert succeeded',
    );

    const tooShort = await admin.rpc('sign_bast', {
      p_bast: bastId,
      p_role: 'handover',
      p_name: 'Dewi Lestari',
      p_title: 'Corporate IT',
      p_strokes: [[[0.5, 0.2]]],
    });
    check('a stray tap is not a signature', Boolean(tooShort.error), tooShort.error?.message);

    const outOfBounds = await admin.rpc('sign_bast', {
      p_bast: bastId,
      p_role: 'handover',
      p_name: 'Dewi Lestari',
      p_title: 'Corporate IT',
      p_strokes: [scribble()[0].map(([x, y]) => [x * 40, y])],
    });
    check(
      'un-normalised coordinates are refused',
      Boolean(outOfBounds.error),
      outOfBounds.error?.message,
    );

    const malformed = await admin.rpc('sign_bast', {
      p_bast: bastId,
      p_role: 'handover',
      p_name: 'Dewi Lestari',
      p_title: 'Corporate IT',
      p_strokes: [['not', 'a', 'point']],
    });
    check('a malformed path is refused', Boolean(malformed.error), malformed.error?.message);

    const unknownRole = await admin.rpc('sign_bast', {
      p_bast: bastId,
      p_role: 'witness',
      p_name: 'Dewi Lestari',
      p_title: null,
      p_strokes: scribble(),
    });
    check('an unknown role is refused', Boolean(unknownRole.error), unknownRole.error?.message);

    const nameless = await admin.rpc('sign_bast', {
      p_bast: bastId,
      p_role: 'handover',
      p_name: '  ',
      p_title: null,
      p_strokes: scribble(),
    });
    check('signing without a name is refused', Boolean(nameless.error), nameless.error?.message);
  }

  console.log('\nOne signature is not a signed document');
  {
    const first = await admin.rpc('sign_bast', {
      p_bast: bastId,
      p_role: 'handover',
      p_name: 'Dewi Lestari',
      p_title: 'Corporate IT',
      p_strokes: scribble(),
    });
    check('the handover signature is recorded', !first.error, first.error?.message);
    check('it does not claim the document is complete', first.data?.complete === false);

    const detail = await admin.rpc('bast_detail', { p_id: bastId });
    check(
      'the status has NOT become Signed',
      detail.data?.status !== 'signed',
      detail.data?.status,
    );
    check(
      'the strokes come back exactly as they went in',
      JSON.stringify(detail.data?.signatures?.handover?.strokes) === JSON.stringify(scribble()),
    );
    check(
      'the document shows the signer, not the account that held the phone',
      detail.data?.signatures?.handover?.signerName === 'Dewi Lestari' &&
        detail.data?.signatures?.handover?.signerTitle === 'Corporate IT',
    );
    check('the receiver block is still empty', !detail.data?.signatures?.receiver);
  }

  console.log('\nRe-signing keeps the earlier attempt');
  {
    await admin.rpc('sign_bast', {
      p_bast: bastId,
      p_role: 'handover',
      p_name: 'Dewi Lestari',
      p_title: 'Corporate IT Manager',
      p_strokes: scribble(0.7),
    });

    const rows = await admin
      .from('bast_signatures')
      .select('id, signer_title, signed_at')
      .eq('bast_id', bastId)
      .eq('role', 'handover');

    check(
      'both attempts are still in the table',
      (rows.data ?? []).length === 2,
      `${rows.data?.length} rows`,
    );

    const detail = await admin.rpc('bast_detail', { p_id: bastId });
    check(
      'the document shows the newest one',
      detail.data?.signatures?.handover?.signerTitle === 'Corporate IT Manager',
      detail.data?.signatures?.handover?.signerTitle,
    );
  }

  console.log('\nA recorded signature cannot be changed or removed');
  {
    const row = await admin
      .from('bast_signatures')
      .select('id')
      .eq('bast_id', bastId)
      .limit(1)
      .single();

    const updated = await admin
      .from('bast_signatures')
      .update({ signer_name: 'Someone Else' })
      .eq('id', row.data.id);
    check('update is refused', Boolean(updated.error), updated.error?.message ?? 'it updated');

    const deleted = await admin.from('bast_signatures').delete().eq('id', row.data.id);
    check('delete is refused', Boolean(deleted.error), deleted.error?.message ?? 'it deleted');
  }

  console.log('\nFinalising is what makes it Signed');
  {
    const {
      data: { session },
    } = await admin.auth.getSession();

    const invoke = (body) =>
      fetch(`${URL}/functions/v1/generate-bast-pdf`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: ANON,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

    const early = await invoke({ bastId, finalize: true });
    check(
      'finalising before both signatures is refused',
      early.status === 400,
      `HTTP ${early.status}`,
    );

    const second = await admin.rpc('sign_bast', {
      p_bast: bastId,
      p_role: 'receiver',
      p_name: 'Andi Prasetyo',
      p_title: 'Finance',
      p_strokes: scribble(2.2),
    });
    check('the receiver signature is recorded', !second.error, second.error?.message);
    check('it reports the document as complete', second.data?.complete === true);

    const stillDraft = await admin.rpc('bast_detail', { p_id: bastId });
    check(
      'two signatures alone still do not set the status',
      stillDraft.data?.status !== 'signed',
      stillDraft.data?.status,
    );

    const response = await invoke({ bastId, finalize: true });
    const result = await response.json();
    check(
      'the finalised PDF is produced',
      response.ok && result.signed === true,
      JSON.stringify(result),
    );

    const detail = await admin.rpc('bast_detail', { p_id: bastId });
    check('NOW the status is Signed', detail.data?.status === 'signed', detail.data?.status);
    check(
      'the signed version is on top of the history',
      detail.data?.versions?.[0]?.kind === 'signed',
      detail.data?.versions?.[0]?.kind,
    );
    // Nothing generated a draft PDF first here, so the signed document is v1.
    // Versions are numbered from 1 with no gaps either way — that is what the
    // history rail on the detail screen reads.
    const numbers = (detail.data?.versions ?? []).map((v) => v.version).sort((a, b) => a - b);
    check(
      'the versions run from 1 with no gaps',
      numbers.length > 0 && numbers.every((n, i) => n === i + 1),
      numbers.join(','),
    );

    // README § Interactions: the signed file appears on the asset's Documents tab.
    const mirrored = await admin
      .from('documents')
      .select('id, kind, file_path')
      .eq('bast_id', bastId);
    check(
      'it is mirrored into the asset documents',
      (mirrored.data ?? []).some(
        (d) => d.kind === 'signed_bast' && d.file_path === result.filePath,
      ),
      JSON.stringify(mirrored.data),
    );

    const list = await admin.rpc('bast_list', { p_locations: scope });
    check(
      'the list badge says Signed too',
      list.data?.find((b) => b.id === bastId)?.status === 'signed',
    );

    // ---- the ink actually reaches the paper -------------------------------
    const file = await admin.storage.from('bast').download(result.filePath);
    check('the finalised file is in the bucket', !file.error, file.error?.message);

    const text = Buffer.from(await file.data.arrayBuffer()).toString('latin1');
    check('it is a PDF', text.startsWith('%PDF-1.4'), text.slice(0, 12));

    // Round cap and round join are set only by the signature primitive, so
    // their presence is what distinguishes a signed sheet from a blank one.
    check('the signature strokes were drawn', text.includes('1 J') && text.includes('1 j'));
    check(
      'both signatures are on the page',
      (text.match(/Ditandatangani secara elektronik/g) ?? []).length === 2,
    );
    check(
      'the signers are named under the lines',
      text.includes('Dewi Lestari') && text.includes('Andi Prasetyo'),
    );

    const startxref = Number(text.match(/startxref\s+(\d+)/)?.[1]);
    check(
      'the cross-reference offset is correct',
      Number.isFinite(startxref) && text.slice(startxref, startxref + 4) === 'xref',
      `startxref ${startxref}`,
    );
  }

  console.log('\nScope and role still decide who may sign');
  {
    // siti.rahayu is site_it but seeded AT Head Office (supabase/seed.sql:24),
    // so an out-of-scope document has to be raised at Site to test the guard.
    // Asserting against her own location would have proved nothing.
    const siteBast = await raiseBast(SITE, 'SITE');

    const scoped = await clientFor('siti.rahayu@cite.co.id');
    const outOfScope = await scoped.rpc('sign_bast', {
      p_bast: siteBast,
      p_role: 'receiver',
      p_name: 'Siti Rahayu',
      p_title: 'Site IT',
      p_strokes: scribble(3),
    });
    check(
      'a document outside your locations cannot be signed',
      Boolean(outOfScope.error),
      outOfScope.error?.message ?? 'it signed',
    );
    check(
      'and it is refused as "not found" rather than admitting it exists',
      outOfScope.error?.message === 'BAST not found',
      outOfScope.error?.message,
    );

    const inScope = await scoped.rpc('sign_bast', {
      p_bast: bastId,
      p_role: 'receiver',
      p_name: 'Siti Rahayu',
      p_title: 'Site IT',
      p_strokes: scribble(5),
    });
    check('a document inside your locations can be', !inScope.error, inScope.error?.message);

    const viewer = await clientFor('andi.prasetyo@cite.co.id');
    const byViewer = await viewer.rpc('sign_bast', {
      p_bast: bastId,
      p_role: 'receiver',
      p_name: 'Andi Prasetyo',
      p_title: 'Finance',
      p_strokes: scribble(4),
    });
    check('a Viewer cannot sign', Boolean(byViewer.error), byViewer.error?.message ?? 'it signed');
  }

  console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
