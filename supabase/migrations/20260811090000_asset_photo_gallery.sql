-- ============================================================================
-- CITE Assets — 0036 An asset has photos, not a photo
--
-- Client instruction, 2026-08-11:
--   "kasih opsi penambahan foto dan penghapusan foto serta carousel"
--
-- WHY A TABLE AND NOT MORE COLUMNS
-- --------------------------------
-- `assets.photo_path` is one text column. A laptop needs the lid, the label,
-- the port that is broken and the dent it arrived with — four photos, and the
-- fourth is the one somebody wants six months later when the vendor argues
-- about who broke it.
--
-- WHAT HAPPENS TO photo_path
-- --------------------------
-- It stays, and it stays meaningful: it is the COVER. The register list, the
-- search results and the asset card all read it, and rewriting every one of
-- them to fetch a collection so they can show one thumbnail would be a lot of
-- churn for no gain. A trigger keeps it equal to the first photo, so it can
-- never drift from the gallery and no caller has to remember to update it.
--
-- DELETING
-- --------
-- The row goes and the FILE goes. A photo is not a record of anything — unlike
-- a movement or a BAST version, nobody's account of events depends on it, and
-- keeping orphaned bytes in a private bucket forever is just cost. The client
-- deletes the object through the Storage API, which is already policed by the
-- asset_photos_delete policy from migration 0011; this function removes the row
-- and re-numbers what is left.
-- ============================================================================

create table if not exists asset_photos (
  id         uuid primary key default gen_random_uuid(),
  asset_id   uuid not null references assets(id) on delete cascade,
  -- storage: asset-photos/<asset_id>/<epoch>.jpg
  file_path  text not null unique,
  sort_order   int  not null default 1,
  caption    text,
  created_at timestamptz not null default now(),
  created_by uuid references accounts(id)
);

create index if not exists asset_photos_asset_idx on asset_photos (asset_id, sort_order);

alter table asset_photos enable row level security;

drop policy if exists asset_photos_rows_read on asset_photos;
create policy asset_photos_rows_read on asset_photos for select to authenticated
  using (can_see_asset(asset_id));

grant select on asset_photos to authenticated;
-- Writes go through the two RPCs below (working rule #2), so a row can never
-- point at a file outside its own asset's folder.
revoke insert, update, delete on asset_photos from public, anon, authenticated;

/**
 * The cover is the first photo, always.
 *
 * Enforced by a trigger rather than by each caller remembering, because the
 * one thing worse than an asset with no thumbnail is an asset whose thumbnail
 * is a photo that was deleted.
 */
create or replace function sync_asset_cover() returns trigger
language plpgsql security definer set search_path = public as $$
declare target uuid; cover text;
begin
  target := coalesce(new.asset_id, old.asset_id);
  select file_path into cover
    from asset_photos where asset_id = target
    order by sort_order, created_at limit 1;
  update assets set photo_path = cover where id = target;
  return null;
end $$;

drop trigger if exists asset_photos_cover on asset_photos;
create trigger asset_photos_cover
  after insert or update or delete on asset_photos
  for each row execute function sync_asset_cover();


-- ---------------------------------------------------------------------------
-- Adding. The bytes are already in the bucket by the time this runs — the
-- client uploads through the Storage API, which the policies from migration
-- 0011 already gate on can_write_assets() and can_see_asset().
-- ---------------------------------------------------------------------------
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
  if total >= 10 then
    raise exception 'An asset can carry ten photos. Remove one first.'
      using errcode = 'P0001';
  end if;

  select coalesce(max(sort_order), 0) + 1 into next_pos
    from asset_photos where asset_id = p_asset;

  insert into asset_photos (asset_id, file_path, sort_order, caption, created_by)
  values (p_asset, p_path, next_pos, nullif(btrim(coalesce(p_caption, '')), ''), my_account_id())
  returning id into new_id;

  return jsonb_build_object('id', new_id, 'filePath', p_path, 'position', next_pos);
end $$;

/**
 * Removing. Returns the path so the caller knows which object to delete from
 * the bucket — the row and the file go together, and the row goes first so a
 * failed delete leaves bytes rather than a broken thumbnail.
 */
create or replace function remove_asset_photo(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ph asset_photos%rowtype; i int := 0; r record;
begin
  select * into ph from asset_photos where id = p_id;
  if not found then
    raise exception 'Photo not found' using errcode = 'P0001';
  end if;
  if not can_write_assets() or not can_see_asset(ph.asset_id) then
    raise exception 'You do not have permission to change this asset' using errcode = 'P0001';
  end if;

  delete from asset_photos where id = p_id;

  -- Close the gap, so positions stay 1..n and "first" keeps meaning first.
  for r in
    select id from asset_photos where asset_id = ph.asset_id order by sort_order, created_at
  loop
    i := i + 1;
    update asset_photos set sort_order = i where id = r.id;
  end loop;

  return jsonb_build_object('assetId', ph.asset_id, 'filePath', ph.file_path, 'remaining', i);
end $$;

/** Every photo on an asset, cover first. */
create or replace function asset_photos_list(p_asset uuid)
returns table (id uuid, file_path text, sort_order int, caption text, created_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select p.id, p.file_path, p.sort_order, p.caption, p.created_at
  from asset_photos p
  where p.asset_id = p_asset and can_see_asset(p.asset_id)
  order by p.sort_order, p.created_at;
$$;


-- ---------------------------------------------------------------------------
-- Existing single photos become the first entry in their own gallery, so an
-- asset photographed before today does not appear to have lost its picture.
-- ---------------------------------------------------------------------------
insert into asset_photos (asset_id, file_path, sort_order, created_by)
select a.id, a.photo_path, 1, a.created_by
from assets a
where a.photo_path is not null
  and not exists (select 1 from asset_photos p where p.file_path = a.photo_path)
on conflict (file_path) do nothing;


revoke all on function add_asset_photo(uuid, text, text)  from public, anon, authenticated;
revoke all on function remove_asset_photo(uuid)           from public, anon, authenticated;
revoke all on function asset_photos_list(uuid)            from public, anon, authenticated;
revoke all on function sync_asset_cover()                 from public, anon, authenticated;

grant execute on function add_asset_photo(uuid, text, text) to authenticated;
grant execute on function remove_asset_photo(uuid)          to authenticated;
grant execute on function asset_photos_list(uuid)           to authenticated;
-- sync_asset_cover() is a trigger function. No grant: it is never called.
