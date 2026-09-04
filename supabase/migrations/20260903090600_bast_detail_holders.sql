-- ============================================================================
-- CITE Assets — 0075 bast_detail carries every holder
--
-- One key added to the payload: `holders`, the ordered list from
-- holders_of_bast(). The renderer and the app both read it, so a document
-- handed to three people prints three party blocks and three signature blocks
-- rather than naming the first and leaving the rest to be inferred.
--
-- `secondaryName` and friends are untouched. Both come from the same rows, so
-- the screens that still read them keep working and cannot disagree with the
-- new list.
--
-- Same signature, so `create or replace` is safe here — no new parameter, no
-- second overload for PostgREST to choose between.
-- ============================================================================

create or replace function bast_detail(p_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare b bast%rowtype; loc locations%rowtype; acct accounts%rowtype;
        acct2 accounts%rowtype; result jsonb;
begin
  select * into b from bast where id = p_id;
  if not found then
    return null;                                 -- missing, or hidden by RLS
  end if;

  select * into loc  from locations where id = b.location_id;
  select * into acct  from accounts where id = b.account_id;
  select * into acct2 from accounts where id = b.secondary_account_id;

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

    -- The second recipient, when there is one. Null everywhere else, and the
    -- renderer draws a third signature block only when this is filled in.
    'secondaryId', b.secondary_account_id,
    'secondaryName', acct2.full_name,
    'secondaryNik', coalesce(acct2.nik, '-'),
    'secondaryTitle', coalesce(nullif(btrim(coalesce(acct2.job_title, '')), ''), '-'),

    -- Every holder, in order, position 1 first. The renderer prints one party
    -- block and one signature block per entry, so a document handed to three
    -- people names three people instead of naming the first and leaving two
    -- signature boxes to be guessed at.
    --
    -- secondaryName above is kept for the screens that still read it; both come
    -- from the same rows, so they cannot disagree.
    'holders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position',   h.holder_position,
        'accountId',  h.account_id,
        'name',       h.full_name,
        'nik',        coalesce(h.nik, '-'),
        'title',      h.job_title,
        'department', coalesce(h.department_name, '-'),
        'role',       holder_signature_role(h.holder_position)
      ) order by h.holder_position)
      from holders_of_bast(b.id) h
    ), '[]'::jsonb),

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

create or replace function search_assets(
  p_locations uuid[],
  p_query     text default null,
  p_status    uuid default null,
  p_category  uuid default null,
  p_sort      text default 'code'
)
returns table (
  id uuid, asset_code text, name text, serial_number text,
  category_name text, category_icon text,
  brand_name text, model_name text,
  status_name text, condition_name text, location_name text,
  holder_name text, department_name text,
  warranty_end date
)
language sql stable security invoker set search_path = public as $$
  select
    a.id, a.asset_code, a.name, a.serial_number,
    c.name, c.icon, b.name, m.name,
    s.name, cond.name, l.name,
    -- The holder line still shows the first name only; two names would not fit
    -- the card, and the detail screen prints both.
    acc.full_name, d.name,
    a.warranty_end
  from assets a
  join categories       c    on c.id    = a.category_id
  join asset_statuses   s    on s.id    = a.status_id
  join asset_conditions cond on cond.id = a.condition_id
  join locations        l    on l.id    = a.location_id
  left join brands      b    on b.id    = a.brand_id
  left join models      m    on m.id    = a.model_id
  left join accounts    acc  on acc.id  = a.assigned_to
  -- The other shift. Without this join a handy-talkie is findable by one of
  -- its two holders and invisible to the other, which would make the second
  -- name look like decoration.
  left join accounts    acc2 on acc2.id = a.assigned_to_secondary
  left join departments d    on d.id    = a.department_id
  where a.location_id = any (p_locations)
    and (p_status   is null or a.status_id   = p_status)
    and (p_category is null or a.category_id = p_category)
    and (
      p_query is null or btrim(p_query) = ''
      or a.asset_code          ilike '%' || btrim(p_query) || '%'
      or a.name                ilike '%' || btrim(p_query) || '%'
      or a.serial_number       ilike '%' || btrim(p_query) || '%'
      or coalesce(b.name, '')  ilike '%' || btrim(p_query) || '%'
      or coalesce(m.name, '')  ilike '%' || btrim(p_query) || '%'
      or coalesce(acc.full_name, '')  ilike '%' || btrim(p_query) || '%'
      or coalesce(acc2.full_name, '') ilike '%' || btrim(p_query) || '%'
      or coalesce(d.name, '')  ilike '%' || btrim(p_query) || '%'
    )
  order by
    case when p_sort = 'name'     then a.name end asc,
    case when p_sort = 'newest'   then a.created_at end desc,
    case when p_sort = 'oldest'   then a.created_at end asc,
    case when p_sort = 'status'   then s.sort_order end asc,
    case when p_sort = 'location' then l.name end asc,
    case when p_sort = 'warranty' then a.warranty_end end asc nulls last,
    -- 'code', and the tie-break for every other sort. Without it two assets
    -- with the same name come back in whatever order the planner felt like,
    -- and the list reshuffles on every refresh.
    a.asset_code asc;
$$;
