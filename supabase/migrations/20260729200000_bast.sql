-- ============================================================================
-- CITE Assets — 0013 BAST  (Phase 5)
--
-- Reads for the list and the paper preview, the `bast` storage bucket, and the
-- two write paths that record a file against a BAST.
--
-- NUMBERING
-- ---------
-- Nothing here generates a BAST number. `bast.bast_number` defaults to
-- next_bast_number() (migration 0001, made SECURITY DEFINER in 0009), so the
-- sequence is owned by the database and a client cannot influence it —
-- IMPLEMENTATION_PLAN.md § Phase 5, first bullet.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- "Pada hari ini, Jumat, 24 Juli 2026, …" — the opening sentence of the
-- document. Rendered here rather than on the client so the on-screen paper
-- preview and the generated PDF cannot drift apart.
-- ---------------------------------------------------------------------------
create or replace function indonesian_long_date(p_date date)
returns text language sql immutable set search_path = public as $$
  select (array[
           'Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'
         ])[extract(dow from p_date)::int + 1]
      || ', ' || extract(day from p_date)::int || ' '
      || (array[
           'Januari','Februari','Maret','April','Mei','Juni',
           'Juli','Agustus','September','Oktober','November','Desember'
         ])[extract(month from p_date)::int]
      || ' ' || extract(year from p_date)::int;
$$;

-- ---------------------------------------------------------------------------
-- README § BAST list — record cards and the three stat tiles.
-- ---------------------------------------------------------------------------
create or replace function bast_list(p_locations uuid[])
returns table (
  id uuid, bast_number text, status bast_status, bast_date date,
  asset_code text, asset_name text,
  employee_name text, department_name text, location_name text,
  current_version int
)
language sql stable security invoker set search_path = public as $$
  select
    b.id, b.bast_number, b.status, b.bast_date,
    a.asset_code, a.name,
    acc.full_name, d.name, l.name,
    b.current_version
  from bast b
  join assets    a   on a.id   = b.asset_id
  join accounts  acc on acc.id = b.account_id
  join locations l   on l.id   = b.location_id
  left join departments d on d.id = b.department_id
  where a.location_id = any (p_locations)
  order by b.bast_date desc, b.bast_number desc;
$$;

create or replace function bast_stats(p_locations uuid[])
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'total',    count(*),
    'signed',   count(*) filter (where b.status = 'signed'),
    'awaiting', count(*) filter (where b.status = 'awaiting_signature'),
    'draft',    count(*) filter (where b.status = 'draft')
  )
  from bast b join assets a on a.id = b.asset_id
  where a.location_id = any (p_locations);
$$;

-- ---------------------------------------------------------------------------
-- bast_detail() — everything the paper preview and the version rail render,
-- in one round trip. The `document` object is exactly the field set the
-- letterhead prints, so the Edge Function renders from the same source.
-- ---------------------------------------------------------------------------
create or replace function bast_detail(p_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare b bast%rowtype; result jsonb;
begin
  select * into b from bast where id = p_id;
  if not found then
    return null;                                 -- missing, or hidden by RLS
  end if;

  select jsonb_build_object(
    'id', b.id,
    'bastNumber', b.bast_number,
    'status', b.status,
    'bastDate', b.bast_date,
    'longDate', indonesian_long_date(b.bast_date),
    'currentVersion', b.current_version,
    'description', b.description,
    'assetId', b.asset_id,
    'assetCode', (select asset_code from assets where id = b.asset_id),
    'assetName', (select name from assets where id = b.asset_id),
    'employeeName', (select full_name from accounts where id = b.account_id),
    'departmentName', coalesce((select name from departments where id = b.department_id), '—'),
    'locationName', (select name from locations where id = b.location_id),
    'conditionText', coalesce(b.condition_text, 'Baik / Good'),
    -- "Yang Menyerahkan" — the Corporate IT staff member who raised it.
    'handedOverBy', coalesce((select full_name from accounts where id = b.created_by), 'Corporate IT'),
    'handedOverDept', coalesce(
      (select d.name from accounts acc left join departments d on d.id = acc.department_id
        where acc.id = b.created_by), 'Corporate IT'),

    'versions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', v.id,
        'version', v.version,
        'kind', v.kind,
        'filePath', v.file_path,
        'fileSize', v.file_size,
        'mimeType', v.mime_type,
        'note', v.note,
        -- README § Version history: "… — Dewi Lestari · Corporate IT" and
        -- "PDF generated (v1) — System · on assignment created".
        'uploadedByName', coalesce(
          (select full_name from accounts where id = v.uploaded_by), 'System'),
        'uploadedByDept', coalesce(
          (select d.name from accounts acc left join departments d on d.id = acc.department_id
            where acc.id = v.uploaded_by), 'on assignment created'),
        'createdAt', v.created_at
      ) order by v.version desc), '[]'::jsonb)
      from bast_versions v where v.bast_id = b.id
    )
  ) into result;

  return result;
