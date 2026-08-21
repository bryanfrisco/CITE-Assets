-- ============================================================================
-- CITE Assets — 0052 A company somebody can actually set
--
-- Migration 0040 added accounts.company_id and the Company master entity, and
-- then only import_accounts() could ever write it. The Add a person form had no
-- field and neither account RPC had a parameter, so Master data honestly
-- reported every company as "used by 0 people" and there was no way to change
-- that by hand. An entity nobody can fill in is worse than no entity at all.
--
-- create_account() and update_account() CHANGE SIGNATURE, so they are dropped
-- before being recreated. `create or replace` would leave the old arity behind
-- as a second overload and PostgREST would refuse to choose between them —
-- exactly the failure migration 0029 exists to clean up after.
--
-- The new parameter goes LAST and defaults to null, so every existing named
-- call keeps working untouched.
--
-- On update, null means LEAVE IT ALONE rather than clear it, matching every
-- other field on that function. Clearing a company is done by picking a
-- different one, not by forgetting to send it.
-- ============================================================================

drop function if exists create_account(text, text, text, text, uuid, uuid, text, boolean, text);
drop function if exists update_account(uuid, text, text, text, text, uuid, uuid, text, boolean, boolean, text);

create function create_account(
  p_full_name  text,
  p_nik        text default null,
  p_email      text default null,
  p_phone      text default null,
  p_department uuid default null,
  p_location   uuid default null,
  p_role       text default null,
  p_can_login  boolean default false,
  p_job_title  text default null,
  p_company    uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare new_id uuid; r user_role;
begin
  perform assert_can_manage_accounts();

  if coalesce(btrim(p_full_name), '') = '' then
    raise exception 'A name is required' using errcode = 'P0001';
  end if;

  if p_role is not null and btrim(p_role) <> '' then
    begin
      r := p_role::user_role;
    exception when others then
      raise exception 'Unknown role' using errcode = 'P0001';
    end;
  end if;

  if p_can_login and r is null then
    raise exception 'Choose a role before this account can log in' using errcode = 'P0001';
  end if;
  if p_can_login and coalesce(btrim(p_email), '') = '' then
    raise exception 'An email address is required for an account that logs in'
      using errcode = 'P0001';
  end if;
  if r in ('site_it', 'viewer') and p_location is null then
    raise exception 'Choose a location — this role only sees its own'
      using errcode = 'P0001';
  end if;

  insert into accounts (
    full_name, nik, email, phone, job_title,
    department_id, location_id, company_id, role, can_login, created_by
  ) values (
    btrim(p_full_name),
    nullif(btrim(coalesce(p_nik, '')), ''),
    nullif(lower(btrim(coalesce(p_email, ''))), ''),
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_job_title, '')), ''),
    p_department, p_location, p_company, r, coalesce(p_can_login, false),
    my_account_id()
  ) returning id into new_id;

  return jsonb_build_object('id', new_id, 'canLogin', coalesce(p_can_login, false));
exception
  when unique_violation then
    raise exception 'That NIK or email is already on another account' using errcode = 'P0001';
end $$;

