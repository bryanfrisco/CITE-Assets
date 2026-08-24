-- ============================================================================
-- CITE Assets — 0057 The BAST bucket lets an asset-less document be written
--
-- THE BUG
-- -------
-- Migration 0046 made bast.asset_id nullable and moved every policy on the
-- bast TABLES onto can_see_bast_row(). It missed the three policies on
-- storage.objects, which still resolve a file path to an asset and then ask
-- can_see_asset() — false when there is no asset.
--
-- So a BAST Perlengkapan could be raised, read, edited and signed, and then
-- failed at the last step with
--
--   new row violates row-level security policy   (AccessDenied, 403)
--
-- when generate-bast-pdf tried to upload bast/<id>/v1.pdf. The document
-- existed and could never become a PDF.
--
-- Found by rendering one, which was only possible once the local edge runtime
-- would start — reading the code had not shown it, because the code that was
-- wrong lives in a different migration from the one that changed.
--
-- THE FIX
-- -------
-- storage_bast_location_id() resolves the same path to the document's own
-- location, and the policies fall back to it exactly the way
-- can_see_bast_row() does for the tables. One rule, expressed twice, because
-- storage policies cannot see the bast row directly.
-- ============================================================================

create or replace function storage_bast_location_id(p_name text)
returns uuid language plpgsql stable as $$
begin
  return (select location_id from public.bast where id = (split_part(p_name, '/', 1))::uuid);
exception when others then
  return null;                                   -- malformed path -> no access
end $$;

-- Mirrors can_see_bast_row(): the asset decides when there is one, the
-- document's own location decides when there is not.
create or replace function can_see_bast_file(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when storage_bast_asset_id(p_name) is null
      then storage_bast_location_id(p_name) in (select my_location_ids())
    else can_see_asset(storage_bast_asset_id(p_name))
  end;
$$;

drop policy if exists bast_files_read   on storage.objects;
drop policy if exists bast_files_write  on storage.objects;
drop policy if exists bast_files_update on storage.objects;

create policy bast_files_read on storage.objects for select to authenticated
  using (bucket_id = 'bast' and can_see_bast_file(name));

create policy bast_files_write on storage.objects for insert to authenticated
  with check (bucket_id = 'bast' and can_write_assets() and can_see_bast_file(name));

create policy bast_files_update on storage.objects for update to authenticated
  using (bucket_id = 'bast' and can_write_assets() and can_see_bast_file(name));

-- Still no delete policy: a BAST version is evidence of a handover, the rows
-- are append-only (working rule #3), and the files behind them stay too.

revoke all on function storage_bast_location_id(text) from public, anon, authenticated;
revoke all on function can_see_bast_file(text)        from public, anon, authenticated;

grant execute on function storage_bast_location_id(text) to authenticated;
grant execute on function can_see_bast_file(text)        to authenticated;
