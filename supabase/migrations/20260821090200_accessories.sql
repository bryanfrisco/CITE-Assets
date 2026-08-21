-- ============================================================================
-- CITE Assets — 0045 Accessories
--
-- THE HOLE THIS FILLS
-- -------------------
-- assets.serial_number is NOT NULL UNIQUE, so a mouse, a keyboard or a cable
-- cannot be registered at all. PANDUAN-PENGGUNA.md admits as much: "barang
-- seperti itu tidak punya serial dan tidak perlu didaftar. Mereka hanya ada di
-- kertas." The consequence is that nobody knows how many mice are left.
--
-- So accessories are counted, not identified: a row is a KIND of thing with a
-- quantity, and handing one out decrements what is available.
--
-- AVAILABLE IS NEVER STORED
-- -------------------------
-- available = total_qty - sum(active checkouts). Keeping a second copy of that
-- number is how stock figures start to drift, and a drifting figure is worse
-- than no figure because people trust it.
--
-- ONE ROW PER LOCATION
-- --------------------
-- unique (name, location_id): "Logitech M170" at Head Office and the same
-- mouse at Site are two rows with two stocks. That is what makes the scope
-- selector work on this screen for free — RLS filters on location_id exactly
-- as it does for assets, so Site IT sees and spends only Site stock.
--
-- min_qty exists but nothing reads it yet. The client said low-stock warnings
-- are not needed; the column is here so adding them later is a screen change
-- and not a migration.
-- ============================================================================

create table if not exists accessories (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  category_id    uuid not null references categories(id) on delete restrict,
  brand_id       uuid references brands(id) on delete restrict,
  model_no       text,
  vendor_id      uuid references vendors(id) on delete restrict,
  location_id    uuid not null references locations(id) on delete restrict,
  total_qty      int not null default 0 check (total_qty >= 0),
  min_qty        int not null default 0 check (min_qty >= 0),
  purchase_date  date,
  purchase_price numeric(16,2),                 -- per unit, not for the batch
  notes          text,
  photo_path     text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references accounts(id),
  unique (name, location_id)
);

create index if not exists accessories_location_idx on accessories(location_id);
create index if not exists accessories_category_idx on accessories(category_id);

create table if not exists accessory_checkouts (
  id            uuid primary key default gen_random_uuid(),
  accessory_id  uuid not null references accessories(id) on delete restrict,
  account_id    uuid not null references accounts(id) on delete restrict,
  qty           int not null check (qty > 0),
  assigned_date date not null default current_date,
  returned_date date,
  state         assignment_state not null default 'active',
  bast_id       uuid references bast(id) on delete set null,
  notes         text,
  created_at    timestamptz not null default now(),
  created_by    uuid references accounts(id),
  check (returned_date is null or returned_date >= assigned_date)
);

create index if not exists accessory_checkouts_active_idx
  on accessory_checkouts(accessory_id) where state = 'active';
create index if not exists accessory_checkouts_account_idx
  on accessory_checkouts(account_id);

-- ---------------------------------------------------------------------------
-- RLS. Same shape as assets: everything resolves through location_id.
-- ---------------------------------------------------------------------------
alter table accessories         enable row level security;
alter table accessory_checkouts enable row level security;

create policy accessories_read on accessories for select
  using (location_id in (select my_location_ids()));
create policy accessories_write on accessories for insert
  with check (can_write_assets() and location_id in (select my_location_ids()));
create policy accessories_update on accessories for update
  using (can_write_assets() and location_id in (select my_location_ids()));
create policy accessories_delete on accessories for delete
  using (my_role() = 'super_admin' and location_id in (select my_location_ids()));

create policy accessory_checkouts_read on accessory_checkouts for select
  using (exists (select 1 from accessories x
                  where x.id = accessory_id
                    and x.location_id in (select my_location_ids())));
create policy accessory_checkouts_write on accessory_checkouts for insert
  with check (can_write_assets() and exists (
    select 1 from accessories x
     where x.id = accessory_id and x.location_id in (select my_location_ids())));
create policy accessory_checkouts_update on accessory_checkouts for update
  using (can_write_assets() and exists (
    select 1 from accessories x
     where x.id = accessory_id and x.location_id in (select my_location_ids())));

