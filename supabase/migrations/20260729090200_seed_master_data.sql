-- ============================================================================
-- CITE Assets — 0003 master data seed
-- Source: DATABASE.md §13.
--
-- This is REFERENCE data the app cannot run without (locations, departments,
-- categories, brands, vendors, statuses, conditions), so it ships as a
-- migration and runs in every environment.
--
-- The prototype's demo accounts/assets/BAST rows are NOT here — they live in
-- supabase/seed.sql, which only runs on a local `supabase db reset`.
--
-- Colors match the README badge token table.
-- ============================================================================

insert into locations (code,name,kind,city) values
  ('HO','Head Office','head_office','Jakarta'),
  ('SITE','Site','site','Konawe')
on conflict (code) do nothing;

insert into departments (name) values
  ('Corporate IT'),('Finance'),('Operations'),('HRGA'),('Procurement')
on conflict (name) do nothing;

insert into categories (name,code,icon) values
  ('Laptop','LPT','laptop'),('Desktop','DSK','monitor'),('Monitor','MON','monitor'),
  ('Printer','PRN','printer'),('Networking','NET','network'),('Server','SRV','server'),
  ('Accessories','ACC','box')
on conflict (code) do nothing;

insert into brands (name) values
  ('Lenovo'),('Dell'),('HP'),('Zebra'),('Cisco'),('HPE'),('Epson')
on conflict (name) do nothing;

insert into vendors (name) values
  ('PT Mitra Solusi Teknologi'),('PT Datacom Nusantara'),('PT Sinar Elektronik')
on conflict (name) do nothing;

insert into asset_statuses (name,color,is_terminal,sort_order) values
  ('Available','#0C6B3F',false,1),('Assigned','#2B57C4',false,2),('Maintenance','#8A5300',false,3),
  ('Broken','#B3312F',false,4),('Lost','#5138C4',true,5),('Retired','#4B5563',true,6)
on conflict (name) do nothing;

insert into asset_conditions (name,color,sort_order) values
  ('Good','#0C6B3F',1),('Fair','#8A5300',2),('Poor','#B3312F',3)
on conflict (name) do nothing;

-- Models referenced by the master-data screen and by the demo assets.
insert into models (brand_id, category_id, name)
select b.id, c.id, m.name
from (values
  ('Lenovo','Laptop',    'ThinkPad T14 Gen 4'),
  ('Dell',  'Laptop',    'Latitude 5440'),
  ('Dell',  'Monitor',   'P2422H'),
  ('HP',    'Laptop',    'EliteBook 840 G7'),
  ('Zebra', 'Printer',   'ZT411'),
  ('Cisco', 'Networking','Catalyst 9200-24T'),
  ('HPE',   'Server',    'ProLiant DL380 Gen10')
) as m(brand, category, name)
join brands b on b.name = m.brand
join categories c on c.name = m.category
on conflict (brand_id, name) do nothing;
