-- ============================================================================
-- CITE Assets — 0033 A label belongs to a location
--
-- Client instruction, 2026-08-06:
--   "sekarang kan ct-000000. saya sekarang mau cth-000001 dan cts-000001 (cth
--    untuk head office dan cts untuk site) untuk membedakan ingin print label
--    yang site atau ho. jadi sesuai scope."
--
-- WHY THIS IS MORE THAN A PREFIX
-- ------------------------------
-- `CTH` and `CTS` could have been produced by typing a different prefix into
-- the existing create_tag_batch(p_count, p_prefix) — the counter table has been
-- keyed by prefix since migration 0014, so the numbering would already have
-- worked. That would have been the smaller change and the wrong one.
--
-- A prefix typed at print time is a label on a label: nothing downstream knows
-- what it means, nothing can filter by it, and one mistyped batch produces a
-- hundred stickers that claim to be Site stock and are not. The prefix has to
-- be a CONSEQUENCE of the location, not a description of it.
--
-- So the location becomes a column on the tag, the prefix becomes a property of
-- the location, and the two can never disagree:
--
--   locations.tag_prefix   'CTH' / 'CTS' — one per location, unique
--   asset_tags.location_id which stock this sticker belongs to
--
-- The batch RPC takes a LOCATION and derives the prefix. There is no longer any
-- way to ask for a prefix, which is the point.
--
-- ATTACHING ACROSS LOCATIONS IS REFUSED
-- -------------------------------------
-- A CTH sticker cannot go on a Site asset. Without that rule the split is
-- decoration: the codes would look separated while the stock quietly mixed, and
-- "print the Site labels" would stop meaning anything after the first mistake.
--
-- The check is at ATTACH time only. An asset that later moves HO -> Site keeps
-- its CTH sticker, which is correct — the sticker records where the label stock
-- came from, not where the device sleeps tonight.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- The prefix belongs to the location.
-- ---------------------------------------------------------------------------
alter table locations add column if not exists tag_prefix text;

update locations set tag_prefix = coalesce(
  tag_prefix,
  case code
    when 'HO'   then 'CTH'
    when 'SITE' then 'CTS'
    -- A location added later gets CT + its first letter, which is a sensible
    -- default and not a guarantee; the unique index below is the guarantee.
    else 'CT' || upper(left(code, 1))
  end
);

-- Two locations sharing a prefix would make every code ambiguous, which is
-- exactly the failure this migration exists to prevent.
create unique index if not exists locations_tag_prefix_key
  on locations (upper(tag_prefix)) where tag_prefix is not null;


-- ---------------------------------------------------------------------------
-- The stock belongs to a location.
--
-- Nullable, because labels printed before today have no location and deleting
-- them is not an option — a sticker that physically exists keeps its row. They
-- are treated as belonging to every scope, so they stay findable.
-- ---------------------------------------------------------------------------
alter table asset_tags
  add column if not exists location_id uuid references locations(id) on delete restrict;

create index if not exists asset_tags_location_idx on asset_tags (location_id, status);


-- ---------------------------------------------------------------------------
-- create_tag_batch() — now takes a LOCATION.
--
-- The two-argument form is dropped rather than left beside this one. Migration
-- 0029 exists because two overloads of search_assets() both matched a call with
-- named arguments and every search broke; the client calls this by name.
-- ---------------------------------------------------------------------------
drop function if exists create_tag_batch(int, text);

-- p_location is defaulted so that omitting it resolves to THIS function and
-- raises the sentence below, rather than failing at PostgREST with
-- "Could not find the function public.create_tag_batch(p_count)".
create or replace function create_tag_batch(p_count int, p_location uuid default null)
returns table (batch_id uuid, code text, location_name text, prefix text)
language plpgsql security invoker set search_path = public as $$
declare
  me        uuid := my_account_id();
  new_batch uuid := gen_random_uuid();
  loc       locations%rowtype;
  use_prefix text;
  i         int;
