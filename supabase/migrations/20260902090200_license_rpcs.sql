-- ============================================================================
-- CITE Assets — 0064 Licence RPCs
--
-- Every write goes through here. The tables carry no insert/update/delete
-- grant, so these `security definer` functions are the only door, and each one
-- repeats its own role check rather than trusting the caller to have been
-- filtered already.
--
-- Writing licences is Corporate IT and above. Site IT can read the register —
-- it needs to know which seats are free — but software is bought centrally, so
-- it does not get to change it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- One definition of "is this licence about to run out", used by the list, the
-- detail screen and the notifications. Three callers agreeing by construction
-- rather than by coincidence.
-- ---------------------------------------------------------------------------
create or replace function license_expiry_state(p_date date)
returns text language sql immutable set search_path = public as $$
  select case
    when p_date is null                          then 'none'
    when p_date <  current_date                  then 'expired'
    when p_date <= current_date + interval '60 days' then 'expiring'
    else 'ok'
  end;
$$;

create or replace function can_write_licenses()
returns boolean language sql stable security definer set search_path = public as $$
  select my_role() in ('super_admin', 'corporate_it');
$$;

-- ---------------------------------------------------------------------------
-- The register.
-- ---------------------------------------------------------------------------
create or replace function licenses_list(
  p_query    text default null,
  p_category uuid default null,
  p_status   text default null      -- 'available' | 'expiring' | 'expired'
) returns table (
  id uuid, software text, license_number text,
  category_id uuid, category_name text,
  vendor_name text, purchase_year int,
  expiry_date date, expiry_state text,
  total_seats int, used_seats int, available_seats int,
  is_active boolean
)
language sql stable security invoker set search_path = public as $$
  with counted as (
    select
      l.*,
      (select count(*) from license_seats s where s.license_id = l.id)::int as total_seats,
      (select count(*) from license_seats s
        where s.license_id = l.id and s.account_id is not null)::int as used_seats
    from licenses l
  )
  select
    c.id, c.software, c.license_number,
    c.category_id, cat.name,
    v.name, c.purchase_year,
    c.expiry_date, license_expiry_state(c.expiry_date),
    c.total_seats, c.used_seats, (c.total_seats - c.used_seats),
    c.is_active
  from counted c
  join license_categories cat on cat.id = c.category_id
  left join vendors v on v.id = c.vendor_id
  where (p_category is null or c.category_id = p_category)
    and (
      p_query is null or btrim(p_query) = ''
      or c.software                       ilike '%' || btrim(p_query) || '%'
      or coalesce(c.license_number, '')   ilike '%' || btrim(p_query) || '%'
      or coalesce(v.name, '')             ilike '%' || btrim(p_query) || '%'
    )
    and (
      p_status is null
      or (p_status = 'available' and c.total_seats > c.used_seats)
      or (p_status = 'expiring'  and license_expiry_state(c.expiry_date) = 'expiring')
      or (p_status = 'expired'   and license_expiry_state(c.expiry_date) = 'expired')
    )
  order by c.software;
$$;

-- ---------------------------------------------------------------------------
-- One licence and its seats.
--
-- `seat_secret` is NOT in the projection. Not returned-and-hidden — never sent.
-- What comes back is `has_secret`, a boolean, so the screen can decide whether
-- to offer a Reveal button without the value ever crossing the wire.
-- ---------------------------------------------------------------------------
create or replace function license_detail(p_id uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'id',             l.id,
    'software',       l.software,
    'license_number', l.license_number,
    'category_id',    l.category_id,
    'category_name',  cat.name,
    'vendor_id',      l.vendor_id,
    'vendor_name',    v.name,
    'purchase_year',  l.purchase_year,
    'expiry_date',    l.expiry_date,
    'expiry_state',   license_expiry_state(l.expiry_date),
    'notes',          l.notes,
    'is_active',      l.is_active,
    'seats', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',            s.id,
        'seat_account',  s.seat_account,
        'has_secret',    (s.seat_secret is not null and btrim(s.seat_secret) <> ''),
        'account_id',    s.account_id,
        'holder_name',   a.full_name,
        'holder_nik',    a.nik,
        'department',    d.name,
        'assigned_date', s.assigned_date,
        'notes',         s.notes,
        'status',        case when s.account_id is null then 'Standby' else 'Used' end
      ) order by (s.account_id is null), a.full_name nulls last, s.created_at)
      from license_seats s
      left join accounts a    on a.id = s.account_id
      left join departments d on d.id = a.department_id
      where s.license_id = l.id
    ), '[]'::jsonb)
  )
  from licenses l
  join license_categories cat on cat.id = l.category_id
  left join vendors v on v.id = l.vendor_id
  where l.id = p_id;
$$;

