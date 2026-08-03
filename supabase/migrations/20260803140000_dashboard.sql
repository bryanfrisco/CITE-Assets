-- ============================================================================
-- CITE Assets — 0028 dashboard_summary()
--
-- README § Screens 1: the KPI grid, the warranty card, the category donut, the
-- location bars and the recent-activity rail. Every number the Home screen
-- shows, in one round trip, because six queries fired on every scope change is
-- six chances for the tiles to disagree with each other for a frame.
--
-- Scoped like everything else: `p_locations` is the user's chosen locations and
-- RLS narrows it further. A Site IT user's dashboard counts their own site.
--
-- The deltas README asks for ("+18 this month") are computed against
-- `created_at`, which is when the row was entered — not when the asset was
-- bought. Those are different questions and only one of them is answerable
-- from this table.
-- ============================================================================

create or replace function dashboard_summary(p_locations uuid[])
returns jsonb language sql stable security invoker set search_path = public as $$
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
