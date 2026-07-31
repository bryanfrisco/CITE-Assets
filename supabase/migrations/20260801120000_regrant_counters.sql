-- ============================================================================
-- CITE Assets — 0022 Give the counters back to `authenticated`
--
-- Migration 0021 revoked EXECUTE on next_asset_code(), next_bast_number() and
-- next_tag_code() from PUBLIC. That broke asset creation immediately:
--
--   permission denied for function next_asset_code
--
-- because create_asset() is SECURITY INVOKER, so the counter call runs as the
-- signed-in user, and bast.bast_number's DEFAULT is evaluated as the inserting
-- role for the same reason.
--
-- This is a correction, not a change of mind, and it is a separate migration
-- because 0021 has already been applied — working rule #1.
--
-- WHAT THE SECURITY DEFINER ON THOSE FUNCTIONS WAS ACTUALLY FOR
-- -------------------------------------------------------------
-- It protects the COUNTER TABLES, which have no grant at all: without it every
-- user would need INSERT and UPDATE on asset_code_counters and
-- bast_number_counters, and anyone with that could rewrite the sequence a
-- document is identified by. Being able to CALL the function only lets someone
-- burn a number, leaving a gap. That is untidy, not dangerous, and it is the
-- price of the tables staying closed.
--
-- The five notification generators from 0021 stay revoked. Those genuinely had
-- no caller check, and nothing in the app calls them.
-- ============================================================================

grant execute on function next_asset_code(uuid, date) to authenticated;
grant execute on function next_bast_number()          to authenticated;
grant execute on function next_tag_code(text)         to authenticated;
