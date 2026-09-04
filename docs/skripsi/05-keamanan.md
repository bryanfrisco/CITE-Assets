# 05 — Keamanan CITE Assets

Hasil Fase 5: Row-Level Security, hak akses, matriks izin, mekanisme
append-only, kecocokan gerbang UI dengan RLS, dan daftar trigger.

**Tanggal:** 2026-09-01  
**Revisi:** working tree di atas commit `cd0d9f3`  
**Patokan:** kode di `supabase/migrations/`, `src/`, dan `app/`. Dokumen
panduan tidak dipakai sebagai sumber.

---

## 0. Metode

Policy dan grant sama-sama bersifat kumulatif dan dapat dibatalkan migrasi
berikutnya, jadi keduanya direkonstruksi dengan **memutar ulang seluruh 61
migrasi berurutan** dan menyimpan keadaan akhir — bukan dengan mencari satu
pernyataan. Ini penting: `accounts` misalnya mendapat grant tulis penuh di
`20260729120000_grants.sql:44` lalu dicabut lagi di
`20260731170000_account_management.sql:325`. Membaca yang pertama saja akan
menghasilkan kesimpulan yang terbalik.

Angka pernyataan yang diproses:

| Jenis | Jumlah |
| --- | ---: |
| `create policy` | 65 |
| `drop policy` | 12 |
| `create policy` di dalam blok `do $$` (dinamis) | 8 baris menghasilkan 40 policy |
| `enable row level security` | 30 |
| `grant` / `revoke` pada tabel | 30 |
| `create trigger` | 35 |

```sh
grep -rcE "^[[:space:]]*create[[:space:]]+policy" supabase/migrations/*.sql | awk -F: '{s+=$2} END {print s}'
grep -rcE "enable row level security" supabase/migrations/*.sql | awk -F: '{s+=$2} END {print s}'
grep -rcE "^[[:space:]]*create[[:space:]]+trigger" supabase/migrations/*.sql | awk -F: '{s+=$2} END {print s}'
```

**Peringatan yang berlaku untuk seluruh dokumen.** Policy master data dibuat
lewat loop `do $$ ... foreach` (`20260729090100_rls.sql:163-181` dan
`20260820090200_units_and_companies.sql:82-97`), bukan ditulis satu per satu.
Nama dan ekspresinya di §1 direkonstruksi dari template `format()` di kedua
blok itu. Ekspresinya pasti; **nama policy hasil `format('%I', t || '_read')`
belum pernah dibaca dari `pg_policies`**.
`[BELUM TERVERIFIKASI — nama policy master data; memerlukan database berjalan.]`

---

## 1. RLS dan policy per tabel

**30 dari 33 tabel** mengaktifkan RLS. Tiga yang tidak dibahas di §1.34.

### `bast`

- **RLS:** aktif — `20260729090100_rls.sql:15`
- **Grant `authenticated`:** INSERT, SELECT, UPDATE
- **Grant `anon`:** tidak ada
- **Policy:** 3

| Nama | Perintah | Peran sasaran | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| `bast_write` | INSERT | public (tidak ditulis) | — | `can_write_assets() and can_see_bast_row(asset_id, location_id)` |
| `bast_read` | SELECT | public (tidak ditulis) | `can_see_bast_row(asset_id, location_id)` | — |
| `bast_update` | UPDATE | public (tidak ditulis) | `can_write_assets() and can_see_bast_row(asset_id, location_id)` | — |

Sumber: `20260821090300_accessory_bast.sql:51`, `20260821090300_accessory_bast.sql:53`, `20260821090300_accessory_bast.sql:55`

### `bast_items`

- **RLS:** aktif — `20260804140000_bast_documents_and_maintenance_status.sql:217`
- **Grant `authenticated`:** SELECT
- **Grant `anon`:** tidak ada
- **Policy:** 1

| Nama | Perintah | Peran sasaran | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| `bast_items_read` | SELECT | authenticated | `exists (select 1 from bast b where b.id = bast_id and can_see_bast_row(b.asset_id, b.location_id))` | — |

Sumber: `20260821090300_accessory_bast.sql:70`

### `bast_number_counters`

- **RLS:** **TIDAK AKTIF**
- **Grant `authenticated`:** **tidak ada**
- **Grant `anon`:** tidak ada
- **Policy:** tidak ada

### `bast_signatories`

- **RLS:** aktif — `20260731090000_ebast_signatures.sql:77`
- **Grant `authenticated`:** INSERT, SELECT, UPDATE
- **Grant `anon`:** tidak ada
- **Policy:** 3

| Nama | Perintah | Peran sasaran | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| `bast_signatories_write` | INSERT | authenticated | — | `can_write_assets()` |
| `bast_signatories_read` | SELECT | authenticated | `true` | — |
| `bast_signatories_update` | UPDATE | authenticated | `can_write_assets()` | — |

Sumber: `20260731090000_ebast_signatures.sql:80`, `20260731090000_ebast_signatures.sql:83`, `20260731090000_ebast_signatures.sql:86`

### `bast_signatures`

- **RLS:** aktif — `20260731090000_ebast_signatures.sql:119`
- **Grant `authenticated`:** SELECT
- **Grant `anon`:** tidak ada
- **Policy:** 1

| Nama | Perintah | Peran sasaran | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| `bast_signatures_read` | SELECT | authenticated | `exists (select 1 from bast b where b.id = bast_id and can_see_bast_row(b.asset_id, b.location_id))` | — |

Sumber: `20260821090300_accessory_bast.sql:75`

### `bast_versions`

- **RLS:** aktif — `20260729090100_rls.sql:16`
- **Grant `authenticated`:** INSERT, SELECT
- **Grant `anon`:** tidak ada
- **Policy:** 2

| Nama | Perintah | Peran sasaran | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| `bast_versions_write` | INSERT | public (tidak ditulis) | — | `can_write_assets() and exists (select 1 from bast b where b.id = bast_id and can_see_bast_row(b.asset_id, b.location_id))` |
| `bast_versions_read` | SELECT | public (tidak ditulis) | `exists (select 1 from bast b where b.id = bast_id and can_see_bast_row(b.asset_id, b.location_id))` | — |

Sumber: `20260821090300_accessory_bast.sql:61`, `20260821090300_accessory_bast.sql:64`

### `account_scope_preferences`

- **RLS:** aktif — `20260729090100_rls.sql:31`
- **Grant `authenticated`:** DELETE, INSERT, SELECT, UPDATE
- **Grant `anon`:** tidak ada
- **Policy:** 1

| Nama | Perintah | Peran sasaran | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| `scope_pref_own` | ALL | public (tidak ditulis) | `account_id = my_account_id()` | `account_id = my_account_id()` |

Sumber: `20260729090100_rls.sql:155`

### `accounts`

- **RLS:** aktif — `20260729090100_rls.sql:20`
- **Grant `authenticated`:** SELECT
- **Grant `anon`:** tidak ada
- **Policy:** 2

| Nama | Perintah | Peran sasaran | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| `accounts_write` | ALL | public (tidak ditulis) | `my_role() = 'super_admin'` | — |
| `accounts_read` | SELECT | public (tidak ditulis) | `true` | — |

Sumber: `20260729090100_rls.sql:151`, `20260729090100_rls.sql:152`

### `asset_code_counters`

- **RLS:** **TIDAK AKTIF**
- **Grant `authenticated`:** **tidak ada**
- **Grant `anon`:** tidak ada
- **Policy:** tidak ada

### `asset_photos`

- **RLS:** aktif — `20260811090000_asset_photo_gallery.sql:45`
- **Grant `authenticated`:** SELECT
- **Grant `anon`:** tidak ada
- **Policy:** 1

| Nama | Perintah | Peran sasaran | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| `asset_photos_rows_read` | SELECT | authenticated | `can_see_asset(asset_id)` | — |

Sumber: `20260811090000_asset_photo_gallery.sql:48`

### `asset_status_changes`

- **RLS:** aktif — `20260731140000_status_changes.sql:55`
- **Grant `authenticated`:** SELECT
- **Grant `anon`:** tidak ada
- **Policy:** 1

| Nama | Perintah | Peran sasaran | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| `asset_status_changes_read` | SELECT | authenticated | `can_see_asset(asset_id)` | — |

Sumber: `20260731140000_status_changes.sql:57`

### `asset_tags`

- **RLS:** aktif — `20260730080000_asset_tags.sql:278`
- **Grant `authenticated`:** INSERT, SELECT, UPDATE
- **Grant `anon`:** tidak ada
- **Policy:** 3

| Nama | Perintah | Peran sasaran | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| `tags_write` | INSERT | public (tidak ditulis) | — | `can_write_assets()` |
| `tags_read` | SELECT | public (tidak ditulis) | `auth.uid() is not null` | — |
| `tags_update` | UPDATE | public (tidak ditulis) | `can_write_assets()` | — |

Sumber: `20260730080000_asset_tags.sql:280`, `20260730080000_asset_tags.sql:281`, `20260730080000_asset_tags.sql:282`

### `assets`

- **RLS:** aktif — `20260729090100_rls.sql:12`
- **Grant `authenticated`:** DELETE, INSERT, SELECT, UPDATE
- **Grant `anon`:** tidak ada
- **Policy:** 4

