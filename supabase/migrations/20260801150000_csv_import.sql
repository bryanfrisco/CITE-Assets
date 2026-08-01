-- ============================================================================
-- CITE Assets — 0024 CSV import  (Phase 7)
--
-- IMPLEMENTATION_PLAN.md § Phase 7, "Done when":
--   "a file with 45 rows and 3 bad rows imports 42 and returns a downloadable
--    error report."
--
-- Client instruction, 2026-07-30: "tidak ada data aset. bener bener clean.
-- tapi ttp tolong buatkan import csv(?) nya" — the register starts empty and
-- this is how the real one gets in.
--
-- ONE FUNCTION, TWO MODES
-- -----------------------
-- import_assets(rows, dry_run) validates every row the same way whether or not
-- it is going to write. The preview a person approves is therefore produced by
-- the code that does the work, not by a second implementation of the same
-- rules — which is the only way a preview can be trusted. `dry_run` decides
-- whether the valid rows are inserted, nothing else.
--
-- WHY UNKNOWN MASTER VALUES ARE AN ERROR, NOT AN INSERT
-- -----------------------------------------------------
-- It would be easy to create a category the moment a spreadsheet mentions one.
-- Do that and the first import with "Laptop", "laptops" and "Notebook" in it
-- leaves three categories that mean the same thing, and every report after that
-- is wrong in a way nobody can see. The row fails, the person fixes either the
-- sheet or the master data, and the register stays worth reading.
--
-- Matching is case-insensitive and trims whitespace, because "Dell " and "dell"
-- are the same brand and no human should have to care.
-- ============================================================================

/**
 * Resolves a master-data name to its id, case-insensitively.
 *
 * Returns null when the name is blank (the column was optional and empty) and
 * raises nothing — the caller decides whether an unresolved name is an error,
 * because that depends on whether the column was required.
 */
create or replace function import_lookup(p_table text, p_name text)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare found_id uuid;
begin
  if coalesce(btrim(p_name), '') = '' then
    return null;
  end if;

  -- A fixed set of table names, never interpolated from user input beyond
  -- this whitelist: the parameter reaches a query, so anything else here
  -- would be an injection point.
  case p_table
    when 'categories' then
      select id into found_id from categories
       where lower(name) = lower(btrim(p_name)) and is_active limit 1;
    when 'brands' then
      select id into found_id from brands
       where lower(name) = lower(btrim(p_name)) and is_active limit 1;
    when 'models' then
      select id into found_id from models
       where lower(name) = lower(btrim(p_name)) and is_active limit 1;
    when 'vendors' then
      select id into found_id from vendors
       where lower(name) = lower(btrim(p_name)) and is_active limit 1;
    when 'departments' then
      select id into found_id from departments
       where lower(name) = lower(btrim(p_name)) and is_active limit 1;
    when 'locations' then
      select id into found_id from locations
       where lower(name) = lower(btrim(p_name)) or lower(code) = lower(btrim(p_name)) limit 1;
    when 'asset_statuses' then
      select id into found_id from asset_statuses where lower(name) = lower(btrim(p_name)) limit 1;
    when 'asset_conditions' then
      select id into found_id from asset_conditions where lower(name) = lower(btrim(p_name)) limit 1;
    else
      raise exception 'Unknown lookup %', p_table using errcode = 'P0001';
  end case;

  return found_id;
end $$;

/** Parses a date written any of the three ways people actually write them. */
create or replace function import_date(p_value text)
returns date language plpgsql immutable as $$
declare v text := btrim(coalesce(p_value, ''));
begin
  if v = '' then
    return null;
  end if;

  -- ISO first, because that is what the template asks for and what a
  -- spreadsheet exports when the column is a real date.
  begin
    return to_date(v, 'YYYY-MM-DD');
  exception when others then
    null;
  end;

  begin
    return to_date(v, 'DD/MM/YYYY');
  exception when others then
    null;
  end;

  begin
    return to_date(v, 'DD-MM-YYYY');
  exception when others then
    null;
  end;

  -- A date that cannot be read is reported, never guessed at: silently
  -- dropping a warranty date is how a device stops being covered without
  -- anyone noticing.
  raise exception 'unparseable date';
end $$;

