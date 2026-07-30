-- ============================================================================
-- CITE Assets — local development seed
--
-- The demo people, assets, assignments, movements, BAST records, maintenance,
-- documents and notifications from the prototype, so a fresh local database
-- looks identical to `CITE Assets.dc.html` on first run (DATABASE.md §13,
-- last paragraph).
--
-- Runs only on `supabase db reset` / `npm run db:reset`. Never shipped to
-- production — production gets reference data from the 0003 migration only.
--
-- "Today" in the prototype is 2026-07-29.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Accounts. auth_user_id stays null here; Phase 1 links the sign-in capable
-- ones to real Supabase Auth users.
-- ---------------------------------------------------------------------------
insert into accounts (full_name, nik, email, department_id, location_id, can_login, role)
select p.full_name, p.nik, p.email, d.id, l.id, p.can_login, p.role::user_role
from (values
  ('Dewi Lestari',   '18930', 'dewi.lestari@cite.co.id',   'Corporate IT', 'HO',   true,  'super_admin'),
  ('Andi Prasetyo',  '20481', 'andi.prasetyo@cite.co.id',  'Finance',      'HO',   true,  'viewer'),
  ('Siti Rahayu',    '19822', 'siti.rahayu@cite.co.id',    'HRGA',         'HO',   true,  'site_it'),
  ('Rizky Hidayat',  '21377', null,                        'Operations',   'SITE', false, null),
  ('Budi Santoso',   '22104', null,                        'Procurement',  'SITE', false, null)
) as p(full_name, nik, email, dept, loc, can_login, role)
join departments d on d.name = p.dept
join locations   l on l.code = p.loc
on conflict (nik) do nothing;

-- Custodian records — the prototype shows rooms/teams as asset holders
-- ("HO Server Room · Corporate IT"). They are people-less accounts with
-- can_login = false, which is exactly what that flag is for.
insert into accounts (full_name, department_id, location_id, can_login, role)
select p.full_name, d.id, l.id, false, null
from (values
  ('HO Server Room',    'Corporate IT', 'HO'),
  ('Site Network Rack', 'Corporate IT', 'SITE'),
  ('Warehouse',         'Operations',   'SITE')
) as p(full_name, dept, loc)
join departments d on d.name = p.dept
join locations   l on l.code = p.loc
where not exists (select 1 from accounts a where a.full_name = p.full_name);

-- Dewi opens the app with both locations in scope (matches the prototype).
insert into account_scope_preferences (account_id, location_id)
select a.id, l.id from accounts a cross join locations l
where a.nik = '18930'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Assets
-- ---------------------------------------------------------------------------
insert into assets (
  asset_code, name, category_id, brand_id, model_id, serial_number, vendor_id,
  purchase_date, purchase_price, warranty_start, warranty_end,
  department_id, location_id, assigned_to, status_id, condition_id, specifications, notes
)
select
  a.asset_code, a.name, c.id, b.id, m.id, a.serial, v.id,
  a.purchase::date, a.price, a.w_start::date, a.w_end::date,
  d.id, l.id, holder.id, s.id, cond.id, a.specs::jsonb, a.notes
