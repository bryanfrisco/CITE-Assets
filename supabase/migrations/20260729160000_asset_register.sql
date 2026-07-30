-- ============================================================================
-- CITE Assets — 0010 asset register  (Phase 3)
--
-- Additive. Provides the two reads the register needs:
--   search_assets()  — list + search + status filter + scope
--   asset_detail()   — everything the six Asset Detail tabs render
-- plus update_asset() for the Edit form.
--
-- Every function is SECURITY INVOKER, so RLS from migration 0002 still decides
-- which rows come back. The p_locations argument is the user's chosen scope —
-- a filter layered on top of RLS, never a replacement for it (DATABASE.md §10).
--
-- DEVIATION FROM DATABASE.md §11
-- ------------------------------
-- The doc declares `search_assets(...) returns setof assets`. The asset card in
-- README § Assets needs the category icon, brand, holder name, status,
-- condition and location *names*, none of which live on `assets` — returning
-- bare rows would force the client into an N+1 of lookups per card. This
-- returns the joined projection instead. The argument list is unchanged.
-- ============================================================================

create or replace function search_assets(
  p_locations uuid[],
  p_query     text default '',
  p_status    uuid default null
)
returns table (
  id             uuid,
  asset_code     text,
  name           text,
  serial_number  text,
  category_name  text,
  category_icon  text,
  brand_name     text,
  model_name     text,
  status_name    text,
  condition_name text,
  location_name  text,
  holder_name    text,
  department_name text,
  warranty_end   date
)
language sql stable security invoker set search_path = public as $$
  select
    a.id, a.asset_code, a.name, a.serial_number,
    c.name, c.icon, b.name, m.name,
    s.name, cond.name, l.name,
    acc.full_name, d.name,
    a.warranty_end
  from assets a
  join categories       c    on c.id    = a.category_id
  join asset_statuses   s    on s.id    = a.status_id
  join asset_conditions cond on cond.id = a.condition_id
  join locations        l    on l.id    = a.location_id
  left join brands      b    on b.id    = a.brand_id
  left join models      m    on m.id    = a.model_id
  left join accounts    acc  on acc.id  = a.assigned_to
  left join departments d    on d.id    = a.department_id
  where a.location_id = any (p_locations)
    and (p_status is null or a.status_id = p_status)
    -- README § Assets: "Search matches asset code, serial number, name,
    -- assigned user, department, brand, model (case-insensitive substring)."
    and (
      coalesce(btrim(p_query), '') = ''
      or a.asset_code                 ilike '%' || btrim(p_query) || '%'
      or a.serial_number              ilike '%' || btrim(p_query) || '%'
      or a.name                       ilike '%' || btrim(p_query) || '%'
      or coalesce(b.name, '')         ilike '%' || btrim(p_query) || '%'
      or coalesce(m.name, '')         ilike '%' || btrim(p_query) || '%'
      or coalesce(acc.full_name, '')  ilike '%' || btrim(p_query) || '%'
      or coalesce(d.name, '')         ilike '%' || btrim(p_query) || '%'
    )
  order by a.asset_code;
$$;

-- Total in scope, so the count line can read "4 of 7 in scope · HO + Site".
create or replace function count_assets_in_scope(p_locations uuid[])
returns bigint language sql stable security invoker set search_path = public as $$
  select count(*) from assets where location_id = any (p_locations);
$$;

-- ---------------------------------------------------------------------------
-- asset_detail() — one round trip for all six tabs.
--
-- The timeline is merged from assignments + movements + maintenance + bast
-- (IMPLEMENTATION_PLAN.md § Phase 3), plus the purchase and registration
-- events the acceptance criterion names. Dot colours are resolved on the
-- client from the `kind` field, using the README § Asset Detail table.
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

-- ---------------------------------------------------------------------------
-- update_asset() — the Edit half of README § Add Asset.
--
-- Serial uniqueness and the Super-Admin-only asset code rule are enforced here
-- exactly as they are in create_asset(), so the two paths cannot drift.
-- ---------------------------------------------------------------------------
create or replace function update_asset(
  p_id             uuid,
  p_name           text,
  p_category       uuid,
  p_serial         text,
  p_location       uuid,
  p_status         uuid,
  p_condition      uuid,
  p_brand          uuid    default null,
  p_model          uuid    default null,
  p_vendor         uuid    default null,
  p_department     uuid    default null,
  p_purchase_date  date    default null,
  p_purchase_price numeric default null,
  p_warranty_start date    default null,
  p_warranty_end   date    default null,
  p_specifications jsonb   default '[]'::jsonb,
  p_notes          text    default null,
  p_asset_code     text    default null
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare my_r user_role; current_code text; clean_sn text; final_code text;
begin
  select role into my_r from accounts where auth_user_id = auth.uid() limit 1;
  select asset_code into current_code from assets where id = p_id;
  if current_code is null then
    raise exception 'Asset not found' using errcode = 'P0001';
  end if;

  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'Asset name is required' using errcode = 'P0001';
  end if;
  clean_sn := btrim(coalesce(p_serial, ''));
  if clean_sn = '' then
    raise exception 'Serial number is required' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from assets a where lower(a.serial_number) = lower(clean_sn) and a.id <> p_id
  ) then
    raise exception 'Serial number already registered' using errcode = 'P0001';
  end if;

  final_code := current_code;
  if p_asset_code is not null and btrim(p_asset_code) <> '' and btrim(p_asset_code) <> current_code then
    if my_r is distinct from 'super_admin' then
      raise exception 'Only a Super Admin may edit the asset code' using errcode = 'P0001';
    end if;
    final_code := btrim(p_asset_code);
    if exists (select 1 from assets a where a.asset_code = final_code and a.id <> p_id) then
      raise exception 'Asset code % is already in use', final_code using errcode = 'P0001';
    end if;
  end if;

  update assets set
    asset_code     = final_code,
    name           = btrim(p_name),
    category_id    = p_category,
    brand_id       = p_brand,
    model_id       = p_model,
    serial_number  = clean_sn,
    vendor_id      = p_vendor,
    purchase_date  = p_purchase_date,
    purchase_price = p_purchase_price,
    warranty_start = p_warranty_start,
    warranty_end   = p_warranty_end,
    department_id  = p_department,
    location_id    = p_location,
    status_id      = p_status,
    condition_id   = p_condition,
    specifications = coalesce(p_specifications, '[]'::jsonb),
    notes          = nullif(btrim(coalesce(p_notes, '')), '')
  where id = p_id;

  return jsonb_build_object('id', p_id, 'assetCode', final_code);
end $$;

revoke all on function search_assets(uuid[], text, uuid) from anon, authenticated;
revoke all on function count_assets_in_scope(uuid[])     from anon, authenticated;
revoke all on function asset_detail(text)                from anon, authenticated;
revoke all on function update_asset(
  uuid, text, uuid, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid,
  date, numeric, date, date, jsonb, text, text
) from anon, authenticated;

grant execute on function search_assets(uuid[], text, uuid) to authenticated;
grant execute on function count_assets_in_scope(uuid[])     to authenticated;
grant execute on function asset_detail(text)                to authenticated;
grant execute on function update_asset(
  uuid, text, uuid, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid,
  date, numeric, date, date, jsonb, text, text
) to authenticated;
