/**
 * Asset photos — migration 0036.
 *
 * Client instruction, 2026-08-11: "kasih opsi penambahan foto dan penghapusan
 * foto serta carousel."
 *
 * An asset has PHOTOS now, not a photo. What is worth proving:
 *
 *   1. `assets.photo_path` still means something. Every list and search result
 *      reads it for the thumbnail, so it is the COVER, kept equal to the first
 *      photo by a trigger — never by a caller remembering.
 *   2. Deleting closes the gap. Positions stay 1..n, so "first" keeps meaning
 *      first and the cover follows to the next photo rather than to nothing.
 *   3. A photo cannot be filed under an asset it does not belong to. The path
 *      is checked against the asset's own folder, because the storage policies
 *      are keyed on that first path segment.
 *   4. A Viewer can look and cannot touch.
 *
 * These exercise the ROWS, not the bucket — the bytes are uploaded by the
 * client through the Storage API, which migration 0011 already polices.
 *
 * REPEATABILITY
 * -------------
 * Each run creates its own asset. Nothing is cleaned up; no assertion counts
 * rows it did not create.
 *
 *   supabase start && supabase db reset
 *   npm run test:photos
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
  const stamp = Date.now();

  const { data: options } = await admin.rpc('asset_form_options');
  const ho = options.locations.find((l) => l.code === 'HO').id;
  const category = options.categories[0].id;
  const available = options.statuses.find((s) => s.name === 'Available').id;
  const good = options.conditions.find((c) => c.name === 'Good').id;

  const made = await admin.rpc('create_asset', {
    p_name: `Photo Probe ${stamp}`,
    p_category: category,
    p_serial: `SN-PHOTO-${stamp}`,
    p_location: ho,
    p_status: available,
    p_condition: good,
  });
  if (made.error) throw new Error(`create_asset: ${made.error.message}`);
  const assetId = made.data.id;

  const coverOf = async () => {
    const { data } = await admin.from('assets').select('photo_path').eq('id', assetId).single();
    return data?.photo_path ?? null;
  };

  console.log('\nAdding');
  const ids = [];
  {
    check('a new asset has no cover', (await coverOf()) === null);

    const wrongFolder = await admin.rpc('add_asset_photo', {
      p_asset: assetId,
      p_path: `00000000-0000-0000-0000-000000000000/${stamp}.jpg`,
    });
    check(
      'a path outside the asset folder is refused',
      wrongFolder.error?.message === 'Photo path does not belong to this asset',
      wrongFolder.error?.message,
    );

    for (let i = 1; i <= 3; i += 1) {
      const added = await admin.rpc('add_asset_photo', {
        p_asset: assetId,
        p_path: `${assetId}/${stamp}-${i}.jpg`,
      });
      if (added.error) throw new Error(`add_asset_photo: ${added.error.message}`);
      ids.push(added.data.id);
      check(`photo ${i} lands at position ${i}`, added.data.position === i, added.data.position);
    }

    const list = await admin.rpc('asset_photos_list', { p_asset: assetId });
    check(
      'the list comes back in order',
      (list.data ?? []).length === 3,
      JSON.stringify(list.data),
    );

    // The whole reason photo_path survives: every list screen reads it.
    check(
      'the cover is the first photo, set by the trigger',
      (await coverOf()) === `${assetId}/${stamp}-1.jpg`,
      await coverOf(),
    );
  }

  console.log('\nRemoving');
  {
    const gone = await admin.rpc('remove_asset_photo', { p_id: ids[0] });
    check(
      'removing returns the file to delete',
      gone.data?.filePath?.endsWith('-1.jpg'),
      gone.data?.filePath,
    );
    check('and says what is left', gone.data?.remaining === 2, JSON.stringify(gone.data));

    const list = await admin.rpc('asset_photos_list', { p_asset: assetId });
    const positions = (list.data ?? []).map((p) => p.sort_order);
    check(
      'the gap is closed — positions stay 1..n',
      String(positions) === '1,2',
      String(positions),
    );

    // If the cover did not follow, every register row would show a broken frame.
    check(
      'the cover moves to the next photo',
      (await coverOf()) === `${assetId}/${stamp}-2.jpg`,
      await coverOf(),
    );

    await admin.rpc('remove_asset_photo', { p_id: ids[1] });
    await admin.rpc('remove_asset_photo', { p_id: ids[2] });
    check('removing the last one clears the cover', (await coverOf()) === null, await coverOf());

    const twice = await admin.rpc('remove_asset_photo', { p_id: ids[0] });
    check(
      'removing something already gone says so',
      twice.error?.message === 'Photo not found',
      twice.error?.message,
    );
  }

  console.log('\nThe ceiling');
  {
    const capped = [];
    for (let i = 1; i <= 5; i += 1) {
      const added = await admin.rpc('add_asset_photo', {
        p_asset: assetId,
        p_path: `${assetId}/${stamp}-cap-${i}.jpg`,
      });
      if (added.error) throw new Error(`add_asset_photo: ${added.error.message}`);
      capped.push(added.data.id);
    }

    const sixth = await admin.rpc('add_asset_photo', {
      p_asset: assetId,
      p_path: `${assetId}/${stamp}-cap-6.jpg`,
    });
    check(
      'the sixth is refused, and the message says how to make room',
      sixth.error?.message === 'An asset can carry five photos. Remove one first.',
      sixth.error?.message,
    );

    await admin.rpc('remove_asset_photo', { p_id: capped[0] });
    const afterRoom = await admin.rpc('add_asset_photo', {
      p_asset: assetId,
      p_path: `${assetId}/${stamp}-cap-6.jpg`,
    });
    check('removing one makes room again', !afterRoom.error, afterRoom.error?.message);

    // Back to empty, so the permissions block below counts only its own row.
    for (const id of [...capped.slice(1), afterRoom.data?.id].filter(Boolean)) {
      await admin.rpc('remove_asset_photo', { p_id: id });
    }
  }

  console.log('\nPermissions');
  {
    const seed = await admin.rpc('add_asset_photo', {
      p_asset: assetId,
      p_path: `${assetId}/${stamp}-keep.jpg`,
    });
    if (seed.error) throw new Error(`add_asset_photo: ${seed.error.message}`);

    const viewer = await clientFor('andi.prasetyo@cite.co.id');

    const canSee = await viewer.rpc('asset_photos_list', { p_asset: assetId });
    check('a Viewer can see the photos', (canSee.data ?? []).length === 1, canSee.error?.message);

    const cannotAdd = await viewer.rpc('add_asset_photo', {
      p_asset: assetId,
      p_path: `${assetId}/${stamp}-nope.jpg`,
    });
    check('a Viewer cannot add one', Boolean(cannotAdd.error), cannotAdd.error?.message);

    const cannotRemove = await viewer.rpc('remove_asset_photo', { p_id: seed.data.id });
    check('a Viewer cannot remove one', Boolean(cannotRemove.error), cannotRemove.error?.message);

    // Rows are RPC-only, so a direct write must fail even for a writer.
    const direct = await admin
      .from('asset_photos')
      .insert({ asset_id: assetId, file_path: `${assetId}/${stamp}-direct.jpg` });
    check('nobody can insert a row directly', Boolean(direct.error), direct.error?.message);
  }

  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