begin
  if not can_write_assets() then
    raise exception 'You do not have permission to create tags' using errcode = 'P0001';
  end if;
  if p_count is null or p_count < 1 then
    raise exception 'How many labels do you need?' using errcode = 'P0001';
  end if;
  -- A print run larger than this is almost certainly a typo, and every code is
  -- permanent once issued.
  if p_count > 500 then
    raise exception 'A batch is limited to 500 labels' using errcode = 'P0001';
  end if;

  if p_location is null then
    raise exception 'Choose which location these labels are for' using errcode = 'P0001';
  end if;

  select * into loc from locations where id = p_location;
  if not found then
    raise exception 'Unknown location' using errcode = 'P0001';
  end if;
  -- Site IT is locked to its own location scope (README § Interactions), so it
  -- cannot print stock for a location it will never see.
  if p_location not in (select my_location_ids()) then
    raise exception 'That location is outside your scope' using errcode = 'P0001';
  end if;

  use_prefix := upper(btrim(coalesce(loc.tag_prefix, 'CT' || upper(left(loc.code, 1)))));

  for i in 1..p_count loop
    insert into asset_tags (code, status, batch_id, location_id, printed_at, created_by)
    values (next_tag_code(use_prefix), 'untagged', new_batch, p_location, now(), me);
  end loop;

  return query
    select t.batch_id, t.code, loc.name, use_prefix
    from asset_tags t
    where t.batch_id = new_batch
    order by t.code;
end $$;


-- ---------------------------------------------------------------------------
-- Reads, scoped.
-- ---------------------------------------------------------------------------
drop function if exists list_tags(text, uuid);

create or replace function list_tags(
  p_status    text    default null,
  p_batch     uuid    default null,
  p_locations uuid[]  default null
)
returns table (
  id uuid, code text, status tag_status, batch_id uuid,
  asset_code text, asset_name text, tagged_at timestamptz, created_at timestamptz,
  location_id uuid, location_name text
)
language sql stable security invoker set search_path = public as $$
  select
    t.id, t.code, t.status, t.batch_id,
    a.asset_code, a.name, t.tagged_at, t.created_at,
    t.location_id, l.name
  from asset_tags t
  left join assets    a on a.id = t.asset_id
  left join locations l on l.id = t.location_id
  where (p_status is null or t.status::text = p_status)
    and (p_batch is null or t.batch_id = p_batch)
    -- Labels from before this migration carry no location. They stay visible in
    -- every scope rather than disappearing from a screen that used to show them.
    and (p_locations is null or t.location_id is null or t.location_id = any (p_locations))
  order by t.code;
$$;

drop function if exists tag_stock();

create or replace function tag_stock(p_locations uuid[] default null)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'untagged', count(*) filter (where status = 'untagged'),
    'tagged',   count(*) filter (where status = 'tagged'),
    'void',     count(*) filter (where status = 'void'),
    'total',    count(*)
  )
  from asset_tags
  where p_locations is null or location_id is null or location_id = any (p_locations);
$$;

/** Which prefix each location prints, for the label screen's chooser. */
create or replace function tag_prefixes(p_locations uuid[])
returns table (location_id uuid, location_name text, prefix text, blank int)
language sql stable security invoker set search_path = public as $$
  select
    l.id, l.name,
    upper(coalesce(l.tag_prefix, 'CT' || upper(left(l.code, 1)))),
    (select count(*)::int from asset_tags t
      where t.location_id = l.id and t.status = 'untagged')
  from locations l
  where l.id = any (p_locations) and l.is_active
  order by l.name;
$$;


-- ---------------------------------------------------------------------------
-- A label from one location cannot be attached to another location's asset.
-- ---------------------------------------------------------------------------
create or replace function assert_tag_location(p_tag_location uuid, p_asset_location uuid)
returns void language plpgsql stable security invoker set search_path = public as $$
begin
  -- Legacy stock has no location. It fits anywhere, because refusing it would
  -- strand stickers that are already printed and already stuck to devices.
  if p_tag_location is null then return; end if;
  if p_tag_location = p_asset_location then return; end if;

  raise exception 'That label is % stock — it cannot go on a % asset',
    coalesce((select name from locations where id = p_tag_location), 'another location'),
    coalesce((select name from locations where id = p_asset_location), 'different')
    using errcode = 'P0001';
end $$;

