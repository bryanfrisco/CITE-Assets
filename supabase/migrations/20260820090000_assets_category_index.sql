-- ============================================================================
-- CITE Assets — 0038 Index assets(category_id)
--
-- src/api/assets.ts calls the category filter "an indexed equality". It was
-- not one: migration 0001 indexes location_id, status_id, assigned_to and
-- warranty_end, plus the trigram index for search, but never category_id.
--
-- search_assets() applies p_category BEFORE the ILIKE sweep, so this index is
-- what makes "Search in Laptop…" narrow the set cheaply instead of scanning
-- every asset in scope and then discarding most of them.
--
-- Additive, and safe to apply to a live table at this size.
-- ============================================================================

create index if not exists assets_category_idx on assets(category_id);
