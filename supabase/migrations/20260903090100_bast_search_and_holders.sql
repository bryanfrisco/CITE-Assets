-- ============================================================================
-- CITE Assets — 0070 The e-BAST register can be searched, and names both holders
--
-- Two problems with one cause: bast_list() projected exactly one name and took
-- no search term.
--
--   Searching. The register grew past the point where scrolling finds anything.
--   The term is matched against the document number, the asset, BOTH holders,
--   the department and the location — because people look for a document by
--   whatever they happen to remember about it.
--
--   The second holder. A document handed to two people showed only the first,
--   so a pair of holders read as one person's handover, and searching for the
--   second person found nothing at all. That is the same complaint as the
--   printed document naming one receiver while carrying two signature boxes.
--
-- DROPPED first, never `create or replace` with a new parameter: that leaves
-- two overloads and PostgREST cannot choose between them (migration 0029).
-- ============================================================================

drop function if exists bast_list(uuid[], text);

create function bast_list(
  p_locations uuid[],
  p_kind      text default null,
  p_search    text default null
)
returns table (
  id uuid, bast_number text, kind bast_kind, status bast_status, bast_date date,
  asset_code text, asset_name text,
  employee_name text, secondary_name text, holder_label text,
  department_name text, location_name text,
  current_version int
)
language sql stable security invoker set search_path = public as $$
  select
    b.id, b.bast_number, b.kind, b.status, b.bast_date,
    a.asset_code, a.name,
    acc.full_name,
    acc2.full_name,
    -- One string the screen can print without deciding anything: "Ahmad" when
    -- there is one holder, "Ahmad, Rivaldi" when there are two. Built here so
    -- the list, the search and the export cannot disagree about it.
    acc.full_name || coalesce(', ' || acc2.full_name, ''),
    d.name, l.name,
    b.current_version
  from bast b
  left join assets   a    on a.id    = b.asset_id
  join accounts      acc  on acc.id  = b.account_id
  left join accounts acc2 on acc2.id = b.secondary_account_id
  join locations     l    on l.id    = b.location_id
  left join departments d on d.id = b.department_id
  where coalesce(a.location_id, b.location_id) = any (p_locations)
    and (p_kind is null or b.kind::text = p_kind)
    and (
      p_search is null or btrim(p_search) = ''
      or b.bast_number                ilike '%' || btrim(p_search) || '%'
      or coalesce(a.asset_code, '')   ilike '%' || btrim(p_search) || '%'
      or coalesce(a.name, '')         ilike '%' || btrim(p_search) || '%'
      or acc.full_name                ilike '%' || btrim(p_search) || '%'
      or coalesce(acc2.full_name, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(d.name, '')         ilike '%' || btrim(p_search) || '%'
      or l.name                       ilike '%' || btrim(p_search) || '%'
    )
  order by b.bast_date desc, b.bast_number desc;
$$;

revoke all on function bast_list(uuid[], text, text) from public, anon;
grant execute on function bast_list(uuid[], text, text) to authenticated;
