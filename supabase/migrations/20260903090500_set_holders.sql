-- ============================================================================
-- CITE Assets — 0074 Setting every holder, not just the second
--
-- set_secondary_holder() takes one account and writes it to one column, so it
-- can only ever express a pair. This replaces it with a function that takes the
-- whole list of extra holders and makes the tables match it exactly.
--
-- The old function is NOT dropped: it still works, and it now delegates, so
-- anything that calls it keeps behaving as it did while the screens move over.
--
-- `secondary_account_id` stays in sync as position 2 throughout. Search, the
-- register list and the existing detail queries read it directly, and having it
-- silently stop matching the holders table is exactly the drift this codebase
-- avoids elsewhere.
-- ============================================================================

create or replace function set_asset_holders(
  p_asset    uuid,
  p_accounts uuid[]          -- holders 2..N, in order; empty clears them
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a    assets%rowtype;
  asg  assignments%rowtype;
  v_id uuid;
  i    int := 1;
  v_names text[] := array[]::text[];
  v_name  text;
  v_extra uuid[];
begin
  select * into a from assets where id = p_asset;
  if not found or not can_see_asset(p_asset) then
    raise exception 'Asset not found' using errcode = 'P0001';
  end if;
  if not can_write_assets() then
    raise exception 'You do not have permission to change this assignment'
      using errcode = 'P0001';
  end if;

  select * into asg from assignments
   where asset_id = p_asset and state = 'active' limit 1;
  if not found then
    raise exception 'Nobody holds this asset yet — assign it first' using errcode = 'P0001';
  end if;

  v_extra := coalesce(p_accounts, array[]::uuid[]);

  -- Three positions on top of the first holder. The limit is the set of
  -- signature roles that exist, not the paper: the document runs to a second
  -- page when the signature column fills up.
  if array_length(v_extra, 1) > 3 then
    raise exception 'An asset can be held by at most four people' using errcode = 'P0001';
  end if;

  foreach v_id in array v_extra loop
    if v_id = asg.account_id then
      raise exception 'That person already holds it' using errcode = 'P0001';
    end if;
    select full_name into v_name from accounts where id = v_id and is_active;
    if v_name is null then
      raise exception 'Choose somebody who is still active' using errcode = 'P0001';
    end if;
    if v_name = any (v_names) then
      raise exception 'The same person is listed twice' using errcode = 'P0001';
    end if;
    v_names := v_names || v_name;
  end loop;

  -- Replace outright rather than merge: the argument IS the intended list, and
  -- a merge would leave a holder somebody meant to remove.
  delete from assignment_holders where assignment_id = asg.id;
  i := 1;
  foreach v_id in array v_extra loop
    i := i + 1;
    insert into assignment_holders (assignment_id, account_id, position)
    values (asg.id, v_id, i);
  end loop;

  update assignments set secondary_account_id = v_extra[1] where id = asg.id;
  update assets      set assigned_to_secondary = v_extra[1] where id = p_asset;

  -- Only the draft. A signed sheet is evidence and its parties are fixed.
  delete from bast_holders
   where bast_id in (select id from bast
                      where assignment_id = asg.id and status <> 'signed');

  i := 1;
  foreach v_id in array v_extra loop
    i := i + 1;
    insert into bast_holders (bast_id, account_id, position)
    select b.id, v_id, i from bast b
     where b.assignment_id = asg.id and b.status <> 'signed';
  end loop;

  update bast set secondary_account_id = v_extra[1], updated_at = now()
   where assignment_id = asg.id and status <> 'signed';

  return jsonb_build_object(
    'assetId', p_asset,
    'assignmentId', asg.id,
    'holderNames', to_jsonb(v_names)
  );
end $$;

-- The old single-holder call now goes through the same path, so the two cannot
-- drift apart while the screens are still being moved over.
create or replace function set_secondary_holder(p_asset uuid, p_account uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return set_asset_holders(
    p_asset,
    case when p_account is null then array[]::uuid[] else array[p_account] end
  );
end $$;

revoke all on function set_asset_holders(uuid, uuid[]) from public, anon, authenticated;
grant execute on function set_asset_holders(uuid, uuid[]) to authenticated;
