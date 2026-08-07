-- ============================================================================
-- CITE Assets — 0034 The asset code the company actually uses
--
-- Client instruction, 2026-08-06:
--   "saya mau asset code masih bisa di edit tapi catchnya begini, urutan
--    pengisiannya ... supaya asset code itu bisa auto keisi, tinggal kita
--    tambahin angka belakangnya, contoh seperti ini: SPRLAP24-HO-0064
--      SPR  = stargate pasific resources (biarkan saja spr, saya mau buat
--             multi company nanti tahun depan mungkin)
--      LAP  = category laptop (master data yang sekarang sudah saya buat pas)
--      24   = tahun 2024
--      HO   = Head Office (jika site berarti SITE)
--      0064 = itu saja"
--
--   SPR   LAP   24  -  HO  -  0064
--    |     |     |      |       |
--    |     |     |      |       +-- running number, four digits
--    |     |     |      +---------- locations.code
--    |     |     +----------------- two-digit year
--    |     +----------------------- categories.code
--    +----------------------------- locations.company_code
--
-- WHAT THIS REPLACES
-- ------------------
-- `LPT045-24-118` — two counters, one per category and one per year, glued
-- together. Nobody outside this codebase has ever used that format, and it
-- carries no location at all, which for a two-site company is the one fact the
-- code most needed to hold.
--
-- WHERE THE NUMBER COMES FROM
-- ---------------------------
-- Not a counter table. The next number is read from the ASSET CODES THEMSELVES:
--
--   max(trailing digits) + 1, over the codes already sharing this prefix
--
-- That matters because of what happens next — the client has years of existing
-- codes in spreadsheets. A counter table would start at 1 and collide with
-- every one of them until somebody remembered to seed it; reading the maximum
-- means importing `SPRLAP24-HO-0064` makes the next generated code 0065 with
-- nobody doing anything. The register seeds itself from its own contents.
--
-- The cost is a race: two people registering a laptop in the same second could
-- both read 0064. `assets.asset_code` is UNIQUE, so the loser gets a constraint
-- violation rather than a duplicate — and the retry loop below turns that into
-- the next number instead of an error page.
--
-- MULTI COMPANY
-- -------------
-- `SPR` is a column on `locations`, not a constant, because the client said
-- next year there will be more than one company. Today every location is SPR;
-- the day that stops being true, the format already knows what to do.
-- ============================================================================

alter table locations add column if not exists company_code text;

update locations set company_code = coalesce(company_code, 'SPR');


-- ---------------------------------------------------------------------------
-- The prefix, on its own — so the form can show what the code WILL be before
-- anything is saved, using exactly the same rule that will produce it.
-- ---------------------------------------------------------------------------
create or replace function asset_code_prefix(
  p_category uuid,
  p_location uuid,
  p_purchase date default null
) returns text language plpgsql stable security invoker set search_path = public as $$
declare cat text; loc locations%rowtype;
begin
  select code into cat from categories where id = p_category;
  select * into loc from locations where id = p_location;
  if cat is null or loc.id is null then return null; end if;

  return upper(
    coalesce(loc.company_code, 'SPR')
    || cat
    || to_char(coalesce(p_purchase, current_date), 'YY')
    || '-' || loc.code || '-'
  );
end $$;

/**
 * What the next code under a prefix would be.
 *
 * Read rather than counted — see the header. `substring(... from '(\d+)$')`
 * pulls the trailing digits off each sibling code, so a legacy import decides
 * where the sequence continues from.
 */
create or replace function next_in_asset_prefix(p_prefix text)
returns int language sql stable security invoker set search_path = public as $$
  select coalesce(max((substring(a.asset_code from '(\d+)$'))::int), 0) + 1
  from assets a
  where a.asset_code like p_prefix || '%'
    and a.asset_code ~ ('^' || regexp_replace(p_prefix, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '\d+$');
$$;

/** The whole code, for the form's preview. Generates nothing and reserves nothing. */
create or replace function preview_asset_code(
  p_category uuid,
  p_location uuid,
  p_purchase date default null
) returns text language plpgsql stable security invoker set search_path = public as $$
declare prefix text;
begin
  prefix := asset_code_prefix(p_category, p_location, p_purchase);
  if prefix is null then return null; end if;
  return prefix || lpad(next_in_asset_prefix(prefix)::text, 4, '0');
end $$;


-- ---------------------------------------------------------------------------
-- next_asset_code() — three arguments now, because the code carries the
-- location. The two-argument form is dropped rather than left beside this one
-- (migration 0029: two overloads that both match a named-argument call break
-- every caller at once).
-- ---------------------------------------------------------------------------
drop function if exists next_asset_code(uuid, date);

create or replace function next_asset_code(
  p_category uuid,
  p_purchase date,
  p_location uuid
) returns text language plpgsql security definer set search_path = public as $$
declare prefix text; candidate text; attempt int := 0;
begin
  prefix := asset_code_prefix(p_category, p_location, p_purchase);
  if prefix is null then
    raise exception 'A category and a location are needed before a code can be made'
      using errcode = 'P0001';
  end if;

  -- Loops only when two registrations collide on the same number. Bounded, so
  -- a genuinely stuck prefix fails loudly instead of spinning.
  loop
    attempt := attempt + 1;
    candidate := prefix || lpad(next_in_asset_prefix(prefix)::text, 4, '0');
    exit when not exists (select 1 from assets where asset_code = candidate);
    if attempt >= 25 then
      raise exception 'Could not allocate an asset code for %', prefix using errcode = 'P0001';
    end if;
  end loop;

  return candidate;
end $$;

-- The old counter table is left in place and simply stops being written to.
-- Dropping it would destroy the only record of how the previous codes were
-- allocated, and it costs nothing to keep.


-- ---------------------------------------------------------------------------
-- create_asset() — reproduced whole, because a function is replaced as a unit.
-- The only change is the call to next_asset_code(), which now needs the
-- location.
-- ---------------------------------------------------------------------------
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
  p_asset_code     text    default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me       uuid := my_account_id();
  my_r     user_role := my_role();
  clean_sn text := btrim(coalesce(p_serial, ''));
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

  -- README § Interactions: "only Super Admin can delete master data or edit an
  -- asset code". Everyone else gets the generated code.
  if p_asset_code is not null and btrim(p_asset_code) <> '' then
    if my_r is distinct from 'super_admin' then
      raise exception 'Only a Super Admin may set the asset code' using errcode = 'P0001';
    end if;
    code := upper(btrim(p_asset_code));
    if exists (select 1 from assets a where a.asset_code = code) then
      raise exception 'Asset code % is already in use', code using errcode = 'P0001';
    end if;
  else
    code := next_asset_code(p_category, p_purchase_date, p_location);
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


revoke all on function asset_code_prefix(uuid, uuid, date)   from public, anon, authenticated;
revoke all on function next_in_asset_prefix(text)            from public, anon, authenticated;
revoke all on function preview_asset_code(uuid, uuid, date)  from public, anon, authenticated;
revoke all on function next_asset_code(uuid, date, uuid)     from public, anon, authenticated;

grant execute on function asset_code_prefix(uuid, uuid, date)  to authenticated;
grant execute on function next_in_asset_prefix(text)           to authenticated;
grant execute on function preview_asset_code(uuid, uuid, date) to authenticated;
-- next_asset_code() stays reachable because create_asset() is SECURITY DEFINER
-- but tag_asset() reaches create_asset() as the invoker; migration 0022 exists
-- because revoking this broke every registration.
grant execute on function next_asset_code(uuid, date, uuid)    to authenticated;
