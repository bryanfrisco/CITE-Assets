-- ============================================================================
-- CITE Assets — 0058 Signing a BAST Perlengkapan no longer fails on documents
--
-- Second half of the same omission as migration 0057. Once the PDF could be
-- written to the bucket, signing still failed with
--
--   new row violates row-level security policy for table "documents"
--
-- because attach_signed_bast() mirrors every signed BAST onto the asset's
-- Documents tab, and documents.asset_id is NOT NULL. A BAST Perlengkapan has
-- no asset, so there is no tab to mirror onto and the insert cannot succeed.
--
-- The mirror is now conditional. Nothing is lost: that document is still
-- reachable from the E-BAST screen and recorded in bast_versions, which is
-- the append-only evidence trail. Only the convenience copy is skipped, and
-- only where it had nowhere to go.
--
-- Both halves were found by rendering a PDF, which became possible for the
-- first time once the local edge runtime would start.
--
-- Replaced in full, signature unchanged — replaces rather than overloads.
-- ============================================================================

create or replace function attach_signed_bast(
  p_bast uuid,
  p_path text,
  p_size bigint default null,
  p_mime text    default 'application/pdf'
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  b        bast%rowtype;
  me       uuid := my_account_id();
  next_ver int;
begin
  select * into b from bast where id = p_bast;
  if not found then
    raise exception 'BAST not found' using errcode = 'P0001';
  end if;
  if not can_write_assets() then
    raise exception 'You do not have permission to upload a signed BAST' using errcode = 'P0001';
  end if;
  if split_part(p_path, '/', 1) <> p_bast::text then
    raise exception 'File path does not belong to this BAST' using errcode = 'P0001';
  end if;

  select coalesce(max(version), 0) + 1 into next_ver from bast_versions where bast_id = p_bast;

  insert into bast_versions (bast_id, version, kind, file_path, file_size, mime_type, note, uploaded_by)
  values (p_bast, next_ver, 'signed', p_path, p_size, p_mime, 'Signed scan uploaded', me);

  update bast set status = 'signed', current_version = next_ver where id = p_bast;

  -- Mirror it onto the asset's Documents tab. A BAST Perlengkapan has no asset,
  -- so there is no tab to mirror onto — and documents.asset_id is NOT NULL, so
  -- attempting it fails the whole signing step. The document itself is still
  -- reachable from the E-BAST screen and from bast_versions.
  if b.asset_id is not null then
    insert into documents (asset_id, kind, title, file_path, file_size, mime_type, bast_id, uploaded_by)
    values (
      b.asset_id, 'signed_bast', 'Signed ' || b.bast_number,
      p_path, p_size, p_mime, p_bast, me
    );
  end if;

  return jsonb_build_object('bastId', p_bast, 'version', next_ver, 'status', 'signed');
end $$;

revoke all on function attach_signed_bast(uuid, text, bigint, text) from public, anon, authenticated;
grant execute on function attach_signed_bast(uuid, text, bigint, text) to authenticated;
