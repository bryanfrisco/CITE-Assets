-- ============================================================================
-- CITE Assets — 0076 A document is complete when EVERY holder has signed
--
-- The old rule named two roles: handover, receiver, and receiver_2 only when
-- secondary_account_id was filled in. With three or four holders that rule
-- would call a document finished while somebody had not signed it — and
-- `complete` is what the client uses to decide whether to render the final PDF
-- and lock the document, so getting it wrong issues evidence of a handover that
-- did not fully happen.
--
-- Counted against holders_of_bast() instead, so a fourth holder needs no change
-- here at all.
--
-- Same signature — p_role is already text — so create or replace is safe.
-- ============================================================================

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
  v_holders int := 0;
  v_signed  int := 0;
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

  -- Completeness is now counted against the holder LIST rather than against
  -- two named roles. A document handed to three people is not finished until
  -- all three have signed, and adding a fourth needs no change here.
  select count(*) filter (where role = 'handover') > 0
    into has_h
    from bast_signatures where bast_id = p_bast;

  select count(*) into v_holders from holders_of_bast(p_bast);

  -- One counted holder per position that has a matching signature on file.
  select count(*) into v_signed
    from holders_of_bast(p_bast) h
   where exists (
     select 1 from bast_signatures s
      where s.bast_id = p_bast
        and s.role::text = holder_signature_role(h.holder_position)
   );

  has_r  := v_signed >= v_holders;
  has_r2 := has_r;

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
    -- Every holder, plus the CITE side. No special case for "two".
    'complete', has_h and v_signed >= v_holders
  );
end $$;
