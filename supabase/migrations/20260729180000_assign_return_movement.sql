-- ============================================================================
-- CITE Assets — 0012 assignment & movement  (Phase 4)
--
-- The three write paths from DATABASE.md §11, plus the two reads the wizard
-- needs to fill its Employee and Asset steps and the read-only movement rail.
--
-- WHY SECURITY DEFINER
-- --------------------
-- DATABASE.md §11 declares all three as SECURITY DEFINER, and they need it:
-- each one touches several tables in a single transaction and assign_asset()
-- reaches the bast_number_counters table, which `authenticated` deliberately
-- has no grant on (migration 0006).
--
-- SECURITY DEFINER bypasses RLS, so every guard RLS would have applied is
-- re-stated explicitly at the top of each function:
--   * can_write_assets()      — a Viewer can call nothing here
--   * can_see_asset()         — the asset must be inside the caller's own scope
--   * my_location_ids()       — so can the destination / assignment location
-- auth.uid() is unaffected by SECURITY DEFINER, so the audit_row() triggers on
-- assets, assignments, movements and bast still record the real actor.
--
-- DEVIATION FROM DATABASE.md §11
-- ------------------------------
-- The doc describes return_asset() as moving the asset "to the store location".
-- No such column or flag exists anywhere in the schema — there is no way to
-- know which location is the store. The asset therefore stays where it is and
-- only loses its holder; relocating it is what the Transfer form (README §12)
-- is for, and that path writes a proper movement row with a reason.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- assign_asset() — README § Assign / Return Asset, step 3 "Confirm assignment".
--
-- One transaction: assignment row, asset status + holder, a movement row when
-- the location changes, and the BAST draft when Auto-generate BAST is on.
-- ---------------------------------------------------------------------------
create or replace function assign_asset(
  p_asset           uuid,
  p_account         uuid,
  p_location        uuid,
  p_date            date,
  p_expected_return date    default null,
  p_notes           text    default null,
  p_auto_bast       boolean default true
) returns table (assignment_id uuid, bast_number text)
language plpgsql security definer set search_path = public as $$
declare
  me            uuid := my_account_id();
  a             assets%rowtype;
  acct          accounts%rowtype;
  target_loc    uuid;
  assigned_id   uuid;
  cond_name     text;
  v_assignment  uuid;
  v_bast        text;
begin
  if not can_write_assets() then
    raise exception 'You do not have permission to assign assets' using errcode = 'P0001';
  end if;

  -- The wizard blocks these client-side; the same copy is used here so a
  -- direct RPC call cannot produce a different message (README § step 1/2).
  if p_account is null then
    raise exception 'Select an employee to continue' using errcode = 'P0001';
  end if;
  if p_asset is null then
    raise exception 'Select an asset to continue' using errcode = 'P0001';
  end if;
  if p_date is null then
    raise exception 'Assignment date is required' using errcode = 'P0001';
  end if;

  select * into a from assets where id = p_asset;
  if not found or not can_see_asset(p_asset) then
    raise exception 'Asset not found' using errcode = 'P0001';
  end if;

  select * into acct from accounts where id = p_account and is_active;
  if not found then
    raise exception 'Employee not found' using errcode = 'P0001';
  end if;

  -- Server-side guard with no README copy behind it: the wizard only lists
  -- Available assets, but `assignments_one_active` would otherwise surface as
  -- a unique-violation constraint name.
  if exists (select 1 from assignments where asset_id = p_asset and state = 'active') then
    raise exception 'This asset is already assigned' using errcode = 'P0001';
  end if;

  if p_expected_return is not null and p_expected_return < p_date then
    raise exception 'Expected return cannot be before the assignment date' using errcode = 'P0001';
  end if;

  -- Where the asset now lives: the caller's choice, else the employee's
  -- location, else where the asset already is.
  target_loc := coalesce(p_location, acct.location_id, a.location_id);
  if target_loc not in (select my_location_ids()) then
    raise exception 'That location is outside your scope' using errcode = 'P0001';
  end if;

  select id into assigned_id from asset_statuses where name = 'Assigned';
  if assigned_id is null then
    raise exception 'The "Assigned" status is missing from master data' using errcode = 'P0001';
  end if;

  insert into assignments (
    asset_id, account_id, department_id, location_id,
    assigned_date, expected_return, state, notes, created_by
  ) values (
    p_asset, p_account, acct.department_id, target_loc,
    p_date, p_expected_return, 'active', nullif(btrim(coalesce(p_notes, '')), ''), me
  )
  returning id into v_assignment;

  -- README § step 3: "a movement row when the location changes".
  if a.location_id is distinct from target_loc then
    insert into movements (asset_id, from_location, to_location, moved_at, reason, remarks, moved_by)
    values (
      p_asset, a.location_id, target_loc, p_date::timestamptz,
      'employee relocation', 'Assigned to ' || acct.full_name, me
    );
  end if;

  update assets set
    assigned_to   = p_account,
    department_id = coalesce(acct.department_id, department_id),
    location_id   = target_loc,
    status_id     = assigned_id
  where id = p_asset;

  if coalesce(p_auto_bast, true) then
    select name into cond_name from asset_conditions where id = a.condition_id;

    insert into bast (
      assignment_id, asset_id, account_id, department_id, location_id,
      bast_date, description, condition_text, status, created_by
    ) values (
      v_assignment, p_asset, p_account, acct.department_id, target_loc,
      p_date, nullif(btrim(coalesce(p_notes, '')), ''),
      -- Keep the schema default wording for the common case rather than
      -- inventing Indonesian for the others.
      case when cond_name = 'Good' then 'Baik / Good' else cond_name end,
      'draft', me
    )
    returning bast.bast_number into v_bast;
  end if;

  assignment_id := v_assignment;
  bast_number   := v_bast;
  return next;
