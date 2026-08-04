-- ============================================================================
-- CITE Assets — 0032 The real BAST, the return BAST, and maintenance moving
--                    the asset's own status
--
-- Four things reported on 2026-08-04, with two scanned documents attached as
-- the reference. Everything here exists to make the generated document match
-- those two sheets rather than approximate them.
--
-- 1. "BISA BIKIN SEPERTI INI?? PERSIS"
-- -----------------------------------
-- The scans are not the layout this project has been printing. The differences
-- that matter are structural, not cosmetic:
--
--   * the letterhead is ASPIRE ONLY — no CITE roundel, no "CORPORATE IT" line
--   * the date is SPELLED OUT: "tanggal Dua puluh lima Bulan Mei Tahun Dua ribu
--     dua puluh enam", so the database needs terbilang()
--   * the receiver is a four-line block — Nama, NIK, Jabatan, Dept./Divisi —
--     and `Jabatan` is a field this schema never had
--   * the detail table is NOT a key/value list. It is a numbered goods table:
--     No | Jenis/Type | Serial Number | Kondisi, and the scan carries THREE
--     rows for one handover (laptop, charger, mouse). A BAST covers one asset
--     plus whatever went in the bag with it, and until now there was nowhere to
--     put the charger.
--   * the closing paragraph, the "Jakarta, 25 Mei 2026" place line, and the
--     company footer are all fixed copy that has to come from somewhere
--
-- 2. "DIMANA BAST YANG LAINNYA SEPERTI BERITA ACARA PENARIKAN BARANG"
-- ------------------------------------------------------------------
-- Nowhere — only the handover existed. return_asset() closed the assignment
-- and freed the asset without producing a document, so a device coming back
-- had no paper behind it. `bast.kind` and the auto-BAST on return fix that.
--
-- The two documents are the same sheet with four differences, which is why one
-- renderer handles both: the title, the verb in the opening sentence, the verb
-- in the second paragraph, and the two signature captions. Note from the scans
-- that the LEFT column is the CITE/IT side in BOTH — it is captioned "Yang
-- Menyerahkan" on a handover and "Yang Menerima" on a withdrawal.
--
-- 3. "KENAPA ASSET DI MAINTENANCE SUDAH OPEN A JOB, STATUS ASSET MASIH
--     AVAILABLE"
-- -------------------------------------------------------------------
-- Because migration 0030 deliberately cut every link between a maintenance
-- record and the asset's status, and that over-corrected. The bug it was
-- fixing was one-directional: opening a repair set Maintenance and CLOSING IT
-- CLEARED NOTHING, so assets stayed stuck. Cutting the link stopped the
-- sticking and also stopped the part that was right.
--
-- The round trip is what was missing, so this restores both halves at once:
--
--   record opened (no end date)  ->  status becomes Maintenance
--   record closed (end date set) ->  status returns to Assigned if somebody
--                                    still holds it, otherwise Available
--
-- and every hop is written to asset_status_changes with a reason, so the
-- timeline says a repair moved it rather than a person. Terminal statuses
-- (Lost, Retired) are left alone — a disposed asset does not come back because
-- a repair record was closed.
--
-- 4. LABELS
-- ---------
-- Search and the symbol preview are screen work; nothing here.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- terbilang() — Indonesian numbers in words.
--
-- Built lowercase and capitalised at the edge, because the join words stay
-- lowercase in the middle of a sentence: "Dua ribu dua puluh enam", not "Dua
-- Ribu Dua Puluh Enam". That is how the scanned document reads.
-- ---------------------------------------------------------------------------
create or replace function terbilang(n bigint)
returns text language plpgsql immutable set search_path = public as $$
declare
  ones text[] := array[
    'nol','satu','dua','tiga','empat','lima',
    'enam','tujuh','delapan','sembilan','sepuluh','sebelas'
  ];
