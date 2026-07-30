-- ============================================================================
-- CITE Assets — 0006 table privileges  (Phase 1)
--
-- Additive: grants only, no schema change.
--
-- WHY THIS IS NEEDED
-- ------------------
-- RLS decides WHICH ROWS a role may touch. It never grants access to the table
-- in the first place — that is a plain SQL GRANT. Migrations 0001–0002 created
-- the tables and the policies but issued no grants, so every query from a
-- signed-in client failed with
--
--   ERROR: permission denied for table assets
--
-- before RLS was ever consulted. Both layers are required.
--
-- SHAPE OF THE GRANTS
-- -------------------
-- * `anon` gets nothing. An unauthenticated client can read no business data.
-- * `authenticated` gets table access; RLS then narrows it to the rows the
--   user's role and location allow.
-- * The append-only tables get SELECT + INSERT and never UPDATE/DELETE, which
--   matches the forbid_mutation() triggers and the REVOKE in migration 0001.
--   Working rule #3 is enforced three ways: no grant, no policy, and a trigger.
-- * The counter tables (asset_code_counters, bast_number_counters) get nothing:
--   they are only ever touched by next_asset_code() / next_bast_number(),
--   which run as SECURITY DEFINER.
-- ============================================================================

grant usage on schema public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Master data — readable by any signed-in user; writes are narrowed by RLS to
-- super_admin / corporate_it, and deletes to super_admin.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on
  locations, departments, categories, brands, models, vendors,
  asset_statuses, asset_conditions
to authenticated;

-- ---------------------------------------------------------------------------
-- People & scope
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on accounts to authenticated;
grant select, insert, update, delete on account_scope_preferences to authenticated;

-- ---------------------------------------------------------------------------
-- Assets and the records hanging off them
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on assets to authenticated;
grant select, insert, update on assignments to authenticated;
grant select, insert, update on bast to authenticated;
grant select, insert, update on maintenance_records to authenticated;
grant select, insert, delete on documents to authenticated;

-- ---------------------------------------------------------------------------
-- Append-only: SELECT + INSERT only. No UPDATE, no DELETE, ever.
-- ---------------------------------------------------------------------------
grant select, insert on movements to authenticated;
grant select, insert on bast_versions to authenticated;
grant select, insert on import_batches to authenticated;

-- ---------------------------------------------------------------------------
-- Notifications — own inbox: read and mark-as-read only.
-- ---------------------------------------------------------------------------
grant select, update on notifications to authenticated;

-- ---------------------------------------------------------------------------
-- Audit log — read-only for everyone. Rows arrive exclusively through the
-- SECURITY DEFINER audit_row() trigger, which runs as the function owner and
-- therefore needs no grant here.
-- ---------------------------------------------------------------------------
grant select on audit_log to authenticated;

-- audit_log.id is a bigserial; the trigger owner writes it, so `authenticated`
-- deliberately gets no sequence usage.

-- ---------------------------------------------------------------------------
-- Re-assert the append-only revokes from migration 0001. The grants above are
-- deliberately narrow, but this makes the intent impossible to lose in a later
-- blanket grant.
-- ---------------------------------------------------------------------------
revoke update, delete on audit_log, movements, bast_versions from anon, authenticated;