from (values
  ('LPT045-24-118','Lenovo ThinkPad T14 Gen 4','Laptop','Lenovo','ThinkPad T14 Gen 4','PF3XK92L',
   'PT Mitra Solusi Teknologi','2024-03-18',21450000,'2024-03-18','2027-03-18',
   'Finance','HO','Andi Prasetyo','Assigned','Good',
   '[{"key":"Processor","value":"Intel Core i7-1355U"},{"key":"Memory","value":"32 GB DDR5-5200"},{"key":"Storage","value":"1 TB NVMe SSD"},{"key":"Display","value":"14\" WUXGA IPS 400 nits"},{"key":"OS","value":"Windows 11 Pro 23H2"},{"key":"MAC (Wi-Fi)","value":"A4:F9:33:1C:8E:20"}]',
   'Handed over with 65W USB-C adapter and Kensington lock. Screen protector applied on 12 Feb 2026.'),

  ('LPT012-23-076','Dell Latitude 5440','Laptop','Dell','Latitude 5440','8J2QW73',
   'PT Datacom Nusantara','2023-08-02',16900000,'2023-08-02','2026-08-02',
   'Operations','SITE','Rizky Hidayat','Maintenance','Fair',
   '[{"key":"Processor","value":"Intel Core i5-1345U"},{"key":"Memory","value":"16 GB DDR5"},{"key":"Storage","value":"512 GB NVMe SSD"},{"key":"Display","value":"14\" FHD"},{"key":"OS","value":"Windows 11 Pro"},{"key":"MAC (Wi-Fi)","value":"C8:5B:76:04:D1:9A"}]',
   'Keyboard replacement in progress at site workshop. Battery health 71%.'),

  ('PRN008-22-031','Zebra ZT411 Label Printer','Printer','Zebra','ZT411','ZT41-77120',
   'PT Sinar Elektronik','2022-11-14',34200000,'2022-11-14','2025-11-14',
   'Operations','SITE','Warehouse','Assigned','Good',
   '[{"key":"Print method","value":"Thermal transfer"},{"key":"Resolution","value":"300 dpi"},{"key":"Max width","value":"104 mm"},{"key":"Interface","value":"Ethernet, USB"},{"key":"Firmware","value":"V93.21.01Z"}]',
   'Used for asset sticker printing at site warehouse. Ribbon stock checked monthly.'),

  ('MON122-24-205','Dell P2422H 24" Monitor','Monitor','Dell','P2422H','CN0K7M42',
   'PT Datacom Nusantara','2024-01-09',3150000,'2024-01-09','2027-01-09',
   'Corporate IT','HO',null,'Available','Good',
   '[{"key":"Panel","value":"23.8\" IPS FHD"},{"key":"Refresh","value":"60 Hz"},{"key":"Ports","value":"HDMI, DP, VGA, USB hub"},{"key":"Stand","value":"Height adjustable"}]',
   'In HO store room, shelf B-04. Ready for assignment.'),

  ('SRV003-21-014','HPE ProLiant DL380 Gen10','Server','HPE','ProLiant DL380 Gen10','MXQ12403KP',
   'PT Mitra Solusi Teknologi','2021-06-22',212000000,'2021-06-22','2026-06-22',
   'Corporate IT','HO','HO Server Room','Assigned','Good',
   '[{"key":"CPU","value":"2× Xeon Silver 4214R"},{"key":"Memory","value":"128 GB DDR4 ECC"},{"key":"Storage","value":"6× 1.2 TB SAS RAID 10"},{"key":"iLO","value":"5 v2.78"},{"key":"PSU","value":"2× 800W redundant"}]',
   'Hosts file services and asset database replica. Maintenance window: Sunday 01:00–04:00 WITA.'),

  ('NET031-23-090','Cisco Catalyst 9200-24T','Networking','Cisco','Catalyst 9200-24T','FJC2412L0AB',
   'PT Datacom Nusantara','2023-05-30',48700000,'2023-05-30','2028-05-30',
   'Corporate IT','SITE','Site Network Rack','Assigned','Good',
   '[{"key":"Ports","value":"24× 1G RJ45"},{"key":"Uplink","value":"4× 1G SFP"},{"key":"IOS-XE","value":"17.09.04"},{"key":"Stacking","value":"StackWise-160"}]',
   'Uplink to core via 10G SFP+. Config backed up weekly.'),

  ('LPT099-21-004','HP EliteBook 840 G7','Laptop','HP','EliteBook 840 G7','5CD0412X8P',
   'PT Sinar Elektronik','2021-02-11',18300000,'2021-02-11','2024-02-11',
   'Corporate IT','HO',null,'Broken','Poor',
   '[{"key":"Processor","value":"Intel Core i5-10310U"},{"key":"Memory","value":"8 GB DDR4"},{"key":"Storage","value":"256 GB NVMe SSD"},{"key":"Display","value":"14\" FHD"}]',
   'Motherboard failure, out of warranty. Awaiting disposal approval from Procurement.')
) as a(asset_code, name, category, brand, model, serial, vendor, purchase, price, w_start, w_end,
       dept, loc, holder, status, cond, specs, notes)
join categories       c    on c.name    = a.category
join brands           b    on b.name    = a.brand
join models           m    on m.name    = a.model and m.brand_id = b.id
join vendors          v    on v.name    = a.vendor
join departments      d    on d.name    = a.dept
join locations        l    on l.code    = a.loc
join asset_statuses   s    on s.name    = a.status
join asset_conditions cond on cond.name = a.cond
left join accounts    holder on holder.full_name = a.holder
on conflict (asset_code) do nothing;

