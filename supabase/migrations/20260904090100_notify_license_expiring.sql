-- ============================================================================
-- CITE Assets — 0082 Tell somebody before the licence runs out
--
-- A licence quietly stops working on its expiry date, and the first sign is a
-- geologist who cannot open AutoCAD on a Monday morning. `expiry_state` already
-- said "expiring" at sixty days, but nothing ever told a person — it only
-- coloured a badge on a screen nobody opens unless they are already looking.
--
-- WHO IS TOLD
-- -----------
-- Both sides, because they act on it differently:
--
--   Corporate IT and Super Admin, who are the ones who can renew it.
--   Everybody holding a seat, because they are the ones whose work stops.
--
-- notify_recipients() cannot be reused here: it fans out by LOCATION, and a
-- licence has none — software is bought centrally. That is the whole reason
-- licences carry no location_id.
--
-- Default 30 days. The mentor's floor was "H-sebulan minimal", and a reminder
-- that arrives the week it expires is a reminder about a problem rather than a
-- warning about one.
--
-- `dedupe_key` carries the expiry date, so moving the date after a renewal
-- raises a fresh reminder while re-running the job never repeats one.
-- ============================================================================

alter table notifications
  add column if not exists license_id uuid references licenses(id) on delete cascade;

create index if not exists notifications_license_idx
  on notifications(license_id) where license_id is not null;

create or replace function notify_license_expiring(p_days int default 30)
returns int language plpgsql security definer set search_path = public as $$
declare inserted int;
begin
  with expiring as (
    select l.id, l.software, l.expiry_date,
           (l.expiry_date - current_date)::int as days_left
      from licenses l
     where l.is_active
       and l.expiry_date is not null
       and l.expiry_date <= current_date + coalesce(p_days, 30)
  ),
  -- The people who can renew it, and the people who lose their tool.
  audience as (
    select e.id as license_id, acc.id as account_id
      from expiring e
      join accounts acc
        on acc.is_active and acc.can_login
       and acc.role in ('super_admin', 'corporate_it')

    union

    select e.id, s.account_id
      from expiring e
      join license_seats s on s.license_id = e.id
      join accounts acc on acc.id = s.account_id
     where s.account_id is not null
       and acc.is_active and acc.can_login
  )
  insert into notifications (account_id, kind, title, body, license_id, dedupe_key)
  select
    a.account_id,
    'license_expiring',
    case
      when e.days_left < 0 then e.software || ' expired ' || to_char(e.expiry_date, 'DD Mon YYYY')
      when e.days_left = 0 then e.software || ' expires today'
      else e.software || ' expires in ' || e.days_left || ' day' ||
           case when e.days_left = 1 then '' else 's' end
    end,
    'Ends ' || to_char(e.expiry_date, 'DD Mon YYYY'),
    e.id,
    'license:' || e.id || ':' || e.expiry_date
  from audience a
  join expiring e on e.id = a.license_id
  on conflict (account_id, dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end $$;

-- The list gains the licence, so tapping the row opens it.
--
-- DROPPED first: a RETURNS TABLE cannot gain columns in place. The parameters
-- are unchanged, so no caller has to be touched.
drop function if exists notifications_list(int);

create function notifications_list(p_limit int default 50)
returns table (
  id uuid, kind notification_kind, title text, body text,
  asset_id uuid, asset_code text, bast_id uuid, bast_number text,
  license_id uuid, license_name text,
  read_at timestamptz, created_at timestamptz
)
language sql stable security invoker set search_path = public as $$
  select
    n.id, n.kind, n.title, n.body,
    n.asset_id, a.asset_code,
    n.bast_id, b.bast_number,
    n.license_id, l.software,
    n.read_at, n.created_at
  from notifications n
  left join assets   a on a.id = n.asset_id
  left join bast     b on b.id = n.bast_id
  left join licenses l on l.id = n.license_id
  where n.account_id = my_account_id()
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function notify_license_expiring(int) from public, anon;
grant execute on function notify_license_expiring(int) to authenticated;

revoke all on function notifications_list(int) from public, anon;
grant execute on function notifications_list(int) to authenticated;
