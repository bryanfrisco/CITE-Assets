-- ============================================================================
-- CITE Assets — 0047 Accessories on an existing BAST
--
-- Two loose ends left by 0046.
--
-- 1. set_bast_items() still asked can_see_asset(b.asset_id). On a BAST
--    Perlengkapan that is null, so the one document whose entire content IS
--    the goods table was the one document whose goods table could not be
--    edited. It now uses the same can_see_bast_row() as the policies.
--
-- 2. Accessories handed out alongside a laptop need to land on that laptop's
--    BAST. Doing it by widening assign_asset() would have changed a live
--    signature — the mistake migration 0029 exists to clean up after — so this
--    is a separate call the wizard makes after the assignment succeeds.
--
--    It APPENDS rather than replacing, because the asset's own line is already
--    there and set_bast_items() would wipe it.
-- ============================================================================

create or replace function set_bast_items(p_bast uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b     bast%rowtype;
  item  jsonb;
  n     int := 0;
  jenis text;
begin
  select * into b from bast where id = p_bast;
  if not found then
    raise exception 'BAST not found' using errcode = 'P0001';
  end if;
  if not can_write_assets() or not can_see_bast_row(b.asset_id, b.location_id) then
    raise exception 'You do not have permission to change this document' using errcode = 'P0001';
  end if;
  -- A signed document is evidence. Its contents stop being editable the moment
  -- somebody put their name to them.
  if b.status = 'signed' then
    raise exception 'This BAST is already signed — its contents cannot change'
      using errcode = 'P0001';
  end if;

  if jsonb_typeof(coalesce(p_items, 'null'::jsonb)) <> 'array' then
    raise exception 'Expected a list of items' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) > 20 then
    raise exception 'A BAST cannot list more than 20 items' using errcode = 'P0001';
  end if;

  delete from bast_items where bast_id = p_bast;

  for item in select * from jsonb_array_elements(p_items) loop
    jenis := btrim(coalesce(item ->> 'jenis', ''));
    if jenis = '' then
      raise exception 'Every line needs a Jenis/Type' using errcode = 'P0001';
    end if;
    n := n + 1;
    insert into bast_items (bast_id, position, jenis, serial_number, kondisi)
    values (
      p_bast, n, jenis,
      nullif(btrim(coalesce(item ->> 'serial', '')), ''),
      coalesce(nullif(btrim(coalesce(item ->> 'kondisi', '')), ''), 'Baik')
    );
  end loop;

  return jsonb_build_object('bastId', p_bast, 'items', n);
end $$;


-- ---------------------------------------------------------------------------
-- attach_accessories_to_bast()
--
-- Stock has already moved by the time this runs — assign_accessory() did that.
-- All this does is put the lines on the paper, so a failure here cannot leave
-- the shelf count disagreeing with the register.
-- ---------------------------------------------------------------------------
create or replace function attach_accessories_to_bast(
  p_bast      uuid,
  p_checkouts uuid[]
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b       bast%rowtype;
  pos     int;
  n       int;
  added   int := 0;
  row_rec record;
begin
  select * into b from bast where id = p_bast;
  if not found then
    raise exception 'BAST not found' using errcode = 'P0001';
  end if;
  if not can_write_assets() or not can_see_bast_row(b.asset_id, b.location_id) then
    raise exception 'You do not have permission to change this document'
      using errcode = 'P0001';
  end if;
  if b.status = 'signed' then
    raise exception 'This BAST is already signed — its contents cannot change'
      using errcode = 'P0001';
  end if;
  if p_checkouts is null or array_length(p_checkouts, 1) is null then
    return jsonb_build_object('bastId', p_bast, 'added', 0);
  end if;

  -- The hand-outs must be this document's recipient, still out, and not
  -- already on some other document.
  select count(*) into n
  from accessory_checkouts co
  where co.id = any (p_checkouts)
    and co.account_id = b.account_id
    and co.state = 'active'
    and co.bast_id is null;
  if n <> array_length(p_checkouts, 1) then
    raise exception 'Some of those are already on a document, returned, or somebody else''s'
      using errcode = 'P0001';
  end if;

  -- The asset's own line is already row 1; carry on from wherever the list ends.
  select coalesce(max(position), 0) into pos from bast_items where bast_id = p_bast;

  -- If nothing has ever been written, bast_detail() has been falling back to
  -- the asset row. Write that line out first, or appending would silently
  -- replace it with only the accessories.
  if pos = 0 and b.asset_id is not null then
    pos := 1;
    insert into bast_items (bast_id, position, jenis, serial_number, kondisi)
    select p_bast, 1, a.name, a.serial_number, coalesce(b.condition_text, 'Baik')
    from assets a where a.id = b.asset_id;
  end if;

  for row_rec in
    select co.id, co.qty, a.name, a.model_no
    from accessory_checkouts co join accessories a on a.id = co.accessory_id
    where co.id = any (p_checkouts)
    order by a.name
  loop
    pos := pos + 1;
    if pos > 20 then
      raise exception 'A BAST cannot list more than 20 items' using errcode = 'P0001';
    end if;
    insert into bast_items (bast_id, position, jenis, serial_number, kondisi)
    values (
      p_bast, pos,
      row_rec.name || coalesce(' (' || row_rec.model_no || ')', '') || ' × ' || row_rec.qty,
      null, 'Baik'
    );
    update accessory_checkouts set bast_id = p_bast where id = row_rec.id;
    added := added + 1;
  end loop;

  return jsonb_build_object('bastId', p_bast, 'added', added, 'items', pos);
end $$;

revoke all on function attach_accessories_to_bast(uuid, uuid[]) from public, anon, authenticated;
grant execute on function attach_accessories_to_bast(uuid, uuid[]) to authenticated;
