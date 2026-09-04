-- ============================================================================
-- CITE Assets — 0081 A notification kind for a licence running out
--
-- Alone in its own file: Postgres refuses to USE a new enum value in the same
-- transaction that adds it, so the function that raises these has to arrive in
-- a later migration.
-- ============================================================================

alter type notification_kind add value if not exists 'license_expiring';
