-- ============================================================================
-- CITE Assets — 0040 Units (kendaraan) and Companies
--
-- TWO NEW MASTER TABLES, ONE MIGRATION
-- ------------------------------------
-- Both extend the same four functions in migration 0007 (master_table,
-- master_usage, master_list, master_create). Adding them in separate
-- migrations would mean rewriting those four bodies twice, and the second
-- rewrite would silently drop whatever the first one added if the two were
-- ever applied out of order.
--
-- UNITS
-- -----
-- A radio rig is not held by anybody — it is bolted into dump truck DT-042.
-- The system could previously only answer "who has this", so such an asset had
-- nowhere truthful to sit.
--
-- A unit is a PLACE, not a person: no holder, no BAST. That is a deliberate
-- client decision. The audit trail for a fitted asset is therefore audit_log
-- plus a mandatory reason on asset_status_changes, which is why
-- install_asset_to_unit() (migration 0041) refuses an empty reason.
--
-- Units are NOT locations. `locations` is the RLS axis (my_location_ids()),
-- the source of the BAST letterhead (company_name, signing_city, address_line)
-- and of the label stock prefix (tag_prefix). Putting DT-042 in there would
-- put a dump truck in the scope selector and on the letterhead of a handover
-- note. Hence a table of its own, carrying a location_id instead.
--
-- COMPANIES
-- ---------
-- The 527 people exported from Odoo belong to three legal entities. `accounts`
-- had no column for that at all.
--
-- Names are seeded exactly as the Odoo export spells them — "PT" with no full
-- stop — so import_accounts() matches on the common case without normalising
-- every row. The lookup is still tolerant of "PT." and of case.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists units (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,              -- 'DT-042'
  name        text not null,                     -- 'Dump Truck Komatsu HD465 #42'
  location_id uuid not null references locations(id) on delete restrict,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  code       text not null unique,               -- SPR, SMA, RSL
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into companies (name, code) values
  ('PT Stargate Pasific Resources', 'SPR'),
  ('PT Stargate Mineral Asia',      'SMA'),
  ('PT Rajawali Sigi Lestari',      'RSL')
on conflict (name) do nothing;

-- `on delete restrict` on both, so master_delete()'s 23503 handler produces
-- the same "still used by n" message it already produces for every other
-- master table.
alter table assets   add column if not exists unit_id    uuid references units(id)     on delete restrict;
alter table accounts add column if not exists company_id uuid references companies(id) on delete restrict;

create index if not exists assets_unit_idx      on assets(unit_id);
create index if not exists accounts_company_idx on accounts(company_id);

-- ---------------------------------------------------------------------------
-- RLS and grants — identical to every other master table (migrations 0002/0006)
-- ---------------------------------------------------------------------------
alter table units     enable row level security;
alter table companies enable row level security;

do $$
declare t text;
begin
  foreach t in array array['units','companies'] loop
    execute format(
      'create policy %I on %I for select using (auth.uid() is not null)', t || '_read', t);
    execute format(
      'create policy %I on %I for insert with check (my_role() in (''super_admin'',''corporate_it''))',
      t || '_insert', t);
    execute format(
      'create policy %I on %I for update using (my_role() in (''super_admin'',''corporate_it''))',
      t || '_update', t);
    execute format(
      'create policy %I on %I for delete using (my_role() = ''super_admin'')', t || '_delete', t);
  end loop;
end $$;

grant select, insert, update, delete on units, companies to authenticated;

-- ---------------------------------------------------------------------------
-- The four entity-aware functions from migration 0007, replaced in full.
--
-- Signatures are unchanged, so `create or replace` really replaces rather than
-- overloading — the trap migration 0029 exists to clean up after. Every branch
-- that was there before is still there; 'unit' and 'company' are additions.
--
-- master_rename, master_set_active and master_delete need no change: they are
-- driven by format(%I) off master_table() and work for any table with `name`,
-- `is_active` and `id`.
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
    when 'unit'       then 'units'
    when 'company'    then 'companies'
  end;
$$;

-- master_label() and master_assert_entity() are untouched: both are driven by
-- master_table() above and pick the two new entities up for free.

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
    when 'units' then
      select count(*) into a from assets where unit_id = p_id;
    when 'companies' then
      -- No asset points at a company; people do. asset_count stays 0 and the
      -- delete guard runs off total_count, which is what actually protects it.
      select count(*) into o from accounts where company_id = p_id;
  end case;

  asset_count := a;
  total_count := a + o;
  return next;
end $$;

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

    when 'units' then
      select coalesce(jsonb_agg(x order by x->>'name'), '[]'::jsonb) into result
      from (
        select jsonb_build_object(
          'id', u.id, 'name', u.name, 'isActive', u.is_active,
          'detail', u.code || ' · ' || l.name, 'code', u.code, 'locationId', u.location_id
        ) as x
        from units u join locations l on l.id = u.location_id
      ) s;

    when 'companies' then
      select coalesce(jsonb_agg(x order by x->>'name'), '[]'::jsonb) into result
      from (
        select jsonb_build_object(
          'id', c.id, 'name', c.name, 'isActive', c.is_active,
          'detail', c.code, 'code', c.code
        ) as x
        from companies c
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

create or replace function master_create(
  p_entity text,
  p_name   text,
  p_extra  jsonb default '{}'::jsonb
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  t text; label text; clean text; new_id uuid; dup boolean;
  v_brand uuid; v_code text; v_kind location_kind; v_color text; v_sort int;
  v_location uuid;
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

    when 'units' then
      v_code := upper(btrim(coalesce(p_extra->>'code', '')));
      if v_code = '' then
        raise exception 'Enter a unit code first' using errcode = 'P0001';
      end if;
      if exists (select 1 from units u where upper(u.code) = v_code) then
        raise exception '"%" already exists in %', v_code, label using errcode = 'P0001';
      end if;
      v_location := nullif(p_extra->>'locationId', '')::uuid;
      if v_location is null then
        raise exception 'Select a location first' using errcode = 'P0001';
      end if;
      insert into units (code, name, location_id)
      values (v_code, clean, v_location)
      returning id into new_id;

    when 'companies' then
      v_code := upper(btrim(coalesce(p_extra->>'code', '')));
      if v_code = '' then
        raise exception 'Enter a company code first' using errcode = 'P0001';
      end if;
      if exists (select 1 from companies c where upper(c.code) = v_code) then
        raise exception '"%" already exists in %', v_code, label using errcode = 'P0001';
      end if;
      insert into companies (name, code) values (clean, v_code)
      returning id into new_id;

    else
      execute format('insert into %I (name) values ($1) returning id', t)
        into new_id using clean;
  end case;

  return jsonb_build_object('id', new_id, 'name', clean, 'entity', label);
end $$;
