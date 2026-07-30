-- ============================================================================
-- CITE Assets — 0007 master data RPCs  (Phase 2)
--
-- Additive. Working rule #2: every write goes through an RPC, so duplicate
-- detection, the 23503 catch and the friendly delete message live server-side
-- and cannot be bypassed by a client that forgets to check.
--
-- DATABASE.md design rule #1: "Master data is data, not code." Adding a
-- category must never require a release — these functions are what make that
-- true at runtime.
--
-- Authorisation is NOT re-implemented here: every function is SECURITY INVOKER,
-- so the RLS policies from migration 0002 apply unchanged
-- (insert/update = super_admin + corporate_it, delete = super_admin).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Entity whitelist. The UI passes a slug; nothing else is ever interpolated
-- into SQL, so format(%I) below can never receive attacker-controlled text.
-- ---------------------------------------------------------------------------
create or replace function master_table(p_entity text)
returns text language sql immutable as $$
  select case lower(p_entity)
    when 'category'   then 'categories'
    when 'brand'      then 'brands'
    when 'model'      then 'models'
    when 'vendor'     then 'vendors'
    when 'department' then 'departments'
    when 'location'   then 'locations'
    when 'status'     then 'asset_statuses'
    when 'condition'  then 'asset_conditions'
  end;
$$;

-- Display label used in the validation and toast copy ("… in Category").
create or replace function master_label(p_entity text)
returns text language sql immutable as $$
  select initcap(lower(p_entity));
$$;

create or replace function master_assert_entity(p_entity text)
returns text language plpgsql immutable as $$
declare t text;
begin
  t := master_table(p_entity);
  if t is null then
    raise exception 'Unknown master data entity: %', p_entity using errcode = 'P0001';
  end if;
  return t;
end $$;

-- ---------------------------------------------------------------------------
-- Usage counting.
--
-- `assets` is the headline number the UI shows ("used by n assets"). `total`
-- also covers the other tables that hold a foreign key, so a record that is
-- referenced only by, say, a model or an account is still protected.
-- ---------------------------------------------------------------------------
create or replace function master_usage(p_entity text, p_id uuid)
returns table (asset_count bigint, total_count bigint)
language plpgsql stable security definer set search_path = public as $$
declare t text; a bigint := 0; o bigint := 0;
begin
  t := master_assert_entity(p_entity);

  case t
    when 'categories' then
      select count(*) into a from assets where category_id = p_id;
      select count(*) into o from models where category_id = p_id;
    when 'brands' then
      select count(*) into a from assets where brand_id = p_id;
      select count(*) into o from models where brand_id = p_id;
    when 'models' then
      select count(*) into a from assets where model_id = p_id;
    when 'vendors' then
      select count(*) into a from assets where vendor_id = p_id;
      select count(*) into o from maintenance_records where vendor_id = p_id;
    when 'departments' then
      select count(*) into a from assets where department_id = p_id;
      select count(*) into o from accounts where department_id = p_id;
      o := o + (select count(*) from assignments where department_id = p_id)
             + (select count(*) from bast where department_id = p_id);
    when 'locations' then
      select count(*) into a from assets where location_id = p_id;
      select count(*) into o from accounts where location_id = p_id;
      o := o + (select count(*) from assignments where location_id = p_id)
             + (select count(*) from bast where location_id = p_id)
             + (select count(*) from movements where from_location = p_id or to_location = p_id)
             + (select count(*) from account_scope_preferences where location_id = p_id);
    when 'asset_statuses' then
      select count(*) into a from assets where status_id = p_id;
    when 'asset_conditions' then
      select count(*) into a from assets where condition_id = p_id;
  end case;

  asset_count := a;
  total_count := a + o;
  return next;
end $$;

