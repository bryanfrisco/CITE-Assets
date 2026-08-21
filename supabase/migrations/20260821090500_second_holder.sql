-- ============================================================================
-- CITE Assets — 0048 A second holder, and a signature block for them
--
-- THE CASE
-- --------
-- One handy-talkie, two people working opposite shifts, both answerable for it.
--
-- The document is raised once for the pair and BOTH sign it. Shift changes are
-- not recorded: two assign-and-return cycles a day for one radio is a burden
-- that would not survive a week in the field, and it would bury the asset's
-- real history under routine.
--
-- WHAT THIS DOES NOT TOUCH
-- ------------------------
-- assignments_one_active stays exactly as it is. There is still one active
-- assignment per asset — it just carries two names now. Nothing about the
-- assign wizard, return, or the single-holder case changes.
--
-- assign_asset() is also untouched, deliberately. Widening a live function's
-- signature is the mistake migration 0029 exists to clean up after, so the
-- second holder is set by a separate call afterwards instead.
-- ============================================================================

alter table assignments add column if not exists secondary_account_id
  uuid references accounts(id) on delete restrict;
alter table bast        add column if not exists secondary_account_id
  uuid references accounts(id) on delete restrict;

-- Denormalised onto assets for the same reason assigned_to already is: it is
-- what lets search_assets() find the radio by the SECOND holder's name.
alter table assets add column if not exists assigned_to_secondary
  uuid references accounts(id) on delete set null;

create index if not exists assets_assigned_secondary_idx on assets(assigned_to_secondary);

alter table assignments drop constraint if exists secondary_is_a_different_person;
alter table assignments add constraint secondary_is_a_different_person
  check (secondary_account_id is null or secondary_account_id <> account_id);

-- ---------------------------------------------------------------------------
-- set_secondary_holder()
--
-- Called after the assignment exists, so assign_asset() keeps its signature.
-- Passing null clears the second holder again.
--
-- Writes all three places the pair has to appear: the assignment (the record),
-- the asset (what search reads), and the draft BAST (what gets signed). The
-- BAST is only touched while it is still a draft — a signed document cannot
-- gain a second recipient after the fact.
-- ---------------------------------------------------------------------------
create or replace function set_secondary_holder(
  p_asset   uuid,
  p_account uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a       assets%rowtype;
  asg     assignments%rowtype;
  who     text;
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

  if p_account is not null then
    if p_account = asg.account_id then
      raise exception 'That is already the first holder' using errcode = 'P0001';
    end if;
    select full_name into who from accounts where id = p_account and is_active;
    if who is null then
      raise exception 'Choose somebody who is still active' using errcode = 'P0001';
    end if;
  end if;

  update assignments set secondary_account_id = p_account where id = asg.id;
  update assets      set assigned_to_secondary = p_account where id = p_asset;

  -- Only the draft. A signed sheet is evidence and its parties are fixed.
  update bast set secondary_account_id = p_account, updated_at = now()
   where assignment_id = asg.id and status <> 'signed';

  return jsonb_build_object(
    'assetId', p_asset,
    'assignmentId', asg.id,
    'secondaryName', who
  );
end $$;


-- ---------------------------------------------------------------------------
-- sign_bast(), replaced in full. Two changes:
--
--   * visibility now goes through can_see_bast_row(), so a BAST Perlengkapan
--     — which has no asset — can be signed at all. Before this it could be
--     raised and read but never signed, which is a document that does nothing.
--
--   * `complete` waits for the second recipient when there is one.
--
-- Signature unchanged, so this replaces rather than overloads.
-- ---------------------------------------------------------------------------

create or replace function sign_bast(
  p_bast    uuid,
  p_role    text,
  p_name    text,
  p_title   text,
  p_strokes jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b       bast%rowtype;
  me      uuid := my_account_id();
  r       bast_signature_role;
  has_h   boolean;
  has_r   boolean;
  has_r2  boolean;
begin
  begin
    r := p_role::bast_signature_role;
  exception when others then
    raise exception 'Unknown signature role' using errcode = 'P0001';
  end;

  select * into b from bast where id = p_bast;
  if not found then
    raise exception 'BAST not found' using errcode = 'P0001';
  end if;

  -- SECURITY DEFINER, so the guards RLS would have applied are re-stated here
  -- (DATABASE.md §11).
  if not can_see_bast_row(b.asset_id, b.location_id) then
    raise exception 'BAST not found' using errcode = 'P0001';
  end if;
  if not can_write_assets() then
    raise exception 'You do not have permission to sign this document' using errcode = 'P0001';
  end if;
  if b.status = 'void' then
    raise exception 'This BAST has been voided' using errcode = 'P0001';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'Who is signing?' using errcode = 'P0001';
  end if;

  perform validate_signature_strokes(p_strokes);

  insert into bast_signatures (bast_id, role, signer_name, signer_title, strokes, recorded_by)
  values (p_bast, r, trim(p_name), nullif(trim(coalesce(p_title, '')), ''), p_strokes, me);

  select
    count(*) filter (where role = 'handover') > 0,
    count(*) filter (where role = 'receiver') > 0,
    count(*) filter (where role = 'receiver_2') > 0
  into has_h, has_r, has_r2
  from bast_signatures where bast_id = p_bast;

  return jsonb_build_object(
    'bastId', p_bast,
    'role', r,
    -- The client uses this to decide whether to finalise the PDF. Status is
    -- NOT set to 'signed' here — see the header.
    --
    -- The third term is the load-bearing one: on a document with two
    -- recipients this stays false until the SECOND one has signed. Get it
    -- wrong and the PDF is issued, and the status locked, while one of the two
    -- people answerable for the radio has put nothing on it.
    'complete', has_h and has_r and (b.secondary_account_id is null or has_r2)
  );
end $$;

revoke all on function set_secondary_holder(uuid, uuid) from public, anon, authenticated;
grant execute on function set_secondary_holder(uuid, uuid) to authenticated;