| Nama | Perintah | Peran sasaran | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| `assets_delete` | DELETE | public (tidak ditulis) | `my_role() = 'super_admin'` | — |
| `assets_write` | INSERT | public (tidak ditulis) | — | `my_role() in ('super_admin','corporate_it','site_it') and location_id in (select my_location_ids())` |
| `assets_read` | SELECT | public (tidak ditulis) | `location_id in (select my_location_ids())` | — |
| `assets_update` | UPDATE | public (tidak ditulis) | `my_role() in ('super_admin','corporate_it','site_it') and location_id in (select my_location_ids())` | — |

Sumber: `20260729090100_rls.sql:75`, `20260729090100_rls.sql:77`, `20260729090100_rls.sql:81`, `20260729090100_rls.sql:85`

### `assignments`

- **RLS:** aktif — `20260729090100_rls.sql:13`
- **Grant `authenticated`:** INSERT, SELECT, UPDATE
- **Grant `anon`:** tidak ada
- **Policy:** 3

| Nama | Perintah | Peran sasaran | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| `assignments_write` | INSERT | public (tidak ditulis) | — | `can_write_assets() and can_see_asset(asset_id)` |
| `assignments_read` | SELECT | public (tidak ditulis) | `can_see_asset(asset_id)` | — |
| `assignments_update` | UPDATE | public (tidak ditulis) | `can_write_assets() and can_see_asset(asset_id)` | — |

Sumber: `20260729090100_rls.sql:90`, `20260729090100_rls.sql:91`, `20260729090100_rls.sql:93`

### `documents`

- **RLS:** aktif — `20260729090100_rls.sql:17`
- **Grant `authenticated`:** DELETE, INSERT, SELECT
- **Grant `anon`:** tidak ada
- **Policy:** 3

| Nama | Perintah | Peran sasaran | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| `documents_delete` | DELETE | public (tidak ditulis) | `my_role() in ('super_admin','corporate_it') and can_see_asset(asset_id)` | — |
| `documents_write` | INSERT | public (tidak ditulis) | — | `can_write_assets() and can_see_asset(asset_id)` |
| `documents_read` | SELECT | public (tidak ditulis) | `can_see_asset(asset_id)` | — |

Sumber: `20260729090100_rls.sql:123`, `20260729090100_rls.sql:124`, `20260729090100_rls.sql:126`

### `maintenance_records`

- **RLS:** aktif — `20260729090100_rls.sql:18`
- **Grant `authenticated`:** INSERT, SELECT, UPDATE
- **Grant `anon`:** tidak ada
- **Policy:** 3

| Nama | Perintah | Peran sasaran | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| `maintenance_write` | INSERT | public (tidak ditulis) | — | `can_write_assets() and can_see_asset(asset_id)` |
| `maintenance_read` | SELECT | public (tidak ditulis) | `can_see_asset(asset_id)` | — |
| `maintenance_update` | UPDATE | public (tidak ditulis) | `can_write_assets() and can_see_asset(asset_id)` | — |

Sumber: `20260729090100_rls.sql:129`, `20260729090100_rls.sql:130`, `20260729090100_rls.sql:132`

### `movements`

- **RLS:** aktif — `20260729090100_rls.sql:14`
- **Grant `authenticated`:** INSERT, SELECT
- **Grant `anon`:** tidak ada
- **Policy:** 2

| Nama | Perintah | Peran sasaran | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| `movements_write` | INSERT | public (tidak ditulis) | — | `can_write_assets() and can_see_asset(asset_id)` |
| `movements_read` | SELECT | public (tidak ditulis) | `can_see_asset(asset_id)` | — |

Sumber: `20260729090100_rls.sql:100`, `20260729090100_rls.sql:101`

### `tag_code_counters`

- **RLS:** **TIDAK AKTIF**
- **Grant `authenticated`:** **tidak ada**
- **Grant `anon`:** tidak ada
- **Policy:** tidak ada

### `asset_conditions`

- **RLS:** aktif — `20260729090100_rls.sql:30`
- **Grant `authenticated`:** DELETE, INSERT, SELECT, UPDATE
- **Grant `anon`:** tidak ada
- **Policy:** 4

| Nama | Perintah | Peran sasaran | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| `asset_conditions_delete` ⟳ | DELETE | public (tidak ditulis) | `my_role() = 'super_admin'` | — |
| `asset_conditions_insert` ⟳ | INSERT | public (tidak ditulis) | — | `my_role() in ('super_admin','corporate_it')` |
| `asset_conditions_read` ⟳ | SELECT | public (tidak ditulis) | `auth.uid() is not null` | — |
| `asset_conditions_update` ⟳ | UPDATE | public (tidak ditulis) | `my_role() in ('super_admin','corporate_it')` | — |

Sumber: `20260729090100_rls.sql:163`
  ⟳ = dibuat lewat loop `do $$` (lihat peringatan §0)

### `asset_statuses`

- **RLS:** aktif — `20260729090100_rls.sql:29`
- **Grant `authenticated`:** DELETE, INSERT, SELECT, UPDATE
- **Grant `anon`:** tidak ada
- **Policy:** 4

| Nama | Perintah | Peran sasaran | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| `asset_statuses_delete` ⟳ | DELETE | public (tidak ditulis) | `my_role() = 'super_admin'` | — |
| `asset_statuses_insert` ⟳ | INSERT | public (tidak ditulis) | — | `my_role() in ('super_admin','corporate_it')` |
| `asset_statuses_read` ⟳ | SELECT | public (tidak ditulis) | `auth.uid() is not null` | — |
| `asset_statuses_update` ⟳ | UPDATE | public (tidak ditulis) | `my_role() in ('super_admin','corporate_it')` | — |

Sumber: `20260729090100_rls.sql:163`
  ⟳ = dibuat lewat loop `do $$` (lihat peringatan §0)

### `brands`

- **RLS:** aktif — `20260729090100_rls.sql:26`
- **Grant `authenticated`:** DELETE, INSERT, SELECT, UPDATE
- **Grant `anon`:** tidak ada
- **Policy:** 4

| Nama | Perintah | Peran sasaran | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| `brands_delete` ⟳ | DELETE | public (tidak ditulis) | `my_role() = 'super_admin'` | — |
| `brands_insert` ⟳ | INSERT | public (tidak ditulis) | — | `my_role() in ('super_admin','corporate_it')` |
| `brands_read` ⟳ | SELECT | public (tidak ditulis) | `auth.uid() is not null` | — |
| `brands_update` ⟳ | UPDATE | public (tidak ditulis) | `my_role() in ('super_admin','corporate_it')` | — |

Sumber: `20260729090100_rls.sql:163`
  ⟳ = dibuat lewat loop `do $$` (lihat peringatan §0)

### `categories`

- **RLS:** aktif — `20260729090100_rls.sql:25`
- **Grant `authenticated`:** DELETE, INSERT, SELECT, UPDATE
- **Grant `anon`:** tidak ada
- **Policy:** 4

| Nama | Perintah | Peran sasaran | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| `categories_delete` ⟳ | DELETE | public (tidak ditulis) | `my_role() = 'super_admin'` | — |
| `categories_insert` ⟳ | INSERT | public (tidak ditulis) | — | `my_role() in ('super_admin','corporate_it')` |
| `categories_read` ⟳ | SELECT | public (tidak ditulis) | `auth.uid() is not null` | — |
| `categories_update` ⟳ | UPDATE | public (tidak ditulis) | `my_role() in ('super_admin','corporate_it')` | — |

Sumber: `20260729090100_rls.sql:163`
  ⟳ = dibuat lewat loop `do $$` (lihat peringatan §0)

### `companies`

- **RLS:** aktif — `20260820090200_units_and_companies.sql:80`
- **Grant `authenticated`:** DELETE, INSERT, SELECT, UPDATE
- **Grant `anon`:** tidak ada
- **Policy:** 4

| Nama | Perintah | Peran sasaran | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| `companies_delete` ⟳ | DELETE | public (tidak ditulis) | `my_role() = 'super_admin'` | — |
| `companies_insert` ⟳ | INSERT | public (tidak ditulis) | — | `my_role() in ('super_admin','corporate_it')` |
| `companies_read` ⟳ | SELECT | public (tidak ditulis) | `auth.uid() is not null` | — |
| `companies_update` ⟳ | UPDATE | public (tidak ditulis) | `my_role() in ('super_admin','corporate_it')` | — |

Sumber: `20260820090200_units_and_companies.sql:82`
  ⟳ = dibuat lewat loop `do $$` (lihat peringatan §0)

### `departments`

- **RLS:** aktif — `20260729090100_rls.sql:24`
- **Grant `authenticated`:** DELETE, INSERT, SELECT, UPDATE
- **Grant `anon`:** tidak ada
- **Policy:** 4

| Nama | Perintah | Peran sasaran | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| `departments_delete` ⟳ | DELETE | public (tidak ditulis) | `my_role() = 'super_admin'` | — |
| `departments_insert` ⟳ | INSERT | public (tidak ditulis) | — | `my_role() in ('super_admin','corporate_it')` |
| `departments_read` ⟳ | SELECT | public (tidak ditulis) | `auth.uid() is not null` | — |
| `departments_update` ⟳ | UPDATE | public (tidak ditulis) | `my_role() in ('super_admin','corporate_it')` | — |

Sumber: `20260729090100_rls.sql:163`
  ⟳ = dibuat lewat loop `do $$` (lihat peringatan §0)