create function update_account(
  p_id         uuid,
  p_full_name  text,
  p_nik        text default null,
  p_email      text default null,
  p_phone      text default null,
  p_department uuid default null,
  p_location   uuid default null,
  p_role       text default null,
  p_can_login  boolean default null,
  p_is_active  boolean default null,
  p_job_title  text default null,
  p_company    uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a           accounts%rowtype;
  r           user_role;
  next_login  boolean;
  next_active boolean;
begin
  perform assert_can_manage_accounts();

  select * into a from accounts where id = p_id;
  if not found then
    raise exception 'Account not found' using errcode = 'P0001';
  end if;

  if p_role is not null and btrim(p_role) <> '' then
    begin
      r := p_role::user_role;
    exception when others then
      raise exception 'Unknown role' using errcode = 'P0001';
    end;
  end if;

  next_login  := coalesce(p_can_login, a.can_login);
  next_active := coalesce(p_is_active, a.is_active);

  if next_login and r is null then
    raise exception 'Choose a role before this account can log in' using errcode = 'P0001';
  end if;
  if next_login and coalesce(btrim(coalesce(p_email, a.email)), '') = '' then
    raise exception 'An email address is required for an account that logs in'
      using errcode = 'P0001';
  end if;
  if r in ('site_it', 'viewer') and coalesce(p_location, a.location_id) is null then
    raise exception 'Choose a location — this role only sees its own'
      using errcode = 'P0001';
  end if;

  -- The rule that keeps the system administrable, unchanged from 0017.
  if a.role = 'super_admin' and a.is_active and a.can_login then
    if (r is distinct from 'super_admin' or not next_login or not next_active)
       and other_super_admins(a.id) = 0 then
      raise exception
        'This is the only Super Admin left — give someone else the role first'
        using errcode = 'P0001';
    end if;
  end if;

  update accounts set
    full_name     = btrim(coalesce(p_full_name, a.full_name)),
    nik           = nullif(btrim(coalesce(p_nik, a.nik, '')), ''),
    email         = nullif(lower(btrim(coalesce(p_email, a.email, ''))), ''),
    phone         = nullif(btrim(coalesce(p_phone, a.phone, '')), ''),
    job_title     = nullif(btrim(coalesce(p_job_title, a.job_title, '')), ''),
    department_id = coalesce(p_department, a.department_id),
    company_id    = coalesce(p_company, a.company_id),
    location_id   = coalesce(p_location, a.location_id),
    role          = r,
    can_login     = next_login,
    is_active     = next_active
  where id = p_id;

  return jsonb_build_object('id', p_id, 'canLogin', next_login, 'isActive', next_active);
exception
  when unique_violation then
    raise exception 'That NIK or email is already on another account' using errcode = 'P0001';
end $$;

-- accounts_list() gains two columns, so it is dropped rather than replaced:
-- a RETURNS TABLE cannot grow a column in place.
drop function if exists accounts_list(text);

create function accounts_list(p_search text default null)
returns table (
  id uuid, full_name text, nik text, email text, phone text, job_title text,
  department_id uuid, department_name text,
  company_id uuid, company_name text,
  location_id uuid, location_name text,
  role user_role, can_login boolean, has_credentials boolean, is_active boolean,
  is_me boolean
)
language sql stable security invoker set search_path = public as $$
  select
    a.id, a.full_name, a.nik, a.email, a.phone, a.job_title,
    a.department_id, d.name,
    a.company_id, co.name,
    a.location_id, l.name,
    a.role, a.can_login,
    a.auth_user_id is not null,
    a.is_active,
    a.id = my_account_id()
  from accounts a
  left join departments d  on d.id  = a.department_id
  left join companies   co on co.id = a.company_id
  left join locations   l on l.id = a.location_id
  where p_search is null
     or btrim(p_search) = ''
     or a.full_name ilike '%' || btrim(p_search) || '%'
     or coalesce(a.nik, '')       ilike '%' || btrim(p_search) || '%'
     or coalesce(a.email, '')     ilike '%' || btrim(p_search) || '%'
     or coalesce(a.job_title, '') ilike '%' || btrim(p_search) || '%'
  order by a.is_active desc, a.full_name;
$$;

revoke all on function create_account(text, text, text, text, uuid, uuid, text, boolean, text, uuid)
  from public, anon, authenticated;
revoke all on function update_account(uuid, text, text, text, text, uuid, uuid, text, boolean, boolean, text, uuid)
  from public, anon, authenticated;
revoke all on function accounts_list(text) from public, anon, authenticated;

grant execute on function create_account(text, text, text, text, uuid, uuid, text, boolean, text, uuid)
  to authenticated;
grant execute on function update_account(uuid, text, text, text, text, uuid, uuid, text, boolean, boolean, text, uuid)
  to authenticated;
grant execute on function accounts_list(text) to authenticated;
