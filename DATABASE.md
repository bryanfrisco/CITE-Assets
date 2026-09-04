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

> **Note on the client-side scope selector:** it is a _filter_, not a security boundary — RLS is what
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

| Schedule         | Job                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| daily 06:00 WITA | insert `warranty_expiring` notifications for assets with `warranty_end` within 30 days (dedupe per asset per 30-day window) |
| daily 06:05 WITA | insert `maintenance_reminder` for `maintenance_records.next_due_at <= today + 7`                                            |
| weekly           | refresh dashboard materialized view, if you choose to materialize it                                                        |

## 12. Storage buckets

| Bucket            | Contents                                                                      | Access                                              |
| ----------------- | ----------------------------------------------------------------------------- | --------------------------------------------------- |
| `asset-photos`    | `<asset_id>/<uuid>.jpg`                                                       | authenticated read within scope, write for IT roles |
| `asset-documents` | `<asset_id>/<uuid>.<ext>` — invoice, PO, warranty card, manual, photos, other | same                                                |
| `bast`            | `<bast_id>/v<n>.pdf` — generated and signed versions                          | same; signed URLs for download                      |
| `imports`         | `<batch_id>/<file>.xlsx`                                                      | write for IT roles, read for admins                 |

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

## 14. Units, companies and accessories (migrations 0038–0051)

Everything below was added after the original spec. The reasoning lives in the
migration headers; this is the shape.

### Units — where a fitted asset lives

```sql
create table units (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,              -- 'DT-042'
  name        text not null,                     -- 'Dump Truck Komatsu HD465 #42'
  location_id uuid not null references locations(id) on delete restrict,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table assets add column unit_id uuid references units(id) on delete restrict;
```

A radio rig is bolted into a truck, not held by a person. **A unit is a PLACE,
not a holder**: an asset fitted to one has no holder and produces no BAST.

Units are deliberately **not** locations. `locations` is the RLS axis
(`my_location_ids()`), the source of the BAST letterhead and of the label stock
prefix; putting DT-042 in there would put a dump truck in the scope selector
and on the letterhead of a handover note.

A new `asset_statuses` row, **Installed**, keeps a fitted asset out of the
assign wizard without changing the wizard. `install_asset_to_unit()` and
`remove_asset_from_unit()` are the only writers of `assets.unit_id`; both
demand a reason and write it to `asset_status_changes`, because with no holder
and no document that row is the entire audit trail.

### Companies — the legal entity a person belongs to

```sql
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null unique,          -- SPR, SMA, RSL
  is_active boolean not null default true, ...
);

alter table accounts add column company_id uuid references companies(id) on delete restrict;
```

Seeded exactly as the Odoo export spells them — `PT` with no full stop — so
`import_accounts()` matches the common case without normalising every row.

Both tables plug into the existing master-data RPCs: `master_table()`,
`master_usage()`, `master_list()` and `master_create()` gained a branch each,
and `master_rename()` / `master_set_active()` / `master_delete()` needed none.

### Accessories — counted, not identified

```sql
create table accessories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category_id uuid not null references categories(id) on delete restrict,
  brand_id uuid references brands(id) on delete restrict,
  model_no text,
  vendor_id uuid references vendors(id) on delete restrict,
  location_id uuid not null references locations(id) on delete restrict,
  total_qty int not null default 0 check (total_qty >= 0),
  min_qty   int not null default 0,
  purchase_date date,
  purchase_price numeric(16,2),        -- per unit
  notes text, photo_path text,
  is_active boolean not null default true,
  ...,
  unique (name, location_id)
);

create table accessory_checkouts (
  id uuid primary key default gen_random_uuid(),
  accessory_id uuid not null references accessories(id) on delete restrict,
  account_id   uuid not null references accounts(id)   on delete restrict,
  qty int not null check (qty > 0),
  assigned_date date not null default current_date,
  returned_date date,
  state assignment_state not null default 'active',
  bast_id uuid references bast(id) on delete set null,
  ...
);
```

`assets.serial_number` is NOT NULL UNIQUE, so a mouse could never be
registered. Accessories are counted instead: a row is a KIND of thing at one
location with a quantity.

**`available` is never stored.** `accessory_available()` derives it as
`total_qty − sum(active checkouts)`. A second copy of that number is how stock
figures start to drift, and a drifting figure is worse than none.

`unique (name, location_id)` is what makes scope work for free — the same mouse
at HO and at Site is two rows with two stocks, and the ordinary
`location_id in (select my_location_ids())` policy does the rest.

### BAST Perlengkapan, and a nullable asset

```sql
alter table bast alter column asset_id drop not null;
alter table bast add column secondary_account_id uuid references accounts(id);
```

A signed document must never change, so accessories handed over a month after
somebody's laptop cannot be added to the letter they already signed. They get a
letter of their own: `bast.kind = 'accessory'`, no asset, goods table only.

That makes `asset_id` nullable, and it was the column every BAST policy
resolved visibility through. **`can_see_bast_row(asset_id, location_id)` is now
that single decision** — falling back to the document's own location when there
is no asset — and every policy on `bast`, `bast_versions`, `bast_items` and
`bast_signatures` calls it. `bast_list()` and `bast_stats()` also moved to a
LEFT join; before that a document with no asset was not hidden but *invisible*.

