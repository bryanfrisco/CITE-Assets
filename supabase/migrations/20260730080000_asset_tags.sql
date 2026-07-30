-- ============================================================================
-- CITE Assets — 0014 asset tags  (QR / barcode lifecycle)
--
-- REVERSES AN EARLIER CONSTRAINT, ON THE CLIENT'S INSTRUCTION
-- ---------------------------------------------------------
-- README states the physical stickers already exist and that scanning is out
-- of scope. On 2026-07-30 the client replaced that with the opposite: stickers
-- are pre-printed BLANK, carrying only a code, and are meaningless until
-- someone sticks one on a device and records what it is.
--
-- THE LIFECYCLE
-- -------------
--   untagged  a code exists on a printed sticker; it points at nothing
--   tagged    the sticker is on a device and an asset row exists for it
--   void      the sticker was damaged, lost, or mis-applied
--
-- The rule this table exists to enforce is that those two facts can never
-- disagree: a tag is `tagged` if and only if it has an asset, and one asset
-- can never carry two stickers. Both are CHECK/UNIQUE constraints below rather
-- than application logic, because a mislabelled asset is the one error this
-- system cannot detect after the fact — the sticker is the only physical link
-- back to the record.
-- ============================================================================

create type tag_status as enum ('untagged', 'tagged', 'void');

create table asset_tags (
  id          uuid primary key default gen_random_uuid(),
  -- What is encoded on the sticker. Short enough for a QR at label size and
  -- still readable by a human when the print is scuffed.
  code        text not null unique,
  status      tag_status not null default 'untagged',
  -- One sticker, one asset, enforced by the UNIQUE below rather than by trust.
  asset_id    uuid unique references assets(id) on delete restrict,
  -- Which print run this sticker came from, so a bad batch can be traced.
  batch_id    uuid,
  printed_at  timestamptz,
  tagged_at   timestamptz,
  tagged_by   uuid references accounts(id),
  voided_at   timestamptz,
  voided_by   uuid references accounts(id),
  void_reason text,
  created_at  timestamptz not null default now(),
  created_by  uuid references accounts(id),

  -- `tagged` and "has an asset" are the same fact stated twice; keep them so.
  constraint tag_status_matches_asset check (
    (status = 'tagged' and asset_id is not null)
    or (status <> 'tagged' and asset_id is null)
  ),
  constraint void_needs_reason check (
    status <> 'void' or void_reason is not null
  )
);

create index asset_tags_status_idx on asset_tags(status, created_at desc);
create index asset_tags_batch_idx on asset_tags(batch_id);

create trigger asset_tags_audit after insert or update on asset_tags
  for each row execute function audit_row('asset_created', 'asset_updated');

-- ---------------------------------------------------------------------------
-- Code generator. Sequential and zero-padded so a stack of stickers is easy to
-- reconcile by eye, and so codes cannot collide across batches.
-- ---------------------------------------------------------------------------
create table tag_code_counters (
  prefix text primary key,
  seq    int not null default 0
);

create or replace function next_tag_code(p_prefix text default 'CT')
returns text language plpgsql security definer set search_path = public as $$
declare s int; clean text := upper(btrim(coalesce(p_prefix, 'CT')));
begin
  if clean = '' then clean := 'CT'; end if;

  insert into tag_code_counters (prefix, seq) values (clean, 1)
  on conflict (prefix) do update set seq = tag_code_counters.seq + 1
  returning seq into s;

  return clean || '-' || lpad(s::text, 6, '0');       -- CT-000123
end $$;

-- ---------------------------------------------------------------------------
-- create_tag_batch() — print run. Returns the codes so the label file can be
-- generated for them; nothing is attached to an asset yet.
-- ---------------------------------------------------------------------------
create or replace function create_tag_batch(p_count int, p_prefix text default 'CT')
returns table (batch_id uuid, code text)
language plpgsql security invoker set search_path = public as $$
declare me uuid := my_account_id(); new_batch uuid := gen_random_uuid(); i int;
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

  for i in 1..p_count loop
    insert into asset_tags (code, status, batch_id, printed_at, created_by)
    values (next_tag_code(p_prefix), 'untagged', new_batch, now(), me);
  end loop;

  return query
    select t.batch_id, t.code from asset_tags t
    where t.batch_id = new_batch order by t.code;
end $$;

-- ---------------------------------------------------------------------------
-- scan_tag() — what the camera calls. One round trip answers every state the
-- scanner screen has to handle, so it never has to guess.
-- ---------------------------------------------------------------------------
create or replace function scan_tag(p_code text)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare t asset_tags%rowtype; a assets%rowtype;
begin
  select * into t from asset_tags where code = upper(btrim(p_code));
  if not found then
    -- A sticker this system never issued. Saying so plainly is important:
    -- silently offering to register it would let a stray label into the register.
    return jsonb_build_object('found', false, 'code', upper(btrim(p_code)));
  end if;

  if t.status = 'tagged' then
    select * into a from assets where id = t.asset_id;
    -- RLS may hide the asset even though the tag row is readable.
    if not found then
      return jsonb_build_object(
        'found', true, 'code', t.code, 'status', 'tagged', 'outOfScope', true);
    end if;
    return jsonb_build_object(
      'found', true, 'code', t.code, 'status', 'tagged', 'outOfScope', false,
      'assetId', a.id, 'assetCode', a.asset_code, 'assetName', a.name,
      'statusName', (select name from asset_statuses where id = a.status_id),
      'locationName', (select name from locations where id = a.location_id),
      'holderName', (select full_name from accounts where id = a.assigned_to));
  end if;

  return jsonb_build_object(
    'found', true, 'code', t.code, 'status', t.status::text, 'outOfScope', false);
