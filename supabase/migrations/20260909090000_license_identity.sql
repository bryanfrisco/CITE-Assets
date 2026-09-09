-- ============================================================================
-- CITE Assets — 0086 A licence identified by its account, not a number
--
-- The client said it plainly: not every licence has a licence number. Some are
-- known by the account you sign in with at the vendor — that account IS the
-- licence's identity, and there is no code anywhere to fall back on.
--
-- Three things were wrong.
--
-- 1. TWO LICENCES STORE THE WORD "Using Email" AS THEIR LICENCE NUMBER.
--    Capcut Pro and Civil 3D. In the spreadsheet that phrase was a note to the
--    reader meaning "this one has no number, look at the account"; the importer
--    took it literally and filed it as the number. So the register prints
--    "Using Email" where a code belongs, and any search for a real number has
--    to step over it.
--
--    Only that exact phrase is cleared. Every other non-null value in the
--    column is a genuine identifier — a subscription id, a hyphenated key, a
--    base64 string — and none of them are touched. The update goes through the
--    existing licenses_audit trigger, so the change is on the record.
--
-- 2. THE ACCOUNT WAS NOT SEARCHABLE. licenses_list() matched software, licence
--    number and vendor. For AutoCAD, Canva, Revit and Sketchup — the four whose
--    only identity is the account — there was nothing to match on at all. You
--    could hold the account in your hand and still not find the licence.
--
-- 3. THE ACCOUNT WAS NEVER SHOWN in the register. The list returned the number
--    and nothing else, so those same four printed a dash. The identity existed
--    in the database and never reached the screen.
--
-- `account_label` fixes 2 and 3 from one source. It is DERIVED from the seats,
-- not a new stored column: a licence "is an account licence" precisely when it
-- has accounts and no number, and storing that as a third fact would give it
-- somewhere to disagree with the other two.
--
-- licenses_list() is DROPPED before it is recreated. A `returns table` function
-- cannot gain a column in place — Postgres refuses to change the result type of
-- an existing function.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The marker that was mistaken for a number.
-- ---------------------------------------------------------------------------
update licenses
   set license_number = null,
       updated_at = now()
 where lower(btrim(license_number)) = 'using email';

-- ---------------------------------------------------------------------------
-- 2 and 3. The account, searchable and visible.
-- ---------------------------------------------------------------------------
drop function if exists licenses_list(text, uuid, text);

create function licenses_list(
  p_query    text default null,
  p_category uuid default null,
  p_status   text default null      -- 'available' | 'expiring' | 'expired'
) returns table (
  id uuid, software text, license_number text,
  -- Every distinct account on this licence's seats, or null when it has none.
  -- The screen shows this wherever there is no licence number, because for
  -- those licences it is the only identity there is.
  account_label text,
  category_id uuid, category_name text,
  vendor_name text, purchase_year int,
  expiry_date date, expiry_state text,
  total_seats int, used_seats int, available_seats int,
  is_active boolean
)
language sql stable security invoker set search_path = public as $$
  with counted as (
    select
      l.*,
      (select count(*) from license_seats s where s.license_id = l.id)::int as total_seats,
      (select count(*) from license_seats s
        where s.license_id = l.id and s.account_id is not null)::int as used_seats,
      (select string_agg(distinct btrim(s.seat_account), ', ' order by btrim(s.seat_account))
         from license_seats s
        where s.license_id = l.id and btrim(coalesce(s.seat_account, '')) <> '') as account_label
    from licenses l
  )
  select
    c.id, c.software, c.license_number,
    c.account_label,
    c.category_id, cat.name,
    v.name, c.purchase_year,
    c.expiry_date, license_expiry_state(c.expiry_date),
    c.total_seats, c.used_seats, (c.total_seats - c.used_seats),
    c.is_active
  from counted c
  join license_categories cat on cat.id = c.category_id
  left join vendors v on v.id = c.vendor_id
  where (p_category is null or c.category_id = p_category)
    and (
      p_query is null or btrim(p_query) = ''
      or c.software                       ilike '%' || btrim(p_query) || '%'
      or coalesce(c.license_number, '')   ilike '%' || btrim(p_query) || '%'
      or coalesce(v.name, '')             ilike '%' || btrim(p_query) || '%'
      -- The account, so a licence with no number is findable by the only
      -- thing that identifies it.
      or coalesce(c.account_label, '')    ilike '%' || btrim(p_query) || '%'
    )
    and (
      p_status is null
      or (p_status = 'available' and c.total_seats > c.used_seats)
      or (p_status = 'expiring'  and license_expiry_state(c.expiry_date) = 'expiring')
      or (p_status = 'expired'   and license_expiry_state(c.expiry_date) = 'expired')
    )
  order by c.software;
$$;

revoke all on function licenses_list(text, uuid, text) from public, anon;
grant execute on function licenses_list(text, uuid, text) to authenticated;