### A second holder

```sql
alter table assignments add column secondary_account_id uuid references accounts(id);
alter table assets      add column assigned_to_secondary uuid references accounts(id);
```

One handy-talkie, two shifts, both answerable. `assignments_one_active` is
unchanged — still one active assignment per asset, now carrying two names.
`set_secondary_holder()` writes all three places; `assign_asset()` was left
alone rather than widened.

`sign_bast()` returns `complete` only once **every** required block is signed:

> `handover` and `receiver` and (`secondary_account_id` is null or `receiver_2`)

Get that wrong and the PDF is issued, and the status locked, while one of the
two people answerable for the radio has signed nothing.

### Server-side functions added

```sql
install_asset_to_unit(uuid, uuid, text)      remove_asset_from_unit(uuid, text)
unit_assets(uuid)
accessories_list(uuid[], text, uuid)         accessory_detail(uuid)
accessory_available(uuid)
create_accessory(jsonb)                      update_accessory(uuid, jsonb)
assign_accessory(uuid, uuid, int, date, text, uuid)
return_accessory(uuid, date)
create_accessory_bast(uuid, uuid[])          attach_accessories_to_bast(uuid, uuid[])
can_see_bast_row(uuid, uuid)                 set_secondary_holder(uuid, uuid)
import_accounts(jsonb, boolean, text)
value_analytics(uuid[], date, date, uuid, uuid)
account_holdings(uuid)
```

Replaced in place, signatures unchanged: `master_*`, `asset_detail`,
`bast_detail`, `bast_list`, `bast_stats`, `sign_bast`, `set_bast_items`,
`return_asset`, `search_assets`, `import_lookup`. `import_history()` was
dropped and recreated — a `RETURNS TABLE` cannot gain a column in place.

---

## 15. Licenses (migrations 0062-0068)

The third register after assets and accessories. An asset is held by one person;
a **licence** has many **seats**, and each seat goes to somebody.

Three parts of this schema came from reading the real spreadsheet rather than
from a guess:

**`license_number` is nullable.** Seven of the fifteen licences genuinely have
none, and the values that exist are not always numbers — `Using Email` and
`Subscription ID : 5521692074` both appear. Stored as text, never validated.
Identity is therefore an expression index, not a table constraint:

```sql
create unique index licenses_identity_idx
  on licenses (lower(software), coalesce(license_number, ''));
```

**The manager account belongs to the SEAT.** Seven licences carry a different
account on each seat — 3DMine has three across five, AutoCAD four across four,
because Autodesk and Esri issue one named account per user under one
subscription. A column on `licenses` would have kept one and lost the rest.

**Seat status is not stored.** The sheet's `USED`/`STANDBY` column is entirely
derivable: no row is `USED` without a user. So it is computed —
`case when account_id is null then 'Standby' else 'Used' end` — for the same
reason `accessories.available` is never stored.

```
licenses          software, license_number?, category_id, vendor_id?,
                  purchase_year?, expiry_date?, notes?, is_active
license_seats     license_id, account_id?, seat_account?, seat_secret?,
                  assigned_date?, notes?
license_categories  name          -- MINING, OFFICE, MULTIMEDIA, SUPPORT
```

`license_seats.license_id` is the one `on delete cascade` in this schema. A seat
has no meaning without its licence, and an orphaned seat is a row nobody can
read. The licence itself is still protected: `delete_license()` refuses while
any seat is occupied.

### Scope

Unlike assets and accessories, licences carry **no `location_id`**. Software is
bought centrally, so every signed-in account reads the whole register and only
Corporate IT and above write. `can_write_licenses()` is the single definition of
that rule.

### The stored password

`seat_secret` holds a password when the source recorded one — five of them do.
Three things guard it, and the third is the one that actually matters:

1. `licenses_list()` and `license_detail()` never project it. `license_detail()`
   returns `has_secret`, a boolean.
2. `reveal_seat_secret(p_seat)` is the only way to read it: Super Admin only, and
   it writes the `license_secret_viewed` audit row **before** returning.
3. The column is **not granted**. Migration 0067 replaced the blanket
   `grant select on license_seats` with a column list that leaves `seat_secret`
   out, because with the blanket grant a client could simply ask PostgREST for
   `/rest/v1/license_seats?select=seat_secret` and bypass the other two.

> This is access control, not encryption. Anyone who can read the database
> directly — a backup, the service key — can read the column. There is no Vault
> in this project, and a key stored beside the data it encrypts protects nothing.

### Import

`import_licenses(p_rows, p_dry_run, p_file_name)` reads one row per **seat**; a
blank `software` means "another seat of the licence above", which is how the
merged cells of the source spreadsheet read. Idempotence works two ways:

- a seat that names an account is matched on `(license_id, seat_account)`
- a seat with no account has nothing to match on, so the file is read as a
  **count** and topped up to; a second run finds it satisfied and adds nothing

