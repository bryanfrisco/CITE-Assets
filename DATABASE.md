# Database Schema — CITE Assets

Target: **PostgreSQL 15+ / Supabase**. All identifiers are `snake_case`; every table has
`created_at`, `updated_at`, and (where a person acted) `created_by`.

Design rules baked into this schema:

1. **Master data is data, not code.** Category, Brand, Model, Vendor, Department, Location, Status and
   Condition are all tables — admins add records without a release.
2. **Accounts ≠ auth users.** An account is a person who can hold assets. `can_login = false` means
   the person exists only as an assignment target (no Supabase Auth user).
3. **Movement history and the audit log are append-only.** Enforced with triggers + `REVOKE`, not
   just UI.
4. **BAST numbering is server-side** via a yearly sequence, so numbers can never collide.
5. **Scope** = a set of locations per user, stored server-side so the app opens with the same scope on
   every device.

---

## 1. Extensions & enums

```sql
create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "pg_trgm";       -- fast ILIKE search

create type user_role       as enum ('super_admin','corporate_it','site_it','viewer');
create type location_kind   as enum ('head_office','site');
create type bast_status     as enum ('draft','awaiting_signature','signed','void');
create type bast_file_kind  as enum ('generated','signed');
create type assignment_state as enum ('active','returned');
create type maintenance_state as enum ('open','in_progress','completed','cancelled');
create type audit_action    as enum (
  'asset_created','asset_updated','status_changed','assignment_created','assignment_returned',
  'movement_recorded','bast_generated','bast_signed','maintenance_updated','document_uploaded',
  'master_created','master_updated','master_deleted','account_created','account_updated','import_completed'
);
create type document_kind   as enum ('invoice','purchase_order','warranty_card','manual','photo','signed_bast','other');
create type notification_kind as enum (
  'warranty_expiring','asset_returned','new_assignment','new_bast','maintenance_reminder','import_completed');
```

## 2. Master data

```sql
create table locations (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,               -- 'HO', 'SITE'
  name         text not null,                      -- 'Head Office', 'Site'
  kind         location_kind not null,
  city         text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,                       -- Laptop, Desktop, Monitor…
  code text not null unique,                       -- LPT, DSK, MON, PRN, SRV, NET, ACC
  icon text,                                       -- lucide icon name
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table models (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete restrict,
  category_id uuid references categories(id) on delete set null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, name)
);

create table vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  contact_person text,
  phone text,
  email text,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table asset_statuses (                      -- Available, Assigned, Maintenance, Broken, Lost, Retired
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null,                             -- badge hex, see README token table
  is_terminal boolean not null default false,      -- Retired / Lost
  sort_order int not null default 0,
  is_active boolean not null default true
);

create table asset_conditions (                    -- Good, Fair, Poor
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null,
  sort_order int not null default 0,
  is_active boolean not null default true
);
```

> **Deleting master data:** all references use `on delete restrict`, so a delete fails while the
> record is in use. Catch `23503` in the API and return
> `"Cannot delete <name> — still used by n assets"`. Prefer `is_active = false` (soft delete) in the UI.

## 3. Accounts (people) & auth

```sql
create table accounts (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique references auth.users(id) on delete set null,  -- null when can_login = false
  full_name     text not null,
  nik           text unique,                       -- employee number, e.g. '20481'
  email         text unique,
  phone         text,
  department_id uuid references departments(id) on delete set null,
  location_id   uuid references locations(id) on delete set null,
  can_login     boolean not null default false,
  role          user_role,                         -- required when can_login
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references accounts(id),
  constraint role_required_when_login check (not can_login or role is not null)
);

-- default scope per account (multi-select location scope)
create table account_scope_preferences (
  account_id  uuid not null references accounts(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  primary key (account_id, location_id)
);

-- convenience view used by RLS
create or replace view v_me as
  select a.* from accounts a where a.auth_user_id = auth.uid();
```

## 4. Assets

