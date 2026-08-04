/**
 * The Berita Acara, as it is actually printed — migration 0032.
 *
 * Two scanned documents were provided on 2026-08-04 as the reference: a Berita
 * Acara Serah Terima Barang and a Berita Acara Penarikan Barang. This suite
 * proves the database can produce both, with the fields those sheets carry.
 *
 * What is worth proving:
 *
 *   1. terbilang() spells Indonesian numbers the way the scans spell them.
 *      "Dua ribu dua puluh enam", not "Dua Ribu Dua Puluh Enam", and 'seratus'
 *      / 'seribu' rather than 'satu ratus' / 'satu ribu'.
 *   2. A handover and a withdrawal are two kinds of one record — same numbering
 *      sequence, same signing flow — and returning an asset raises the second.
 *   3. The goods table holds things that are NOT assets. The charger has no
 *      serial and nobody wants it in the register; it exists on the paper only.
 *      With no custom list, the asset itself is the one line, so every BAST
 *      ever raised prints correctly without a backfill.
 *   4. A signed document's contents stop being editable.
 *   5. Jabatan reaches the sheet.
 *
 * REPEATABILITY
 * -------------
 * Each run creates its own asset, its own person and its own documents. Nothing
 * is cleaned up and nothing can be — bast rows are evidence. No assertion
 * counts rows; every one names the thing it expects.
 *
 *   supabase start && supabase db reset
 *   npm run test:bast-doc
 */

import { createClient } from '@supabase/supabase-js';