end $$;

-- ---------------------------------------------------------------------------
-- Storage — DATABASE.md §12: bucket `bast`, path `<bast_id>/v<n>.pdf`,
-- private, 10 MB, signed URLs for download.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bast', 'bast', false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;

create or replace function storage_bast_asset_id(p_name text)
returns uuid language plpgsql stable as $$
begin
  return (select asset_id from public.bast where id = (split_part(p_name, '/', 1))::uuid);
exception when others then
  return null;                                   -- malformed path -> no access
end $$;

-- Same reasoning as the asset-photos policies: the first path segment
-- identifies the record, which resolves to an asset, which can_see_asset()
-- then checks against the caller's own locations.
create policy bast_files_read on storage.objects for select to authenticated
  using (bucket_id = 'bast' and can_see_asset(storage_bast_asset_id(name)));

create policy bast_files_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'bast'
    and can_write_assets()
    and can_see_asset(storage_bast_asset_id(name))
  );

create policy bast_files_update on storage.objects for update to authenticated
  using (
    bucket_id = 'bast'
    and can_write_assets()
    and can_see_asset(storage_bast_asset_id(name))
  );

-- No delete policy: a BAST version is evidence of a handover. The rows are
-- append-only (working rule #3), so the files behind them stay too.

-- ---------------------------------------------------------------------------
-- attach_generated_bast() — called by the generate-bast-pdf Edge Function once
-- the PDF is in the bucket.
--
-- Idempotent: v1 is "the generated PDF" and regenerating overwrites the same
-- object in storage rather than growing the version history, which is why
-- bast_versions never has to be updated (it cannot be).
-- ---------------------------------------------------------------------------
create or replace function attach_generated_bast(
  p_bast uuid,
  p_path text,
  p_size bigint default null
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare b bast%rowtype; existing bast_versions%rowtype;
begin
  select * into b from bast where id = p_bast;
  if not found then
    raise exception 'BAST not found' using errcode = 'P0001';
  end if;
  if not can_write_assets() then
    raise exception 'You do not have permission to generate this document' using errcode = 'P0001';
  end if;
  if split_part(p_path, '/', 1) <> p_bast::text then
    raise exception 'File path does not belong to this BAST' using errcode = 'P0001';
  end if;

  select * into existing from bast_versions where bast_id = p_bast and version = 1;
  if not found then
    insert into bast_versions (bast_id, version, kind, file_path, file_size, mime_type, note, uploaded_by)
    values (p_bast, 1, 'generated', p_path, p_size, 'application/pdf', 'PDF generated (v1)', null);
  end if;

  -- A draft that now has a document is waiting for a signature.
  if b.status = 'draft' then
    update bast set status = 'awaiting_signature' where id = p_bast;
  end if;

  return jsonb_build_object('bastId', p_bast, 'version', 1, 'filePath', p_path);
end $$;

-- ---------------------------------------------------------------------------
-- attach_signed_bast() — DATABASE.md §7, last paragraph:
--
--   "insert a bast_versions row with kind = 'signed', bump bast.current_version,
--    set bast.status = 'signed', and also insert a documents row of kind
--    signed_bast so the file appears on the asset's Documents tab."
--
-- Four tables, one transaction — exactly the case working rule #2 exists for.
-- ---------------------------------------------------------------------------
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

  insert into documents (asset_id, kind, title, file_path, file_size, mime_type, bast_id, uploaded_by)
  values (
    b.asset_id, 'signed_bast', 'Signed ' || b.bast_number,
    p_path, p_size, p_mime, p_bast, me
  );

  return jsonb_build_object('bastId', p_bast, 'version', next_ver, 'status', 'signed');
end $$;

revoke all on function indonesian_long_date(date)                from anon, authenticated;
revoke all on function bast_list(uuid[])                         from anon, authenticated;
revoke all on function bast_stats(uuid[])                        from anon, authenticated;
revoke all on function bast_detail(uuid)                         from anon, authenticated;
revoke all on function attach_generated_bast(uuid, text, bigint) from anon, authenticated;
revoke all on function attach_signed_bast(uuid, text, bigint, text) from anon, authenticated;

grant execute on function indonesian_long_date(date)                to authenticated;
grant execute on function bast_list(uuid[])                         to authenticated;
grant execute on function bast_stats(uuid[])                        to authenticated;
grant execute on function bast_detail(uuid)                         to authenticated;
grant execute on function attach_generated_bast(uuid, text, bigint) to authenticated;
grant execute on function attach_signed_bast(uuid, text, bigint, text) to authenticated;
