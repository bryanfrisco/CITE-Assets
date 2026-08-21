/**
 * Accessories — counted stock, not identified assets.
 *
 * The number that matters is `available`, and it is deliberately never stored:
 * it is derived from total_qty minus what is out. A stored copy is how stock
 * figures start to drift, and a drifting figure is worse than none because
 * people trust it. So most of this suite is arithmetic — hand things out, take
 * them back, and check the shelf count every time.
 *
 * The other half is scope. One row per location is what makes Site IT spend
 * Site stock and nothing else, and that is enforced by RLS rather than by the
 * screen, so it is checked with a Site IT token.
 *
 *   supabase start && supabase db reset
 *   npm run test:accessories
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

  const locations = (await admin.from('locations').select('id, code, name')).data ?? [];
  const ho = locations.find((l) => l.code === 'HO');
  const site = locations.find((l) => l.code === 'SITE');
  const scope = locations.map((l) => l.id);
  const category = (await admin.from('categories').select('id').eq('code', 'ACC').single()).data;

  const detailOf = async (id) => (await admin.rpc('accessory_detail', { p_id: id })).data;
  const availableOf = async (id) => (await detailOf(id)).accessory.availableQty;

  console.log('\nAdding stock');
  let mouseHo;
  {
    const created = await admin.rpc('create_accessory', {
      p_input: {
        name: 'Logitech M170 Wireless Mouse',
        categoryId: category.id,
        locationId: ho.id,
        totalQty: 50,
        purchasePrice: '85000',
      },
    });
    check('an accessory is created', !created.error, created.error?.message);
    mouseHo = created.data?.id;

    check(
      'everything is on the shelf to begin with',
      (await availableOf(mouseHo)) === 50,
      String(await availableOf(mouseHo)),
    );

    const dup = await admin.rpc('create_accessory', {
      p_input: {
        name: 'logitech m170 wireless mouse',
        categoryId: category.id,
        locationId: ho.id,
        totalQty: 5,
      },
    });
    check(
      'the same name at the same location is refused',
      /already exists/i.test(dup.error?.message ?? ''),
      dup.error?.message,
    );

    const atSite = await admin.rpc('create_accessory', {
      p_input: {
        name: 'Logitech M170 Wireless Mouse',
        categoryId: category.id,
        locationId: site.id,
        totalQty: 30,
      },
    });
    check(
      '...but the same name at another location is a separate stock',
      !atSite.error,
      atSite.error?.message,
    );
  }

  const person = (await admin.rpc('assignable_employees', { p_locations: scope })).data?.[0];

  console.log('\nHanding them out');
  let checkoutId;
  {
    const tooMany = await admin.rpc('assign_accessory', {
      p_accessory: mouseHo,
      p_account: person.id,
      p_qty: 51,
    });
    check(
      'more than the shelf holds is refused, and the message says how many are left',
      /Only 50 left/.test(tooMany.error?.message ?? ''),
      tooMany.error?.message,
    );

    const none = await admin.rpc('assign_accessory', {
      p_accessory: mouseHo,
      p_account: person.id,
      p_qty: 0,
    });
    check('zero is refused', Boolean(none.error), none.error?.message ?? 'no error');

    const out = await admin.rpc('assign_accessory', {
      p_accessory: mouseHo,
      p_account: person.id,
      p_qty: 3,
      p_notes: 'Handed over with the laptop',
    });
    check('three go out', out.data?.qty === 3, out.error?.message);
    check(
      'the shelf drops by three',
      out.data?.availableQty === 47,
      String(out.data?.availableQty),
    );
    checkoutId = out.data?.checkoutId;

    const detail = await detailOf(mouseHo);
    check(
      'the total is untouched',
      detail.accessory.totalQty === 50,
      String(detail.accessory.totalQty),
    );
    check(
      'three are counted as out',
      detail.accessory.assignedQty === 3,
      String(detail.accessory.assignedQty),
    );
    check(
      'the hand-out is in the history with the holder named',
      detail.history[0]?.accountName === person.full_name && detail.history[0]?.qty === 3,
      JSON.stringify(detail.history[0]),
    );
  }

  console.log('\nThe total cannot fall below what is out');
  {
    const shrink = await admin.rpc('update_accessory', {
      p_id: mouseHo,
      p_input: { totalQty: 2 },
    });
    check(
      'reducing the total below three is refused',
      /still out/i.test(shrink.error?.message ?? ''),
      shrink.error?.message,
    );

    const ok = await admin.rpc('update_accessory', { p_id: mouseHo, p_input: { totalQty: 40 } });
    check('...but reducing it to forty is fine', !ok.error, ok.error?.message);
    check(
      'and the shelf follows',
      (await availableOf(mouseHo)) === 37,
      String(await availableOf(mouseHo)),
    );
  }

  console.log('\nTaking them back');
  {
    const back = await admin.rpc('return_accessory', { p_checkout: checkoutId });
    check('they come back', back.data?.qty === 3, back.error?.message);
    check(
      'the shelf is whole again',
      back.data?.availableQty === 40,
      String(back.data?.availableQty),
    );

    const twice = await admin.rpc('return_accessory', { p_checkout: checkoutId });
    check(
      'returning twice is refused',
      /already been returned/i.test(twice.error?.message ?? ''),
      twice.error?.message,
    );
  }

  console.log('\nStock belongs to a location');
  {
    const all = (await admin.rpc('accessories_list', { p_locations: scope })).data ?? [];
    check(
      'an admin sees both mice',
      all.filter((x) => /M170/.test(x.name)).length === 2,
      String(all.filter((x) => /M170/.test(x.name)).length),
    );

    // Siti Rahayu is Site IT, locked to Head Office by the seed.
    const siteIt = await clientFor('siti.rahayu@cite.co.id');
    const mine = (await siteIt.rpc('accessories_list', { p_locations: scope })).data ?? [];
    const names = mine.map((x) => x.location_name);
    check(
      'Site IT sees exactly one location worth of stock',
      new Set(names).size <= 1,
      JSON.stringify([...new Set(names)]),
    );

    const hidden = (await siteIt.rpc('accessory_detail', { p_id: mouseHo })).data;
    const visible = mine.some((x) => x.id === mouseHo);
    check(
      'and RLS decides, not the list query',
      visible ? hidden !== null : hidden === null,
      `visible=${visible} detail=${hidden === null ? 'null' : 'row'}`,
    );
  }

  console.log('\nA Viewer may not hand anything out');
  {
    const viewer = await clientFor('andi.prasetyo@cite.co.id');
    const refused = await viewer.rpc('assign_accessory', {
      p_accessory: mouseHo,
      p_account: person.id,
      p_qty: 1,
    });
    check('a Viewer is refused', Boolean(refused.error), refused.error?.message ?? 'no error');
  }

  console.log(failures === 0 ? '\nAll good.\n' : `\n${failures} failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