### `locations`

- **RLS:** aktif — `20260729090100_rls.sql:23`
- **Grant `authenticated`:** DELETE, INSERT, SELECT, UPDATE
- **Grant `anon`:** tidak ada
- **Policy:** 4

| Nama | Perintah | Peran sasaran | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| `locations_delete` ⟳ | DELETE | public (tidak ditulis) | `my_role() = 'super_admin'` | — |
| `locations_insert` ⟳ | INSERT | public (tidak ditulis) | — | `my_role() in ('super_admin','corporate_it')` |
| `locations_read` ⟳ | SELECT | public (tidak ditulis) | `auth.uid() is not null` | — |
| `locations_update` ⟳ | UPDATE | public (tidak ditulis) | `my_role() in ('super_admin','corporate_it')` | — |

Sumber: `20260729090100_rls.sql:163`
  ⟳ = dibuat lewat loop `do $$` (lihat peringatan §0)

### `models`

- **RLS:** aktif — `20260729090100_rls.sql:27`
- **Grant `authenticated`:** DELETE, INSERT, SELECT, UPDATE
- **Grant `anon`:** tidak ada
- **Policy:** 4

| Nama | Perintah | Peran sasaran | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| `models_delete` ⟳ | DELETE | public (tidak ditulis) | `my_role() = 'super_admin'` | — |
| `models_insert` ⟳ | INSERT | public (tidak ditulis) | — | `my_role() in ('super_admin','corporate_it')` |
| `models_read` ⟳ | SELECT | public (tidak ditulis) | `auth.uid() is not null` | — |
| `models_update` ⟳ | UPDATE | public (tidak ditulis) | `my_role() in ('super_admin','corporate_it')` | — |

Sumber: `20260729090100_rls.sql:163`
  ⟳ = dibuat lewat loop `do $$` (lihat peringatan §0)

### `units`

- **RLS:** aktif — `20260820090200_units_and_companies.sql:79`
- **Grant `authenticated`:** DELETE, INSERT, SELECT, UPDATE
- **Grant `anon`:** tidak ada
- **Policy:** 4

| Nama | Perintah | Peran sasaran | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| `units_delete` ⟳ | DELETE | public (tidak ditulis) | `my_role() = 'super_admin'` | — |
| `units_insert` ⟳ | INSERT | public (tidak ditulis) | — | `my_role() in ('super_admin','corporate_it')` |
| `units_read` ⟳ | SELECT | public (tidak ditulis) | `auth.uid() is not null` | — |
| `units_update` ⟳ | UPDATE | public (tidak ditulis) | `my_role() in ('super_admin','corporate_it')` | — |

Sumber: `20260820090200_units_and_companies.sql:82`
  ⟳ = dibuat lewat loop `do $$` (lihat peringatan §0)

### `vendors`

- **RLS:** aktif — `20260729090100_rls.sql:28`
- **Grant `authenticated`:** DELETE, INSERT, SELECT, UPDATE
- **Grant `anon`:** tidak ada
- **Policy:** 4

| Nama | Perintah | Peran sasaran | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| `vendors_delete` ⟳ | DELETE | public (tidak ditulis) | `my_role() = 'super_admin'` | — |
| `vendors_insert` ⟳ | INSERT | public (tidak ditulis) | — | `my_role() in ('super_admin','corporate_it')` |
| `vendors_read` ⟳ | SELECT | public (tidak ditulis) | `auth.uid() is not null` | — |
| `vendors_update` ⟳ | UPDATE | public (tidak ditulis) | `my_role() in ('super_admin','corporate_it')` | — |

Sumber: `20260729090100_rls.sql:163`
  ⟳ = dibuat lewat loop `do $$` (lihat peringatan §0)

### `accessories`

- **RLS:** aktif — `20260821090200_accessories.sql:79`
- **Grant `authenticated`:** DELETE, INSERT, SELECT, UPDATE
- **Grant `anon`:** tidak ada
- **Policy:** 4

| Nama | Perintah | Peran sasaran | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| `accessories_delete` | DELETE | public (tidak ditulis) | `my_role() = 'super_admin' and location_id in (select my_location_ids())` | — |
| `accessories_write` | INSERT | public (tidak ditulis) | — | `can_write_assets() and location_id in (select my_location_ids())` |
| `accessories_read` | SELECT | public (tidak ditulis) | `location_id in (select my_location_ids())` | — |
| `accessories_update` | UPDATE | public (tidak ditulis) | `can_write_assets() and location_id in (select my_location_ids())` | — |

Sumber: `20260821090200_accessories.sql:82`, `20260821090200_accessories.sql:84`, `20260821090200_accessories.sql:86`, `20260821090200_accessories.sql:88`

### `accessory_checkouts`

- **RLS:** aktif — `20260821090200_accessories.sql:80`
- **Grant `authenticated`:** INSERT, SELECT, UPDATE
- **Grant `anon`:** tidak ada
- **Policy:** 3

| Nama | Perintah | Peran sasaran | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| `accessory_checkouts_write` | INSERT | public (tidak ditulis) | — | `can_write_assets() and exists ( select 1 from accessories x where x.id = accessory_id and x.location_id in (select my_location_ids()))` |
| `accessory_checkouts_read` | SELECT | public (tidak ditulis) | `exists (select 1 from accessories x where x.id = accessory_id and x.location_id in (select my_location_ids()))` | — |
| `accessory_checkouts_update` | UPDATE | public (tidak ditulis) | `can_write_assets() and exists ( select 1 from accessories x where x.id = accessory_id and x.location_id in (select my_location_ids()))` | — |

Sumber: `20260821090200_accessories.sql:91`, `20260821090200_accessories.sql:95`, `20260821090200_accessories.sql:99`

### `audit_log`

- **RLS:** aktif — `20260729090100_rls.sql:21`
- **Grant `authenticated`:** SELECT
- **Grant `anon`:** tidak ada
- **Policy:** 1

| Nama | Perintah | Peran sasaran | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| `audit_read` | SELECT | public (tidak ditulis) | `my_role() in ('super_admin','corporate_it')` | — |

Sumber: `20260729090100_rls.sql:139`

### `import_batches`

- **RLS:** aktif — `20260729090100_rls.sql:32`
- **Grant `authenticated`:** INSERT, SELECT
- **Grant `anon`:** tidak ada
- **Policy:** 2

| Nama | Perintah | Peran sasaran | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| `imports_write` | INSERT | public (tidak ditulis) | — | `can_write_assets()` |
| `imports_read` | SELECT | public (tidak ditulis) | `my_role() in ('super_admin','corporate_it')` | — |

Sumber: `20260729090100_rls.sql:186`, `20260729090100_rls.sql:188`

### `notifications`

- **RLS:** aktif — `20260729090100_rls.sql:19`
- **Grant `authenticated`:** SELECT, UPDATE
- **Grant `anon`:** tidak ada
- **Policy:** 2

| Nama | Perintah | Peran sasaran | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| `notif_own` | SELECT | public (tidak ditulis) | `account_id = my_account_id()` | — |
| `notif_mark_read` | UPDATE | public (tidak ditulis) | `account_id = my_account_id()` | — |

Sumber: `20260729090100_rls.sql:145`, `20260729090100_rls.sql:146`

### `storage.objects` (schema `storage`)

Sepuluh policy pada bucket `asset-photos`, `asset-documents`, dan `bast`.
Bukan tabel aplikasi, tetapi ia yang menjaga berkas — dan di sinilah cacat
BAST Perlengkapan pernah muncul (§4.3).

| Nama | Perintah | Peran sasaran | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| `asset_documents_delete` | DELETE | authenticated | `bucket_id = 'asset-documents' and my_role() = 'super_admin' and can_see_asset(storage_asset_id(name))` | — |
| `asset_photos_delete` | DELETE | authenticated | `bucket_id = 'asset-photos' and can_write_assets() and can_see_asset(storage_asset_id(name))` | — |
| `asset_documents_write` | INSERT | authenticated | — | `bucket_id = 'asset-documents' and can_write_assets() and can_see_asset(storage_asset_id(name))` |
| `asset_photos_write` | INSERT | authenticated | — | `bucket_id = 'asset-photos' and can_write_assets() and can_see_asset(storage_asset_id(name))` |
| `bast_files_write` | INSERT | authenticated | — | `bucket_id = 'bast' and can_write_assets() and can_see_bast_file(name)` |
| `asset_documents_read` | SELECT | authenticated | `bucket_id = 'asset-documents' and can_see_asset(storage_asset_id(name))` | — |
| `asset_photos_read` | SELECT | authenticated | `bucket_id = 'asset-photos' and can_see_asset(storage_asset_id(name))` | — |
| `bast_files_read` | SELECT | authenticated | `bucket_id = 'bast' and can_see_bast_file(name)` | — |
| `asset_photos_update` | UPDATE | authenticated | `bucket_id = 'asset-photos' and can_write_assets() and can_see_asset(storage_asset_id(name))` | — |
| `bast_files_update` | UPDATE | authenticated | `bucket_id = 'bast' and can_write_assets() and can_see_bast_file(name)` | — |