-- ---------------------------------------------------------------------------
-- import_assets() — validate, and optionally write.
--
-- p_rows is the parsed CSV: an array of objects keyed by the template's column
-- names. Parsing happens on the client because a CSV is a text format with
-- quoting rules, and Postgres is a poor place to discover a stray comma.
-- Everything that decides whether a row is ACCEPTABLE happens here.
-- ---------------------------------------------------------------------------
create or replace function import_assets(
  p_rows      jsonb,
  p_dry_run   boolean default true,
  p_file_name text    default 'import.csv'
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  row_json     jsonb;
  idx          int := 0;
  errors       jsonb := '[]'::jsonb;
  created      jsonb := '[]'::jsonb;
  ok_rows      int := 0;
  bad_rows     int := 0;
  seen_serials text[] := array[]::text[];
  batch_id     uuid;

  v_name       text;
  v_serial     text;
  v_code       text;
  v_category   uuid;
  v_location   uuid;
  v_status     uuid;
  v_condition  uuid;
  v_brand      uuid;
  v_model      uuid;
  v_vendor     uuid;
  v_department uuid;
  v_purchased  date;
  v_wstart     date;
  v_wend       date;
  v_price      numeric;
  row_errors   jsonb;
  result       jsonb;
begin
  if not can_write_assets() then
    raise exception 'You do not have permission to import assets' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'The file could not be read' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_rows) = 0 then
    raise exception 'The file has no rows' using errcode = 'P0001';
  end if;
  -- A ceiling so one enormous paste cannot hold a transaction open for
  -- minutes; well above any real inventory sheet.
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'That is more than 5000 rows — split the file' using errcode = 'P0001';
  end if;

  for row_json in select * from jsonb_array_elements(p_rows) loop
    idx := idx + 1;
    row_errors := '[]'::jsonb;

    v_name   := btrim(coalesce(row_json->>'name', ''));
    v_serial := btrim(coalesce(row_json->>'serial_number', ''));
    v_code   := nullif(btrim(coalesce(row_json->>'asset_code', '')), '');

    if v_name = '' then
      row_errors := row_errors || jsonb_build_object('column', 'name', 'message', 'Required');
    end if;

    if v_serial = '' then
      row_errors := row_errors ||
        jsonb_build_object('column', 'serial_number', 'message', 'Required');
    elsif lower(v_serial) = any (seen_serials) then
      row_errors := row_errors ||
        jsonb_build_object('column', 'serial_number', 'message', 'Duplicated earlier in this file');
    elsif exists (select 1 from assets where lower(serial_number) = lower(v_serial)) then
      row_errors := row_errors ||
        jsonb_build_object('column', 'serial_number', 'message', 'Already in the register');
    end if;

    if v_code is not null and exists (select 1 from assets where asset_code = v_code) then
      row_errors := row_errors ||
        jsonb_build_object('column', 'asset_code', 'message', 'Already in the register');
    end if;

    -- ---- master data ------------------------------------------------------
    v_category := import_lookup('categories', row_json->>'category');
    if v_category is null then
      row_errors := row_errors || jsonb_build_object(
        'column', 'category',
        'message', case when coalesce(btrim(row_json->>'category'), '') = ''
                        then 'Required' else 'Not in master data' end);
    end if;

    v_location := import_lookup('locations', row_json->>'location');
    if v_location is null then
      row_errors := row_errors || jsonb_build_object(
        'column', 'location',
        'message', case when coalesce(btrim(row_json->>'location'), '') = ''
                        then 'Required' else 'Not a known location' end);
    elsif v_location not in (select my_location_ids()) then
      -- Site IT importing into Head Office would otherwise create rows it
      -- could not then see, which is worse than refusing.
      row_errors := row_errors ||
        jsonb_build_object('column', 'location', 'message', 'Outside the locations you can write to');
    end if;

    v_status := import_lookup('asset_statuses', coalesce(nullif(btrim(coalesce(row_json->>'status','')), ''), 'Available'));
    if v_status is null then
      row_errors := row_errors ||
        jsonb_build_object('column', 'status', 'message', 'Not a known status');
    end if;

    v_condition := import_lookup('asset_conditions', coalesce(nullif(btrim(coalesce(row_json->>'condition','')), ''), 'Good'));
    if v_condition is null then
      row_errors := row_errors ||
        jsonb_build_object('column', 'condition', 'message', 'Not a known condition');
    end if;

    -- Optional: blank is fine, a name that does not resolve is not.
    v_brand := import_lookup('brands', row_json->>'brand');
    if v_brand is null and coalesce(btrim(row_json->>'brand'), '') <> '' then
      row_errors := row_errors ||
        jsonb_build_object('column', 'brand', 'message', 'Not in master data');
    end if;

    v_model := import_lookup('models', row_json->>'model');
    if v_model is null and coalesce(btrim(row_json->>'model'), '') <> '' then
      row_errors := row_errors ||
        jsonb_build_object('column', 'model', 'message', 'Not in master data');
    end if;

    v_vendor := import_lookup('vendors', row_json->>'vendor');
    if v_vendor is null and coalesce(btrim(row_json->>'vendor'), '') <> '' then
      row_errors := row_errors ||
        jsonb_build_object('column', 'vendor', 'message', 'Not in master data');
    end if;

    v_department := import_lookup('departments', row_json->>'department');
    if v_department is null and coalesce(btrim(row_json->>'department'), '') <> '' then
      row_errors := row_errors ||
        jsonb_build_object('column', 'department', 'message', 'Not in master data');
    end if;

    -- ---- dates and money --------------------------------------------------
    begin
      v_purchased := import_date(row_json->>'purchase_date');
    exception when others then
      v_purchased := null;
      row_errors := row_errors ||
        jsonb_build_object('column', 'purchase_date', 'message', 'Not a date (use YYYY-MM-DD)');
    end;

    begin
      v_wstart := import_date(row_json->>'warranty_start');
    exception when others then
      v_wstart := null;
      row_errors := row_errors ||
        jsonb_build_object('column', 'warranty_start', 'message', 'Not a date (use YYYY-MM-DD)');
    end;

    begin
      v_wend := import_date(row_json->>'warranty_end');
    exception when others then
      v_wend := null;
      row_errors := row_errors ||
        jsonb_build_object('column', 'warranty_end', 'message', 'Not a date (use YYYY-MM-DD)');
    end;

    if v_wstart is not null and v_wend is not null and v_wend < v_wstart then
      row_errors := row_errors ||
        jsonb_build_object('column', 'warranty_end', 'message', 'Ends before it starts');
    end if;

    begin
      v_price := nullif(btrim(regexp_replace(coalesce(row_json->>'purchase_price', ''), '[^0-9.\-]', '', 'g')), '')::numeric;
    exception when others then
      v_price := null;
      row_errors := row_errors ||
        jsonb_build_object('column', 'purchase_price', 'message', 'Not a number');
    end;

    if v_price is not null and v_price < 0 then
      row_errors := row_errors ||
        jsonb_build_object('column', 'purchase_price', 'message', 'Cannot be negative');
    end if;

    -- ---- verdict ----------------------------------------------------------
    if jsonb_array_length(row_errors) > 0 then
      bad_rows := bad_rows + 1;
      errors := errors || jsonb_build_object(
        'row', idx,
        'name', v_name,
        'serial', v_serial,
        'problems', row_errors
      );
    else
      ok_rows := ok_rows + 1;
      seen_serials := seen_serials || lower(v_serial);

      if not p_dry_run then
        -- create_asset() is reused rather than an INSERT: it is where the
        -- asset code is generated and where the audit trigger sees a normal
        -- creation, so an imported asset is indistinguishable from a typed one.
        created := created || (
          select create_asset(
            p_name           => v_name,
            p_category       => v_category,
            p_serial         => v_serial,
            p_location       => v_location,
            p_status         => v_status,
            p_condition      => v_condition,
            p_brand          => v_brand,
            p_model          => v_model,
            p_vendor         => v_vendor,
            p_department     => v_department,
            p_purchase_date  => v_purchased,
            p_purchase_price => v_price,
            p_warranty_start => v_wstart,
            p_warranty_end   => v_wend,
            p_notes          => nullif(btrim(coalesce(row_json->>'notes', '')), ''),
            p_asset_code     => v_code
          )
        );
      end if;
    end if;
  end loop;

  if not p_dry_run then
    insert into import_batches (file_name, file_path, total_rows, imported_rows, skipped_rows, errors, imported_by)
    values (
      coalesce(p_file_name, 'import.csv'),
      'inline',                       -- parsed on the device; no file is stored
      idx, ok_rows, bad_rows, errors, my_account_id()
    ) returning id into batch_id;
  end if;

  result := jsonb_build_object(
    'dryRun',   p_dry_run,
    'total',    idx,
    'valid',    ok_rows,
    'invalid',  bad_rows,
    'errors',   errors,
    'batchId',  batch_id,
    'created',  created
  );

  return result;