-- Prime the code generator past the demo codes so next_asset_code() cannot
-- collide with a seeded asset.
insert into asset_code_counters (category_code, year_2, cat_seq, year_seq) values
  ('LPT','24',45,118), ('LPT','23',12,76), ('LPT','21',99,4),
  ('PRN','22',8,31), ('MON','24',122,205), ('SRV','21',3,14), ('NET','23',31,90)
on conflict (category_code, year_2) do update
  set cat_seq  = greatest(asset_code_counters.cat_seq,  excluded.cat_seq),
      year_seq = greatest(asset_code_counters.year_seq, excluded.year_seq);

-- ---------------------------------------------------------------------------
-- Assignments — active for every Assigned asset, plus one returned record
-- (MON122 was returned by Siti Rahayu, per the notification inbox).
-- ---------------------------------------------------------------------------
insert into assignments (asset_id, account_id, department_id, location_id,
                         assigned_date, returned_date, state, notes, created_by)
select ast.id, acc.id, acc.department_id, ast.location_id,
       x.assigned::date, x.returned::date, x.state::assignment_state, x.notes, admin.id
from (values
  ('LPT045-24-118','Andi Prasetyo',   '2026-07-24', null,         'active',
   'Handover including 65W USB-C adapter and Kensington lock.'),
  ('PRN008-22-031','Warehouse',       '2026-07-04', null,         'active',
   'Stationed at site warehouse for asset sticker printing.'),
  ('SRV003-21-014','HO Server Room',  '2021-07-01', null,         'active',
   'Rack 2, unit 14. Custodian: Corporate IT infrastructure.'),
  ('NET031-23-090','Site Network Rack','2026-07-19', null,        'active',
   'Installed in site network rack after relocation from HO.'),
  ('MON122-24-205','Siti Rahayu',     '2026-07-12', '2026-07-28', 'returned',
   'Returned in good condition, moved to HO store room shelf B-04.')
) as x(code, holder, assigned, returned, state, notes)
join assets   ast on ast.asset_code = x.code
join accounts acc on acc.full_name  = x.holder
cross join lateral (select id from accounts where nik = '18930') admin
where not exists (
  select 1 from assignments s where s.asset_id = ast.id and s.account_id = acc.id
);

-- ---------------------------------------------------------------------------
-- Movements (append-only) — the audit log shows NET031 moving HO → Site.
-- ---------------------------------------------------------------------------
insert into movements (asset_id, from_location, to_location, moved_at, reason, remarks, moved_by)
select ast.id, from_l.id, to_l.id, x.moved_at::timestamptz, x.reason, x.remarks, mover.id
from (values
  ('NET031-23-090','HO','SITE','2026-07-22 14:03+08','project rollout',
   'Relocated to site network rack for the Konawe uplink upgrade.','Dewi Lestari')
) as x(code, from_code, to_code, moved_at, reason, remarks, mover)
join assets    ast    on ast.asset_code = x.code
join locations from_l on from_l.code    = x.from_code
join locations to_l   on to_l.code      = x.to_code
join accounts  mover  on mover.full_name = x.mover
where not exists (
  select 1 from movements m where m.asset_id = ast.id and m.moved_at = x.moved_at::timestamptz
);

-- ---------------------------------------------------------------------------
-- BAST — the four records shown on the BAST list.
-- ---------------------------------------------------------------------------
insert into bast (bast_number, asset_id, account_id, department_id, location_id,
                  bast_date, status, condition_text, current_version, created_by)
select x.number, ast.id, acc.id, d.id, l.id, x.bast_date::date,
       x.status::bast_status, 'Baik / Good', x.version, admin.id
from (values
  ('BAST/CITE/2026/0182','LPT045-24-118','Andi Prasetyo', 'Finance',     'HO',  '2026-07-24','awaiting_signature',1),
  ('BAST/CITE/2026/0178','NET031-23-090','Rizky Hidayat', 'Operations',  'SITE','2026-07-19','signed',2),
  ('BAST/CITE/2026/0175','MON122-24-205','Siti Rahayu',   'HRGA',        'HO',  '2026-07-12','signed',2),
  ('BAST/CITE/2026/0171','PRN008-22-031','Budi Santoso',  'Procurement', 'SITE','2026-07-04','draft',1)
) as x(number, code, employee, dept, loc, bast_date, status, version)
join assets      ast on ast.asset_code = x.code
join accounts    acc on acc.full_name  = x.employee
join departments d   on d.name         = x.dept
join locations   l   on l.code         = x.loc
cross join lateral (select id from accounts where nik = '18930') admin
on conflict (bast_number) do nothing;

