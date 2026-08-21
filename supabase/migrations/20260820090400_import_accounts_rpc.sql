-- ============================================================================
-- CITE Assets — 0042 import_accounts()
--
-- Mirrors import_assets() (migration 0022): the client parses the CSV — a text
-- format with quoting rules, and Postgres is a poor place to discover a stray
-- comma — and this function decides what is ACCEPTABLE. The screen always
-- calls it with p_dry_run = true first, so a preview can be shown before a
-- single row is written.
--
-- WHAT THIS IMPORT MAY WRITE
-- --------------------------
--   full_name, nik, job_title, company_id, email, phone
--
-- and nothing else. Not role, not can_login, not auth_user_id, not
-- location_id, not department_id, not is_active.
--
-- That list is the whole safety story. HR re-exports every month, and an
-- import that reset somebody's role, revoked their sign-in, or wiped a
-- location an admin had set by hand would be a quiet monthly demolition of
-- work done inside the app. Nobody would connect the two.
--
-- BLANK NEVER ERASES
-- ------------------
-- 374 of the 527 real rows have no email and 409 have no phone. A blank cell
-- in an HR export means "not recorded here", never "delete what you know". So
-- every incoming value merges with coalesce(new, old): an import can add or
-- correct, never empty.
--
-- MESSY VALUES ARE BLANKED, NOT FATAL  (client decision)
-- ------------------------------------------------------
-- The real file carries 2 malformed emails and 23 blank employee IDs — the
-- President Director among them. Those rows still describe people who hold
-- real laptops, so the bad VALUE is dropped and reported as a warning while
-- the PERSON is imported. Only two things skip a row outright: no name at all,
-- and an employee ID already claimed earlier in the same file.
-- ============================================================================

