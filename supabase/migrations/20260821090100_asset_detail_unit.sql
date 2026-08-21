-- ============================================================================
-- CITE Assets — 0044 asset_detail() knows which unit an asset is fitted to
--
-- Migration 0043 can fit a radio into DT-042, but the detail screen had no way
-- to say so: asset_detail() predates units entirely, and an asset showing
-- "Installed" with nothing naming the vehicle is worse than not showing it.
--
-- Replaced in full, signature unchanged, so this replaces rather than
-- overloads (the trap migration 0029 exists to clean up after). The only
-- addition is unitId / unitCode / unitName; the timeline below is untouched.
-- ============================================================================

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
      'unitId', a.unit_id,
      'unitCode', (select code from units where id = a.unit_id),
      'unitName', (select name from units where id = a.unit_id),
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