import { assertLocal } from './_guard.mjs';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = 'cite-dev-2026';
const TODAY = new Date().toISOString().slice(0, 10);

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
  const stamp = Date.now();

  const { data: locations } = await admin.from('locations').select('id, code, company_name');
  const HO = locations.find((l) => l.code === 'HO');

  const { data: categories } = await admin.from('categories').select('id').limit(1);
  const { data: statuses } = await admin.from('asset_statuses').select('id, name');
  const { data: conditions } = await admin.from('asset_conditions').select('id, name');
  const { data: departments } = await admin.from('departments').select('id, name').limit(1);

  const byName = (list, name) => list.find((row) => row.name === name).id;
  const available = byName(statuses, 'Available');
  const good = byName(conditions, 'Good');

  // ---- terbilang ----------------------------------------------------------
  console.log('\nTerbilang — the words on the sheet');
  {
    const cases = [
      [1, 'Satu'],
      [11, 'Sebelas'],
      [16, 'Enam belas'],
      [25, 'Dua puluh lima'],
      [100, 'Seratus'],
      [1000, 'Seribu'],
      [2026, 'Dua ribu dua puluh enam'],
    ];
    for (const [n, expected] of cases) {
      const got = await admin.rpc('terbilang_kapital', { n });
      check(`${n} reads "${expected}"`, got.data === expected, `${got.data ?? got.error?.message}`);
    }

    // 25 May 2026 is a Monday — the exact sentence on the handover scan.
    const words = await admin.rpc('indonesian_date_words', { p_date: '2026-05-25' });
    check(
      'the opening date matches the scanned sentence',
      words.data === 'Senin tanggal Dua puluh lima Bulan Mei Tahun Dua ribu dua puluh enam',
      words.data,
    );
  }

  // ---- a person with a Jabatan --------------------------------------------
  console.log('\nJabatan reaches the document');
  const person = await admin.rpc('create_account', {
    p_full_name: `Doc Test ${stamp}`,
    p_nik: `DOC-${stamp}`,
    p_department: departments[0].id,
    p_location: HO.id,
    p_job_title: 'Legal Officer',
  });
  if (person.error) throw new Error(`create_account: ${person.error.message}`);
  const personId = person.data.id;

  const asset = await admin.rpc('create_asset', {
    p_name: 'HP Laptop 14-ep1188TU',
    p_category: categories[0].id,
    p_serial: `SPRLAP26-HO-${stamp}`,
    p_location: HO.id,
    p_status: available,
    p_condition: good,
  });
  if (asset.error) throw new Error(`create_asset: ${asset.error.message}`);

  // ---- the handover -------------------------------------------------------
  console.log('\nBerita Acara Serah Terima Barang');
  let handoverId;
  {
    const assigned = await admin.rpc('assign_asset', {
      p_asset: asset.data.id,
      p_account: personId,
      p_location: HO.id,
      p_date: TODAY,
      p_auto_bast: true,
    });
    check('assigning raises a document', !assigned.error, assigned.error?.message);

    const list = await admin.rpc('bast_list', { p_locations: [HO.id], p_kind: 'handover' });
    const row = (list.data ?? []).find((b) => b.asset_code === asset.data.assetCode);
    check('it is listed as a handover', row?.kind === 'handover', JSON.stringify(row));
    handoverId = row?.id;

    const detail = await admin.rpc('bast_detail', { p_id: handoverId });
    const d = detail.data;

    check('the kind reaches the renderer', d?.kind === 'handover');
    check('Jabatan is on the sheet', d?.employeeTitle === 'Legal Officer', d?.employeeTitle);
    check('NIK is on the sheet', d?.employeeNik === `DOC-${stamp}`, d?.employeeNik);
    check(
      'the company and office name the second paragraph',
      Boolean(d?.companyName) && Boolean(d?.officeLabel),
      `${d?.companyName} / ${d?.officeLabel}`,
    );
    check('the place line is rendered', /, /.test(d?.placeDate ?? ''), d?.placeDate);
    check('the date is spelled out', /tanggal /.test(d?.dateWords ?? ''), d?.dateWords);

    // With no custom list the asset itself is the single line. This is what
    // stops every BAST raised before migration 0032 printing an empty table.
    check(
      'the goods table falls back to the asset',
      d?.items?.length === 1,
      JSON.stringify(d?.items),
    );
    check(
      'and that line carries the asset serial',
      d?.items?.[0]?.serial === `SPRLAP26-HO-${stamp}`,
      JSON.stringify(d?.items?.[0]),
    );
  }

  // ---- the goods table ----------------------------------------------------
  console.log('\nRincian barang');
  {
    const set = await admin.rpc('set_bast_items', {
      p_bast: handoverId,
      p_items: [
        { jenis: 'HP Laptop 14-ep1188TU', serial: `SPRLAP26-HO-${stamp}`, kondisi: 'Baru' },
        { jenis: 'Charger Adaptor', serial: '', kondisi: 'Baru' },
        { jenis: 'Mouse RAPOO M100G Silent', serial: '', kondisi: 'Baru' },
      ],
    });
    check('three lines are accepted', set.data?.items === 3, set.error?.message);

    const detail = await admin.rpc('bast_detail', { p_id: handoverId });
    const items = detail.data?.items ?? [];
    check('all three reach the sheet in order', items.length === 3, JSON.stringify(items));
    check('the charger is second', items[1]?.jenis === 'Charger Adaptor', items[1]?.jenis);
    check('an empty serial prints as a dash', items[1]?.serial === '-', items[1]?.serial);

    const blank = await admin.rpc('set_bast_items', {
      p_bast: handoverId,
      p_items: [{ jenis: '   ', serial: '-', kondisi: 'Baru' }],
    });
    check('a line with no Jenis/Type is refused', Boolean(blank.error), blank.error?.message);

    // The refusal has to leave the earlier list intact, or a typo would empty
    // the document.
    const after = await admin.rpc('bast_detail', { p_id: handoverId });
    check(
      'and the refusal rolled back — the three lines are still there',
      (after.data?.items ?? []).length === 3,
      JSON.stringify(after.data?.items),
    );

    const viewer = await clientFor('andi.prasetyo@cite.co.id');
    const byViewer = await viewer.rpc('set_bast_items', {
      p_bast: handoverId,
      p_items: [{ jenis: 'Nope', serial: '-', kondisi: 'Baru' }],
    });
    check('a Viewer cannot edit the list', Boolean(byViewer.error), byViewer.error?.message);
  }

  // ---- signed means settled ------------------------------------------------
  // The list is part of a DRAFT. Once somebody has put their name to the sheet,
  // what it says has to stop moving, or a signature would attest to a document
  // that no longer exists.
  console.log('\nA signed sheet stops moving');
  {
    const signedOff = await admin.rpc('attach_signed_bast', {
      p_bast: handoverId,
      p_path: `${handoverId}/v9.pdf`,
      p_size: 1024,
      p_mime: 'application/pdf',
    });
    check('the document can be marked signed', !signedOff.error, signedOff.error?.message);

    const late = await admin.rpc('set_bast_items', {
      p_bast: handoverId,
      p_items: [{ jenis: 'Something extra', serial: '-', kondisi: 'Baru' }],
    });
    check('and then the list is frozen', Boolean(late.error), late.error?.message);

    const after = await admin.rpc('bast_detail', { p_id: handoverId });
    check(
      'the three signed-for lines are what it still says',
      (after.data?.items ?? []).length === 3,
      JSON.stringify(after.data?.items),
    );
  }

  // ---- the withdrawal -----------------------------------------------------
  console.log('\nBerita Acara Penarikan Barang');
  {
    const returned = await admin.rpc('return_asset', {
      p_asset: asset.data.id,
      p_date: TODAY,
      p_condition: good,
      p_notes: 'Returned for the test',
    });
    check(
      'returning raises its own document',
      Boolean(returned.data?.bastId),
      returned.error?.message,
    );

    const detail = await admin.rpc('bast_detail', { p_id: returned.data.bastId });
    const d = detail.data;
    check('it is a withdrawal', d?.kind === 'return', d?.kind);
    check('against the same asset', d?.assetId === asset.data.id);
    check('and the same person', d?.employeeName === `Doc Test ${stamp}`, d?.employeeName);
    check(
      'its number comes from the one sequence, not a second one',
      /^BAST\//.test(d?.bastNumber ?? ''),
      d?.bastNumber,
    );

    const both = await admin.rpc('bast_list', { p_locations: [HO.id] });
    const mine = (both.data ?? []).filter((b) => b.asset_code === asset.data.assetCode);
    check(
      'both sheets sit in one list',
      mine.length === 2,
      JSON.stringify(mine.map((b) => b.kind)),
    );

    const onlyReturns = await admin.rpc('bast_list', { p_locations: [HO.id], p_kind: 'return' });
    check(
      'and the filter separates them',
      (onlyReturns.data ?? []).every((b) => b.kind === 'return'),
    );

    const stats = await admin.rpc('bast_stats', { p_locations: [HO.id] });
    check(
      'the tiles count both kinds',
      Number(stats.data?.handover ?? 0) >= 1 && Number(stats.data?.returns ?? 0) >= 1,
      JSON.stringify(stats.data),
    );

    // Opting out has to work, or fixture cleanup would litter the register.
    const second = await admin.rpc('assign_asset', {
      p_asset: asset.data.id,
      p_account: personId,
      p_location: HO.id,
      p_date: TODAY,
      p_auto_bast: false,
    });
    check('a second assignment succeeds', !second.error, second.error?.message);

    const quiet = await admin.rpc('return_asset', {
      p_asset: asset.data.id,
      p_date: TODAY,
      p_condition: good,
      p_auto_bast: false,
    });
    check(
      'and a return can be made without a document',
      quiet.data?.bastId === null,
      JSON.stringify(quiet.data),
    );
  }

  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
