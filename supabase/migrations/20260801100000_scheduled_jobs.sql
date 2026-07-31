-- ============================================================================
-- CITE Assets — 0020 Reading the schedule
--
-- The notification generators in migration 0019 can be correct and still never
-- fire, if the cron entry is missing — which is exactly what happens when the
-- migration is applied somewhere pg_cron is unavailable, and the DO block there
-- deliberately skips scheduling rather than failing.
--
-- That state is silent: no error, no notification, and nothing on any screen to
-- say why. This function is what makes it visible, to a test and to a Super
-- Admin looking at Settings.
--
-- SECURITY DEFINER because cron.job is owned by the postgres role and is not
-- readable by `authenticated`; restricted to Super Admin because it is
-- operational detail, not something a Site IT user has any use for.
-- ============================================================================

create or replace function scheduled_jobs()
returns table (jobname text, schedule text, active boolean)
language plpgsql stable security definer set search_path = public, cron as $$
begin
  if my_role() is distinct from 'super_admin' then
    raise exception 'Only a Super Admin can see the schedule' using errcode = 'P0001';
  end if;

  -- No pg_cron means no schedule to report, which is a real answer rather than
  -- an error: the caller learns the jobs are not running, which is the point.
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;

  return query
    select j.jobname::text, j.schedule::text, j.active
    from cron.job j
    where j.jobname like 'cite-%'
    order by j.jobname;
end $$;

revoke all on function scheduled_jobs() from anon, authenticated;
grant execute on function scheduled_jobs() to authenticated;
