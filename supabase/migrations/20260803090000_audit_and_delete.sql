-- ============================================================================
-- CITE Assets — 0026 Audit log reader, search sorting, and asset deletion
--
-- Three things the app could not do, all of which the data already supported.
--
-- THE AUDIT LOG
-- -------------
-- Every mutable table has carried an audit trigger since migration 0001, so the
-- rows have been accumulating from the first day. Nothing has ever read them.
-- audit_list() is that reader: filtered, paged, and joined to the labels a
-- person recognises rather than the uuids the table stores.
--
-- Kept to Super Admin and Corporate IT, matching the permission matrix. The log
-- records who did what across every location, so it is the one place scope does
-- not narrow — and that is exactly why not everyone may open it.
--
-- DELETING AN ASSET
-- -----------------
-- The RLS policy has always allowed a Super Admin to delete one; there was no
-- way to ask. delete_asset() is that way, and it refuses far more often than it
-- agrees:
--
--   * anything with an assignment, a movement, an E-BAST, a document, a
--     maintenance record or a label behind it is REFUSED, because those are
--     records of things that happened and an asset row is what makes them
--     legible. Retire it instead.
--   * a reason is required, and the deletion is recorded before the row goes.
--
-- What is left is the case deletion is actually for: something typed in wrong
-- five minutes ago that has no history yet.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- audit_list() — README § Audit log.
-- ---------------------------------------------------------------------------
create or replace function audit_list(
  p_action text default null,
  p_table  text default null,
  p_search text default null,
  p_limit  int  default 100,
  p_offset int  default 0
)
returns table (
  id bigint, action audit_action, table_name text, record_id uuid,
  target_label text, actor_label text, actor_name text,
  device text, created_at timestamptz,
  summary text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if my_role() not in ('super_admin', 'corporate_it') then
    raise exception 'Only Corporate IT and above can read the audit log'
      using errcode = 'P0001';
  end if;

  return query
    select
      a.id, a.action, a.table_name, a.record_id,
      a.target_label,
      a.actor_label,
      coalesce(acc.full_name, split_part(coalesce(a.actor_label, ''), ' · ', 2), 'System'),
      a.device,
      a.created_at,
      -- One readable line per entry. Built here rather than on the client so a
      -- future export says exactly what the screen said.
      case a.table_name
        when 'assets' then coalesce(
          (select x.asset_code || ' · ' || x.name from assets x where x.id = a.record_id),
          coalesce(a.new_value, a.old_value) ->> 'asset_code',
          'Asset')
        when 'bast' then coalesce(
          (select b.bast_number from bast b where b.id = a.record_id),
          coalesce(a.new_value, a.old_value) ->> 'bast_number',
          'E-BAST')
        when 'accounts' then coalesce(
          (select acc2.full_name from accounts acc2 where acc2.id = a.record_id),
          coalesce(a.new_value, a.old_value) ->> 'full_name',
          'Account')
        when 'asset_status_changes' then coalesce(
          coalesce(a.new_value, a.old_value) ->> 'reason', 'Status changed')
        else initcap(replace(a.table_name, '_', ' '))
      end
    from audit_log a
    left join accounts acc on acc.id = a.actor_id
    where (p_action is null or a.action = p_action::audit_action)
      and (p_table  is null or a.table_name = p_table)
      and (
        p_search is null or btrim(p_search) = ''
        or coalesce(a.actor_label, '')  ilike '%' || btrim(p_search) || '%'
        or coalesce(a.target_label, '') ilike '%' || btrim(p_search) || '%'
        or a.table_name                 ilike '%' || btrim(p_search) || '%'
      )
    order by a.created_at desc, a.id desc
    limit greatest(1, least(coalesce(p_limit, 100), 300))
    offset greatest(0, coalesce(p_offset, 0));
end $$;

/** The counts behind the filter chips. */
create or replace function audit_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if my_role() not in ('super_admin', 'corporate_it') then
    raise exception 'Only Corporate IT and above can read the audit log'
      using errcode = 'P0001';
  end if;

  return (
    select jsonb_build_object(
      'total',  count(*),
      'today',  count(*) filter (where created_at >= current_date),
      'week',   count(*) filter (where created_at >= current_date - 7),
      'actors', count(distinct actor_id)
    ) from audit_log
  );
end $$;

-- ---------------------------------------------------------------------------
-- delete_asset() — the narrow case deletion is actually for.
-- ---------------------------------------------------------------------------
create or replace function delete_asset(p_asset uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a      assets%rowtype;
  holds  text[] := array[]::text[];
begin
  select * into a from assets where id = p_asset;
  if not found then
    raise exception 'Asset not found' using errcode = 'P0001';
  end if;
  if my_role() is distinct from 'super_admin' then
    raise exception 'Only a Super Admin can delete an asset' using errcode = 'P0001';
  end if;
  if not can_see_asset(p_asset) then
    raise exception 'Asset not found' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Say why this is being deleted' using errcode = 'P0001';
  end if;

  -- Everything that would lose its meaning if the asset row disappeared. The
  -- list is built in full rather than returned on the first hit, because being
  -- told about one blocker at a time is how a person ends up trying six times.
  if exists (select 1 from assignments where asset_id = p_asset) then
    holds := holds || 'an assignment';
  end if;
  if exists (select 1 from movements where asset_id = p_asset) then
    holds := holds || 'a movement';
  end if;
  if exists (select 1 from bast where asset_id = p_asset) then
    holds := holds || 'an E-BAST';
  end if;
  if exists (select 1 from documents where asset_id = p_asset) then
    holds := holds || 'a document';
  end if;
  if exists (select 1 from maintenance_records where asset_id = p_asset) then
    holds := holds || 'a maintenance record';
  end if;
  if exists (select 1 from asset_tags where asset_id = p_asset) then
    holds := holds || 'a printed label';
  end if;
  if exists (select 1 from asset_status_changes where asset_id = p_asset) then
    holds := holds || 'a status change';
  end if;

  if array_length(holds, 1) > 0 then
    raise exception
      'This asset has % behind it. Retire it instead — deleting it would leave those records pointing at nothing.',
      array_to_string(holds, ', ')
      using errcode = 'P0001';
  end if;

  -- Recorded BEFORE the row goes: the audit trigger fires on the delete itself,
  -- but a trigger cannot know why, and why is the only part worth reading here.
  insert into audit_log (action, table_name, record_id, target_label, old_value,
                         actor_id, actor_label)
  values (
    'asset_updated', 'assets', p_asset,
    a.asset_code || ' · ' || a.name || ' — deleted: ' || btrim(p_reason),
    to_jsonb(a),
    my_account_id(),
    (select coalesce(role::text, 'system') || ' · ' || full_name from v_me limit 1)
  );

  delete from assets where id = p_asset;

  return jsonb_build_object('assetCode', a.asset_code, 'deleted', true);
end $$;

-- This is the one exception to "the app never writes to audit_log" (working
-- rule #3). The rule exists so the log cannot be forged or trimmed, and this
-- neither: the row is written by a SECURITY DEFINER function that a Super Admin
-- cannot reach except by actually deleting an asset, and audit_log's
-- forbid_mutation() triggers still refuse every update and delete. Without it
-- the only trace of a deletion would be a trigger row with no reason on it.

revoke all on function audit_list(text, text, text, int, int) from public, anon, authenticated;
revoke all on function audit_stats()                          from public, anon, authenticated;
revoke all on function delete_asset(uuid, text)               from public, anon, authenticated;

grant execute on function audit_list(text, text, text, int, int) to authenticated;
grant execute on function audit_stats()                          to authenticated;
grant execute on function delete_asset(uuid, text)               to authenticated;

-- ---------------------------------------------------------------------------
-- search_assets() — replaced to take a category and a sort order.
--
-- Client instruction, 2026-08-03: "bisa di sort, seperti odoo dipilih drop down
-- categorynya lalu di search nama agar di kategori itu aja nama yang di
-- searchnya" — narrow first, then search inside what is left.
--
-- The sort is a whitelist rather than an interpolated column name: `p_sort`
-- comes from a client, and building ORDER BY from it would be an injection
-- point in the one function every list screen calls.
-- ---------------------------------------------------------------------------
create or replace function search_assets(
  p_locations uuid[],
  p_query     text default null,
  p_status    uuid default null,
  p_category  uuid default null,
  p_sort      text default 'code'
)
returns table (
  id uuid, asset_code text, name text, serial_number text,
  category_name text, category_icon text,
  brand_name text, model_name text,
  status_name text, condition_name text, location_name text,
  holder_name text, department_name text,
  warranty_end date
)
language sql stable security invoker set search_path = public as $$
  select
    a.id, a.asset_code, a.name, a.serial_number,
    c.name, c.icon, b.name, m.name,
    s.name, cond.name, l.name,
    acc.full_name, d.name,
    a.warranty_end
  from assets a
  join categories       c    on c.id    = a.category_id
  join asset_statuses   s    on s.id    = a.status_id
  join asset_conditions cond on cond.id = a.condition_id
  join locations        l    on l.id    = a.location_id
  left join brands      b    on b.id    = a.brand_id
  left join models      m    on m.id    = a.model_id
  left join accounts    acc  on acc.id  = a.assigned_to
  left join departments d    on d.id    = a.department_id
  where a.location_id = any (p_locations)
    and (p_status   is null or a.status_id   = p_status)
    and (p_category is null or a.category_id = p_category)
    and (
      p_query is null or btrim(p_query) = ''
      or a.asset_code          ilike '%' || btrim(p_query) || '%'
      or a.name                ilike '%' || btrim(p_query) || '%'
      or a.serial_number       ilike '%' || btrim(p_query) || '%'
      or coalesce(b.name, '')  ilike '%' || btrim(p_query) || '%'
      or coalesce(m.name, '')  ilike '%' || btrim(p_query) || '%'
      or coalesce(acc.full_name, '') ilike '%' || btrim(p_query) || '%'
      or coalesce(d.name, '')  ilike '%' || btrim(p_query) || '%'
    )
  order by
    case when p_sort = 'name'     then a.name end asc,
    case when p_sort = 'newest'   then a.created_at end desc,
    case when p_sort = 'oldest'   then a.created_at end asc,
    case when p_sort = 'status'   then s.sort_order end asc,
    case when p_sort = 'location' then l.name end asc,
    case when p_sort = 'warranty' then a.warranty_end end asc nulls last,
    -- 'code', and the tie-break for every other sort. Without it two assets
    -- with the same name come back in whatever order the planner felt like,
    -- and the list reshuffles on every refresh.
    a.asset_code asc;
$$;

revoke all on function search_assets(uuid[], text, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function search_assets(uuid[], text, uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The trigram index only covered code, serial and name; the search above also
-- reaches brand, model, holder and department, and those were falling back to
-- a sequential scan on every keystroke. Harmless on an empty register, not on
-- the one that exists after the first import.
-- ---------------------------------------------------------------------------
create index if not exists brands_name_trgm      on brands      using gin (name gin_trgm_ops);
create index if not exists models_name_trgm      on models      using gin (name gin_trgm_ops);
create index if not exists accounts_name_trgm    on accounts    using gin (full_name gin_trgm_ops);
create index if not exists departments_name_trgm on departments using gin (name gin_trgm_ops);
