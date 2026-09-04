-- ============================================================================
-- CITE Assets — 0061 An audit entry says where it happened
--
-- The log has always recorded `table_name` and `record_id`, and shown neither.
-- Reading that somebody changed a status told you nothing about WHICH laptop,
-- and there was no way to get there — the rows were not even pressable. An
-- audit trail you cannot follow is a list, not a trail.
--
-- Resolving the target has to happen in SQL, because half of it is a join the
-- client cannot make: an entry against `assignments` names an assignment, and
-- what somebody wants to open is the ASSET that assignment is about. Same for
-- movements, status changes, documents, maintenance and photos. Entries
-- against bast_items or bast_signatures resolve to their document.
--
-- Two columns come back:
--   target_kind  what to open — asset · bast · account · accessory · master
--   target_ref   the identifier that screen needs (asset_code, or an id)
--   target_extra the master-data entity slug, only for `master`
--
-- A null target_kind means there is nothing to open, and the row stays flat
-- rather than pretending to be a link.
--
-- DROPPED first: a RETURNS TABLE cannot gain columns in place.
-- ============================================================================

drop function if exists audit_list(text, text, text, int, int);

create function audit_list(
  p_action text default null,
  p_table  text default null,
  p_search text default null,
  p_limit  int  default 100,
  p_offset int  default 0
)
returns table (
  id bigint, action audit_action, table_name text, record_id uuid,
  target_label text, actor_label text, actor_name text,
  device text, created_at timestamptz,
  summary text,
  target_kind text, target_ref text, target_extra text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if my_role() not in ('super_admin', 'corporate_it') then
    raise exception 'Only Corporate IT and above can read the audit log'
      using errcode = 'P0001';
  end if;

  return query
    with resolved as (
      select
        a.*,
        -- The asset an entry is ultimately about, whether it names the asset
        -- directly or something that hangs off one.
        case a.table_name
          when 'assets'               then a.record_id
          when 'assignments'          then (select x.asset_id from assignments x where x.id = a.record_id)
          when 'movements'            then (select x.asset_id from movements x where x.id = a.record_id)
          when 'asset_status_changes' then (select x.asset_id from asset_status_changes x where x.id = a.record_id)
          when 'documents'            then (select x.asset_id from documents x where x.id = a.record_id)
          when 'maintenance_records'  then (select x.asset_id from maintenance_records x where x.id = a.record_id)
          when 'asset_photos'         then (select x.asset_id from asset_photos x where x.id = a.record_id)
          when 'asset_tags'           then (select x.asset_id from asset_tags x where x.id = a.record_id)
          else null
        end as res_asset,
        -- The document, for entries about a document's parts.
        case a.table_name
          when 'bast'            then a.record_id
          when 'bast_items'      then (select x.bast_id from bast_items x where x.id = a.record_id)
          when 'bast_signatures' then (select x.bast_id from bast_signatures x where x.id = a.record_id)
          when 'bast_versions'   then (select x.bast_id from bast_versions x where x.id = a.record_id)
          else null
        end as res_bast
      from audit_log a
    )
    select
      r.id, r.action, r.table_name, r.record_id,
      r.target_label,
      r.actor_label,
      coalesce(acc.full_name, split_part(coalesce(r.actor_label, ''), ' · ', 2), 'System'),
      r.device,
      r.created_at,
      case r.table_name
        when 'assets' then coalesce(
          (select x.asset_code || ' · ' || x.name from assets x where x.id = r.record_id),
          coalesce(r.new_value, r.old_value) ->> 'asset_code',
          'Asset')
        when 'bast' then coalesce(
          (select b.bast_number from bast b where b.id = r.record_id),
          coalesce(r.new_value, r.old_value) ->> 'bast_number',
          'E-BAST')
        when 'accounts' then coalesce(
          (select acc2.full_name from accounts acc2 where acc2.id = r.record_id),
          coalesce(r.new_value, r.old_value) ->> 'full_name',
          'Account')
        when 'accessories' then coalesce(
          (select x.name from accessories x where x.id = r.record_id),
          coalesce(r.new_value, r.old_value) ->> 'name',
          'Accessory')
        when 'asset_status_changes' then coalesce(
          coalesce(r.new_value, r.old_value) ->> 'reason', 'Status changed')
        else initcap(replace(r.table_name, '_', ' '))
      end,

      -- ---- where to go -------------------------------------------------
      case
        when r.res_asset is not null
             and exists (select 1 from assets x where x.id = r.res_asset) then 'asset'
        when r.res_bast is not null
             and exists (select 1 from bast x where x.id = r.res_bast) then 'bast'
        when r.table_name = 'accounts'
             and exists (select 1 from accounts x where x.id = r.record_id) then 'account'
        when r.table_name = 'accessories'
             and exists (select 1 from accessories x where x.id = r.record_id) then 'accessory'
        when r.table_name in ('categories','brands','models','vendors','departments',
                              'locations','asset_statuses','asset_conditions','units','companies')
             and r.record_id is not null then 'master'
        else null
      end,

      case
        when r.res_asset is not null then (select x.asset_code from assets x where x.id = r.res_asset)
        when r.res_bast is not null and exists (select 1 from bast x where x.id = r.res_bast)
          then r.res_bast::text
        when r.table_name in ('accounts','accessories') then r.record_id::text
        when r.table_name in ('categories','brands','models','vendors','departments',
                              'locations','asset_statuses','asset_conditions','units','companies')
          then r.record_id::text
        else null
      end,

      -- Master data needs its entity slug as well as the id; the drill-down
      -- screen is generic over all ten.
      case r.table_name
        when 'categories'       then 'category'
        when 'brands'           then 'brand'
        when 'models'           then 'model'
        when 'vendors'          then 'vendor'
        when 'departments'      then 'department'
        when 'locations'        then 'location'
        when 'asset_statuses'   then 'status'
        when 'asset_conditions' then 'condition'
        when 'units'            then 'unit'
        when 'companies'        then 'company'
        else null
      end
    from resolved r
    left join accounts acc on acc.id = r.actor_id
    where (p_action is null or r.action = p_action::audit_action)
      and (p_table  is null or r.table_name = p_table)
      and (
        p_search is null or btrim(p_search) = ''
        or coalesce(r.actor_label, '')  ilike '%' || btrim(p_search) || '%'
        or coalesce(r.target_label, '') ilike '%' || btrim(p_search) || '%'
        or r.table_name                 ilike '%' || btrim(p_search) || '%'
      )
    order by r.created_at desc, r.id desc
    limit greatest(1, least(coalesce(p_limit, 100), 300))
    offset greatest(0, coalesce(p_offset, 0));
end $$;

revoke all on function audit_list(text, text, text, int, int) from public, anon, authenticated;
grant execute on function audit_list(text, text, text, int, int) to authenticated;
