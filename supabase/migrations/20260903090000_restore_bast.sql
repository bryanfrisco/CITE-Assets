-- ============================================================================
-- CITE Assets — 0069 A voided BAST can be brought back
--
-- void_bast() was built as a one-way door: the status becomes 'void', signing
-- is refused, and the number stays spent. That is right for a document somebody
-- genuinely cancelled — but it left no way back from a mis-click, and the
-- symptom people actually hit is "the signature boxes are gone and I cannot
-- sign".
--
-- Two things could have fixed that. Issuing a replacement document would spend
-- a second number for one handover, and leave a void one in the file that looks
-- like a cancelled transaction that never happened. Restoring the document is
-- the honest one: the same handover, the same number, and BOTH the void and the
-- restore recorded so the file shows what happened rather than hiding it.
--
-- Super Admin only, and a reason is required — the same shape as delete_account()
-- and void_bast() itself. A document that was signed before it was voided comes
-- back as a DRAFT, not as signed: the signatures are still in bast_signatures
-- (append-only, nothing was destroyed), so whoever restores it can see them and
-- decide, rather than the system silently re-asserting a signed state nobody
-- reviewed.
-- ============================================================================

create or replace function restore_bast(p_bast uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b bast%rowtype; v_sigs int;
begin
  select * into b from bast where id = p_bast;
  if not found or not can_see_bast_row(b.asset_id, b.location_id) then
    raise exception 'BAST not found' using errcode = 'P0001';
  end if;

  if my_role() <> 'super_admin' then
    raise exception 'Only a Super Admin can restore a voided document'
      using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Say why this document is being restored' using errcode = 'P0001';
  end if;
  if b.status <> 'void' then
    raise exception 'That document is not void' using errcode = 'P0001';
  end if;

  select count(*) into v_sigs from bast_signatures where bast_id = p_bast;

  insert into audit_log (action, table_name, record_id, target_label, old_value, new_value,
                         actor_id, actor_label)
  values (
    'bast_generated', 'bast', p_bast, b.bast_number,
    to_jsonb(b),
    jsonb_build_object('status', 'draft', 'restored', true,
                       'reason', btrim(p_reason),
                       'signaturesOnFile', v_sigs),
    my_account_id(),
    coalesce((select coalesce(role::text, 'system') || ' · ' || full_name from v_me limit 1),
             'system')
  );

  -- The 'VOID: …' line void_bast() appended is stripped, because it is no longer
  -- true and would otherwise print on the restored document. The audit log keeps
  -- the whole story.
  update bast
     set status = 'draft',
         description = nullif(btrim(regexp_replace(
           coalesce(description, ''), '(^|\n)VOID: [^\n]*', '', 'g')), ''),
         updated_at = now()
   where id = p_bast;

  return jsonb_build_object(
    'bastId', p_bast,
    'bastNumber', b.bast_number,
    'status', 'draft',
    -- The screen says this out loud: signatures survived the void and are still
    -- attached, so somebody restoring a document knows what it already carries.
    'signaturesOnFile', v_sigs
  );
end $$;

revoke all on function restore_bast(uuid, text) from public, anon, authenticated;
grant execute on function restore_bast(uuid, text) to authenticated;
