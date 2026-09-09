-- ============================================================================
-- CITE Assets — 0089 Giving a seat back takes the account with it
--
-- REVERSES A DECISION MADE IN 0086, ON THE EVIDENCE
-- -------------------------------------------------
-- Migration 0086 deliberately left `seat_account` alone when a seat was
-- returned, reasoning that for a licence with no number the account IS the
-- seat's identity and should outlive whoever is holding it.
--
-- The real data does not support that. Almost every value in the column is a
-- PERSON's work address, and it matches the person holding the seat:
--
--   ferdy.ramadhony@aspire.id   -> Ferdy Yola Ramadhony
--   daryanto@aspire.id          -> Daryanto
--   hasbi.sutandiono@aspire.id  -> Hasbi As-Siddiqi Sutandiono
--
-- The account belongs to the person, not to the chair. Keeping it on return
-- left six seats reading "Nobody yet" underneath somebody's email address —
-- which is not merely untidy. A licence reset sent to the address shown on an
-- empty seat goes to somebody who no longer has it.
--
-- It also broke the handover itself. The assign screen treated a seat that
-- already had an account as deliberately set, and so refused to fill in the
-- new holder's email — the stale address blocked the very thing that would
-- have corrected it. Both faults came from this one decision.
--
-- WHAT THIS COSTS, STATED PLAINLY
-- -------------------------------
-- A few seats use the column for something else: 3DMine stores per-seat
-- licence keys there ("3DMine License - SPR 1", "D0D901067") rather than an
-- account. Returning one of those seats now clears its key, and it has to be
-- typed back on the next handover. That is the price of a rule somebody can
-- predict, and the assign screen keeps the field editable so it can be.
--
-- Existing rows are NOT rewritten. Two of the six are those 3DMine keys and
-- clearing them would destroy real information; the four stale addresses
-- correct themselves the moment their seat is handed to somebody, because the
-- screen now fills the field from the person who is being given it.
-- ============================================================================

create or replace function return_seat(p_seat uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_write_licenses() then
    raise exception 'Only Corporate IT and above can take a seat back'
      using errcode = 'P0001';
  end if;

  update license_seats
     set account_id = null,
         assigned_date = null,
         -- Goes with the person. An empty chair showing somebody's address is
         -- worse than an empty chair showing nothing.
         seat_account = null,
         updated_at = now()
   where id = p_seat;

  if not found then
    raise exception 'That seat is gone' using errcode = 'P0001';
  end if;
end $$;

revoke all on function return_seat(uuid) from public, anon, authenticated;
grant execute on function return_seat(uuid) to authenticated;
