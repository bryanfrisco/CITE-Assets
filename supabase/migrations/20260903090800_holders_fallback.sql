-- ============================================================================
-- CITE Assets — 0077 Two regressions from the holders table, fixed
--
-- 1. THE WITHDRAWAL SHEET LOST ITS SECOND HOLDER.
--
--    holders_of_bast() read bast_holders only. Documents raised by return_asset()
--    carry the pair across in `secondary_account_id` and never got a
--    bast_holders row, so the function saw one holder, and sign_bast() called
--    the document complete after the FIRST recipient signed.
--
--    That is the worst shape this bug could take: `complete` is what tells the
--    client to render the final PDF and lock the document, so a withdrawal
--    would have been issued as evidence that both people returned the radio
--    when only one of them had signed for it.
--
--    Fixed by making secondary_account_id a fallback rather than ignoring it —
--    the column is still the position-2 mirror, so any path that fills only the
--    column still produces the right holder list.
--
-- 2. A WORSE ERROR MESSAGE. set_asset_holders() said "That person already holds
--    it" where the old function said "That is already the first holder". The
--    second one tells somebody which of the two names to change; the first
--    leaves them guessing. Restored.
-- ============================================================================

create or replace function holders_of_bast(p_bast uuid)
returns table (holder_position int, account_id uuid, full_name text, nik text,
               job_title text, department_name text)
language sql stable security definer set search_path = public as $$
  with extra as (
    -- The holders table is the source when it has anything to say. When it does
    -- not, the denormalised column stands in, so a document raised by a path
    -- that only fills the column still lists both people.
    select h.position, h.account_id
      from bast_holders h
     where h.bast_id = p_bast

    union all

    select 2, b.secondary_account_id
      from bast b
     where b.id = p_bast
       and b.secondary_account_id is not null
       and not exists (select 1 from bast_holders x where x.bast_id = p_bast)
  )
  select 1, acc.id, acc.full_name, acc.nik,
         coalesce(nullif(btrim(coalesce(acc.job_title, '')), ''), '-'),
         d.name
    from bast b
    join accounts acc on acc.id = b.account_id
    left join departments d on d.id = acc.department_id
   where b.id = p_bast

  union all

  select e.position, acc.id, acc.full_name, acc.nik,
         coalesce(nullif(btrim(coalesce(acc.job_title, '')), ''), '-'),
         d.name
    from extra e
    join accounts acc on acc.id = e.account_id
    left join departments d on d.id = acc.department_id

  order by 1;
$$;

-- The message people actually get to act on.
create or replace function set_asset_holders(
  p_asset    uuid,
  p_accounts uuid[]
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

  if array_length(v_extra, 1) > 3 then
    raise exception 'An asset can be held by at most four people' using errcode = 'P0001';
  end if;

  foreach v_id in array v_extra loop
    if v_id = asg.account_id then
      raise exception 'That is already the first holder' using errcode = 'P0001';
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

  delete from assignment_holders where assignment_id = asg.id;
  i := 1;
  foreach v_id in array v_extra loop
    i := i + 1;
    insert into assignment_holders (assignment_id, account_id, position)
    values (asg.id, v_id, i);
  end loop;

  update assignments set secondary_account_id = v_extra[1] where id = asg.id;
  update assets      set assigned_to_secondary = v_extra[1] where id = p_asset;

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
