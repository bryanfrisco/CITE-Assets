-- ============================================================================
-- CITE Assets — 0093 A handover hands back the document it just raised
--
-- assign_asset() created the E-BAST draft and then reported only its NUMBER.
-- So the screen that had just made the document could not open it: the success
-- step offered "Generate E-BAST document", which generated nothing -- the draft
-- already existed -- and dropped the user on the register to go and find it.
--
-- return_asset() has returned `bast_id` since it was written. This is the same
-- fact, missing from the other half of the pair.
--
-- With the id in hand the button can do what it always claimed to: take
-- somebody straight to the signature page for the document their handover just
-- produced.
--
-- The function is DROPPED first. A `returns table` function cannot gain a
-- column in place -- Postgres refuses to change an existing result type -- and
-- adding one beside it would leave PostgREST two candidates to choose between.
--
-- The body is the function as it stood, taken from the database rather than
-- retyped, with the id captured alongside the number it already captured.
-- ============================================================================

drop function if exists assign_asset(uuid, uuid, uuid, date, date, text, boolean);

CREATE OR REPLACE FUNCTION public.assign_asset(p_asset uuid, p_account uuid, p_location uuid, p_date date, p_expected_return date DEFAULT NULL::date, p_notes text DEFAULT NULL::text, p_auto_bast boolean DEFAULT true)
 RETURNS TABLE(assignment_id uuid, bast_number text, bast_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me            uuid := my_account_id();
  a             assets%rowtype;
  acct          accounts%rowtype;
  target_loc    uuid;
  assigned_id   uuid;
  cond_name     text;
  v_assignment  uuid;
  v_bast        text;
  v_bast_id     uuid;
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
    returning bast.bast_number, bast.id into v_bast, v_bast_id;
  end if;

  assignment_id := v_assignment;
  bast_number   := v_bast;
  bast_id       := v_bast_id;
  return next;
end $function$;


revoke all on function assign_asset(uuid, uuid, uuid, date, date, text, boolean)
  from public, anon, authenticated;
grant execute on function assign_asset(uuid, uuid, uuid, date, date, text, boolean)
  to authenticated;