-- ---------------------------------------------------------------------------
-- List — one row per record with the usage count the UI prints as
-- "<Entity> · used by n assets", plus an entity-specific detail line.
-- Inactive (soft-deleted) records are returned too, flagged by is_active, so
-- an admin can see and restore them.
-- ---------------------------------------------------------------------------
create or replace function master_list(p_entity text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t text; result jsonb;
begin
  t := master_assert_entity(p_entity);

  case t
    when 'models' then
      select coalesce(jsonb_agg(x order by x->>'name'), '[]'::jsonb) into result
      from (
        select jsonb_build_object(
          'id', m.id, 'name', m.name, 'isActive', m.is_active,
          'detail', b.name, 'brandId', m.brand_id
        ) as x
        from models m join brands b on b.id = m.brand_id
      ) s;

    when 'locations' then
      select coalesce(jsonb_agg(x order by x->>'name'), '[]'::jsonb) into result
      from (
        select jsonb_build_object(
          'id', l.id, 'name', l.name, 'isActive', l.is_active,
          'detail', coalesce(l.city, l.code), 'code', l.code, 'kind', l.kind
        ) as x
        from locations l
      ) s;

    when 'asset_statuses' then
      select coalesce(jsonb_agg(x order by (x->>'sortOrder')::int), '[]'::jsonb) into result
      from (
        select jsonb_build_object(
          'id', s.id, 'name', s.name, 'isActive', s.is_active,
          'detail', null, 'color', s.color, 'sortOrder', s.sort_order
        ) as x
        from asset_statuses s
      ) s;

    when 'asset_conditions' then
      select coalesce(jsonb_agg(x order by (x->>'sortOrder')::int), '[]'::jsonb) into result
      from (
        select jsonb_build_object(
          'id', c.id, 'name', c.name, 'isActive', c.is_active,
          'detail', null, 'color', c.color, 'sortOrder', c.sort_order
        ) as x
        from asset_conditions c
      ) s;

    when 'categories' then
      select coalesce(jsonb_agg(x order by x->>'name'), '[]'::jsonb) into result
      from (
        select jsonb_build_object(
          'id', c.id, 'name', c.name, 'isActive', c.is_active,
          'detail', c.code, 'code', c.code
        ) as x
        from categories c
      ) s;

    else
      -- brands, vendors, departments — plain name tables
      execute format(
        'select coalesce(jsonb_agg(x order by x->>''name''), ''[]''::jsonb)
           from (select jsonb_build_object(
                   ''id'', r.id, ''name'', r.name, ''isActive'', r.is_active,
                   ''detail'', null) as x
                 from %I r) s', t)
      into result;
  end case;

  -- Attach the usage counts.
  select coalesce(
    jsonb_agg(
      row || jsonb_build_object('assetCount', u.asset_count, 'totalCount', u.total_count)
      order by row->>'name'
    ),
    '[]'::jsonb)
  into result
  from jsonb_array_elements(result) as row,
       lateral master_usage(p_entity, (row->>'id')::uuid) u;

  return coalesce(result, '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Create.
--
-- Validation copy comes from README § Master data:
--   empty     -> "Enter a name first"
--   duplicate -> "<name>" already exists in <Entity>
-- Duplicates are matched case-insensitively, which is stricter than the
-- database's unique indexes and stops "laptop" shadowing "Laptop".
-- ---------------------------------------------------------------------------
create or replace function master_create(
  p_entity text,
  p_name   text,
  p_extra  jsonb default '{}'::jsonb
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  t text; label text; clean text; new_id uuid; dup boolean;
  v_brand uuid; v_code text; v_kind location_kind; v_color text; v_sort int;
begin
  t := master_assert_entity(p_entity);
  label := master_label(p_entity);
  clean := btrim(coalesce(p_name, ''));

  if clean = '' then
    raise exception 'Enter a name first' using errcode = 'P0001';
  end if;

  -- Duplicate check, scoped to the brand for models.
  if t = 'models' then
    v_brand := nullif(p_extra->>'brandId', '')::uuid;
    if v_brand is null then
      raise exception 'Select a brand first' using errcode = 'P0001';
    end if;
    select exists (
      select 1 from models m where m.brand_id = v_brand and lower(m.name) = lower(clean)
    ) into dup;
  else
    execute format('select exists (select 1 from %I r where lower(r.name) = lower($1))', t)
      into dup using clean;
  end if;

  if dup then
    raise exception '"%" already exists in %', clean, label using errcode = 'P0001';
  end if;

  case t
    when 'categories' then
      v_code := upper(btrim(coalesce(p_extra->>'code', '')));
      if v_code = '' then
        raise exception 'Enter a category code first' using errcode = 'P0001';
      end if;
      if exists (select 1 from categories c where upper(c.code) = v_code) then
        raise exception '"%" already exists in %', v_code, label using errcode = 'P0001';
      end if;
      insert into categories (name, code, icon)
      values (clean, v_code, nullif(p_extra->>'icon', ''))
      returning id into new_id;

    when 'models' then
      insert into models (brand_id, category_id, name)
      values (v_brand, nullif(p_extra->>'categoryId', '')::uuid, clean)
      returning id into new_id;

    when 'locations' then
      v_code := upper(btrim(coalesce(p_extra->>'code', '')));
      if v_code = '' then
        raise exception 'Enter a location code first' using errcode = 'P0001';
      end if;
      if exists (select 1 from locations l where upper(l.code) = v_code) then
        raise exception '"%" already exists in %', v_code, label using errcode = 'P0001';
      end if;
      v_kind := coalesce(nullif(p_extra->>'kind', ''), 'site')::location_kind;
      insert into locations (code, name, kind, city)
      values (v_code, clean, v_kind, nullif(p_extra->>'city', ''))
      returning id into new_id;

    when 'asset_statuses' then
      -- Colour defaults to the neutral "Retired" token from README § Colors;
      -- an admin can set a specific one later.
      v_color := coalesce(nullif(p_extra->>'color', ''), '#4B5563');
      select coalesce(max(sort_order), 0) + 1 into v_sort from asset_statuses;
      insert into asset_statuses (name, color, sort_order)
      values (clean, v_color, v_sort)
      returning id into new_id;

    when 'asset_conditions' then
      v_color := coalesce(nullif(p_extra->>'color', ''), '#4B5563');
      select coalesce(max(sort_order), 0) + 1 into v_sort from asset_conditions;
      insert into asset_conditions (name, color, sort_order)
      values (clean, v_color, v_sort)
      returning id into new_id;

    else
      execute format('insert into %I (name) values ($1) returning id', t)
        into new_id using clean;
  end case;

  return jsonb_build_object('id', new_id, 'name', clean, 'entity', label);
end $$;

-- ---------------------------------------------------------------------------
-- Rename. Same validation rules as create; the record being edited is excluded
-- from the duplicate check so saving an unchanged name is not an error.
-- ---------------------------------------------------------------------------
create or replace function master_rename(p_entity text, p_id uuid, p_name text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare t text; label text; clean text; dup boolean; v_brand uuid;
begin
  t := master_assert_entity(p_entity);
  label := master_label(p_entity);
  clean := btrim(coalesce(p_name, ''));

  if clean = '' then
    raise exception 'Enter a name first' using errcode = 'P0001';
  end if;

  if t = 'models' then
    select brand_id into v_brand from models where id = p_id;
    select exists (
      select 1 from models m
      where m.brand_id = v_brand and lower(m.name) = lower(clean) and m.id <> p_id
    ) into dup;
  else
    execute format(
      'select exists (select 1 from %I r where lower(r.name) = lower($1) and r.id <> $2)', t)
      into dup using clean, p_id;
  end if;

  if dup then
    raise exception '"%" already exists in %', clean, label using errcode = 'P0001';
  end if;

  execute format('update %I set name = $1 where id = $2', t) using clean, p_id;

  if not found then
    raise exception 'Record not found' using errcode = 'P0001';
  end if;

  return jsonb_build_object('id', p_id, 'name', clean, 'entity', label);
end $$;

-- ---------------------------------------------------------------------------
-- Soft delete / restore — README § Master data prefers is_active over a hard
-- delete, and DATABASE.md §2 says the same. An inactive record keeps every
-- historical reference intact but disappears from the Add Asset pickers.
-- ---------------------------------------------------------------------------
create or replace function master_set_active(p_entity text, p_id uuid, p_active boolean)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare t text; rec_name text;
begin
  t := master_assert_entity(p_entity);
  execute format('select name from %I where id = $1', t) into rec_name using p_id;
  if rec_name is null then
    raise exception 'Record not found' using errcode = 'P0001';
  end if;

  execute format('update %I set is_active = $1 where id = $2', t) using p_active, p_id;
  return jsonb_build_object('id', p_id, 'name', rec_name, 'isActive', p_active);
end $$;

-- ---------------------------------------------------------------------------
-- Hard delete — Super Admin only (enforced by the RLS delete policy).
--
-- Every FK into master data is `on delete restrict`, so a referenced record
-- raises 23503. Catching it here means the client never has to know the
-- Postgres error code, and the message is identical everywhere:
--
--   Cannot delete <name> — still used by n assets
-- ---------------------------------------------------------------------------
create or replace function master_delete(p_entity text, p_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare t text; rec_name text; a bigint; total bigint;
begin
  t := master_assert_entity(p_entity);

  execute format('select name from %I where id = $1', t) into rec_name using p_id;
  if rec_name is null then
    raise exception 'Record not found' using errcode = 'P0001';
  end if;

  select asset_count, total_count into a, total from master_usage(p_entity, p_id);

  -- Checked up front so the message can carry a count; the exception handler
  -- below is the real guarantee, since a concurrent insert could slip in.
  if a > 0 then
    raise exception 'Cannot delete % — still used by % assets', rec_name, a
      using errcode = 'P0001';
  elsif total > 0 then
    raise exception 'Cannot delete % — still referenced by % other records', rec_name, total
      using errcode = 'P0001';
  end if;

  begin
    execute format('delete from %I where id = $1', t) using p_id;
  exception when foreign_key_violation then
    select asset_count, total_count into a, total from master_usage(p_entity, p_id);
    if a > 0 then
      raise exception 'Cannot delete % — still used by % assets', rec_name, a
        using errcode = 'P0001';
    else
      raise exception 'Cannot delete % — still referenced by % other records', rec_name, total
        using errcode = 'P0001';
    end if;
  end;

  return jsonb_build_object('id', p_id, 'name', rec_name);
end $$;

-- ---------------------------------------------------------------------------
-- Grants. SECURITY INVOKER throughout, so RLS still decides who may write.
-- master_usage and master_list are SECURITY DEFINER only so the counts can see
-- rows across tables the caller may not read directly (e.g. a Site IT user
-- counting assets at another location); neither exposes row content.
-- ---------------------------------------------------------------------------
revoke all on function master_list(text)                     from anon, authenticated;
revoke all on function master_usage(text, uuid)              from anon, authenticated;
revoke all on function master_create(text, text, jsonb)      from anon, authenticated;
revoke all on function master_rename(text, uuid, text)       from anon, authenticated;
revoke all on function master_set_active(text, uuid, boolean) from anon, authenticated;
revoke all on function master_delete(text, uuid)             from anon, authenticated;

grant execute on function master_list(text)                     to authenticated;
grant execute on function master_usage(text, uuid)              to authenticated;
grant execute on function master_create(text, text, jsonb)      to authenticated;
grant execute on function master_rename(text, uuid, text)       to authenticated;
grant execute on function master_set_active(text, uuid, boolean) to authenticated;
grant execute on function master_delete(text, uuid)             to authenticated;