```sql
create table assets (
  id              uuid primary key default gen_random_uuid(),
  asset_code      text not null unique,            -- 'LPT045-24-118'  (see generator below)
  name            text not null,
  category_id     uuid not null references categories(id) on delete restrict,
  brand_id        uuid references brands(id) on delete restrict,
  model_id        uuid references models(id) on delete restrict,
  serial_number   text not null unique,
  vendor_id       uuid references vendors(id) on delete restrict,
  purchase_date   date,
  purchase_price  numeric(16,2),                   -- IDR, no decimals in UI
  warranty_start  date,
  warranty_end    date,
  department_id   uuid references departments(id) on delete set null,
  location_id     uuid not null references locations(id) on delete restrict,
  assigned_to     uuid references accounts(id) on delete set null,
  status_id       uuid not null references asset_statuses(id) on delete restrict,
  condition_id    uuid not null references asset_conditions(id) on delete restrict,
  specifications  jsonb not null default '[]',     -- [{"key":"Processor","value":"Intel Core i7-1355U"}]
  notes           text,
  photo_path      text,                            -- storage: asset-photos/<asset_id>/<uuid>.jpg
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references accounts(id),
  check (warranty_end is null or warranty_start is null or warranty_end >= warranty_start)
);

create index assets_location_idx  on assets(location_id);
create index assets_status_idx    on assets(status_id);
create index assets_assigned_idx  on assets(assigned_to);
create index assets_warranty_idx  on assets(warranty_end);
-- global search: code, serial, name, brand/model text, holder name, department
create index assets_search_idx on assets using gin (
  (coalesce(asset_code,'') || ' ' || coalesce(serial_number,'') || ' ' || coalesce(name,'')) gin_trgm_ops
);
```

### Asset code generator

Format `<CATEGORY_CODE><3-digit running per category>-<2-digit purchase year>-<3-digit running per year>`
— e.g. `LPT045-24-118`, `PRN008-22-031`, `SRV003-21-014`.

```sql
create table asset_code_counters (
  category_code text not null,
  year_2        text not null,
  cat_seq       int  not null default 0,
  year_seq      int  not null default 0,
  primary key (category_code, year_2)
);

create or replace function next_asset_code(p_category uuid, p_purchase date)
returns text language plpgsql as $$
declare c_code text; y text; cs int; ys int;
begin
  select code into c_code from categories where id = p_category;
  y := to_char(coalesce(p_purchase, current_date), 'YY');
  insert into asset_code_counters (category_code, year_2, cat_seq, year_seq)
    values (c_code, y, 1, 1)
  on conflict (category_code, year_2) do update
    set cat_seq = asset_code_counters.cat_seq + 1,
        year_seq = asset_code_counters.year_seq + 1
  returning cat_seq, year_seq into cs, ys;
  return c_code || lpad(cs::text,3,'0') || '-' || y || '-' || lpad(ys::text,3,'0');
end $$;
```

## 5. Assignments (Assign / Return)

```sql
create table assignments (
  id              uuid primary key default gen_random_uuid(),
  asset_id        uuid not null references assets(id) on delete restrict,
  account_id      uuid not null references accounts(id) on delete restrict,
  department_id   uuid references departments(id) on delete set null,
  location_id     uuid not null references locations(id) on delete restrict,
  assigned_date   date not null,
  expected_return date,
  returned_date   date,
  state           assignment_state not null default 'active',
  notes           text,
  created_at      timestamptz not null default now(),
  created_by      uuid references accounts(id),
  check (returned_date is null or returned_date >= assigned_date)
);

-- one active assignment per asset
create unique index assignments_one_active on assignments(asset_id) where state = 'active';
create index assignments_account_idx on assignments(account_id);
```

`assign_asset()` and `return_asset()` are the only write paths (see §11) — they update the asset,
create the assignment, optionally the BAST, and a movement row when the location changes, in one
transaction.

## 6. Movements (append-only)

```sql
create table movements (
  id             uuid primary key default gen_random_uuid(),
  asset_id       uuid not null references assets(id) on delete restrict,
  from_location  uuid references locations(id) on delete restrict,
  to_location    uuid not null references locations(id) on delete restrict,
  moved_at       timestamptz not null default now(),
  reason         text not null,   -- project rollout, employee relocation, repair, redeployment, audit support, other
  remarks        text,
  moved_by       uuid not null references accounts(id),
  created_at     timestamptz not null default now(),
  check (from_location is null or from_location <> to_location)
);
create index movements_asset_idx on movements(asset_id, moved_at desc);

create or replace function forbid_mutation() returns trigger language plpgsql as $$
begin raise exception 'This table is append-only'; end $$;

create trigger movements_no_update before update on movements
  for each row execute function forbid_mutation();
create trigger movements_no_delete before delete on movements
  for each row execute function forbid_mutation();
```

## 7. BAST

