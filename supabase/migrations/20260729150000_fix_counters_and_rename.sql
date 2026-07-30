-- ============================================================================
-- CITE Assets — 0009 two fixes found by tests/master-data.mjs
--
-- Additive: replaces three functions, no schema change.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- FIX 1 — the number generators could not reach their counter tables.
--
-- next_asset_code() and next_bast_number() write to asset_code_counters /
-- bast_number_counters. Migration 0006 deliberately granted `authenticated` no
-- access to those tables: nothing but the generators should ever touch them.
-- But both functions were SECURITY INVOKER, so they ran as the caller and
-- failed with
--
--   ERROR: permission denied for table asset_code_counters
--
-- the first time a client tried to save an asset. SECURITY DEFINER is the right
-- answer: the counter stays unreachable from the client, and the only way to
-- move it is through the generator, which is exactly the guarantee
-- DATABASE.md §4 asks for ("numbering is server-side, so numbers can never
-- collide"). Neither function reads caller data or takes a table name, so
-- there is no privilege-escalation surface.
-- ---------------------------------------------------------------------------

create or replace function next_asset_code(p_category uuid, p_purchase date)
returns text language plpgsql security definer set search_path = public as $$
declare c_code text; y text; cs int; ys int;
begin
  select code into c_code from categories where id = p_category;
  if c_code is null then
    raise exception 'Unknown category' using errcode = 'P0001';
  end if;
  y := to_char(coalesce(p_purchase, current_date), 'YY');
  insert into asset_code_counters (category_code, year_2, cat_seq, year_seq)
    values (c_code, y, 1, 1)
  on conflict (category_code, year_2) do update
    set cat_seq = asset_code_counters.cat_seq + 1,
        year_seq = asset_code_counters.year_seq + 1
  returning cat_seq, year_seq into cs, ys;
  return c_code || lpad(cs::text, 3, '0') || '-' || y || '-' || lpad(ys::text, 3, '0');
end $$;

create or replace function next_bast_number() returns text
language plpgsql security definer set search_path = public as $$
declare y int := extract(year from current_date)::int; s int;
begin
  insert into bast_number_counters(year, seq) values (y, 1)
  on conflict (year) do update set seq = bast_number_counters.seq + 1
  returning seq into s;
  return 'BAST/CITE/' || y || '/' || lpad(s::text, 4, '0');
end $$;

-- ---------------------------------------------------------------------------
-- FIX 2 — master_rename() always reported "Record not found".
--
-- PL/pgSQL does not set FOUND after an EXECUTE (only after a static
-- INSERT/UPDATE/DELETE, SELECT INTO, FOR loop and friends), so the
-- `if not found` guard after the dynamic UPDATE read a stale, false FOUND and
-- fired on every successful rename. GET DIAGNOSTICS ... ROW_COUNT is the
-- supported way to ask how many rows a dynamic statement touched.
-- ---------------------------------------------------------------------------

create or replace function master_rename(p_entity text, p_id uuid, p_name text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare t text; label text; clean text; dup boolean; v_brand uuid; affected int;
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
  get diagnostics affected = row_count;

  if affected = 0 then
    raise exception 'Record not found' using errcode = 'P0001';
  end if;

  return jsonb_build_object('id', p_id, 'name', clean, 'entity', label);
end $$;