Neither path removes a seat or empties a holder. `license_parse_date()` accepts
Excel serials (epoch 1899-12-30), ISO dates, and `-`.

### Server-side functions added

```
license_expiry_state(date)      none | ok | expiring (<=60d) | expired
can_write_licenses()            super_admin, corporate_it
licenses_list / license_detail
create_license / update_license / delete_license(id, reason)
set_license_seats(license, count)
assign_seat / return_seat
reveal_seat_secret(seat)        super_admin only, audited
import_licenses(rows, dry_run, file_name)
license_parse_date(text)
```

`master_table()`, `master_label()` and `master_usage()` were replaced with the
same signatures to add the `license_category` entity — the eleventh chip.
`audit_list()` was dropped and recreated so entries about a licence or a seat
resolve to the licence.

## 16. Many holders, restore, and service rules (migrations 0069-0080)

### A voided document can come back

`restore_bast(id, reason)` returns a voided BAST to `draft`, keeping its number.
Super Admin only, reason required, and both the void and the restore stay in the
audit log. Signatures survive a void — `bast_signatures` is append-only — so the
document returns as a draft rather than silently re-asserting a signed state.

### Holders 2..N

`secondary_account_id` hard-coded the number two. Positions 2..4 now live in
`bast_holders` and `assignment_holders`; position 1 stays in `bast.account_id`,
because every join and RLS check resolves through it and it is genuinely the
person the document is addressed to.

`secondary_account_id` is KEPT and kept in sync as position 2 — the same
denormalisation as `assets.assigned_to`, and read by queries that predate the
table.

```
holders_of_bast(bast)      every holder in order, position 1 first
holder_signature_role(n)   receiver | receiver_2 | receiver_3 | receiver_4
set_asset_holders(asset, uuid[])   replaces the list outright
```

`holders_of_bast()` falls back to `secondary_account_id` when a document has no
`bast_holders` rows. That fallback is not cosmetic: `return_asset()` carries the
pair across in the column only, and without it `sign_bast()` counted one holder
and called a withdrawal complete after the first of two people signed — issuing
a PDF as evidence of a return that had not fully happened.

**Completeness** is counted against `holders_of_bast()`, not against two named
roles, so a fourth holder needs no change to `sign_bast()`.

**Four is the limit**, and the reason is the enum rather than the paper: each
position needs a signature role of its own. The document itself now paginates.

### The PDF runs to two pages

`buildPdf()` took one `Content` and hard-coded `/Count 1`. It now takes one per
page. `render()` draws a party block per holder and stacks the signature blocks
down the right column, spilling onto a second sheet headed "Lanjutan tanda
tangan" when the column would reach the footer. A single-holder document is
still exactly one page.

Signature boxes are never shrunk to fit: strokes are normalised 0..1 and would
shrink with the box, turning a signature into a smudge.

### Search and labels reach every holder

`search_assets()` matches holders 3 and 4 through `assignment_holders`, and
`bast_list()` builds `holder_label` from `holders_of_bast()` — `"Ahmad, Rivaldi,
Sari"`. Both stopped at position 2 when the table first went in, which made an
asset held by three people invisible to the third. `bast_list()` also gained
`p_search` (dropped and recreated — never a new parameter on a live function).

### Stepping through the register

`asset_neighbours(code, locations)` returns the assets either side by asset code
within scope. Deliberately not within the current filter: Next would then mean
something different depending on how somebody arrived.

### Service rules

```
maintenance_schedules      one row per category: every_months
set_maintenance_schedule(category, months, notes)   null months clears it
maintenance_schedules_list()
maintenance_due_list(locations, within_days)
```

The rule belongs to the **category** — "every laptop, every six months" — so it
covers assets bought after it was written. Due dates are **derived on read**:
last completed service, else purchase date, else `created_at`, plus the interval.
A stored due date would keep answering with the old rule the moment somebody
changed it, and applying to everything underneath is the whole point of a rule.

Assets with a terminal status are excluded. A Lost laptop is not overdue for
service, and listing it as such teaches people to ignore the list.

## 17. Entity relationships (summary)

```
locations ──┬─< assets >─┬── categories
            │            ├── brands ──< models
            │            ├── vendors
            │            ├── asset_statuses
            │            ├── asset_conditions
            │            └── departments
            │
accounts ───┼─< assignments >── assets      (account_id + secondary_account_id)
            ├─< account_scope_preferences >── locations
            ├─< accessory_checkouts >── accessories
            ├─── companies
            ├─< notifications
            └─< audit_log (actor)

units ──────── locations                  (assets.unit_id → units)
accessories ── locations, categories, brands, vendors
bast ───────┬─< bast_holders >── accounts      (positions 2..4)
assignments ─┬─< assignment_holders >── accounts
categories ──── maintenance_schedules            (every_months)

licenses ───┬── license_categories
            ├── vendors
            └─< license_seats >── accounts   (account_id null = Standby)

assets ─┬─< movements (append-only, from_location/to_location → locations)
        ├─< bast >──< bast_versions (append-only)
        ├─< documents (→ bast optional)
        └─< maintenance_records >── vendors
```
