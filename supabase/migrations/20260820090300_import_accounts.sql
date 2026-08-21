-- ============================================================================
-- CITE Assets — 0041 Groundwork for the employee import
--
-- 527 people live in Odoo and nowhere else. Typing them in is not a plan.
--
-- WHAT THIS IMPORT MAY WRITE
-- --------------------------
--   full_name, nik, job_title, company_id, email, phone
--
-- and nothing else. Not role, not can_login, not auth_user_id, not
-- location_id, not department_id, not is_active.
--
-- That list is the whole safety story. This import runs again every time HR
-- re-exports, and an import that reset somebody's role, revoked their sign-in
-- or wiped a location an admin had set by hand would be a quiet, monthly
-- demolition of work done inside the app. Nobody would connect the two.
--
-- BLANK NEVER ERASES
-- ------------------
-- 331 of the 527 rows have no email and 409 have no phone. A blank cell in an
-- HR export means "not recorded here", never "delete what you know". So every
-- incoming value is merged with coalesce(new, old): an import can only ever
-- add or correct, never empty.
--
-- MESSY VALUES ARE BLANKED, NOT FATAL  (client decision)
-- ------------------------------------------------------
-- The real file carries 2 malformed emails and 23 blank employee IDs — the
-- President Director among them. Those rows still describe real people who
-- hold real laptops, so the bad VALUE is dropped and reported as a warning
-- while the PERSON is imported. Only two things skip a row outright: no name
-- at all, and an employee ID already claimed earlier in the same file.
-- ============================================================================

-- Assets and employees now share import_batches; without this, one history
-- list would interleave two unrelated kinds of import.
alter table import_batches add column if not exists kind text not null default 'assets';

-- ---------------------------------------------------------------------------
-- import_lookup(), replaced in full to add the 'companies' branch. Same
-- signature, so this replaces rather than overloads.
-- import_accounts() itself is migration 0042; it needs companies to be
-- resolvable before it can be defined.
-- ---------------------------------------------------------------------------

create or replace function import_lookup(p_table text, p_name text)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare found_id uuid;
begin
  if coalesce(btrim(p_name), '') = '' then
    return null;
  end if;

  -- A fixed set of table names, never interpolated from user input beyond
  -- this whitelist: the parameter reaches a query, so anything else here
  -- would be an injection point.
  case p_table
    when 'categories' then
      select id into found_id from categories
       where lower(name) = lower(btrim(p_name)) and is_active limit 1;
    when 'brands' then
      select id into found_id from brands
       where lower(name) = lower(btrim(p_name)) and is_active limit 1;
    when 'models' then
      select id into found_id from models
       where lower(name) = lower(btrim(p_name)) and is_active limit 1;
    when 'vendors' then
      select id into found_id from vendors
       where lower(name) = lower(btrim(p_name)) and is_active limit 1;
    when 'departments' then
      select id into found_id from departments
       where lower(name) = lower(btrim(p_name)) and is_active limit 1;
    when 'locations' then
      select id into found_id from locations
       where lower(name) = lower(btrim(p_name)) or lower(code) = lower(btrim(p_name)) limit 1;
    when 'asset_statuses' then
      select id into found_id from asset_statuses where lower(name) = lower(btrim(p_name)) limit 1;
    when 'asset_conditions' then
      select id into found_id from asset_conditions where lower(name) = lower(btrim(p_name)) limit 1;
    when 'companies' then
      -- Deliberately more forgiving than the others. The Odoo export writes
      -- "PT Stargate Pasific Resources"; a human typing the same company into
      -- the template writes "PT. Stargate Pasific Resources". Both are the
      -- same firm, and refusing 436 rows over a full stop would be absurd.
      -- Full stops are dropped, runs of whitespace collapse, and the short
      -- code (SPR) is accepted too.
      select id into found_id from companies
       where lower(regexp_replace(replace(name, '.', ''), '[[:space:]]+', ' ', 'g'))
           = lower(regexp_replace(replace(btrim(p_name), '.', ''), '[[:space:]]+', ' ', 'g'))
          or lower(code) = lower(btrim(p_name))
       limit 1;
    else
      raise exception 'Unknown lookup %', p_table using errcode = 'P0001';
  end case;

  return found_id;
end $$;
