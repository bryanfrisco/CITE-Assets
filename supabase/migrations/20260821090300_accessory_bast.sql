-- ============================================================================
-- CITE Assets — 0046 BAST Perlengkapan — a handover note with no asset on it
--
-- THE CASE
-- --------
-- Accessories handed over WITH a laptop become lines on that laptop's BAST,
-- which already works: set_bast_items() writes them and refuses once the
-- document is signed.
--
-- What had no answer was a mouse given to somebody a month later, when their
-- BAST is already signed. That document must not change — a signature has to
-- guarantee contents that cannot move afterwards — so the answer is a NEW
-- document, exactly as it would be on paper. Nobody re-signs last month's
-- letter; they raise this month's.
--
-- WHAT THAT COSTS
-- ---------------
-- bast.asset_id has to become nullable, and it is the column every BAST policy
-- resolves visibility through. So each of those policies gains a fallback to
-- bast.location_id, which is NOT NULL and has always been there.
--
-- That fallback is the most dangerous line in this migration: get it wrong and
-- Site IT can read Head Office's handover notes. tests/bast-accessory.mjs
-- exists mostly to prove it does not.
--
-- bast_list() and bast_stats() also had to change. Both did `join assets`, so
-- a document with no asset would not have been hidden — it would have been
-- invisible, which is worse, because nothing would have looked wrong.
-- ============================================================================

alter table bast alter column asset_id drop not null;

-- ---------------------------------------------------------------------------
-- One definition of "may this person see this BAST", used by every policy.
--
-- Written as a function over the two columns rather than repeated inline, so
-- there is exactly one place the fallback can be wrong.
-- ---------------------------------------------------------------------------
create or replace function can_see_bast_row(p_asset uuid, p_location uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_asset is null then p_location in (select my_location_ids())
    else can_see_asset(p_asset)
  end;
$$;

drop policy if exists bast_read   on bast;
drop policy if exists bast_write  on bast;
drop policy if exists bast_update on bast;

create policy bast_read on bast for select
  using (can_see_bast_row(asset_id, location_id));
create policy bast_write on bast for insert
  with check (can_write_assets() and can_see_bast_row(asset_id, location_id));
create policy bast_update on bast for update
  using (can_write_assets() and can_see_bast_row(asset_id, location_id));

drop policy if exists bast_versions_read  on bast_versions;
drop policy if exists bast_versions_write on bast_versions;

create policy bast_versions_read on bast_versions for select using (
  exists (select 1 from bast b
           where b.id = bast_id and can_see_bast_row(b.asset_id, b.location_id)));
create policy bast_versions_write on bast_versions for insert with check (
  can_write_assets()
  and exists (select 1 from bast b
               where b.id = bast_id and can_see_bast_row(b.asset_id, b.location_id)));

drop policy if exists bast_items_read on bast_items;
create policy bast_items_read on bast_items for select to authenticated using (
  exists (select 1 from bast b
           where b.id = bast_id and can_see_bast_row(b.asset_id, b.location_id)));

drop policy if exists bast_signatures_read on bast_signatures;
create policy bast_signatures_read on bast_signatures for select to authenticated using (
  exists (select 1 from bast b
           where b.id = bast_id and can_see_bast_row(b.asset_id, b.location_id)));

-- ---------------------------------------------------------------------------
-- The list and the stat tiles.
--
-- Body only — same signature, same returned columns, so `create or replace`
-- really replaces. The join becomes a LEFT join and the scope filter falls
-- back to the document's own location.
-- ---------------------------------------------------------------------------
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
  left join assets   a   on a.id   = b.asset_id
  join accounts      acc on acc.id = b.account_id
  join locations     l   on l.id   = b.location_id
  left join departments d on d.id = b.department_id
  where coalesce(a.location_id, b.location_id) = any (p_locations)
    and (p_kind is null or b.kind::text = p_kind)
  order by b.bast_date desc, b.bast_number desc;
$$;

create or replace function bast_stats(p_locations uuid[])
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'total',     count(*),
    'signed',    count(*) filter (where b.status = 'signed'),
    'awaiting',  count(*) filter (where b.status = 'awaiting_signature'),
    'draft',     count(*) filter (where b.status = 'draft'),
    'handover',  count(*) filter (where b.kind = 'handover'),
    'returns',   count(*) filter (where b.kind = 'return'),
    'accessory', count(*) filter (where b.kind = 'accessory')
  )
  from bast b
  left join assets a on a.id = b.asset_id
  where coalesce(a.location_id, b.location_id) = any (p_locations);