begin
  if n is null then return ''; end if;
  if n < 0    then return 'minus ' || terbilang(-n); end if;
  if n < 12   then return ones[n + 1]; end if;
  if n < 20   then return terbilang(n - 10) || ' belas'; end if;

  if n < 100 then
    return terbilang(n / 10) || ' puluh'
        || case when n % 10 = 0 then '' else ' ' || terbilang(n % 10) end;
  end if;

  -- 'seratus' and 'seribu', never 'satu ratus' / 'satu ribu'.
  if n < 200 then
    return 'seratus' || case when n % 100 = 0 then '' else ' ' || terbilang(n % 100) end;
  end if;
  if n < 1000 then
    return terbilang(n / 100) || ' ratus'
        || case when n % 100 = 0 then '' else ' ' || terbilang(n % 100) end;
  end if;
  if n < 2000 then
    return 'seribu' || case when n % 1000 = 0 then '' else ' ' || terbilang(n % 1000) end;
  end if;
  if n < 1000000 then
    return terbilang(n / 1000) || ' ribu'
        || case when n % 1000 = 0 then '' else ' ' || terbilang(n % 1000) end;
  end if;

  return terbilang(n / 1000000) || ' juta'
      || case when n % 1000000 = 0 then '' else ' ' || terbilang(n % 1000000) end;
end $$;

create or replace function terbilang_kapital(n bigint)
returns text language sql immutable set search_path = public as $$
  select upper(left(terbilang(n), 1)) || substr(terbilang(n), 2);
$$;

-- ---------------------------------------------------------------------------
-- "Senin tanggal Dua puluh lima Bulan Mei Tahun Dua ribu dua puluh enam"
--
-- indonesian_long_date() from migration 0013 stays exactly as it is — it is the
-- short form the app still shows in places. This is the long form the paper
-- wants, and having both means neither has to compromise.
-- ---------------------------------------------------------------------------
create or replace function indonesian_date_words(p_date date)
returns text language sql immutable set search_path = public as $$
  select (array['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'])
           [extract(dow from p_date)::int + 1]
      || ' tanggal ' || terbilang_kapital(extract(day from p_date)::bigint)
      || ' Bulan '   || (array[
                          'Januari','Februari','Maret','April','Mei','Juni',
                          'Juli','Agustus','September','Oktober','November','Desember'
                        ])[extract(month from p_date)::int]
      || ' Tahun '   || terbilang_kapital(extract(year from p_date)::bigint);
$$;

-- The place line: "Jakarta, 25 Mei 2026".
create or replace function indonesian_short_date(p_date date)
returns text language sql immutable set search_path = public as $$
  select extract(day from p_date)::int || ' '
      || (array[
           'Januari','Februari','Maret','April','Mei','Juni',
           'Juli','Agustus','September','Oktober','November','Desember'
         ])[extract(month from p_date)::int]
      || ' ' || extract(year from p_date)::int;
$$;


-- ---------------------------------------------------------------------------
-- Jabatan. The scans carry it as its own line, distinct from Dept./Divisi:
-- "Jabatan: Legal Officer" above "Dept./Divisi: Corporate Legal".
-- ---------------------------------------------------------------------------
alter table accounts add column if not exists job_title text;

-- ---------------------------------------------------------------------------
-- Who the company is, on the sheet.
--
-- Per LOCATION rather than one global row, because the second paragraph names
-- the office — "PT. Stargate Pasific Resources Head Office Jakarta Selatan" —
-- and a BAST raised at Site should not claim Jakarta. The footer address is the
-- registered company address and is the same on both, exactly as in the scan.
-- ---------------------------------------------------------------------------
alter table locations add column if not exists company_name text;
alter table locations add column if not exists office_label text;
alter table locations add column if not exists signing_city text;
alter table locations add column if not exists address_line text;

update locations set
  company_name = coalesce(company_name, 'PT. Stargate Pasific Resources'),
  office_label = coalesce(
    office_label,
    case when code = 'HO' then 'Head Office Jakarta Selatan' else 'Site Konawe Utara' end
  ),
  signing_city = coalesce(
    signing_city,
    coalesce(city, case when code = 'HO' then 'Jakarta' else 'Konawe Utara' end)
  ),
  address_line = coalesce(
    address_line,
    'Desa Molore, Kecamatan Langgikima, Kabupaten Konawe Utara, Provinsi Sulawesi Tenggara'
  );


-- ---------------------------------------------------------------------------
-- Handover or withdrawal.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'bast_kind') then
    create type bast_kind as enum ('handover', 'return');
  end if;
end $$;

alter table bast add column if not exists kind bast_kind not null default 'handover';


