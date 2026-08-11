-- ============================================================================
-- CITE Assets — 0037 Five photos, not ten
--
-- Client instruction, 2026-08-11: "maksimal 5 foto".
--
-- Migration 0036 picked ten out of the air. Five is the client's number, and
-- they are the one who has to scroll through them on a phone.
--
-- A separate migration because 0036 has already been applied — working rule #1.
--
-- Assets that already carry more than five keep them. Lowering a ceiling is not
-- a reason to delete somebody's photographs; the limit only refuses the NEXT
-- one, and the message says how to make room.
-- ============================================================================

create or replace function add_asset_photo(
  p_asset   uuid,
  p_path    text,
  p_caption text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare new_id uuid; next_pos int; total int;
begin
  if not exists (select 1 from assets where id = p_asset) then
    raise exception 'Asset not found' using errcode = 'P0001';
  end if;
  if not can_write_assets() or not can_see_asset(p_asset) then
    raise exception 'You do not have permission to change this asset' using errcode = 'P0001';
  end if;

  -- The path must live under this asset's folder, or one asset could be
  -- pointed at another asset's photo and sidestep the storage policies.
  if p_path is null or split_part(p_path, '/', 1) <> p_asset::text then
    raise exception 'Photo path does not belong to this asset' using errcode = 'P0001';
  end if;

  select count(*) into total from asset_photos where asset_id = p_asset;
  if total >= 5 then
    raise exception 'An asset can carry five photos. Remove one first.'
      using errcode = 'P0001';
  end if;

  select coalesce(max(sort_order), 0) + 1 into next_pos
    from asset_photos where asset_id = p_asset;

  insert into asset_photos (asset_id, file_path, sort_order, caption, created_by)
  values (p_asset, p_path, next_pos, nullif(btrim(coalesce(p_caption, '')), ''), my_account_id())
  returning id into new_id;

  return jsonb_build_object('id', new_id, 'filePath', p_path, 'position', next_pos);
end $$;

revoke all on function add_asset_photo(uuid, text, text) from public, anon, authenticated;
grant execute on function add_asset_photo(uuid, text, text) to authenticated;
