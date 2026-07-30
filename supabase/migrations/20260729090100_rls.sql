-- ============================================================================
-- CITE Assets — 0002 Row Level Security
-- Source: DATABASE.md §10.
--
-- The client-side scope selector is a FILTER, not a security boundary. RLS is
-- what actually restricts Site IT and Viewer; the app intersects the user's
-- chosen scope with the locations RLS allows.
--
-- Phase 1 (auth & roles) verifies these policies with a real Site IT token.
-- ============================================================================

alter table assets              enable row level security;
alter table assignments         enable row level security;
alter table movements           enable row level security;
alter table bast                enable row level security;
alter table bast_versions       enable row level security;
alter table documents           enable row level security;
alter table maintenance_records enable row level security;
alter table notifications       enable row level security;
alter table accounts            enable row level security;
alter table audit_log           enable row level security;

alter table locations         enable row level security;
alter table departments       enable row level security;
alter table categories        enable row level security;
alter table brands            enable row level security;
alter table models            enable row level security;
alter table vendors           enable row level security;
alter table asset_statuses    enable row level security;
alter table asset_conditions  enable row level security;
alter table account_scope_preferences enable row level security;
alter table import_batches    enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- locations the current user may see
create or replace function my_location_ids() returns setof uuid
language sql stable security definer as $$
  select case
    when (select role from v_me) in ('super_admin','corporate_it')
      then (select id from locations)                       -- all locations
    else (select location_id from v_me)                     -- site_it / viewer: own location only
  end;
$$;

create or replace function my_role() returns user_role
language sql stable security definer as $$
  select role from v_me limit 1;
$$;

create or replace function my_account_id() returns uuid
language sql stable security definer as $$
  select id from v_me limit 1;
$$;

-- an asset is visible when its location is in my scope; used by every child table
create or replace function can_see_asset(p_asset uuid) returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from assets a
    where a.id = p_asset and a.location_id in (select my_location_ids())
  );
$$;

create or replace function can_write_assets() returns boolean
language sql stable security definer as $$
  select my_role() in ('super_admin','corporate_it','site_it');
$$;

-- ---------------------------------------------------------------------------
-- Assets
-- ---------------------------------------------------------------------------
create policy assets_read on assets for select using (location_id in (select my_location_ids()));

create policy assets_write on assets for insert with check (
  my_role() in ('super_admin','corporate_it','site_it')
  and location_id in (select my_location_ids()));

create policy assets_update on assets for update using (
  my_role() in ('super_admin','corporate_it','site_it')
  and location_id in (select my_location_ids()));

create policy assets_delete on assets for delete using (my_role() = 'super_admin');

-- ---------------------------------------------------------------------------
-- Assignments — scoped through the asset
-- ---------------------------------------------------------------------------
create policy assignments_read on assignments for select using (can_see_asset(asset_id));
create policy assignments_write on assignments for insert with check (
  can_write_assets() and can_see_asset(asset_id));
create policy assignments_update on assignments for update using (
  can_write_assets() and can_see_asset(asset_id));

-- ---------------------------------------------------------------------------
-- Movements — append-only. Read + insert only; no update/delete policy exists,
-- and the forbid_mutation() triggers + REVOKE in 0001 back that up.
-- ---------------------------------------------------------------------------
create policy movements_read on movements for select using (can_see_asset(asset_id));
create policy movements_write on movements for insert with check (
  can_write_assets() and can_see_asset(asset_id));

-- ---------------------------------------------------------------------------
-- BAST
-- ---------------------------------------------------------------------------
create policy bast_read on bast for select using (can_see_asset(asset_id));
create policy bast_write on bast for insert with check (
  can_write_assets() and can_see_asset(asset_id));
create policy bast_update on bast for update using (
  can_write_assets() and can_see_asset(asset_id));

-- bast_versions — append-only, same reasoning as movements
create policy bast_versions_read on bast_versions for select using (
  exists (select 1 from bast b where b.id = bast_id and can_see_asset(b.asset_id)));
create policy bast_versions_write on bast_versions for insert with check (
  can_write_assets()
  and exists (select 1 from bast b where b.id = bast_id and can_see_asset(b.asset_id)));

-- ---------------------------------------------------------------------------
-- Documents & maintenance
-- ---------------------------------------------------------------------------
create policy documents_read on documents for select using (can_see_asset(asset_id));
create policy documents_write on documents for insert with check (
  can_write_assets() and can_see_asset(asset_id));
create policy documents_delete on documents for delete using (
  my_role() in ('super_admin','corporate_it') and can_see_asset(asset_id));

create policy maintenance_read on maintenance_records for select using (can_see_asset(asset_id));
create policy maintenance_write on maintenance_records for insert with check (
  can_write_assets() and can_see_asset(asset_id));
create policy maintenance_update on maintenance_records for update using (
  can_write_assets() and can_see_asset(asset_id));

-- ---------------------------------------------------------------------------
-- Audit log — read-only, admins only. No insert/update/delete policy: rows
-- arrive exclusively through the security-definer audit_row() trigger.
-- ---------------------------------------------------------------------------
create policy audit_read on audit_log for select using (
  my_role() in ('super_admin','corporate_it'));

-- ---------------------------------------------------------------------------
-- Notifications — own inbox only
-- ---------------------------------------------------------------------------
create policy notif_own on notifications for select using (account_id = my_account_id());
create policy notif_mark_read on notifications for update using (account_id = my_account_id());

-- ---------------------------------------------------------------------------
-- Accounts — everyone can read (assignment targets); only Super Admin manages
-- ---------------------------------------------------------------------------
create policy accounts_read on accounts for select using (true);
create policy accounts_write on accounts for all using (my_role() = 'super_admin');

-- own scope preference rows
create policy scope_pref_own on account_scope_preferences for all
  using (account_id = my_account_id())
  with check (account_id = my_account_id());

-- ---------------------------------------------------------------------------
-- Master data — readable by every authenticated user, written by admins,
-- deleted by Super Admin only.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'locations','departments','categories','brands','models','vendors',
    'asset_statuses','asset_conditions'
  ] loop
    execute format(
      'create policy %I on %I for select using (auth.uid() is not null)', t || '_read', t);
    execute format(
      'create policy %I on %I for insert with check (my_role() in (''super_admin'',''corporate_it''))',
      t || '_insert', t);
    execute format(
      'create policy %I on %I for update using (my_role() in (''super_admin'',''corporate_it''))',
      t || '_update', t);
    execute format(
      'create policy %I on %I for delete using (my_role() = ''super_admin'')', t || '_delete', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Import batches — IT roles write, admins read
-- ---------------------------------------------------------------------------
create policy imports_read on import_batches for select using (
  my_role() in ('super_admin','corporate_it'));
create policy imports_write on import_batches for insert with check (can_write_assets());
