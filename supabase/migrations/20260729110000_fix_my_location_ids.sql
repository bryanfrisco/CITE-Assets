-- ============================================================================
-- CITE Assets — 0005 fix my_location_ids()  (Phase 1)
--
-- Additive: replaces a function, does not edit migration 0002.
--
-- BUG BEING FIXED
-- ---------------
-- DATABASE.md §10 defines the helper as:
--
--   select case
--     when (select role from v_me) in ('super_admin','corporate_it')
--       then (select id from locations)      -- <-- scalar subquery
--     else (select location_id from v_me)
--   end;
--
-- `(select id from locations)` is a scalar subquery. The moment more than one
-- location row exists — which is the seeded state, HO + SITE — Postgres raises
--
--   ERROR: more than one row returned by a subquery used as an expression
--
-- Because every RLS policy on assets/assignments/movements/bast/documents/
-- maintenance funnels through this helper, a Super Admin or Corporate IT user
-- could not read ANY row: the policy errored instead of filtering. Site IT and
-- Viewer happened to work, since their branch returns a single value.
--
-- The correct shape is a genuine set-returning query. Deny-by-default is
-- preserved: with no matching v_me row (unauthenticated, or an auth user with
-- no account), both branches yield zero rows, so no location is in scope.
-- ============================================================================

create or replace function my_location_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  -- Super Admin and Corporate IT see every location.
  select l.id
    from locations l
   where (select role from v_me) in ('super_admin', 'corporate_it')

  union

  -- Site IT and Viewer are limited to their own location.
  select m.location_id
    from v_me m
   where m.role in ('site_it', 'viewer')
     and m.location_id is not null;
$$;

revoke all on function my_location_ids() from anon, authenticated;
grant execute on function my_location_ids() to authenticated;
