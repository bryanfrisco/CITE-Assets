/**
 * Documents, maintenance and notifications — migration 0019 (Phase 6).
 *
 * IMPLEMENTATION_PLAN.md § Phase 6, "Done when":
 *
 *   "an asset whose warranty_end is 20 days away produces a notification
 *    overnight and the bell shows the red dot."
 *
 * That is asserted literally below: an asset is created with warranty_end 20
 * days out, the nightly job is run, and the notification and the unread count
 * are both checked. The schedule itself is checked separately — a job that
 * works but is not scheduled would pass every other assertion here and still
 * never fire.
 *
 * The client's own addition, 2026-07-30 ("notifikasi perminggu untuk back up"),
 * is asserted the same way, including that a second run in the same week does
 * not send it twice.
 *
 * REPEATABILITY
 * -------------
 * Each run creates its own assets with a timestamp in the serial. Notifications
 * are deduplicated by what they are about, so re-running produces no second
 * copy — which is itself one of the assertions.
 *
 *   supabase start && supabase db reset
 *   npm run test:phase6
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

function isoDaysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
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

  const { data: categories } = await admin.from('categories').select('id').limit(1);
  const { data: statuses } = await admin.from('asset_statuses').select('id, name');
  const { data: conditions } = await admin.from('asset_conditions').select('id, name');
  const available = statuses.find((s) => s.name === 'Available').id;
  const retired = statuses.find((s) => s.name === 'Retired').id;
  const good = conditions.find((c) => c.name === 'Good').id;

  const stamp = Date.now();

  async function newAsset(label, extra = {}) {
    const created = await admin.rpc('create_asset', {
      p_name: `Phase6 ${label}`,
      p_category: categories[0].id,
      p_serial: `SN-P6-${label}-${stamp}`,
      p_location: HO,
      p_status: available,
      p_condition: good,
      ...extra,
    });
    if (created.error) throw new Error(`create_asset ${label}: ${created.error.message}`);
    return created.data;
  }

  // ---- documents ---------------------------------------------------------
  console.log('\nDocuments');
  const docAsset = await newAsset('DOCS');
  {
    const path = `${docAsset.id}/${crypto.randomUUID()}.pdf`;

    const wrongAsset = await admin.rpc('add_document', {
      p_asset: docAsset.id,
      p_kind: 'invoice',
      p_title: 'Somebody else’s file',
      p_path: `${crypto.randomUUID()}/x.pdf`,
      p_size: 100,
      p_mime: 'application/pdf',
    });
    check(
      'a file from another asset’s folder is refused',
      Boolean(wrongAsset.error),
      wrongAsset.error?.message,
    );

    const noTitle = await admin.rpc('add_document', {
      p_asset: docAsset.id,
      p_kind: 'invoice',
      p_title: '  ',
      p_path: path,
      p_size: 100,
      p_mime: 'application/pdf',
    });
    check('a blank title is refused', Boolean(noTitle.error), noTitle.error?.message);

    const fakeSigned = await admin.rpc('add_document', {
      p_asset: docAsset.id,
      p_kind: 'signed_bast',
      p_title: 'Not really signed',
      p_path: path,
      p_size: 100,
      p_mime: 'application/pdf',
    });
    check(
      'a signed E-BAST cannot be uploaded as an ordinary document',
      Boolean(fakeSigned.error),
      fakeSigned.error?.message,
    );

    const added = await admin.rpc('add_document', {
      p_asset: docAsset.id,
      p_kind: 'invoice',
      p_title: 'Invoice 2026-0912',
      p_path: path,
      p_size: 24_000,
      p_mime: 'application/pdf',
    });
    check('an invoice is recorded', !added.error, added.error?.message);

    const detail = await admin.rpc('asset_detail', { p_code: docAsset.assetCode });
    check(
      'and it appears on the asset’s Documents tab',
      (detail.data?.documents ?? []).some((d) => d.title === 'Invoice 2026-0912'),
      JSON.stringify(detail.data?.documents?.map((d) => d.title)),
    );

    const viewer = await clientFor('andi.prasetyo@cite.co.id');
    const byViewer = await viewer.rpc('add_document', {
      p_asset: docAsset.id,
      p_kind: 'other',
      p_title: 'Nope',
      p_path: `${docAsset.id}/x.pdf`,
      p_size: 1,
      p_mime: 'application/pdf',
    });
    check('a Viewer cannot add one', Boolean(byViewer.error), byViewer.error?.message);

    const removed = await admin.rpc('delete_document', { p_id: added.data.id });
    check('a Super Admin can remove it', !removed.error, removed.error?.message);
  }

  // ---- maintenance -------------------------------------------------------
  // Migration 0030 turned this into a log: a title and a date range, no state
  // machine. The old ladder is gone because closing a ticket never brought the
  // asset back into circulation, which is the bug it caused.
  console.log('\nMaintenance');
  const maintAsset = await newAsset('MAINT');
  {
    const noTitle = await admin.rpc('log_maintenance', {
      p_asset: maintAsset.id,
      p_title: '   ',
      p_started: isoDaysFromNow(0),
    });
    check('a record needs a title', Boolean(noTitle.error), noTitle.error?.message);

    const backwards = await admin.rpc('log_maintenance', {
      p_asset: maintAsset.id,
      p_title: 'Impossible schedule',
      p_started: isoDaysFromNow(0),
      p_completed: isoDaysFromNow(-5),
    });
    check(
      'it cannot have finished before it started',
      Boolean(backwards.error),
      backwards.error?.message,
    );

    const negative = await admin.rpc('log_maintenance', {
      p_asset: maintAsset.id,
      p_title: 'Free repair',
      p_started: isoDaysFromNow(0),
      p_cost: -1,
    });
    check('a negative cost is refused', Boolean(negative.error), negative.error?.message);

    const opened = await admin.rpc('log_maintenance', {
      p_asset: maintAsset.id,
      p_title: 'Replace swollen battery',
      p_started: isoDaysFromNow(-4),
      p_detail: 'Battery bulging, keyboard lifted',
      p_is_internal: true,
      p_next_due: isoDaysFromNow(3),
    });
    check('a repair is recorded', !opened.error, opened.error?.message);
    check('with no end date it is still in the shop', opened.data?.ongoing === true);
    const jobId = opened.data?.id;

    const ongoing = await admin.rpc('maintenance_log', { p_locations: scope, p_ongoing: true });
    check(
      'it shows under what is still away',
      (ongoing.data ?? []).some((m) => m.id === jobId),
      ongoing.error?.message,
    );
    check(
      'and everything on that list really is still away',
      (ongoing.data ?? []).every((m) => m.ongoing === true && m.completed_at === null),
    );

    const row = (ongoing.data ?? []).find((m) => m.id === jobId);
    check('the elapsed days are counted from the start', row?.days === 4, String(row?.days));

    const done = await admin.rpc('edit_maintenance', {
      p_id: jobId,
      p_completed: isoDaysFromNow(-1),
      p_cost: 450000,
    });
    check('giving it an end date closes it', !done.error, done.error?.message);
    check('and it reports itself finished', done.data?.ongoing === false);

    const finished = await admin.rpc('maintenance_log', { p_locations: scope, p_ongoing: false });
    const closed = (finished.data ?? []).find((m) => m.id === jobId);
    check('the range is what the log now shows', closed?.days === 3, String(closed?.days));

    // The whole point of the change: the asset's own status is untouched, so a
    // closed repair cannot leave it out of the assign picker.
    const asset = await admin.from('assets').select('status_id').eq('id', maintAsset.id).single();
    check(
      'the asset status was never touched by any of this',
      asset.data?.status_id === available,
      JSON.stringify(asset.data),
    );

    const reopened = await admin.rpc('edit_maintenance', {
      p_id: jobId,
      p_clear_completed: true,
    });
    check('clearing the end date puts it back in the shop', reopened.data?.ongoing === true);
    await admin.rpc('edit_maintenance', { p_id: jobId, p_completed: isoDaysFromNow(-1) });

    const stats = await admin.rpc('maintenance_stats', { p_locations: scope });
    check(
      'the spend and the days both add up',
      Number(stats.data?.cost ?? 0) >= 450000 && Number(stats.data?.days ?? 0) >= 3,
      JSON.stringify(stats.data),
    );

    const viewer = await clientFor('andi.prasetyo@cite.co.id');
    const byViewer = await viewer.rpc('log_maintenance', {
      p_asset: maintAsset.id,
      p_title: 'Nope',
      p_started: isoDaysFromNow(0),
    });
    check('a Viewer cannot record one', Boolean(byViewer.error), byViewer.error?.message);
  }

  // ---- the acceptance criterion -----------------------------------------
  console.log('\nWarranty expiring — the Phase 6 acceptance criterion');
  {
    const soon = await newAsset('WARRANTY', { p_warranty_end: isoDaysFromNow(20) });

    // A retired asset's warranty is nobody's problem; if this one also produced
    // a notification the inbox would fill with devices that no longer exist.
    const gone = await newAsset('RETIRED', { p_warranty_end: isoDaysFromNow(20) });
    await admin.rpc('change_asset_status', {
      p_asset: gone.id,
      p_status: retired,
      p_condition: null,
      p_reason: 'Phase 6 test — should not be notified about',
    });

    const before = await admin.rpc('notification_unread_count');

    const ran = await admin.rpc('run_notification_jobs_now');
    check('the nightly pass runs', !ran.error, ran.error?.message);

    const inbox = await admin.rpc('notifications_list', { p_limit: 200 });
    const mine = (inbox.data ?? []).filter((n) => n.asset_code === soon.assetCode);
    check(
      'an asset 20 days from expiry produces a notification',
      mine.length === 1,
      JSON.stringify(mine.map((n) => n.title)),
    );
    check(
      'it names the asset and the days left',
      mine[0]?.title?.includes(soon.assetCode) && mine[0]?.title?.includes('20 days'),
      mine[0]?.title,
    );
    check('and it deep-links to the asset', mine[0]?.asset_id === soon.id, JSON.stringify(mine[0]));
    check(
      'a retired asset produces nothing',
      !(inbox.data ?? []).some((n) => n.asset_code === gone.assetCode),
    );

    const after = await admin.rpc('notification_unread_count');
    check(
      'the bell’s red dot has something to show',
      (after.data ?? 0) > (before.data ?? 0),
      `${before.data} → ${after.data}`,
    );

    // A nightly job that re-sends every night is a job people stop reading.
    const again = await admin.rpc('run_notification_jobs_now');
    check(
      'running it again sends nothing new',
      again.data?.warranty === 0,
      JSON.stringify(again.data),
    );

    const inbox2 = await admin.rpc('notifications_list', { p_limit: 200 });
    check(
      'and there is still exactly one',
      (inbox2.data ?? []).filter((n) => n.asset_code === soon.assetCode).length === 1,
    );

    // The maintenance job opened above is due in 3 days.
    const maintNotes = (inbox2.data ?? []).filter(
      (n) => n.kind === 'maintenance_reminder' && n.asset_code === maintAsset.assetCode,
    );
    check(
      'a service due in 3 days is flagged too',
      maintNotes.length === 1,
      JSON.stringify(maintNotes),
    );
  }

  console.log('\nReading, and who receives');
  {
    const inbox = await admin.rpc('notifications_list', { p_limit: 200 });
    const first = (inbox.data ?? []).find((n) => !n.read_at);
    check('there is something unread', Boolean(first));

    const read = await admin.rpc('mark_notification_read', { p_id: first.id });
    check('one can be marked read', !read.error, read.error?.message);

    const all = await admin.rpc('mark_all_notifications_read');
    check('and the rest at once', !all.error, all.error?.message);

    const count = await admin.rpc('notification_unread_count');
    check('the dot goes out', count.data === 0, String(count.data));

    // A Viewer can do nothing about a warranty, and an inbox full of things you
    // cannot act on trains people to ignore the bell.
    const viewer = await clientFor('andi.prasetyo@cite.co.id');
    const theirs = await viewer.rpc('notifications_list', { p_limit: 200 });
    check(
      'a Viewer is not notified about warranties',
      !(theirs.data ?? []).some((n) => n.kind === 'warranty_expiring'),
      JSON.stringify(theirs.data?.map((n) => n.kind)),
    );

    const foreign = await viewer.rpc('mark_notification_read', { p_id: first.id });
    check(
      'and cannot mark somebody else’s as read',
      Boolean(foreign.error),
      foreign.error?.message ?? 'it marked it',
    );
  }

  console.log('\nThe weekly backup reminder');
  {
    const inbox = await admin.rpc('notifications_list', { p_limit: 200 });
    const backup = (inbox.data ?? []).filter((n) => n.title.startsWith('Weekly backup'));
    // Stated by presence, not by count: this database keeps every week's
    // reminder, so a total here would be a claim about how long the local
    // stack has been running.
    check('it lands in the Super Admin’s inbox', backup.length >= 1, String(backup.length));
    check(
      'and says what to actually do',
      (backup[0]?.body ?? '').includes('off this phone'),
      backup[0]?.body,
    );

    const twice = await admin.rpc('run_notification_jobs_now');
    check(
      'running the pass again in the same week does not repeat it',
      twice.data?.backup === 0,
      JSON.stringify(twice.data),
    );

    const viewer = await clientFor('andi.prasetyo@cite.co.id');
    const theirs = await viewer.rpc('notifications_list', { p_limit: 200 });
    check(
      'a Viewer does not get it — they cannot run a backup',
      !(theirs.data ?? []).some((n) => n.title.startsWith('Weekly backup')),
    );
  }

  console.log('\nThe jobs are actually scheduled');
  {
    // The generators being correct means nothing if nothing calls them. This is
    // the assertion that would catch a migration applied without pg_cron.
    const jobs = await admin.rpc('scheduled_jobs');
    if (jobs.error) {
      check('the schedule can be read', false, jobs.error.message);
    } else {
      const names = (jobs.data ?? []).map((j) => j.jobname);
      check(
        'the nightly run is scheduled',
        names.includes('cite-daily-notifications'),
        names.join(', '),
      );
      check(
        'and the weekly backup reminder is too',
        names.includes('cite-weekly-backup'),
        names.join(', '),
      );
    }
  }

  console.log('\nThe app cannot write somebody else’s inbox');
  {
    const direct = await admin.from('notifications').insert({
      account_id: (await admin.rpc('bootstrap_session')).data.account.id,
      kind: 'new_bast',
      title: 'Forged',
    });
    check(
      'inserting a notification is refused',
      Boolean(direct.error),
      direct.error?.message ?? 'the insert succeeded',
    );

    // Migration 0021: SECURITY DEFINER with no caller check, so the only way
    // in is the guarded door above.
    const generator = await admin.rpc('notify_warranty_expiring', { p_days: 3650 });
    check(
      'the generators are not callable directly, even by a Super Admin',
      Boolean(generator.error),
      generator.error?.message ?? 'it ran',
    );

    const viewer = await clientFor('andi.prasetyo@cite.co.id');
    const byViewer = await viewer.rpc('run_notification_jobs_now');
    check(
      'and only a Super Admin can run the pass',
      Boolean(byViewer.error),
      byViewer.error?.message ?? 'it ran',
    );
  }

  console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
