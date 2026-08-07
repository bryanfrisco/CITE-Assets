/**
 * Asset tags — the QR / barcode lifecycle the client specified on 2026-07-30:
 *
 *   "stiker qris/barcode yang masih status untag yang nantinya jika di tempelin
 *    di barang A. artinya jadi tagged dan baru jadi asset yang siap di
 *    distribusikan."
 *
 * The invariant worth testing is not the happy path but the pair of states
 * that must never disagree: a label is `tagged` if and only if an asset hangs
 * off it, and one asset can never carry two labels. A mislabelled asset is the
 * one error this system cannot detect afterwards, because the sticker is the
 * only physical link back to the record.
 *
 *   supabase start && supabase db reset
 *   npm run test:tags
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
  const { data: options } = await admin.rpc('asset_form_options');
  const category = options.categories.find((c) => c.name === 'Laptop').id;
  const location = options.locations.find((l) => l.name === 'Head Office').id;
  const siteLocation = options.locations.find((l) => l.name === 'Site').id;
  // Retired on purpose: it keeps this suite's asset out of the assign/return
  // wizard lists that the Phase 4 suite counts exactly.
  const status = options.statuses.find((s) => s.name === 'Retired').id;
  const condition = options.conditions.find((c) => c.name === 'Good').id;

  const stamp = Date.now();

  console.log('\nPrinting a batch');
  let codes = [];
  {
    const bad = await admin.rpc('create_tag_batch', { p_count: 0, p_location: location });
    check(
      'a batch of zero is rejected',
      bad.error?.message === 'How many labels do you need?',
      bad.error?.message,
    );

    const huge = await admin.rpc('create_tag_batch', { p_count: 501, p_location: location });
    check(
      'an implausible batch size is rejected',
      huge.error?.message === 'A batch is limited to 500 labels',
      huge.error?.message,
    );

    const noWhere = await admin.rpc('create_tag_batch', { p_count: 1 });
    check(
      'a batch with no location is rejected',
      noWhere.error?.message === 'Choose which location these labels are for',
      noWhere.error?.message,
    );

    const batch = await admin.rpc('create_tag_batch', { p_count: 3, p_location: location });
    codes = (batch.data ?? []).map((r) => r.code);
    check('three labels are issued', codes.length === 3, JSON.stringify(codes));

    // Migration 0033: the prefix comes from the location, so Head Office stock
    // is CTH and Site stock is CTS. There is no way to ask for a prefix.
    check(
      'Head Office stock is CTH and zero-padded',
      codes.every((c) => /^CTH-\d{6}$/.test(c)),
      JSON.stringify(codes),
    );
    check(
      'the batch reports which stock it is',
      batch.data?.[0]?.prefix === 'CTH' && batch.data?.[0]?.location_name === 'Head Office',
      JSON.stringify(batch.data?.[0]),
    );
    check('they share one batch id', new Set((batch.data ?? []).map((r) => r.batch_id)).size === 1);

    const siteBatch = await admin.rpc('create_tag_batch', { p_count: 2, p_location: siteLocation });
    check(
      'Site stock is CTS, on its own sequence',
      (siteBatch.data ?? []).every((r) => /^CTS-\d{6}$/.test(r.code)),
      JSON.stringify(siteBatch.data?.map((r) => r.code)),
    );

    const again = await admin.rpc('create_tag_batch', { p_count: 1, p_location: location });
    check(
      'a second batch does not reuse a code',
      !codes.includes(again.data[0].code),
      again.data?.[0]?.code,
    );

    // The split is worth nothing if the stock can be mixed afterwards.
    const siteCode = siteBatch.data[0].code;
    const crossed = await admin.rpc('tag_asset', {
      p_code: siteCode,
      p_name: `Cross Location ${stamp}`,
      p_category: category,
      p_serial: `SN-CROSS-${stamp}`,
      p_location: location,
      p_status: status,
      p_condition: condition,
    });
    check(
      'a Site label cannot go on a Head Office asset',
      Boolean(crossed.error),
      crossed.error?.message,
    );
    const stillBlank = await admin.rpc('scan_tag', { p_code: siteCode });
    check(
      'and the refused label is still blank — no half-registered device',
      stillBlank.data?.status === 'untagged',
      JSON.stringify(stillBlank.data),
    );
  }

  console.log('\nScanning — every state the camera can land on');
  {
    const unknown = await admin.rpc('scan_tag', { p_code: 'CT-999999' });
    check('a label we never issued reports found: false', unknown.data?.found === false);

    const fresh = await admin.rpc('scan_tag', { p_code: codes[0] });
    check('a printed label reads untagged', fresh.data?.status === 'untagged', fresh.data?.status);
    check(
      'scanning is case-insensitive',
      (await admin.rpc('scan_tag', { p_code: codes[0].toLowerCase() })).data?.status === 'untagged',
    );
  }

  console.log('\nTagging — the sticker goes on a device');
  let taggedAssetId = null;
  {
    const registered = await admin.rpc('tag_asset', {
      p_code: codes[0],
      p_name: 'Tag Lifecycle Test Device',
      p_category: category,
      p_serial: `SN-TAG-${stamp}`,
      p_location: location,
      p_status: status,
      p_condition: condition,
    });
    check('the asset is created', Boolean(registered.data?.id), registered.error?.message);
    check('the response carries the label code', registered.data?.tagCode === codes[0]);
    check(
      'the asset code came from the generator',
      /^[A-Z]{3}[A-Z]{2,4}\d{2}-[A-Z]+-\d{4}$/.test(registered.data?.assetCode ?? ''),
      registered.data?.assetCode,
    );
    taggedAssetId = registered.data.id;

    const scanned = await admin.rpc('scan_tag', { p_code: codes[0] });
    check('scanning it now resolves to the asset', scanned.data?.status === 'tagged');
    check(
      'the scan returns what the screen needs',
      scanned.data?.assetCode === registered.data.assetCode &&
        scanned.data?.assetName === 'Tag Lifecycle Test Device' &&
        scanned.data?.locationName === 'Head Office',
      JSON.stringify(scanned.data),
    );

    const twice = await admin.rpc('tag_asset', {
      p_code: codes[0],
      p_name: 'Something else',
      p_category: category,
      p_serial: `SN-OTHER-${stamp}`,
      p_location: location,
      p_status: status,
      p_condition: condition,
    });
    check(
      'the same label cannot be put on a second asset',
      twice.error?.message === 'That label is already on another asset',
      twice.error?.message,
    );

    const stray = await admin.rpc('tag_asset', {
      p_code: 'CT-999999',
      p_name: 'Ghost',
      p_category: category,
      p_serial: `SN-GHOST-${stamp}`,
      p_location: location,
      p_status: status,
      p_condition: condition,
    });
    check(
      'a label we never issued is refused',
      stray.error?.message === 'That label is not one of ours',
      stray.error?.message,
    );
  }

  console.log('\nThe invariant: status and asset can never disagree');
  {
    // Straight at the table, not through the RPC — the constraint has to hold
    // even when the write does not come from tag_asset().
    const orphan = await admin
      .from('asset_tags')
      .update({ status: 'tagged' })
      .eq('code', codes[1])
      .select();
    check(
      'a label cannot be marked tagged with no asset behind it',
      Boolean(orphan.error),
      orphan.error?.message ?? 'the update was allowed',
    );

    const detach = await admin
      .from('asset_tags')
      .update({ asset_id: null })
      .eq('code', codes[0])
      .select();
    check(
      'a tagged label cannot have its asset removed underneath it',
      Boolean(detach.error),
      detach.error?.message ?? 'the update was allowed',
    );

    const steal = await admin
      .from('asset_tags')
      .update({ status: 'tagged', asset_id: taggedAssetId })
      .eq('code', codes[1])
      .select();
    check(
      'two labels cannot claim the same asset',
      Boolean(steal.error),
      steal.error?.message ?? 'the update was allowed',
    );

    const erase = await admin.from('asset_tags').delete().eq('code', codes[1]).select();
    check(
      'a label cannot be deleted — the sticker physically exists',
      Boolean(erase.error),
      erase.error?.message ?? 'the delete was allowed',
    );
  }

  console.log('\nVoiding a damaged label');
  {
    const noReason = await admin.rpc('void_tag', { p_code: codes[1], p_reason: '  ' });
    check(
      'a reason is required',
      noReason.error?.message === 'Say why the label is being voided',
      noReason.error?.message,
    );

    const inUse = await admin.rpc('void_tag', { p_code: codes[0], p_reason: 'test' });
    check(
      'a label already on an asset cannot be voided',
      inUse.error?.message === 'Detach the label from its asset before voiding it',
      inUse.error?.message,
    );

    const voided = await admin.rpc('void_tag', {
      p_code: codes[1],
      p_reason: 'Print smudged, unreadable',
    });
    check('a spare label can be voided', voided.data?.status === 'void', voided.error?.message);

    const reuse = await admin.rpc('tag_asset', {
      p_code: codes[1],
      p_name: 'Nope',
      p_category: category,
      p_serial: `SN-VOID-${stamp}`,
      p_location: location,
      p_status: status,
      p_condition: condition,
    });
    check(
      'a voided label cannot be used',
      reuse.error?.message === 'That label has been voided',
      reuse.error?.message,
    );
  }

  console.log('\nPermissions');
  {
    const viewer = await clientFor('andi.prasetyo@cite.co.id');
    const denied = await viewer.rpc('create_tag_batch', { p_count: 1, p_location: location });
    check(
      'a Viewer cannot print labels',
      denied.error?.message === 'You do not have permission to create tags',
      denied.error?.message,
    );

    const deniedVoid = await viewer.rpc('void_tag', { p_code: codes[2], p_reason: 'x' });
    check(
      'a Viewer cannot void a label',
      deniedVoid.error?.message === 'You do not have permission to void a label',
      deniedVoid.error?.message,
    );

    const canScan = await viewer.rpc('scan_tag', { p_code: codes[0] });
    check('a Viewer can still scan', canScan.data?.found === true, canScan.error?.message);
  }

  console.log('\nStock and listing');
  {
    const stock = await admin.rpc('tag_stock', {});
    check(
      'the stock line counts each state',
      stock.data?.tagged >= 1 && stock.data?.void >= 1 && stock.data?.untagged >= 1,
      JSON.stringify(stock.data),
    );

    const untagged = await admin.rpc('list_tags', { p_status: 'untagged' });
    check(
      'the list carries the stock location',
      (untagged.data ?? []).some((t) => t.location_name === 'Head Office'),
      JSON.stringify((untagged.data ?? []).slice(0, 2)),
    );
    const hoOnly = await admin.rpc('list_tags', { p_locations: [location] });
    check(
      'scoping to Head Office hides Site stock',
      !(hoOnly.data ?? []).some((t) => t.code.startsWith('CTS-')),
      JSON.stringify((hoOnly.data ?? []).map((t) => t.code).slice(0, 5)),
    );
    check(
      'the untagged list excludes used labels',
      !(untagged.data ?? []).some((t) => t.code === codes[0]),
    );

    const all = await admin.rpc('list_tags', {});
    const row = (all.data ?? []).find((t) => t.code === codes[0]);
    check('the list joins the asset through', Boolean(row?.asset_code), JSON.stringify(row));
  }

  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