create or replace function attach_tag(p_code text, p_asset uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare tag asset_tags%rowtype; a assets%rowtype; me uuid := my_account_id();
begin
  select * into a from assets where id = p_asset;
  if not found then
    raise exception 'Asset not found' using errcode = 'P0001';
  end if;
  if not can_write_assets() or not can_see_asset(p_asset) then
    raise exception 'You do not have permission to label this asset' using errcode = 'P0001';
  end if;

  select * into tag from asset_tags where code = upper(btrim(p_code));
  if not found then
    raise exception 'That label is not one of ours' using errcode = 'P0001';
  end if;
  if tag.status = 'void' then
    raise exception 'That label was voided and cannot be used again' using errcode = 'P0001';
  end if;
  if tag.status = 'tagged' then
    if tag.asset_id = p_asset then
      -- Already right. Saying so beats an error for something that is done.
      return jsonb_build_object('code', tag.code, 'assetId', p_asset, 'alreadyAttached', true);
    end if;
    raise exception 'That label is already on %',
      coalesce((select asset_code from assets where id = tag.asset_id), 'another asset')
      using errcode = 'P0001';
  end if;

  -- One asset, one sticker. Attaching a second would give the same laptop two
  -- identities and no way to tell which one is on it.
  if exists (select 1 from asset_tags where asset_id = p_asset) then
    raise exception 'This asset already carries label %',
      (select code from asset_tags where asset_id = p_asset)
      using errcode = 'P0001';
  end if;

  perform assert_tag_location(tag.location_id, a.location_id);

  update asset_tags
     set status = 'tagged', asset_id = p_asset, tagged_at = now(), tagged_by = me
   where id = tag.id;

  return jsonb_build_object('code', tag.code, 'assetId', p_asset, 'alreadyAttached', false);
end $$;

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
  p_asset_code     text    default null
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

  -- Reuses create_asset() rather than repeating the insert, so the serial
  -- check, the code generator and the audit trail cannot drift between the
  -- scan path and the manual Add Asset form.
  created := create_asset(
    p_name, p_category, p_serial, p_location, p_status, p_condition,
    p_brand, p_model, p_vendor, p_department, null,
    p_purchase_date, p_purchase_price, p_warranty_start, p_warranty_end,
    p_specifications, p_notes, p_asset_code);

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


-- ---------------------------------------------------------------------------
-- tag_detail() — replaced so the sheet can say which stock a sticker came from.
-- ---------------------------------------------------------------------------
create or replace function tag_detail(p_code text)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare t asset_tags%rowtype;
begin
  select * into t from asset_tags where code = upper(btrim(p_code));
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'code', t.code,
    'status', t.status,
    'batchId', t.batch_id,
    'stockLocation', (select name from locations where id = t.location_id),
    'printedAt', t.printed_at,
    'createdAt', t.created_at,
    'taggedAt', t.tagged_at,
    'taggedByName', (select full_name from accounts where id = t.tagged_by),
    'voidedAt', t.voided_at,
    'voidReason', t.void_reason,
    'voidedByName', (select full_name from accounts where id = t.voided_by),
    'asset', case when t.asset_id is null then null else (
      select jsonb_build_object(
        'id', a.id,
        'assetCode', a.asset_code,
        'name', a.name,
        'serialNumber', a.serial_number,
        'statusName', s.name,
        'conditionName', c.name,
        'locationName', l.name,
        'holderName', (select full_name from accounts where id = a.assigned_to)
      )
      from assets a
      join asset_statuses s on s.id = a.status_id
      join asset_conditions c on c.id = a.condition_id
      join locations l on l.id = a.location_id
      where a.id = t.asset_id
        and can_see_asset(a.id)
    ) end
  );
end $$;


-- ---------------------------------------------------------------------------
-- Privileges.
-- ---------------------------------------------------------------------------
revoke all on function create_tag_batch(int, uuid)        from public, anon, authenticated;
revoke all on function list_tags(text, uuid, uuid[])      from public, anon, authenticated;
revoke all on function tag_stock(uuid[])                  from public, anon, authenticated;
revoke all on function tag_prefixes(uuid[])               from public, anon, authenticated;
revoke all on function tag_detail(text)                   from public, anon, authenticated;
revoke all on function attach_tag(text, uuid)             from public, anon, authenticated;
revoke all on function assert_tag_location(uuid, uuid)    from public, anon, authenticated;
revoke all on function tag_asset(
  text, text, uuid, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid,
  date, numeric, date, date, jsonb, text, text
) from public, anon, authenticated;

grant execute on function create_tag_batch(int, uuid)     to authenticated;
grant execute on function list_tags(text, uuid, uuid[])   to authenticated;
grant execute on function tag_stock(uuid[])               to authenticated;
grant execute on function tag_prefixes(uuid[])            to authenticated;
grant execute on function tag_detail(text)                to authenticated;
grant execute on function attach_tag(text, uuid)          to authenticated;
grant execute on function tag_asset(
  text, text, uuid, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid,
  date, numeric, date, date, jsonb, text, text
) to authenticated;
-- assert_tag_location() has to be granted: tag_asset() is SECURITY INVOKER, so
-- without it every scan-to-register would fail with "permission denied for
-- function". Harmless to expose — it only reads `locations`, which every signed
-- in user can read anyway, and it either returns nothing or raises.
grant execute on function assert_tag_location(uuid, uuid) to authenticated;
