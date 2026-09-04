-- ============================================================================
-- CITE Assets — 0073 A document can be addressed to more than two people
--
-- `secondary_account_id` was built for exactly one case — a handy-talkie
-- carried on opposite shifts — and it hard-codes the number two. A radio held
-- by three people had nowhere to put the third, and the printed document named
-- only the first receiver while carrying two signature boxes, which is what
-- made it look like both boxes belonged to the same person.
--
-- Holders 2..N now live in their own table. Position 1 stays in
-- `bast.account_id` and `assignments.account_id`: it is the person the document
-- is addressed to, every existing join and RLS check resolves through it, and
-- moving it would be a rewrite of the whole schema for no gain.
--
-- `secondary_account_id` is KEPT and kept in sync as position 2 — the same kind
-- of denormalisation as `assets.assigned_to`, and for the same reason: search
-- and the existing list queries read it directly. `holders_of_bast()` is the one
-- function that assembles the full ordered list, so nothing else has to know
-- the arrangement.
-- ============================================================================

create table if not exists bast_holders (
  id         uuid primary key default gen_random_uuid(),
  bast_id    uuid not null references bast(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete restrict,
  -- 1 is bast.account_id and never stored here.
  position   int  not null check (position between 2 and 4),
  created_at timestamptz not null default now(),
  unique (bast_id, position),
  unique (bast_id, account_id)
);
create index if not exists bast_holders_bast_idx on bast_holders(bast_id);

create table if not exists assignment_holders (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  account_id    uuid not null references accounts(id) on delete restrict,
  position      int  not null check (position between 2 and 4),
  created_at    timestamptz not null default now(),
  unique (assignment_id, position),
  unique (assignment_id, account_id)
);
create index if not exists assignment_holders_assignment_idx
  on assignment_holders(assignment_id);

-- ---------------------------------------------------------------------------
-- Backfill. Every pair that already exists becomes position 2, so nothing that
-- was recorded under the old shape is lost or has to be re-entered.
-- ---------------------------------------------------------------------------
insert into bast_holders (bast_id, account_id, position)
select b.id, b.secondary_account_id, 2
  from bast b
 where b.secondary_account_id is not null
on conflict do nothing;

insert into assignment_holders (assignment_id, account_id, position)
select a.id, a.secondary_account_id, 2
  from assignments a
 where a.secondary_account_id is not null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- RLS. Holders are readable wherever their document is, and written only by the
-- RPCs — the same shape as bast_items.
-- ---------------------------------------------------------------------------
alter table bast_holders       enable row level security;
alter table assignment_holders enable row level security;

create policy bast_holders_read on bast_holders for select to authenticated
  using (exists (select 1 from bast b
                  where b.id = bast_id and can_see_bast_row(b.asset_id, b.location_id)));

create policy assignment_holders_read on assignment_holders for select to authenticated
  using (exists (select 1 from assignments a
                  where a.id = assignment_id and can_see_asset(a.asset_id)));

revoke all on bast_holders       from public, anon, authenticated;
revoke all on assignment_holders from public, anon, authenticated;
grant select on bast_holders       to authenticated;
grant select on assignment_holders to authenticated;

-- ---------------------------------------------------------------------------
-- The one place that knows how holders are arranged.
--
-- Returns every holder in order, position 1 first. Everything that prints,
-- searches or counts holders goes through this, so none of them can disagree
-- about who a document is for.
-- ---------------------------------------------------------------------------
-- `position` is a reserved word for a RETURNS TABLE column, so the projection
-- calls it holder_position. The table column keeps the plain name.
create or replace function holders_of_bast(p_bast uuid)
returns table (holder_position int, account_id uuid, full_name text, nik text,
               job_title text, department_name text)
language sql stable security definer set search_path = public as $$
  select 1, acc.id, acc.full_name, acc.nik,
         coalesce(nullif(btrim(coalesce(acc.job_title, '')), ''), '-'),
         d.name
    from bast b
    join accounts acc on acc.id = b.account_id
    left join departments d on d.id = acc.department_id
   where b.id = p_bast

  union all

  select h.position, acc.id, acc.full_name, acc.nik,
         coalesce(nullif(btrim(coalesce(acc.job_title, '')), ''), '-'),
         d.name
    from bast_holders h
    join accounts acc on acc.id = h.account_id
    left join departments d on d.id = acc.department_id
   where h.bast_id = p_bast

  order by 1;
$$;

/** The signature role a holder at this position signs under. */
create or replace function holder_signature_role(p_position int)
returns text language sql immutable set search_path = public as $$
  select case p_position
    when 1 then 'receiver'
    when 2 then 'receiver_2'
    when 3 then 'receiver_3'
    when 4 then 'receiver_4'
  end;
$$;

revoke all on function holders_of_bast(uuid) from public, anon;
revoke all on function holder_signature_role(int) from public, anon;
grant execute on function holders_of_bast(uuid) to authenticated;
grant execute on function holder_signature_role(int) to authenticated;
