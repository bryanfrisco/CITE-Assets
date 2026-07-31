-- ============================================================================
-- CITE Assets — 0017 Account management
--
-- Client instruction, 2026-07-30:
--   "nanti barulah saat bikin akun akunnya bisa di custom apakah akunnya dapat
--    di loginkan atau tidak. jadi admin rolenya superadmin, sedangkan yang lain
--    bisa admin saja atau rolenya"
--
-- TWO KINDS OF ACCOUNT, ONE TABLE
-- ------------------------------
-- `accounts` already held both from the start: people who merely receive assets
-- (can_login = false, no role) and people who use the app (can_login = true,
-- with a role). This migration gives that distinction a way in from the app.
--
-- can_login = true with no auth user yet is a real, useful state: it is an
-- account WAITING for credentials, and it is exactly what
-- link_auth_user_to_account() (migration 0004) claims when the auth user is
-- finally created. Nothing here creates auth users — that needs the service
-- role, which the app must never hold. The manage-account Edge Function does
-- it, and this migration is what tells that function whether the caller is
-- allowed to ask.
--
-- THE ONE INVARIANT THAT MATTERS
-- ------------------------------
-- The last active Super Admin cannot be demoted, deactivated, or stripped of
-- login. Not as a courtesy — without it a single mistap makes the system
-- unadministrable, and the only way back is a psql session against production.
-- The database is the right place for that rule because it is the only place
-- that can see all the other accounts at once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- accounts_list() — the management screen.
--
-- Everyone signed in can already read `accounts` (policy accounts_read), which
-- is what makes the assign picker work. This adds the joined shape and the
-- login state, and is still readable by anyone: hiding the list from Site IT
-- would break nothing and reveal nothing they cannot already query.
-- ---------------------------------------------------------------------------
create or replace function accounts_list(p_search text default null)
returns table (
  id uuid, full_name text, nik text, email text, phone text,
  department_id uuid, department_name text,
  location_id uuid, location_name text,
  role user_role, can_login boolean, has_credentials boolean, is_active boolean,
  is_me boolean
)
language sql stable security invoker set search_path = public as $$
  select
    a.id, a.full_name, a.nik, a.email, a.phone,
    a.department_id, d.name,
    a.location_id, l.name,
    a.role, a.can_login,
    a.auth_user_id is not null,
    a.is_active,
    a.id = my_account_id()
  from accounts a
  left join departments d on d.id = a.department_id
  left join locations   l on l.id = a.location_id
  where p_search is null
     or btrim(p_search) = ''
     or a.full_name ilike '%' || btrim(p_search) || '%'
     or coalesce(a.nik, '')   ilike '%' || btrim(p_search) || '%'
     or coalesce(a.email, '') ilike '%' || btrim(p_search) || '%'
  order by a.is_active desc, a.full_name;
$$;

-- ---------------------------------------------------------------------------
-- Guard shared by every write below.
-- ---------------------------------------------------------------------------
create or replace function assert_can_manage_accounts() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if my_role() is distinct from 'super_admin' then
    raise exception 'Only a Super Admin can manage accounts' using errcode = 'P0001';
  end if;
end $$;

/**
 * Would this change leave nobody able to administer the system?
 *
 * Counts Super Admins that are active, may log in, and are not the account
 * being changed. Zero means the change must be refused.
 */
