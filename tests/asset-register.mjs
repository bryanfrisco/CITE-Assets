/**
 * Asset register — IMPLEMENTATION_PLAN.md § Phase 3, "Done when":
 *
 *   "search finds an asset by serial number and by the holder's name, and the
 *    Timeline shows purchase → registration → assignment events from real rows."
 *
 * Both halves are asserted below against the seeded data, through the same
 * RPCs the screens call.
 *
 *   supabase start && supabase db reset
 *   npm run test:register
 */

import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = 'cite-dev-2026';

const SEEDED_HO = ['LPT045-24-118', 'MON122-24-205', 'SRV003-21-014', 'LPT099-21-004'];
const SEEDED_SITE = ['LPT012-23-076', 'PRN008-22-031', 'NET031-23-090'];
const SEEDED_ALL = [...SEEDED_HO, ...SEEDED_SITE];
const has = (rows, codes) =>
  codes.every((c) => (rows ?? []).some((r) => (r.asset_code ?? r) === c));

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
  const allScope = locations.map((l) => l.id);
  const hoOnly = [locations.find((l) => l.code === 'HO').id];

  const search = (query, scope = allScope, status = null) =>
    admin.rpc('search_assets', { p_locations: scope, p_query: query, p_status: status });

  console.log('\nSearch — README § Assets');
  {
    const all = await search('');
    check(
      'empty query returns every asset in scope',
      has(all.data, SEEDED_ALL),
      (all.data ?? []).map((r) => r.asset_code).join(', '),
    );

    // The two the acceptance criterion names.
    const bySerial = await search('PF3XK92L');
    check(
      'finds an asset by serial number',
      bySerial.data?.length === 1 && bySerial.data[0].asset_code === 'LPT045-24-118',
      JSON.stringify(bySerial.data?.map((r) => r.asset_code)),
    );

    const byHolder = await search('Andi');
    check(
      "finds an asset by the holder's name",
      byHolder.data?.length === 1 && byHolder.data[0].asset_code === 'LPT045-24-118',
      JSON.stringify(byHolder.data?.map((r) => r.asset_code)),
    );

    // The rest of the fields README lists.
    const byCode = await search('NET031');
    check('finds by asset code', byCode.data?.length === 1, `got ${byCode.data?.length}`);

    const byName = await search('ThinkPad');
    check('finds by asset name', byName.data?.length === 1, `got ${byName.data?.length}`);

    const byBrand = await search('Dell');
    check('finds by brand', byBrand.data?.length === 2, `got ${byBrand.data?.length}`);

    const byModel = await search('Catalyst');
    check('finds by model', byModel.data?.length === 1, `got ${byModel.data?.length}`);

    const byDept = await search('Procurement');
    check('finds by department', byDept.data?.length === 0, `got ${byDept.data?.length}`);

    const caseInsensitive = await search('thinkpad');
    check('search is case-insensitive', caseInsensitive.data?.length === 1);

    const noMatch = await search('zzzz-nothing');
    check('a miss returns an empty list, not an error', noMatch.data?.length === 0);
  }

  console.log('\nStatus filter and scope');
  {
    const { data: statuses } = await admin.from('asset_statuses').select('id, name');
    const assigned = statuses.find((s) => s.name === 'Assigned').id;

    const filtered = await search('', allScope, assigned);
    check(
      'status chip filters the list',
      filtered.data?.length === 4,
      `got ${filtered.data?.length}`,
    );

    const scoped = await search('', hoOnly);
    check(
      'scope narrows the list to Head Office',
      has(scoped.data, SEEDED_HO) &&
        !SEEDED_SITE.some((c) => (scoped.data ?? []).some((r) => r.asset_code === c)),
      (scoped.data ?? []).map((r) => r.asset_code).join(', '),
    );

    const scopedSite = await search('PF3XK92L', [locations.find((l) => l.code === 'SITE').id]);
    check(
      'an out-of-scope asset is not returned even by exact serial',
      scopedSite.data?.length === 0,
    );

    const count = await admin.rpc('count_assets_in_scope', { p_locations: allScope });
    check(
      'scope count feeds the "n of m in scope" line',
      count.data >= SEEDED_ALL.length,
      `got ${count.data}`,
    );
  }

  console.log('\nScope is a filter, RLS is the boundary');
  {
    const siteIt = await clientFor('siti.rahayu@cite.co.id');
    // Ask for both locations even though RLS only allows Head Office.
    const overreach = await siteIt.rpc('search_assets', {
      p_locations: allScope,
      p_query: '',
      p_status: null,
    });
    check(
      'Site IT asking for a wider scope still only gets its own location',
      has(overreach.data, SEEDED_HO) &&
        !SEEDED_SITE.some((c) => (overreach.data ?? []).some((r) => r.asset_code === c)),
      (overreach.data ?? []).map((r) => r.asset_code).join(', '),
    );
    check(
      'no Site rows leak through the widened scope',
      (overreach.data ?? []).every((r) => r.location_name === 'Head Office'),
    );

    const hidden = await siteIt.rpc('asset_detail', { p_code: 'NET031-23-090' });
    check('asset_detail returns null for an out-of-scope asset', hidden.data === null);
  }

  console.log('\nAsset detail — the six tabs');
  {
    const { data } = await admin.rpc('asset_detail', { p_code: 'LPT045-24-118' });
    check('returns the asset', data?.asset?.assetCode === 'LPT045-24-118');
    check('resolves display names', data?.asset?.brandName === 'Lenovo', data?.asset?.brandName);
    check('resolves the holder', data?.asset?.assignedToName === 'Andi Prasetyo');
    check('carries the specifications JSON', (data?.asset?.specifications ?? []).length === 6);
    check('assignments tab has the active row', (data?.assignments ?? []).length === 1);
    check(
      'the assignment carries its BAST number',
      data?.assignments?.[0]?.bastNumber === 'BAST/CITE/2026/0182',
      data?.assignments?.[0]?.bastNumber,
    );
    check('documents tab is populated', (data?.documents ?? []).length === 2);

    const maint = await admin.rpc('asset_detail', { p_code: 'LPT012-23-076' });
    check('maintenance tab is populated', (maint.data?.maintenance ?? []).length === 1);
  }

  console.log('\nTimeline — purchase → registration → assignment from real rows');
  {
    const { data } = await admin.rpc('asset_detail', { p_code: 'LPT045-24-118' });
    const kinds = (data?.timeline ?? []).map((e) => e.kind);

    check('timeline is not empty', kinds.length >= 3, `got ${kinds.length}`);
    check('has a purchased event', kinds.includes('purchased'));
    check('has a registered event', kinds.includes('registered'));
    check('has an assigned event', kinds.includes('assigned'));

    // Newest first, per the design's rail.
    const times = (data?.timeline ?? []).map((e) => new Date(e.at).getTime());
    const sorted = [...times].sort((x, y) => y - x);
    check('events are sorted newest first', JSON.stringify(times) === JSON.stringify(sorted));

    // Chronologically the three must run purchase → registration → assignment.
    const at = (kind) => new Date(data.timeline.find((e) => e.kind === kind).at).getTime();
    check(
      'purchase precedes registration',
      at('purchased') <= at('registered'),
      `${at('purchased')} vs ${at('registered')}`,
    );

    const assignedEvent = data.timeline.find((e) => e.kind === 'assigned');
    check(
      'the assignment event names the holder',
      assignedEvent.detail.includes('Andi Prasetyo'),
      assignedEvent.detail,
    );
    check(
      'the assignment event tags the BAST number',
      assignedEvent.tag === 'BAST/CITE/2026/0182',
      assignedEvent.tag,
    );

    const moved = await admin.rpc('asset_detail', { p_code: 'NET031-23-090' });
    const movedKinds = (moved.data?.timeline ?? []).map((e) => e.kind);
    check('a moved asset shows its movement event', movedKinds.includes('moved'));
    const movedEvent = moved.data.timeline.find((e) => e.kind === 'moved');
    check(
      'the movement event reads origin → destination',
      movedEvent.detail.startsWith('Head Office → Site'),
      movedEvent.detail,
    );

    const maint = await admin.rpc('asset_detail', { p_code: 'LPT012-23-076' });
    check(
      'a serviced asset shows its maintenance event',
      (maint.data?.timeline ?? []).some((e) => e.kind === 'maintenance'),
    );
  }

  console.log('\nEdit');
  {
    const { data: detail } = await admin.rpc('asset_detail', { p_code: 'MON122-24-205' });
    const a = detail.asset;

    const dupSerial = await admin.rpc('update_asset', {
      p_id: a.id,
      p_name: a.name,
      p_category: a.categoryId,
      p_serial: 'PF3XK92L', // belongs to LPT045
      p_location: a.locationId,
      p_status: a.statusId,
      p_condition: a.conditionId,
    });
    check(
      'edit rejects a serial that belongs to another asset',
      dupSerial.error?.message === 'Serial number already registered',
      dupSerial.error?.message,
    );

    const renamed = await admin.rpc('update_asset', {
      p_id: a.id,
      p_name: 'Dell P2422H 24" Monitor (edited)',
      p_category: a.categoryId,
      p_serial: a.serialNumber,
      p_location: a.locationId,
      p_status: a.statusId,
      p_condition: a.conditionId,
      p_notes: a.notes,
      p_specifications: a.specifications,
    });
    check('edit saves', !renamed.error, renamed.error?.message);

    const after = await admin.rpc('asset_detail', { p_code: 'MON122-24-205' });
    check('the edit is visible immediately', after.data.asset.name.endsWith('(edited)'));

    const siteIt = await clientFor('siti.rahayu@cite.co.id');
    const codeChange = await siteIt.rpc('update_asset', {
      p_id: a.id,
      p_name: a.name,
      p_category: a.categoryId,
      p_serial: a.serialNumber,
      p_location: a.locationId,
      p_status: a.statusId,
      p_condition: a.conditionId,
      p_asset_code: 'HACK001-24-001',
    });
    check(
      'only a Super Admin may edit the asset code',
      codeChange.error?.message === 'Only a Super Admin may edit the asset code',
      codeChange.error?.message,
    );

    // Restore the seeded name so the suite is repeatable.
    await admin.rpc('update_asset', {
      p_id: a.id,
      p_name: 'Dell P2422H 24" Monitor',
      p_category: a.categoryId,
      p_serial: a.serialNumber,
      p_location: a.locationId,
      p_status: a.statusId,
      p_condition: a.conditionId,
      p_notes: a.notes,
      p_specifications: a.specifications,
    });
    const restored = await admin.rpc('asset_detail', { p_code: 'MON122-24-205' });
    check(
      'cleanup restored the seeded name',
      restored.data.asset.name === 'Dell P2422H 24" Monitor',
    );
  }

  console.log('\nPhoto path guard');
  {
    const { data: detail } = await admin.rpc('asset_detail', { p_code: 'MON122-24-205' });
    const otherId = (await admin.rpc('asset_detail', { p_code: 'LPT045-24-118' })).data.asset.id;

    const wrongFolder = await admin.rpc('set_asset_photo', {
      p_asset: detail.asset.id,
      p_path: `${otherId}/stolen.jpg`,
    });
    check(
      'a photo path from another asset is rejected',
      wrongFolder.error?.message === 'Photo path does not belong to this asset',
      wrongFolder.error?.message,
    );

    const ok = await admin.rpc('set_asset_photo', {
      p_asset: detail.asset.id,
      p_path: `${detail.asset.id}/cover.jpg`,
    });
    check('a well-formed photo path is accepted', !ok.error, ok.error?.message);

    await admin.rpc('set_asset_photo', { p_asset: detail.asset.id, p_path: null });
  }

  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
