-- ============================================================================
-- CITE Assets — 0035 The prefix is the system's, the number is the user's
--
-- Client instruction, 2026-08-07:
--   "sprlap dan ho harus by sistem otomatis narik data dari company spr ...
--    lalu lap ambil code di kategori, ho itu dari lokasinya mana. lalu nomor
--    nomor belakang kita isi sendiri saja."
--
--   SPRLAP24-HO-  0064
--   ------------  ----
--    the system   the person
--
-- WHY THIS IS NOT JUST "MAKE THE FIELD EDITABLE"
-- ----------------------------------------------
-- Migration 0034 already lets a Super Admin type the WHOLE code, and that is
-- the wrong shape for this. A whole-code field lets anybody who has it write
-- `HACK001-24-001` — the prefix stops being derived and starts being a claim.
-- The register's most useful property is that `SPRLAP24-HO-` is always true:
-- the category, the year and the location are readable off any code without
-- trusting whoever typed it.
--
-- So this splits the field in two. `p_code_seq` is DIGITS ONLY and is glued to
-- a prefix the caller cannot influence — anyone who may create an asset may
-- choose its number, and nobody may choose what it says about itself.
-- `p_asset_code` survives, still Super Admin only, for the genuine exception:
-- importing a legacy code that predates this scheme.
--
-- Leaving the number empty still generates the next one. Both instructions the
-- client gave are true at once — the form suggests a number and the number is
-- theirs to change.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The 18-argument form is DROPPED rather than left beside the new one. Both
-- the CSV import and the client call this with named arguments, and two
-- overloads that each match make every call ambiguous (migration 0029).
-- ---------------------------------------------------------------------------
drop function if exists create_asset(
  text, uuid, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid,
  date, numeric, date, date, jsonb, text, text
);