Sumber: `20260729170000_asset_photos_storage.sql:30`, `20260729170000_asset_photos_storage.sql:36`, `20260729170000_asset_photos_storage.sql:43`, `20260729170000_asset_photos_storage.sql:50`, `20260801090000_phase6.sql:50`, `20260801090000_phase6.sql:53`, `20260801090000_phase6.sql:60`, `20260824090000_bast_storage_no_asset.sql:54`, `20260824090000_bast_storage_no_asset.sql:57`, `20260824090000_bast_storage_no_asset.sql:60`

### 1.34 Tiga tabel tanpa RLS

| Tabel | RLS | Policy | Grant `authenticated` | Grant `anon` |
| --- | --- | --- | --- | --- |
| `asset_code_counters` | **tidak aktif** | tidak ada | **tidak ada** | tidak ada |
| `bast_number_counters` | **tidak aktif** | tidak ada | **tidak ada** | tidak ada |
| `tag_code_counters` | **tidak aktif** | tidak ada | **tidak ada** | tidak ada |

Ketiganya adalah tabel penghitung. Mereka **tidak dilindungi RLS melainkan
oleh ketiadaan grant**: tanpa `SELECT`, `INSERT`, `UPDATE`, maupun `DELETE`,
`authenticated` tidak dapat menyentuhnya sama sekali, sehingga RLS tidak
punya apa pun untuk disaring. Satu-satunya jalan masuk adalah
`next_asset_code()`, `next_bast_number()`, dan `next_tag_code()` yang
`SECURITY DEFINER`.

```sh
grep -rniE "grant.*(asset_code_counters|bast_number_counters|tag_code_counters)" \
  supabase/migrations/*.sql      # -> tidak ada hasil
```

**Ini pertahanan satu lapis, bukan dua.** Selama tidak ada grant, tabel itu
aman. Bila suatu hari seseorang menambahkan `grant select on
asset_code_counters to authenticated` — misalnya untuk sebuah layar
diagnostik — tidak ada RLS yang menahan di belakangnya, dan seluruh isi
penghitung langsung terbuka. Sepuluh tabel master di §1 punya kedua lapis;
ketiga tabel ini hanya punya satu. Menambahkan `enable row level security`
tanpa policy apa pun akan menutup celah itu tanpa mengubah perilaku hari ini.

---

## 2. GRANT dan REVOKE

### 2.1 `anon` — nol hak di seluruh tabel

Setelah seluruh migrasi diputar, **`anon` tidak memiliki satu hak pun atas
satu tabel pun.**

```sh
grep -rn "to anon" supabase/migrations/*.sql | grep -v revoke   # -> hanya grant usage on schema
```

Satu-satunya pemberian kepada `anon` adalah `grant usage on schema public to
anon, authenticated` (`20260729120000_grants.sql:30`), yang hanya membuka
schema-nya, bukan isinya. Klien yang belum masuk tidak dapat membaca satu
baris data bisnis pun. Ini diperkuat dua kali oleh `revoke update, delete ...
from anon, authenticated` di `20260729090000_init_schema.sql:433` dan
`20260729120000_grants.sql:83`.

### 2.2 `authenticated` — keadaan akhir per tabel

| Tabel | Modul | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | :-: | :-: | :-: | :-: |
| `bast` | E-BAST | ✓ | ✓ | ✓ | — |
| `bast_items` | E-BAST | ✓ | — | — | — |
| `bast_number_counters` | E-BAST | — | — | — | — |
| `bast_signatories` | E-BAST | ✓ | ✓ | ✓ | — |
| `bast_signatures` | E-BAST | ✓ | — | — | — |
| `bast_versions` | E-BAST | ✓ | ✓ | — | — |
| `account_scope_preferences` | Inti | ✓ | ✓ | ✓ | ✓ |
| `accounts` | Inti | ✓ | — | — | — |
| `asset_code_counters` | Inti | — | — | — | — |
| `asset_photos` | Inti | ✓ | — | — | — |
| `asset_status_changes` | Inti | ✓ | — | — | — |
| `asset_tags` | Inti | ✓ | ✓ | ✓ | — |
| `assets` | Inti | ✓ | ✓ | ✓ | ✓ |
| `assignments` | Inti | ✓ | ✓ | ✓ | — |
| `documents` | Inti | ✓ | ✓ | — | ✓ |
| `maintenance_records` | Inti | ✓ | ✓ | ✓ | — |
| `movements` | Inti | ✓ | ✓ | — | — |
| `tag_code_counters` | Inti | — | — | — | — |
| `asset_conditions` | Master | ✓ | ✓ | ✓ | ✓ |
| `asset_statuses` | Master | ✓ | ✓ | ✓ | ✓ |
| `brands` | Master | ✓ | ✓ | ✓ | ✓ |
| `categories` | Master | ✓ | ✓ | ✓ | ✓ |
| `companies` | Master | ✓ | ✓ | ✓ | ✓ |
| `departments` | Master | ✓ | ✓ | ✓ | ✓ |
| `locations` | Master | ✓ | ✓ | ✓ | ✓ |
| `models` | Master | ✓ | ✓ | ✓ | ✓ |
| `units` | Master | ✓ | ✓ | ✓ | ✓ |
| `vendors` | Master | ✓ | ✓ | ✓ | ✓ |
| `accessories` | Perlengkapan | ✓ | ✓ | ✓ | ✓ |
| `accessory_checkouts` | Perlengkapan | ✓ | ✓ | ✓ | — |
| `audit_log` | Sistem | ✓ | — | — | — |
| `import_batches` | Sistem | ✓ | ✓ | — | — |
| `notifications` | Sistem | ✓ | — | ✓ | — |

Perhatikan bahwa **grant bukan izin akhir** — RLS masih menyaring baris di
atasnya. Tabel yang punya `INSERT` di sini belum tentu dapat disisipi oleh
semua peran; §3 menggabungkan keduanya.

### 2.3 Riwayat pencabutan yang mengubah kesimpulan

Empat pencabutan datang **sesudah** grant yang lebih longgar, sehingga membaca
migrasi grant saja akan menyesatkan:

| Tabel | Grant awal | Pencabutan | Hasil akhir |
| --- | --- | --- | --- |
| `accounts` | `select, insert, update, delete` — `20260729120000_grants.sql:44` | `revoke insert, update, delete` — `20260731170000_account_management.sql:325` | **SELECT saja** |
| `asset_tags` | `select, insert, update` — `20260730080000_asset_tags.sql:284` | `revoke delete` — `:286` | SELECT, INSERT, UPDATE |
| `bast_signatures` | `select` — `20260731090000_ebast_signatures.sql:126` | `revoke insert, update, delete` — `:127` | **SELECT saja** |
| `asset_status_changes` | `select` — `20260731140000_status_changes.sql:60` | `revoke insert, update, delete` — `:61` | **SELECT saja** |
| `bast_items` | `select` — `20260804140000_...:223` | `revoke insert, update, delete from public, anon, authenticated` — `:228` | **SELECT saja** |
| `asset_photos` | `select` — `20260811090000_...:51` | `revoke insert, update, delete from public, anon, authenticated` — `:54` | **SELECT saja** |

Enam tabel karena itu **hanya dapat ditulis lewat RPC**, tidak pernah
langsung dari klien — penegakan aturan kerja #2 di lapisan hak akses, bukan
sekadar konvensi.

### 2.4 Hak `EXECUTE` pada fungsi

| Keadaan akhir | Jumlah |
| --- | ---: |
| `grant execute ... to authenticated` | 117 |
| Dicabut dari `authenticated`, tanpa grant sesudahnya | 9 |
| **Tidak ada pernyataan `grant`/`revoke` sama sekali** | **9** |
| Total | 135 |

Yang dicabut dari `authenticated` — semuanya helper internal atau job:

- `assert_can_manage_accounts` — `20260731170000_account_management.sql:71`
- `notify_maintenance_due` — `20260801090000_phase6.sql:402`
- `notify_recipients` — `20260801090000_phase6.sql:343`
- `notify_warranty_expiring` — `20260801090000_phase6.sql:366`
- `notify_weekly_backup` — `20260801090000_phase6.sql:444`
- `other_super_admins` — `20260731170000_account_management.sql:85`
- `run_daily_notifications` — `20260801090000_phase6.sql:472`
- `sync_asset_cover` — `20260811090000_asset_photo_gallery.sql:63`
- `validate_signature_strokes` — `20260731090000_ebast_signatures.sql:137`

#### Sembilan fungsi tanpa pernyataan hak akses apa pun

PostgreSQL memberikan `EXECUTE` kepada `PUBLIC` **secara bawaan** pada setiap
`CREATE FUNCTION`. Sembilan fungsi berikut tidak pernah dicabut, sehingga
secara formal dapat dieksekusi siapa saja yang memiliki `usage` pada schema
`public` — termasuk `anon`:

| Fungsi | Definisi | Risiko nyata |
| --- | --- | --- |
| `audit_row` | `20260731190000_fix_audit_search_path.sql:36` | Fungsi trigger — PostgreSQL menolak pemanggilan langsung |
| `forbid_mutation` | `20260729090000_init_schema.sql:278` | Fungsi trigger — idem |
| `link_auth_user_to_account` | `20260729100000_auth_session.sql:19` | Fungsi trigger — idem |
| `master_assert_entity` | `20260729130000_master_data_rpcs.sql:41` | IMMUTABLE, tanpa akses tabel; hanya memetakan teks |
| `master_label` | `20260729130000_master_data_rpcs.sql:36` | IMMUTABLE, hanya `initcap()` |
| `master_table` | `20260820090200_units_and_companies.sql:113` | IMMUTABLE, mengembalikan nama tabel sebagai teks |
| `set_updated_at` | `20260729090000_init_schema.sql:38` | Fungsi trigger — idem |
| `storage_asset_id` | `20260729170000_asset_photos_storage.sql:22` | IMMUTABLE, hanya mengurai path menjadi uuid |
| `storage_bast_asset_id` | `20260729200000_bast.sql:142` | SECURITY INVOKER — `anon` tidak punya grant pada `bast`, galatnya ditelan blok `exception` dan hasilnya null |