```sql
create table bast_number_counters (
  year int primary key,
  seq  int not null default 0
);

create or replace function next_bast_number() returns text language plpgsql as $$
declare y int := extract(year from current_date)::int; s int;
begin
  insert into bast_number_counters(year, seq) values (y, 1)
  on conflict (year) do update set seq = bast_number_counters.seq + 1
  returning seq into s;
  return 'BAST/CITE/' || y || '/' || lpad(s::text, 4, '0');   -- BAST/CITE/2026/0182
end $$;

create table bast (
  id             uuid primary key default gen_random_uuid(),
  bast_number    text not null unique default next_bast_number(),
  assignment_id  uuid references assignments(id) on delete set null,
  asset_id       uuid not null references assets(id) on delete restrict,
  account_id     uuid not null references accounts(id) on delete restrict,
  department_id  uuid references departments(id) on delete set null,
  location_id    uuid not null references locations(id) on delete restrict,
  bast_date      date not null default current_date,
  description    text,
  condition_text text default 'Baik / Good',
  status         bast_status not null default 'draft',
  current_version int not null default 1,
  created_at     timestamptz not null default now(),
  created_by     uuid references accounts(id),
  updated_at     timestamptz not null default now()
);
create index bast_asset_idx on bast(asset_id);
create index bast_status_idx on bast(status);

create table bast_versions (
  id           uuid primary key default gen_random_uuid(),
  bast_id      uuid not null references bast(id) on delete cascade,
  version      int not null,
  kind         bast_file_kind not null,       -- 'generated' | 'signed'
  file_path    text not null,                 -- storage: bast/<bast_id>/v<version>.pdf
  file_size    bigint,
  mime_type    text,
  note         text,                          -- 'PDF generated (v1)', 'Signed scan uploaded'
  uploaded_by  uuid references accounts(id),  -- null = System
  created_at   timestamptz not null default now(),
  unique (bast_id, version)
);

create trigger bast_versions_no_update before update on bast_versions
  for each row execute function forbid_mutation();
create trigger bast_versions_no_delete before delete on bast_versions
  for each row execute function forbid_mutation();
```

Uploading a signed scan: insert a `bast_versions` row with `kind = 'signed'`, bump
`bast.current_version`, set `bast.status = 'signed'`, and also insert a `documents` row of kind
`signed_bast` so the file appears on the asset's Documents tab.

## 8. Documents, maintenance, notifications, imports

```sql
create table documents (
  id          uuid primary key default gen_random_uuid(),
  asset_id    uuid not null references assets(id) on delete cascade,
  kind        document_kind not null,
  title       text not null,
  file_path   text not null,                  -- storage: asset-documents/<asset_id>/<uuid>.<ext>
  file_size   bigint,
  mime_type   text,
  bast_id     uuid references bast(id) on delete set null,
  uploaded_by uuid references accounts(id),
  created_at  timestamptz not null default now()
);
create index documents_asset_idx on documents(asset_id, created_at desc);

create table maintenance_records (
  id           uuid primary key default gen_random_uuid(),
  asset_id     uuid not null references assets(id) on delete restrict,
  title        text not null,
  detail       text,
  state        maintenance_state not null default 'open',
  vendor_id    uuid references vendors(id) on delete set null,
  is_internal  boolean not null default false,
  cost         numeric(16,2) default 0,
  under_warranty boolean not null default false,
  started_at   date not null default current_date,
  completed_at date,
  next_due_at  date,                          -- drives 'maintenance_reminder'
  created_by   uuid references accounts(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index maintenance_asset_idx on maintenance_records(asset_id, started_at desc);

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  kind        notification_kind not null,
  title       text not null,
  body        text,
  asset_id    uuid references assets(id) on delete cascade,
  bast_id     uuid references bast(id) on delete cascade,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_inbox_idx on notifications(account_id, read_at, created_at desc);

create table import_batches (
  id            uuid primary key default gen_random_uuid(),
  file_name     text not null,
  file_path     text not null,
  total_rows    int not null default 0,
  imported_rows int not null default 0,
  skipped_rows  int not null default 0,
  errors        jsonb not null default '[]',  -- [{"row":12,"column":"serial_number","message":"Duplicate"}]
  imported_by   uuid references accounts(id),
  created_at    timestamptz not null default now()
);
```

## 9. Audit log (immutable)

```sql
create table audit_log (
  id          bigserial primary key,
  action      audit_action not null,
  table_name  text not null,
  record_id   uuid,
  target_label text,                          -- 'LPT045-24-118 · Dell Latitude 5440'
  old_value   jsonb,
  new_value   jsonb,
  actor_id    uuid references accounts(id),
  actor_label text,                           -- 'Site IT · Rizky Hidayat'
  device      text,                           -- 'iOS 26 · iPhone 15' | 'Android' | 'Web'
  ip_address  inet,
  created_at  timestamptz not null default now()
);
create index audit_created_idx on audit_log(created_at desc);
create index audit_record_idx  on audit_log(table_name, record_id);

create trigger audit_no_update before update on audit_log
  for each row execute function forbid_mutation();
create trigger audit_no_delete before delete on audit_log
  for each row execute function forbid_mutation();

revoke update, delete on audit_log, movements, bast_versions from anon, authenticated;
```

