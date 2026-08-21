-- ============================================================================
-- CITE Assets — 0043 Fitting an asset into a unit
--
-- A radio rig is not held by anybody; it is bolted into dump truck DT-042.
-- Migration 0040 gave units a table and assets a unit_id. This is the only
-- way that column may be written.
--
-- WHY 'Installed' IS A STATUS AND NOT JUST A COLUMN
-- -------------------------------------------------
-- The assign wizard offers assets whose status is 'Available'. Without a
-- status of its own, a radio already fitted to a truck would keep appearing in
-- that list and could be handed to a person while still bolted into a vehicle.
-- Adding the status removes it from the list with no change to the wizard.
--
-- WHY A REASON IS COMPULSORY
-- --------------------------
-- The client chose that a fitted asset has no holder and produces no BAST. So
-- the only trace left is audit_log — which records who and when, and cannot
-- record why. Six months later, "why is this radio in DT-042 and not DT-011"
-- has exactly one possible answer, and it is this field. Same argument as
-- change_asset_status() in migration 0025.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The status. Slotted in after 'Assigned' rather than appended, because the
-- register's chip row reads as a rough life cycle and "in use elsewhere"
-- belongs next to "in use".
-- ---------------------------------------------------------------------------
update asset_statuses set sort_order = sort_order + 1 where sort_order >= 3;

insert into asset_statuses (name, color, is_terminal, sort_order)
select 'Installed', '#00072D', false, 3
where not exists (select 1 from asset_statuses where name = 'Installed');

-- ---------------------------------------------------------------------------
-- install_asset_to_unit()
--
-- SECURITY DEFINER, so every guard RLS would have applied is re-stated
-- (DATABASE.md §11).
-- ---------------------------------------------------------------------------
create or replace function install_asset_to_unit(
  p_asset  uuid,
  p_unit   uuid,
  p_reason text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a         assets%rowtype;
  u         units%rowtype;
  me        uuid := my_account_id();
  installed uuid;
  cur       asset_statuses%rowtype;
begin
  select * into a from assets where id = p_asset;
  if not found or not can_see_asset(p_asset) then
    raise exception 'Asset not found' using errcode = 'P0001';
  end if;
  if not can_write_assets() then
    raise exception 'You do not have permission to change this asset' using errcode = 'P0001';
  end if;

  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'Please say why it is being fitted' using errcode = 'P0001';
  end if;

  select * into u from units where id = p_unit;
  if not found then
    raise exception 'Unit not found' using errcode = 'P0001';
  end if;
  if not u.is_active then
    raise exception '% is no longer in service', u.code using errcode = 'P0001';
  end if;

  -- An asset in someone's hands is theirs until they give it back. Fitting it
  -- to a vehicle behind their back would leave an open assignment naming a
  -- person who no longer has the thing.
  if exists (select 1 from assignments where asset_id = p_asset and state = 'active') then
    raise exception 'Return this asset first — % still has it',
      coalesce((select full_name from accounts where id = a.assigned_to), 'someone')
      using errcode = 'P0001';
  end if;

  select * into cur from asset_statuses where id = a.status_id;
  if cur.is_terminal then
    raise exception 'This asset is % and cannot be fitted to anything', lower(cur.name)
      using errcode = 'P0001';
  end if;

  select id into installed from asset_statuses where name = 'Installed';

  if a.unit_id = p_unit and a.status_id = installed then
    raise exception 'It is already fitted to %', u.code using errcode = 'P0001';
  end if;

  -- The asset follows the vehicle. Leaving location_id behind would put a
  -- radio at Head Office while the truck carrying it is at Site, and every
  -- scoped list would then be wrong about where it is.
  if u.location_id <> a.location_id then
    perform record_movement(
      p_asset, u.location_id, 'redeployment', 'Fitted to unit ' || u.code);
  end if;

  insert into asset_status_changes (
    asset_id, from_status, to_status, from_condition, to_condition, reason, changed_by
  ) values (
    p_asset, a.status_id, installed, a.condition_id, a.condition_id, btrim(p_reason), me
  );

  update assets set unit_id = p_unit, status_id = installed where id = p_asset;

  return jsonb_build_object('assetId', p_asset, 'unitCode', u.code, 'unitName', u.name);
end $$;

-- ---------------------------------------------------------------------------
-- remove_asset_from_unit()
--
-- Returns the asset to 'Available'. It is not handed to anybody by coming out
-- of a vehicle, and its location stays where the vehicle left it — the radio
-- is physically at Site until somebody records a movement saying otherwise.
-- ---------------------------------------------------------------------------
create or replace function remove_asset_from_unit(
  p_asset  uuid,
  p_reason text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a         assets%rowtype;
  me        uuid := my_account_id();
  available uuid;
  old_code  text;
begin
  select * into a from assets where id = p_asset;
  if not found or not can_see_asset(p_asset) then
    raise exception 'Asset not found' using errcode = 'P0001';
  end if;
  if not can_write_assets() then
    raise exception 'You do not have permission to change this asset' using errcode = 'P0001';
  end if;
  if a.unit_id is null then
    raise exception 'This asset is not fitted to a unit' using errcode = 'P0001';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'Please say why it is being removed' using errcode = 'P0001';
  end if;

  select code into old_code from units where id = a.unit_id;
  select id into available from asset_statuses where name = 'Available';

  insert into asset_status_changes (
    asset_id, from_status, to_status, from_condition, to_condition, reason, changed_by
  ) values (
    p_asset, a.status_id, available, a.condition_id, a.condition_id, btrim(p_reason), me
  );

  update assets set unit_id = null, status_id = available where id = p_asset;

  return jsonb_build_object('assetId', p_asset, 'removedFrom', old_code);
end $$;

-- ---------------------------------------------------------------------------
-- Everything fitted to one unit — "what is on DT-042".
-- ---------------------------------------------------------------------------
create or replace function unit_assets(p_unit uuid)
returns table (
  id uuid, asset_code text, name text, category_name text,
  status_name text, condition_name text, location_name text
)
language sql stable security invoker set search_path = public as $$
  select a.id, a.asset_code, a.name, c.name, s.name, cond.name, l.name
  from assets a
  join categories       c    on c.id    = a.category_id
  join asset_statuses   s    on s.id    = a.status_id
  join asset_conditions cond on cond.id = a.condition_id
  join locations        l    on l.id    = a.location_id
  where a.unit_id = p_unit
  order by a.asset_code;
$$;

revoke all on function install_asset_to_unit(uuid, uuid, text)  from public, anon, authenticated;
revoke all on function remove_asset_from_unit(uuid, text)       from public, anon, authenticated;
revoke all on function unit_assets(uuid)                        from public, anon, authenticated;

grant execute on function install_asset_to_unit(uuid, uuid, text) to authenticated;
grant execute on function remove_asset_from_unit(uuid, text)      to authenticated;
grant execute on function unit_assets(uuid)                       to authenticated;
