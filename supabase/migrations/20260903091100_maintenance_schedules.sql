-- ============================================================================
-- CITE Assets — 0079 Maintenance that is due by rule, not by memory
--
-- `maintenance_records.next_due_at` already existed, and somebody had to type
-- it into every record. Miss it once and the asset silently drops out of the
-- schedule — which is the failure nobody notices, because a thing that is not
-- listed as due looks exactly like a thing that is not due.
--
-- The rule belongs to the CATEGORY, not the asset: "every laptop, every six
-- months" is the sentence people actually say, and writing it once covers every
-- laptop bought afterwards without anybody remembering to set it.
--
-- WHEN IS AN ASSET DUE
-- --------------------
--   last completed maintenance + every_months        when it has ever been done
--   purchase date + every_months                     when it has not
--   created_at + every_months                        when there is no purchase date
--
-- Derived on read, never stored. A stored due date drifts the moment somebody
-- changes the rule, and the whole point of the rule is that it applies to
-- everything under it.
--
-- Terminal assets are excluded: a Lost or Retired laptop is not overdue for
-- service, and listing it as such trains people to ignore the list.
-- ============================================================================

create table if not exists maintenance_schedules (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null unique references categories(id) on delete cascade,
  -- Months rather than days: nobody schedules servicing in days, and a number
  -- of days would have to be explained every time it is read.
  every_months int  not null check (every_months between 1 and 120),
  notes        text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references accounts(id)
);

alter table maintenance_schedules enable row level security;

create policy maintenance_schedules_read on maintenance_schedules
  for select to authenticated using (true);

revoke all on maintenance_schedules from public, anon, authenticated;
grant select on maintenance_schedules to authenticated;

-- ---------------------------------------------------------------------------
-- The rule for one category, set or cleared.
-- ---------------------------------------------------------------------------
create or replace function set_maintenance_schedule(
  p_category uuid,
  p_months   int,          -- null clears the rule
  p_notes    text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if my_role() not in ('super_admin', 'corporate_it') then
    raise exception 'Only Corporate IT and above can set a maintenance rule'
      using errcode = 'P0001';
  end if;

  select name into v_name from categories where id = p_category;
  if v_name is null then
    raise exception 'That category is gone' using errcode = 'P0001';
  end if;

  if p_months is null then
    delete from maintenance_schedules where category_id = p_category;
    return jsonb_build_object('categoryId', p_category, 'category', v_name, 'everyMonths', null);
  end if;

  if p_months < 1 or p_months > 120 then
    raise exception 'Choose between 1 and 120 months' using errcode = 'P0001';
  end if;

  insert into maintenance_schedules (category_id, every_months, notes, created_by)
  values (p_category, p_months, nullif(btrim(coalesce(p_notes, '')), ''), my_account_id())
  on conflict (category_id) do update
    set every_months = excluded.every_months,
        notes        = excluded.notes,
        is_active    = true,
        updated_at   = now();

  return jsonb_build_object('categoryId', p_category, 'category', v_name, 'everyMonths', p_months);
end $$;

create or replace function maintenance_schedules_list()
returns table (category_id uuid, category_name text, every_months int,
               notes text, asset_count bigint)
language sql stable security invoker set search_path = public as $$
  select c.id, c.name, s.every_months, s.notes,
         (select count(*) from assets a where a.category_id = c.id)
    from categories c
    left join maintenance_schedules s on s.category_id = c.id and s.is_active
   order by c.name;
$$;

-- ---------------------------------------------------------------------------
-- What is due, and how late.
-- ---------------------------------------------------------------------------
create or replace function maintenance_due_list(
  p_locations uuid[],
  p_within_days int default 30
) returns table (
  asset_id uuid, asset_code text, asset_name text,
  category_name text, location_name text, holder_name text,
  every_months int, last_done date, due_on date, days_late int
)
language sql stable security invoker set search_path = public as $$
  with rule as (
    select s.category_id, s.every_months
      from maintenance_schedules s where s.is_active
  ),
  last_done as (
    select m.asset_id, max(m.completed_at) as done
      from maintenance_records m
     where m.completed_at is not null
     group by m.asset_id
  )
  select
    a.id, a.asset_code, a.name,
    c.name, l.name, acc.full_name,
    r.every_months,
    ld.done,
    (coalesce(ld.done, a.purchase_date, a.created_at::date)
       + (r.every_months || ' months')::interval)::date,
    (current_date - (coalesce(ld.done, a.purchase_date, a.created_at::date)
       + (r.every_months || ' months')::interval)::date)::int
  from assets a
  join rule r        on r.category_id = a.category_id
  join categories c  on c.id = a.category_id
  join locations  l  on l.id = a.location_id
  join asset_statuses st on st.id = a.status_id
  left join last_done ld on ld.asset_id = a.id
  left join accounts acc on acc.id = a.assigned_to
  where a.location_id = any (p_locations)
    -- A Lost or Retired asset is not overdue for service.
    and not st.is_terminal
    and (coalesce(ld.done, a.purchase_date, a.created_at::date)
           + (r.every_months || ' months')::interval)::date
        <= current_date + coalesce(p_within_days, 30)
  order by 10 desc, a.asset_code;
$$;

revoke all on function set_maintenance_schedule(uuid, int, text) from public, anon, authenticated;
revoke all on function maintenance_schedules_list() from public, anon;
revoke all on function maintenance_due_list(uuid[], int) from public, anon;
grant execute on function set_maintenance_schedule(uuid, int, text) to authenticated;
grant execute on function maintenance_schedules_list() to authenticated;
grant execute on function maintenance_due_list(uuid[], int) to authenticated;
