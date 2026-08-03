-- ============================================================================
-- CITE Assets — 0030 Maintenance as a record, and labels for existing assets
--
-- Three things reported on 2026-08-04, and one of them was a real confusion of
-- my making.
--
-- 1. "SUDAH SAYA DONE KAN KENAPA MASIH DALAM STATUS MAINTENANCE"
-- ------------------------------------------------------------
-- Nothing in the schema ever set an asset's status from a maintenance record,
-- and nothing cleared it either. Two separate ideas were presented as one:
--
--   asset.status_id       what the register says the asset IS
--   maintenance.state     how far along a repair ticket is
--
-- Marking the ticket Completed changed the ticket. The asset stayed
-- Maintenance, which is why it never came back into the assign picker —
-- assignable_assets() only offers Available.
--
-- The client's answer is the right one: "ubah juga maintenance sifatnya menjadi
-- pencatatan saja. dari tanggal berapa ke berapa laptop ini di maintenance kan.
-- tidak perlu status open sampai cancelled."
--
-- So maintenance becomes a LOG. A record has a start date and an end date; an
-- end date means it is over. `state` is kept on the table because the column is
-- NOT NULL and older rows have values, but it is derived from the dates now
-- rather than set by hand, and nothing reads it.
--
-- Asset status stays where it belongs: changed by a person, through
-- change_asset_status(), with a reason. That is the one place the register's
-- own answer is decided, and having a second path was the whole bug.
--
-- 2. "SAYA TEST DENGAN MEMBUAT ASSET BARU. TAPI KOK GAADA BARCODENYA?"
-- -------------------------------------------------------------------
-- Correct, and there was no way to fix it. Scanning a blank sticker creates an
-- asset with a label; Add Asset creates one without. attach_tag() is the
-- missing direction — put a printed sticker on an asset that already exists.
--
-- 3. LABEL CODE vs ASSET CODE
-- ---------------------------
-- Confirmed as designed and deliberately left alone: `CT-000001` identifies the
-- STICKER, `SPRLAP24-HO-006` identifies the ASSET. Attaching one to the other
-- does not rename either. That is what makes a mislabelled asset recoverable —
-- void the sticker, attach another, and the asset's own code never moved.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Maintenance as a log.
-- ---------------------------------------------------------------------------
create or replace function log_maintenance(
  p_asset       uuid,
  p_title       text,
  p_started     date,
  p_completed   date    default null,
  p_detail      text    default null,
  p_vendor      uuid    default null,
  p_is_internal boolean default false,
  p_warranty    boolean default false,
  p_cost        numeric default null,
  p_next_due    date    default null
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare new_id uuid; started date := coalesce(p_started, current_date);
begin
  if not can_write_assets() or not can_see_asset(p_asset) then
    raise exception 'You do not have permission to record maintenance here'
      using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'What was done?' using errcode = 'P0001';
  end if;
  if p_completed is not null and p_completed < started then
    raise exception 'It cannot have finished before it started' using errcode = 'P0001';
  end if;
  if p_next_due is not null and p_next_due < started then
    raise exception 'The next service cannot be due before this one started'
      using errcode = 'P0001';
  end if;
  if p_cost is not null and p_cost < 0 then
    raise exception 'A cost cannot be negative' using errcode = 'P0001';
  end if;

  insert into maintenance_records (
    asset_id, title, detail, vendor_id, is_internal, under_warranty,
    started_at, completed_at, cost, next_due_at,
    -- Derived, not chosen: an end date means it is over. Kept only because the
    -- column is NOT NULL from migration 0001.
    state,
    created_by
  ) values (
    p_asset, btrim(p_title), nullif(btrim(coalesce(p_detail, '')), ''),
    p_vendor, coalesce(p_is_internal, false), coalesce(p_warranty, false),
    started, p_completed, coalesce(p_cost, 0), p_next_due,
    case when p_completed is null then 'in_progress' else 'completed' end::maintenance_state,
    my_account_id()
  ) returning id into new_id;

  return jsonb_build_object('id', new_id, 'ongoing', p_completed is null);
end $$;

create or replace function edit_maintenance(
  p_id          uuid,
  p_title       text    default null,
  p_started     date    default null,
  p_completed   date    default null,
  p_detail      text    default null,
  p_vendor      uuid    default null,
  p_cost        numeric default null,
  p_next_due    date    default null,
  /** Explicit, because a null p_completed means "leave it" and not "reopen". */
  p_clear_completed boolean default false
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare m maintenance_records%rowtype; next_started date; next_completed date;
begin
  select * into m from maintenance_records where id = p_id;
  if not found then
    raise exception 'Maintenance record not found' using errcode = 'P0001';
  end if;
  if not can_write_assets() or not can_see_asset(m.asset_id) then
    raise exception 'You do not have permission to change this record'
      using errcode = 'P0001';
  end if;

  next_started   := coalesce(p_started, m.started_at);
  next_completed := case when p_clear_completed then null
                         else coalesce(p_completed, m.completed_at) end;

  if next_completed is not null and next_completed < next_started then
    raise exception 'It cannot have finished before it started' using errcode = 'P0001';
  end if;
  if p_cost is not null and p_cost < 0 then
    raise exception 'A cost cannot be negative' using errcode = 'P0001';
  end if;

  update maintenance_records set
    title        = coalesce(nullif(btrim(coalesce(p_title, '')), ''), title),
    detail       = coalesce(nullif(btrim(coalesce(p_detail, '')), ''), detail),
    vendor_id    = coalesce(p_vendor, vendor_id),
    started_at   = next_started,
    completed_at = next_completed,
    cost         = coalesce(p_cost, cost),
    next_due_at  = coalesce(p_next_due, next_due_at),
    state        = case when next_completed is null then 'in_progress' else 'completed' end
  where id = p_id;

  return jsonb_build_object('id', p_id, 'ongoing', next_completed is null);
end $$;

/**
 * The log, newest first, with ongoing work at the top.
 *
 * `p_ongoing` replaces the old four-way state filter: either something is still
 * in the shop or it is history, and that is the only split anyone asked about.
 */
create or replace function maintenance_log(p_locations uuid[], p_ongoing boolean default null)
returns table (
  id uuid, asset_id uuid, asset_code text, asset_name text,
  title text, detail text,
  vendor_name text, is_internal boolean, cost numeric, under_warranty boolean,
  started_at date, completed_at date, next_due_at date,
  days int, ongoing boolean,
  location_name text
)
language sql stable security invoker set search_path = public as $$
  select
    m.id, a.id, a.asset_code, a.name,
    m.title, m.detail,
    v.name, m.is_internal, m.cost, m.under_warranty,
    m.started_at, m.completed_at, m.next_due_at,
    (coalesce(m.completed_at, current_date) - m.started_at)::int,
    m.completed_at is null,
    l.name
  from maintenance_records m
  join assets a on a.id = m.asset_id
  join locations l on l.id = a.location_id
  left join vendors v on v.id = m.vendor_id
  where a.location_id = any (p_locations)
    and (p_ongoing is null or (m.completed_at is null) = p_ongoing)
  order by (m.completed_at is null) desc, m.started_at desc;
$$;

create or replace function maintenance_stats(p_locations uuid[])
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'ongoing',  count(*) filter (where m.completed_at is null),
    'finished', count(*) filter (where m.completed_at is not null),
    'cost',     coalesce(sum(m.cost), 0),
    -- Total days the fleet has spent in the shop. The number nobody can get
    -- from a status field, and the reason a date range is worth more than one.
    'days',     coalesce(sum(coalesce(m.completed_at, current_date) - m.started_at), 0)
  )
  from maintenance_records m
  join assets a on a.id = m.asset_id
  where a.location_id = any (p_locations);
$$;

-- ---------------------------------------------------------------------------
-- Putting a printed sticker on an asset that already exists.
-- ---------------------------------------------------------------------------
create or replace function attach_tag(p_code text, p_asset uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare tag asset_tags%rowtype; a assets%rowtype; me uuid := my_account_id();
begin
  select * into a from assets where id = p_asset;
  if not found then
    raise exception 'Asset not found' using errcode = 'P0001';
  end if;
  if not can_write_assets() or not can_see_asset(p_asset) then
    raise exception 'You do not have permission to label this asset' using errcode = 'P0001';
  end if;

  select * into tag from asset_tags where code = upper(btrim(p_code));
  if not found then
    raise exception 'That label is not one of ours' using errcode = 'P0001';
  end if;
  if tag.status = 'void' then
    raise exception 'That label was voided and cannot be used again' using errcode = 'P0001';
  end if;
  if tag.status = 'tagged' then
    if tag.asset_id = p_asset then
      -- Already right. Saying so beats an error for something that is done.
      return jsonb_build_object('code', tag.code, 'assetId', p_asset, 'alreadyAttached', true);
    end if;
    raise exception 'That label is already on %',
      coalesce((select asset_code from assets where id = tag.asset_id), 'another asset')
      using errcode = 'P0001';
  end if;

  -- One asset, one sticker. Attaching a second would give the same laptop two
  -- identities and no way to tell which one is on it.
  if exists (select 1 from asset_tags where asset_id = p_asset) then
    raise exception 'This asset already carries label %',
      (select code from asset_tags where asset_id = p_asset)
      using errcode = 'P0001';
  end if;

  update asset_tags
     set status = 'tagged', asset_id = p_asset, tagged_at = now(), tagged_by = me
   where id = tag.id;

  return jsonb_build_object('code', tag.code, 'assetId', p_asset, 'alreadyAttached', false);
end $$;

/**
 * Everything about one sticker, for the detail sheet on the Labels screen.
 *
 * Carries BOTH identities on purpose: the label code and the asset code are
 * different things and the screen should never suggest one replaced the other.
 */
create or replace function tag_detail(p_code text)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare t asset_tags%rowtype;
begin
  select * into t from asset_tags where code = upper(btrim(p_code));
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'code', t.code,
    'status', t.status,
    'batchId', t.batch_id,
    'printedAt', t.printed_at,
    'createdAt', t.created_at,
    'taggedAt', t.tagged_at,
    'taggedByName', (select full_name from accounts where id = t.tagged_by),
    'voidedAt', t.voided_at,
    'voidReason', t.void_reason,
    'voidedByName', (select full_name from accounts where id = t.voided_by),
    'asset', case when t.asset_id is null then null else (
      select jsonb_build_object(
        'id', a.id,
        'assetCode', a.asset_code,
        'name', a.name,
        'serialNumber', a.serial_number,
        'statusName', s.name,
        'conditionName', c.name,
        'locationName', l.name,
        'holderName', (select full_name from accounts where id = a.assigned_to)
      )
      from assets a
      join asset_statuses s on s.id = a.status_id
      join asset_conditions c on c.id = a.condition_id
      join locations l on l.id = a.location_id
      where a.id = t.asset_id
        -- RLS would hide the asset anyway; this keeps the label visible while
        -- saying nothing about what it is on.
        and can_see_asset(a.id)
    ) end
  );
end $$;

/** The label on an asset, for the asset detail screen. */
create or replace function asset_tag_code(p_asset uuid)
returns text language sql stable security invoker set search_path = public as $$
  select code from asset_tags where asset_id = p_asset and status = 'tagged' limit 1;
$$;

revoke all on function log_maintenance(uuid, text, date, date, text, uuid, boolean, boolean, numeric, date)
  from public, anon, authenticated;
revoke all on function edit_maintenance(uuid, text, date, date, text, uuid, numeric, date, boolean)
  from public, anon, authenticated;
revoke all on function maintenance_log(uuid[], boolean) from public, anon, authenticated;
revoke all on function maintenance_stats(uuid[])        from public, anon, authenticated;
revoke all on function attach_tag(text, uuid)           from public, anon, authenticated;
revoke all on function tag_detail(text)                 from public, anon, authenticated;
revoke all on function asset_tag_code(uuid)             from public, anon, authenticated;

grant execute on function log_maintenance(uuid, text, date, date, text, uuid, boolean, boolean, numeric, date)
  to authenticated;
grant execute on function edit_maintenance(uuid, text, date, date, text, uuid, numeric, date, boolean)
  to authenticated;
grant execute on function maintenance_log(uuid[], boolean) to authenticated;
grant execute on function maintenance_stats(uuid[])        to authenticated;
grant execute on function attach_tag(text, uuid)           to authenticated;
grant execute on function tag_detail(text)                 to authenticated;
grant execute on function asset_tag_code(uuid)             to authenticated;

-- The old state-machine functions go, so nothing can write a state by hand and
-- leave the log disagreeing with its own dates.
drop function if exists open_maintenance(uuid, text, text, uuid, boolean, boolean, date, date);
drop function if exists update_maintenance(uuid, text, numeric, text, date, date);
drop function if exists maintenance_list(uuid[], text);
