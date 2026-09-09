-- ============================================================================
-- CITE Assets — 0088 What the dashboard should have been saying
--
-- Three gradient cards filled a whole row to say "0", "0", "0". That is a lot
-- of screen for no information, and worse, a bare zero cannot tell you which
-- of two very different things it means:
--
--   nothing is due          — good news, nothing to do
--   nothing is configured   — the question is not being asked at all
--
-- SERVICE DUE was the second kind and read like the first. Not one category
-- has a service rule, so the notifier and the card both had nothing to look
-- at; the card printed 0 and looked like reassurance. `maintenanceRules` makes
-- the difference visible, so the screen can say "no service rules yet" and
-- offer to set them instead of quietly implying all is well.
--
-- WHAT IS DUE NEXT. A zero is more useful with a horizon attached: nothing in
-- the next 60 days, and the next one is Avenza on 12 December. Each of the
-- three windows gets its `next*` — deliberately the first one BEYOND the
-- window, since anything inside it is already counted.
--
-- THREE THINGS THAT WERE NEVER ON THE DASHBOARD AT ALL, each chosen because it
-- is work sitting still rather than a statistic:
--
--   bastUnfinished    a handover is not a handover until it is signed. Draft
--                     and awaiting_signature are both unfinished but they are
--                     not the same problem — one is waiting on you, the other
--                     on somebody else — so both counts are returned and the
--                     screen says which is which.
--   unassignedAssets  kit nobody is holding: ready to give out, or forgotten.
--   labelsUnused      stickers printed and never stuck on anything.
--
-- Everything is filtered by `p_locations` exactly as the rest of this function
-- is. Licences are the one exception, as before: a licence has no site.
-- ============================================================================

