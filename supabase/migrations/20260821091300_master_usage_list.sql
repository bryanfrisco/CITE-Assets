-- ============================================================================
-- CITE Assets — 0056 Master data says WHICH, not just how many
--
-- A master data row has always printed "used by 12 assets". Twelve is the
-- answer to a question nobody asks. The question people actually have is
-- "which twelve" — and before deactivating or renaming a category, it is the
-- only question that matters.
--
-- One function for all ten entities. What a record is referenced BY differs:
--
--   category, brand, model, vendor, status, condition -> assets (+ accessories
--                                                          where they apply)
--   location    -> assets, accessories and people
--   department  -> assets and people
--   unit        -> the assets fitted to it
--   company     -> people
--
-- SECURITY INVOKER on purpose. Assets and accessories are then filtered by the
-- ordinary RLS policies, so a Site IT user opening a category sees the twelve
-- they are allowed to see rather than a count they cannot reconcile with the
-- list. Accounts are readable by everyone (migration 0002), which is why
-- people are not filtered here either.
-- ============================================================================

create or replace function master_usage_list(p_entity text, p_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare t text; result jsonb;
begin
  t := master_assert_entity(p_entity);

  select jsonb_build_object(
    'entity', p_entity,

    'assets', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id,
        'assetCode', a.asset_code,
        'name', a.name,
        'categoryName', c.name,
        'statusName', s.name,
        'locationName', l.name,
        'holderName', acc.full_name,
        'unitCode', (select code from units where id = a.unit_id)
      ) order by a.asset_code), '[]'::jsonb)
      from assets a
      join categories       c    on c.id    = a.category_id
      join asset_statuses   s    on s.id    = a.status_id
      join locations        l    on l.id    = a.location_id
      left join accounts    acc  on acc.id  = a.assigned_to
      where case t
        when 'categories'       then a.category_id  = p_id
        when 'brands'           then a.brand_id     = p_id
        when 'models'           then a.model_id     = p_id
        when 'vendors'          then a.vendor_id    = p_id
        when 'departments'      then a.department_id = p_id
        when 'locations'        then a.location_id  = p_id
        when 'asset_statuses'   then a.status_id    = p_id
        when 'asset_conditions' then a.condition_id = p_id
        when 'units'            then a.unit_id      = p_id
        else false
      end
    ),

    'accessories', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', x.id,
        'name', x.name,
        'locationName', l.name,
        'totalQty', x.total_qty,
        'availableQty', accessory_available(x.id)
      ) order by x.name), '[]'::jsonb)
      from accessories x
      join locations l on l.id = x.location_id
      where case t
        when 'categories' then x.category_id = p_id
        when 'brands'     then x.brand_id    = p_id
        when 'vendors'    then x.vendor_id   = p_id
        when 'locations'  then x.location_id = p_id
        else false
      end
    ),

    'people', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'fullName', p.full_name,
        'nik', p.nik,
        'jobTitle', p.job_title,
        'departmentName', d.name,
        'locationName', l.name,
        'canLogin', p.can_login,
        'isActive', p.is_active
      ) order by p.full_name), '[]'::jsonb)
      from accounts p
      left join departments d on d.id = p.department_id
      left join locations   l on l.id = p.location_id
      where case t
        when 'departments' then p.department_id = p_id
        when 'locations'   then p.location_id   = p_id
        when 'companies'   then p.company_id    = p_id
        else false
      end
    )
  ) into result;

  return result;
end $$;

revoke all on function master_usage_list(text, uuid) from public, anon, authenticated;
grant execute on function master_usage_list(text, uuid) to authenticated;