create or replace function create_asset(
  p_name           text,
  p_category       uuid,
  p_serial         text,
  p_location       uuid,
  p_status         uuid,
  p_condition      uuid,
  p_brand          uuid    default null,
  p_model          uuid    default null,
  p_vendor         uuid    default null,
  p_department     uuid    default null,
  p_assigned_to    uuid    default null,
  p_purchase_date  date    default null,
  p_purchase_price numeric default null,
  p_warranty_start date    default null,
  p_warranty_end   date    default null,
  p_specifications jsonb   default '[]'::jsonb,
  p_notes          text    default null,
  /** The whole code, verbatim. Super Admin only — for legacy imports. */
  p_asset_code     text    default null,
  /** Just the number. Anyone who may create an asset may choose it. */
  p_code_seq       text    default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me       uuid := my_account_id();
  my_r     user_role := my_role();
  clean_sn text := btrim(coalesce(p_serial, ''));
  prefix   text;
  digits   text;
  code     text;
  new_id   uuid;
begin
  if not can_write_assets() then
    raise exception 'You do not have permission to create assets' using errcode = 'P0001';
  end if;
  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'Asset name is required' using errcode = 'P0001';
  end if;
  if p_category is null then
    raise exception 'Category is required' using errcode = 'P0001';
  end if;
  if clean_sn = '' then
    raise exception 'Serial number is required' using errcode = 'P0001';
  end if;
  if p_location is null then
    raise exception 'Location is required' using errcode = 'P0001';
  end if;
  if p_location not in (select my_location_ids()) then
    raise exception 'That location is outside your scope' using errcode = 'P0001';
  end if;

  if exists (select 1 from assets a where lower(a.serial_number) = lower(clean_sn)) then
    raise exception 'Serial number already registered' using errcode = 'P0001';
  end if;

  if p_asset_code is not null and btrim(p_asset_code) <> '' then
    -- README § Interactions: "only Super Admin can delete master data or edit
    -- an asset code". This is the whole-code path and it stays theirs alone.
    if my_r is distinct from 'super_admin' then
      raise exception 'Only a Super Admin may set the whole asset code' using errcode = 'P0001';
    end if;
    code := upper(btrim(p_asset_code));

  elsif p_code_seq is not null and btrim(p_code_seq) <> '' then
    prefix := asset_code_prefix(p_category, p_location, p_purchase_date);
    if prefix is null then
      raise exception 'A category and a location are needed before a code can be made'
        using errcode = 'P0001';
    end if;

    -- Digits only. Everything else in the code is derived, and a number that
    -- can carry letters is a second place to hide a claim.
    digits := regexp_replace(btrim(p_code_seq), '\D', '', 'g');
    if digits = '' then
      raise exception 'The asset number must be digits' using errcode = 'P0001';
    end if;
    if length(digits) > 8 then
      raise exception 'That asset number is too long' using errcode = 'P0001';
    end if;

    -- Padded to four so 64 and 0064 are the same asset rather than two.
    code := prefix || lpad(digits, 4, '0');

  else
    -- Left empty: the register picks the next one, exactly as before.
    code := next_asset_code(p_category, p_purchase_date, p_location);
  end if;

  if exists (select 1 from assets a where a.asset_code = code) then
    raise exception 'Asset code % is already in use', code using errcode = 'P0001';
  end if;

  insert into assets (
    asset_code, name, category_id, brand_id, model_id, serial_number, vendor_id,
    purchase_date, purchase_price, warranty_start, warranty_end,
    department_id, location_id, assigned_to, status_id, condition_id,
    specifications, notes, created_by
  ) values (
    code, btrim(p_name), p_category, p_brand, p_model, clean_sn, p_vendor,
    p_purchase_date, p_purchase_price, p_warranty_start, p_warranty_end,
    p_department, p_location, p_assigned_to, p_status, p_condition,
    coalesce(p_specifications, '[]'::jsonb), nullif(btrim(coalesce(p_notes, '')), ''), me
  )
  returning id into new_id;

  return jsonb_build_object('id', new_id, 'assetCode', code, 'name', btrim(p_name));
end $$;


-- ---------------------------------------------------------------------------
-- tag_asset() — the scan path reaches create_asset() positionally, so it has
-- to grow the same argument or the number typed on the scan screen would be
-- silently dropped.
-- ---------------------------------------------------------------------------
drop function if exists tag_asset(
  text, text, uuid, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid,
  date, numeric, date, date, jsonb, text, text
);

create or replace function tag_asset(
  p_code           text,
  p_name           text,
  p_category       uuid,
  p_serial         text,
  p_location       uuid,
  p_status         uuid,
  p_condition      uuid,
  p_brand          uuid    default null,
  p_model          uuid    default null,
  p_vendor         uuid    default null,
  p_department     uuid    default null,
  p_purchase_date  date    default null,
  p_purchase_price numeric default null,
  p_warranty_start date    default null,
  p_warranty_end   date    default null,
  p_specifications jsonb   default '[]'::jsonb,
  p_notes          text    default null,
  p_asset_code     text    default null,
  p_code_seq       text    default null
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  t       asset_tags%rowtype;
  created jsonb;
  me      uuid := my_account_id();
begin
  select * into t from asset_tags where code = upper(btrim(p_code)) for update;
  if not found then
    raise exception 'That label is not one of ours' using errcode = 'P0001';
  end if;
  if t.status = 'tagged' then
    raise exception 'That label is already on another asset' using errcode = 'P0001';
  end if;
  if t.status = 'void' then
    raise exception 'That label has been voided' using errcode = 'P0001';
  end if;

  -- Checked BEFORE the asset is created, so a rejected pairing does not leave a
  -- half-registered device behind.
  perform assert_tag_location(t.location_id, p_location);

  created := create_asset(
    p_name           => p_name,
    p_category       => p_category,
    p_serial         => p_serial,
    p_location       => p_location,
    p_status         => p_status,
    p_condition      => p_condition,
    p_brand          => p_brand,
    p_model          => p_model,
    p_vendor         => p_vendor,
    p_department     => p_department,
    p_purchase_date  => p_purchase_date,
    p_purchase_price => p_purchase_price,
    p_warranty_start => p_warranty_start,
    p_warranty_end   => p_warranty_end,
    p_specifications => p_specifications,
    p_notes          => p_notes,
    p_asset_code     => p_asset_code,
    p_code_seq       => p_code_seq
  );

  update asset_tags set
    status    = 'tagged',
    asset_id  = (created ->> 'id')::uuid,
    tagged_at = now(),
    tagged_by = me
  where id = t.id;

  return jsonb_build_object(
    'id',        created ->> 'id',
    'assetCode', created ->> 'assetCode',
    'name',      created ->> 'name',
    'tagCode',   t.code
  );
end $$;


revoke all on function create_asset(
  text, uuid, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid,
  date, numeric, date, date, jsonb, text, text, text
) from public, anon, authenticated;
revoke all on function tag_asset(
  text, text, uuid, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid,
  date, numeric, date, date, jsonb, text, text, text
) from public, anon, authenticated;

grant execute on function create_asset(
  text, uuid, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid,
  date, numeric, date, date, jsonb, text, text, text
) to authenticated;
grant execute on function tag_asset(
  text, text, uuid, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid,
  date, numeric, date, date, jsonb, text, text, text
) to authenticated;
