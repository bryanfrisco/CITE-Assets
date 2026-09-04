-- ============================================================================
-- CITE Assets — 0083 The nightly run actually raises the new reminders
--
-- Two reminders existed and neither could ever fire, because cron calls exactly
-- one function — run_daily_notifications() — and neither was in it. A notifier
-- nothing calls is worse than no notifier: the code reads as though somebody is
-- being told.
--
--   notify_license_expiring()  was written in 0082 and never wired in.
--
--   Assets due by RULE were never notified at all. notify_maintenance_due()
--   reads maintenance_records.next_due_at — a date somebody typed. The whole
--   point of the service rules was that nobody has to type it, so an asset
--   whose due date comes from its category had no notifier looking at it.
--
-- The second one is added here, deriving the date exactly the way
-- maintenance_due_list() does: last completed service, else purchase date, else
-- created_at. Written out rather than calling that function because it is
-- `security invoker` and takes a location list; this runs as cron, for everyone.
-- ============================================================================

create or replace function notify_scheduled_maintenance(p_days int default 14)
returns int language plpgsql security definer set search_path = public as $$
declare inserted int;
begin
  with due as (
    select
      a.id as asset_id, a.asset_code, a.name, a.location_id,
      s.every_months,
      (coalesce(
         (select max(m.completed_at) from maintenance_records m
           where m.asset_id = a.id and m.completed_at is not null),
         a.purchase_date, a.created_at::date)
       + (s.every_months || ' months')::interval)::date as due_on
    from assets a
    join maintenance_schedules s on s.category_id = a.category_id and s.is_active
    join asset_statuses st on st.id = a.status_id
    where not st.is_terminal
  ),
  soon as (
    select * from due where due_on <= current_date + coalesce(p_days, 14)
  ),
  fanned as (
    select r.account_id, d.*
      from soon d
      cross join lateral notify_recipients(d.location_id) as r(account_id)
  )
  insert into notifications (account_id, kind, title, body, asset_id, dedupe_key)
  select
    f.account_id,
    'maintenance_reminder',
    f.asset_code || ' service due ' || to_char(f.due_on, 'DD Mon YYYY'),
    f.name || ' — every ' || f.every_months || ' month' ||
      case when f.every_months = 1 then '' else 's' end,
    f.asset_id,
    -- The due date is in the key, so a completed service moves the date and
    -- earns a fresh reminder rather than being silenced by the old one.
    'schedule:' || f.asset_id || ':' || f.due_on
  from fanned f
  on conflict (account_id, dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end $$;

create or replace function run_daily_notifications()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return jsonb_build_object(
    'warranty',    notify_warranty_expiring(),
    'maintenance', notify_maintenance_due(),
    'scheduled',   notify_scheduled_maintenance(),
    'licenses',    notify_license_expiring()
  );
end $$;

revoke all on function notify_scheduled_maintenance(int) from public, anon, authenticated;
revoke all on function notify_license_expiring(int)      from public, anon, authenticated;
