-- ============================================================================
-- CITE Assets — 0023 Run the notification jobs on demand
--
-- Migration 0021 closed the generators to clients, which was right: they are
-- SECURITY DEFINER with no caller check, written for cron where there is no
-- caller.
--
-- But that left nobody able to answer "is this actually working?" without
-- waiting until 22:00 UTC and hoping. A scheduled job you cannot trigger is a
-- job you cannot verify, and the first time anyone would notice it was broken
-- is a warranty that quietly expired.
--
-- So the generators stay closed and this opens ONE guarded door: a Super Admin
-- may run the nightly pass now. It is the same code the schedule runs — not a
-- copy — so a green result here means the real thing works.
--
-- Deduplication makes this safe to press. Running it twice sends nothing the
-- second time, because the notifications are keyed by what they are about.
-- ============================================================================

create or replace function run_notification_jobs_now()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if my_role() is distinct from 'super_admin' then
    raise exception 'Only a Super Admin can run the notification jobs'
      using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'warranty',    notify_warranty_expiring(),
    'maintenance', notify_maintenance_due(),
    'backup',      notify_weekly_backup()
  );
end $$;

revoke all      on function run_notification_jobs_now() from public, anon, authenticated;
grant  execute  on function run_notification_jobs_now() to authenticated;
