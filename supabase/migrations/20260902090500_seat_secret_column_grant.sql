-- ============================================================================
-- CITE Assets — 0067 The stored password is not a readable column
--
-- Migration 0063 granted plain `select` on license_seats, which made
-- reveal_seat_secret() decorative: any signed-in client could ask PostgREST for
--
--   /rest/v1/license_seats?select=seat_secret
--
-- and read every password without a role check and without an audit row. The
-- RPC was the front door while the window stood open.
--
-- Postgres grants are per COLUMN, so the fix is to name the columns that may be
-- read and leave `seat_secret` out of the list. A select that mentions it now
-- fails at the database, for every role, including through PostgREST.
--
-- license_detail() has to become `security definer` as a result: it reads
-- seat_secret to compute the `has_secret` boolean, and as an invoker function
-- it would now be refused. It still returns only the boolean — the value never
-- enters the payload.
-- ============================================================================

revoke select on license_seats from authenticated;

grant select (
  id, license_id, account_id, seat_account, assigned_date, notes,
  created_at, updated_at, created_by
) on license_seats to authenticated;

-- Reads seat_secret; returns only whether one exists.
create or replace function license_detail(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id',             l.id,
    'software',       l.software,
    'license_number', l.license_number,
    'category_id',    l.category_id,
    'category_name',  cat.name,
    'vendor_id',      l.vendor_id,
    'vendor_name',    v.name,
    'purchase_year',  l.purchase_year,
    'expiry_date',    l.expiry_date,
    'expiry_state',   license_expiry_state(l.expiry_date),
    'notes',          l.notes,
    'is_active',      l.is_active,
    'seats', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',            s.id,
        'seat_account',  s.seat_account,
        'has_secret',    (s.seat_secret is not null and btrim(s.seat_secret) <> ''),
        'account_id',    s.account_id,
        'holder_name',   a.full_name,
        'holder_nik',    a.nik,
        'department',    d.name,
        'assigned_date', s.assigned_date,
        'notes',         s.notes,
        'status',        case when s.account_id is null then 'Standby' else 'Used' end
      ) order by (s.account_id is null), a.full_name nulls last, s.created_at)
      from license_seats s
      left join accounts a    on a.id = s.account_id
      left join departments d on d.id = a.department_id
      where s.license_id = l.id
    ), '[]'::jsonb)
  )
  from licenses l
  join license_categories cat on cat.id = l.category_id
  left join vendors v on v.id = l.vendor_id
  where l.id = p_id;
$$;

revoke all on function license_detail(uuid) from public, anon;
grant execute on function license_detail(uuid) to authenticated;
