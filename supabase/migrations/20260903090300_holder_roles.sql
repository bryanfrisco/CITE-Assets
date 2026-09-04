-- ============================================================================
-- CITE Assets — 0072 Signature roles for a third and fourth holder
--
-- Alone in its own file: Postgres refuses to USE a new enum value in the same
-- transaction that adds it, so every function that mentions 'receiver_3' has to
-- arrive later than this.
--
-- Four receivers, not more, and the reason is the enum rather than the paper —
-- the document now runs to a second page when it needs to, so the signature
-- column is no longer the limit. Each position needs a role value of its own,
-- and four is already past any real case; a fifth is one more migration.
-- ============================================================================

alter type bast_signature_role add value if not exists 'receiver_3';
alter type bast_signature_role add value if not exists 'receiver_4';