**Penilaian: tidak ada yang dapat dieksploitasi hari ini.** Empat adalah
fungsi trigger yang ditolak PostgreSQL bila dipanggil langsung; empat lagi
IMMUTABLE tanpa akses data; satu terakhir `SECURITY INVOKER` sehingga
kehilangan haknya sendiri saat dipanggil `anon`.

Yang tetap layak dicatat adalah **ketidakkonsistenannya**: 126 dari 135 fungsi
mendapat `revoke ... from public, anon, authenticated` yang eksplisit, dan
sembilan ini terlewat. Pola pertahanannya benar; penerapannya berlubang. Bila
kelak salah satu diubah menjadi `SECURITY DEFINER` — seperti yang pernah
terjadi pada `next_asset_code()` — lubang itu berubah dari laten menjadi
nyata tanpa ada yang mengubah barisnya.

---

## 3. Matriks izin: tabel × peran

Sel berisi operasi yang **benar-benar** dapat dijalankan peran itu terhadap
tabel itu, yaitu irisan `GRANT` (§2) dengan policy RLS (§1). Kondisi baris
ditulis di dalam sel.

Singkatan: **S**=SELECT, **I**=INSERT, **U**=UPDATE, **D**=DELETE.
`scope` = `location_id in (select my_location_ids())`; untuk Super Admin dan
Corporate IT scope berarti seluruh lokasi, untuk Site IT dan Viewer hanya
lokasinya sendiri (`20260729110000_fix_my_location_ids.sql:31-45`).

| Tabel | super_admin | corporate_it | site_it | viewer | anon |
| --- | --- | --- | --- | --- | --- |
| **Master data** — `locations`, `departments`, `categories`, `brands`, `models`, `vendors`, `asset_statuses`, `asset_conditions`, `units`, `companies` | S I U D | S I U | S | S | — |
| `assets` | S I U D<br>S dalam scope | S I U<br>dalam scope | S I U<br>dalam scope | S<br>dalam scope | — |
| `assignments` | S I U<br>via aset | S I U<br>via aset | S I U<br>via aset | S<br>via aset | — |
| `movements` | S I<br>via aset | S I<br>via aset | S I<br>via aset | S<br>via aset | — |
| `asset_status_changes` | S<br>via aset | S<br>via aset | S<br>via aset | S<br>via aset | — |
| `asset_photos` | S<br>via aset | S<br>via aset | S<br>via aset | S<br>via aset | — |
| `asset_tags` | S I U | S I U | S I U<br>**tanpa filter lokasi** | S<br>**seluruh lokasi** | — |
| `documents` | S I D<br>via aset | S I D<br>via aset | S I<br>via aset | S<br>via aset | — |
| `maintenance_records` | S I U<br>via aset | S I U<br>via aset | S I U<br>via aset | S<br>via aset | — |
| `accounts` | S<br>**seluruh baris** | S<br>**seluruh baris** | S<br>**seluruh baris** | S<br>**seluruh baris** | — |
| `account_scope_preferences` | S I U D<br>baris sendiri | idem | idem | idem | — |
| `bast` | S I U<br>via aset / lokasi | S I U | S I U | S<br>via aset / lokasi | — |
| `bast_versions` | S I<br>via BAST | S I<br>via BAST | S I<br>via BAST | S<br>via BAST | — |
| `bast_items` | S<br>via BAST | S<br>via BAST | S<br>via BAST | S<br>via BAST | — |
| `bast_signatures` | S<br>via BAST | S<br>via BAST | S<br>via BAST | S<br>via BAST | — |
| `bast_signatories` | S I U | S I U | S I U | S<br>**seluruh baris** | — |
| `accessories` | S I U D<br>dalam scope | S I U<br>dalam scope | S I U<br>dalam scope | S<br>dalam scope | — |
| `accessory_checkouts` | S I U<br>via perlengkapan | S I U | S I U | S<br>via perlengkapan | — |
| `notifications` | S U<br>kotak sendiri | idem | idem | idem | — |
| `import_batches` | S I | S I | I saja<br>**tidak dapat membaca** | — | — |
| `audit_log` | S | S | — | — | — |
| `asset_code_counters`, `bast_number_counters`, `tag_code_counters` | — | — | — | — | — |

### 3.1 Enam sel yang layak diperhatikan

1. **`accounts` — setiap peran membaca setiap baris.** Policy-nya
   `accounts_read for select using (true)`
   (`20260729090100_rls.sql:151`). Seorang Viewer dapat membaca `full_name`,
   `nik`, `email`, `phone`, dan `job_title` **seluruh 527 pegawai**. Ini
   disengaja — orang adalah sasaran penugasan, jadi picker harus dapat
   memuatnya — tetapi konsekuensinya adalah seluruh direktori pegawai
   terbuka bagi siapa pun yang punya akun, lewat PostgREST langsung tanpa
   melalui aplikasi. Lihat §5.4.
2. **`asset_tags` tidak disaring lokasi sama sekali.** `tags_read using
   (auth.uid() is not null)` dan `tags_update using (can_write_assets())`
   (`20260730080000_asset_tags.sql:280-282`). Bandingkan `assets_update` yang
   membawa `and location_id in (select my_location_ids())`. Lihat §5.3.
3. **`import_batches`: Site IT dapat menulis tetapi tidak dapat membaca.**
   `imports_write with check (can_write_assets())` mengizinkan tiga peran,
   sedangkan `imports_read using (my_role() in ('super_admin','corporate_it'))`
   hanya dua. Site IT yang menjalankan impor tidak akan pernah melihat
   hasilnya di riwayat.
4. **`documents`: Site IT dapat mengunggah tetapi tidak menghapus.**
   `documents_delete` meminta `super_admin` atau `corporate_it`.
5. **`bast_signatories` dapat dibaca Viewer seluruhnya** — `using (true)`.
   Daftar nama penanda tangan bukan data sensitif, tetapi polanya sama
   dengan `accounts`.
6. **Tiga tabel penghitung tertutup untuk semua peran**, termasuk Super
   Admin. Satu-satunya jalan masuk adalah fungsi `SECURITY DEFINER`.

---

## 4. Mekanisme append-only

Aturan kerja proyek menuntut penegakan **tiga lapis independen**: grant yang
tidak memberi UPDATE/DELETE, ketiadaan policy UPDATE/DELETE, dan trigger
`forbid_mutation()`. Alasannya ditulis di
`20260729120000_grants.sql:22-24`.

### 4.1 Lima tabel dengan ketiga lapis lengkap

| Tabel | Lapis 1 — grant/revoke | Lapis 2 — policy | Lapis 3 — trigger |
| --- | --- | --- | --- |
| `movements` | `grant select, insert` `grants.sql:59`; `revoke update, delete` `init_schema.sql:433` **dan** `grants.sql:83` | Hanya `movements_read` (SELECT) dan `movements_write` (INSERT) — `rls.sql:100-102`. Tidak ada policy UPDATE/DELETE | `movements_no_update` `init_schema.sql:281-282`; `movements_no_delete` `:283-284` |
| `bast_versions` | `grant select, insert` `grants.sql:60`; `revoke update, delete` `init_schema.sql:433` **dan** `grants.sql:83` | Hanya `bast_versions_read` dan `bast_versions_write` — `rls.sql:114-118` | `bast_versions_no_update` `init_schema.sql:339-340`; `bast_versions_no_delete` `:341-342` |
| `audit_log` | `grant select` `grants.sql:73`; `revoke update, delete` `init_schema.sql:433` **dan** `grants.sql:83` | Hanya `audit_read` (SELECT) — `rls.sql:139-140`. Tidak ada policy INSERT sekalipun | `audit_no_update` `init_schema.sql:428-429`; `audit_no_delete` `:430-431` |
| `bast_signatures` | `grant select` `ebast_signatures.sql:126`; `revoke insert, update, delete` `:127` | Hanya `bast_signatures_read` — `ebast_signatures.sql:121-122` | `bast_signatures_no_update` `:111-112`; `bast_signatures_no_delete` `:113-114` |
| `asset_status_changes` | `grant select` `status_changes.sql:60`; `revoke insert, update, delete` `:61` | Hanya `asset_status_changes_read` — `status_changes.sql:57-58` | `asset_status_changes_no_update` `:47-48`; `asset_status_changes_no_delete` `:49-50` |

Sepuluh trigger `forbid_mutation()` tersebar pada lima tabel ini, dua per
tabel (satu BEFORE UPDATE, satu BEFORE DELETE):

```sh
grep -rc "execute function forbid_mutation" supabase/migrations/*.sql \
  | awk -F: '{s+=$2} END {print s}'      # -> 10
```

### 4.2 `import_batches` — hanya dua lapis

