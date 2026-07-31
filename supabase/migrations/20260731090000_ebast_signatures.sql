-- ============================================================================
-- CITE Assets — 0015 E-BAST signatures
--
-- Client instruction, 2026-07-30:
--   "ganti BAST menjadi E-BAST yang serba digital"
--   "saya mau ttd digital dengan langsung tanda tangan dari layar secara langsung"
--   "untuk yang menyerahkan itu ada beberapa pilihan orang nanti
--    (harus ditambahkan jika tidak ada (fully customizeable))"
--
-- WHY STROKES AND NOT AN IMAGE
-- ----------------------------
-- A signature is stored as the path the finger actually travelled — an array of
-- polylines in normalised coordinates — not as a PNG. Three reasons, in order of
-- how much they matter:
--
--   1. The same data draws the signature on the phone AND in the PDF, so the
--      preview and the printed document cannot disagree. A raster would have to
--      be generated twice by two different renderers.
--   2. It stays sharp at any size. A 300 px capture printed into a 150 pt box
--      on A4 is visibly soft; a vector is not.
--   3. It is a few kilobytes of jsonb inside the row, so it is covered by the
--      same RLS and the same backup as the record it belongs to — no second
--      object in a bucket that could go missing on its own.
--
-- Coordinates are normalised by the pad's WIDTH, not by each axis separately,
-- so the aspect ratio survives. x is 0..1; y is 0..1/SIGNATURE_ASPECT. Scaling
-- both axes independently would stretch the handwriting.
--
-- APPEND-ONLY
-- -----------
-- Working rule #3. A signature is evidence, so nothing here is ever updated or
-- deleted. Signing again inserts another row and the newest one is the one that
-- prints; every earlier attempt stays in the table. That is deliberately more
-- forgiving than a UNIQUE constraint (someone will smudge a signature and want
-- to redo it) without destroying anything.
--
-- WHAT "SIGNED" STILL MEANS
-- -------------------------
-- Recording both signatures does NOT set bast.status = 'signed'. The status
-- flips only when the signed PDF exists, through attach_signed_bast(), exactly
-- as it did for a scanned upload. So "Signed" keeps its one meaning: there is a
-- document. If the PDF step fails, the signatures are already safe and the
-- action can simply be retried.
-- ============================================================================

create type bast_signature_role as enum ('handover', 'receiver');

-- ---------------------------------------------------------------------------
-- The "Yang Menyerahkan" list.
--
-- Separate from `accounts` on purpose: the person who hands a device over is
-- not necessarily someone who logs into this app, and requiring an account
-- before they can sign would be the wrong constraint. Adding one is a single
-- field, which is what "fully customizeable" has to mean in practice.
-- ---------------------------------------------------------------------------
create table bast_signatories (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  title         text,                                  -- jabatan, printed under the name
  department_id uuid references departments(id) on delete set null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  created_by    uuid references accounts(id),
  updated_at    timestamptz not null default now()
);

-- Case-insensitive: "Budi Santoso" and "budi santoso" are one person, and the
-- picker would otherwise fill up with the same name typed four ways.
create unique index bast_signatories_name_key on bast_signatories (lower(full_name));

create trigger bast_signatories_set_updated_at before update on bast_signatories
  for each row execute function set_updated_at();

create trigger bast_signatories_audit after insert or update on bast_signatories
  for each row execute function audit_row('master_created', 'master_updated');

alter table bast_signatories enable row level security;

-- Everyone signed in can read the list; only asset writers can add to it.
create policy bast_signatories_read on bast_signatories
  for select to authenticated using (true);

create policy bast_signatories_write on bast_signatories
  for insert to authenticated with check (can_write_assets());

create policy bast_signatories_update on bast_signatories
  for update to authenticated using (can_write_assets());

grant select, insert, update on bast_signatories to authenticated;