-- Link each BAST to the assignment it documents. In production assign_asset()
-- sets this in the same transaction (Phase 4); the demo rows are inserted
-- separately, so they are joined up here by asset. Without it the Asset Detail
-- timeline has no BAST number to hang on the assignment event.
update bast b
   set assignment_id = asg.id
  from assignments asg
 where asg.asset_id = b.asset_id
   and b.assignment_id is null;

-- Prime the BAST sequence past the demo numbers.
insert into bast_number_counters (year, seq) values (2026, 182)
on conflict (year) do update set seq = greatest(bast_number_counters.seq, excluded.seq);

-- Version history (append-only). v1 is always the generated PDF; v2 is the
-- scanned signed copy where the BAST has been signed.
insert into bast_versions (bast_id, version, kind, file_path, file_size, mime_type, note, uploaded_by)
select b.id, x.version, x.kind::bast_file_kind,
       'bast/' || b.id || '/v' || x.version || '.pdf', x.size, 'application/pdf', x.note,
       case when x.uploader is null then null else up.id end
from (values
  ('BAST/CITE/2026/0182',1,'generated',184320,'PDF generated (v1)',            null),
  ('BAST/CITE/2026/0178',1,'generated',181248,'PDF generated (v1)',            null),
  ('BAST/CITE/2026/0178',2,'signed',   1887436,'Signed scan uploaded',         'Dewi Lestari'),
  ('BAST/CITE/2026/0175',1,'generated',179200,'PDF generated (v1)',            null),
  ('BAST/CITE/2026/0175',2,'signed',   1637744,'Signed scan uploaded',         'Dewi Lestari'),
  ('BAST/CITE/2026/0171',1,'generated',176128,'PDF generated (v1)',            null)
) as x(number, version, kind, size, note, uploader)
join bast b on b.bast_number = x.number
left join accounts up on up.full_name = x.uploader
where not exists (
  select 1 from bast_versions v where v.bast_id = b.id and v.version = x.version
);

-- ---------------------------------------------------------------------------
-- Documents — the signed BAST scans mirror into the asset's Documents tab.
-- ---------------------------------------------------------------------------
insert into documents (asset_id, kind, title, file_path, file_size, mime_type, bast_id, uploaded_by)
select ast.id, x.kind::document_kind, x.title,
       'asset-documents/' || ast.id || '/' || gen_random_uuid() || x.ext,
       x.size, x.mime, b.id, up.id
from (values
  ('LPT045-24-118','invoice',    'Invoice PT Mitra Solusi Teknologi','.pdf',412000, 'application/pdf',      null),
  ('LPT045-24-118','warranty_card','Warranty card 3 years',          '.pdf',218000, 'application/pdf',      null),
  ('NET031-23-090','signed_bast','Signed BAST/CITE/2026/0178',       '.pdf',1887436,'application/pdf',      'BAST/CITE/2026/0178'),
  ('MON122-24-205','signed_bast','Signed BAST/CITE/2026/0175',       '.pdf',1637744,'application/pdf',      'BAST/CITE/2026/0175'),
  ('SRV003-21-014','manual',     'HPE DL380 Gen10 service manual',   '.pdf',3240000,'application/pdf',      null)
) as x(code, kind, title, ext, size, mime, bast_number)
join assets ast on ast.asset_code = x.code
left join bast b on b.bast_number = x.bast_number
cross join lateral (select id from accounts where nik = '18930') up
where not exists (
  select 1 from documents dd where dd.asset_id = ast.id and dd.title = x.title
);

-- ---------------------------------------------------------------------------
-- Maintenance
-- ---------------------------------------------------------------------------
insert into maintenance_records (asset_id, title, detail, state, vendor_id, is_internal,
                                 cost, under_warranty, started_at, next_due_at, created_by)