### Generic audit trigger

Attach to every mutable table so the log cannot be bypassed by the app:

```sql
create or replace function audit_row() returns trigger language plpgsql security definer as $$
declare me uuid; lbl text; act audit_action;
begin
  select id, coalesce(role::text,'system') || ' · ' || full_name into me, lbl from v_me limit 1;
  act := case
    when tg_op = 'INSERT' then (tg_argv[0])::audit_action
    else (tg_argv[1])::audit_action end;
  insert into audit_log(action, table_name, record_id, old_value, new_value, actor_id, actor_label,
                        device, ip_address)
  values (act, tg_table_name,
          coalesce(new.id, old.id),
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) end,
          me, lbl,
          current_setting('request.headers', true)::json->>'x-client-info',
          nullif(current_setting('request.headers', true)::json->>'x-forwarded-for','')::inet);
  return coalesce(new, old);
end $$;

create trigger assets_audit after insert or update or delete on assets
  for each row execute function audit_row('asset_created','asset_updated');
create trigger assignments_audit after insert or update on assignments
  for each row execute function audit_row('assignment_created','assignment_returned');
create trigger movements_audit after insert on movements
  for each row execute function audit_row('movement_recorded','movement_recorded');
create trigger bast_audit after insert or update on bast
  for each row execute function audit_row('bast_generated','bast_signed');
create trigger maintenance_audit after insert or update on maintenance_records
  for each row execute function audit_row('maintenance_updated','maintenance_updated');
create trigger accounts_audit after insert or update on accounts
  for each row execute function audit_row('account_created','account_updated');
```

For the **old → new** diff shown in the UI, read `old_value`/`new_value` and display only the changed
keys (`status_id`, `location_id`, `assigned_to` resolved to their display names).

## 10. Row Level Security

```sql
alter table assets, assignments, movements, bast, bast_versions, documents,
             maintenance_records, notifications, accounts, audit_log enable row level security;

-- helper: locations the current user may see
create or replace function my_location_ids() returns setof uuid
language sql stable security definer as $$
  select case
    when (select role from v_me) in ('super_admin','corporate_it')
      then (select id from locations)                       -- all locations
    else (select location_id from v_me)                     -- site_it / viewer: own location only
  end;
$$;

create policy assets_read on assets for select using (location_id in (select my_location_ids()));

create policy assets_write on assets for insert with check (
  (select role from v_me) in ('super_admin','corporate_it','site_it')
  and location_id in (select my_location_ids()));

create policy assets_update on assets for update using (
  (select role from v_me) in ('super_admin','corporate_it','site_it')
  and location_id in (select my_location_ids()));

create policy assets_delete on assets for delete using ((select role from v_me) = 'super_admin');

-- audit log: read-only, admins only
create policy audit_read on audit_log for select using (
  (select role from v_me) in ('super_admin','corporate_it'));

-- notifications: own inbox only
create policy notif_own on notifications for select using (
  account_id = (select id from v_me));
create policy notif_mark_read on notifications for update using (
  account_id = (select id from v_me));

-- accounts: only Super Admin manages accounts
create policy accounts_read on accounts for select using (true);
create policy accounts_write on accounts for all using ((select role from v_me) = 'super_admin');
```

Repeat the `*_read` / `*_write` pattern for `assignments`, `movements`, `bast`, `documents`,
`maintenance_records` using the asset's `location_id` (join through `assets`). Master-data tables:
`select` for all authenticated users, `insert/update` for `super_admin` + `corporate_it`,
`delete` for `super_admin` only.

> **Note on the client-side scope selector:** it is a *filter*, not a security boundary — RLS is what
> actually restricts Site IT and Viewer. The app must intersect the user's chosen scope with the
> locations RLS allows.

## 11. Server-side functions the app calls

