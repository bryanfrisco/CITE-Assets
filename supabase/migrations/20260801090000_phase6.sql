-- ============================================================================
-- CITE Assets — 0019 Documents, maintenance, notifications  (Phase 6)
--
-- IMPLEMENTATION_PLAN.md § Phase 6, "Done when":
--   "an asset whose warranty_end is 20 days away produces a notification
--    overnight and the bell shows the red dot."
--
-- Plus the client's own addition, 2026-07-30:
--   "untuk back up tolong buatkan notifikasi perminggu nya untuk back up
--    seluruh data"
--
-- WHY NOTIFICATIONS NEED A DEDUPE KEY
-- -----------------------------------
-- A nightly job that inserts "warranty expiring" for every asset inside the
-- window would insert it again the next night, and the night after that. In a
-- month the inbox is thirty copies of the same sentence and nobody reads any of
-- them. The key is what the notification is ABOUT — the asset and the date it
-- expires — so re-running the job is free and the row is written once.
--
-- That also makes the jobs safe to run by hand, which is how they are tested.
--
-- WHO GETS TOLD
-- -------------
-- Whoever could act on it, within their own scope: Super Admin and Corporate IT
-- see every location, Site IT only its own. A Viewer gets nothing — there is
-- nothing they could do about it, and an inbox of things you cannot act on is
-- noise that trains people to ignore the bell.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Documents — the per-asset library.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'asset-documents', 'asset-documents', false,
  20971520,                                    -- 20 MB: invoices and manuals
  array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/heic',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do nothing;

-- Same shape as asset-photos: '<asset_id>/<uuid>.<ext>', so storage_asset_id()
-- from migration 0011 resolves the owner and can_see_asset() decides.
create policy asset_documents_read on storage.objects for select to authenticated
  using (bucket_id = 'asset-documents' and can_see_asset(storage_asset_id(name)));

create policy asset_documents_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'asset-documents'
    and can_write_assets()
    and can_see_asset(storage_asset_id(name))
  );

create policy asset_documents_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'asset-documents'
    and my_role() = 'super_admin'
    and can_see_asset(storage_asset_id(name))
  );

