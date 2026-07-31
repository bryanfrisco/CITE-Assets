-- ============================================================================
-- CITE Assets — 0016 Status changes and disposal
--
-- Client instruction, 2026-07-30, on retiring or disposing of an asset:
--   "langsung ubah saja tapi ada lognya pastinya ttg siapa yang mengganti ganti"
--
-- WHY A TABLE AND NOT JUST THE AUDIT LOG
-- --------------------------------------
-- audit_log already records every update to `assets` with the actor attached,
-- so "who changed it" is answered there. What it cannot hold is WHY: it is a
-- generic before/after of the row, written by a trigger that knows nothing
-- about intent. "Retired" and "Lost" are the same row edit; the difference
-- between them and the reason behind either is the part a person actually needs
-- six months later, when the auditor asks where the laptop went.
--
-- So this adds a first-class history with a reason on it, which also gives the
-- Timeline something to show. The audit log keeps doing its job underneath —
-- these two are not alternatives, and nothing here writes to audit_log
-- (working rule #3).
--
-- WHAT IS REFUSED
-- ---------------
-- An asset that is still in someone's hands cannot be retired or lost. Not
-- because the update is hard, but because the register would then claim a
-- device is disposed of while a person is still carrying it, and no later
-- report could tell you that had happened. Return it first — that is one tap,
-- and it produces the record that says who gave it back.
-- ============================================================================

create table asset_status_changes (
  id              uuid primary key default gen_random_uuid(),
  asset_id        uuid not null references assets(id) on delete restrict,
  from_status     uuid references asset_statuses(id),
  to_status       uuid not null references asset_statuses(id),
  from_condition  uuid references asset_conditions(id),
  to_condition    uuid references asset_conditions(id),
  reason          text not null,
  changed_by      uuid references accounts(id),
  changed_at      timestamptz not null default now()
);

create index asset_status_changes_asset_idx
  on asset_status_changes (asset_id, changed_at desc);

-- Append-only, the same three ways as movements: no grant, no policy, and a
-- trigger. A disposal record that can be edited afterwards is worth nothing.
create trigger asset_status_changes_no_update before update on asset_status_changes
  for each row execute function forbid_mutation();
create trigger asset_status_changes_no_delete before delete on asset_status_changes
  for each row execute function forbid_mutation();

create trigger asset_status_changes_audit after insert on asset_status_changes
  for each row execute function audit_row('status_changed', 'status_changed');

alter table asset_status_changes enable row level security;

create policy asset_status_changes_read on asset_status_changes
  for select to authenticated using (can_see_asset(asset_id));

grant select on asset_status_changes to authenticated;
revoke insert, update, delete on asset_status_changes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- change_asset_status() — the only write path (working rule #2).
--
-- Two tables in one transaction: the asset row and its history. Doing this from
-- the client would mean a status change that leaves no trace whenever the
-- second call fails.
-- ---------------------------------------------------------------------------
create or replace function change_asset_status(
  p_asset     uuid,
  p_status    uuid,
  p_condition uuid default null,
  p_reason    text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a           assets%rowtype;
  me          uuid := my_account_id();
  target      asset_statuses%rowtype;
  next_cond   uuid;
begin
  select * into a from assets where id = p_asset;
  if not found then
    raise exception 'Asset not found' using errcode = 'P0001';
  end if;

  -- SECURITY DEFINER, so the guards RLS would have applied are re-stated
  -- (DATABASE.md §11).
  if not can_see_asset(p_asset) then
    raise exception 'Asset not found' using errcode = 'P0001';
  end if;
  if not can_write_assets() then
    raise exception 'You do not have permission to change this asset' using errcode = 'P0001';
  end if;

  select * into target from asset_statuses where id = p_status;
  if not found then
    raise exception 'Unknown status' using errcode = 'P0001';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Please say why the status is changing' using errcode = 'P0001';
  end if;

  next_cond := coalesce(p_condition, a.condition_id);

  if a.status_id = p_status and next_cond = a.condition_id then
    raise exception 'That is already the status' using errcode = 'P0001';
  end if;

  -- 'Assigned' is not something you declare; it is what assigning produces.
  -- Allowing it here would let the register say an asset is assigned with
  -- nobody holding it.
  if target.name = 'Assigned' then
    raise exception 'Use Assign to put this asset in someone''s hands'
      using errcode = 'P0001';
  end if;

  -- See the header: a device still in someone's hands cannot be disposed of.
  if target.is_terminal and a.assigned_to is not null then
    raise exception 'Return this asset first — % still has it',
      coalesce((select full_name from accounts where id = a.assigned_to), 'someone')
      using errcode = 'P0001';
  end if;

  insert into asset_status_changes (
    asset_id, from_status, to_status, from_condition, to_condition, reason, changed_by
  ) values (
    p_asset, a.status_id, p_status, a.condition_id, next_cond, trim(p_reason), me
  );

  update assets
     set status_id    = p_status,
         condition_id = next_cond,
         -- A terminal status ends any claim on the asset. It is already
         -- unassigned by the guard above; this clears the department too so it
         -- stops appearing under a team that no longer has it.
         department_id = case when target.is_terminal then null else department_id end
   where id = p_asset;

  return jsonb_build_object(
    'assetId', p_asset,
    'status', target.name,
    'terminal', target.is_terminal
  );
end $$;

-- ---------------------------------------------------------------------------
-- The history on its own, for anything that wants it without the whole detail
-- payload — a report, or an export.
-- ---------------------------------------------------------------------------
create or replace function asset_status_history(p_asset uuid)
returns table (
  id uuid, from_status text, to_status text,
  from_condition text, to_condition text,
  reason text, changed_by_name text, changed_at timestamptz
)
language sql stable security invoker set search_path = public as $$
  select
    sc.id,
    fs.name, ts.name,
    fc.name, tc.name,
    sc.reason,
    coalesce(acc.full_name, 'System'),
    sc.changed_at
  from asset_status_changes sc
  left join asset_statuses    fs  on fs.id  = sc.from_status
  join      asset_statuses    ts  on ts.id  = sc.to_status
  left join asset_conditions  fc  on fc.id  = sc.from_condition
  left join asset_conditions  tc  on tc.id  = sc.to_condition
  left join accounts          acc on acc.id = sc.changed_by
  where sc.asset_id = p_asset
  order by sc.changed_at desc;
$$;

revoke all on function change_asset_status(uuid, uuid, uuid, text) from anon, authenticated;
revoke all on function asset_status_history(uuid)                  from anon, authenticated;

grant execute on function change_asset_status(uuid, uuid, uuid, text) to authenticated;
grant execute on function asset_status_history(uuid)                  to authenticated;

-- ---------------------------------------------------------------------------
-- asset_detail() — replaced so the Timeline shows status changes.
--
-- Reproduced whole rather than patched, because a function is replaced as a
-- unit; everything except the new `union all` branch is byte-for-byte the
-- version from migration 0010.
-- ---------------------------------------------------------------------------
create or replace function asset_detail(p_code text)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare a assets%rowtype; result jsonb;
begin
  select * into a from assets where asset_code = p_code;
  if not found then
    -- Either the asset does not exist, or RLS hid it. The client shows the
    -- same "not found" either way, which is the correct thing to leak.
    return null;
  end if;

  select jsonb_build_object(
    'asset', jsonb_build_object(
      'id', a.id,
      'assetCode', a.asset_code,
      'name', a.name,
      'serialNumber', a.serial_number,
      'categoryId', a.category_id,
      'categoryName', (select name from categories where id = a.category_id),
      'categoryIcon', (select icon from categories where id = a.category_id),
      'brandId', a.brand_id,
      'brandName', (select name from brands where id = a.brand_id),
      'modelId', a.model_id,
      'modelName', (select name from models where id = a.model_id),
      'vendorId', a.vendor_id,
      'vendorName', (select name from vendors where id = a.vendor_id),
      'departmentId', a.department_id,
      'departmentName', (select name from departments where id = a.department_id),
      'locationId', a.location_id,
      'locationName', (select name from locations where id = a.location_id),
      'statusId', a.status_id,
      'statusName', (select name from asset_statuses where id = a.status_id),
      'conditionId', a.condition_id,
      'conditionName', (select name from asset_conditions where id = a.condition_id),
      'assignedToId', a.assigned_to,
      'assignedToName', (select full_name from accounts where id = a.assigned_to),
      'purchaseDate', a.purchase_date,
      'purchasePrice', a.purchase_price,
      'warrantyStart', a.warranty_start,
      'warrantyEnd', a.warranty_end,
      'specifications', a.specifications,
      'notes', a.notes,
      'photoPath', a.photo_path,
      'createdAt', a.created_at
    ),

    'timeline', (
      select coalesce(jsonb_agg(e order by e->>'at' desc), '[]'::jsonb)
      from (
        -- Purchased
        select jsonb_build_object(
          'kind', 'purchased',
          'title', 'Purchased',
          'at', a.purchase_date::timestamptz,
          'detail', coalesce((select name from vendors where id = a.vendor_id), 'Vendor not recorded'),
          'tag', null
        ) as e
        where a.purchase_date is not null

        union all

        -- Registered
        select jsonb_build_object(
          'kind', 'registered',
          'title', 'Registered',
          'at', a.created_at,
          'detail', 'Added to the register as ' || a.asset_code,
          'tag', null
        )

        union all

        -- Assigned — the BAST number rides along as the tag chip
        select jsonb_build_object(
          'kind', 'assigned',
          'title', 'Assigned',
          'at', asg.assigned_date::timestamptz,
          'detail', acc.full_name ||
                    coalesce(' · ' || (select name from departments where id = asg.department_id), ''),
          'tag', (select bast_number from bast where assignment_id = asg.id limit 1)
        )
        from assignments asg join accounts acc on acc.id = asg.account_id
        where asg.asset_id = a.id

        union all

        -- Returned
        select jsonb_build_object(
          'kind', 'returned',
          'title', 'Returned',
          'at', asg.returned_date::timestamptz,
          'detail', 'Returned by ' || acc.full_name,
          'tag', null
        )
        from assignments asg join accounts acc on acc.id = asg.account_id
        where asg.asset_id = a.id and asg.returned_date is not null

        union all

        -- Moved
        select jsonb_build_object(
          'kind', 'moved',
          'title', 'Moved',
          'at', mv.moved_at,
          'detail', coalesce(fl.name, 'Unknown') || ' → ' || tl.name || ' · ' || mv.reason,
          'tag', null
        )
        from movements mv
        left join locations fl on fl.id = mv.from_location
        join locations tl on tl.id = mv.to_location
        where mv.asset_id = a.id

        union all

        -- Maintenance
        select jsonb_build_object(
          'kind', 'maintenance',
          'title', 'Maintenance',
          'at', mr.started_at::timestamptz,
          'detail', mr.title || ' · ' || mr.state,
          'tag', null
        )
        from maintenance_records mr
        where mr.asset_id = a.id

        union all

        -- A BAST with no assignment behind it still belongs on the rail
        select jsonb_build_object(
          'kind', 'registered',
          'title', 'BAST generated',
          'at', bt.created_at,
          'detail', bt.status::text,
          'tag', bt.bast_number
        )
        from bast bt
        where bt.asset_id = a.id and bt.assignment_id is null

        union all

        -- Status changed by hand — retired, lost, broken, back in service.
        -- The reason is the whole point of the entry; without it the rail
        -- would only repeat what the status badge already says.
        select jsonb_build_object(
          'kind', case when ts.is_terminal then 'retired' else 'maintenance' end,
          'title', coalesce(fs.name || ' → ' || ts.name, 'Status set to ' || ts.name),
          'at', sc.changed_at,
          'detail', sc.reason || ' · ' ||
                    coalesce((select full_name from accounts where id = sc.changed_by), 'System'),
          'tag', null
        )
        from asset_status_changes sc
        join asset_statuses ts on ts.id = sc.to_status
        left join asset_statuses fs on fs.id = sc.from_status
        where sc.asset_id = a.id
      ) events
    ),

    'assignments', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', asg.id,
        'accountName', acc.full_name,
        'departmentName', (select name from departments where id = asg.department_id),
        'assignedDate', asg.assigned_date,
        'returnedDate', asg.returned_date,
        'state', asg.state,
        'bastNumber', (select bast_number from bast where assignment_id = asg.id limit 1)
      ) order by asg.assigned_date desc), '[]'::jsonb)
      from assignments asg join accounts acc on acc.id = asg.account_id
      where asg.asset_id = a.id
    ),

    'maintenance', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', mr.id,
        'title', mr.title,
        'detail', mr.detail,
        'state', mr.state,
        'vendorName', (select name from vendors where id = mr.vendor_id),
        'cost', mr.cost,
        'startedAt', mr.started_at,
        'completedAt', mr.completed_at,
        'underWarranty', mr.under_warranty
      ) order by mr.started_at desc), '[]'::jsonb)
      from maintenance_records mr where mr.asset_id = a.id
    ),

    'documents', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', dc.id,
        'kind', dc.kind,
        'title', dc.title,
        'filePath', dc.file_path,
        'fileSize', dc.file_size,
        'mimeType', dc.mime_type,
        'createdAt', dc.created_at
      ) order by dc.created_at desc), '[]'::jsonb)
      from documents dc where dc.asset_id = a.id
    ),

    'bast', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', bt.id,
        'bastNumber', bt.bast_number,
        'status', bt.status,
        'bastDate', bt.bast_date
      ) order by bt.bast_date desc), '[]'::jsonb)
      from bast bt where bt.asset_id = a.id
    )
  ) into result;

  return result;
end $$;

revoke all on function asset_detail(text) from anon, authenticated;
grant execute on function asset_detail(text) to authenticated;
