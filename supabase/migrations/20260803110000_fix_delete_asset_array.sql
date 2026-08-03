-- ============================================================================
-- CITE Assets — 0027 Fix the blocker list in delete_asset()
--
-- THE BUG
-- -------
--   malformed array literal: "an assignment"
--
-- `holds := holds || 'an assignment'` looks like appending a string to a text[].
-- Postgres sees `anyarray || anyarray` first, because the right-hand literal is
-- of unknown type, and tries to parse "an assignment" as an array literal.
--
-- The effect was that the refusal a person actually needs — "this asset has an
-- assignment behind it, retire it instead" — was replaced by a parser error.
-- The check still refused the delete, so nothing unsafe happened; it just
-- refused with a message nobody could act on.
--
-- Separate migration because 0026 has already been applied — working rule #1.
--
-- Fixed with array_append(), which cannot be read the other way.
-- ============================================================================

create or replace function delete_asset(p_asset uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a      assets%rowtype;
  holds  text[] := array[]::text[];
begin
  select * into a from assets where id = p_asset;
  if not found then
    raise exception 'Asset not found' using errcode = 'P0001';
  end if;
  if my_role() is distinct from 'super_admin' then
    raise exception 'Only a Super Admin can delete an asset' using errcode = 'P0001';
  end if;
  if not can_see_asset(p_asset) then
    raise exception 'Asset not found' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Say why this is being deleted' using errcode = 'P0001';
  end if;

  -- Everything that would lose its meaning if the asset row disappeared. The
  -- list is built in full rather than returned on the first hit, because being
  -- told about one blocker at a time is how a person ends up trying six times.
  if exists (select 1 from assignments where asset_id = p_asset) then
    holds := array_append(holds, 'an assignment');
  end if;
  if exists (select 1 from movements where asset_id = p_asset) then
    holds := array_append(holds, 'a movement');
  end if;
  if exists (select 1 from bast where asset_id = p_asset) then
    holds := array_append(holds, 'an E-BAST');
  end if;
  if exists (select 1 from documents where asset_id = p_asset) then
    holds := array_append(holds, 'a document');
  end if;
  if exists (select 1 from maintenance_records where asset_id = p_asset) then
    holds := array_append(holds, 'a maintenance record');
  end if;
  if exists (select 1 from asset_tags where asset_id = p_asset) then
    holds := array_append(holds, 'a printed label');
  end if;
  if exists (select 1 from asset_status_changes where asset_id = p_asset) then
    holds := array_append(holds, 'a status change');
  end if;

  if array_length(holds, 1) > 0 then
    raise exception
      'This asset has % behind it. Retire it instead — deleting it would leave those records pointing at nothing.',
      array_to_string(holds, ', ')
      using errcode = 'P0001';
  end if;

  -- Recorded BEFORE the row goes: the audit trigger fires on the delete itself,
  -- but a trigger cannot know why, and why is the only part worth reading here.
  insert into audit_log (action, table_name, record_id, target_label, old_value,
                         actor_id, actor_label)
  values (
    'asset_updated', 'assets', p_asset,
    a.asset_code || ' · ' || a.name || ' — deleted: ' || btrim(p_reason),
    to_jsonb(a),
    my_account_id(),
    (select coalesce(role::text, 'system') || ' · ' || full_name from v_me limit 1)
  );

  delete from assets where id = p_asset;

  return jsonb_build_object('assetCode', a.asset_code, 'deleted', true);
end $$;

revoke all on function delete_asset(uuid, text) from public, anon, authenticated;
grant execute on function delete_asset(uuid, text) to authenticated;
