-- ============================================================================
-- CITE Assets — 0055 The asset import can attach the sticker too
--
-- THE PROBLEM
-- -----------
-- An imported asset got a generated asset_code and no label. The physical
-- sticker is a separate thing with its own code and its own stock, attached
-- one asset at a time from the detail screen. Importing 500 assets therefore
-- meant 500 manual attachments, which is not a workflow anybody completes.
--
-- WHAT CHANGED
-- ------------
-- One optional `label` column. Filled in, the sticker is attached during the
-- import; left out or left blank, the asset imports with no label exactly as
-- before. Nothing about an existing template stops working.
--
-- Every check mirrors attach_tag() and runs in the same pass as the other
-- row validation, so a DRY RUN tells the truth about what the real run will
-- do — including "that label is already on LPT045-24-118". A label that is
-- wrong fails its row rather than the file.
--
-- The write goes through attach_tag() rather than touching asset_tags, so an
-- imported sticker is indistinguishable from one attached by hand.
--
-- Replaced in full, signature unchanged — replaces rather than overloads.
-- ============================================================================

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
  seen_labels  text[] := array[]::text[];
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
  v_label      text;
  v_tag        asset_tags%rowtype;
  v_new        jsonb;
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
    v_label  := upper(btrim(coalesce(row_json->>'label', '')));

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

    -- ---- the physical sticker ---------------------------------------------
    -- Optional. Leave the column out, or a cell blank, and the asset imports
    -- with no label exactly as it did before — the sticker is then attached by
    -- hand later. Every check here mirrors attach_tag(), so a dry run tells the
    -- truth about what the real run will do.
    if v_label <> '' then
      if v_label = any (seen_labels) then
        row_errors := row_errors || jsonb_build_object(
          'column', 'label', 'message', 'Used twice in this file');
      else
        select * into v_tag from asset_tags where code = v_label;
        if not found then
          row_errors := row_errors || jsonb_build_object(
            'column', 'label', 'message', 'Not one of ours');
        elsif v_tag.status = 'void' then
          row_errors := row_errors || jsonb_build_object(
            'column', 'label', 'message', 'Voided and cannot be used again');
        elsif v_tag.status = 'tagged' then
          row_errors := row_errors || jsonb_build_object(
            'column', 'label', 'message', 'Already on ' ||
              coalesce((select asset_code from assets where id = v_tag.asset_id), 'another asset'));
        elsif v_location is not null and v_tag.location_id is distinct from v_location then
          -- Label stock belongs to a location; a Head Office sticker on a Site
          -- asset would make the two runs of numbers meaningless.
          row_errors := row_errors || jsonb_build_object(
            'column', 'label', 'message', 'That label belongs to ' ||
              coalesce((select name from locations where id = v_tag.location_id), 'another location'));
        end if;
      end if;
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
      if v_label <> '' then
        seen_labels := seen_labels || v_label;
      end if;

      if not p_dry_run then
        -- create_asset() is reused rather than an INSERT: it is where the
        -- asset code is generated and where the audit trigger sees a normal
        -- creation, so an imported asset is indistinguishable from a typed one.
        v_new := (
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
        created := created || v_new;

        -- attach_tag() re-checks everything above and is the only writer of
        -- asset_tags, so an imported sticker is indistinguishable from one
        -- attached by hand — same row, same tagged_by, same audit entry.
        if v_label <> '' then
          perform attach_tag(v_label, (v_new->>'id')::uuid);
        end if;
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

revoke all on function import_assets(jsonb, boolean, text) from public, anon, authenticated;
grant execute on function import_assets(jsonb, boolean, text) to authenticated;