end $$;

-- ---------------------------------------------------------------------------
-- tag_asset() — the moment a blank sticker becomes an asset.
--
-- Creates the asset and claims the tag in ONE transaction. Doing it in two
-- steps from the client would allow a half-tagged sticker: a physical label on
-- a device with no record behind it, which is exactly the state this table
-- exists to make impossible.
-- ---------------------------------------------------------------------------
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
    asset_id  = (created->>'id')::uuid,
    tagged_at = now(),
    tagged_by = me
  where id = t.id;

  return created || jsonb_build_object('tagCode', t.code);
end $$;

-- ---------------------------------------------------------------------------
-- void_tag() — a damaged or mis-applied sticker. The row stays: which codes
-- were issued and what became of them is exactly the audit question this
-- table answers.
-- ---------------------------------------------------------------------------
create or replace function void_tag(p_code text, p_reason text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare t asset_tags%rowtype;
begin
  if not can_write_assets() then
    raise exception 'You do not have permission to void a label' using errcode = 'P0001';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'Say why the label is being voided' using errcode = 'P0001';
  end if;

  select * into t from asset_tags where code = upper(btrim(p_code));
  if not found then
    raise exception 'That label is not one of ours' using errcode = 'P0001';
  end if;
  if t.status = 'tagged' then
    raise exception 'Detach the label from its asset before voiding it' using errcode = 'P0001';
  end if;

  update asset_tags set
    status      = 'void',
    void_reason = btrim(p_reason),
    voided_at   = now(),
    voided_by   = my_account_id()
  where id = t.id;

  return jsonb_build_object('code', t.code, 'status', 'void');
end $$;

-- ---------------------------------------------------------------------------
-- Reading the stock of labels, for the batch list and the "n untagged" line.
-- ---------------------------------------------------------------------------
create or replace function tag_stock()
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'untagged', count(*) filter (where status = 'untagged'),
    'tagged',   count(*) filter (where status = 'tagged'),
    'void',     count(*) filter (where status = 'void'),
    'total',    count(*)
  ) from asset_tags;
$$;

create or replace function list_tags(p_status text default null, p_batch uuid default null)
returns table (
  id uuid, code text, status tag_status, batch_id uuid,
  asset_code text, asset_name text, tagged_at timestamptz, created_at timestamptz
)
language sql stable security invoker set search_path = public as $$
  select t.id, t.code, t.status, t.batch_id, a.asset_code, a.name, t.tagged_at, t.created_at
  from asset_tags t
  left join assets a on a.id = t.asset_id
  where (p_status is null or t.status::text = p_status)
    and (p_batch is null or t.batch_id = p_batch)
  order by t.code;
$$;

-- ---------------------------------------------------------------------------
-- RLS. Tags are readable by every signed-in user — a scanner has to be able to
-- resolve a code before it knows whether the asset behind it is in scope, and
-- scan_tag() withholds the asset details when RLS hides the asset itself.
-- ---------------------------------------------------------------------------
alter table asset_tags enable row level security;

create policy tags_read on asset_tags for select using (auth.uid() is not null);
create policy tags_write on asset_tags for insert with check (can_write_assets());
create policy tags_update on asset_tags for update using (can_write_assets());

grant select, insert, update on asset_tags to authenticated;
-- Deleting a tag would erase the record of a sticker that physically exists.
revoke delete on asset_tags from anon, authenticated;
-- The counter is only ever touched by next_tag_code(), which is SECURITY DEFINER.

revoke all on function next_tag_code(text)                        from anon, authenticated;
revoke all on function create_tag_batch(int, text)                from anon, authenticated;
revoke all on function scan_tag(text)                             from anon, authenticated;
revoke all on function void_tag(text, text)                       from anon, authenticated;
revoke all on function tag_stock()                                from anon, authenticated;
revoke all on function list_tags(text, uuid)                      from anon, authenticated;
revoke all on function tag_asset(
  text, text, uuid, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid,
  date, numeric, date, date, jsonb, text, text
) from anon, authenticated;

grant execute on function create_tag_batch(int, text)             to authenticated;
grant execute on function scan_tag(text)                          to authenticated;
grant execute on function void_tag(text, text)                    to authenticated;
grant execute on function tag_stock()                             to authenticated;
grant execute on function list_tags(text, uuid)                   to authenticated;
grant execute on function tag_asset(
  text, text, uuid, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid,
  date, numeric, date, date, jsonb, text, text
) to authenticated;
