-- ============================================================================
-- CITE Assets — 0021 Take EXECUTE away from PUBLIC on the internal functions
--
-- THE HOLE
-- --------
-- Postgres grants EXECUTE on every new function to PUBLIC. Every migration so
-- far wrote
--
--   revoke all on function f() from anon, authenticated;
--   grant execute on function f() to authenticated;
--
-- which reads like a lockdown and is not one: revoking from `anon` and
-- `authenticated` leaves the PUBLIC grant untouched, and PUBLIC includes both.
-- For the granted functions that made no difference — they were being granted
-- back anyway. For the ones deliberately left ungranted it did:
--
--   notify_warranty_expiring, notify_maintenance_due, notify_weekly_backup,
--   run_daily_notifications, notify_recipients
--
-- are all SECURITY DEFINER with no caller check, because they were written to
-- run from cron where there is no caller. Reachable over PostgREST they let
-- anybody — including an unauthenticated request — write notifications into
-- other people's inboxes, and notify_recipients hands back account ids.
--
-- The counters are the same shape: next_asset_code(), next_bast_number() and
-- next_tag_code() are SECURITY DEFINER so the counter tables can stay
-- ungranted, and a caller who could reach them could burn numbers out of the
-- sequences that documents are identified by.
--
-- WHAT THIS DOES NOT DO
-- ---------------------
-- It does not revoke from PUBLIC across the whole schema. The trigram operator
-- class functions live in `public` too and are owned by supabase_admin;
-- sweeping them up would break the search indexes for a hole they do not have.
-- The list below is explicit for that reason.
--
-- The four scope helpers are re-granted to `authenticated` in the same
-- statement, because RLS policy expressions are evaluated as the querying role
-- and DO require EXECUTE. Revoking without re-granting would lock every user
-- out of every table.
-- ============================================================================

-- ---- the notification generators: cron only --------------------------------
revoke execute on function notify_warranty_expiring(int)   from public;
revoke execute on function notify_maintenance_due(int)     from public;
revoke execute on function notify_weekly_backup()          from public;
revoke execute on function run_daily_notifications()       from public;
revoke execute on function notify_recipients(uuid)         from public;

-- ---- the number generators: called from defaults and from RPCs -------------
-- These stay reachable to the functions that use them, which run as their
-- owner, but not to a client.
revoke execute on function next_asset_code(uuid, date)     from public;
revoke execute on function next_bast_number()              from public;
revoke execute on function next_tag_code(text)             from public;

-- ---- internal helpers ------------------------------------------------------
revoke execute on function validate_signature_strokes(jsonb) from public;
revoke execute on function other_super_admins(uuid)          from public;
revoke execute on function assert_can_manage_accounts()      from public;

-- ---- scope helpers: revoke from PUBLIC, keep for authenticated -------------
-- Used inside RLS policies, which are evaluated as the querying role.
revoke execute on function can_see_asset(uuid)   from public;
revoke execute on function can_write_assets()    from public;
revoke execute on function my_role()             from public;
revoke execute on function my_account_id()       from public;

grant execute on function can_see_asset(uuid)    to authenticated;
grant execute on function can_write_assets()     to authenticated;
grant execute on function my_role()              to authenticated;
grant execute on function my_account_id()        to authenticated;

-- The storage policies in migrations 0011, 0013 and 0019 call can_see_asset()
-- and can_write_assets() as `authenticated`, which the grants above cover.
