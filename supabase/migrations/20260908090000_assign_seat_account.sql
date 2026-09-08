-- ---------------------------------------------------------------------------
-- The account that holds a licence seat, set when the seat is handed out.
--
-- `license_seats.seat_account` has existed since the licences went in, and the
-- CSV import fills it (`akun_manager` / `account`). But `assign_seat()` never
-- accepted it, so a licence recorded through the app rather than through an
-- import showed a dash there forever — and for the licences that have no
-- licence number at all, the account IS the only identity the seat has.
--
-- Why the account is separate from `accounts.email`:
--
--   `accounts.email`  the person's work address, one per person, and also what
--                     they sign in with.
--   `seat_account`    the account this seat runs under. Usually the same, but
--                     not always — a shared team account belongs to nobody,
--                     and one person can hold two seats under two addresses.
--
-- The screen fills it from the person's email so the ordinary case is one tap.
--
-- `return_seat()` deliberately does NOT clear it. The account outlives the
-- person holding it: an empty seat still has an identity, and clearing it on
-- every return would throw away what the import recorded.
--
-- The function is DROPPED before it is recreated. Adding a parameter to a live
-- function leaves the old signature in place beside the new one, and PostgREST
-- then has two candidates to choose between.
-- ---------------------------------------------------------------------------

drop function if exists assign_seat(uuid, uuid, date);

create function assign_seat(
  p_seat uuid,
  p_account uuid,
  p_date date default current_date,
  p_seat_account text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_holder text;
begin
  if not can_write_licenses() then
    raise exception 'Only Corporate IT and above can hand out a seat'
      using errcode = 'P0001';
  end if;

  select a.full_name into v_holder
    from license_seats s left join accounts a on a.id = s.account_id
   where s.id = p_seat and s.account_id is not null;

  if v_holder is not null then
    raise exception 'That seat is already with %', v_holder using errcode = 'P0001';
  end if;

  update license_seats
     set account_id    = p_account,
         assigned_date = coalesce(p_date, current_date),
         -- null means "not my business"; an empty string means "clear it".
         -- That distinction is what lets a seat identified only by a licence
         -- code be handed out without inventing an address for it.
         seat_account  = case
                           when p_seat_account is null then seat_account
                           else nullif(btrim(p_seat_account), '')
                         end,
         updated_at    = now()
   where id = p_seat;

  if not found then
    raise exception 'That seat is gone' using errcode = 'P0001';
  end if;
end $$;

revoke all on function assign_seat(uuid, uuid, date, text) from public, anon, authenticated;
grant execute on function assign_seat(uuid, uuid, date, text) to authenticated;
