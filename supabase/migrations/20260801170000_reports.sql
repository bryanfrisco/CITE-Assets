-- ============================================================================
-- CITE Assets — 0025 Reports and export  (Phase 7)
--
-- One flat, fully-joined projection of the register, plus the counts that go on
-- the summary sheet. Everything is filtered by the caller's scope first, so an
-- export can never contain a row the person could not have seen on screen —
-- which is the whole risk with export features.
--
-- WHY THE EXPORT IS BUILT FROM ITS OWN FUNCTION
-- ---------------------------------------------
-- It would be tempting to export whatever search_assets() returned. That
-- function exists to fill a list on a phone: it returns display names, not the
-- purchase price, the warranty dates or the notes, and adding them would make
-- every scroll heavier for the sake of a button pressed once a month. A report
-- wants everything and does not care about latency. Two callers, two shapes.
-- ============================================================================

create or replace function asset_report(
  p_locations  uuid[],
  p_status     uuid default null,
  p_category   uuid default null,
  p_department uuid default null,
  p_from       date default null,
  p_to         date default null
)
returns table (
  asset_code text, name text, category_name text,
  brand_name text, model_name text, serial_number text,
  status_name text, condition_name text,
  location_name text, department_name text, holder_name text, holder_nik text,
  vendor_name text,
  purchase_date date, purchase_price numeric,
  warranty_start date, warranty_end date,
  warranty_days_left int,
  notes text, created_at timestamptz
)
language sql stable security invoker set search_path = public as $$
  select
    a.asset_code, a.name, c.name,
    b.name, m.name, a.serial_number,
    s.name, cond.name,
    l.name, d.name, acc.full_name, acc.nik,
    v.name,
    a.purchase_date, a.purchase_price,
    a.warranty_start, a.warranty_end,
    case when a.warranty_end is null then null
         else (a.warranty_end - current_date)::int end,
    a.notes, a.created_at
  from assets a
  join categories       c    on c.id    = a.category_id
  join asset_statuses   s    on s.id    = a.status_id
  join asset_conditions cond on cond.id = a.condition_id
  join locations        l    on l.id    = a.location_id
  left join brands      b    on b.id    = a.brand_id
  left join models      m    on m.id    = a.model_id
  left join vendors     v    on v.id    = a.vendor_id
  left join departments d    on d.id    = a.department_id
  left join accounts    acc  on acc.id  = a.assigned_to
  where a.location_id = any (p_locations)
    and (p_status     is null or a.status_id     = p_status)
    and (p_category   is null or a.category_id   = p_category)
    and (p_department is null or a.department_id = p_department)
    -- The date window is on acquisition, which is what an audit asks about.
    and (p_from is null or a.purchase_date >= p_from)
    and (p_to   is null or a.purchase_date <= p_to)
  order by a.asset_code;
$$;

/**
 * The numbers on the summary sheet.
 *
 * Value is the sum of what was paid, not a depreciated figure: this app has no
 * depreciation policy, and inventing one would put a number in front of Finance
 * that looks authoritative and is not.
 */
create or replace function report_summary(p_locations uuid[])
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'total',       count(*),
    'value',       coalesce(sum(a.purchase_price), 0),
    'byStatus', (
      select coalesce(jsonb_object_agg(t.name, t.n), '{}'::jsonb) from (
        select s.name, count(*) as n
        from assets x join asset_statuses s on s.id = x.status_id
        where x.location_id = any (p_locations)
        group by s.name
      ) t
    ),
    'byLocation', (
      select coalesce(jsonb_object_agg(t.name, t.n), '{}'::jsonb) from (
        select l.name, count(*) as n
        from assets x join locations l on l.id = x.location_id
        where x.location_id = any (p_locations)
        group by l.name
      ) t
    ),
    'byCategory', (
      select coalesce(jsonb_object_agg(t.name, t.n), '{}'::jsonb) from (
        select c.name, count(*) as n
        from assets x join categories c on c.id = x.category_id
        where x.location_id = any (p_locations)
        group by c.name
      ) t
    ),
    -- The two lists anyone actually chases.
    'warrantyExpiring', (
      select count(*) from assets x
      join asset_statuses s on s.id = x.status_id
      where x.location_id = any (p_locations)
        and x.warranty_end is not null
        and not s.is_terminal
        and x.warranty_end between current_date and current_date + 90
    ),
    'unassigned', (
      select count(*) from assets x
      join asset_statuses s on s.id = x.status_id
      where x.location_id = any (p_locations) and s.name = 'Available'
    )
  )
  from assets a
  where a.location_id = any (p_locations);
$$;

revoke all on function asset_report(uuid[], uuid, uuid, uuid, date, date)
  from public, anon, authenticated;
revoke all on function report_summary(uuid[]) from public, anon, authenticated;

grant execute on function asset_report(uuid[], uuid, uuid, uuid, date, date) to authenticated;
grant execute on function report_summary(uuid[])                            to authenticated;