end $$;

-- ---------------------------------------------------------------------------
-- return_asset() — closes the active assignment and frees the asset.
-- ---------------------------------------------------------------------------
create or replace function return_asset(
  p_asset     uuid,
  p_date      date,
  p_condition uuid,
  p_notes     text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  asg          assignments%rowtype;
  available_id uuid;
  clean_notes  text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if not can_write_assets() then
    raise exception 'You do not have permission to return assets' using errcode = 'P0001';
  end if;
  if p_asset is null then
    raise exception 'Select an asset to continue' using errcode = 'P0001';
  end if;
  if p_date is null then
    raise exception 'Assignment date is required' using errcode = 'P0001';
  end if;
  if not can_see_asset(p_asset) then
    raise exception 'Asset not found' using errcode = 'P0001';
  end if;

  select * into asg from assignments where asset_id = p_asset and state = 'active';
  if not found then
    raise exception 'This asset has no active assignment' using errcode = 'P0001';
  end if;
  if p_date < asg.assigned_date then
    raise exception 'Return date cannot be before the assignment date' using errcode = 'P0001';
  end if;

  select id into available_id from asset_statuses where name = 'Available';
  if available_id is null then
    raise exception 'The "Available" status is missing from master data' using errcode = 'P0001';
  end if;

  update assignments set
    returned_date = p_date,
    state         = 'returned',
    notes         = case
                      when clean_notes is null then notes
                      else coalesce(notes || E'\n', '') || clean_notes
                    end
  where id = asg.id;

  update assets set
    assigned_to  = null,
    status_id    = available_id,
    condition_id = coalesce(p_condition, condition_id)
  where id = p_asset;

  return asg.id;
end $$;

-- ---------------------------------------------------------------------------
-- record_movement() — README § Transfer / Movement.
--
-- The movement row is append-only in three independent ways (no UPDATE/DELETE
-- grant, no policy, and the forbid_mutation() triggers), so this is the only
-- way one can ever come into existence.
-- ---------------------------------------------------------------------------
create or replace function record_movement(
  p_asset       uuid,
  p_to_location uuid,
  p_reason      text,
  p_remarks     text        default null,
  p_at          timestamptz default now()
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  a      assets%rowtype;
  me     uuid := my_account_id();
  new_id uuid;
begin
  if not can_write_assets() then
    raise exception 'You do not have permission to move assets' using errcode = 'P0001';
  end if;
  if p_asset is null then
    raise exception 'Select an asset to continue' using errcode = 'P0001';
  end if;

  select * into a from assets where id = p_asset;
  if not found or not can_see_asset(p_asset) then
    raise exception 'Asset not found' using errcode = 'P0001';
  end if;

  if p_to_location is null then
    raise exception 'Select a destination' using errcode = 'P0001';
  end if;
  -- README § Transfer: "Destination (location select, must differ from origin)".
  if p_to_location = a.location_id then
    raise exception 'Destination must be different from the origin' using errcode = 'P0001';
  end if;
  -- Site IT is locked to its own location scope (README § Interactions), so it
  -- cannot move an asset somewhere it would immediately lose sight of.
  if p_to_location not in (select my_location_ids()) then
    raise exception 'That location is outside your scope' using errcode = 'P0001';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'Select a reason' using errcode = 'P0001';
  end if;

  insert into movements (asset_id, from_location, to_location, moved_at, reason, remarks, moved_by)
  values (
    p_asset, a.location_id, p_to_location, coalesce(p_at, now()),
    btrim(p_reason), nullif(btrim(coalesce(p_remarks, '')), ''), me
  )
  returning id into new_id;

  update assets set location_id = p_to_location where id = p_asset;

  return new_id;
end $$;

-- ---------------------------------------------------------------------------
-- Wizard step 1 — README: "36px navy initials avatar, name,
-- `Department · Location · NIK`".
--
-- SECURITY INVOKER: `accounts` is readable by every signed-in user (RLS
-- policy accounts_read), so no elevation is warranted here.
-- ---------------------------------------------------------------------------
create or replace function assignable_employees(p_locations uuid[])
returns table (
  id uuid, full_name text, nik text,
  department_name text, location_name text
)
language sql stable security invoker set search_path = public as $$
  select acc.id, acc.full_name, acc.nik, d.name, l.name
  from accounts acc
  left join departments d on d.id = acc.department_id
  left join locations   l on l.id = acc.location_id
  where acc.is_active
    and (acc.location_id is null or acc.location_id = any (p_locations))
  order by acc.full_name;
$$;

-- ---------------------------------------------------------------------------
-- Wizard step 2 — rows filtered to `Available` (assign) or `Assigned`
-- (return) within the current scope; shows code, name, `location · condition`.
-- ---------------------------------------------------------------------------
create or replace function assignable_assets(p_locations uuid[], p_mode text default 'assign')
returns table (
  id uuid, asset_code text, name text,
  location_name text, condition_name text, holder_name text
)
language sql stable security invoker set search_path = public as $$
  select a.id, a.asset_code, a.name, l.name, cond.name, acc.full_name
  from assets a
  join asset_statuses   s    on s.id    = a.status_id
  join asset_conditions cond on cond.id = a.condition_id
  join locations        l    on l.id    = a.location_id
  left join accounts    acc  on acc.id  = a.assigned_to
  where a.location_id = any (p_locations)
    and s.name = case when p_mode = 'return' then 'Assigned' else 'Available' end
  order by a.asset_code;
$$;

-- ---------------------------------------------------------------------------
-- The movement rail — README § Transfer: "Origin → Destination steps with
-- date, user, reason, remarks". Read-only by construction: there is no
-- companion update or delete function anywhere in this migration.
-- ---------------------------------------------------------------------------
create or replace function movement_history(p_locations uuid[], p_asset uuid default null)
returns table (
  id uuid, asset_id uuid, asset_code text, asset_name text,
  from_location text, to_location text,
  moved_at timestamptz, reason text, remarks text, moved_by_name text
)
language sql stable security invoker set search_path = public as $$
  select
    mv.id, a.id, a.asset_code, a.name,
    fl.name, tl.name,
    mv.moved_at, mv.reason, mv.remarks, acc.full_name
  from movements mv
  join assets a on a.id = mv.asset_id
  left join locations fl on fl.id = mv.from_location
  join locations      tl on tl.id = mv.to_location
  left join accounts  acc on acc.id = mv.moved_by
  where a.location_id = any (p_locations)
    and (p_asset is null or mv.asset_id = p_asset)
  order by mv.moved_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Privileges. Note there is no revoke/grant pair for anything that could edit
-- or delete a movement — no such function exists.
-- ---------------------------------------------------------------------------
revoke all on function assign_asset(uuid, uuid, uuid, date, date, text, boolean)
  from anon, authenticated;
revoke all on function return_asset(uuid, date, uuid, text)          from anon, authenticated;
revoke all on function record_movement(uuid, uuid, text, text, timestamptz)
  from anon, authenticated;
revoke all on function assignable_employees(uuid[])                  from anon, authenticated;
revoke all on function assignable_assets(uuid[], text)               from anon, authenticated;
revoke all on function movement_history(uuid[], uuid)                from anon, authenticated;

grant execute on function assign_asset(uuid, uuid, uuid, date, date, text, boolean) to authenticated;
grant execute on function return_asset(uuid, date, uuid, text)                      to authenticated;
grant execute on function record_movement(uuid, uuid, text, text, timestamptz)      to authenticated;
grant execute on function assignable_employees(uuid[])                              to authenticated;
grant execute on function assignable_assets(uuid[], text)                           to authenticated;
grant execute on function movement_history(uuid[], uuid)                            to authenticated;