-- ---------------------------------------------------------------------------
-- The signatures themselves.
-- ---------------------------------------------------------------------------
create table bast_signatures (
  id           uuid primary key default gen_random_uuid(),
  bast_id      uuid not null references bast(id) on delete restrict,
  role         bast_signature_role not null,
  signer_name  text not null,
  signer_title text,
  -- [[[x,y],[x,y],...], ...] — one inner array per pen stroke.
  strokes      jsonb not null,
  signed_at    timestamptz not null default now(),
  -- The account that operated the device, which is not the person signing.
  -- Both are worth keeping: one is the signature, the other is the custody.
  recorded_by  uuid references accounts(id),
  constraint strokes_is_array check (jsonb_typeof(strokes) = 'array')
);

create index bast_signatures_bast_idx on bast_signatures (bast_id, role, signed_at desc);

create trigger bast_signatures_no_update before update on bast_signatures
  for each row execute function forbid_mutation();
create trigger bast_signatures_no_delete before delete on bast_signatures
  for each row execute function forbid_mutation();

create trigger bast_signatures_audit after insert on bast_signatures
  for each row execute function audit_row('bast_signed', 'bast_signed');

alter table bast_signatures enable row level security;

create policy bast_signatures_read on bast_signatures
  for select to authenticated using (can_see_asset((select asset_id from bast where id = bast_id)));

-- No insert policy and no insert grant: sign_bast() below is the only way in,
-- so the stroke validation cannot be skipped by writing the row directly.
grant select on bast_signatures to authenticated;
revoke insert, update, delete on bast_signatures from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Stroke validation.
--
-- This runs in the database rather than in the app because the PDF renderer on
-- the other side has no way to recover from a malformed path: it would emit a
-- broken content stream and the document would fail to open. Rejecting at the
-- write is the only place the error is still cheap.
-- ---------------------------------------------------------------------------
create or replace function validate_signature_strokes(p_strokes jsonb)
returns void language plpgsql immutable set search_path = public as $$
declare
  stroke jsonb;
  point  jsonb;
  points int := 0;
  x      numeric;
  y      numeric;
