-- ============================================================================
-- CITE Assets — 0071 Step to the next asset without going back
--
-- Checking a shelf of laptops meant open, read, back, scroll, open the next
-- one. The list position was lost on every return trip, so the scroll was paid
-- for again each time.
--
-- Neighbours are computed against the SCOPED register ordered by asset_code —
-- the same order the register lists by default. Not against whatever search or
-- category filter was on screen: that would make Next mean something different
-- depending on how somebody arrived, and an arrow that moves somewhere
-- unpredictable is worse than no arrow. Asset code order is the one somebody
-- can hold in their head, and it matches the stickers on the shelf.
--
-- Returns both neighbours in one round trip; null at either end.
-- ============================================================================

create or replace function asset_neighbours(p_code text, p_locations uuid[])
returns table (prev_code text, prev_name text, next_code text, next_name text)
language sql stable security invoker set search_path = public as $$
  with scoped as (
    select a.asset_code, a.name
    from assets a
    where a.location_id = any (p_locations)
  ),
  here as (
    select asset_code from scoped where asset_code = p_code
  )
  select
    (select s.asset_code from scoped s, here h
      where s.asset_code < h.asset_code order by s.asset_code desc limit 1),
    (select s.name from scoped s, here h
      where s.asset_code < h.asset_code order by s.asset_code desc limit 1),
    (select s.asset_code from scoped s, here h
      where s.asset_code > h.asset_code order by s.asset_code asc limit 1),
    (select s.name from scoped s, here h
      where s.asset_code > h.asset_code order by s.asset_code asc limit 1);
$$;

revoke all on function asset_neighbours(text, uuid[]) from public, anon;
grant execute on function asset_neighbours(text, uuid[]) to authenticated;
