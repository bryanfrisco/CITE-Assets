-- ============================================================================
-- CITE Assets — 0039 Enum values for accessories, accessory BAST, and the
--                    second holder
--
-- WHY THIS FILE HOLDS NOTHING BUT ENUM VALUES
-- -------------------------------------------
-- Postgres refuses to USE a new enum value in the same transaction that added
-- it. Supabase runs each migration in a transaction, so a file that both adds
-- 'accessory' to bast_kind and creates a function comparing against it fails
-- on a fresh `supabase db reset` — while appearing to work on a database where
-- the value already exists. That is the worst kind of failure: it only shows
-- up for the next person.
--
-- So every value lands here, one migration ahead of the code that reads it.
--
-- `if not exists` keeps a re-run harmless. Enum values cannot be removed, so
-- there is no down path — which is also why the list is deliberately short.
-- ============================================================================

-- Accessories are a second kind of thing that can be created, handed out and
-- taken back, and the audit log has to be able to say which happened.
alter type audit_action add value if not exists 'accessory_created';
alter type audit_action add value if not exists 'accessory_updated';
alter type audit_action add value if not exists 'accessory_assigned';
alter type audit_action add value if not exists 'accessory_returned';

-- A third letter beside 'handover' and 'return': perlengkapan handed over on
-- its own, with no asset on the sheet.
alter type bast_kind add value if not exists 'accessory';

-- A third signature block. 'receiver_2' is the other shift holder of a shared
-- radio; the caption it prints is decided in signatureCaption(), not here.
alter type bast_signature_role add value if not exists 'receiver_2';
