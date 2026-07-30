-- ============================================================================
-- CITE Assets — 0004 auth linkage & session bootstrap  (Phase 1)
--
-- Additive only. 0001–0003 have been applied and are never edited.
--
-- Covers IMPLEMENTATION_PLAN.md § Phase 1:
--   "Supabase Auth (email + password), `accounts` linked by `auth_user_id`,
--    session bootstrap that loads role + `account_scope_preferences`."
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Linking an auth user to its account.
--
-- Accounts are created by a Super Admin, not by self-service signup
-- (config.toml sets enable_signup = false). When the Super Admin later issues
-- credentials, the new auth.users row is matched to the waiting account by
-- email — an account must already exist and be marked can_login.
-- ---------------------------------------------------------------------------
create or replace function link_auth_user_to_account() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  update accounts
     set auth_user_id = new.id,
         updated_at   = now()
   where auth_user_id is null
     and can_login
     and lower(email) = lower(new.email);
  return new;
end $$;

create trigger auth_user_created
  after insert on auth.users
  for each row execute function link_auth_user_to_account();

-- ---------------------------------------------------------------------------
-- Session bootstrap — one round trip for everything the client needs at start:
-- the account, its role, and its persisted data scope.
--
-- security definer because it reads account_scope_preferences and locations on
-- behalf of a user whose RLS context is still being established.
-- ---------------------------------------------------------------------------
create or replace function bootstrap_session()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me           accounts%rowtype;
  allowed      uuid[];
  chosen       uuid[];
  dept_name    text;
  loc_code     text;
begin
  select * into me from accounts where auth_user_id = auth.uid() and is_active limit 1;
  if not found then
    -- Authenticated but no account row, or the account was deactivated.
    return jsonb_build_object('account', null);
  end if;

  -- Locations RLS will actually allow this user to see.
  allowed := array(select my_location_ids());

  -- The user's persisted scope, intersected with what RLS permits. A Site IT
  -- user cannot widen their scope by editing a stored preference.
  select coalesce(array_agg(p.location_id), '{}')
    into chosen
    from account_scope_preferences p
   where p.account_id = me.id
     and p.location_id = any (allowed);

  -- First sign-in: default to everything the user may see.
  if chosen is null or cardinality(chosen) = 0 then
    chosen := allowed;
  end if;

  select d.name into dept_name from departments d where d.id = me.department_id;
  select l.code into loc_code  from locations   l where l.id = me.location_id;

  return jsonb_build_object(
    'account', jsonb_build_object(
      'id',           me.id,
      'fullName',     me.full_name,
      'email',        me.email,
      'nik',          me.nik,
      'department',   dept_name,
      'departmentId', me.department_id,
      'locationId',   me.location_id,
      'locationCode', loc_code,
      'role',         me.role,
      'canLogin',     me.can_login
    ),
    'allowedLocations', to_jsonb(allowed),
    'scope',            to_jsonb(chosen)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Persisting the scope selector.
--
-- Working rule #2: writes go through an RPC, never an ad-hoc client write.
-- The chosen locations are intersected with my_location_ids() here too, so the
-- stored preference can never exceed what RLS allows.
-- ---------------------------------------------------------------------------
create or replace function set_account_scope(p_locations uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid; allowed uuid[]; kept uuid[];
begin
  select id into me from accounts where auth_user_id = auth.uid() and is_active limit 1;
  if me is null then
    raise exception 'No active account for the current session';
  end if;

  allowed := array(select my_location_ids());
  kept := array(select unnest(p_locations) intersect select unnest(allowed));

  delete from account_scope_preferences where account_id = me;
  insert into account_scope_preferences (account_id, location_id)
  select me, unnest(kept)
  on conflict do nothing;

  return to_jsonb(kept);
end $$;

-- ---------------------------------------------------------------------------
-- Grants. Only these two functions are callable by a signed-in client; the
-- assign/return/movement RPCs arrive in Phase 4.
-- ---------------------------------------------------------------------------
revoke all on function bootstrap_session()          from anon, authenticated;
revoke all on function set_account_scope(uuid[])    from anon, authenticated;
grant execute on function bootstrap_session()       to authenticated;
grant execute on function set_account_scope(uuid[]) to authenticated;
