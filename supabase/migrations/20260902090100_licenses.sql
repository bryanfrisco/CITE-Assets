-- ============================================================================
-- CITE Assets — 0063 Licenses and their seats
--
-- The third module after Assets and Accessories. An asset is held by one
-- person; a licence has many SEATS, and each seat is handed to somebody.
--
-- Three things about this shape came out of reading the real spreadsheet
-- (SOFTWARE LICENSING sta.xlsx — 15 licences, 71 seats) rather than being
-- decided in advance:
--
--   1. `license_number` is nullable. Seven of the fifteen genuinely have none,
--      and the ones that do are not always numbers — 'Using Email' and
--      'Subscription ID : 5521692074' both appear. Stored as text, unvalidated.
--
--   2. The manager account belongs to the SEAT, not the licence. Seven licences
--      carry a different account on every seat: 3DMine has three across five
--      seats, AutoCAD four across four. Autodesk and Esri issue one named
--      account per user under a single subscription. Hanging the account off
--      the licence would keep one of 3DMine's three and silently lose two.
--
--   3. Seat status is NOT stored. The sheet's USED/STANDBY column is entirely
--      derivable — no row is USED without a user — so it is computed as
--      `account_id is null`. Same reasoning as accessories, where `available`
--      is never stored: a number kept in two places drifts.
--
-- Scope: licences are held in common. Software is bought centrally and is not
-- attached to a site, so unlike assets and accessories there is no location_id
-- and no my_location_ids() filter. Everyone signed in can read; only RPCs
-- write.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Master data: licence categories. Deliberately NOT the `categories` table —
-- that one holds CCTV, laptop, printer. MINING and OFFICE are a different axis.
-- ---------------------------------------------------------------------------
create table if not exists license_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into license_categories (name) values
  ('MINING'), ('OFFICE'), ('MULTIMEDIA'), ('SUPPORT')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- The licence itself.
-- ---------------------------------------------------------------------------
create table if not exists licenses (
  id             uuid primary key default gen_random_uuid(),
  software       text not null,
  license_number text,
  category_id    uuid not null references license_categories(id) on delete restrict,
  vendor_id      uuid references vendors(id) on delete restrict,
  purchase_year  int check (purchase_year between 1990 and 2100),
  expiry_date    date,
  notes          text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references accounts(id)
);

-- A table-level UNIQUE cannot hold an expression, so identity is an index.
-- coalesce() is what makes the seven number-less licences distinguishable by
-- name alone instead of colliding on NULL.
create unique index if not exists licenses_identity_idx
  on licenses (lower(software), coalesce(license_number, ''));
create index if not exists licenses_category_idx on licenses(category_id);
create index if not exists licenses_expiry_idx on licenses(expiry_date)
  where expiry_date is not null;

-- ---------------------------------------------------------------------------
-- Seats. One row per seat, whether anybody is sitting in it or not.
-- ---------------------------------------------------------------------------
create table if not exists license_seats (
  id            uuid primary key default gen_random_uuid(),
  license_id    uuid not null references licenses(id) on delete cascade,
  account_id    uuid references accounts(id) on delete restrict,
  seat_account  text,
  seat_secret   text,
  assigned_date date,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references accounts(id),
  -- An empty seat cannot carry a handover date.
  check (account_id is not null or assigned_date is null)
);

-- `cascade` here, where every other table in this schema uses `restrict`. A
-- seat has no meaning without its licence; an orphaned seat is a row nobody can
-- interpret. The licence itself is still protected — delete_license() refuses
-- while seats are occupied.
create index if not exists license_seats_license_idx on license_seats(license_id);
create index if not exists license_seats_account_idx on license_seats(account_id)
  where account_id is not null;

-- ---------------------------------------------------------------------------
-- RLS. Read in common, write only through RPCs.
-- ---------------------------------------------------------------------------
alter table license_categories enable row level security;
alter table licenses           enable row level security;
alter table license_seats      enable row level security;

create policy license_categories_read on license_categories for select
  to authenticated using (true);
create policy licenses_read on licenses for select
  to authenticated using (true);
create policy license_seats_read on license_seats for select
  to authenticated using (true);

-- No insert/update/delete policy exists on purpose. Even with a grant, a write
-- would find no permissive policy and be refused; the grants below withhold it
-- as well, so the lock holds on both layers independently.
revoke all on license_categories from public, anon, authenticated;
revoke all on licenses           from public, anon, authenticated;
revoke all on license_seats      from public, anon, authenticated;

grant select on license_categories to authenticated;
grant select on licenses           to authenticated;
grant select on license_seats      to authenticated;

-- Master data screens create categories through master_create(), which is
-- security definer, so no write grant is needed here either.

-- ---------------------------------------------------------------------------
-- Audit. Not optional for anything that can be handed to a person.
-- ---------------------------------------------------------------------------
create trigger licenses_audit after insert or update on licenses
  for each row execute function audit_row('license_created', 'license_updated');
create trigger license_seats_audit after insert or update on license_seats
  for each row execute function audit_row('seat_assigned', 'seat_returned');