**Ini jawaban atas pertanyaan Anda.** `import_batches` dikelompokkan sebagai
append-only oleh komentar di `20260729120000_grants.sql:57-58` ("Append-only:
SELECT + INSERT only. No UPDATE, no DELETE, ever.") dan diberi grant sempit
di baris 61. Tetapi:

| Lapis | Ada? | Bukti |
| --- | --- | --- |
| 1 — grant sempit | **Ya** | `grant select, insert on import_batches to authenticated` — `grants.sql:61` |
| 2 — tidak ada policy UPDATE/DELETE | **Ya** | Hanya `imports_read` dan `imports_write` — `rls.sql:186-188` |
| 3 — trigger penolak | **TIDAK ADA** | — |

Selain itu ia **tidak disebut** dalam kedua pernyataan `revoke update, delete`
yang memperkuat tiga tabel lain:

```sh
grep -rn "revoke update, delete" supabase/migrations/*.sql
# 2 hasil, keduanya menyebut hanya: audit_log, movements, bast_versions

grep -rn "import_batches" supabase/migrations/*.sql | grep -iE "trigger|revoke"
# -> tidak ada hasil
```

**Akibat praktisnya hari ini: tidak ada.** Tanpa grant UPDATE/DELETE,
`authenticated` tetap tidak dapat mengubah baris impor. Yang hilang adalah
kedalaman: dua tabel append-only lain menahan satu `grant` yang keliru,
`import_batches` tidak. Satu baris `grant update on import_batches to
authenticated` yang ditambahkan seseorang di kemudian hari akan langsung
membuka tabel itu, sementara pada `movements` baris yang sama akan tetap
ditolak trigger.

Menutupnya berarti satu migrasi baru berisi dua `create trigger` dan satu
`revoke`. Itu keputusan Anda.

### 4.3 Dua tabel yang tampak append-only tetapi memang bukan

| Tabel | Grant | Mengapa bukan append-only |
| --- | --- | --- |
| `bast_items` | `select` saja, sisanya dicabut `20260804140000_...:228` | Sengaja dapat diubah selama dokumen masih draf. Yang menahannya sesudah ditandatangani adalah penjaga status di dalam `set_bast_items()`, bukan trigger — dinyatakan eksplisit di `20260804140000_...:224-227` |
| `asset_photos` | `select` saja, sisanya dicabut `20260811090000_...:54` | Foto memang boleh dihapus; `remove_asset_photo()` menghapus baris dan menomori ulang sisanya |

Keduanya tetap hanya dapat ditulis lewat RPC, tetapi itu penegakan **aturan
kerja #2** (semua tulis lewat RPC), bukan append-only.

### 4.4 Ketegangan yang belum selesai pada `bast_versions`

`bast_versions.bast_id` memakai `on delete cascade`
(`20260729090000_init_schema.sql:327`), sementara tabel yang sama memasang
`bast_versions_no_delete` BEFORE DELETE yang memanggil `forbid_mutation()`.
Cascade akan mencoba menghapus, trigger akan menolak — sehingga baris `bast`
yang punya versi kemungkinan besar **tidak dapat dihapus sama sekali**.
Ini konsisten dengan keberadaan `void_bast()` sebagai jalur resmi.
`[BELUM TERVERIFIKASI — perilaku DELETE sesungguhnya; memerlukan database
berjalan. Yang dinyatakan di sini adalah pertentangan logis di DDL.]`

---

## 5. `src/auth/permissions.ts` dibandingkan dengan RLS sesungguhnya

### 5.1 Apa yang dibandingkan

`src/auth/permissions.ts:15-17` menyatakan maksudnya sendiri:

> "This table hides UI. It is NOT the security boundary — RLS in migration
> 0002 is. **Both must agree**; the RLS test in `tests/rls-site-it.mjs` proves
> the database half."

Bagian ini menguji kalimat "both must agree" itu. Dua arah ketidakcocokan
punya akibat yang sangat berbeda:

| Arah | Akibat |
| --- | --- |
| **UI mengizinkan, database menolak** | Cacat pengalaman pakai. Tombol tampil, ditekan, lalu memunculkan pesan galat. Tidak ada data bocor |
| **UI menyembunyikan, database mengizinkan** | Cacat keamanan yang lebih serius. Kendali disembunyikan tetapi datanya tetap terjangkau lewat PostgREST langsung, tanpa melalui aplikasi |

Perlu ditegaskan sejak awal: **tidak satu pun temuan di bawah adalah kebocoran
hak tulis.** Setiap RPC tulis memeriksa perannya sendiri, dan §2 menunjukkan
`anon` tidak punya hak apa pun. Yang ditemukan adalah tiga ketidakcocokan
arah pertama dan dua arah kedua.

### 5.2 Dua belas izin, satu per satu

| Izin | Peran di `permissions.ts` | Penegakan di database | Cocok? |
| --- | --- | --- | :-: |
| `asset.view` | keempat peran | `assets_read using (location_id in (select my_location_ids()))` — `rls.sql:75` | ✓ |
| `asset.create` | SA, CIT, SIT | `assets_write` `rls.sql:77-79`; `create_asset()` memanggil `can_write_assets()` — `20260807090000_...:75` | ✓ |
| `asset.edit` | SA, CIT, SIT | `assets_update` `rls.sql:81-83`; `update_asset()` SECURITY INVOKER sehingga RLS berlaku langsung | ✓ |
| `asset.delete` | SA saja | `assets_delete using (my_role() = 'super_admin')` `rls.sql:85`; `delete_asset()` mengulang `my_role() is distinct from 'super_admin'` — `20260803110000_...:32` | ✓ |
| `asset.editCode` | SA saja | `create_asset()` `:101` dan `update_asset()` `:336`, keduanya `my_r is distinct from 'super_admin'` | ✓ |
| `assignment.write` | SA, CIT, SIT | `assignments_write/update` lewat `can_write_assets()` `rls.sql:91-94`; `assign_asset()` `:57` | ✓ |
| `movement.write` | SA, CIT, SIT | `movements_write` `rls.sql:101-102`; `record_movement()` `:168` | ⚠ §5.3 |
| `bast.write` | SA, CIT, SIT | `bast_write/update` lewat `can_write_assets()`; `sign_bast()`, `set_bast_items()` | ✓ |
| `master.write` | SA, CIT | `<t>_insert` / `<t>_update with check (my_role() in ('super_admin','corporate_it'))` — `rls.sql:172-177` | ✓ |
| `master.delete` | SA saja | `<t>_delete using (my_role() = 'super_admin')` `rls.sql:178-179`; `master_delete()` SECURITY INVOKER sehingga RLS yang menegakkan | ✓ |
| `account.manage` | SA saja | `assert_can_manage_accounts()` `20260731170000_...:71-77`; grant tulis `accounts` dicabut `:325` | ✓ |
| `audit.view` | SA, CIT | `audit_read` `rls.sql:139-140`; `audit_list()` dan `audit_stats()` mengulang pemeriksaan | ✓ |

**Sebelas dari dua belas cocok persis.** Matriks peran itu sendiri sehat —
tidak ada peran yang diberi izin di UI yang ditolak database untuk operasi
yang sama, dan sebaliknya. Masalahnya bukan pada isi matriks, melainkan pada
**tempat matriks itu dipasang.**

### 5.3 Temuan 1 — `movement.write` tidak pernah diperiksa di mana pun

`movement.write` dideklarasikan sebagai tipe (`permissions.ts:29`) dan
diberikan kepada tiga peran (`:46`, `:58`, `:68`). Ia **tidak pernah dibaca**:

```sh
grep -rn "movement.write" app/ src/
# 4 hasil, seluruhnya di src/auth/permissions.ts — nol pemanggilan can()
```

Sepuluh izin lain dipanggil lewat `can(...)` di layar. Dua tidak:
`asset.view` (wajar — semua peran memilikinya) dan `movement.write`.

Akibatnya terlihat di layar Transfer:

| Fakta | Bukti |
| --- | --- |
| `app/(tabs)/transfer.tsx` tidak memanggil `usePermissions()` sama sekali | tidak ada `usePermissions`, `can(`, maupun `isReadOnly` di berkas itu |
| Ia mengimpor `recordMovement` | `app/(tabs)/transfer.tsx:39` |
| Ia memasang tombol kirim | `app/(tabs)/transfer.tsx:251`, memicu mutasi di `:106-107` |
| Database menolak Viewer | `record_movement()` — `20260729180000_assign_return_movement.sql:233`: `You do not have permission to move assets` |

Ini **arah pertama**: tombol tampil, database menolak. Tidak ada data yang
bocor, tetapi ia melanggar tujuan yang dinyatakan `usePermissions.ts:3-4`:

> "A Viewer must see no mutating buttons at all."

### 5.4 Temuan 2 — menu More membuka enam rute tanpa gerbang

`app/(tabs)/more.tsx` menyusun daftar menu. Empat entri terakhir dibungkus
pemeriksaan izin; enam entri sebelumnya tidak:

| Rute | Bergerbang? | Baris |
| --- | --- | --- |
| `/transfer` | **tidak** | `more.tsx:60` |
| `/labels` | **tidak** | `more.tsx:66` |
| `/maintenance` | **tidak** | `more.tsx:72` |
| `/reports` | **tidak** | `more.tsx:78` |
| `/accessories` | **tidak** | `more.tsx:84` |
| `/import` | **tidak** | `more.tsx:90` |
| `/import-employees` | `can('account.manage')` | `more.tsx:92` |
| `/master` | `can('master.write')` | `more.tsx:102` |
| `/accounts` | `can('account.manage')` | `more.tsx:112` |
| `/audit` | `can('audit.view')` | `more.tsx:122` |

Dari enam yang tidak bergerbang, lima tidak berbahaya dan satu bermasalah:

| Rute | Keadaan |
| --- | --- |
| `/labels` | Aman — menutup celahnya sendiri di dalam layar dengan `can('asset.create')` |
| `/accessories` | Aman — idem |
| `/import` | Aman — idem |
| `/maintenance` | Aman — layar baca-saja: hanya mengimpor `fetchMaintenance` dan `fetchMaintenanceStats` (`maintenance.tsx:25`), nol komponen `Button` |
| `/reports` | Aman — punya 4 tombol dan 2 mutasi, tetapi keduanya **ekspor berkas lokal**, bukan tulisan database: `exportCsv` menulis ke `Paths.cache` lalu memanggil `Sharing.shareAsync` (`reports.tsx:122-141`). Viewer hanya dapat mengekspor apa yang memang sudah boleh dilihatnya |
| `/transfer` | **Bermasalah.** Lihat §5.3 — tombol tulis database tanpa gerbang apa pun |

Jadi jalur lengkapnya untuk seorang Viewer: buka tab **More** → tekan
**Transfer** → isi formulir → tekan tombol → dapat pesan galat dari database.
Tidak ada satu pun langkah yang menghentikannya lebih awal.

Dasbor dan FAB **tidak** punya masalah ini: `app/(tabs)/index.tsx:171`
membungkus blok aksi cepat dengan `!isReadOnly`, dan
`app/(tabs)/_layout.tsx:132` menyembunyikan FAB dengan `showFab={!isReadOnly}`.
`isReadOnly` didefinisikan sebagai `!roleHas(role, 'asset.edit')`
(`usePermissions.ts:30`), yang benar untuk Viewer. Gerbangnya ada — hanya
tidak dipasang di menu More.

### 5.5 Temuan 3 — `asset_tags` tidak disaring lokasi di RLS

Ini **arah kedua**, dan yang paling patut diperiksa dari seluruh dokumen ini.

| Tabel | Policy UPDATE | Predikat lokasi? |
| --- | --- | --- |
| `assets` | `my_role() in (...) and location_id in (select my_location_ids())` — `rls.sql:81-83` | **ada** |
| `accessories` | `can_write_assets() and location_id in (select my_location_ids())` — `20260821090200_...:86-87` | **ada** |
| `asset_tags` | `can_write_assets()` — `20260730080000_asset_tags.sql:282` | **TIDAK ADA** |

`tags_read` juga hanya `auth.uid() is not null` (`:280`), sehingga setiap
pengguna yang masuk — termasuk Viewer — membaca **seluruh stok label di semua
lokasi**, bukan hanya lokasinya sendiri. Di lapisan RLS, seorang Site IT juga
dapat meng-UPDATE baris label milik lokasi lain.

Yang menahannya adalah lapisan di atasnya, bukan RLS:

- `assert_tag_location()` — `20260806090000_location_scoped_labels.sql`, memastikan stiker dan aset berada di lokasi yang sama
- `attach_tag()` memanggil `can_see_asset()` dan `can_write_assets()`
- `void_tag()` dan `tag_asset()` punya penjagaannya sendiri

Artinya label dijaga **satu lapis** (penjagaan di dalam RPC), sedangkan aset
dan perlengkapan dijaga **dua lapis** (RPC dan RLS). Selama seluruh tulisan
melewati RPC, perilakunya benar. Yang hilang adalah jaring pengaman: sebuah
`UPDATE` langsung ke `asset_tags` lewat PostgREST — yang grant-nya memang
ada (`grant select, insert, update`, `:284`) — akan lolos RLS.
`[BELUM TERVERIFIKASI — apakah UPDATE langsung semacam itu benar-benar
berhasil; membuktikannya memerlukan token Site IT terhadap stack yang
berjalan. Yang dinyatakan di sini adalah bahwa policy-nya tidak memuat
predikat lokasi.]`

### 5.6 Temuan 4 — `accounts` terbuka penuh bagi setiap peran

Arah kedua juga. `accounts_read for select using (true)` (`rls.sql:151`)
dipasangkan dengan `grant select on accounts to authenticated`.

Di UI, layar Accounts disembunyikan dari semua peran kecuali Super Admin —
`more.tsx:112` membungkusnya dengan `can('account.manage')`, dan izin itu
hanya dimiliki `super_admin` (`permissions.ts:50`). Tetapi penyembunyian itu
hanya berlaku di aplikasi. Seorang Viewer yang memegang token yang sah dapat
membaca seluruh baris `accounts` — nama lengkap, NIK, email, telepon, jabatan
— langsung lewat PostgREST.

Ini kemungkinan besar **disengaja**: setiap orang adalah sasaran penugasan,
dan picker "serahkan kepada siapa" harus dapat memuat daftarnya
(`assignable_employees()` memang `SECURITY INVOKER` dengan alasan itu,
`20260729180000_...:283-284`). Tetapi konsekuensinya perlu dinyatakan di
naskah, bukan dilewati: **direktori pegawai perusahaan dapat dibaca setiap
pemegang akun.** `.gitignore:33-40` menunjukkan kesadaran bahwa data ini
sensitif — berkas ekspornya sengaja tidak di-commit karena memuat nama, NIK,
jabatan, email, dan telepon seluruh pegawai. Data yang sama duduk di balik
`using (true)`.

Alternatifnya, bila kelak ingin diperketat: batasi kolom lewat view, atau
ganti policy menjadi `using (true)` hanya untuk kolom yang dibutuhkan picker.

### 5.7 Temuan 5 — dua ketidakcocokan kecil

**`delete_document()` lebih ketat daripada RLS-nya sendiri.**

| Lapisan | Peran yang diizinkan |
| --- | --- |
| Policy `documents_delete` — `rls.sql:126-127` | `super_admin`, `corporate_it` |
| RPC `delete_document()` — `20260801090000_phase6.sql:130` | `super_admin` saja |
| `permissions.ts` | **tidak ada izin dokumen sama sekali** |

Karena RPC-nya `SECURITY INVOKER`, keduanya berlaku dan yang paling ketat
menang: efektifnya Super Admin saja. Ketidakcocokan ini tidak berdampak hari
ini karena pembungkus `deleteDocument()` tidak pernah diimpor satu layar pun
(lihat [04-katalog-rpc.md](04-katalog-rpc.md) §Z.3) — tetapi bila kelak
dipasang, Corporate IT akan melihat kendali yang RPC-nya tolak.

**Perlengkapan tidak punya izin sendiri di UI.** Lima layar memakai
`can('asset.create')` sebagai pengganti: `accessories`, `accessory-edit`,
`labels`, `import`, dan `scan`. Untuk empat yang pertama pemetaannya kebetulan
benar (ketiga peran yang sama). Yang tidak terpetakan adalah penghapusan:
policy `accessories_delete` meminta `super_admin`
(`20260821090200_accessories.sql:88-89`) dan grant DELETE-nya ada (`:104`),
tetapi **tidak ada kendali hapus di layar mana pun dan tidak ada RPC
`delete_accessory`**:

```sh
grep -rn "delete_accessory\|deleteAccessory" supabase/migrations/ src/ app/   # -> kosong
```

Jadi ini kemampuan yang policy dan grant-nya ada tetapi tidak ada yang
menjalankannya — sisa yang tidak berbahaya, tetapi layak dibersihkan atau
dilengkapi.

### 5.8 Ringkasan untuk naskah

| # | Temuan | Arah | Berdampak keamanan? |
| ---: | --- | --- | --- |
| 1 | `movement.write` tidak pernah diperiksa; `/transfer` tanpa gerbang | UI mengizinkan, DB menolak | Tidak — cacat pengalaman pakai |
| 2 | Menu More membuka enam rute tanpa gerbang | UI mengizinkan, DB menolak | Tidak — satu di antaranya (`/transfer`) berujung galat |
| 3 | `asset_tags` tanpa predikat lokasi di RLS | UI menyembunyikan, DB mengizinkan | **Ya** — hilang satu lapis, bergantung penuh pada RPC |
| 4 | `accounts` `using (true)` | UI menyembunyikan, DB mengizinkan | **Ya** — direktori pegawai terbaca semua peran |
| 5 | `delete_document` lebih ketat dari RLS; perlengkapan memakai izin pinjaman | Campur | Tidak — keduanya tidak terjangkau UI |

Dua yang bertanda **Ya** adalah yang perlu dijawab di sidang, sebab keduanya
berarti aplikasi menampilkan gambaran keamanan yang lebih ketat daripada yang
sesungguhnya ditegakkan database. Keduanya **bukan** kebocoran hak tulis dan
**bukan** akses tanpa autentikasi — `anon` tetap nol (§2.1).

---

## 6. Daftar seluruh trigger

**35 trigger** pada 20 tabel, memanggil 5 fungsi.

```sh
grep -rcE "^[[:space:]]*create[[:space:]]+trigger" supabase/migrations/*.sql \
  | awk -F: '{s+=$2} END {print s}'      # -> 35
```

**Tidak satu pun trigger memakai klausa `WHEN`.** Seluruhnya `FOR EACH ROW`
tanpa penyaringan kondisional, sehingga kolom WHEN kosong untuk semuanya:

```sh
grep -rniE "create trigger" -A3 supabase/migrations/*.sql | grep -ci "when ("   # -> 0
```

| Nama | Tabel | Event | WHEN | Fungsi | Sumber |
| --- | --- | --- | :-: | --- | --- |
| `locations_set_updated_at` | `locations` | BEFORE UPDATE | — | `set_updated_at()` | `20260729090000_init_schema.sql:127` |
| `departments_set_updated_at` | `departments` | BEFORE UPDATE | — | `set_updated_at()` | `20260729090000_init_schema.sql:128` |
| `categories_set_updated_at` | `categories` | BEFORE UPDATE | — | `set_updated_at()` | `20260729090000_init_schema.sql:129` |
| `brands_set_updated_at` | `brands` | BEFORE UPDATE | — | `set_updated_at()` | `20260729090000_init_schema.sql:130` |
| `models_set_updated_at` | `models` | BEFORE UPDATE | — | `set_updated_at()` | `20260729090000_init_schema.sql:131` |
| `vendors_set_updated_at` | `vendors` | BEFORE UPDATE | — | `set_updated_at()` | `20260729090000_init_schema.sql:132` |
| `accounts_set_updated_at` | `accounts` | BEFORE UPDATE | — | `set_updated_at()` | `20260729090000_init_schema.sql:159` |
| `assets_set_updated_at` | `assets` | BEFORE UPDATE | — | `set_updated_at()` | `20260729090000_init_schema.sql:202` |
| `bast_set_updated_at` | `bast` | BEFORE UPDATE | — | `set_updated_at()` | `20260729090000_init_schema.sql:323` |
| `maintenance_set_updated_at` | `maintenance_records` | BEFORE UPDATE | — | `set_updated_at()` | `20260729090000_init_schema.sql:380-381` |
| `bast_signatories_set_updated_at` | `bast_signatories` | BEFORE UPDATE | — | `set_updated_at()` | `20260731090000_ebast_signatures.sql:71-72` |
| `movements_no_update` | `movements` | BEFORE UPDATE | — | `forbid_mutation()` | `20260729090000_init_schema.sql:281-282` |
| `movements_no_delete` | `movements` | BEFORE DELETE | — | `forbid_mutation()` | `20260729090000_init_schema.sql:283-284` |
| `bast_versions_no_update` | `bast_versions` | BEFORE UPDATE | — | `forbid_mutation()` | `20260729090000_init_schema.sql:339-340` |
| `bast_versions_no_delete` | `bast_versions` | BEFORE DELETE | — | `forbid_mutation()` | `20260729090000_init_schema.sql:341-342` |
| `audit_no_update` | `audit_log` | BEFORE UPDATE | — | `forbid_mutation()` | `20260729090000_init_schema.sql:428-429` |
| `audit_no_delete` | `audit_log` | BEFORE DELETE | — | `forbid_mutation()` | `20260729090000_init_schema.sql:430-431` |
| `bast_signatures_no_update` | `bast_signatures` | BEFORE UPDATE | — | `forbid_mutation()` | `20260731090000_ebast_signatures.sql:111-112` |
| `bast_signatures_no_delete` | `bast_signatures` | BEFORE DELETE | — | `forbid_mutation()` | `20260731090000_ebast_signatures.sql:113-114` |
| `asset_status_changes_no_update` | `asset_status_changes` | BEFORE UPDATE | — | `forbid_mutation()` | `20260731140000_status_changes.sql:47-48` |
| `asset_status_changes_no_delete` | `asset_status_changes` | BEFORE DELETE | — | `forbid_mutation()` | `20260731140000_status_changes.sql:49-50` |
| `assets_audit` | `assets` | AFTER INSERT OR UPDATE OR DELETE | — | `audit_row('asset_created','asset_updated')` | `20260729090000_init_schema.sql:456-457` |
| `assignments_audit` | `assignments` | AFTER INSERT OR UPDATE | — | `audit_row('assignment_created','assignment_returned')` | `20260729090000_init_schema.sql:458-459` |
| `movements_audit` | `movements` | AFTER INSERT | — | `audit_row('movement_recorded','movement_recorded')` | `20260729090000_init_schema.sql:460-461` |
| `bast_audit` | `bast` | AFTER INSERT OR UPDATE | — | `audit_row('bast_generated','bast_signed')` | `20260729090000_init_schema.sql:462-463` |
| `maintenance_audit` | `maintenance_records` | AFTER INSERT OR UPDATE | — | `audit_row('maintenance_updated','maintenance_updated')` | `20260729090000_init_schema.sql:464-465` |
| `accounts_audit` | `accounts` | AFTER INSERT OR UPDATE | — | `audit_row('account_created','account_updated')` | `20260729090000_init_schema.sql:466-467` |
| `asset_tags_audit` | `asset_tags` | AFTER INSERT OR UPDATE | — | `audit_row('asset_created','asset_updated')` | `20260730080000_asset_tags.sql:59-60` |
| `bast_signatories_audit` | `bast_signatories` | AFTER INSERT OR UPDATE | — | `audit_row('master_created','master_updated')` | `20260731090000_ebast_signatures.sql:74-75` |
| `bast_signatures_audit` | `bast_signatures` | AFTER INSERT | — | `audit_row('bast_signed','bast_signed')` | `20260731090000_ebast_signatures.sql:116-117` |
| `asset_status_changes_audit` | `asset_status_changes` | AFTER INSERT | — | `audit_row('status_changed','status_changed')` | `20260731140000_status_changes.sql:52-53` |
| `accessories_audit` | `accessories` | AFTER INSERT OR UPDATE | — | `audit_row('accessory_created','accessory_updated')` | `20260821090200_accessories.sql:108-109` |
| `accessory_checkouts_audit` | `accessory_checkouts` | AFTER INSERT OR UPDATE | — | `audit_row('accessory_assigned','accessory_returned')` | `20260821090200_accessories.sql:110-111` |
| `asset_photos_cover` | `asset_photos` | AFTER INSERT OR UPDATE OR DELETE | — | `sync_asset_cover()` | `20260811090000_asset_photo_gallery.sql:76-78` |
| `auth_user_created` | `auth.users` | AFTER INSERT | — | `link_auth_user_to_account()` | `20260729100000_auth_session.sql:31-33` |

Jumlah baris: **35**.

### 6.1 Sebaran per fungsi

| Fungsi | Trigger | Tabel |
| --- | ---: | ---: |
| `audit_row()` | 12 | 12 |
| `set_updated_at()` | 11 | 11 |
| `forbid_mutation()` | 10 | 5 (dua per tabel) |
| `sync_asset_cover()` | 1 | 1 |
| `link_auth_user_to_account()` | 1 | 1 (`auth.users`) |
| **Total** | **35** | |

### 6.2 Tiga catatan

1. **`assets_audit` satu-satunya yang menangkap DELETE.** Sebelas trigger
   audit lain hanya `AFTER INSERT OR UPDATE`, sehingga penghapusan pada tabel
   selain `assets` tidak menghasilkan baris audit dari trigger. Itulah
   sebabnya `delete_account()`, `delete_bast()`, dan `void_bast()` menulis
   sendiri ke `audit_log` — lihat [04-katalog-rpc.md](04-katalog-rpc.md) §ZZ.1.
2. **`auth_user_created` satu-satunya trigger di luar schema `public`.** Ia
   duduk di `auth.users`, tabel milik Supabase. Ini juga jalur yang pernah
   menjatuhkan sistem: `audit_row()` tanpa `set search_path` gagal ketika
   pemanggilnya GoTrue, dan pencabutan login berakhir dengan `Database error
   deleting user`. Diperbaiki di
   `20260731190000_fix_audit_search_path.sql`.
3. **`asset_tags_audit` memakai ulang aksi `asset_created`/`asset_updated`.**
   Entri audit untuk label karena itu tidak dapat dibedakan dari entri untuk
   aset kecuali lewat kolom `table_name`. Bandingkan `accessories_audit` yang
   mendapat nilai enum sendiri.

---

## 7. Ringkasan hal yang belum terverifikasi

| # | Butir | Cara menutupnya |
| ---: | --- | --- |
| 1 | Nama policy master data hasil `format('%I')` | `select policyname from pg_policies` pada database berjalan |
| 2 | Apakah UPDATE langsung ke `asset_tags` oleh Site IT lintas lokasi benar-benar lolos (§5.5) | Uji dengan token Site IT terhadap stack lokal |
| 3 | Perilaku DELETE pada `bast` yang punya `bast_versions` (§4.4) | Jalankan DELETE pada stack lokal |
| 4 | Apakah 9 fungsi tanpa revoke benar-benar dapat dipanggil `anon` (§2.4) | Panggil lewat PostgREST dengan anon key |
| 5 | Apakah `tests/rls-site-it.mjs` sudah menguji §5.5 dan §5.6 | Baca dan jalankan suite itu |

Butir 5 paling murah dan paling berharga: repositori sudah punya
`tests/rls-site-it.mjs` yang menurut `permissions.ts:16-17` ada justru untuk
"prove the database half". Menjalankannya akan menjawab butir 2 sekaligus
menunjukkan apakah kedua temuan arah-kedua sudah tercakup uji atau belum.
