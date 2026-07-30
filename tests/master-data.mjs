/**
 * Master data — IMPLEMENTATION_PLAN.md § Phase 2, "Done when":
 *
 *   "an admin can add a category and immediately use it in the Add Asset form
 *    without a release."
 *
 * Proved literally at the end of this file: a category created through the
 * master data RPC shows up in asset_form_options() and an asset is saved
 * against it in the same session.
 *
 * Also covers the validation copy from README § Master data and the 23503
 * delete guard.
 *
 *   supabase start && supabase db reset
 *   npm run test:master
 */

import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = 'cite-dev-2026';

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

  console.log('\nValidation copy — README § Master data');
  {
    const empty = await admin.rpc('master_create', { p_entity: 'brand', p_name: '   ' });
    check(
      'empty name rejected with "Enter a name first"',
      empty.error?.message === 'Enter a name first',
      empty.error?.message,
    );

    const dup = await admin.rpc('master_create', { p_entity: 'brand', p_name: 'Lenovo' });
    check(
      'duplicate rejected with the exact copy',
      dup.error?.message === '"Lenovo" already exists in Brand',
      dup.error?.message,
    );

    const dupCase = await admin.rpc('master_create', { p_entity: 'brand', p_name: 'lenovo' });
    check(
      'duplicate check is case-insensitive',
      dupCase.error?.message === '"lenovo" already exists in Brand',
      dupCase.error?.message,
    );
  }

  console.log('\nCreate, rename, soft delete');
  let brandId;
  {
    const created = await admin.rpc('master_create', { p_entity: 'brand', p_name: 'Acer' });
    check('creates a brand', !created.error && Boolean(created.data?.id), created.error?.message);
    brandId = created.data?.id;

    const renamed = await admin.rpc('master_rename', {
      p_entity: 'brand',
      p_id: brandId,
      p_name: 'Acer Indonesia',
    });
    check('renames a brand', !renamed.error, renamed.error?.message);

    const renameDup = await admin.rpc('master_rename', {
      p_entity: 'brand',
      p_id: brandId,
      p_name: 'Dell',
    });
    check(
      'rename onto an existing name is rejected',
      renameDup.error?.message === '"Dell" already exists in Brand',
      renameDup.error?.message,
    );

    const off = await admin.rpc('master_set_active', {
      p_entity: 'brand',
      p_id: brandId,
      p_active: false,
    });
    check('soft delete sets is_active false', !off.error, off.error?.message);

    const opts = await admin.rpc('asset_form_options');
    check(
      'an inactive brand disappears from the Add Asset pickers',
      !opts.data.brands.some((b) => b.id === brandId),
    );

    await admin.rpc('master_set_active', { p_entity: 'brand', p_id: brandId, p_active: true });
    const back = await admin.rpc('asset_form_options');
    check(
      'restoring is_active brings it back',
      back.data.brands.some((b) => b.id === brandId),
    );
  }

  console.log('\nDelete guard — Postgres 23503');
  {
    const list = await admin.rpc('master_list', { p_entity: 'category' });
    const laptop = list.data.find((r) => r.name === 'Laptop');
    check('Laptop reports its asset usage', laptop?.assetCount === 3, `got ${laptop?.assetCount}`);

    const blocked = await admin.rpc('master_delete', { p_entity: 'category', p_id: laptop.id });
    check(
      'referenced category cannot be deleted, with the exact copy',
      blocked.error?.message === 'Cannot delete Laptop — still used by 3 assets',
      blocked.error?.message,
    );

    // An unreferenced record deletes cleanly.
    const temp = await admin.rpc('master_create', { p_entity: 'vendor', p_name: 'PT Sementara' });
    const removed = await admin.rpc('master_delete', {
      p_entity: 'vendor',
      p_id: temp.data.id,
    });
    check('unreferenced record deletes', !removed.error, removed.error?.message);
  }

  console.log('\nPermissions');
  {
    const viewer = await clientFor('andi.prasetyo@cite.co.id');
    const denied = await viewer.rpc('master_create', { p_entity: 'brand', p_name: 'Asus' });
    check('a Viewer cannot create master data', Boolean(denied.error), 'insert succeeded');

    const siteIt = await clientFor('siti.rahayu@cite.co.id');
    const deniedSite = await siteIt.rpc('master_create', { p_entity: 'brand', p_name: 'Asus' });
    check('Site IT cannot create master data', Boolean(deniedSite.error), 'insert succeeded');
  }

  console.log('\nDone-when: new category is usable in Add Asset immediately');
  {
    const stamp = Date.now().toString().slice(-5);
    const name = `Tablet ${stamp}`;
    const code = `TB${stamp.slice(-3)}`;

    const created = await admin.rpc('master_create', {
      p_entity: 'category',
      p_name: name,
      p_extra: { code, icon: 'tablet' },
    });
    check('admin adds a new category', !created.error, created.error?.message);
    const categoryId = created.data?.id;

    // No redeploy, no restart — the same session asks for the form options.
    const opts = await admin.rpc('asset_form_options');
    check(
      'the new category appears in the Add Asset picker straight away',
      opts.data.categories.some((c) => c.id === categoryId),
    );

    const ho = opts.data.locations.find((l) => l.code === 'HO');
    const available = opts.data.statuses.find((s) => s.name === 'Available');
    const good = opts.data.conditions.find((c) => c.name === 'Good');

    const saved = await admin.rpc('create_asset', {
      p_name: `Samsung Galaxy Tab ${stamp}`,
      p_category: categoryId,
      p_serial: `SN-${stamp}`,
      p_location: ho.id,
      p_status: available.id,
      p_condition: good.id,
    });
    check('an asset saves against the brand-new category', !saved.error, saved.error?.message);
    check(
      'the generated asset code uses the new category code',
      saved.data?.assetCode?.startsWith(code),
      saved.data?.assetCode,
    );

    // The serial-number rule from README § Add Asset.
    const dupSerial = await admin.rpc('create_asset', {
      p_name: 'Duplicate serial probe',
      p_category: categoryId,
      p_serial: `SN-${stamp}`,
      p_location: ho.id,
      p_status: available.id,
      p_condition: good.id,
    });
    check(
      'duplicate serial rejected with the inline copy',
      dupSerial.error?.message === 'Serial number already registered',
      dupSerial.error?.message,
    );

    // And the new category is now protected by the delete guard.
    const guard = await admin.rpc('master_delete', {
      p_entity: 'category',
      p_id: categoryId,
    });
    check(
      'the new category is now protected by its asset',
      guard.error?.message === `Cannot delete ${name} — still used by 1 assets`,
      guard.error?.message,
    );
  }

  // -------------------------------------------------------------------------
  // Clean up.
  //
  // This file creates a real asset, and tests/rls-site-it.mjs asserts exact
  // asset counts. Without this the two suites cannot run in the same database
  // twice, so the leftovers go back out in dependency order:
  // asset → category → brand.
  // -------------------------------------------------------------------------
  console.log('\nCleanup');
  {
    const { error: assetErr } = await admin.from('assets').delete().like('asset_code', 'TB%');
    check('created assets removed', !assetErr, assetErr?.message);

    const cats = await admin.rpc('master_list', { p_entity: 'category' });
    const strays = (cats.data ?? []).filter((c) => c.name.startsWith('Tablet '));
    for (const stray of strays) {
      await admin.rpc('master_delete', { p_entity: 'category', p_id: stray.id });
    }
    const afterCats = await admin.rpc('master_list', { p_entity: 'category' });
    check(
      'created categories removed',
      !(afterCats.data ?? []).some((c) => c.name.startsWith('Tablet ')),
    );

    const brands = await admin.rpc('master_list', { p_entity: 'brand' });
    const acer = (brands.data ?? []).find((b) => b.name === 'Acer Indonesia');
    if (acer) await admin.rpc('master_delete', { p_entity: 'brand', p_id: acer.id });
    const afterBrands = await admin.rpc('master_list', { p_entity: 'brand' });
    check(
      'created brands removed',
      !(afterBrands.data ?? []).some((b) => b.name === 'Acer Indonesia'),
    );
  }

  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