create or replace function other_super_admins(p_except uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from accounts
   where role = 'super_admin' and is_active and can_login and id is distinct from p_except;
$$;

-- ---------------------------------------------------------------------------
-- create_account() — a person, with or without a login.
-- ---------------------------------------------------------------------------
create or replace function create_account(
  p_full_name  text,
  p_nik        text default null,
  p_email      text default null,
  p_phone      text default null,
  p_department uuid default null,
  p_location   uuid default null,
  p_role       text default null,
  p_can_login  boolean default false
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

  -- The CHECK constraint would catch this, but its message is a constraint
  -- name. Someone filling in a form deserves the sentence.
  if p_can_login and r is null then
    raise exception 'Choose a role before this account can log in' using errcode = 'P0001';
  end if;
  if p_can_login and coalesce(btrim(p_email), '') = '' then
    raise exception 'An email address is required for an account that logs in'
      using errcode = 'P0001';
  end if;

  -- Site IT and Viewer are scoped to one location by my_location_ids(); an
  -- account with neither role nor location would see nothing at all.
  if r in ('site_it', 'viewer') and p_location is null then
    raise exception 'Choose a location — this role only sees its own'
      using errcode = 'P0001';
  end if;

  insert into accounts (
    full_name, nik, email, phone, department_id, location_id, role, can_login, created_by
  ) values (
    btrim(p_full_name),
    nullif(btrim(coalesce(p_nik, '')), ''),
    nullif(lower(btrim(coalesce(p_email, ''))), ''),
    nullif(btrim(coalesce(p_phone, '')), ''),
    p_department, p_location, r, coalesce(p_can_login, false),
    my_account_id()
  ) returning id into new_id;

  return jsonb_build_object('id', new_id, 'canLogin', coalesce(p_can_login, false));
exception
  when unique_violation then
    raise exception 'That NIK or email is already on another account' using errcode = 'P0001';
end $$;

-- ---------------------------------------------------------------------------
-- update_account() — same fields, plus the two switches.
--
-- Turning can_login OFF does not by itself remove the credentials; the Edge
-- Function deletes the auth user. Both halves are needed and the app calls the
-- function, which calls this. Doing it the other way round would leave a
-- window where the account cannot log in but the password still works.
-- ---------------------------------------------------------------------------
create or replace function update_account(
  p_id         uuid,
  p_full_name  text,
  p_nik        text default null,
  p_email      text default null,
  p_phone      text default null,
  p_department uuid default null,
  p_location   uuid default null,
  p_role       text default null,
  p_can_login  boolean default null,
  p_is_active  boolean default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a          accounts%rowtype;
  r          user_role;
  next_login boolean;
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

  -- See the header. This is the rule that keeps the system administrable.
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
    department_id = coalesce(p_department, a.department_id),
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

-- ---------------------------------------------------------------------------
-- Called by the manage-account Edge Function once it has created or deleted
-- the auth user. Separate from update_account() so the function can do the two
-- halves in the right order without re-sending the whole form.
-- ---------------------------------------------------------------------------
create or replace function set_account_login(p_id uuid, p_can_login boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts%rowtype;
begin
  perform assert_can_manage_accounts();

  select * into a from accounts where id = p_id;
  if not found then
    raise exception 'Account not found' using errcode = 'P0001';
  end if;

  if p_can_login and a.role is null then
    raise exception 'Choose a role before this account can log in' using errcode = 'P0001';
  end if;
  if p_can_login and coalesce(a.email, '') = '' then
    raise exception 'An email address is required for an account that logs in'
      using errcode = 'P0001';
  end if;
  if not p_can_login and a.role = 'super_admin' and other_super_admins(a.id) = 0 then
    raise exception 'This is the only Super Admin left — give someone else the role first'
      using errcode = 'P0001';
  end if;

  update accounts set can_login = p_can_login where id = p_id;
  return jsonb_build_object('id', p_id, 'canLogin', p_can_login);
end $$;

-- ---------------------------------------------------------------------------
-- The Edge Function needs one fact under the caller's own token before it
-- reaches for the service role: may this person manage accounts at all, and
-- which email is it acting on. Returning both in one call keeps the function
-- from having to trust anything the client sent.
-- ---------------------------------------------------------------------------
create or replace function account_for_credentials(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a accounts%rowtype;
begin
  perform assert_can_manage_accounts();

  select * into a from accounts where id = p_id;
  if not found then
    raise exception 'Account not found' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'id', a.id,
    'email', a.email,
    'fullName', a.full_name,
    'role', a.role,
    'authUserId', a.auth_user_id,
    'canLogin', a.can_login,
    'isActive', a.is_active,
    'lastSuperAdmin', a.role = 'super_admin' and other_super_admins(a.id) = 0
  );
end $$;

revoke all on function accounts_list(text)                          from anon, authenticated;
revoke all on function assert_can_manage_accounts()                 from anon, authenticated;
revoke all on function other_super_admins(uuid)                     from anon, authenticated;
revoke all on function create_account(text, text, text, text, uuid, uuid, text, boolean)
  from anon, authenticated;
revoke all on function update_account(uuid, text, text, text, text, uuid, uuid, text, boolean, boolean)
  from anon, authenticated;
revoke all on function set_account_login(uuid, boolean)             from anon, authenticated;
revoke all on function account_for_credentials(uuid)                from anon, authenticated;

grant execute on function accounts_list(text)                       to authenticated;
grant execute on function create_account(text, text, text, text, uuid, uuid, text, boolean)
  to authenticated;
grant execute on function update_account(uuid, text, text, text, text, uuid, uuid, text, boolean, boolean)
  to authenticated;
grant execute on function set_account_login(uuid, boolean)          to authenticated;
grant execute on function account_for_credentials(uuid)             to authenticated;

-- ---------------------------------------------------------------------------
-- Direct writes to `accounts` are withdrawn.
--
-- The policy accounts_write already limited them to a Super Admin, but a Super
-- Admin writing the row directly would skip the last-Super-Admin guard and the
-- role/email checks above — and those are the rules that keep the system
-- usable. Every path now goes through the functions (working rule #2).
-- ---------------------------------------------------------------------------
revoke insert, update, delete on accounts from anon, authenticated;