begin
  if jsonb_typeof(p_strokes) <> 'array' then
    raise exception 'Signature is not in the expected format' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_strokes) > 200 then
    raise exception 'Signature has too many strokes' using errcode = 'P0001';
  end if;

  for stroke in select * from jsonb_array_elements(p_strokes) loop
    if jsonb_typeof(stroke) <> 'array' then
      raise exception 'Signature is not in the expected format' using errcode = 'P0001';
    end if;

    for point in select * from jsonb_array_elements(stroke) loop
      if jsonb_typeof(point) <> 'array' or jsonb_array_length(point) <> 2 then
        raise exception 'Signature is not in the expected format' using errcode = 'P0001';
      end if;

      x := (point->>0)::numeric;
      y := (point->>1)::numeric;
      -- Normalised by the pad width, so x is 0..1 and y is shorter than that.
      -- The 1.0 ceiling on y is loose on purpose; it only has to catch data
      -- that was never normalised at all.
      if x < 0 or x > 1 or y < 0 or y > 1 then
        raise exception 'Signature is out of bounds' using errcode = 'P0001';
      end if;

      points := points + 1;
    end loop;
  end loop;

  -- A stray tap while scrolling produces two or three points. A real signature,
  -- even a short one, produces dozens.
  if points < 12 then
    raise exception 'That signature is too short — please sign again' using errcode = 'P0001';
  end if;
  if points > 20000 then
    raise exception 'Signature is too large' using errcode = 'P0001';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- sign_bast() — the only write path (working rule #2).
-- ---------------------------------------------------------------------------
create or replace function sign_bast(
  p_bast    uuid,
  p_role    text,
  p_name    text,
  p_title   text,
  p_strokes jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b       bast%rowtype;
  me      uuid := my_account_id();
  r       bast_signature_role;
  has_h   boolean;
  has_r   boolean;
begin
  begin
    r := p_role::bast_signature_role;
  exception when others then
    raise exception 'Unknown signature role' using errcode = 'P0001';
  end;

  select * into b from bast where id = p_bast;
  if not found then
    raise exception 'BAST not found' using errcode = 'P0001';
  end if;

  -- SECURITY DEFINER, so the guards RLS would have applied are re-stated here
  -- (DATABASE.md §11).
  if not can_see_asset(b.asset_id) then
    raise exception 'BAST not found' using errcode = 'P0001';
  end if;
  if not can_write_assets() then
    raise exception 'You do not have permission to sign this document' using errcode = 'P0001';
  end if;
  if b.status = 'void' then
    raise exception 'This BAST has been voided' using errcode = 'P0001';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'Who is signing?' using errcode = 'P0001';
  end if;

  perform validate_signature_strokes(p_strokes);

  insert into bast_signatures (bast_id, role, signer_name, signer_title, strokes, recorded_by)
  values (p_bast, r, trim(p_name), nullif(trim(coalesce(p_title, '')), ''), p_strokes, me);

  select
    count(*) filter (where role = 'handover') > 0,
    count(*) filter (where role = 'receiver') > 0
  into has_h, has_r
  from bast_signatures where bast_id = p_bast;

  return jsonb_build_object(
    'bastId', p_bast,
    'role', r,
    -- The client uses this to decide whether to finalise the PDF. Status is
    -- NOT set to 'signed' here — see the header.
    'complete', has_h and has_r
  );
end $$;

-- ---------------------------------------------------------------------------
-- The signatory picker, and adding to it.
-- ---------------------------------------------------------------------------
create or replace function bast_signatories_list()
returns table (id uuid, full_name text, title text, department_name text)
language sql stable security invoker set search_path = public as $$
  select s.id, s.full_name, s.title, d.name
  from bast_signatories s
  left join departments d on d.id = s.department_id
  where s.is_active
  order by s.full_name;
$$;

create or replace function add_bast_signatory(
  p_name  text,
  p_title text default null,
  p_department uuid default null
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare existing bast_signatories%rowtype; new_id uuid;
begin
  if coalesce(trim(p_name), '') = '' then
    raise exception 'A name is required' using errcode = 'P0001';
  end if;

  -- Re-adding someone who is already there reactivates them instead of
  -- failing on the unique index: from the user's side both are "add this
  -- person", and an error would be a dead end with no obvious way out.
  select * into existing from bast_signatories where lower(full_name) = lower(trim(p_name));
  if found then
    update bast_signatories
       set is_active = true,
           title = coalesce(nullif(trim(coalesce(p_title, '')), ''), title),
           department_id = coalesce(p_department, department_id)
     where id = existing.id;
    return jsonb_build_object('id', existing.id, 'created', false);
  end if;

  insert into bast_signatories (full_name, title, department_id, created_by)
  values (trim(p_name), nullif(trim(coalesce(p_title, '')), ''), p_department, my_account_id())
  returning id into new_id;

  return jsonb_build_object('id', new_id, 'created', true);
end $$;

-- ---------------------------------------------------------------------------
-- bast_detail() — replaced to carry the signatures.
--
-- Only the newest signature per role is returned: earlier attempts stay in the
-- table as history but are not what the document shows.
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
    'handedOverBy', coalesce((select full_name from accounts where id = b.created_by), 'Corporate IT'),
    'handedOverDept', coalesce(
      (select d.name from accounts acc left join departments d on d.id = acc.department_id
        where acc.id = b.created_by), 'Corporate IT'),

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

revoke all on function validate_signature_strokes(jsonb)             from anon, authenticated;
revoke all on function sign_bast(uuid, text, text, text, jsonb)      from anon, authenticated;
revoke all on function bast_signatories_list()                       from anon, authenticated;
revoke all on function add_bast_signatory(text, text, uuid)          from anon, authenticated;

grant execute on function sign_bast(uuid, text, text, text, jsonb)   to authenticated;
grant execute on function bast_signatories_list()                    to authenticated;
grant execute on function add_bast_signatory(text, text, uuid)       to authenticated;
