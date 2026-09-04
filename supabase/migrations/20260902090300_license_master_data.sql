-- ============================================================================
-- CITE Assets — 0065 Licence categories join Master data
--
-- The eleventh chip. Three of the four master functions are replaced with the
-- SAME signature — never a new parameter, or PostgREST ends up with two
-- overloads it cannot choose between (the lesson of migration 0029).
--
-- master_list() and master_create() are NOT touched: both already fall through
-- to a generic branch for plain `(id, name, is_active)` tables, and
-- license_categories is exactly that shape. master_assert_entity() validates
-- through master_table(), so extending that one teaches it the new entity too.
-- ============================================================================

create or replace function master_table(p_entity text)
returns text language sql immutable as $$
  select case lower(p_entity)
    when 'category'         then 'categories'
    when 'brand'            then 'brands'
    when 'model'            then 'models'
    when 'vendor'           then 'vendors'
    when 'department'       then 'departments'
    when 'location'         then 'locations'
    when 'status'           then 'asset_statuses'
    when 'condition'        then 'asset_conditions'
    when 'unit'             then 'units'
    when 'company'          then 'companies'
    when 'license_category' then 'license_categories'
  end;
$$;

-- initcap() would render this one as "License_Category". Every other entity is
-- a single word and still gets the generic treatment.
create or replace function master_label(p_entity text)
returns text language sql immutable as $$
  select case lower(p_entity)
    when 'license_category' then 'License category'
    else initcap(lower(p_entity))
  end;
$$;

create or replace function master_usage(p_entity text, p_id uuid)
returns table (asset_count bigint, total_count bigint)
language plpgsql stable security definer set search_path = public as $$
declare t text; a bigint := 0; o bigint := 0;
begin
  t := master_assert_entity(p_entity);

  case t
    when 'categories' then
      select count(*) into a from assets where category_id = p_id;
      select count(*) into o from models where category_id = p_id;
    when 'brands' then
      select count(*) into a from assets where brand_id = p_id;
      select count(*) into o from models where brand_id = p_id;
    when 'models' then
      select count(*) into a from assets where model_id = p_id;
    when 'vendors' then
      select count(*) into a from assets where vendor_id = p_id;
      select count(*) into o from maintenance_records where vendor_id = p_id;
      -- Licences buy from the same vendors as assets do, so a vendor that only
      -- ever sold software still reads as "in use" and cannot be deleted.
      o := o + (select count(*) from licenses where vendor_id = p_id);
    when 'departments' then
      select count(*) into a from assets where department_id = p_id;
      select count(*) into o from accounts where department_id = p_id;
      o := o + (select count(*) from assignments where department_id = p_id)
             + (select count(*) from bast where department_id = p_id);
    when 'locations' then
      select count(*) into a from assets where location_id = p_id;
      select count(*) into o from accounts where location_id = p_id;
      o := o + (select count(*) from assignments where location_id = p_id)
             + (select count(*) from bast where location_id = p_id)
             + (select count(*) from movements where from_location = p_id or to_location = p_id)
             + (select count(*) from account_scope_preferences where location_id = p_id);
    when 'asset_statuses' then
      select count(*) into a from assets where status_id = p_id;
    when 'asset_conditions' then
      select count(*) into a from assets where condition_id = p_id;
    when 'units' then
      select count(*) into a from assets where unit_id = p_id;
    when 'companies' then
      -- No asset points at a company; people do. asset_count stays 0 and the
      -- delete guard runs off total_count, which is what actually protects it.
      select count(*) into o from accounts where company_id = p_id;
    when 'license_categories' then
      -- Same shape as companies: no asset points here, licences do.
      select count(*) into o from licenses where category_id = p_id;
  end case;

  asset_count := a;
  total_count := a + o;
  return next;
end $$;