grant select, insert, update, delete on accessories to authenticated;
grant select, insert, update on accessory_checkouts to authenticated;

-- The audit log is not optional for anything that leaves the store.
create trigger accessories_audit after insert or update on accessories
  for each row execute function audit_row('accessory_created', 'accessory_updated');
create trigger accessory_checkouts_audit after insert or update on accessory_checkouts
  for each row execute function audit_row('accessory_assigned', 'accessory_returned');

-- ---------------------------------------------------------------------------
-- How many are on the shelf. One definition, used by every caller.
-- ---------------------------------------------------------------------------
create or replace function accessory_available(p_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select greatest(
    0,
    coalesce((select total_qty from accessories where id = p_id), 0)
    - coalesce((select sum(qty) from accessory_checkouts
                 where accessory_id = p_id and state = 'active'), 0)
  )::int;
$$;

-- ---------------------------------------------------------------------------
-- The register.
-- ---------------------------------------------------------------------------
create or replace function accessories_list(
  p_locations uuid[],
  p_query     text default null,
  p_category  uuid default null
) returns table (
  id uuid, name text, category_id uuid, category_name text, brand_name text,
  model_no text, location_id uuid, location_name text,
  total_qty int, assigned_qty int, available_qty int,
  min_qty int, is_active boolean
)
language sql stable security invoker set search_path = public as $$
  select
    a.id, a.name, a.category_id, c.name, b.name, a.model_no,
    a.location_id, l.name,
    a.total_qty,
    (a.total_qty - accessory_available(a.id))::int,
    accessory_available(a.id),
    a.min_qty, a.is_active
  from accessories a
  join categories c on c.id = a.category_id
  join locations  l on l.id = a.location_id
  left join brands b on b.id = a.brand_id
  where a.location_id = any (p_locations)
    and (p_category is null or a.category_id = p_category)
    and (
      p_query is null or btrim(p_query) = ''
      or a.name          ilike '%' || btrim(p_query) || '%'
      or a.model_no      ilike '%' || btrim(p_query) || '%'
      or coalesce(b.name, '') ilike '%' || btrim(p_query) || '%'
    )
  order by a.name;
$$;

create or replace function accessory_detail(p_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare a accessories%rowtype;
begin
  select * into a from accessories where id = p_id;
  if not found then
    -- Either it does not exist or RLS hid it. Same answer either way, which is
    -- the correct thing to leak.
    return null;
  end if;

  return jsonb_build_object(
    'accessory', jsonb_build_object(
      'id', a.id,
      'name', a.name,
      'categoryId', a.category_id,
      'categoryName', (select name from categories where id = a.category_id),
      'categoryIcon', (select icon from categories where id = a.category_id),
      'brandId', a.brand_id,
      'brandName', (select name from brands where id = a.brand_id),
      'modelNo', a.model_no,
      'vendorId', a.vendor_id,
      'vendorName', (select name from vendors where id = a.vendor_id),
      'locationId', a.location_id,
      'locationName', (select name from locations where id = a.location_id),
      'totalQty', a.total_qty,
      'availableQty', accessory_available(a.id),
      'assignedQty', a.total_qty - accessory_available(a.id),
      'minQty', a.min_qty,
      'purchaseDate', a.purchase_date,
      'purchasePrice', a.purchase_price,
      'notes', a.notes,
      'isActive', a.is_active
    ),
    'history', (
      select coalesce(jsonb_agg(h order by h->>'assignedDate' desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'id', co.id,
          'accountId', co.account_id,
          'accountName', acc.full_name,
          'qty', co.qty,
          'assignedDate', co.assigned_date,
          'returnedDate', co.returned_date,
          'state', co.state,
          'bastId', co.bast_id,
          'bastNumber', (select bast_number from bast where id = co.bast_id),
          'notes', co.notes
        ) as h
        from accessory_checkouts co
        join accounts acc on acc.id = co.account_id
        where co.accessory_id = p_id
      ) s
    )
  );
end $$;

-- ---------------------------------------------------------------------------
-- Create / edit. SECURITY DEFINER, so the guards RLS would have applied are
-- re-stated (DATABASE.md §11).
-- ---------------------------------------------------------------------------
create or replace function create_accessory(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  new_id   uuid;
  v_name   text := btrim(coalesce(p_input->>'name', ''));
  v_loc    uuid := nullif(p_input->>'locationId', '')::uuid;
  v_cat    uuid := nullif(p_input->>'categoryId', '')::uuid;
  v_total  int  := coalesce((p_input->>'totalQty')::int, 0);
begin
  if not can_write_assets() then
    raise exception 'You do not have permission to add accessories' using errcode = 'P0001';
  end if;
  if v_name = '' then
    raise exception 'Enter a name first' using errcode = 'P0001';
  end if;
  if v_cat is null then
    raise exception 'Choose a category' using errcode = 'P0001';
  end if;
  if v_loc is null or v_loc not in (select my_location_ids()) then
    raise exception 'Choose a location you can write to' using errcode = 'P0001';
  end if;
  if v_total < 0 then
    raise exception 'Quantity cannot be negative' using errcode = 'P0001';
  end if;

  if exists (select 1 from accessories
              where location_id = v_loc and lower(name) = lower(v_name)) then
    raise exception '"%" already exists at that location', v_name using errcode = 'P0001';
  end if;

  insert into accessories (
    name, category_id, brand_id, model_no, vendor_id, location_id,
    total_qty, min_qty, purchase_date, purchase_price, notes, created_by
  ) values (
    v_name, v_cat,
    nullif(p_input->>'brandId', '')::uuid,
    nullif(btrim(coalesce(p_input->>'modelNo', '')), ''),
    nullif(p_input->>'vendorId', '')::uuid,
    v_loc,
    v_total,
    coalesce((p_input->>'minQty')::int, 0),
    nullif(p_input->>'purchaseDate', '')::date,
    nullif(p_input->>'purchasePrice', '')::numeric,
    nullif(btrim(coalesce(p_input->>'notes', '')), ''),
    my_account_id()
  ) returning id into new_id;

  return jsonb_build_object('id', new_id, 'name', v_name);
end $$;

create or replace function update_accessory(p_id uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a       accessories%rowtype;
  v_total int;
  out_now int;
begin
  select * into a from accessories where id = p_id;
  if not found then
    raise exception 'Accessory not found' using errcode = 'P0001';
  end if;
  if not can_write_assets() or a.location_id not in (select my_location_ids()) then
    raise exception 'You do not have permission to change this accessory'
      using errcode = 'P0001';
  end if;

  v_total := coalesce((p_input->>'totalQty')::int, a.total_qty);
  out_now := a.total_qty - accessory_available(p_id);

  -- Lowering the total below what is already out would make available go
  -- negative, i.e. the register would claim stock that people are holding.
  if v_total < out_now then
    raise exception 'Cannot go below % — that many are still out', out_now
      using errcode = 'P0001';
  end if;

  update accessories set
    name           = btrim(coalesce(p_input->>'name', a.name)),
    category_id    = coalesce(nullif(p_input->>'categoryId', '')::uuid, a.category_id),
    brand_id       = coalesce(nullif(p_input->>'brandId', '')::uuid, a.brand_id),
    model_no       = coalesce(nullif(btrim(coalesce(p_input->>'modelNo', '')), ''), a.model_no),
    vendor_id      = coalesce(nullif(p_input->>'vendorId', '')::uuid, a.vendor_id),
    total_qty      = v_total,
    min_qty        = coalesce((p_input->>'minQty')::int, a.min_qty),
    purchase_date  = coalesce(nullif(p_input->>'purchaseDate', '')::date, a.purchase_date),
    purchase_price = coalesce(nullif(p_input->>'purchasePrice', '')::numeric, a.purchase_price),
    notes          = coalesce(nullif(btrim(coalesce(p_input->>'notes', '')), ''), a.notes),
    is_active      = coalesce((p_input->>'isActive')::boolean, a.is_active),
    updated_at     = now()
  where id = p_id;

  return jsonb_build_object('id', p_id);
end $$;

-- ---------------------------------------------------------------------------
-- Assign / Return. The words are the ones the rest of the app uses; Snipe-IT
-- calls them check out and check in, and learning two vocabularies for one
-- idea is a cost with no return.
-- ---------------------------------------------------------------------------
create or replace function assign_accessory(
  p_accessory uuid,
  p_account   uuid,
  p_qty       int,
  p_date      date default current_date,
  p_notes     text default null,
  p_bast      uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a     accessories%rowtype;
  free  int;
  new_id uuid;
  who   text;
begin
  select * into a from accessories where id = p_accessory;
  if not found then
    raise exception 'Accessory not found' using errcode = 'P0001';
  end if;
  if not can_write_assets() or a.location_id not in (select my_location_ids()) then
    raise exception 'You do not have permission to hand this out' using errcode = 'P0001';
  end if;
  if not a.is_active then
    raise exception '% is no longer in use', a.name using errcode = 'P0001';
  end if;

  select full_name into who from accounts where id = p_account and is_active;
  if who is null then
    raise exception 'Choose someone to give it to' using errcode = 'P0001';
  end if;

  if coalesce(p_qty, 0) < 1 then
    raise exception 'How many?' using errcode = 'P0001';
  end if;

  free := accessory_available(p_accessory);
  if p_qty > free then
    raise exception 'Only % left at %', free,
      (select name from locations where id = a.location_id) using errcode = 'P0001';
  end if;

  insert into accessory_checkouts (
    accessory_id, account_id, qty, assigned_date, notes, bast_id, created_by
  ) values (
    p_accessory, p_account, p_qty, coalesce(p_date, current_date),
    nullif(btrim(coalesce(p_notes, '')), ''), p_bast, my_account_id()
  ) returning id into new_id;

  return jsonb_build_object(
    'checkoutId', new_id,
    'accessoryName', a.name,
    'accountName', who,
    'qty', p_qty,
    'availableQty', accessory_available(p_accessory)
  );
end $$;

create or replace function return_accessory(
  p_checkout uuid,
  p_date     date default current_date
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  co accessory_checkouts%rowtype;
  a  accessories%rowtype;
begin
  select * into co from accessory_checkouts where id = p_checkout;
  if not found then
    raise exception 'That hand-out was not found' using errcode = 'P0001';
  end if;
  select * into a from accessories where id = co.accessory_id;
  if not can_write_assets() or a.location_id not in (select my_location_ids()) then
    raise exception 'You do not have permission to take this back' using errcode = 'P0001';
  end if;
  if co.state = 'returned' then
    raise exception 'That has already been returned' using errcode = 'P0001';
  end if;
  if coalesce(p_date, current_date) < co.assigned_date then
    raise exception 'It cannot come back before it went out' using errcode = 'P0001';
  end if;

  update accessory_checkouts
     set state = 'returned', returned_date = coalesce(p_date, current_date)
   where id = p_checkout;

  return jsonb_build_object(
    'checkoutId', p_checkout,
    'accessoryName', a.name,
    'qty', co.qty,
    'availableQty', accessory_available(co.accessory_id)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Grants. REVOKE names public as well as the roles: granting EXECUTE to
-- `authenticated` alone leaves the implicit PUBLIC grant in place, which is
-- not a lockdown at all.
-- ---------------------------------------------------------------------------
revoke all on function accessory_available(uuid)                        from public, anon, authenticated;
revoke all on function accessories_list(uuid[], text, uuid)             from public, anon, authenticated;
revoke all on function accessory_detail(uuid)                           from public, anon, authenticated;
revoke all on function create_accessory(jsonb)                          from public, anon, authenticated;
revoke all on function update_accessory(uuid, jsonb)                    from public, anon, authenticated;
revoke all on function assign_accessory(uuid, uuid, int, date, text, uuid) from public, anon, authenticated;
revoke all on function return_accessory(uuid, date)                     from public, anon, authenticated;

grant execute on function accessory_available(uuid)                        to authenticated;
grant execute on function accessories_list(uuid[], text, uuid)             to authenticated;
grant execute on function accessory_detail(uuid)                           to authenticated;
grant execute on function create_accessory(jsonb)                          to authenticated;
grant execute on function update_accessory(uuid, jsonb)                    to authenticated;
grant execute on function assign_accessory(uuid, uuid, int, date, text, uuid) to authenticated;
grant execute on function return_accessory(uuid, date)                     to authenticated;