-- ---------------------------------------------------------------------------
-- Create and edit.
-- ---------------------------------------------------------------------------
create or replace function create_license(p_input jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_software text;
begin
  if not can_write_licenses() then
    raise exception 'Only Corporate IT and above can add a licence'
      using errcode = 'P0001';
  end if;

  v_software := btrim(coalesce(p_input ->> 'software', ''));
  if v_software = '' then
    raise exception 'Enter the software name first' using errcode = 'P0001';
  end if;
  if (p_input ->> 'category_id') is null then
    raise exception 'Pick a licence category first' using errcode = 'P0001';
  end if;

  insert into licenses (software, license_number, category_id, vendor_id,
                        purchase_year, expiry_date, notes, created_by)
  values (
    v_software,
    nullif(btrim(coalesce(p_input ->> 'license_number', '')), ''),
    (p_input ->> 'category_id')::uuid,
    nullif(p_input ->> 'vendor_id', '')::uuid,
    nullif(p_input ->> 'purchase_year', '')::int,
    nullif(p_input ->> 'expiry_date', '')::date,
    nullif(btrim(coalesce(p_input ->> 'notes', '')), ''),
    my_account_id()
  )
  returning id into v_id;

  return v_id;
end $$;

create or replace function update_license(p_id uuid, p_input jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_write_licenses() then
    raise exception 'Only Corporate IT and above can edit a licence'
      using errcode = 'P0001';
  end if;

  update licenses set
    software       = coalesce(nullif(btrim(coalesce(p_input ->> 'software', '')), ''), software),
    license_number = case when p_input ? 'license_number'
                          then nullif(btrim(coalesce(p_input ->> 'license_number', '')), '')
                          else license_number end,
    category_id    = coalesce(nullif(p_input ->> 'category_id', '')::uuid, category_id),
    vendor_id      = case when p_input ? 'vendor_id'
                          then nullif(p_input ->> 'vendor_id', '')::uuid else vendor_id end,
    purchase_year  = case when p_input ? 'purchase_year'
                          then nullif(p_input ->> 'purchase_year', '')::int else purchase_year end,
    expiry_date    = case when p_input ? 'expiry_date'
                          then nullif(p_input ->> 'expiry_date', '')::date else expiry_date end,
    notes          = case when p_input ? 'notes'
                          then nullif(btrim(coalesce(p_input ->> 'notes', '')), '') else notes end,
    is_active      = coalesce((p_input ->> 'is_active')::boolean, is_active),
    updated_at     = now()
  where id = p_id;

  if not found then
    raise exception 'That licence is gone' using errcode = 'P0001';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Deleting is for mistakes, not for history. A licence with somebody sitting in
-- a seat is refused, and the reason is recorded either way.
-- ---------------------------------------------------------------------------
create or replace function delete_license(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare l licenses; v_used int;
begin
  if my_role() <> 'super_admin' then
    raise exception 'Only a Super Admin can delete a licence' using errcode = 'P0001';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'Say why this licence is being deleted' using errcode = 'P0001';
  end if;

  select * into l from licenses where id = p_id;
  if not found then
    raise exception 'That licence is gone' using errcode = 'P0001';
  end if;

  select count(*) into v_used from license_seats
   where license_id = p_id and account_id is not null;
  if v_used > 0 then
    raise exception 'Return the % seat(s) still in use first', v_used
      using errcode = 'P0001';
  end if;

  insert into audit_log (action, table_name, record_id, target_label, old_value,
                         actor_id, actor_label)
  values (
    'license_deleted', 'licenses', p_id,
    l.software || coalesce(' · ' || l.license_number, ''),
    to_jsonb(l) || jsonb_build_object('reason', btrim(p_reason)),
    my_account_id(),
    coalesce((select coalesce(role::text, 'system') || ' · ' || full_name from v_me limit 1),
             'system')
  );

  delete from licenses where id = p_id;   -- seats go with it, by cascade
end $$;

-- ---------------------------------------------------------------------------
-- Seats. Adding and removing empty chairs.
-- ---------------------------------------------------------------------------
create or replace function set_license_seats(p_license uuid, p_count int)
returns int language plpgsql security definer set search_path = public as $$
declare v_total int; v_used int; v_add int;
begin
  if not can_write_licenses() then
    raise exception 'Only Corporate IT and above can change seat count'
      using errcode = 'P0001';
  end if;
  if p_count is null or p_count < 0 then
    raise exception 'Seat count cannot be negative' using errcode = 'P0001';
  end if;

  select count(*), count(*) filter (where account_id is not null)
    into v_total, v_used
    from license_seats where license_id = p_license;

  if p_count < v_used then
    raise exception 'Cannot drop below % — that many seats are in use', v_used
      using errcode = 'P0001';
  end if;

  if p_count > v_total then
    v_add := p_count - v_total;
    insert into license_seats (license_id, created_by)
    select p_license, my_account_id() from generate_series(1, v_add);
  elsif p_count < v_total then
    -- Only ever removes EMPTY seats, oldest-created last, and never enough of
    -- them to touch an occupied one — the guard above already proved there are
    -- at least p_count occupied-or-empty seats to keep.
    delete from license_seats
     where id in (
       select id from license_seats
        where license_id = p_license and account_id is null
        order by created_at desc
        limit (v_total - p_count)
     );
  end if;

  return p_count;
end $$;

create or replace function assign_seat(
  p_seat uuid, p_account uuid, p_date date default current_date
) returns void language plpgsql security definer set search_path = public as $$
declare v_holder text;
begin
  if not can_write_licenses() then
    raise exception 'Only Corporate IT and above can hand out a seat'
      using errcode = 'P0001';
  end if;

  select a.full_name into v_holder
    from license_seats s left join accounts a on a.id = s.account_id
   where s.id = p_seat and s.account_id is not null;

  if v_holder is not null then
    raise exception 'That seat is already with %', v_holder using errcode = 'P0001';
  end if;

  update license_seats
     set account_id = p_account,
         assigned_date = coalesce(p_date, current_date),
         updated_at = now()
   where id = p_seat;

  if not found then
    raise exception 'That seat is gone' using errcode = 'P0001';
  end if;
end $$;

create or replace function return_seat(p_seat uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_write_licenses() then
    raise exception 'Only Corporate IT and above can take a seat back'
      using errcode = 'P0001';
  end if;

  update license_seats
     set account_id = null, assigned_date = null, updated_at = now()
   where id = p_seat;

  if not found then
    raise exception 'That seat is gone' using errcode = 'P0001';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Reading a stored password.
--
-- The audit row is written BEFORE the value is returned, so there is no path
-- that reads the secret without leaving a trace — an exception on the way out
-- would still leave the record of the attempt.
--
-- This is access control, not encryption. Anyone who can read the database
-- directly (a backup, the service key) can read the column. That limitation is
-- written down in PANDUAN-PENGGUNA.md rather than hidden here.
-- ---------------------------------------------------------------------------
create or replace function reveal_seat_secret(p_seat uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_secret text; v_label text;
begin
  if my_role() <> 'super_admin' then
    raise exception 'Only a Super Admin can reveal a stored password'
      using errcode = 'P0001';
  end if;

  select s.seat_secret,
         l.software || coalesce(' · ' || s.seat_account, '')
    into v_secret, v_label
    from license_seats s join licenses l on l.id = s.license_id
   where s.id = p_seat;

  if not found then
    raise exception 'That seat is gone' using errcode = 'P0001';
  end if;

  insert into audit_log (action, table_name, record_id, target_label,
                         actor_id, actor_label)
  values (
    'license_secret_viewed', 'license_seats', p_seat, v_label,
    my_account_id(),
    coalesce((select coalesce(role::text, 'system') || ' · ' || full_name from v_me limit 1),
             'system')
  );

  return v_secret;
end $$;

-- ---------------------------------------------------------------------------
-- Grants. Read for everyone signed in, writes for the roles each one checks.
-- ---------------------------------------------------------------------------
revoke all on function licenses_list(text, uuid, text)      from public, anon;
revoke all on function license_detail(uuid)                 from public, anon;
revoke all on function create_license(jsonb)                from public, anon, authenticated;
revoke all on function update_license(uuid, jsonb)          from public, anon, authenticated;
revoke all on function delete_license(uuid, text)           from public, anon, authenticated;
revoke all on function set_license_seats(uuid, int)         from public, anon, authenticated;
revoke all on function assign_seat(uuid, uuid, date)        from public, anon, authenticated;
revoke all on function return_seat(uuid)                    from public, anon, authenticated;
revoke all on function reveal_seat_secret(uuid)             from public, anon, authenticated;
revoke all on function license_expiry_state(date)           from public, anon;
revoke all on function can_write_licenses()                 from public, anon;

grant execute on function licenses_list(text, uuid, text)   to authenticated;
grant execute on function license_detail(uuid)              to authenticated;
grant execute on function license_expiry_state(date)        to authenticated;
grant execute on function can_write_licenses()              to authenticated;
grant execute on function create_license(jsonb)             to authenticated;
grant execute on function update_license(uuid, jsonb)       to authenticated;
grant execute on function delete_license(uuid, text)        to authenticated;
grant execute on function set_license_seats(uuid, int)      to authenticated;
grant execute on function assign_seat(uuid, uuid, date)     to authenticated;
grant execute on function return_seat(uuid)                 to authenticated;
grant execute on function reveal_seat_secret(uuid)          to authenticated;