create or replace function import_accounts(
  p_rows      jsonb,
  p_dry_run   boolean default true,
  p_file_name text    default 'employees.csv'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  row_json    jsonb;
  idx         int := 0;
  errors      jsonb := '[]'::jsonb;
  warnings    jsonb := '[]'::jsonb;
  row_errors  jsonb;
  n_created   int := 0;
  n_updated   int := 0;
  n_same      int := 0;
  n_skipped   int := 0;
  seen_niks   text[] := array[]::text[];
  seen_emails text[] := array[]::text[];
  batch_id    uuid;

  v_name     text;
  v_nik      text;
  v_job      text;
  v_co_name  text;
  v_company  uuid;
  v_email    text;
  v_phone    text;
  v_existing uuid;
  v_owner    text;
  cur        accounts%rowtype;
  m_nik      text;
  m_job      text;
  m_company  uuid;
  m_email    text;
  m_phone    text;
begin
  -- SECURITY DEFINER because migration 0019 revoked insert, update and delete
  -- on accounts from `authenticated`: people are written through RPCs and never
  -- from the client. That makes the authority check this function's own job, so
  -- it borrows the one every other account RPC already uses.
  perform assert_can_manage_accounts();
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'The file could not be read' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_rows) = 0 then
    raise exception 'The file has no rows' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'That is more than 5000 rows — split the file' using errcode = 'P0001';
  end if;

  for row_json in select * from jsonb_array_elements(p_rows) loop
    idx := idx + 1;
    row_errors := '[]'::jsonb;
    v_company  := null;
    v_existing := null;
    v_owner    := null;

    v_name    := btrim(coalesce(row_json->>'employee_name', ''));
    v_nik     := nullif(btrim(coalesce(row_json->>'employee_id', '')), '');
    v_job     := nullif(btrim(coalesce(row_json->>'job_position', '')), '');
    v_co_name := btrim(coalesce(row_json->>'company', ''));
    v_email   := lower(btrim(coalesce(row_json->>'work_email', '')));

    -- Excel's text-forcing apostrophe rides along in exports, and stored as-is
    -- it would be dialled as part of the number.
    v_phone := btrim(regexp_replace(coalesce(row_json->>'work_phone', ''), '^''+', ''));
    v_phone := nullif(btrim(regexp_replace(v_phone, '[[:space:]]+', ' ', 'g')), '');

    -- ---- name: the only required column ----------------------------------
    if v_name = '' then
      row_errors := row_errors ||
        jsonb_build_object('column', 'employee_name', 'message', 'Required');
    end if;

    -- ---- company ---------------------------------------------------------
    if v_co_name <> '' then
      v_company := import_lookup('companies', v_co_name);
      if v_company is null then
        row_errors := row_errors ||
          jsonb_build_object('column', 'company', 'message', 'Not in master data');
      end if;
    end if;

    -- ---- email: shape first, then uniqueness -----------------------------
    if v_email <> '' and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      warnings := warnings || jsonb_build_object(
        'row', idx, 'name', v_name, 'column', 'work_email',
        'message', 'Not an email address — left blank');
      v_email := '';
    end if;

    -- ---- employee id -----------------------------------------------------
    if v_nik is null then
      warnings := warnings || jsonb_build_object(
        'row', idx, 'name', v_name, 'column', 'employee_id',
        'message', 'Blank — matched on name and company instead');
    elsif lower(v_nik) = any (seen_niks) then
      -- Two different people cannot share one employee ID, and guessing which
      -- of them is right would overwrite somebody. Skip the row and say why.
      row_errors := row_errors || jsonb_build_object(
        'column', 'employee_id',
        'message', 'Employee ID ' || v_nik || ' already used earlier in this file');
    end if;

    -- ---- verdict ---------------------------------------------------------
    if jsonb_array_length(row_errors) > 0 then
      n_skipped := n_skipped + 1;
      errors := errors || jsonb_build_object(
        'row', idx, 'name', v_name, 'serial', coalesce(v_nik, ''), 'problems', row_errors);
      continue;
    end if;

    if v_nik is not null then
      seen_niks := seen_niks || lower(v_nik);
    end if;

    -- ---- match -----------------------------------------------------------
    -- An employee ID is the identity when present. When it is blank, name plus
    -- company is the best available key — and it is why "Ruli Tanio" (SPR) and
    -- "Ruli Tanio SMA" (SMA) stay two separate people rather than merging.
    if v_nik is not null then
      select id into v_existing from accounts where lower(nik) = lower(v_nik) limit 1;
    else
      select id into v_existing from accounts
       where lower(full_name) = lower(v_name)
         and company_id is not distinct from v_company
       limit 1;
    end if;

    -- ---- email uniqueness, now that the person is known -------------------
    -- This runs AFTER the match on purpose. accounts.email is unique, so an
    -- address already in the table has to be checked — but the row that holds
    -- it is very often this same person being re-imported. Checking earlier
    -- would make everybody look like a thief of their own address.
    if v_email <> '' and v_email = any (seen_emails) then
      warnings := warnings || jsonb_build_object(
        'row', idx, 'name', v_name, 'column', 'work_email',
        'message', 'Already used earlier in this file — left blank');
      v_email := '';
    end if;

    if v_email <> '' then
      select full_name into v_owner from accounts
       where lower(email) = v_email
         and (v_existing is null or id <> v_existing)
       limit 1;
      if v_owner is not null then
        -- Blanking keeps the PERSON importable; the warning names who holds
        -- the address so somebody can sort it out in Odoo.
        warnings := warnings || jsonb_build_object(
          'row', idx, 'name', v_name, 'column', 'work_email',
          'message', 'Already used by ' || v_owner || ' — left blank');
        v_email := '';
      end if;
    end if;

    if v_email <> '' then
      seen_emails := seen_emails || v_email;
    end if;

    if v_existing is null then
      n_created := n_created + 1;
      if not p_dry_run then
        insert into accounts (full_name, nik, job_title, company_id, email, phone,
                              can_login, is_active, created_by)
        values (v_name, v_nik, v_job, v_company, nullif(v_email, ''), v_phone,
                false, true, my_account_id());
      end if;
      continue;
    end if;

    -- ---- merge: blank never erases ---------------------------------------
    select * into cur from accounts where id = v_existing;
    m_nik     := coalesce(v_nik, cur.nik);
    m_job     := coalesce(v_job, cur.job_title);
    m_company := coalesce(v_company, cur.company_id);
    m_email   := coalesce(nullif(v_email, ''), cur.email);
    m_phone   := coalesce(v_phone, cur.phone);

    if cur.full_name  is not distinct from v_name
   and cur.nik        is not distinct from m_nik
   and cur.job_title  is not distinct from m_job
   and cur.company_id is not distinct from m_company
   and cur.email      is not distinct from m_email
   and cur.phone      is not distinct from m_phone then
      n_same := n_same + 1;
      continue;
    end if;

    n_updated := n_updated + 1;
    if not p_dry_run then
      -- Six columns, named one at a time. Anything absent from this list is
      -- managed inside the app and has to survive every future import.
      update accounts
         set full_name  = v_name,
             nik        = m_nik,
             job_title  = m_job,
             company_id = m_company,
             email      = m_email,
             phone      = m_phone,
             updated_at = now()
       where id = v_existing;
    end if;
  end loop;

  if not p_dry_run then
    insert into import_batches (kind, file_name, file_path, total_rows,
                                imported_rows, skipped_rows, errors, imported_by)
    values ('employees', coalesce(p_file_name, 'employees.csv'), 'inline',
            idx, n_created + n_updated, n_skipped, errors, my_account_id())
    returning id into batch_id;
  end if;

  return jsonb_build_object(
    'dryRun',    p_dry_run,
    'total',     idx,
    'created',   n_created,
    'updated',   n_updated,
    'unchanged', n_same,
    'skipped',   n_skipped,
    'errors',    errors,
    'warnings',  warnings,
    -- Grouped so the screen can say "23 × Blank employee ID" instead of
    -- printing 23 near-identical lines nobody will read.
    'warningSummary', (
      select coalesce(jsonb_agg(jsonb_build_object('message', message, 'count', n)
                                order by n desc, message), '[]'::jsonb)
      from (
        select w->>'message' as message, count(*) as n
        from jsonb_array_elements(warnings) w
        group by w->>'message'
      ) g
    ),
    'batchId',   batch_id
  );
end $$;

revoke all on function import_accounts(jsonb, boolean, text) from public, anon, authenticated;
grant execute on function import_accounts(jsonb, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- import_history(), now carrying `kind`.
--
-- DROPPED first, on purpose: Postgres refuses to change a function's return
-- type in place, and `create or replace` would fail rather than overload here.
-- Same argument types, so nothing else about the call changes.
--
-- Without `kind` the two screens would show each other's imports, and "527
-- rows imported" appearing under Import assets would be alarming and wrong.
-- ---------------------------------------------------------------------------
drop function if exists import_history(int);

create or replace function import_history(p_limit int default 25)
returns table (
  id uuid, kind text, file_name text, total_rows int, imported_rows int, skipped_rows int,
  errors jsonb, imported_by_name text, created_at timestamptz
)
language sql stable security invoker set search_path = public as $func$
  select
    b.id, b.kind, b.file_name, b.total_rows, b.imported_rows, b.skipped_rows,
    b.errors, coalesce(acc.full_name, 'System'), b.created_at
  from import_batches b
  left join accounts acc on acc.id = b.imported_by
  order by b.created_at desc
  limit greatest(1, least(coalesce(p_limit, 25), 100));
$func$;

revoke all on function import_history(int) from public, anon, authenticated;
grant execute on function import_history(int) to authenticated;
