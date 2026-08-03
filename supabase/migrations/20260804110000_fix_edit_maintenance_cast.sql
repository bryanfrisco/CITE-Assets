-- ============================================================================
-- CITE Assets — 0031 Cast the derived state in edit_maintenance()
--
-- THE BUG
-- -------
--   column "state" is of type maintenance_state but expression is of type text
--
-- log_maintenance() casts its CASE expression to maintenance_state;
-- edit_maintenance() did not. A CASE over string literals is `text`, and
-- Postgres will not coerce it into an enum on assignment.
--
-- The effect: closing a repair failed outright. Which is a fair outcome for the
-- mistake — it broke loudly and the suite caught it — but it is the same shape
-- as the bug this whole migration set exists to fix, so it is worth being
-- explicit that `state` is now DERIVED and never chosen. It stays on the table
-- only because the column is NOT NULL from migration 0001; nothing reads it.
--
-- Separate migration because 0030 has already been applied — working rule #1.
-- ============================================================================

create or replace function edit_maintenance(
  p_id          uuid,
  p_title       text    default null,
  p_started     date    default null,
  p_completed   date    default null,
  p_detail      text    default null,
  p_vendor      uuid    default null,
  p_cost        numeric default null,
  p_next_due    date    default null,
  p_clear_completed boolean default false
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare m maintenance_records%rowtype; next_started date; next_completed date;
begin
  select * into m from maintenance_records where id = p_id;
  if not found then
    raise exception 'Maintenance record not found' using errcode = 'P0001';
  end if;
  if not can_write_assets() or not can_see_asset(m.asset_id) then
    raise exception 'You do not have permission to change this record'
      using errcode = 'P0001';
  end if;

  next_started   := coalesce(p_started, m.started_at);
  next_completed := case when p_clear_completed then null
                         else coalesce(p_completed, m.completed_at) end;

  if next_completed is not null and next_completed < next_started then
    raise exception 'It cannot have finished before it started' using errcode = 'P0001';
  end if;
  if p_cost is not null and p_cost < 0 then
    raise exception 'A cost cannot be negative' using errcode = 'P0001';
  end if;

  update maintenance_records set
    title        = coalesce(nullif(btrim(coalesce(p_title, '')), ''), title),
    detail       = coalesce(nullif(btrim(coalesce(p_detail, '')), ''), detail),
    vendor_id    = coalesce(p_vendor, vendor_id),
    started_at   = next_started,
    completed_at = next_completed,
    cost         = coalesce(p_cost, cost),
    next_due_at  = coalesce(p_next_due, next_due_at),
    -- Derived from the dates, never chosen. The cast is what 0030 was missing.
    state        = (case when next_completed is null then 'in_progress' else 'completed' end)
                   ::maintenance_state
  where id = p_id;

  return jsonb_build_object('id', p_id, 'ongoing', next_completed is null);
end $$;

revoke all on function edit_maintenance(uuid, text, date, date, text, uuid, numeric, date, boolean)
  from public, anon, authenticated;
grant execute on function edit_maintenance(uuid, text, date, date, text, uuid, numeric, date, boolean)
  to authenticated;