-- ---------------------------------------------------------------------------
-- The goods table.
--
-- One BAST covers one asset, and that has not changed — bast.asset_id is still
-- the record's subject and still what RLS resolves through. What the scans add
-- is that the SHEET lists everything that physically changed hands, and the
-- charger and the mouse are not assets in their own right. They have no serial,
-- no code, and nobody wants them in the register; they only exist on the paper.
--
-- So these rows are document lines, not inventory. Deliberately so.
-- ---------------------------------------------------------------------------
create table if not exists bast_items (
  id            uuid primary key default gen_random_uuid(),
  bast_id       uuid not null references bast(id) on delete cascade,
  position      int  not null default 1,
  jenis         text not null,                  -- "HP Laptop 14-ep1188TU"
  serial_number text,                           -- null prints as "-"
  kondisi       text not null default 'Baik',
  created_at    timestamptz not null default now()
);

create index if not exists bast_items_bast_idx on bast_items (bast_id, position);

alter table bast_items enable row level security;

drop policy if exists bast_items_read on bast_items;
create policy bast_items_read on bast_items for select to authenticated
  using (can_see_asset((select asset_id from bast where id = bast_id)));

grant select on bast_items to authenticated;
-- Writes go through set_bast_items() only (working rule #2). Unlike movements
-- these are NOT append-only: the list is part of a draft document and gets
-- corrected before anyone signs it. What stops it changing afterwards is the
-- status guard in the RPC, not a trigger.
revoke insert, update, delete on bast_items from public, anon, authenticated;

/**
 * Replaces the whole goods list in one call.
 *
 * Replace rather than add/remove because the client edits the table as a table:
 * three rows in, three rows out, and no way to end up with a stale line because
 * one of four calls failed.
 */
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
  if not can_write_assets() or not can_see_asset(b.asset_id) then
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

revoke all on function set_bast_items(uuid, jsonb) from public, anon, authenticated;
grant execute on function set_bast_items(uuid, jsonb) to authenticated;


-- ---------------------------------------------------------------------------
-- bast_detail() — replaced whole, because a function is replaced as a unit.
--
-- Everything the two scanned sheets print now comes from here, so the on-screen
-- preview and the PDF cannot drift: same sentence, same words for the date,
-- same goods table, same footer.
-- ---------------------------------------------------------------------------
create or replace function bast_detail(p_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare b bast%rowtype; loc locations%rowtype; acct accounts%rowtype; result jsonb;
begin
  select * into b from bast where id = p_id;
  if not found then
    return null;                                 -- missing, or hidden by RLS
  end if;

  select * into loc  from locations where id = b.location_id;
  select * into acct from accounts  where id = b.account_id;

  select jsonb_build_object(
    'id', b.id,
    'bastNumber', b.bast_number,
    'kind', b.kind,
    'status', b.status,
    'bastDate', b.bast_date,
    'longDate', indonesian_long_date(b.bast_date),
    -- The two forms the paper uses, spelled out in SQL so nothing downstream
    -- has to reimplement Indonesian numbers.
    'dateWords', indonesian_date_words(b.bast_date),
    'placeDate', coalesce(loc.signing_city, loc.city, loc.name) || ', '
                 || indonesian_short_date(b.bast_date),
    'currentVersion', b.current_version,
    'description', b.description,
    'assetId', b.asset_id,
    'assetCode', (select asset_code from assets where id = b.asset_id),
    'assetName', (select name from assets where id = b.asset_id),

    -- The four-line receiver block from the scans.
    'employeeName', acct.full_name,
    'employeeNik', coalesce(acct.nik, '-'),
    'employeeTitle', coalesce(nullif(btrim(coalesce(acct.job_title, '')), ''), '-'),
    'departmentName', coalesce((select name from departments where id = b.department_id), '-'),

    'locationName', loc.name,
    'companyName', coalesce(loc.company_name, 'PT. Stargate Pasific Resources'),
    'officeLabel', coalesce(loc.office_label, loc.name),
    'addressLine', coalesce(loc.address_line, ''),
    'conditionText', coalesce(b.condition_text, 'Baik / Good'),

    -- The CITE side. On a handover this is "Yang Menyerahkan"; on a withdrawal
    -- the same person is "Yang Menerima". The caption is the renderer's job.
    'handedOverBy', coalesce((select full_name from accounts where id = b.created_by), 'Corporate IT'),
    'handedOverDept', coalesce(
      (select d.name from accounts acc left join departments d on d.id = acc.department_id
        where acc.id = b.created_by), 'Corporate IT'),

    -- The goods table. Falls back to the asset itself when nobody has edited
    -- the list, so every BAST ever raised has at least its one true line
    -- without needing a backfill.
    'items', coalesce(
      (select jsonb_agg(
                jsonb_build_object(
                  'jenis', i.jenis,
                  'serial', coalesce(i.serial_number, '-'),
                  'kondisi', i.kondisi
                ) order by i.position, i.created_at)
       from bast_items i where i.bast_id = b.id),
      (select jsonb_build_array(jsonb_build_object(
                'jenis', a.name,
                'serial', coalesce(a.serial_number, '-'),
                'kondisi', coalesce(b.condition_text, 'Baik')
              ))
       from assets a where a.id = b.asset_id)
    ),

    'signatures', (
      select coalesce(jsonb_object_agg(s.role, jsonb_build_object(
        'signerName', s.signer_name,
        'signerTitle', s.signer_title,
        'strokes', s.strokes,
        'signedAt', s.signed_at,
        'recordedByName', coalesce(
          (select full_name from accounts where id = s.recorded_by), 'System')
      )), '{}'::jsonb)
      from (
        select distinct on (role) *
        from bast_signatures
        where bast_id = b.id
        order by role, signed_at desc
      ) s
    ),

    'versions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', v.id,
        'version', v.version,
        'kind', v.kind,
        'filePath', v.file_path,
        'fileSize', v.file_size,
        'mimeType', v.mime_type,
        'note', v.note,
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

-- The list gains `kind` so the two document types can be told apart and
-- filtered. Dropped first: a RETURNS TABLE cannot gain a column in place.
drop function if exists bast_list(uuid[]);
create or replace function bast_list(p_locations uuid[], p_kind text default null)
returns table (
  id uuid, bast_number text, kind bast_kind, status bast_status, bast_date date,
  asset_code text, asset_name text,
  employee_name text, department_name text, location_name text,
  current_version int
)
language sql stable security invoker set search_path = public as $$
  select
    b.id, b.bast_number, b.kind, b.status, b.bast_date,
    a.asset_code, a.name,
    acc.full_name, d.name, l.name,
    b.current_version
  from bast b
  join assets    a   on a.id   = b.asset_id
  join accounts  acc on acc.id = b.account_id
  join locations l   on l.id   = b.location_id
  left join departments d on d.id = b.department_id
  where a.location_id = any (p_locations)
    and (p_kind is null or b.kind::text = p_kind)
  order by b.bast_date desc, b.bast_number desc;
$$;

create or replace function bast_stats(p_locations uuid[])
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'total',    count(*),
    'signed',   count(*) filter (where b.status = 'signed'),
    'awaiting', count(*) filter (where b.status = 'awaiting_signature'),
    'draft',    count(*) filter (where b.status = 'draft'),
    'handover', count(*) filter (where b.kind = 'handover'),
    'returns',  count(*) filter (where b.kind = 'return')
  )
  from bast b join assets a on a.id = b.asset_id
  where a.location_id = any (p_locations);
$$;

revoke all on function terbilang(bigint)                from public, anon, authenticated;
revoke all on function terbilang_kapital(bigint)        from public, anon, authenticated;
revoke all on function indonesian_date_words(date)      from public, anon, authenticated;
revoke all on function indonesian_short_date(date)      from public, anon, authenticated;
revoke all on function bast_list(uuid[], text)          from public, anon, authenticated;
revoke all on function bast_stats(uuid[])               from public, anon, authenticated;
revoke all on function bast_detail(uuid)                from public, anon, authenticated;

grant execute on function terbilang(bigint)             to authenticated;
grant execute on function terbilang_kapital(bigint)     to authenticated;
grant execute on function indonesian_date_words(date)   to authenticated;
grant execute on function indonesian_short_date(date)   to authenticated;
grant execute on function bast_list(uuid[], text)       to authenticated;
grant execute on function bast_stats(uuid[])            to authenticated;
grant execute on function bast_detail(uuid)             to authenticated;


-- ---------------------------------------------------------------------------
-- return_asset() — now raises the withdrawal BAST.
--
-- The 4-argument form is DROPPED rather than left beside this one. Migration
-- 0029 exists because two overloads of search_assets() both matched a call with
-- named arguments and every search broke with "function is not unique"; adding
-- a defaulted parameter to a function the client calls by name is exactly that
-- mistake again.
-- ---------------------------------------------------------------------------
drop function if exists return_asset(uuid, date, uuid, text);

create or replace function return_asset(
  p_asset     uuid,
  p_date      date,
  p_condition uuid,
  p_notes     text    default null,
  p_auto_bast boolean default true
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  asg          assignments%rowtype;
  a            assets%rowtype;
  acct         accounts%rowtype;
  me           uuid := my_account_id();
  available_id uuid;
  cond_name    text;
  clean_notes  text := nullif(btrim(coalesce(p_notes, '')), '');
  v_bast_id    uuid;
  v_bast       text;
begin
  if not can_write_assets() then
    raise exception 'You do not have permission to return assets' using errcode = 'P0001';
  end if;
  if p_asset is null then
    raise exception 'Select an asset to continue' using errcode = 'P0001';
  end if;
  if p_date is null then
    raise exception 'Assignment date is required' using errcode = 'P0001';
  end if;
  if not can_see_asset(p_asset) then
    raise exception 'Asset not found' using errcode = 'P0001';
  end if;

  select * into asg from assignments where asset_id = p_asset and state = 'active';
  if not found then
    raise exception 'This asset has no active assignment' using errcode = 'P0001';
  end if;
  if p_date < asg.assigned_date then
    raise exception 'Return date cannot be before the assignment date' using errcode = 'P0001';
  end if;

  select * into a    from assets   where id = p_asset;
  select * into acct from accounts where id = asg.account_id;

  select id into available_id from asset_statuses where name = 'Available';
  if available_id is null then
    raise exception 'The "Available" status is missing from master data' using errcode = 'P0001';
  end if;

  update assignments set
    returned_date = p_date,
    state         = 'returned',
    notes         = case
                      when clean_notes is null then notes
                      else coalesce(notes || E'\n', '') || clean_notes
                    end
  where id = asg.id;

  update assets set
    assigned_to  = null,
    status_id    = available_id,
    condition_id = coalesce(p_condition, condition_id)
  where id = p_asset;

  -- "Berita Acara Penarikan Barang" — the sheet that says the device came back.
  -- Same table, same numbering sequence, same signature flow; only `kind`
  -- differs, and the renderer reads that to pick its captions.
  if coalesce(p_auto_bast, true) then
    select name into cond_name
      from asset_conditions where id = coalesce(p_condition, a.condition_id);

    insert into bast (
      assignment_id, asset_id, account_id, department_id, location_id,
      bast_date, description, condition_text, kind, status, created_by
    ) values (
      asg.id, p_asset, asg.account_id, coalesce(asg.department_id, acct.department_id),
      a.location_id, p_date, clean_notes,
      case when cond_name = 'Good' then 'Baik / Good' else coalesce(cond_name, 'Bekas') end,
      'return', 'draft', me
    )
    returning bast.id, bast.bast_number into v_bast_id, v_bast;
  end if;

  return jsonb_build_object(
    'assignmentId', asg.id,
    'bastId', v_bast_id,
    'bastNumber', v_bast
  );
end $$;

revoke all on function return_asset(uuid, date, uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function return_asset(uuid, date, uuid, text, boolean) to authenticated;


-- ---------------------------------------------------------------------------
-- Maintenance moves the asset's status, and moves it back.
--
-- One helper, called from both write paths, so the two directions can never be
-- implemented differently — which is precisely how the original bug happened.
-- ---------------------------------------------------------------------------
create or replace function sync_asset_maintenance_status(p_asset uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  a         assets%rowtype;
  current   asset_statuses%rowtype;
  maint_id  uuid;
  avail_id  uuid;
  assign_id uuid;
  ongoing   boolean;
  target    uuid;
  reason    text;
begin
  -- SECURITY DEFINER, so the guards RLS would have applied are re-stated
  -- (DATABASE.md §11). Both callers have already checked these; a caller that
  -- reached this directly has not.
  if not can_write_assets() or not can_see_asset(p_asset) then
    raise exception 'You do not have permission to change this asset'
      using errcode = 'P0001';
  end if;

  select * into a from assets where id = p_asset;
  if not found then return; end if;

  select id into maint_id  from asset_statuses where name = 'Maintenance';
  select id into avail_id  from asset_statuses where name = 'Available';
  select id into assign_id from asset_statuses where name = 'Assigned';
  if maint_id is null or avail_id is null then return; end if;

  select * into current from asset_statuses where id = a.status_id;
  -- Lost and Retired are final. A closed repair record does not resurrect an
  -- asset that has been written off.
  if current.is_terminal then return; end if;

  ongoing := exists (
    select 1 from maintenance_records
    where asset_id = p_asset and completed_at is null
  );

  if ongoing then
    if a.status_id = maint_id then return; end if;
    target := maint_id;
    reason := 'In for maintenance — ' || coalesce(nullif(btrim(p_note), ''), 'repair recorded');
  else
    -- Only unwind what maintenance itself put there. If somebody marked the
    -- asset Broken by hand while it was away, that judgement stands.
    if a.status_id <> maint_id then return; end if;
    target := case when a.assigned_to is not null then coalesce(assign_id, avail_id)
                   else avail_id end;
    reason := 'Back from maintenance — ' || coalesce(nullif(btrim(p_note), ''), 'repair closed');
  end if;

  insert into asset_status_changes (
    asset_id, from_status, to_status, from_condition, to_condition, reason, changed_by
  ) values (
    p_asset, a.status_id, target, a.condition_id, a.condition_id, reason, my_account_id()
  );

  update assets set status_id = target where id = p_asset;
end $$;

revoke all on function sync_asset_maintenance_status(uuid, text)
  from public, anon, authenticated;
-- Granted because both callers are SECURITY INVOKER and would otherwise hit
-- "permission denied for function" the moment anyone recorded a repair.
--
-- Safe to expose: it takes no target status. Everything it does is derived from
-- the asset's own maintenance records, so calling it directly can only re-apply
-- what those records already say — it is idempotent, and there is no argument
-- that could talk it into a status the log does not support.
grant execute on function sync_asset_maintenance_status(uuid, text) to authenticated;

create or replace function log_maintenance(
  p_asset       uuid,
  p_title       text,
  p_started     date,
  p_completed   date    default null,
  p_detail      text    default null,
  p_vendor      uuid    default null,
  p_is_internal boolean default false,
  p_warranty    boolean default false,
  p_cost        numeric default null,
  p_next_due    date    default null
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare new_id uuid; started date := coalesce(p_started, current_date);
begin
  if not can_write_assets() or not can_see_asset(p_asset) then
    raise exception 'You do not have permission to record maintenance here'
      using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'What was done?' using errcode = 'P0001';
  end if;
  if p_completed is not null and p_completed < started then
    raise exception 'It cannot have finished before it started' using errcode = 'P0001';
  end if;
  if p_next_due is not null and p_next_due < started then
    raise exception 'The next service cannot be due before this one started'
      using errcode = 'P0001';
  end if;
  if p_cost is not null and p_cost < 0 then
    raise exception 'A cost cannot be negative' using errcode = 'P0001';
  end if;

  insert into maintenance_records (
    asset_id, title, detail, vendor_id, is_internal, under_warranty,
    started_at, completed_at, cost, next_due_at, state, created_by
  ) values (
    p_asset, btrim(p_title), nullif(btrim(coalesce(p_detail, '')), ''),
    p_vendor, coalesce(p_is_internal, false), coalesce(p_warranty, false),
    started, p_completed, coalesce(p_cost, 0), p_next_due,
    case when p_completed is null then 'in_progress' else 'completed' end::maintenance_state,
    my_account_id()
  ) returning id into new_id;

  perform sync_asset_maintenance_status(p_asset, btrim(p_title));

  return jsonb_build_object(
    'id', new_id,
    'ongoing', p_completed is null,
    'assetStatus', (select s.name from assets a join asset_statuses s on s.id = a.status_id
                     where a.id = p_asset)
  );
end $$;

create or replace function edit_maintenance(
  p_id          uuid,
  p_title       text    default null,
  p_started     date    default null,
  p_completed   date    default null,
  p_detail      text    default null,
  p_vendor      uuid    default null,
  p_cost        numeric default null,
  p_next_due    date    default null,
  p_clear_completed boolean default false
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare m maintenance_records%rowtype; next_started date; next_completed date;
begin
  select * into m from maintenance_records where id = p_id;
  if not found then
    raise exception 'Maintenance record not found' using errcode = 'P0001';
  end if;
  if not can_write_assets() or not can_see_asset(m.asset_id) then
    raise exception 'You do not have permission to change this record'
      using errcode = 'P0001';
  end if;

  next_started   := coalesce(p_started, m.started_at);
  next_completed := case when p_clear_completed then null
                         else coalesce(p_completed, m.completed_at) end;

  if next_completed is not null and next_completed < next_started then
    raise exception 'It cannot have finished before it started' using errcode = 'P0001';
  end if;
  if p_cost is not null and p_cost < 0 then
    raise exception 'A cost cannot be negative' using errcode = 'P0001';
  end if;

  update maintenance_records set
    title        = coalesce(nullif(btrim(coalesce(p_title, '')), ''), title),
    detail       = coalesce(nullif(btrim(coalesce(p_detail, '')), ''), detail),
    vendor_id    = coalesce(p_vendor, vendor_id),
    started_at   = next_started,
    completed_at = next_completed,
    cost         = coalesce(p_cost, cost),
    next_due_at  = coalesce(p_next_due, next_due_at),
    state        = (case when next_completed is null then 'in_progress' else 'completed' end)
                   ::maintenance_state
  where id = p_id;

  perform sync_asset_maintenance_status(
    m.asset_id, coalesce(nullif(btrim(coalesce(p_title, '')), ''), m.title)
  );

  return jsonb_build_object(
    'id', p_id,
    'ongoing', next_completed is null,
    'assetStatus', (select s.name from assets a join asset_statuses s on s.id = a.status_id
                     where a.id = m.asset_id)
  );
end $$;

revoke all on function log_maintenance(uuid, text, date, date, text, uuid, boolean, boolean, numeric, date)
  from public, anon, authenticated;
revoke all on function edit_maintenance(uuid, text, date, date, text, uuid, numeric, date, boolean)
  from public, anon, authenticated;
grant execute on function log_maintenance(uuid, text, date, date, text, uuid, boolean, boolean, numeric, date)
  to authenticated;
grant execute on function edit_maintenance(uuid, text, date, date, text, uuid, numeric, date, boolean)
  to authenticated;


-- ---------------------------------------------------------------------------
-- Jabatan on the account form.
--
-- Both writers are dropped and recreated with the extra parameter for the same
-- reason return_asset() was: the client calls them with named arguments, and a
-- defaulted parameter on a second overload makes every call ambiguous.
-- ---------------------------------------------------------------------------
drop function if exists accounts_list(text);
create or replace function accounts_list(p_search text default null)
returns table (
  id uuid, full_name text, nik text, email text, phone text, job_title text,
  department_id uuid, department_name text,
  location_id uuid, location_name text,
  role user_role, can_login boolean, has_credentials boolean, is_active boolean,
  is_me boolean
)
language sql stable security invoker set search_path = public as $$
  select
    a.id, a.full_name, a.nik, a.email, a.phone, a.job_title,
    a.department_id, d.name,
    a.location_id, l.name,
    a.role, a.can_login,
    a.auth_user_id is not null,
    a.is_active,
    a.id = my_account_id()
  from accounts a
  left join departments d on d.id = a.department_id
  left join locations   l on l.id = a.location_id
  where p_search is null
     or btrim(p_search) = ''
     or a.full_name ilike '%' || btrim(p_search) || '%'
     or coalesce(a.nik, '')       ilike '%' || btrim(p_search) || '%'
     or coalesce(a.email, '')     ilike '%' || btrim(p_search) || '%'
     or coalesce(a.job_title, '') ilike '%' || btrim(p_search) || '%'
  order by a.is_active desc, a.full_name;
$$;

drop function if exists create_account(text, text, text, text, uuid, uuid, text, boolean);
create or replace function create_account(
  p_full_name  text,
  p_nik        text default null,
  p_email      text default null,
  p_phone      text default null,
  p_department uuid default null,
  p_location   uuid default null,
  p_role       text default null,
  p_can_login  boolean default false,
  p_job_title  text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare new_id uuid; r user_role;
begin
  perform assert_can_manage_accounts();

  if coalesce(btrim(p_full_name), '') = '' then
    raise exception 'A name is required' using errcode = 'P0001';
  end if;

  if p_role is not null and btrim(p_role) <> '' then
    begin
      r := p_role::user_role;
    exception when others then
      raise exception 'Unknown role' using errcode = 'P0001';
    end;
  end if;

  if p_can_login and r is null then
    raise exception 'Choose a role before this account can log in' using errcode = 'P0001';
  end if;
  if p_can_login and coalesce(btrim(p_email), '') = '' then
    raise exception 'An email address is required for an account that logs in'
      using errcode = 'P0001';
  end if;
  if r in ('site_it', 'viewer') and p_location is null then
    raise exception 'Choose a location — this role only sees its own'
      using errcode = 'P0001';
  end if;

  insert into accounts (
    full_name, nik, email, phone, job_title,
    department_id, location_id, role, can_login, created_by
  ) values (
    btrim(p_full_name),
    nullif(btrim(coalesce(p_nik, '')), ''),
    nullif(lower(btrim(coalesce(p_email, ''))), ''),
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_job_title, '')), ''),
    p_department, p_location, r, coalesce(p_can_login, false),
    my_account_id()
  ) returning id into new_id;

  return jsonb_build_object('id', new_id, 'canLogin', coalesce(p_can_login, false));
exception
  when unique_violation then
    raise exception 'That NIK or email is already on another account' using errcode = 'P0001';
end $$;

drop function if exists update_account(uuid, text, text, text, text, uuid, uuid, text, boolean, boolean);
create or replace function update_account(
  p_id         uuid,
  p_full_name  text,
  p_nik        text default null,
  p_email      text default null,
  p_phone      text default null,
  p_department uuid default null,
  p_location   uuid default null,
  p_role       text default null,
  p_can_login  boolean default null,
  p_is_active  boolean default null,
  p_job_title  text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a           accounts%rowtype;
  r           user_role;
  next_login  boolean;
  next_active boolean;
begin
  perform assert_can_manage_accounts();

  select * into a from accounts where id = p_id;
  if not found then
    raise exception 'Account not found' using errcode = 'P0001';
  end if;

  if p_role is not null and btrim(p_role) <> '' then
    begin
      r := p_role::user_role;
    exception when others then
      raise exception 'Unknown role' using errcode = 'P0001';
    end;
  end if;

  next_login  := coalesce(p_can_login, a.can_login);
  next_active := coalesce(p_is_active, a.is_active);

  if next_login and r is null then
    raise exception 'Choose a role before this account can log in' using errcode = 'P0001';
  end if;
  if next_login and coalesce(btrim(coalesce(p_email, a.email)), '') = '' then
    raise exception 'An email address is required for an account that logs in'
      using errcode = 'P0001';
  end if;
  if r in ('site_it', 'viewer') and coalesce(p_location, a.location_id) is null then
    raise exception 'Choose a location — this role only sees its own'
      using errcode = 'P0001';
  end if;

  -- The rule that keeps the system administrable, unchanged from 0017.
  if a.role = 'super_admin' and a.is_active and a.can_login then
    if (r is distinct from 'super_admin' or not next_login or not next_active)
       and other_super_admins(a.id) = 0 then
      raise exception
        'This is the only Super Admin left — give someone else the role first'
        using errcode = 'P0001';
    end if;
  end if;

  update accounts set
    full_name     = btrim(coalesce(p_full_name, a.full_name)),
    nik           = nullif(btrim(coalesce(p_nik, a.nik, '')), ''),
    email         = nullif(lower(btrim(coalesce(p_email, a.email, ''))), ''),
    phone         = nullif(btrim(coalesce(p_phone, a.phone, '')), ''),
    job_title     = nullif(btrim(coalesce(p_job_title, a.job_title, '')), ''),
    department_id = coalesce(p_department, a.department_id),
    location_id   = coalesce(p_location, a.location_id),
    role          = r,
    can_login     = next_login,
    is_active     = next_active
  where id = p_id;

  return jsonb_build_object('id', p_id, 'canLogin', next_login, 'isActive', next_active);
exception
  when unique_violation then
    raise exception 'That NIK or email is already on another account' using errcode = 'P0001';
end $$;

revoke all on function accounts_list(text) from public, anon, authenticated;
revoke all on function create_account(text, text, text, text, uuid, uuid, text, boolean, text)
  from public, anon, authenticated;
revoke all on function update_account(uuid, text, text, text, text, uuid, uuid, text, boolean, boolean, text)
  from public, anon, authenticated;

grant execute on function accounts_list(text) to authenticated;
grant execute on function create_account(text, text, text, text, uuid, uuid, text, boolean, text)
  to authenticated;
grant execute on function update_account(uuid, text, text, text, text, uuid, uuid, text, boolean, boolean, text)
  to authenticated;