$$;

-- ---------------------------------------------------------------------------
-- create_accessory_bast()
--
-- Takes hand-outs that have already happened and puts a document around them.
-- It does not hand anything out itself: assign_accessory() is the only thing
-- that moves stock, so a failure here can never leave the shelf count wrong.
-- ---------------------------------------------------------------------------
create or replace function create_accessory_bast(
  p_account   uuid,
  p_checkouts uuid[]
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  new_id   uuid;
  v_loc    uuid;
  v_dept   uuid;
  n        int;
  pos      int := 0;
  row_rec  record;
begin
  if not can_write_assets() then
    raise exception 'You do not have permission to raise a BAST' using errcode = 'P0001';
  end if;
  if p_checkouts is null or array_length(p_checkouts, 1) is null then
    raise exception 'Choose at least one accessory' using errcode = 'P0001';
  end if;

  if not exists (select 1 from accounts where id = p_account and is_active) then
    raise exception 'Choose who it is for' using errcode = 'P0001';
  end if;

  -- Every hand-out must belong to this person, still be out, and have no
  -- document already. Anything else and the paper would not match the record.
  select count(*) into n
  from accessory_checkouts co
  where co.id = any (p_checkouts)
    and co.account_id = p_account
    and co.state = 'active'
    and co.bast_id is null;

  if n <> array_length(p_checkouts, 1) then
    raise exception 'Some of those are already on a document, returned, or somebody else''s'
      using errcode = 'P0001';
  end if;

  -- All the stock has to sit at one location, because a document has one
  -- letterhead and one place name at the bottom of it.
  select count(distinct a.location_id) into n
  from accessory_checkouts co join accessories a on a.id = co.accessory_id
  where co.id = any (p_checkouts);
  if n > 1 then
    raise exception 'Those come from different locations — raise one document each'
      using errcode = 'P0001';
  end if;

  select a.location_id into v_loc
  from accessory_checkouts co join accessories a on a.id = co.accessory_id
  where co.id = any (p_checkouts) limit 1;

  if v_loc not in (select my_location_ids()) then
    raise exception 'That location is outside your scope' using errcode = 'P0001';
  end if;

  select department_id into v_dept from accounts where id = p_account;

  insert into bast (kind, asset_id, account_id, department_id, location_id,
                    description, created_by)
  values ('accessory', null, p_account, v_dept, v_loc,
          'Serah terima perlengkapan', my_account_id())
  returning id into new_id;

  -- The goods table is the whole document here — there is no asset row to fall
  -- back on, so these lines are written rather than derived.
  for row_rec in
    select co.id, co.qty, a.name, a.model_no
    from accessory_checkouts co join accessories a on a.id = co.accessory_id
    where co.id = any (p_checkouts)
    order by a.name
  loop
    pos := pos + 1;
    insert into bast_items (bast_id, position, jenis, serial_number, kondisi)
    values (
      new_id, pos,
      row_rec.name || coalesce(' (' || row_rec.model_no || ')', '')
        || ' × ' || row_rec.qty,
      null, 'Baik'
    );
    update accessory_checkouts set bast_id = new_id where id = row_rec.id;
  end loop;

  return jsonb_build_object(
    'bastId', new_id,
    'bastNumber', (select bast_number from bast where id = new_id),
    'lines', pos
  );
end $$;

revoke all on function can_see_bast_row(uuid, uuid)        from public, anon, authenticated;
revoke all on function create_accessory_bast(uuid, uuid[]) from public, anon, authenticated;

grant execute on function can_see_bast_row(uuid, uuid)        to authenticated;
grant execute on function create_accessory_bast(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- bast_detail(), replaced in full.
--
-- Every asset lookup in here was already a scalar subquery, so a null asset_id
-- yields nulls rather than an error. The one exception was the goods table,
-- whose fallback read from `assets` — for a BAST Perlengkapan that returns no
-- row, and `items` would have come back null instead of an empty array.
--
-- Signature unchanged, so this replaces rather than overloads.
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
       from assets a where a.id = b.asset_id),
      -- A BAST Perlengkapan has no asset to fall back on, so without this the
      -- goods table would arrive as null and the paper preview would break on
      -- a document whose only content IS the goods table.
      '[]'::jsonb
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
