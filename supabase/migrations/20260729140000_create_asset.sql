-- ============================================================================
-- CITE Assets — 0008 create_asset()  (bridges Phase 2 → Phase 3)
--
-- Phase 2's acceptance criterion is that "an admin can add a category and
-- immediately use it in the Add Asset form without a release". Proving that
-- end to end needs an Add Asset form that can actually save, so the write path
-- lands here. Phase 3 extends the form itself (photo upload, edit, the full
-- Asset Detail); the RPC below is the contract it will keep using.
--
-- Working rule #2: the client never inserts into `assets` directly — the code
-- generator, the serial-number check and the audit trail all have to happen in
-- one transaction.
-- ============================================================================

create or replace function create_asset(
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
  p_assigned_to    uuid    default null,
  p_purchase_date  date    default null,
  p_purchase_price numeric default null,
  p_warranty_start date    default null,
  p_warranty_end   date    default null,
  p_specifications jsonb   default '[]'::jsonb,
  p_notes          text    default null,
  p_asset_code     text    default null
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  me       uuid;
  my_r     user_role;
  code     text;
  new_id   uuid;
  clean_sn text;
begin
  select id, role into me, my_r from accounts where auth_user_id = auth.uid() limit 1;

  -- Required fields, per README § Add Asset. The database would reject most of
  -- these anyway; checking here produces a readable message instead of a
  -- constraint name.
  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'Asset name is required' using errcode = 'P0001';
  end if;
  clean_sn := btrim(coalesce(p_serial, ''));
  if clean_sn = '' then
    raise exception 'Serial number is required' using errcode = 'P0001';
  end if;
  if p_category is null then
    raise exception 'Category is required' using errcode = 'P0001';
  end if;
  if p_location is null or p_status is null or p_condition is null then
    raise exception 'Location, status and condition are required' using errcode = 'P0001';
  end if;

  -- README § Add Asset: "Serial number must be unique — show 'Serial number
  -- already registered' inline."
  if exists (select 1 from assets a where lower(a.serial_number) = lower(clean_sn)) then
    raise exception 'Serial number already registered' using errcode = 'P0001';
  end if;

  -- README § Interactions: "only Super Admin can delete master data or edit an
  -- asset code". Everyone else gets the generated code.
  if p_asset_code is not null and btrim(p_asset_code) <> '' then
    if my_r is distinct from 'super_admin' then
      raise exception 'Only a Super Admin may set the asset code' using errcode = 'P0001';
    end if;
    code := btrim(p_asset_code);
    if exists (select 1 from assets a where a.asset_code = code) then
      raise exception 'Asset code % is already in use', code using errcode = 'P0001';
    end if;
  else
    code := next_asset_code(p_category, p_purchase_date);
  end if;

  insert into assets (
    asset_code, name, category_id, brand_id, model_id, serial_number, vendor_id,
    purchase_date, purchase_price, warranty_start, warranty_end,
    department_id, location_id, assigned_to, status_id, condition_id,
    specifications, notes, created_by
  ) values (
    code, btrim(p_name), p_category, p_brand, p_model, clean_sn, p_vendor,
    p_purchase_date, p_purchase_price, p_warranty_start, p_warranty_end,
    p_department, p_location, p_assigned_to, p_status, p_condition,
    coalesce(p_specifications, '[]'::jsonb), nullif(btrim(coalesce(p_notes, '')), ''), me
  )
  returning id into new_id;

  -- The assets_audit trigger from migration 0001 writes the audit_log row; the
  -- app never touches that table (working rule #3).

  return jsonb_build_object('id', new_id, 'assetCode', code, 'name', btrim(p_name));
end $$;

revoke all on function create_asset(
  text, uuid, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid,
  date, numeric, date, date, jsonb, text, text
) from anon, authenticated;

grant execute on function create_asset(
  text, uuid, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid,
  date, numeric, date, date, jsonb, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- Pickers for the Add Asset form. Returns only ACTIVE master data, which is
-- what makes soft delete meaningful: deactivating a category hides it from new
-- assets while every existing asset keeps its reference.
-- ---------------------------------------------------------------------------
create or replace function asset_form_options()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'code', code)
                    order by name), '[]'::jsonb) from categories where is_active),
    'brands',     (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name)
                    order by name), '[]'::jsonb) from brands where is_active),
    'models',     (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'brandId', brand_id)
                    order by name), '[]'::jsonb) from models where is_active),
    'vendors',    (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name)
                    order by name), '[]'::jsonb) from vendors where is_active),
    'departments',(select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name)
                    order by name), '[]'::jsonb) from departments where is_active),
    'locations',  (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'code', code)
                    order by name), '[]'::jsonb)
                   from locations where is_active and id in (select my_location_ids())),
    'statuses',   (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name)
                    order by sort_order), '[]'::jsonb) from asset_statuses where is_active),
    'conditions', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name)
                    order by sort_order), '[]'::jsonb) from asset_conditions where is_active)
  );
$$;

revoke all on function asset_form_options() from anon, authenticated;
grant execute on function asset_form_options() to authenticated;