create or replace function dashboard_summary(p_locations uuid[])
returns jsonb language sql stable security invoker set search_path = public as $$
  with maint as (
    -- The same derivation maintenance_due_list() uses: last completed service,
    -- else purchase date, else the day the record was made. Written here once
    -- and used for both the count and the horizon.
    select
      a.asset_code,
      (coalesce(
         (select max(m.completed_at) from maintenance_records m
           where m.asset_id = a.id and m.completed_at is not null),
         a.purchase_date, a.created_at::date)
       + (s.every_months || ' months')::interval)::date as due_on
    from assets a
    join maintenance_schedules s on s.category_id = a.category_id and s.is_active
    join asset_statuses st on st.id = a.status_id
    where a.location_id = any (p_locations) and not st.is_terminal
  )
  select jsonb_build_object(
    'total', (
      select count(*) from assets a where a.location_id = any (p_locations)
    ),
    'addedThisMonth', (
      select count(*) from assets a
      where a.location_id = any (p_locations)
        and a.created_at >= date_trunc('month', current_date)
    ),

    -- Keyed by status NAME so the client does not need the ids, and ordered by
    -- the master data's own sort_order so the tiles read the way the register
    -- does.
    'byStatus', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', t.name, 'count', t.n, 'color', t.color
      ) order by t.sort_order), '[]'::jsonb)
      from (
        select s.name, s.color, s.sort_order, count(a.id) as n
        from asset_statuses s
        left join assets a
          on a.status_id = s.id and a.location_id = any (p_locations)
        group by s.name, s.color, s.sort_order
      ) t
    ),

    'warrantyExpiring', (
      select count(*) from assets a
      join asset_statuses s on s.id = a.status_id
      where a.location_id = any (p_locations)
        and a.warranty_end is not null
        and not s.is_terminal
        and a.warranty_end between current_date and current_date + 30
    ),
    -- The first one PAST the window, so a zero still has a horizon.
    'nextWarranty', (
      select jsonb_build_object('label', a.asset_code, 'date', a.warranty_end)
      from assets a
      join asset_statuses s on s.id = a.status_id
      where a.location_id = any (p_locations)
        and not s.is_terminal
        and a.warranty_end > current_date + 30
      order by a.warranty_end
      limit 1
    ),

    'licensesExpiring', (
      select count(*) from licenses l
      where l.is_active and license_expiry_state(l.expiry_date) = 'expiring'
    ),
    'licensesExpired', (
      select count(*) from licenses l
      where l.is_active and license_expiry_state(l.expiry_date) = 'expired'
    ),
    'nextLicense', (
      select jsonb_build_object('label', l.software, 'date', l.expiry_date)
      from licenses l
      where l.is_active and license_expiry_state(l.expiry_date) = 'ok'
      order by l.expiry_date
      limit 1
    ),

    'maintenanceDue', (
      select count(*) from maint where due_on <= current_date + 30
    ),
    'maintenanceOverdue', (
      select count(*) from maint where due_on < current_date
    ),
    -- Zero due means nothing when nothing is being watched. This is what lets
    -- the screen tell "all serviced" apart from "no rules set".
    'maintenanceRules', (
      select count(*) from maintenance_schedules where is_active
    ),
    'nextService', (
      select jsonb_build_object('label', m.asset_code, 'date', m.due_on)
      from maint m where m.due_on > current_date + 30
      order by m.due_on limit 1
    ),

    -- ---- work sitting still ------------------------------------------------
    -- A handover is not a handover until it is signed. Draft is waiting on the
    -- person looking at this screen; awaiting_signature is waiting on somebody
    -- else. Same backlog, different next move, so both are returned.
    'bastDraft', (
      select count(*) from bast b
      where b.location_id = any (p_locations) and b.status = 'draft'
    ),
    'bastAwaitingSignature', (
      select count(*) from bast b
      where b.location_id = any (p_locations) and b.status = 'awaiting_signature'
    ),
    'unassignedAssets', (
      select count(*) from assets a
      join asset_statuses s on s.id = a.status_id
      where a.location_id = any (p_locations)
        and a.assigned_to is null
        and not s.is_terminal
    ),
    'labelsUnused', (
      select count(*) from asset_tags t
      where t.status = 'untagged'
        and (t.location_id is null or t.location_id = any (p_locations))
    ),

    -- Only categories that actually have something in them. A donut with nine
    -- zero-width segments is a worse picture than one with three.
    'byCategory', (
      select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'count', t.n)
                                order by t.n desc, t.name), '[]'::jsonb)
      from (
        select c.name, count(*) as n
        from assets a join categories c on c.id = a.category_id
        where a.location_id = any (p_locations)
        group by c.name
      ) t
    ),

    'byLocation', (
      select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'count', t.n)
                                order by t.n desc, t.name), '[]'::jsonb)
      from (
        select l.name, count(*) as n
        from assets a join locations l on l.id = a.location_id
        where a.location_id = any (p_locations)
        group by l.name
      ) t
    ),

    'byDepartment', (
      select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'count', t.n)
                                order by t.n desc, t.name), '[]'::jsonb)
      from (
        select d.name, count(*) as n
        from assets a join departments d on d.id = a.department_id
        where a.location_id = any (p_locations)
        group by d.name
      ) t
    ),

    -- The rail at the bottom. Reuses the same vocabulary as the asset Timeline
    -- rather than inventing a second one for the same events.
    'recent', (
      select coalesce(jsonb_agg(e order by e->>'at' desc), '[]'::jsonb)
      from (
        (select jsonb_build_object(
          'kind', 'assigned',
          'title', a.asset_code || ' → ' || acc.full_name,
          'detail', a.name,
          'at', asg.created_at,
          'assetCode', a.asset_code
        )
        from assignments asg
        join assets a on a.id = asg.asset_id
        join accounts acc on acc.id = asg.account_id
        where a.location_id = any (p_locations) and asg.state = 'active'
        order by asg.created_at desc limit 6)

        union all

        (select jsonb_build_object(
          'kind', 'moved',
          'title', a.asset_code || ' · ' || coalesce(fl.name, 'Unknown') || ' → ' || tl.name,
          'detail', mv.reason,
          'at', mv.moved_at,
          'assetCode', a.asset_code
        )
        from movements mv
        join assets a on a.id = mv.asset_id
        left join locations fl on fl.id = mv.from_location
        join locations tl on tl.id = mv.to_location
        where a.location_id = any (p_locations)
        order by mv.moved_at desc limit 6)

        union all

        (select jsonb_build_object(
          'kind', 'registered',
          'title', a.asset_code || ' registered',
          'detail', a.name,
          'at', a.created_at,
          'assetCode', a.asset_code
        )
        from assets a
        where a.location_id = any (p_locations)
        order by a.created_at desc limit 6)
      ) events(e)
    )
  );
$$;

revoke all on function dashboard_summary(uuid[]) from public, anon, authenticated;
grant execute on function dashboard_summary(uuid[]) to authenticated;
