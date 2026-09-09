-- ============================================================================
-- CITE Assets — 0090 The importer stops filing "Using Email" as a number
--
-- Migration 0087 cleared that phrase out of `license_number` for the two rows
-- carrying it. It did not touch the importer, so the next licence import put
-- both straight back: a cleanup patching the output of a source that keeps
-- producing it.
--
-- Caught by tests/licenses.mjs, which asserts no licence carries the phrase.
-- It only failed when the import suite had run first and re-created them --
-- which is exactly the ordering a real re-import would have.
--
-- The body below is the function as it stands with one guard added after the
-- number is read. It was taken from the database rather than retyped, so
-- nothing else in it has moved.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.import_licenses(p_rows jsonb, p_dry_run boolean DEFAULT true, p_file_name text DEFAULT 'licenses.csv'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  row_json   jsonb;
  idx        int := 0;
  errors     jsonb := '[]'::jsonb;
  warnings   jsonb := '[]'::jsonb;
  n_licenses int := 0;
  n_seats    int := 0;
  n_existing int := 0;
  batch_id   uuid;

  cur_software text := null;
  cur_license  uuid := null;

  v_software text; v_number text; v_category text; v_vendor text;
  v_year text; v_expiry text; v_account text; v_secret text;
  v_user text; v_notes text; v_status text;
  v_category_id uuid; v_vendor_id uuid; v_license uuid;
  v_holder uuid; v_holder_n int;
  v_seat uuid; v_blank_needed int; v_blank_have int;
  cur_blank_rows int := 0;
begin
  if my_role() <> 'super_admin' then
    raise exception 'Only a Super Admin can import licences' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'That file has more than 5000 rows' using errcode = 'P0001';
  end if;

  -- Pass 1: licences and their seats, in file order so carry-forward works.
  for row_json in select * from jsonb_array_elements(p_rows) loop
    idx := idx + 1;

    v_software := btrim(coalesce(row_json ->> 'software', ''));
    v_number   := nullif(btrim(coalesce(row_json ->> 'license_number', '')), '');
    -- "Using Email" is a note to the reader in the spreadsheet, not a licence
    -- number: it means this one has no code and is known by its account. Filed
    -- literally it printed where a code belongs, and every search for a real
    -- number had to step over it. Migration 0087 cleaned the two rows that
    -- already existed; this stops the importer putting them back.
    if lower(coalesce(v_number, '')) in ('using email', 'use email', 'email', 'n/a', 'na', '-') then
      v_number := null;
    end if;
    v_category := btrim(coalesce(row_json ->> 'category', ''));
    v_vendor   := btrim(coalesce(row_json ->> 'vendor', ''));
    v_year     := btrim(coalesce(row_json ->> 'purchase_year', ''));
    v_expiry   := btrim(coalesce(row_json ->> 'expiry_date', ''));
    v_account  := btrim(coalesce(row_json ->> 'seat_account', ''));
    v_secret   := nullif(btrim(coalesce(row_json ->> 'seat_password', '')), '');
    v_user     := btrim(coalesce(row_json ->> 'user_name', ''));
    v_notes    := nullif(btrim(coalesce(row_json ->> 'notes', '')), '');
    v_status   := upper(btrim(coalesce(row_json ->> 'asset_status', '')));

    -- A single cell holding "Username: x / Password: y" is split here rather
    -- than left for somebody to notice. Five cells of the real file are shaped
    -- that way, and each one is reported so the passwords are not smuggled in.
    if v_secret is null and v_account ~* 'password' then
      v_secret := nullif(btrim(regexp_replace(
        regexp_replace(v_account, '(?is)^.*?password\s*:?\s*', ''), '\s+$', '')), '');
      v_account := btrim(regexp_replace(
        regexp_replace(v_account, '(?is)password\s*:?.*$', ''), '(?i)^\s*(user\s*name|username|email)\s*:?\s*', ''));
      warnings := warnings || jsonb_build_object(
        'row', idx, 'message', 'Password was mixed into the account cell and has been split out');
    end if;
    v_account := nullif(v_account, '');

    -- A new licence starts wherever `software` is filled in.
    if v_software <> '' then
      if v_category = '' then
        errors := errors || jsonb_build_object(
          'row', idx, 'name', v_software,
          'problems', jsonb_build_array(jsonb_build_object(
            'column', 'category', 'message', 'A licence needs a category')));
        cur_license := null;
        cur_software := null;
        continue;
      end if;

      select id into v_category_id from license_categories
       where lower(name) = lower(v_category);
      if v_category_id is null then
        errors := errors || jsonb_build_object(
          'row', idx, 'name', v_software,
          'problems', jsonb_build_array(jsonb_build_object(
            'column', 'category', 'message', format('"%s" is not a licence category', v_category))));
        cur_license := null;
        cur_software := null;
        continue;
      end if;

      -- Vendors come from the shared master table. The sheet spells them five
      -- different ways ("PT.", "PT ", "PT.Digital"), so the punctuation is
      -- normalised away before matching instead of creating near-duplicates.
      v_vendor_id := null;
      if v_vendor <> '' then
        select id into v_vendor_id from vendors
         where regexp_replace(lower(name), '[^a-z0-9]', '', 'g')
             = regexp_replace(lower(v_vendor), '[^a-z0-9]', '', 'g');
        if v_vendor_id is null then
          warnings := warnings || jsonb_build_object(
            'row', idx, 'message', format('Vendor "%s" is not in master data — left blank', v_vendor));
        end if;
      end if;

      select id into v_license from licenses
       where lower(software) = lower(v_software)
         and coalesce(license_number, '') = coalesce(v_number, '');

      if v_license is null then
        if not p_dry_run then
          insert into licenses (software, license_number, category_id, vendor_id,
                                purchase_year, expiry_date, notes, created_by)
          values (v_software, v_number, v_category_id, v_vendor_id,
                  nullif(v_year, '')::int, license_parse_date(v_expiry), v_notes,
                  my_account_id())
          returning id into v_license;
        end if;
        n_licenses := n_licenses + 1;
      else
        n_existing := n_existing + 1;
        if not p_dry_run then
          -- coalesce(new, old): an import fills gaps, never blanks a field.
          update licenses set
            category_id   = v_category_id,
            vendor_id     = coalesce(v_vendor_id, vendor_id),
            purchase_year = coalesce(nullif(v_year, '')::int, purchase_year),
            expiry_date   = coalesce(license_parse_date(v_expiry), expiry_date),
            notes         = coalesce(v_notes, notes),
            updated_at    = now()
          where id = v_license;
        end if;
      end if;

      cur_license    := v_license;
      cur_software   := v_software;
      cur_blank_rows := 0;   -- seats counted afresh for each licence
    end if;

    if cur_software is null then
      if v_software = '' and idx = 1 then
        errors := errors || jsonb_build_object(
          'row', idx, 'name', '',
          'problems', jsonb_build_array(jsonb_build_object(
            'column', 'software', 'message', 'The first row must name a licence')));
      end if;
      continue;
    end if;

    -- ---- the seat on this row -------------------------------------------
    n_seats := n_seats + 1;

    -- Who holds it. Matched by name because the sheet has no NIK; an
    -- ambiguous or unknown name leaves the seat free rather than guessing.
    v_holder := null;
    if v_user <> '' then
      -- Postgres has no min(uuid), and picking "one of them" would be the
      -- wrong answer anyway: an ambiguous name must leave the seat free.
      select count(*) into v_holder_n
        from accounts where lower(full_name) = lower(v_user);
      if v_holder_n = 1 then
        select id into v_holder
          from accounts where lower(full_name) = lower(v_user);
      end if;
      if v_holder_n = 0 then
        v_holder := null;
        warnings := warnings || jsonb_build_object(
          'row', idx, 'message', format('No account named "%s" — seat left free', v_user));
      elsif v_holder_n > 1 then
        v_holder := null;
        warnings := warnings || jsonb_build_object(
          'row', idx, 'message', format('More than one account named "%s" — seat left free', v_user));
      end if;
    end if;

    -- The sheet's own status column is not imported; it is checked. Used with
    -- nobody in the seat is a contradiction worth telling somebody about.
    if v_status = 'USED' and v_user = '' then
      warnings := warnings || jsonb_build_object(
        'row', idx, 'message', 'Marked USED in the file but names nobody');
    end if;

    if p_dry_run then
      continue;
    end if;

    if v_account is not null then
      select id into v_seat from license_seats
       where license_id = cur_license and lower(seat_account) = lower(v_account);

      if v_seat is null then
        insert into license_seats (license_id, seat_account, seat_secret,
                                   account_id, assigned_date, notes, created_by)
        values (cur_license, v_account, v_secret, v_holder,
                case when v_holder is null then null else current_date end,
                v_notes, my_account_id());
      else
        update license_seats set
          seat_secret   = coalesce(v_secret, seat_secret),
          account_id    = coalesce(account_id, v_holder),
          assigned_date = case
                            when account_id is not null then assigned_date
                            when v_holder is not null then current_date
                            else assigned_date end,
          notes         = coalesce(v_notes, notes),
          updated_at    = now()
        where id = v_seat;
      end if;
    else
      -- Nameless seat: the file asserts a COUNT, so top up to it. The count
      -- is kept as we go rather than re-derived, which is both cheaper and the
      -- only version that is obviously correct.
      cur_blank_rows := cur_blank_rows + 1;
      v_blank_needed := cur_blank_rows;

      select count(*) into v_blank_have from license_seats
       where license_id = cur_license and seat_account is null;

      if v_blank_have < v_blank_needed then
        insert into license_seats (license_id, account_id, assigned_date,
                                   notes, created_by)
        values (cur_license, v_holder,
                case when v_holder is null then null else current_date end,
                v_notes, my_account_id());
      elsif v_holder is not null then
        -- The count is already satisfied, but this row names somebody. Put them
        -- in the first free chair rather than inventing a new one.
        update license_seats set account_id = v_holder, assigned_date = current_date,
                                 updated_at = now()
         where id = (select id from license_seats
                      where license_id = cur_license
                        and seat_account is null and account_id is null
                      order by created_at limit 1);
      end if;
    end if;
  end loop;

  if not p_dry_run then
    insert into import_batches (kind, file_name, file_path, total_rows,
                                imported_rows, skipped_rows, errors, imported_by)
    values ('licenses', coalesce(p_file_name, 'licenses.csv'), 'inline',
            idx, n_seats, jsonb_array_length(errors), errors, my_account_id())
    returning id into batch_id;
  end if;

  return jsonb_build_object(
    'dryRun',    p_dry_run,
    'rows',      idx,
    'created',   n_licenses,
    'updated',   n_existing,
    'unchanged', 0,
    'seats',     n_seats,
    'skipped',   jsonb_array_length(errors),
    'errors',    errors,
    'warnings',  warnings,
    'warningSummary', (
      select coalesce(jsonb_agg(jsonb_build_object('message', message, 'count', n)
                                order by n desc, message), '[]'::jsonb)
      from (
        select w->>'message' as message, count(*) as n
        from jsonb_array_elements(warnings) w
        group by w->>'message'
      ) g
    ),
    'batchId',   batch_id
  );
end $function$;