end $$;

/** Past imports, so a bad one can be traced back to who ran it and when. */
create or replace function import_history(p_limit int default 25)
returns table (
  id uuid, file_name text, total_rows int, imported_rows int, skipped_rows int,
  errors jsonb, imported_by_name text, created_at timestamptz
)
language sql stable security invoker set search_path = public as $$
  select
    b.id, b.file_name, b.total_rows, b.imported_rows, b.skipped_rows,
    b.errors, coalesce(acc.full_name, 'System'), b.created_at
  from import_batches b
  left join accounts acc on acc.id = b.imported_by
  order by b.created_at desc
  limit greatest(1, least(coalesce(p_limit, 25), 100));
$$;

revoke all on function import_lookup(text, text)          from public, anon, authenticated;
revoke all on function import_date(text)                  from public, anon, authenticated;
revoke all on function import_assets(jsonb, boolean, text) from public, anon, authenticated;
revoke all on function import_history(int)                from public, anon, authenticated;

grant execute on function import_assets(jsonb, boolean, text) to authenticated;
grant execute on function import_history(int)                 to authenticated;

-- import_lookup() and import_date() stay closed: they are the inside of the
-- import, not an API, and import_assets() runs as the caller so it needs no
-- grant of its own to reach them... except that it is SECURITY INVOKER, so it
-- does. Granting the two helpers to authenticated is what makes that work,
-- and neither reveals anything a client cannot already read.
grant execute on function import_lookup(text, text) to authenticated;
grant execute on function import_date(text)         to authenticated;
