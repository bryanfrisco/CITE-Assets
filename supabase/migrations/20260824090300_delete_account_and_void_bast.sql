-- ============================================================================
-- CITE Assets — 0060 Deleting a person, and voiding a document
--
-- Both asked for, both recorded, and they work differently on purpose.
--
-- A PERSON can be deleted outright — but only when nothing points at them.
-- The same reasoning as delete_asset() in migration 0028: the delete is for
-- something entered by mistake, and anything with history behind it must be
-- deactivated instead, or the history ends up naming nobody. The blockers are
-- listed in full rather than one at a time, because being told about one
-- blocker per attempt is how somebody ends up trying six times.
--
-- A DOCUMENT is never deleted once it has been signed. Working rule #3 makes
-- bast_versions append-only in three independent ways, and a Berita Acara is
-- the evidence a handover happened. So there are two paths:
--
--   void_bast()   — always available. Status becomes 'void', the number stays
--                   spent, the reason is recorded, and the sheet stops
--                   counting. This is what "delete" means for a document that
--                   exists.
--   delete_bast() — only for a draft that was never signed, has no PDF and no
--                   signatures on it. That is a document raised by accident,
--                   and there is nothing to preserve.
--
-- Both write the reason to audit_log before acting, because the audit trigger
-- can record what changed and when but never why, and why is the only part
-- worth reading six months later.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- delete_account()
-- ---------------------------------------------------------------------------
create or replace function delete_account(p_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a     accounts%rowtype;
  holds text[] := array[]::text[];
begin
  perform assert_can_manage_accounts();

  select * into a from accounts where id = p_id;
  if not found then
    raise exception 'Account not found' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Say why this person is being deleted' using errcode = 'P0001';
  end if;
  if p_id = my_account_id() then
    raise exception 'You cannot delete your own account' using errcode = 'P0001';
  end if;
  -- The rule that keeps the system administrable, same as update_account().
  if a.role = 'super_admin' and a.is_active and a.can_login
     and other_super_admins(a.id) = 0 then
    raise exception 'This is the only Super Admin left — give someone else the role first'
      using errcode = 'P0001';
  end if;

  if exists (select 1 from assets where assigned_to = p_id or assigned_to_secondary = p_id) then
    holds := array_append(holds, 'an asset in their hands');
  end if;
  if exists (select 1 from assignments
              where account_id = p_id or secondary_account_id = p_id) then
    holds := array_append(holds, 'an assignment');
  end if;
  if exists (select 1 from bast where account_id = p_id or secondary_account_id = p_id) then
    holds := array_append(holds, 'an E-BAST');
  end if;
  if exists (select 1 from accessory_checkouts where account_id = p_id) then
    holds := array_append(holds, 'accessories signed out');
  end if;
  if exists (select 1 from movements where moved_by = p_id) then
    holds := array_append(holds, 'a movement they recorded');
  end if;
  if exists (select 1 from asset_status_changes where changed_by = p_id) then
    holds := array_append(holds, 'a status change they made');
  end if;
  if exists (select 1 from bast_signatures where recorded_by = p_id) then
    holds := array_append(holds, 'a signature they witnessed');
  end if;
  if a.auth_user_id is not null then
    holds := array_append(holds, 'a sign-in');
  end if;

  if array_length(holds, 1) > 0 then
    raise exception
      '% has % behind them. Set them to Inactive instead — deleting would leave those records naming nobody.',
      a.full_name, array_to_string(holds, ', ')
      using errcode = 'P0001';
  end if;

  -- Recorded BEFORE the row goes. The trigger on accounts fires for insert and
  -- update only, and in any case a trigger cannot know why.
  insert into audit_log (action, table_name, record_id, target_label, old_value,
                         actor_id, actor_label)
  values (
    'account_updated', 'accounts', p_id,
    a.full_name || coalesce(' · ' || a.nik, ''),
    to_jsonb(a) || jsonb_build_object('deleted', true, 'reason', btrim(p_reason)),
    my_account_id(),
    coalesce((select coalesce(role::text, 'system') || ' · ' || full_name from v_me limit 1),
             'system')
  );

  delete from accounts where id = p_id;

  return jsonb_build_object('id', p_id, 'fullName', a.full_name);
end $$;

-- ---------------------------------------------------------------------------
-- void_bast() — the honest form of "delete" for a document that exists
-- ---------------------------------------------------------------------------
create or replace function void_bast(p_bast uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b bast%rowtype;
begin
  select * into b from bast where id = p_bast;
  if not found or not can_see_bast_row(b.asset_id, b.location_id) then
    raise exception 'BAST not found' using errcode = 'P0001';
  end if;
  if not can_write_assets() then
    raise exception 'You do not have permission to void this document'
      using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Say why this document is being voided' using errcode = 'P0001';
  end if;
  if b.status = 'void' then
    raise exception 'That document is already void' using errcode = 'P0001';
  end if;

  insert into audit_log (action, table_name, record_id, target_label, old_value, new_value,
                         actor_id, actor_label)
  values (
    'bast_generated', 'bast', p_bast, b.bast_number,
    to_jsonb(b),
    jsonb_build_object('status', 'void', 'reason', btrim(p_reason)),
    my_account_id(),
    coalesce((select coalesce(role::text, 'system') || ' · ' || full_name from v_me limit 1),
             'system')
  );

  -- The number stays spent. Reusing it would make two different documents
  -- share one reference in somebody's filing cabinet.
  update bast
     set status = 'void',
         description = coalesce(description || E'\n', '') || 'VOID: ' || btrim(p_reason),
         updated_at = now()
   where id = p_bast;

  return jsonb_build_object('bastId', p_bast, 'bastNumber', b.bast_number, 'status', 'void');
end $$;

-- ---------------------------------------------------------------------------
-- delete_bast() — only for a draft raised by accident
-- ---------------------------------------------------------------------------
create or replace function delete_bast(p_bast uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b     bast%rowtype;
  holds text[] := array[]::text[];
begin
  select * into b from bast where id = p_bast;
  if not found or not can_see_bast_row(b.asset_id, b.location_id) then
    raise exception 'BAST not found' using errcode = 'P0001';
  end if;
  if my_role() is distinct from 'super_admin' then
    raise exception 'Only a Super Admin can delete a document' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Say why this document is being deleted' using errcode = 'P0001';
  end if;

  if b.status = 'signed' then
    holds := array_append(holds, 'been signed');
  end if;
  if exists (select 1 from bast_signatures where bast_id = p_bast) then
    holds := array_append(holds, 'signatures on it');
  end if;
  if exists (select 1 from bast_versions where bast_id = p_bast) then
    holds := array_append(holds, 'a rendered PDF');
  end if;

  if array_length(holds, 1) > 0 then
    raise exception
      '% has %. Void it instead — a signed document is the evidence a handover happened, and deleting it would remove the proof rather than the mistake.',
      b.bast_number, array_to_string(holds, ' and ')
      using errcode = 'P0001';
  end if;

  insert into audit_log (action, table_name, record_id, target_label, old_value,
                         actor_id, actor_label)
  values (
    'bast_generated', 'bast', p_bast, b.bast_number,
    to_jsonb(b) || jsonb_build_object('deleted', true, 'reason', btrim(p_reason)),
    my_account_id(),
    coalesce((select coalesce(role::text, 'system') || ' · ' || full_name from v_me limit 1),
             'system')
  );

  -- Anything the draft was holding goes back to being un-documented, not
  -- returned: the stock never moved because of the paperwork.
  update accessory_checkouts set bast_id = null where bast_id = p_bast;
  delete from bast_items where bast_id = p_bast;
  delete from bast where id = p_bast;

  return jsonb_build_object('bastId', p_bast, 'bastNumber', b.bast_number);
end $$;

revoke all on function delete_account(uuid, text) from public, anon, authenticated;
revoke all on function void_bast(uuid, text)      from public, anon, authenticated;
revoke all on function delete_bast(uuid, text)    from public, anon, authenticated;

grant execute on function delete_account(uuid, text) to authenticated;
grant execute on function void_bast(uuid, text)      to authenticated;
grant execute on function delete_bast(uuid, text)    to authenticated;

-- ---------------------------------------------------------------------------
-- set_bast_kind() — file a paper document as what it actually is
--
-- A Berita Acara raised by the app already knows its kind: assigning produces
-- a Serah Terima, returning produces a Penarikan. Paper does not. When an old
-- signed sheet is being filed into the system, the person filing it is the
-- only one who knows which of the two they are holding.
--
-- Allowed only while the document is unsigned. Once signed, the kind is part
-- of what was put a name to — the title on the page says "SERAH TERIMA" or
-- "PENARIKAN", and changing it afterwards would make the record disagree with
-- the paper somebody signed.
-- ---------------------------------------------------------------------------
create or replace function set_bast_kind(p_bast uuid, p_kind text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b bast%rowtype; k bast_kind;
begin
  select * into b from bast where id = p_bast;
  if not found or not can_see_bast_row(b.asset_id, b.location_id) then
    raise exception 'BAST not found' using errcode = 'P0001';
  end if;
  if not can_write_assets() then
    raise exception 'You do not have permission to change this document'
      using errcode = 'P0001';
  end if;
  if b.status = 'signed' then
    raise exception 'This BAST is already signed — its kind cannot change'
      using errcode = 'P0001';
  end if;

  begin
    k := p_kind::bast_kind;
  exception when others then
    raise exception 'Unknown kind of document' using errcode = 'P0001';
  end;

  update bast set kind = k, updated_at = now() where id = p_bast;

  return jsonb_build_object('bastId', p_bast, 'kind', k);
end $$;

revoke all on function set_bast_kind(uuid, text) from public, anon, authenticated;
grant execute on function set_bast_kind(uuid, text) to authenticated;