-- ---------------------------------------------------------------------------
-- add_document() — records an upload that has already reached the bucket.
-- ---------------------------------------------------------------------------
create or replace function add_document(
  p_asset uuid,
  p_kind  text,
  p_title text,
  p_path  text,
  p_size  bigint default null,
  p_mime  text   default null
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare k document_kind; new_id uuid;
begin
  if not can_write_assets() or not can_see_asset(p_asset) then
    raise exception 'You do not have permission to add a document here'
      using errcode = 'P0001';
  end if;

  begin
    k := p_kind::document_kind;
  exception when others then
    raise exception 'Unknown document kind' using errcode = 'P0001';
  end;

  -- signed_bast is written by attach_signed_bast() alone. Letting it be added
  -- here would put a file on the Documents tab claiming to be a signed
  -- handover with no BAST behind it.
  if k = 'signed_bast' then
    raise exception 'A signed E-BAST is recorded by signing, not uploaded here'
      using errcode = 'P0001';
  end if;

  if coalesce(btrim(p_title), '') = '' then
    raise exception 'Give the document a title' using errcode = 'P0001';
  end if;

  -- The path must live under this asset's folder, or one asset could point at
  -- another's file and sidestep the storage policies.
  if split_part(p_path, '/', 1) <> p_asset::text then
    raise exception 'File path does not belong to this asset' using errcode = 'P0001';
  end if;

  insert into documents (asset_id, kind, title, file_path, file_size, mime_type, uploaded_by)
  values (p_asset, k, btrim(p_title), p_path, p_size, p_mime, my_account_id())
  returning id into new_id;

  return jsonb_build_object('id', new_id, 'kind', k, 'filePath', p_path);
end $$;

-- ---------------------------------------------------------------------------
-- delete_document() — Super Admin only, and never a signed E-BAST.
--
-- The row and the object go together. Deleting one without the other leaves
-- either a listing that opens nothing or bytes nobody can reach.
-- ---------------------------------------------------------------------------
create or replace function delete_document(p_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare d documents%rowtype;
begin
  select * into d from documents where id = p_id;
  if not found then
    raise exception 'Document not found' using errcode = 'P0001';
  end if;
  if my_role() is distinct from 'super_admin' or not can_see_asset(d.asset_id) then
    raise exception 'Only a Super Admin can remove a document' using errcode = 'P0001';
  end if;
  if d.kind = 'signed_bast' then
    raise exception 'A signed E-BAST cannot be removed — it is the record of a handover'
      using errcode = 'P0001';
  end if;

  delete from documents where id = p_id;
  return jsonb_build_object('id', p_id, 'filePath', d.file_path);
end $$;

-- ---------------------------------------------------------------------------
-- Maintenance.
-- ---------------------------------------------------------------------------
create or replace function open_maintenance(
  p_asset       uuid,
  p_title       text,
  p_detail      text    default null,
  p_vendor      uuid    default null,
  p_is_internal boolean default false,
  p_warranty    boolean default false,
  p_started     date    default null,
  p_next_due    date    default null
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare new_id uuid; started date := coalesce(p_started, current_date);
begin
  if not can_write_assets() or not can_see_asset(p_asset) then
    raise exception 'You do not have permission to record maintenance here'
      using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'What is being done?' using errcode = 'P0001';
  end if;
  if p_next_due is not null and p_next_due < started then
    raise exception 'The next service cannot be due before this one started'
      using errcode = 'P0001';
  end if;

  insert into maintenance_records (
    asset_id, title, detail, vendor_id, is_internal, under_warranty,
    started_at, next_due_at, created_by
  ) values (
    p_asset, btrim(p_title), nullif(btrim(coalesce(p_detail, '')), ''),
    p_vendor, coalesce(p_is_internal, false), coalesce(p_warranty, false),
    started, p_next_due, my_account_id()
  ) returning id into new_id;

  return jsonb_build_object('id', new_id, 'state', 'open');
end $$;

create or replace function update_maintenance(
  p_id        uuid,
  p_state     text    default null,
  p_cost      numeric default null,
  p_detail    text    default null,
  p_completed date    default null,
  p_next_due  date    default null
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  m         maintenance_records%rowtype;
  s         maintenance_state;
  next_done date;
begin
  select * into m from maintenance_records where id = p_id;
  if not found then
    raise exception 'Maintenance record not found' using errcode = 'P0001';
  end if;
  if not can_write_assets() or not can_see_asset(m.asset_id) then
    raise exception 'You do not have permission to change this record'
      using errcode = 'P0001';
  end if;

  if p_state is not null then
    begin
      s := p_state::maintenance_state;
    exception when others then
      raise exception 'Unknown state' using errcode = 'P0001';
    end;
  else
    s := m.state;
  end if;

  -- A finished job has a date. Without this the reports cannot tell a job that
  -- closed today from one that closed last year.
  next_done := case
    when s in ('completed', 'cancelled') then coalesce(p_completed, m.completed_at, current_date)
    else null
  end;

  if p_cost is not null and p_cost < 0 then
    raise exception 'A cost cannot be negative' using errcode = 'P0001';
  end if;

  update maintenance_records set
    state        = s,
    cost         = coalesce(p_cost, cost),
    detail       = coalesce(nullif(btrim(coalesce(p_detail, '')), ''), detail),
    completed_at = next_done,
    next_due_at  = coalesce(p_next_due, next_due_at)
  where id = p_id;

  return jsonb_build_object('id', p_id, 'state', s, 'completedAt', next_done);
end $$;

/** Open work across a scope — the Maintenance module list. */
create or replace function maintenance_list(p_locations uuid[], p_state text default null)
returns table (
  id uuid, asset_id uuid, asset_code text, asset_name text,
  title text, detail text, state maintenance_state,
  vendor_name text, cost numeric, under_warranty boolean,
  started_at date, completed_at date, next_due_at date,
  location_name text
)
language sql stable security invoker set search_path = public as $$
  select
    m.id, a.id, a.asset_code, a.name,
    m.title, m.detail, m.state,
    v.name, m.cost, m.under_warranty,
    m.started_at, m.completed_at, m.next_due_at,
    l.name
  from maintenance_records m
  join assets a on a.id = m.asset_id
  join locations l on l.id = a.location_id
  left join vendors v on v.id = m.vendor_id
  where a.location_id = any (p_locations)
    and (p_state is null or m.state = p_state::maintenance_state)
  order by
    case when m.state in ('open', 'in_progress') then 0 else 1 end,
    m.started_at desc;
$$;

create or replace function maintenance_stats(p_locations uuid[])
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'open',       count(*) filter (where m.state = 'open'),
    'inProgress', count(*) filter (where m.state = 'in_progress'),
    'completed',  count(*) filter (where m.state = 'completed'),
    'cost',       coalesce(sum(m.cost) filter (where m.state = 'completed'), 0)
  )
  from maintenance_records m
  join assets a on a.id = m.asset_id
  where a.location_id = any (p_locations);
$$;

-- ---------------------------------------------------------------------------
-- Notifications.
--
-- dedupe_key is what the notification is about, not when it was sent — see the
-- header. Nullable because a notification raised by a human action (a new
-- assignment) is a one-off and has nothing to collide with.
-- ---------------------------------------------------------------------------
alter table notifications add column dedupe_key text;

create unique index notifications_dedupe_key
  on notifications (account_id, dedupe_key)
  where dedupe_key is not null;

create or replace function notifications_list(p_limit int default 50)
returns table (
  id uuid, kind notification_kind, title text, body text,
  asset_id uuid, asset_code text, bast_id uuid, bast_number text,
  read_at timestamptz, created_at timestamptz
)
language sql stable security invoker set search_path = public as $$
  select
    n.id, n.kind, n.title, n.body,
    n.asset_id, a.asset_code,
    n.bast_id, b.bast_number,
    n.read_at, n.created_at
  from notifications n
  left join assets a on a.id = n.asset_id
  left join bast   b on b.id = n.bast_id
  where n.account_id = my_account_id()
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

/** Drives the red dot on the bell. */
create or replace function notification_unread_count()
returns int language sql stable security invoker set search_path = public as $$
  select count(*)::int from notifications
   where account_id = my_account_id() and read_at is null;
$$;

create or replace function mark_notification_read(p_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
begin
  update notifications
     set read_at = coalesce(read_at, now())
   where id = p_id and account_id = my_account_id();
  if not found then
    raise exception 'Notification not found' using errcode = 'P0001';
  end if;
  return jsonb_build_object('id', p_id);
end $$;

create or replace function mark_all_notifications_read()
returns jsonb language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  update notifications set read_at = now()
   where account_id = my_account_id() and read_at is null;
  get diagnostics n = row_count;
  return jsonb_build_object('marked', n);
end $$;

-- ---------------------------------------------------------------------------
-- Who receives a notification about an asset at a given location.
--
-- SECURITY DEFINER because the jobs run with no user at all: cron has no JWT,
-- so my_role() and RLS would both come back empty.
-- ---------------------------------------------------------------------------
create or replace function notify_recipients(p_location uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from accounts
   where is_active
     and can_login
     and (
       role in ('super_admin', 'corporate_it')
       or (role = 'site_it' and location_id = p_location)
     );
$$;

-- ---------------------------------------------------------------------------
-- The scheduled jobs.
--
-- Each returns how many rows it inserted, so running one by hand tells you
-- whether it did anything — a job that reports nothing is a job nobody can
-- tell is broken.
-- ---------------------------------------------------------------------------

/**
 * Warranties inside the window. 30 days by default, which covers the
 * acceptance criterion's 20 and leaves room to act on it.
 */
create or replace function notify_warranty_expiring(p_days int default 30)
returns int language plpgsql security definer set search_path = public as $$
declare inserted int;
begin
  with due as (
    select a.id, a.asset_code, a.name, a.warranty_end, a.location_id,
           (a.warranty_end - current_date) as days_left
    from assets a
    join asset_statuses s on s.id = a.status_id
    where a.warranty_end is not null
      and a.warranty_end >= current_date
      and a.warranty_end <= current_date + coalesce(p_days, 30)
      -- A retired or lost asset's warranty is nobody's problem.
      and not s.is_terminal
  ),
  fanned as (
    select r.account_id, d.*
    from due d
    cross join lateral notify_recipients(d.location_id) as r(account_id)
  )
  insert into notifications (account_id, kind, title, body, asset_id, dedupe_key)
  select
    f.account_id,
    'warranty_expiring',
    f.asset_code || ' warranty ends in ' || f.days_left || ' day' ||
      case when f.days_left = 1 then '' else 's' end,
    f.name || ' · ' || to_char(f.warranty_end, 'DD Mon YYYY'),
    f.id,
    'warranty:' || f.id || ':' || f.warranty_end
  from fanned f
  on conflict (account_id, dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end $$;

create or replace function notify_maintenance_due(p_days int default 7)
returns int language plpgsql security definer set search_path = public as $$
declare inserted int;
begin
  with due as (
    select m.id, m.title, m.next_due_at, a.id as asset_id, a.asset_code, a.location_id
    from maintenance_records m
    join assets a on a.id = m.asset_id
    where m.next_due_at is not null
      and m.next_due_at <= current_date + coalesce(p_days, 7)
      and m.state in ('open', 'in_progress', 'completed')
  ),
  fanned as (
    select r.account_id, d.*
    from due d
    cross join lateral notify_recipients(d.location_id) as r(account_id)
  )
  insert into notifications (account_id, kind, title, body, asset_id, dedupe_key)
  select
    f.account_id,
    'maintenance_reminder',
    f.asset_code || ' service due ' || to_char(f.next_due_at, 'DD Mon YYYY'),
    f.title,
    f.asset_id,
    'maintenance:' || f.id || ':' || f.next_due_at
  from fanned f
  on conflict (account_id, dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end $$;

/**
 * The weekly backup reminder — client instruction, 2026-07-30.
 *
 * Goes to Super Admins only: they are the ones with access to the Supabase
 * project, so they are the only ones who could act on it.
 *
 * The dedupe key is the ISO week, so it lands once a week however often the
 * job runs, and a missed week is visibly missing rather than silently merged
 * into the next one.
 */
create or replace function notify_weekly_backup()
returns int language plpgsql security definer set search_path = public as $$
declare inserted int; week_key text := to_char(current_date, 'IYYY-"W"IW');
begin
  insert into notifications (account_id, kind, title, body, dedupe_key)
  select
    a.id,
    'import_completed',   -- the enum has no 'backup'; see the note below
    'Weekly backup — ' || to_char(current_date, 'DD Mon YYYY'),
    'Export the register and the E-BAST documents, and keep the copy off this '
      || 'phone. A backup nobody has checked is not a backup.',
    'backup:' || week_key
  from accounts a
  where a.is_active and a.can_login and a.role = 'super_admin'
  on conflict (account_id, dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end $$;

-- The notification_kind enum is fixed in migration 0001 and adding a value
-- inside a transaction that then USES it is not allowed in Postgres, so the
-- backup reminder rides on an existing kind. It is distinguishable by its
-- dedupe_key, and the app keys its icon off that rather than off the enum.
-- A dedicated value can be added in its own migration later; doing it here
-- would fail on the same statement that inserts the first row.

/** One call for the nightly run, so cron has a single entry point. */
create or replace function run_daily_notifications()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return jsonb_build_object(
    'warranty',    notify_warranty_expiring(),
    'maintenance', notify_maintenance_due()
  );
end $$;

revoke all on function add_document(uuid, text, text, text, bigint, text) from anon, authenticated;
revoke all on function delete_document(uuid)                              from anon, authenticated;
revoke all on function open_maintenance(uuid, text, text, uuid, boolean, boolean, date, date)
  from anon, authenticated;
revoke all on function update_maintenance(uuid, text, numeric, text, date, date)
  from anon, authenticated;
revoke all on function maintenance_list(uuid[], text)          from anon, authenticated;
revoke all on function maintenance_stats(uuid[])               from anon, authenticated;
revoke all on function notifications_list(int)                 from anon, authenticated;
revoke all on function notification_unread_count()             from anon, authenticated;
revoke all on function mark_notification_read(uuid)            from anon, authenticated;
revoke all on function mark_all_notifications_read()           from anon, authenticated;
revoke all on function notify_recipients(uuid)                 from anon, authenticated;
revoke all on function notify_warranty_expiring(int)           from anon, authenticated;
revoke all on function notify_maintenance_due(int)             from anon, authenticated;
revoke all on function notify_weekly_backup()                  from anon, authenticated;
revoke all on function run_daily_notifications()               from anon, authenticated;

grant execute on function add_document(uuid, text, text, text, bigint, text) to authenticated;
grant execute on function delete_document(uuid)                              to authenticated;
grant execute on function open_maintenance(uuid, text, text, uuid, boolean, boolean, date, date)
  to authenticated;
grant execute on function update_maintenance(uuid, text, numeric, text, date, date)
  to authenticated;
grant execute on function maintenance_list(uuid[], text)       to authenticated;
grant execute on function maintenance_stats(uuid[])            to authenticated;
grant execute on function notifications_list(int)              to authenticated;
grant execute on function notification_unread_count()          to authenticated;
grant execute on function mark_notification_read(uuid)         to authenticated;
grant execute on function mark_all_notifications_read()        to authenticated;

-- The generators stay ungranted. Nothing in the app should be able to fill
-- somebody else's inbox, and cron runs as the table owner, not as a role that
-- needs a grant.

-- ---------------------------------------------------------------------------
-- Schedules.
--
-- Guarded so the migration still applies where pg_cron is unavailable — a
-- local stack without it should not block every other change in this file. The
-- functions are always created, so the jobs can be run by hand either way, and
-- that is how the tests exercise them.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;

    -- 22:00 UTC ≈ 05:00 WIB, so the overnight run has landed before the team
    -- picks their phones up. IMPLEMENTATION_PLAN.md § Phase 6: "produces a
    -- notification overnight".
    perform cron.unschedule('cite-daily-notifications')
      where exists (select 1 from cron.job where jobname = 'cite-daily-notifications');
    perform cron.schedule(
      'cite-daily-notifications', '0 22 * * *',
      $job$select public.run_daily_notifications()$job$
    );

    -- Friday 08:00 UTC ≈ 15:00 WIB — late enough in the week to act on, early
    -- enough in the day to actually do.
    perform cron.unschedule('cite-weekly-backup')
      where exists (select 1 from cron.job where jobname = 'cite-weekly-backup');
    perform cron.schedule(
      'cite-weekly-backup', '0 8 * * 5',
      $job$select public.notify_weekly_backup()$job$
    );
  else
    raise notice 'pg_cron not available — schedules skipped, functions still callable';
  end if;
end $$;