```sql
-- Assign: creates assignment (+ movement if location changes, + BAST draft when p_auto_bast)
create or replace function assign_asset(
  p_asset uuid, p_account uuid, p_location uuid, p_date date,
  p_expected_return date default null, p_notes text default null, p_auto_bast boolean default true
) returns table (assignment_id uuid, bast_number text) language plpgsql security definer as $$ … $$;

-- Return: closes the active assignment, sets status Available, moves asset to the store location
create or replace function return_asset(
  p_asset uuid, p_date date, p_condition uuid, p_notes text default null
) returns uuid language plpgsql security definer as $$ … $$;

create or replace function record_movement(
  p_asset uuid, p_to_location uuid, p_reason text, p_remarks text default null, p_at timestamptz default now()
) returns uuid language plpgsql security definer as $$ … $$;

-- Dashboard: one round trip for the whole Home screen, scoped
create or replace function dashboard_summary(p_locations uuid[])
returns jsonb language sql stable as $$ … $$;   -- {totals, by_category[], by_location[], by_department[], warranty_expiring, activity[]}

-- Global search across code, serial, name, holder, department, brand, model
create or replace function search_assets(p_locations uuid[], p_query text, p_status uuid default null)
returns setof assets language sql stable as $$ … $$;
```

### Scheduled jobs (`pg_cron` or a scheduled Edge Function)

| Schedule | Job |
|---|---|
| daily 06:00 WITA | insert `warranty_expiring` notifications for assets with `warranty_end` within 30 days (dedupe per asset per 30-day window) |
| daily 06:05 WITA | insert `maintenance_reminder` for `maintenance_records.next_due_at <= today + 7` |
| weekly | refresh dashboard materialized view, if you choose to materialize it |

## 12. Storage buckets

| Bucket | Contents | Access |
|---|---|---|
| `asset-photos` | `<asset_id>/<uuid>.jpg` | authenticated read within scope, write for IT roles |
| `asset-documents` | `<asset_id>/<uuid>.<ext>` — invoice, PO, warranty card, manual, photos, other | same |
| `bast` | `<bast_id>/v<n>.pdf` — generated and signed versions | same; signed URLs for download |
| `imports` | `<batch_id>/<file>.xlsx` | write for IT roles, read for admins |

All buckets private; the app fetches short-lived signed URLs. Max upload 10 MB
(BAST scan / document), 5 MB (import file).

## 13. Seed data

```sql
insert into locations (code,name,kind,city) values
  ('HO','Head Office','head_office','Jakarta'),
  ('SITE','Site','site','Konawe');

insert into departments (name) values
  ('Corporate IT'),('Finance'),('Operations'),('HRGA'),('Procurement');

insert into categories (name,code,icon) values
  ('Laptop','LPT','laptop'),('Desktop','DSK','monitor'),('Monitor','MON','monitor'),
  ('Printer','PRN','printer'),('Networking','NET','network'),('Server','SRV','server'),
  ('Accessories','ACC','box');

insert into brands (name) values ('Lenovo'),('Dell'),('HP'),('Zebra'),('Cisco'),('HPE'),('Epson');

insert into vendors (name) values
  ('PT Mitra Solusi Teknologi'),('PT Datacom Nusantara'),('PT Sinar Elektronik');

insert into asset_statuses (name,color,is_terminal,sort_order) values
  ('Available','#0C6B3F',false,1),('Assigned','#2B57C4',false,2),('Maintenance','#8A5300',false,3),
  ('Broken','#B3312F',false,4),('Lost','#5138C4',true,5),('Retired','#4B5563',true,6);

insert into asset_conditions (name,color,sort_order) values
  ('Good','#0C6B3F',1),('Fair','#8A5300',2),('Poor','#B3312F',3);
```

Sample accounts and assets matching the prototype (`Dewi Lestari` — Super Admin, `Andi Prasetyo`,
`Rizky Hidayat` (record only, `can_login = false`), `Siti Rahayu`, `Budi Santoso`; assets
`LPT045-24-118`, `LPT012-23-076`, `PRN008-22-031`, `MON122-24-205`, `SRV003-21-014`,
`NET031-23-090`, `LPT099-21-004`) are listed in the prototype's logic — copy them for the dev seed so
the app looks identical to the design on first run.

## 14. Entity relationships (summary)

```
locations ──┬─< assets >─┬── categories
            │            ├── brands ──< models
            │            ├── vendors
            │            ├── asset_statuses
            │            ├── asset_conditions
            │            └── departments
            │
accounts ───┼─< assignments >── assets
            ├─< account_scope_preferences >── locations
            ├─< notifications
            └─< audit_log (actor)

assets ─┬─< movements (append-only, from_location/to_location → locations)
        ├─< bast >──< bast_versions (append-only)
        ├─< documents (→ bast optional)
        └─< maintenance_records >── vendors
```
