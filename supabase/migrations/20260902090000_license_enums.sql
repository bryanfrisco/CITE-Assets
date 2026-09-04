-- ============================================================================
-- CITE Assets — 0062 Enum values for Licenses
--
-- These live alone in their own migration because Postgres refuses to USE a new
-- enum value in the same transaction that ADDS it. Every function that mentions
-- 'license_created' has to arrive in a later file than this one.
--
-- 'license_secret_viewed' is the one that matters most: reading a stored
-- password is itself an event worth recording, not a silent read.
-- ============================================================================

alter type audit_action add value if not exists 'license_created';
alter type audit_action add value if not exists 'license_updated';
alter type audit_action add value if not exists 'license_deleted';
alter type audit_action add value if not exists 'seat_assigned';
alter type audit_action add value if not exists 'seat_returned';
alter type audit_action add value if not exists 'license_secret_viewed';
