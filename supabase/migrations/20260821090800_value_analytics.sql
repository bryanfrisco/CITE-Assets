-- ============================================================================
-- CITE Assets — 0051 What it is all worth, and who is holding what
--
-- value_analytics()
-- -----------------
-- Reports showed one number: the value of the assets. Accessories now hold
-- real money too — 500 mice at 85,000 is not a rounding error — and a total
-- that silently omits them is worse than no total, because it looks complete.
--
-- Three figures, not one, and all three visible at once. A picker would make
-- somebody remember which of the three they were looking at, and the whole
-- point of putting them side by side is that nobody has to.
--
-- Value is what was PAID. There is no depreciation policy in this system, and
-- inventing one would put an authoritative-looking number in front of Finance.
-- The same sentence is already on the Reports screen; this keeps it true.
--
-- account_holdings()
-- ------------------
-- Opening a person answered "what is their role" but never "what do they have",
-- which is the question anybody actually opens a person to ask.
-- ============================================================================

create or replace function value_analytics(
  p_locations  uuid[],
  p_from       date default null,
  p_to         date default null,
  p_category   uuid default null,
  p_department uuid default null
) returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'assets', (
      select jsonb_build_object(
        'count', count(*),
        'value', coalesce(sum(a.purchase_price), 0),
        'byCategory', (
          select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'count', t.n)
                                    order by t.n desc), '[]'::jsonb)
          from (
            select c.name, count(*) as n
            from assets x join categories c on c.id = x.category_id
            where x.location_id = any (p_locations)
              and (p_category   is null or x.category_id   = p_category)
              and (p_department is null or x.department_id = p_department)
              and (p_from is null or x.purchase_date >= p_from)
              and (p_to   is null or x.purchase_date <= p_to)
            group by c.name
          ) t
        ),
        'byLocation', (
          select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'count', t.n)
                                    order by t.n desc), '[]'::jsonb)
          from (
            select l.name, count(*) as n
            from assets x join locations l on l.id = x.location_id
            where x.location_id = any (p_locations)
              and (p_category   is null or x.category_id   = p_category)
              and (p_department is null or x.department_id = p_department)
              and (p_from is null or x.purchase_date >= p_from)
              and (p_to   is null or x.purchase_date <= p_to)
            group by l.name
          ) t
        ),
        'byDepartment', (
          select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'count', t.n)
                                    order by t.n desc), '[]'::jsonb)
          from (
            select d.name, count(*) as n
            from assets x join departments d on d.id = x.department_id
            where x.location_id = any (p_locations)
              and (p_category   is null or x.category_id   = p_category)
              and (p_department is null or x.department_id = p_department)
              and (p_from is null or x.purchase_date >= p_from)
              and (p_to   is null or x.purchase_date <= p_to)
            group by d.name
          ) t
        )
      )
      from assets a
      where a.location_id = any (p_locations)
        and (p_category   is null or a.category_id   = p_category)
        and (p_department is null or a.department_id = p_department)
        and (p_from is null or a.purchase_date >= p_from)
        and (p_to   is null or a.purchase_date <= p_to)
    ),

    'accessories', (
      -- Departments do not apply: an accessory belongs to a shelf, not a team,
      -- so a department filter narrows the assets and leaves this figure alone.
      -- Saying so on screen is better than quietly returning zero.
      select jsonb_build_object(
        'count', count(*),
        'qty', coalesce(sum(x.total_qty), 0),
        'value', coalesce(sum(x.total_qty * coalesce(x.purchase_price, 0)), 0),
        'byCategory', (
          select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'count', t.n)
                                    order by t.n desc), '[]'::jsonb)
          from (
            select c.name, sum(y.total_qty) as n
            from accessories y join categories c on c.id = y.category_id
            where y.location_id = any (p_locations)
              and (p_category is null or y.category_id = p_category)
              and (p_from is null or y.purchase_date >= p_from)
              and (p_to   is null or y.purchase_date <= p_to)
            group by c.name
          ) t
        ),
        'byLocation', (
          select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'count', t.n)
                                    order by t.n desc), '[]'::jsonb)
          from (
            select l.name, sum(y.total_qty) as n
            from accessories y join locations l on l.id = y.location_id
            where y.location_id = any (p_locations)
              and (p_category is null or y.category_id = p_category)
              and (p_from is null or y.purchase_date >= p_from)
              and (p_to   is null or y.purchase_date <= p_to)
            group by l.name
          ) t
        )
      )
      from accessories x
      where x.location_id = any (p_locations)
        and (p_category is null or x.category_id = p_category)
        and (p_from is null or x.purchase_date >= p_from)
        and (p_to   is null or x.purchase_date <= p_to)
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- What one person is holding — both kinds.
-- ---------------------------------------------------------------------------
create or replace function account_holdings(p_account uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'assets', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id,
        'assetCode', a.asset_code,
        'name', a.name,
        'categoryName', c.name,
        'statusName', s.name,
        'locationName', l.name,
        -- Says WHY they have it: the first holder of a shared radio, or the
        -- second. Without this a pair looks like two separate hand-overs.
        'role', case when a.assigned_to = p_account then 'primary' else 'secondary' end
      ) order by a.asset_code), '[]'::jsonb)
      from assets a
      join categories       c on c.id = a.category_id
      join asset_statuses   s on s.id = a.status_id
      join locations        l on l.id = a.location_id
      where a.assigned_to = p_account or a.assigned_to_secondary = p_account
    ),
    'accessories', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', co.id,
        'accessoryId', x.id,
        'name', x.name,
        'qty', co.qty,
        'assignedDate', co.assigned_date,
        'locationName', l.name,
        'bastNumber', (select bast_number from bast where id = co.bast_id)
      ) order by co.assigned_date desc), '[]'::jsonb)
      from accessory_checkouts co
      join accessories x on x.id = co.accessory_id
      join locations   l on l.id = x.location_id
      -- Only what they still have. Everything returned stays in the accessory's
      -- own history, which is where "what did they once hold" belongs.
      where co.account_id = p_account and co.state = 'active'
    )
  );
$$;

revoke all on function value_analytics(uuid[], date, date, uuid, uuid)
  from public, anon, authenticated;
revoke all on function account_holdings(uuid) from public, anon, authenticated;

grant execute on function value_analytics(uuid[], date, date, uuid, uuid) to authenticated;
grant execute on function account_holdings(uuid) to authenticated;
