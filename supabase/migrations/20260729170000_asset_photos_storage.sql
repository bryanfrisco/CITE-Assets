-- ============================================================================
-- CITE Assets — 0011 asset photo storage  (Phase 3)
--
-- DATABASE.md §12: bucket `asset-photos`, path `<asset_id>/<uuid>.jpg`,
-- private, "authenticated read within scope, write for IT roles", short-lived
-- signed URLs for download.
--
-- The path's first segment is the asset id, which is what lets the policies
-- reuse can_see_asset() from migration 0002 — a Site IT user cannot read or
-- write a photo belonging to another location's asset.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'asset-photos', 'asset-photos', false,
  10485760,                                    -- 10 MB, DATABASE.md §12
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

-- storage.objects.name is '<asset_id>/<uuid>.jpg'; the id is the first folder.
create or replace function storage_asset_id(p_name text)
returns uuid language plpgsql immutable as $$
begin
  return (split_part(p_name, '/', 1))::uuid;
exception when others then
  return null;                                 -- malformed path -> no access
end $$;

create policy asset_photos_read on storage.objects for select to authenticated
  using (
    bucket_id = 'asset-photos'
    and can_see_asset(storage_asset_id(name))
  );

create policy asset_photos_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'asset-photos'
    and can_write_assets()
    and can_see_asset(storage_asset_id(name))
  );

create policy asset_photos_update on storage.objects for update to authenticated
  using (
    bucket_id = 'asset-photos'
    and can_write_assets()
    and can_see_asset(storage_asset_id(name))
  );

create policy asset_photos_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'asset-photos'
    and can_write_assets()
    and can_see_asset(storage_asset_id(name))
  );

-- ---------------------------------------------------------------------------
-- Recording the upload.
--
-- Working rule #2: the client uploads the bytes through the Storage API, then
-- calls this to attach the path — it never UPDATEs assets.photo_path directly,
-- so the audit trigger always sees a normal asset update.
-- ---------------------------------------------------------------------------
create or replace function set_asset_photo(p_asset uuid, p_path text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare old_path text;
begin
  select photo_path into old_path from assets where id = p_asset;
  if not found then
    raise exception 'Asset not found' using errcode = 'P0001';
  end if;

  -- The path must live under this asset's folder, or a user could point one
  -- asset at another asset's photo and sidestep the storage policies.
  if p_path is not null and split_part(p_path, '/', 1) <> p_asset::text then
    raise exception 'Photo path does not belong to this asset' using errcode = 'P0001';
  end if;

  update assets set photo_path = p_path where id = p_asset;

  return jsonb_build_object('id', p_asset, 'photoPath', p_path, 'previousPath', old_path);
end $$;

revoke all on function set_asset_photo(uuid, text) from anon, authenticated;
grant execute on function set_asset_photo(uuid, text) to authenticated;
