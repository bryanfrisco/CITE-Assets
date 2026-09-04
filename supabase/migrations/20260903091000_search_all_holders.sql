-- ============================================================================
-- CITE Assets — 0078 The register lists every holder
--
-- search_assets() printed the first name only, with a comment saying two would
-- not fit the card. They do fit — the line wraps — and the cost of the old
-- choice was that a radio carried by two people appeared to belong to one of
-- them. Somebody looking for the other person's equipment found nothing.
--
-- Same signature and the same return columns, so create or replace is safe:
-- what changed is what `holder_name` CONTAINS, not the shape of the result.
-- ============================================================================

create or replace function search_assets(
  p_locations uuid[],
  p_query     text default null,
  p_status    uuid default null,
  p_category  uuid default null,
  p_sort      text default 'code'
)
returns table (
  id uuid, asset_code text, name text, serial_number text,
  category_name text, category_icon text,
  brand_name text, model_name text,
  status_name text, condition_name text, location_name text,
  holder_name text, department_name text,
  warranty_end date
)
language sql stable security invoker set search_path = public as $$
  select
    a.id, a.asset_code, a.name, a.serial_number,
    c.name, c.icon, b.name, m.name,
    s.name, cond.name, l.name,
    -- Every holder, not just the first. A radio carried by two people was
    -- listed under one of their names, so the register read as if the other
    -- had nothing to do with it. The card wraps rather than truncating: a name
    -- that is not shown is a person nobody thinks to ask.
    --
    -- The holders table is preferred; assigned_to_secondary is the fallback for
    -- assignments recorded before it existed.
    acc.full_name || coalesce((
      select string_agg(', ' || ha.full_name, '' order by h.position)
        from assignments asg
        join assignment_holders h on h.assignment_id = asg.id
        join accounts ha on ha.id = h.account_id
       where asg.asset_id = a.id and asg.state = 'active'
    ), coalesce(', ' || acc2.full_name, '')),
    d.name,
    a.warranty_end
  from assets a
  join categories       c    on c.id    = a.category_id
  join asset_statuses   s    on s.id    = a.status_id
  join asset_conditions cond on cond.id = a.condition_id
  join locations        l    on l.id    = a.location_id
  left join brands      b    on b.id    = a.brand_id
  left join models      m    on m.id    = a.model_id
  left join accounts    acc  on acc.id  = a.assigned_to
  -- The other shift. Without this join a handy-talkie is findable by one of
  -- its two holders and invisible to the other, which would make the second
  -- name look like decoration.
  left join accounts    acc2 on acc2.id = a.assigned_to_secondary
  left join departments d    on d.id    = a.department_id
  where a.location_id = any (p_locations)
    and (p_status   is null or a.status_id   = p_status)
    and (p_category is null or a.category_id = p_category)
    and (
      p_query is null or btrim(p_query) = ''
      or a.asset_code          ilike '%' || btrim(p_query) || '%'
      or a.name                ilike '%' || btrim(p_query) || '%'
      or a.serial_number       ilike '%' || btrim(p_query) || '%'
      or coalesce(b.name, '')  ilike '%' || btrim(p_query) || '%'
      or coalesce(m.name, '')  ilike '%' || btrim(p_query) || '%'
      or coalesce(acc.full_name, '')  ilike '%' || btrim(p_query) || '%'
      or coalesce(acc2.full_name, '') ilike '%' || btrim(p_query) || '%'
      or coalesce(d.name, '')  ilike '%' || btrim(p_query) || '%'
    )
  order by
    case when p_sort = 'name'     then a.name end asc,
    case when p_sort = 'newest'   then a.created_at end desc,
    case when p_sort = 'oldest'   then a.created_at end asc,
    case when p_sort = 'status'   then s.sort_order end asc,
    case when p_sort = 'location' then l.name end asc,
    case when p_sort = 'warranty' then a.warranty_end end asc nulls last,
    -- 'code', and the tie-break for every other sort. Without it two assets
    -- with the same name come back in whatever order the planner felt like,
    -- and the list reshuffles on every refresh.
    a.asset_code asc;
$$;