select ast.id, x.title, x.detail, x.state::maintenance_state, v.id, x.internal,
       x.cost, x.warranty, x.started::date, x.next_due::date, admin.id
from (values
  ('LPT012-23-076','Keyboard replacement',
   'Several keys unresponsive. Replacement unit ordered, work done at site workshop.',
   'in_progress','PT Datacom Nusantara',false,1250000,true,'2026-07-26','2026-08-10'),
  ('SRV003-21-014','Quarterly preventive maintenance',
   'Firmware check, dust cleaning, RAID health verification.',
   'completed',null,true,0,false,'2026-05-11','2026-08-11')
) as x(code, title, detail, state, vendor, internal, cost, warranty, started, next_due)
join assets ast on ast.asset_code = x.code
left join vendors v on v.name = x.vendor
cross join lateral (select id from accounts where nik = '18930') admin
where not exists (
  select 1 from maintenance_records mr where mr.asset_id = ast.id and mr.title = x.title
);

-- ---------------------------------------------------------------------------
-- Notifications — Dewi's inbox, exactly as in the prototype (3 unread).
-- ---------------------------------------------------------------------------
insert into notifications (account_id, kind, title, body, asset_id, bast_id, read_at, created_at)
select me.id, x.kind::notification_kind, x.title, x.body, ast.id, b.id,
       x.read_at::timestamptz, x.created_at::timestamptz
from (values
  ('warranty_expiring','Warranty expiring in 14 days',
   'PRN008-22-031 · Zebra ZT411 Label Printer, Site','PRN008-22-031',null,
   null,'2026-07-29 08:24+08'),
  ('new_bast','BAST awaiting signature',
   'BAST/CITE/2026/0182 · Andi Prasetyo, Finance',null,'BAST/CITE/2026/0182',
   null,'2026-07-29 07:51+08'),
  ('maintenance_reminder','Maintenance updated',
   'LPT012-23-076 moved to In progress by Site IT','LPT012-23-076',null,
   null,'2026-07-29 06:30+08'),
  ('asset_returned','Asset returned',
   'MON122-24-205 returned by Siti Rahayu · HRGA','MON122-24-205',null,
   '2026-07-28 17:00+08','2026-07-28 16:12+08'),
  ('import_completed','Import completed',
   '42 rows imported, 3 skipped with validation errors',null,null,
   '2026-07-28 12:00+08','2026-07-28 11:05+08'),
  ('new_assignment','New assignment',
   'NET031-23-090 assigned to Site Network Rack','NET031-23-090',null,
   '2026-07-28 10:00+08','2026-07-28 09:40+08')
) as x(kind, title, body, code, bast_number, read_at, created_at)
cross join lateral (select id from accounts where nik = '18930') me
left join assets ast on ast.asset_code  = x.code
left join bast   b   on b.bast_number   = x.bast_number
where not exists (
  select 1 from notifications n where n.account_id = me.id and n.title = x.title
                                  and n.created_at = x.created_at::timestamptz
);

-- ---------------------------------------------------------------------------
-- Local sign-in users (Phase 1).
--
-- Production creates these through the Supabase Auth admin API when a Super
-- Admin issues credentials. Locally we insert them directly so the RLS test
-- and manual QA have three roles to sign in as. The `auth_user_created`
-- trigger from migration 0004 links each one to its waiting account by email.
--
--   dewi.lestari@cite.co.id  — Super Admin, sees both locations
--   siti.rahayu@cite.co.id   — Site IT,     locked to Head Office by RLS
--   andi.prasetyo@cite.co.id — Viewer,      read-only, Head Office
--
-- Password for all three: cite-dev-2026
-- ---------------------------------------------------------------------------
do $$
declare r record; uid uuid;
begin
  for r in
    select * from (values
      ('dewi.lestari@cite.co.id'),
      ('siti.rahayu@cite.co.id'),
      ('andi.prasetyo@cite.co.id')
    ) as t(email)
  loop
    if not exists (select 1 from auth.users u where u.email = r.email) then
      uid := gen_random_uuid();

      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
        r.email, crypt('cite-dev-2026', gen_salt('bf')),
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
        '', '', '', ''
      );

      insert into auth.identities (
        id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), uid, uid::text,
        jsonb_build_object('sub', uid::text, 'email', r.email), 'email',
        now(), now(), now()
      );
    end if;
  end loop;
end $$;
