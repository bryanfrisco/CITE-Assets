/**
 * The asset code — migrations 0034 and 0035.
 *
 *   SPRLAP24-HO-0064
 *   ------------ ----
 *    the system   the person
 *
 * Client instruction, 2026-08-07: "sprlap dan ho harus by sistem otomatis
 * narik data dari company spr ... lalu lap ambil code di kategori, ho itu dari
 * lokasinya mana. lalu nomor nomor belakang kita isi sendiri saja."
 *
 * What is worth proving:
 *
 *   1. The prefix is DERIVED, not sent. Company from the location, category
 *      code from master data, two-digit year from the purchase date, location
 *      code from the location.
 *   2. The number is the caller's, and it is digits only. A whole-code field
 *      would let anyone write `HACK001-24-001` and the prefix would stop being
 *      something you can read a category off without trusting who typed it.
 *   3. Left empty, the register picks the next one — read off the codes that
 *      already exist, so an imported legacy code decides where it continues.
 *      That is the property that makes a spreadsheet import work with nobody
 *      seeding a counter.
 *   4. Duplicates are refused, by name, so the person can pick another.
 *   5. Only a Super Admin may send a whole code.
 *
 * REPEATABILITY
 * -------------
 * Every asset here is created under its own category, made fresh per run, so
 * the sequence never collides with a previous run's. Nothing is cleaned up and
 * no assertion counts rows.
 *
 *   supabase start && supabase db reset
 *   npm run test:code
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
  const ho = options.locations.find((l) => l.code === 'HO');
  const site = options.locations.find((l) => l.code === 'SITE');
  const available = options.statuses.find((s) => s.name === 'Available').id;
  const good = options.conditions.find((c) => c.name === 'Good').id;

  // A category of this suite's own, so the sequence starts clean every run.
  const catCode = `Z${String(stamp).slice(-2)}`;
  const made = await admin.rpc('master_create', {
    p_entity: 'category',
    p_name: `Code Probe ${stamp}`,
    p_extra: { code: catCode, icon: 'box' },
  });
  if (made.error) throw new Error(`master_create: ${made.error.message}`);
  const category = made.data.id;

  const create = (extra) =>
    admin.rpc('create_asset', {
      p_name: `Code Probe ${stamp}`,
      p_category: category,
      p_location: ho.id,
      p_status: available,
      p_condition: good,
      ...extra,
    });

  // ---- the prefix is derived ---------------------------------------------
  console.log('\nThe prefix is the system’s');
  {
    const prefix = await admin.rpc('asset_code_prefix', {
      p_category: category,
      p_location: ho.id,
      p_purchase: '2024-03-01',
    });
    check(
      'company + category + year + location, in that order',
      prefix.data === `SPR${catCode}24-HO-`,
      prefix.data,
    );

    const atSite = await admin.rpc('asset_code_prefix', {
      p_category: category,
      p_location: site.id,
      p_purchase: '2024-03-01',
    });
    check('the location decides HO vs SITE', atSite.data === `SPR${catCode}24-SITE-`, atSite.data);

    const noDate = await admin.rpc('asset_code_prefix', {
      p_category: category,
      p_location: ho.id,
    });
    const thisYear = String(new Date().getFullYear()).slice(-2);
    check(
      'with no purchase date the current year is used',
      noDate.data === `SPR${catCode}${thisYear}-HO-`,
      noDate.data,
    );
  }

  // ---- the number is the person's ----------------------------------------
  console.log('\nThe number is the person’s');
  {
    const typed = await create({
      p_serial: `SN-CODE-A-${stamp}`,
      p_purchase_date: '2024-03-01',
      p_code_seq: '64',
    });
    check(
      'a typed number is padded to four and glued to the prefix',
      typed.data?.assetCode === `SPR${catCode}24-HO-0064`,
      typed.data?.assetCode ?? typed.error?.message,
    );

    // 64 and 0064 have to be the same asset, or the register grows two.
    const same = await create({
      p_serial: `SN-CODE-B-${stamp}`,
      p_purchase_date: '2024-03-01',
      p_code_seq: '0064',
    });
    check(
      'the same number written differently is refused by name',
      same.error?.message === `Asset code SPR${catCode}24-HO-0064 is already in use`,
      same.error?.message,
    );

    const letters = await create({
      p_serial: `SN-CODE-C-${stamp}`,
      p_purchase_date: '2024-03-01',
      p_code_seq: 'HACK',
    });
    check(
      'letters in the number are refused',
      letters.error?.message === 'The asset number must be digits',
      letters.error?.message,
    );

    const long = await create({
      p_serial: `SN-CODE-D-${stamp}`,
      p_purchase_date: '2024-03-01',
      p_code_seq: '123456789',
    });
    check(
      'an implausible number is refused',
      long.error?.message === 'That asset number is too long',
      long.error?.message,
    );
  }

  // ---- left empty, the register continues from what exists ----------------
  console.log('\nLeft empty, it reads the codes that already exist');
  {
    const next = await create({
      p_serial: `SN-CODE-E-${stamp}`,
      p_purchase_date: '2024-03-01',
    });
    check(
      'the next code continues from 0064, with no counter to seed',
      next.data?.assetCode === `SPR${catCode}24-HO-0065`,
      next.data?.assetCode ?? next.error?.message,
    );

    const preview = await admin.rpc('preview_asset_code', {
      p_category: category,
      p_location: ho.id,
      p_purchase: '2024-03-01',
    });
    check(
      'and the form preview agrees with what would be allocated',
      preview.data === `SPR${catCode}24-HO-0066`,
      preview.data,
    );

    // A different year is a different prefix, so it has its own sequence.
    const otherYear = await create({
      p_serial: `SN-CODE-F-${stamp}`,
      p_purchase_date: '2026-03-01',
    });
    check(
      'another year starts its own run',
      otherYear.data?.assetCode === `SPR${catCode}26-HO-0001`,
      otherYear.data?.assetCode ?? otherYear.error?.message,
    );
  }

  // ---- the whole code stays Super Admin only ------------------------------
  console.log('\nThe whole code is still Super Admin only');
  {
    const siteIt = await clientFor('siti.rahayu@cite.co.id');
    const forged = await siteIt.rpc('create_asset', {
      p_name: `Forged ${stamp}`,
      p_category: category,
      p_serial: `SN-CODE-G-${stamp}`,
      p_location: ho.id,
      p_status: available,
      p_condition: good,
      p_asset_code: 'HACK001-24-001',
    });
    check(
      'Site IT cannot send a whole code',
      forged.error?.message === 'Only a Super Admin may set the whole asset code',
      forged.error?.message,
    );

    // But it may still choose a number, because the prefix stays derived and
    // the code cannot be made to claim anything untrue.
    const numbered = await siteIt.rpc('create_asset', {
      p_name: `Site Numbered ${stamp}`,
      p_category: category,
      p_serial: `SN-CODE-H-${stamp}`,
      p_location: ho.id,
      p_status: available,
      p_condition: good,
      p_purchase_date: '2024-03-01',
      p_code_seq: '900',
    });
    check(
      'but it may choose the number',
      numbered.data?.assetCode === `SPR${catCode}24-HO-0900`,
      numbered.data?.assetCode ?? numbered.error?.message,
    );
  }

  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
