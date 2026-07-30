/**
 * BAST — IMPLEMENTATION_PLAN.md § Phase 5, "Done when":
 *
 *   "a generated PDF opens correctly on an iPhone, and uploading a scan flips
 *    the badge to Signed on both the BAST list and the asset's Documents tab."
 *
 * The second half is asserted end to end below. The first half is asserted as
 * far as a script can: the Edge Function is called for real, the bytes come
 * back out of the private bucket, and the file is checked to be a well-formed
 * single-page PDF with a valid cross-reference table — the two things that
 * decide whether iOS Quick Look will render it. Opening it on a handset is
 * still a manual check.
 *
 * REPEATABILITY
 * -------------
 * The assignment and the mirrored document are cleaned up. The BAST record and
 * its versions are not, and cannot be: bast_versions is append-only and `bast`
 * has no delete grant. Nothing here asserts a total, so a second run passes.
 *
 *   supabase start && supabase db reset
 *   npm run test:bast
 */

import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = 'cite-dev-2026';
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
  const { data: locations } = await admin.from('locations').select('id, code');
  const scope = locations.map((l) => l.id);
  const HO = locations.find((l) => l.code === 'HO').id;

  const { data: conditions } = await admin.from('asset_conditions').select('id, name');
  const good = conditions.find((c) => c.name === 'Good').id;

  console.log('\nList and stats — README § BAST list');
  {
    const list = await admin.rpc('bast_list', { p_locations: scope });
    check('the list loads', !list.error, list.error?.message);
    const seeded = (list.data ?? []).find((b) => b.bast_number === 'BAST/CITE/2026/0182');
    check(
      'a record card carries its number, asset and employee',
      Boolean(
        seeded &&
        seeded.asset_code === 'LPT045-24-118' &&
        seeded.employee_name === 'Andi Prasetyo' &&
        seeded.department_name === 'Finance' &&
        seeded.location_name === 'Head Office',
      ),
      JSON.stringify(seeded),
    );
    check('the status comes through as the enum', seeded?.status === 'awaiting_signature');
    check(
      'the list is newest first',
      (list.data ?? []).every((row, i, all) => i === 0 || all[i - 1].bast_date >= row.bast_date),
    );

    const stats = await admin.rpc('bast_stats', { p_locations: scope });
    check(
      'the three stat tiles have their counts',
      typeof stats.data?.signed === 'number' &&
        typeof stats.data?.awaiting === 'number' &&
        typeof stats.data?.draft === 'number',
      JSON.stringify(stats.data),
    );
    check(
      'the seeded signed records are counted',
      stats.data.signed >= 2,
      JSON.stringify(stats.data),
    );

    const hoOnly = await admin.rpc('bast_stats', { p_locations: [HO] });
    check(
      'the stats follow the scope',
      hoOnly.data.total < stats.data.total,
      `${hoOnly.data.total} vs ${stats.data.total}`,
    );
  }

  console.log('\nPaper preview — the fields the letterhead prints');
  {
    const { data: rows } = await admin.rpc('bast_list', { p_locations: scope });
    const seeded = rows.find((b) => b.bast_number === 'BAST/CITE/2026/0182');
    const { data } = await admin.rpc('bast_detail', { p_id: seeded.id });

    check(
      'the Indonesian long date is rendered in SQL',
      data?.longDate === 'Jumat, 24 Juli 2026',
      data?.longDate,
    );
    check('Asset Code', data?.assetCode === 'LPT045-24-118');
    check('Nama Aset', data?.assetName === 'Lenovo ThinkPad T14 Gen 4');
    check('Penerima', data?.employeeName === 'Andi Prasetyo');
    check('Departemen', data?.departmentName === 'Finance');
    check('Lokasi', data?.locationName === 'Head Office');
    check('Kondisi', data?.conditionText === 'Baik / Good', data?.conditionText);
    check('Yang Menyerahkan resolves to the issuer', data?.handedOverBy === 'Dewi Lestari');
    check(
      'the version rail reads "PDF generated (v1) — System"',
      data?.versions?.[0]?.note === 'PDF generated (v1)' &&
        data?.versions?.[0]?.uploadedByName === 'System',
      JSON.stringify(data?.versions?.[0]),
    );

    const sabtu = rows.find((b) => b.bast_number === 'BAST/CITE/2026/0171');
    const other = await admin.rpc('bast_detail', { p_id: sabtu.id });
    check(
      'a Saturday reads "Sabtu"',
      other.data?.longDate === 'Sabtu, 4 Juli 2026',
      other.data?.longDate,
    );

    const siteIt = await clientFor('siti.rahayu@cite.co.id');
    const siteBast = rows.find((b) => b.bast_number === 'BAST/CITE/2026/0178');
    const hidden = await siteIt.rpc('bast_detail', { p_id: siteBast.id });
    check('Site IT cannot open a BAST from another location', hidden.data === null);
  }

  // --------------------------------------------------------------------
  // A fresh BAST, created the way the app creates one.
  // --------------------------------------------------------------------
  console.log('\nNumbering — only the database issues a number');
  const monitor = (await admin.rpc('asset_detail', { p_code: 'MON122-24-205' })).data.asset.id;
  const { data: people } = await admin.rpc('assignable_employees', { p_locations: scope });
  const dewi = people.find((p) => p.full_name === 'Dewi Lestari');

  const assigned = await admin.rpc('assign_asset', {
    p_asset: monitor,
    p_account: dewi.id,
    p_location: HO,
    p_date: TODAY,
    p_auto_bast: true,
  });
  const number = assigned.data?.[0]?.bast_number;
  check(
    'assign_asset created a numbered BAST',
    /^BAST\/CITE\/\d{4}\/\d{4}$/.test(number ?? ''),
    number,
  );

  const { data: fresh } = await admin
    .from('bast')
    .select('id, status, current_version')
    .eq('bast_number', number)
    .single();
  check(
    'it starts as a draft at version 1',
    fresh.status === 'draft' && fresh.current_version === 1,
  );

  console.log('\nGenerate — the generate-bast-pdf Edge Function');
  let generatedPath = null;
  {
    const invoked = await admin.functions.invoke('generate-bast-pdf', {
      body: { bastId: fresh.id },
    });
    check(
      'the function returns successfully',
      !invoked.error,
      JSON.stringify(invoked.error ?? invoked.data),
    );

    const result = invoked.data ?? {};
    generatedPath = result.filePath;
    check('it stores bast/<id>/v1.pdf', generatedPath === `${fresh.id}/v1.pdf`, generatedPath);
    check('it reports the BAST number back', result.bastNumber === number, result.bastNumber);

    const download = await admin.storage.from('bast').download(generatedPath);
    check('the file is readable from the private bucket', !download.error, download.error?.message);

    const bytes = new Uint8Array(await download.data.arrayBuffer());
    const text = Buffer.from(bytes).toString('latin1');

    check('it is a PDF', text.startsWith('%PDF-1.4'), text.slice(0, 12));
    check('it ends with a proper EOF marker', text.trimEnd().endsWith('%%EOF'));
    check('it has one page', /\/Type \/Pages \/Kids \[3 0 R\] \/Count 1/.test(text));
    check('the letterhead is on it', text.includes('CORPORATE IT \\227 CITE'));
    check('the title is on it', text.includes('BERITA ACARA SERAH TERIMA'));
    check(
      'the Indonesian sentence is on it',
      text.includes('telah dilakukan serah terima aset IT'),
    );
    check(
      'both signature blocks are on it',
      text.includes('Yang Menyerahkan') && text.includes('Yang Menerima'),
    );
    check(
      'the detail table is on it',
      ['Asset Code', 'Nama Aset', 'Penerima', 'Departemen', 'Lokasi', 'Kondisi'].every((k) =>
        text.includes(k),
      ),
    );
    check(
      'the CITE logo is embedded',
      text.includes('/Subtype /Image') && text.includes('/ColorSpace /DeviceRGB'),
    );

    // A viewer will not open the file if startxref does not point at the table,
    // or if any entry in that table misses its object.
    const startxref = Number(text.match(/startxref\s+(\d+)/)?.[1]);
    check(
      'the cross-reference offset is correct',
      Number.isFinite(startxref) && text.slice(startxref, startxref + 4) === 'xref',
      `startxref ${startxref}`,
    );

    const entries = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) =>
      Number(m[1]),
    );
    check('every object is in the table', entries.length === 7, `${entries.length} entries`);
    check(
      'every offset lands on its object header',
      entries.every((offset, i) => text.startsWith(`${i + 1} 0 obj`, offset)),
      JSON.stringify(entries),
    );
    check('the file is a plausible size', bytes.length > 8000, `${bytes.length} bytes`);

    const after = await admin.rpc('bast_detail', { p_id: fresh.id });
    check(
      'a v1 "generated" version row was inserted',
      after.data.versions.length === 1 && after.data.versions[0].kind === 'generated',
    );
    check(
      'the note reads "PDF generated (v1)"',
      after.data.versions[0].note === 'PDF generated (v1)',
    );
    check('the uploader is System', after.data.versions[0].uploadedByName === 'System');
    check(
      'a draft with a document is now awaiting signature',
      after.data.status === 'awaiting_signature',
      after.data.status,
    );

    // Regenerating must not grow the history.
    await admin.functions.invoke('generate-bast-pdf', { body: { bastId: fresh.id } });
    const again = await admin.rpc('bast_detail', { p_id: fresh.id });
    check(
      'regenerating replaces v1 rather than adding a version',
      again.data.versions.length === 1,
    );
  }

  console.log('\nSigned scan upload');
  {
    const path = `${fresh.id}/v2.pdf`;
    const scan = new Blob([Buffer.from('%PDF-1.4\n% signed scan stand-in\n%%EOF\n')], {
      type: 'application/pdf',
    });

    const uploaded = await admin.storage
      .from('bast')
      .upload(path, scan, { contentType: 'application/pdf', upsert: true });
    check('the scan uploads into the bast bucket', !uploaded.error, uploaded.error?.message);

    const foreign = await admin.rpc('attach_signed_bast', {
      p_bast: fresh.id,
      p_path: 'somewhere-else/v2.pdf',
      p_size: scan.size,
    });
    check(
      'a path outside this BAST is rejected',
      foreign.error?.message === 'File path does not belong to this BAST',
      foreign.error?.message,
    );

    const attached = await admin.rpc('attach_signed_bast', {
      p_bast: fresh.id,
      p_path: path,
      p_size: scan.size,
      p_mime: 'application/pdf',
    });
    check(
      'the version is recorded',
      attached.data?.version === 2,
      JSON.stringify(attached.error ?? attached.data),
    );

    const after = await admin.rpc('bast_detail', { p_id: fresh.id });
    check('the status flips to Signed', after.data.status === 'signed', after.data.status);
    check('current_version is bumped', after.data.currentVersion === 2);
    check(
      'the version history gained a signed entry',
      after.data.versions.length === 2 && after.data.versions[0].kind === 'signed',
    );
    check(
      'the rail reads "Signed scan uploaded — Dewi Lestari · Corporate IT"',
      after.data.versions[0].note === 'Signed scan uploaded' &&
        after.data.versions[0].uploadedByName === 'Dewi Lestari' &&
        after.data.versions[0].uploadedByDept === 'Corporate IT',
      JSON.stringify(after.data.versions[0]),
    );

    // "…flips the badge to Signed on both the BAST list and the asset's
    // Documents tab."
    const list = await admin.rpc('bast_list', { p_locations: scope });
    const row = list.data.find((b) => b.bast_number === number);
    check('the BAST list badge reads Signed', row?.status === 'signed', row?.status);

    const asset = await admin.rpc('asset_detail', { p_code: 'MON122-24-205' });
    const mirrored = asset.data.documents.find((d) => d.title === `Signed ${number}`);
    check(
      'the scan appears on the asset Documents tab',
      Boolean(mirrored),
      JSON.stringify(asset.data.documents.map((d) => d.title)),
    );
    check('it is filed as a signed_bast document', mirrored?.kind === 'signed_bast');
    check('it points at the uploaded file', mirrored?.filePath === path);

    console.log('\n  Append-only — bast_versions, from a real client token');
    const rawUpdate = await admin
      .from('bast_versions')
      .update({ note: 'tampered' })
      .eq('bast_id', fresh.id)
      .select();
    check(
      'a raw UPDATE on bast_versions fails',
      Boolean(rawUpdate.error),
      rawUpdate.error?.message ?? 'no error',
    );

    const rawDelete = await admin.from('bast_versions').delete().eq('bast_id', fresh.id).select();
    check(
      'a raw DELETE on bast_versions fails',
      Boolean(rawDelete.error),
      rawDelete.error?.message ?? 'no error',
    );

    const survived = await admin.rpc('bast_detail', { p_id: fresh.id });
    check(
      'both versions survived unchanged',
      survived.data.versions.length === 2 &&
        survived.data.versions[0].note === 'Signed scan uploaded',
    );

    // Cleanup: the mirrored document can go; the BAST and its versions cannot.
    await admin.from('documents').delete().eq('id', mirrored.id);
  }

  console.log('\nPermissions');
  {
    const viewer = await clientFor('andi.prasetyo@cite.co.id');
    const denied = await viewer.rpc('attach_signed_bast', {
      p_bast: fresh.id,
      p_path: `${fresh.id}/v3.pdf`,
      p_size: 10,
    });
    check(
      'a Viewer cannot upload a signed BAST',
      denied.error?.message === 'You do not have permission to upload a signed BAST',
      denied.error?.message,
    );

    const generateDenied = await viewer.functions.invoke('generate-bast-pdf', {
      body: { bastId: fresh.id },
    });
    check(
      'a Viewer cannot generate a document',
      Boolean(generateDenied.error) || Boolean(generateDenied.data?.error),
      JSON.stringify(generateDenied.data),
    );
  }

  // Put the monitor back the way the seed left it.
  await admin.rpc('return_asset', { p_asset: monitor, p_date: TODAY, p_condition: good });
  const restored = await admin.rpc('asset_detail', { p_code: 'MON122-24-205' });
  check(
    '\ncleanup left the monitor Available and unassigned',
    restored.data.asset.statusName === 'Available' && restored.data.asset.assignedToName === null,
  );

  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
