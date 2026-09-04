# 02 — Kamus Data CITE Assets

Hasil Fase 2: rekonstruksi skema akhir dari seluruh 61 berkas di
`supabase/migrations/`, dibaca berurutan menurut nama berkas (timestamp).

**Tanggal ekstraksi:** 2026-08-31
**Revisi:** working tree di atas commit `cd0d9f3` (termasuk migrasi
`20260831090000_audit_targets.sql` yang belum di-commit)
**Jumlah tabel:** 33 — lihat [01-inventaris.md §6.1](01-inventaris.md) untuk
perintah hitungnya

---

## 0. Cara membaca dokumen ini

### 0.1 Skema akhir, bukan skema migrasi pertama

Migrasi bersifat aditif. Kolom yang ditambahkan migrasi belakangan **sudah
digabungkan** ke tabel kolom masing-masing entitas, dan kolom hasil penambahan
diberi tanda migrasi asalnya di kolom Keterangan. Contoh: `assets` dalam dokumen
ini punya 25 kolom, sedangkan `create table assets` di
`supabase/migrations/20260729090000_init_schema.sql:175-200` hanya
mendefinisikan 23 — dua sisanya datang dari migrasi 2026-08-20 dan 2026-08-21.

Seluruh perubahan kolom di sepanjang sejarah repositori berjumlah 19 pernyataan
dan dapat diperiksa dengan:

```sh
grep -rniE "(add[[:space:]]+column|add[[:space:]]+constraint|alter[[:space:]]+column|drop[[:space:]]+constraint|drop[[:space:]]+column)" \
  supabase/migrations/*.sql
```

Tidak ada satu pun `drop column` dan tidak ada satu pun `drop table` di seluruh
repositori, sehingga tidak ada kolom atau tabel yang hilang di tengah jalan.

### 0.2 Batasan metodologis

**Seluruh isi dokumen ini dibaca dari DDL, bukan dari katalog sistem
PostgreSQL.** Tidak ada instance database yang berjalan selama ekstraksi. Tiga
konsekuensi yang perlu Anda ketahui sebelum mengutip:

1. **Nama CHECK constraint yang tidak ditulis eksplisit tidak dapat saya
   pastikan.** Sebagian CHECK di repositori ini ditulis tanpa `constraint <nama>`,
   sehingga PostgreSQL yang menamainya. Untuk kasus itu saya menuliskan
   ekspresinya (terverifikasi, dikutip dari berkas) dan menandai namanya
   `[nama dibuat PostgreSQL — tidak tertulis di DDL]`. Saya **tidak** menebak
   nama seperti `assets_check`, karena penomoran PostgreSQL bergantung pada
   urutan dan tabrakan nama yang hanya terlihat di `pg_constraint`.
2. **Index dan constraint bawaan yang dibuat PostgreSQL sendiri tidak
   didaftar** — index unik di balik setiap PRIMARY KEY dan setiap `unique`,
   serta sequence di balik `bigserial`.
3. Objek di schema `auth`, `storage`, dan `realtime` milik Supabase berada di
   luar cakupan, kecuali satu trigger di `auth.users` yang disebut di §2.1
   karena ia yang menyambungkan Auth ke tabel `accounts`.

### 0.3 Konvensi yang berlaku di seluruh skema

Diverifikasi dengan membaca seluruh definisi FK; disebutkan sekali di sini agar
tidak diulang 100 kali di bawah:

- **`ON UPDATE` tidak pernah ditulis pada satu pun foreign key.** Seluruh FK
  karenanya memakai perilaku bawaan PostgreSQL, yaitu `NO ACTION`. Kolom
  "ON UPDATE" pada tabel-tabel di bawah diisi `NO ACTION (bawaan)` untuk semua
  baris — ini fakta tentang seluruh skema, bukan pengulangan.

  ```sh
  grep -rniE "on[[:space:]]+update" supabase/migrations/*.sql | grep -i references
  # -> tidak ada hasil
  ```

- **Semua primary key bertipe `uuid` dengan `default gen_random_uuid()`**,
  kecuali empat tabel: `audit_log` (`bigserial`), `bast_number_counters`
  (`year int`), `tag_code_counters` (`prefix text`), dan dua tabel berkunci
  komposit (`account_scope_preferences`, `asset_code_counters`).
- **`gen_random_uuid()` berasal dari extension `pgcrypto`**, dan pencarian ILIKE
  cepat dari `pg_trgm`; keduanya dipasang di
  `supabase/migrations/20260729090000_init_schema.sql:17-18`.
- **Tipe waktu selalu `timestamptz`**, tanggal selalu `date`, uang selalu
  `numeric(16,2)`.

### 0.4 Tiga fungsi trigger yang dipakai berulang

| Fungsi | Definisi | Perannya |
| --- | --- | --- |
| `set_updated_at()` | `20260729090000_init_schema.sql:38-42` | `new.updated_at := now()` pada BEFORE UPDATE |
| `forbid_mutation()` | `20260729090000_init_schema.sql:278-279` | `raise exception 'This table is append-only'` — dipasang BEFORE UPDATE dan BEFORE DELETE pada tabel append-only |
| `audit_row()` | `20260729090000_init_schema.sql:437-454` | SECURITY DEFINER; menulis satu baris ke `audit_log`. Dua argumen trigger: `tg_argv[0]` dipakai saat INSERT, `tg_argv[1]` saat UPDATE/DELETE (`:441-443`) |

`audit_row()` mengambil aktor dari view `v_me`
(`20260729090000_init_schema.sql:169-170`, `:440`) dan merekam `device` serta
`ip_address` dari header permintaan PostgREST (`:451-452`).

---

## 1. Modul Master Data

Sepuluh tabel. Catatan yang berlaku untuk seluruh modul ini, dikutip dari
`20260729090000_init_schema.sql:134-136`:

> "every FK into master data is `on delete restrict`, so deleting a referenced
> record raises 23503. The API layer catches it and returns 'Cannot delete
> \<name\> — still used by n assets'. Prefer `is_active = false`."

### 1.1 `locations`

**Peran:** daftar lokasi fisik (Head Office dan Site) yang menjadi sumbu utama
seluruh Row-Level Security dan sekaligus memasok kop surat BAST.
**Migrasi asal:** `20260729090000_init_schema.sql:47-56`
**Diperluas oleh:** `20260804140000_bast_documents_and_maintenance_status.sql:160-163`,
`20260806090000_location_scoped_labels.sql:45`,
`20260806110000_asset_code_format.sql:54`

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `code` | text | NO | — | `'HO'`, `'SITE'` (`:49`) |
| `name` | text | NO | — | `'Head Office'`, `'Site'` (`:50`) |
| `kind` | location_kind | NO | — | enum, §6.2 |
| `city` | text | YES | — | |
| `is_active` | boolean | NO | `true` | |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | |
| `company_name` | text | YES | — | Ditambahkan `20260804140000:160`. Diisi `'PT. Stargate Pasific Resources'` oleh UPDATE di `:165-178` |
| `office_label` | text | YES | — | Ditambahkan `20260804140000:161`. HO → `'Head Office Jakarta Selatan'`, selain itu `'Site Konawe Utara'` (`:167-170`) |
| `signing_city` | text | YES | — | Ditambahkan `20260804140000:162`. Kota penandatanganan pada BAST |
| `address_line` | text | YES | — | Ditambahkan `20260804140000:163`. Alamat terdaftar, sama di semua lokasi (`:175-178`) |
| `tag_prefix` | text | YES | — | Ditambahkan `20260806090000:45`. HO → `'CTH'`, SITE → `'CTS'`, lainnya `'CT' \|\| upper(left(code,1))` (`:47-56`) |
| `company_code` | text | YES | — | Ditambahkan `20260806110000:54`. Diisi `'SPR'` untuk semua baris (`:56`) |

**Primary key:** `(id)`
**Foreign key:** tidak ada FK keluar.
**Unique constraint:** `code` (inline, `:49`)
**Index:**

| Nama | Definisi | Sumber |
| --- | --- | --- |
| `locations_tag_prefix_key` | `unique index on locations (upper(tag_prefix)) where tag_prefix is not null` | `20260806090000:60-61` |

Index parsial di atas adalah satu-satunya penjamin bahwa dua lokasi tidak
berbagi prefix label; alasannya ditulis di `20260806090000:58-59`.

**CHECK constraint:** tidak ada.
**Trigger:**

| Nama | Waktu | Fungsi | Sumber |
| --- | --- | --- | --- |
| `locations_set_updated_at` | BEFORE UPDATE, FOR EACH ROW | `set_updated_at()` | `init_schema:127` |

### 1.2 `departments`

**Peran:** daftar departemen/divisi, dipakai sebagai atribut orang maupun aset.
**Migrasi asal:** `20260729090000_init_schema.sql:58-65`

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `name` | text | NO | — | unique |
| `code` | text | YES | — | unique |
| `is_active` | boolean | NO | `true` | |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | |

**Primary key:** `(id)`
**Foreign key:** tidak ada FK keluar.
**Unique constraint:** `name` (`:60`), `code` (`:61`)
**Index:** `departments_name_trgm` — `gin (name gin_trgm_ops)`,
`20260803090000_audit_and_delete.sql:285`
**CHECK constraint:** tidak ada.
**Trigger:** `departments_set_updated_at` BEFORE UPDATE → `set_updated_at()`
(`init_schema:128`)

### 1.3 `categories`

**Peran:** kategori aset (Laptop, Desktop, Monitor, dan seterusnya) yang kodenya
menjadi awalan kode aset.
**Migrasi asal:** `20260729090000_init_schema.sql:67-75`

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `name` | text | NO | — | unique. Laptop, Desktop, Monitor… (`:69`) |
| `code` | text | NO | — | unique. LPT, DSK, MON, PRN, SRV, NET, ACC (`:70`) |
| `icon` | text | YES | — | nama icon lucide (`:71`) |
| `is_active` | boolean | NO | `true` | |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | |

**Primary key:** `(id)`
**Foreign key:** tidak ada FK keluar.
**Unique constraint:** `name` (`:69`), `code` (`:70`)
**Index:** tidak ada index tambahan.
**CHECK constraint:** tidak ada.
**Trigger:** `categories_set_updated_at` BEFORE UPDATE → `set_updated_at()`
(`init_schema:129`)

### 1.4 `brands`

**Peran:** merek perangkat.
**Migrasi asal:** `20260729090000_init_schema.sql:77-83`

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `name` | text | NO | — | unique |
| `is_active` | boolean | NO | `true` | |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | |

**Primary key:** `(id)`
**Foreign key:** tidak ada FK keluar.
**Unique constraint:** `name` (`:79`)
**Index:** `brands_name_trgm` — `gin (name gin_trgm_ops)`,
`20260803090000:282`
**CHECK constraint:** tidak ada.
**Trigger:** `brands_set_updated_at` BEFORE UPDATE → `set_updated_at()`
(`init_schema:130`)

### 1.5 `models`

**Peran:** model perangkat, selalu milik satu merek.
**Migrasi asal:** `20260729090000_init_schema.sql:85-94`

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `brand_id` | uuid | NO | — | FK → `brands` |
| `category_id` | uuid | YES | — | FK → `categories` |
| `name` | text | NO | — | unik per merek, bukan unik global |
| `is_active` | boolean | NO | `true` | |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | |

**Primary key:** `(id)`
**Foreign key:**

| Kolom | Tabel tujuan | ON DELETE | ON UPDATE | Sumber |
| --- | --- | --- | --- | --- |
| `brand_id` | `brands(id)` | RESTRICT | NO ACTION (bawaan) | `:87` |
| `category_id` | `categories(id)` | SET NULL | NO ACTION (bawaan) | `:88` |

**Unique constraint:** `(brand_id, name)` (`:93`) — dua merek boleh punya model
bernama sama.
**Index:** `models_name_trgm` — `gin (name gin_trgm_ops)`, `20260803090000:283`
**CHECK constraint:** tidak ada.
**Trigger:** `models_set_updated_at` BEFORE UPDATE → `set_updated_at()`
(`init_schema:131`)

### 1.6 `vendors`

**Peran:** pemasok dan pihak yang mengerjakan perbaikan.
**Migrasi asal:** `20260729090000_init_schema.sql:96-106`

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `name` | text | NO | — | unique |
| `contact_person` | text | YES | — | |
| `phone` | text | YES | — | |
| `email` | text | YES | — | |
| `address` | text | YES | — | |
| `is_active` | boolean | NO | `true` | |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | |

**Primary key:** `(id)`
**Foreign key:** tidak ada FK keluar.
**Unique constraint:** `name` (`:98`)
**Index:** tidak ada index tambahan.
**CHECK constraint:** tidak ada.
**Trigger:** `vendors_set_updated_at` BEFORE UPDATE → `set_updated_at()`
(`init_schema:132`)

### 1.7 `asset_statuses`

**Peran:** status aset (Available, Assigned, Maintenance, Broken, Lost, Retired)
beserta warna badge dan penanda status terminal.
**Migrasi asal:** `20260729090000_init_schema.sql:109-116`

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `name` | text | NO | — | unique |
| `color` | text | NO | — | hex badge, mengacu tabel token di README (`:112`) |
| `is_terminal` | boolean | NO | `false` | Retired / Lost (`:113`) |
| `sort_order` | int | NO | `0` | |
| `is_active` | boolean | NO | `true` | |

**Primary key:** `(id)`
**Foreign key:** tidak ada FK keluar.
**Unique constraint:** `name` (`:111`)
**Index:** tidak ada index tambahan.
**CHECK constraint:** tidak ada.
**Trigger:** **tidak ada.**

> **Menyimpang dari konvensi.** Tabel ini tidak punya `created_at` maupun
> `updated_at`, sehingga juga tidak punya trigger `set_updated_at`. Lihat §8.2.

### 1.8 `asset_conditions`

**Peran:** kondisi fisik aset (Good, Fair, Poor).
**Migrasi asal:** `20260729090000_init_schema.sql:119-125`

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `name` | text | NO | — | unique |
| `color` | text | NO | — | hex badge |
| `sort_order` | int | NO | `0` | |
| `is_active` | boolean | NO | `true` | |

**Primary key:** `(id)`
**Foreign key:** tidak ada FK keluar.
**Unique constraint:** `name` (`:121`)
**Index:** tidak ada index tambahan.
**CHECK constraint:** tidak ada.
**Trigger:** **tidak ada.** Sama seperti `asset_statuses` — lihat §8.2.

### 1.9 `units`

**Peran:** unit alat berat atau kendaraan (misalnya dump truck) tempat sebuah
aset dapat dipasang; sengaja dipisah dari `locations` agar tidak masuk ke
selector scope dan ke kop surat BAST.
**Migrasi asal:** `20260820090200_units_and_companies.sql:42-50`

Alasan pemisahan dikutip dari `20260820090200:25-27`:

> "Putting DT-042 in there would put a dump truck in the scope selector and on
> the letterhead of a handover note. Hence a table of its own, carrying a
> `location_id` instead."

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `code` | text | NO | — | unique. `'DT-042'` (`:44`) |
| `name` | text | NO | — | `'Dump Truck Komatsu HD465 #42'` (`:45`) |
| `location_id` | uuid | NO | — | FK → `locations` |
| `is_active` | boolean | NO | `true` | |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | **tidak pernah diperbarui otomatis** — §8.1 |

**Primary key:** `(id)`
**Foreign key:**

| Kolom | Tabel tujuan | ON DELETE | ON UPDATE | Sumber |
| --- | --- | --- | --- | --- |
| `location_id` | `locations(id)` | RESTRICT | NO ACTION (bawaan) | `:46` |

**Unique constraint:** `code` (`:44`)
**Index:** tidak ada index tambahan pada tabel ini. (Index `assets_unit_idx` ada
di `assets`, bukan di sini — `20260820090200:73`.)
**CHECK constraint:** tidak ada.
**Trigger:** **tidak ada** — lihat §8.1.

### 1.10 `companies`

**Peran:** badan hukum tempat seorang pegawai bernaung; ada karena 527 orang
hasil ekspor Odoo tersebar di tiga entitas dan `accounts` belum punya kolomnya.
**Migrasi asal:** `20260820090200_units_and_companies.sql:52-59`

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `name` | text | NO | — | unique |
| `code` | text | NO | — | unique. SPR, SMA, RSL (`:55`) |
| `is_active` | boolean | NO | `true` | |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | **tidak pernah diperbarui otomatis** — §8.1 |

**Primary key:** `(id)`
**Foreign key:** tidak ada FK keluar.
**Unique constraint:** `name` (`:54`), `code` (`:55`)
**Index:** tidak ada index tambahan.
**CHECK constraint:** tidak ada.
**Trigger:** **tidak ada** — lihat §8.1.

**Data awal** (bukan skema, tetapi di-seed oleh migrasi yang sama,
`20260820090200:61-65`): `PT Stargate Pasific Resources` / SPR,
`PT Stargate Mineral Asia` / SMA, `PT Rajawali Sigi Lestari` / RSL. Nama dieja
persis seperti ekspor Odoo — "PT" tanpa titik — dengan alasan yang ditulis di
`:34-36`.

---

## 2. Modul Inti

Dua belas tabel: orang, aset, dan seluruh riwayat yang menempel pada aset.

### 2.1 `accounts`

**Peran:** seorang manusia yang dapat memegang aset; belum tentu seorang
pengguna yang dapat login.
**Migrasi asal:** `20260729090000_init_schema.sql:141-157`
**Diperluas oleh:** `20260804140000:150`, `20260820090200:71`

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `auth_user_id` | uuid | YES | — | unique. FK → `auth.users`. null ketika `can_login = false` (`:143`) |
| `full_name` | text | NO | — | |
| `nik` | text | YES | — | unique. Nomor pegawai, mis. `'20481'` (`:145`) |
| `email` | text | YES | — | unique |
| `phone` | text | YES | — | |
| `department_id` | uuid | YES | — | FK → `departments` |
| `location_id` | uuid | YES | — | FK → `locations` |
| `can_login` | boolean | NO | `false` | |
| `role` | user_role | YES | — | wajib ketika `can_login` (`:151`, ditegakkan CHECK) |
| `is_active` | boolean | NO | `true` | |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | |
| `created_by` | uuid | YES | — | FK → `accounts` (self-reference) |
| `job_title` | text | YES | — | Ditambahkan `20260804140000:150`. Jabatan, dicetak terpisah dari Dept./Divisi pada BAST (`:147-148`) |
| `company_id` | uuid | YES | — | Ditambahkan `20260820090200:71`. FK → `companies` |

**Primary key:** `(id)`
**Foreign key:**

| Kolom | Tabel tujuan | ON DELETE | ON UPDATE | Sumber |
| --- | --- | --- | --- | --- |
| `auth_user_id` | `auth.users(id)` | SET NULL | NO ACTION (bawaan) | `:143` |
| `department_id` | `departments(id)` | SET NULL | NO ACTION (bawaan) | `:148` |
| `location_id` | `locations(id)` | SET NULL | NO ACTION (bawaan) | `:149` |
| `created_by` | `accounts(id)` | **tidak ditulis → NO ACTION** | NO ACTION (bawaan) | `:155` |
| `company_id` | `companies(id)` | RESTRICT | NO ACTION (bawaan) | `20260820090200:71` |

**Unique constraint:** `auth_user_id` (`:143`), `nik` (`:145`), `email` (`:146`)
**Index:**

| Nama | Definisi | Sumber |
| --- | --- | --- |
| `accounts_name_trgm` | `gin (full_name gin_trgm_ops)` | `20260803090000:284` |
| `accounts_company_idx` | `(company_id)` | `20260820090200:74` |

**CHECK constraint:**

| Nama | Ekspresi | Sumber |
| --- | --- | --- |
| `role_required_when_login` | `(not can_login or role is not null)` | `:156` |

**Trigger:**

| Nama | Waktu | Fungsi | Sumber |
| --- | --- | --- | --- |
| `accounts_set_updated_at` | BEFORE UPDATE, FOR EACH ROW | `set_updated_at()` | `init_schema:159` |
| `accounts_audit` | AFTER INSERT OR UPDATE, FOR EACH ROW | `audit_row('account_created','account_updated')` | `init_schema:466-467` |

**Trigger di tabel lain yang menulis ke sini.** Satu-satunya trigger di
repositori ini yang dipasang di luar schema `public`:

| Nama | Tabel | Waktu | Fungsi | Sumber |
| --- | --- | --- | --- | --- |
| `auth_user_created` | `auth.users` | AFTER INSERT, FOR EACH ROW | `link_auth_user_to_account()` | `20260729100000_auth_session.sql:31-33` |

Fungsi itu mencocokkan `auth.users.email` dengan `accounts.email` secara
case-insensitive dan hanya mengisi baris yang `auth_user_id is null and
can_login` (`20260729100000:22-27`). Artinya akun harus **sudah ada** sebelum
kredensial diterbitkan — self-service signup dimatikan di
`supabase/config.toml:34`.

### 2.2 `account_scope_preferences`

**Peran:** scope lokasi pilihan tiap pengguna, disimpan server-side agar
aplikasi terbuka dengan scope yang sama di semua perangkat.
**Migrasi asal:** `20260729090000_init_schema.sql:162-166`

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `account_id` | uuid | NO | — | FK → `accounts`; bagian PK |
| `location_id` | uuid | NO | — | FK → `locations`; bagian PK |

**Primary key:** `(account_id, location_id)` — komposit (`:165`)
**Foreign key:**

| Kolom | Tabel tujuan | ON DELETE | ON UPDATE | Sumber |
| --- | --- | --- | --- | --- |
| `account_id` | `accounts(id)` | CASCADE | NO ACTION (bawaan) | `:163` |
| `location_id` | `locations(id)` | CASCADE | NO ACTION (bawaan) | `:164` |

**Unique constraint:** tidak ada di luar PK.
**Index:** tidak ada index tambahan.
**CHECK constraint:** tidak ada.
**Trigger:** tidak ada.

> Preferensi ini **bukan** batas keamanan. `bootstrap_session()` memotongnya
> dengan hasil `my_location_ids()` sebelum dipakai, sehingga Site IT tidak dapat
> memperlebar scope-nya dengan menyunting baris di sini
> (`20260729100000_auth_session.sql:60-66`).

### 2.3 `assets`

**Peran:** register aset — tabel pusat sistem ini.
**Migrasi asal:** `20260729090000_init_schema.sql:175-200`
**Diperluas oleh:** `20260820090200:70`, `20260821090500:31`

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `asset_code` | text | NO | — | unique. `'LPT045-24-118'` (`:177`) |
| `name` | text | NO | — | |
| `category_id` | uuid | NO | — | FK → `categories` |
| `brand_id` | uuid | YES | — | FK → `brands` |
| `model_id` | uuid | YES | — | FK → `models` |
| `serial_number` | text | NO | — | unique |
| `vendor_id` | uuid | YES | — | FK → `vendors` |
| `purchase_date` | date | YES | — | |
| `purchase_price` | numeric(16,2) | YES | — | IDR, tanpa desimal di UI (`:185`) |
| `warranty_start` | date | YES | — | |
| `warranty_end` | date | YES | — | |
| `department_id` | uuid | YES | — | FK → `departments` |
| `location_id` | uuid | NO | — | FK → `locations`. Kolom yang seluruh RLS aset bersandar padanya |
| `assigned_to` | uuid | YES | — | FK → `accounts`. Denormalisasi pemegang aktif |
| `status_id` | uuid | NO | — | FK → `asset_statuses` |
| `condition_id` | uuid | NO | — | FK → `asset_conditions` |
| `specifications` | jsonb | NO | `'[]'` | `[{"key":"Processor","value":"Intel Core i7-1355U"}]` (`:193`) |
| `notes` | text | YES | — | |
| `photo_path` | text | YES | — | Sampul; **diisi trigger**, bukan oleh pemanggil — §2.8 |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | |
| `created_by` | uuid | YES | — | FK → `accounts` |
| `unit_id` | uuid | YES | — | Ditambahkan `20260820090200:70`. FK → `units` |
| `assigned_to_secondary` | uuid | YES | — | Ditambahkan `20260821090500:31`. FK → `accounts`. Pemegang kedua; ada agar `search_assets()` menemukan aset lewat nama pemegang kedua (`:29-30`) |

**Primary key:** `(id)`
**Foreign key:**

| Kolom | Tabel tujuan | ON DELETE | ON UPDATE | Sumber |
| --- | --- | --- | --- | --- |
| `category_id` | `categories(id)` | RESTRICT | NO ACTION (bawaan) | `:179` |
| `brand_id` | `brands(id)` | RESTRICT | NO ACTION (bawaan) | `:180` |
| `model_id` | `models(id)` | RESTRICT | NO ACTION (bawaan) | `:181` |
| `vendor_id` | `vendors(id)` | RESTRICT | NO ACTION (bawaan) | `:183` |
| `department_id` | `departments(id)` | SET NULL | NO ACTION (bawaan) | `:188` |
| `location_id` | `locations(id)` | RESTRICT | NO ACTION (bawaan) | `:189` |
| `assigned_to` | `accounts(id)` | SET NULL | NO ACTION (bawaan) | `:190` |
| `status_id` | `asset_statuses(id)` | RESTRICT | NO ACTION (bawaan) | `:191` |
| `condition_id` | `asset_conditions(id)` | RESTRICT | NO ACTION (bawaan) | `:192` |
| `created_by` | `accounts(id)` | **tidak ditulis → NO ACTION** | NO ACTION (bawaan) | `:198` |
| `unit_id` | `units(id)` | RESTRICT | NO ACTION (bawaan) | `20260820090200:70` |
| `assigned_to_secondary` | `accounts(id)` | SET NULL | NO ACTION (bawaan) | `20260821090500:31-32` |

**Unique constraint:** `asset_code` (`:177`), `serial_number` (`:182`)
**Index:**

| Nama | Definisi | Sumber |
| --- | --- | --- |
| `assets_location_idx` | `(location_id)` | `init_schema:204` |
| `assets_status_idx` | `(status_id)` | `init_schema:205` |
| `assets_assigned_idx` | `(assigned_to)` | `init_schema:206` |
| `assets_warranty_idx` | `(warranty_end)` | `init_schema:207` |
| `assets_search_idx` | `gin ((coalesce(asset_code,'') \|\| ' ' \|\| coalesce(serial_number,'') \|\| ' ' \|\| coalesce(name,'')) gin_trgm_ops)` | `init_schema:209-211` |
| `assets_category_idx` | `(category_id)` | `20260820090000_assets_category_index.sql:15` |
| `assets_unit_idx` | `(unit_id)` | `20260820090200:73` |
| `assets_assigned_secondary_idx` | `(assigned_to_secondary)` | `20260821090500:34` |

`assets_category_idx` datang belakangan; alasannya ditulis di
`20260820090000:4-10` — filter kategori disebut "an indexed equality" oleh
`src/api/assets.ts` padahal index-nya belum ada.

**CHECK constraint:**

| Nama | Ekspresi | Sumber |
| --- | --- | --- |
| `[nama dibuat PostgreSQL — tidak tertulis di DDL]` | `(warranty_end is null or warranty_start is null or warranty_end >= warranty_start)` | `:199` |

**Trigger:**

| Nama | Waktu | Fungsi | Sumber |
| --- | --- | --- | --- |
| `assets_set_updated_at` | BEFORE UPDATE, FOR EACH ROW | `set_updated_at()` | `init_schema:202` |
| `assets_audit` | AFTER INSERT OR UPDATE **OR DELETE**, FOR EACH ROW | `audit_row('asset_created','asset_updated')` | `init_schema:456-457` |

`assets_audit` adalah satu-satunya trigger audit yang juga menangkap DELETE
(bandingkan dengan `accounts_audit`, `bast_audit`, dan lainnya yang hanya
INSERT OR UPDATE).

### 2.4 `asset_code_counters`

**Peran:** penghitung dua sumbu (per kategori dan per tahun) yang memproduksi
`asset_code`; tidak pernah disentuh client.
**Migrasi asal:** `20260729090000_init_schema.sql:215-221`

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `category_code` | text | NO | — | bagian PK |
| `year_2` | text | NO | — | dua digit tahun; bagian PK |
| `cat_seq` | int | NO | `0` | urutan berjalan per kategori |
| `year_seq` | int | NO | `0` | urutan berjalan per tahun |

**Primary key:** `(category_code, year_2)` — komposit (`:220`)
**Foreign key:** tidak ada. `category_code` menyimpan **kode** kategori sebagai
teks, bukan FK ke `categories`.
**Unique constraint:** tidak ada di luar PK.
**Index:** tidak ada index tambahan.
**CHECK constraint:** tidak ada.
**Trigger:** tidak ada.

**Hak akses:** tabel ini sengaja tidak diberi grant apa pun. Alasannya di
`20260729120000_grants.sql:25-27`:

> "The counter tables (`asset_code_counters`, `bast_number_counters`) get
> nothing: they are only ever touched by `next_asset_code()` /
> `next_bast_number()`, which run as SECURITY DEFINER."

Kedua generator semula SECURITY INVOKER dan gagal dengan
`permission denied for table asset_code_counters` pada penyimpanan aset pertama;
diperbaiki menjadi SECURITY DEFINER di
`20260729150000_fix_counters_and_rename.sql:26-42` dengan alasan panjang di
`:8-23`.

### 2.5 `assignments`

**Peran:** catatan serah-terima aset kepada seorang (atau dua orang) pemegang.
**Migrasi asal:** `20260729090000_init_schema.sql:241-255`
**Diperluas oleh:** `20260821090500:24-25`, `:36-38`

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `asset_id` | uuid | NO | — | FK → `assets` |
| `account_id` | uuid | NO | — | FK → `accounts`. Pemegang utama |
| `department_id` | uuid | YES | — | FK → `departments` |
| `location_id` | uuid | NO | — | FK → `locations` |
| `assigned_date` | date | NO | — | |
| `expected_return` | date | YES | — | |
| `returned_date` | date | YES | — | |
| `state` | assignment_state | NO | `'active'` | enum, §6.5 |
| `notes` | text | YES | — | |
| `created_at` | timestamptz | NO | `now()` | |
| `created_by` | uuid | YES | — | FK → `accounts` |
| `secondary_account_id` | uuid | YES | — | Ditambahkan `20260821090500:24-25`. FK → `accounts`. Pemegang kedua |

**Primary key:** `(id)`
**Foreign key:**

| Kolom | Tabel tujuan | ON DELETE | ON UPDATE | Sumber |
| --- | --- | --- | --- | --- |
| `asset_id` | `assets(id)` | RESTRICT | NO ACTION (bawaan) | `:243` |
| `account_id` | `accounts(id)` | RESTRICT | NO ACTION (bawaan) | `:244` |
| `department_id` | `departments(id)` | SET NULL | NO ACTION (bawaan) | `:245` |
| `location_id` | `locations(id)` | RESTRICT | NO ACTION (bawaan) | `:246` |
| `created_by` | `accounts(id)` | **tidak ditulis → NO ACTION** | NO ACTION (bawaan) | `:253` |
| `secondary_account_id` | `accounts(id)` | RESTRICT | NO ACTION (bawaan) | `20260821090500:24-25` |

**Unique constraint dan index:**

| Nama | Definisi | Sumber |
| --- | --- | --- |
| `assignments_one_active` | **`unique index on assignments(asset_id) where state = 'active'`** | `init_schema:258` |
| `assignments_account_idx` | `(account_id)` | `init_schema:259` |

`assignments_one_active` adalah index parsial unik yang menegakkan aturan "satu
assignment aktif per aset" di level database. Penambahan pemegang kedua
sengaja **tidak** menyentuhnya — dikutip dari `20260821090500:15-17`:

> "`assignments_one_active` stays exactly as it is. There is still one active
> assignment per asset — it just carries two names now."

**CHECK constraint:**

| Nama | Ekspresi | Sumber |
| --- | --- | --- |
| `[nama dibuat PostgreSQL — tidak tertulis di DDL]` | `(returned_date is null or returned_date >= assigned_date)` | `:254` |
| `secondary_is_a_different_person` | `(secondary_account_id is null or secondary_account_id <> account_id)` | `20260821090500:37-38` |

**Trigger:**

| Nama | Waktu | Fungsi | Sumber |
| --- | --- | --- | --- |
| `assignments_audit` | AFTER INSERT OR UPDATE, FOR EACH ROW | `audit_row('assignment_created','assignment_returned')` | `init_schema:458-459` |

### 2.6 `movements`

**Peran:** riwayat perpindahan aset antar lokasi; append-only.
**Migrasi asal:** `20260729090000_init_schema.sql:264-275`

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `asset_id` | uuid | NO | — | FK → `assets` |
| `from_location` | uuid | YES | — | FK → `locations`. null = asal tidak diketahui |
| `to_location` | uuid | NO | — | FK → `locations` |
| `moved_at` | timestamptz | NO | `now()` | |
| `reason` | text | NO | — | project rollout, employee relocation, repair, redeployment, audit support, other (`:270`) |
| `remarks` | text | YES | — | |
| `moved_by` | uuid | NO | — | FK → `accounts` |
| `created_at` | timestamptz | NO | `now()` | |

**Primary key:** `(id)`
**Foreign key:**

| Kolom | Tabel tujuan | ON DELETE | ON UPDATE | Sumber |
| --- | --- | --- | --- | --- |
| `asset_id` | `assets(id)` | RESTRICT | NO ACTION (bawaan) | `:266` |
| `from_location` | `locations(id)` | RESTRICT | NO ACTION (bawaan) | `:267` |
| `to_location` | `locations(id)` | RESTRICT | NO ACTION (bawaan) | `:268` |
| `moved_by` | `accounts(id)` | **tidak ditulis → NO ACTION** | NO ACTION (bawaan) | `:272` |

**Unique constraint:** tidak ada.
**Index:** `movements_asset_idx` — `(asset_id, moved_at desc)`
(`init_schema:276`)
**CHECK constraint:**

| Nama | Ekspresi | Sumber |
| --- | --- | --- |
| `[nama dibuat PostgreSQL — tidak tertulis di DDL]` | `(from_location is null or from_location <> to_location)` | `:274` |

**Trigger:**

| Nama | Waktu | Fungsi | Sumber |
| --- | --- | --- | --- |
| `movements_no_update` | BEFORE UPDATE, FOR EACH ROW | `forbid_mutation()` | `init_schema:281-282` |
| `movements_no_delete` | BEFORE DELETE, FOR EACH ROW | `forbid_mutation()` | `init_schema:283-284` |
| `movements_audit` | AFTER INSERT, FOR EACH ROW | `audit_row('movement_recorded','movement_recorded')` | `init_schema:460-461` |

**Append-only ditegakkan tiga lapis**, sesuai aturan kerja proyek #3:
(1) tidak ada grant UPDATE/DELETE (`20260729120000_grants.sql:59`),
(2) `revoke update, delete` eksplisit (`init_schema:433` dan diulang di
`grants.sql:83`), dan (3) trigger `forbid_mutation()` di atas.

### 2.7 `asset_status_changes`

**Peran:** riwayat perubahan status/kondisi aset **beserta alasannya** — yang
tidak dapat disimpan `audit_log` karena log generik tidak tahu maksud perubahan.
**Migrasi asal:** `20260731140000_status_changes.sql:30-40`

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `asset_id` | uuid | NO | — | FK → `assets` |
| `from_status` | uuid | YES | — | FK → `asset_statuses` |
| `to_status` | uuid | NO | — | FK → `asset_statuses` |
| `from_condition` | uuid | YES | — | FK → `asset_conditions` |
| `to_condition` | uuid | YES | — | FK → `asset_conditions` |
| `reason` | text | NO | — | inti tabel ini |
| `changed_by` | uuid | YES | — | FK → `accounts` |
| `changed_at` | timestamptz | NO | `now()` | menggantikan `created_at` |

**Primary key:** `(id)`
**Foreign key:**

| Kolom | Tabel tujuan | ON DELETE | ON UPDATE | Sumber |
| --- | --- | --- | --- | --- |
| `asset_id` | `assets(id)` | RESTRICT | NO ACTION (bawaan) | `:32` |
| `from_status` | `asset_statuses(id)` | **tidak ditulis → NO ACTION** | NO ACTION (bawaan) | `:33` |
| `to_status` | `asset_statuses(id)` | **tidak ditulis → NO ACTION** | NO ACTION (bawaan) | `:34` |
| `from_condition` | `asset_conditions(id)` | **tidak ditulis → NO ACTION** | NO ACTION (bawaan) | `:35` |
| `to_condition` | `asset_conditions(id)` | **tidak ditulis → NO ACTION** | NO ACTION (bawaan) | `:36` |
| `changed_by` | `accounts(id)` | **tidak ditulis → NO ACTION** | NO ACTION (bawaan) | `:38` |

**Unique constraint:** tidak ada.
**Index:** `asset_status_changes_asset_idx` — `(asset_id, changed_at desc)`
(`:42-43`)
**CHECK constraint:** tidak ada.
**Trigger:**

| Nama | Waktu | Fungsi | Sumber |
| --- | --- | --- | --- |
| `asset_status_changes_no_update` | BEFORE UPDATE, FOR EACH ROW | `forbid_mutation()` | `:47-48` |
| `asset_status_changes_no_delete` | BEFORE DELETE, FOR EACH ROW | `forbid_mutation()` | `:49-50` |
| `asset_status_changes_audit` | AFTER INSERT, FOR EACH ROW | `audit_row('status_changed','status_changed')` | `:52-53` |

### 2.8 `asset_photos`

**Peran:** galeri foto per aset; barisnya boleh dihapus, tidak seperti riwayat.
**Migrasi asal:** `20260811090000_asset_photo_gallery.sql:32-41`

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `asset_id` | uuid | NO | — | FK → `assets` |
| `file_path` | text | NO | — | unique. `asset-photos/<asset_id>/<epoch>.jpg` (`:35`) |
| `sort_order` | int | NO | `1` | urutan; yang terkecil menjadi sampul |
| `caption` | text | YES | — | |
| `created_at` | timestamptz | NO | `now()` | |
| `created_by` | uuid | YES | — | FK → `accounts` |

**Primary key:** `(id)`
**Foreign key:**

| Kolom | Tabel tujuan | ON DELETE | ON UPDATE | Sumber |
| --- | --- | --- | --- | --- |
| `asset_id` | `assets(id)` | **CASCADE** | NO ACTION (bawaan) | `:34` |
| `created_by` | `accounts(id)` | **tidak ditulis → NO ACTION** | NO ACTION (bawaan) | `:40` |

**Unique constraint:** `file_path` (`:36`)
**Index:** `asset_photos_asset_idx` — `(asset_id, sort_order)` (`:43`)
**CHECK constraint:** tidak ada.
**Trigger:**

| Nama | Waktu | Fungsi | Sumber |
| --- | --- | --- | --- |
| `asset_photos_cover` | AFTER INSERT OR UPDATE OR DELETE, FOR EACH ROW | `sync_asset_cover()` | `20260811090000:75-78` |

`sync_asset_cover()` (`:63-73`) menulis `assets.photo_path` dengan `file_path`
foto ber-`sort_order` terkecil. Jadi `assets.photo_path` **bukan kolom yang
diisi aplikasi** — ia turunan, dan alasannya ditulis di `:57-62`.

> **Batas lima foto bukan constraint.** Larangan menambah foto keenam hidup di
> dalam RPC `add_asset_photo()`, bukan di skema:
> `20260811110000_photo_limit_five.sql:36-40` menghitung `count(*)` lalu
> `raise exception 'An asset can carry five photos. Remove one first.'`.
> Menulis langsung ke tabel akan melewatinya — yang menghalangi bukan CHECK,
> melainkan pencabutan grant di `20260811090000:54`.

### 2.9 `asset_tags`

**Peran:** siklus hidup stiker label fisik — dicetak kosong, ditempel ke sebuah
aset, atau dibatalkan.
**Migrasi asal:** `20260730080000_asset_tags.sql:27-54`
**Diperluas oleh:** `20260806090000_location_scoped_labels.sql:71-72`

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `code` | text | NO | — | unique. Yang tercetak pada stiker (`:29-31`) |
| `status` | tag_status | NO | `'untagged'` | enum, §6.10 |
| `asset_id` | uuid | YES | — | **unique**. Satu stiker satu aset (`:33-34`) |
| `batch_id` | uuid | YES | — | Nomor batch cetak. **Bukan FK** — §8.4 |
| `printed_at` | timestamptz | YES | — | |
| `tagged_at` | timestamptz | YES | — | |
| `tagged_by` | uuid | YES | — | FK → `accounts` |
| `voided_at` | timestamptz | YES | — | |
| `voided_by` | uuid | YES | — | FK → `accounts` |
| `void_reason` | text | YES | — | wajib ketika status `void` (CHECK) |
| `created_at` | timestamptz | NO | `now()` | |
| `created_by` | uuid | YES | — | FK → `accounts` |
| `location_id` | uuid | YES | — | Ditambahkan `20260806090000:71-72`. FK → `locations`. Nullable karena label lama tidak punya lokasi dan tidak boleh dihapus (`:67-69`) |

**Primary key:** `(id)`
**Foreign key:**

| Kolom | Tabel tujuan | ON DELETE | ON UPDATE | Sumber |
| --- | --- | --- | --- | --- |
| `asset_id` | `assets(id)` | RESTRICT | NO ACTION (bawaan) | `:34` |
| `tagged_by` | `accounts(id)` | **tidak ditulis → NO ACTION** | NO ACTION (bawaan) | `:39` |
| `voided_by` | `accounts(id)` | **tidak ditulis → NO ACTION** | NO ACTION (bawaan) | `:41` |
| `created_by` | `accounts(id)` | **tidak ditulis → NO ACTION** | NO ACTION (bawaan) | `:44` |
| `location_id` | `locations(id)` | RESTRICT | NO ACTION (bawaan) | `20260806090000:72` |

**Unique constraint:** `code` (`:31`), `asset_id` (`:34`)
**Index:**

| Nama | Definisi | Sumber |
| --- | --- | --- |
| `asset_tags_status_idx` | `(status, created_at desc)` | `:56` |
| `asset_tags_batch_idx` | `(batch_id)` | `:57` |
| `asset_tags_location_idx` | `(location_id, status)` | `20260806090000:74` |

**CHECK constraint:**

| Nama | Ekspresi | Sumber |
| --- | --- | --- |
| `tag_status_matches_asset` | `((status = 'tagged' and asset_id is not null) or (status <> 'tagged' and asset_id is null))` | `:47-50` |
| `void_needs_reason` | `(status <> 'void' or void_reason is not null)` | `:51-53` |

Alasan kedua CHECK ini ada di skema dan bukan di aplikasi, dikutip dari
`:19-22`:

> "Both are CHECK/UNIQUE constraints below rather than application logic,
> because a mislabelled asset is the one error this system cannot detect after
> the fact — the sticker is the only physical link back to the record."

**Trigger:**

| Nama | Waktu | Fungsi | Sumber |
| --- | --- | --- | --- |
| `asset_tags_audit` | AFTER INSERT OR UPDATE, FOR EACH ROW | `audit_row('asset_created','asset_updated')` | `:59-60` |

> Trigger ini memakai ulang aksi `asset_created`/`asset_updated`, sehingga entri
> audit untuk label tidak dapat dibedakan dari entri untuk aset selain lewat
> kolom `table_name`. Bandingkan dengan `accessories_audit` yang mendapat aksi
> enum sendiri.

### 2.10 `tag_code_counters`

**Peran:** penghitung nomor urut kode stiker per prefix lokasi.
**Migrasi asal:** `20260730080000_asset_tags.sql:66-69`

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `prefix` | text | NO | — | PK. `'CTH'`, `'CTS'`, … |
| `seq` | int | NO | `0` | |

**Primary key:** `(prefix)` (`:67`)
**Foreign key:** tidak ada. `prefix` menyimpan teks, bukan FK ke
`locations.tag_prefix`.
**Unique constraint:** tidak ada di luar PK.
**Index:** tidak ada index tambahan.
**CHECK constraint:** tidak ada.
**Trigger:** tidak ada.

Diisi hanya oleh `next_tag_code()` yang SECURITY DEFINER
(`20260730080000:71-72`).

### 2.11 `documents`

**Peran:** pustaka dokumen per aset (invoice, PO, kartu garansi, manual, scan
BAST).
**Migrasi asal:** `20260729090000_init_schema.sql:347-358`

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `asset_id` | uuid | NO | — | FK → `assets` |
| `kind` | document_kind | NO | — | enum, §6.8 |
| `title` | text | NO | — | |
| `file_path` | text | NO | — | `asset-documents/<asset_id>/<uuid>.<ext>` (`:352`) |
| `file_size` | bigint | YES | — | |
| `mime_type` | text | YES | — | |
| `bast_id` | uuid | YES | — | FK → `bast` |
| `uploaded_by` | uuid | YES | — | FK → `accounts` |
| `created_at` | timestamptz | NO | `now()` | |

**Primary key:** `(id)`
**Foreign key:**

| Kolom | Tabel tujuan | ON DELETE | ON UPDATE | Sumber |
| --- | --- | --- | --- | --- |
| `asset_id` | `assets(id)` | **CASCADE** | NO ACTION (bawaan) | `:349` |
| `bast_id` | `bast(id)` | SET NULL | NO ACTION (bawaan) | `:355` |
| `uploaded_by` | `accounts(id)` | **tidak ditulis → NO ACTION** | NO ACTION (bawaan) | `:356` |

**Unique constraint:** tidak ada. `file_path` **tidak** unik di sini, berbeda
dari `asset_photos.file_path`.
**Index:** `documents_asset_idx` — `(asset_id, created_at desc)`
(`init_schema:359`)
**CHECK constraint:** tidak ada.
**Trigger:** tidak ada. Tabel ini tidak diaudit oleh trigger.

### 2.12 `maintenance_records`

**Peran:** catatan perbaikan dan perawatan aset, termasuk jadwal servis
berikutnya.
**Migrasi asal:** `20260729090000_init_schema.sql:361-377`

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `asset_id` | uuid | NO | — | FK → `assets` |
| `title` | text | NO | — | |
| `detail` | text | YES | — | |
| `state` | maintenance_state | NO | `'open'` | enum, §6.6 |
| `vendor_id` | uuid | YES | — | FK → `vendors` |
| `is_internal` | boolean | NO | `false` | dikerjakan tim sendiri |
| `cost` | numeric(16,2) | **YES** | `0` | punya default tetapi **nullable** — §8.5 |
| `under_warranty` | boolean | NO | `false` | |
| `started_at` | date | NO | `current_date` | |
| `completed_at` | date | YES | — | |
| `next_due_at` | date | YES | — | memicu notifikasi `maintenance_reminder` (`:373`) |
| `created_by` | uuid | YES | — | FK → `accounts` |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | |

**Primary key:** `(id)`
**Foreign key:**

| Kolom | Tabel tujuan | ON DELETE | ON UPDATE | Sumber |
| --- | --- | --- | --- | --- |
| `asset_id` | `assets(id)` | RESTRICT | NO ACTION (bawaan) | `:363` |
| `vendor_id` | `vendors(id)` | SET NULL | NO ACTION (bawaan) | `:367` |
| `created_by` | `accounts(id)` | **tidak ditulis → NO ACTION** | NO ACTION (bawaan) | `:374` |

**Unique constraint:** tidak ada.
**Index:** `maintenance_asset_idx` — `(asset_id, started_at desc)`
(`init_schema:378`)
**CHECK constraint:** tidak ada. Tidak ada CHECK yang mensyaratkan
`completed_at >= started_at`, berbeda dari pola di `assignments` dan
`accessory_checkouts`.
**Trigger:**

| Nama | Waktu | Fungsi | Sumber |
| --- | --- | --- | --- |
| `maintenance_set_updated_at` | BEFORE UPDATE, FOR EACH ROW | `set_updated_at()` | `init_schema:380-381` |
| `maintenance_audit` | AFTER INSERT OR UPDATE, FOR EACH ROW | `audit_row('maintenance_updated','maintenance_updated')` | `init_schema:464-465` |

> **`sync_asset_maintenance_status()` bukan trigger.** Fungsi ini
> (`20260804140000:572`) menyelaraskan `assets.status_id` dengan keadaan
> perbaikan, tetapi dipanggil `perform` dari dalam RPC
> (`20260804140000:686`, `:741`), bukan dipasang sebagai trigger.
>
> ```sh
> grep -rn "sync_asset_maintenance_status" supabase/migrations/*.sql
> # 5 hasil: 1 definisi, 2 grant/revoke, 2 pemanggilan `perform`. Nol `create trigger`.
> ```

---

## 3. Modul E-BAST

Enam tabel. BAST = Berita Acara Serah Terima.

### 3.1 `bast_number_counters`

**Peran:** penghitung nomor BAST per tahun, agar nomor tidak pernah bertabrakan.
**Migrasi asal:** `20260729090000_init_schema.sql:289-292`

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `year` | int | NO | — | PK |
| `seq` | int | NO | `0` | |

**Primary key:** `(year)` (`:290`)
**Foreign key:** tidak ada.
**Unique constraint:** tidak ada di luar PK.
**Index:** tidak ada index tambahan.
**CHECK constraint:** tidak ada.
**Trigger:** tidak ada.

Diisi hanya oleh `next_bast_number()`, SECURITY DEFINER sejak
`20260729150000:44-52`. Format keluaran: `BAST/CITE/<tahun>/<4 digit>`, misalnya
`BAST/CITE/2026/0182` (`init_schema:300`).

### 3.2 `bast`

**Peran:** dokumen serah-terima itu sendiri — satu baris satu surat.
**Migrasi asal:** `20260729090000_init_schema.sql:303-319`
**Diperluas oleh:** `20260804140000:191`, `20260821090300:31`,
`20260821090500:26-27`

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `bast_number` | text | NO | **`next_bast_number()`** | unique. Default berupa pemanggilan fungsi |
| `assignment_id` | uuid | YES | — | FK → `assignments` |
| `asset_id` | uuid | **YES** | — | FK → `assets`. **Semula NOT NULL**; dilonggarkan `20260821090300:31` |
| `account_id` | uuid | NO | — | FK → `accounts`. Penerima |
| `department_id` | uuid | YES | — | FK → `departments` |
| `location_id` | uuid | NO | — | FK → `locations`. Menjadi cadangan RLS setelah `asset_id` nullable |
| `bast_date` | date | NO | `current_date` | |
| `description` | text | YES | — | |
| `condition_text` | text | YES | `'Baik / Good'` | |
| `status` | bast_status | NO | `'draft'` | enum, §6.3 |
| `current_version` | int | NO | `1` | |
| `created_at` | timestamptz | NO | `now()` | |
| `created_by` | uuid | YES | — | FK → `accounts` |
| `updated_at` | timestamptz | NO | `now()` | |
| `kind` | bast_kind | NO | `'handover'` | Ditambahkan `20260804140000:191`. enum, §6.12 |
| `secondary_account_id` | uuid | YES | — | Ditambahkan `20260821090500:26-27`. FK → `accounts`. Penerima kedua |

**Primary key:** `(id)`
**Foreign key:**

| Kolom | Tabel tujuan | ON DELETE | ON UPDATE | Sumber |
| --- | --- | --- | --- | --- |
| `assignment_id` | `assignments(id)` | SET NULL | NO ACTION (bawaan) | `:306` |
| `asset_id` | `assets(id)` | RESTRICT | NO ACTION (bawaan) | `:307` |
| `account_id` | `accounts(id)` | RESTRICT | NO ACTION (bawaan) | `:308` |
| `department_id` | `departments(id)` | SET NULL | NO ACTION (bawaan) | `:309` |
| `location_id` | `locations(id)` | RESTRICT | NO ACTION (bawaan) | `:310` |
| `created_by` | `accounts(id)` | **tidak ditulis → NO ACTION** | NO ACTION (bawaan) | `:317` |
| `secondary_account_id` | `accounts(id)` | RESTRICT | NO ACTION (bawaan) | `20260821090500:26-27` |

**Unique constraint:** `bast_number` (`:305`)
**Index:** `bast_asset_idx` — `(asset_id)` (`init_schema:320`);
`bast_status_idx` — `(status)` (`init_schema:321`)
**CHECK constraint:** tidak ada.
**Trigger:**

| Nama | Waktu | Fungsi | Sumber |
| --- | --- | --- | --- |
| `bast_set_updated_at` | BEFORE UPDATE, FOR EACH ROW | `set_updated_at()` | `init_schema:323` |
| `bast_audit` | AFTER INSERT OR UPDATE, FOR EACH ROW | `audit_row('bast_generated','bast_signed')` | `init_schema:462-463` |

**Catatan penting soal `asset_id` yang menjadi nullable.** Perubahan satu baris
di `20260821090300:31` memaksa setiap policy BAST punya jalur cadangan, karena
semula seluruh visibilitas diselesaikan lewat aset. Penulisnya menandai ini
sebagai baris paling berbahaya di migrasi tersebut (`20260821090300:22-24`):

> "That fallback is the most dangerous line in this migration: get it wrong and
> Site IT can read Head Office's handover notes. `tests/bast-accessory.mjs`
> exists mostly to prove it does not."

Satu definisi terpusat dibuat untuk itu — `can_see_bast_row(p_asset, p_location)`
(`20260821090300:39-45`): jika `p_asset` null, pakai `p_location`; jika tidak,
pakai `can_see_asset(p_asset)`. Aturan yang sama harus ditulis **dua kali**,
karena policy pada `storage.objects` tidak dapat membaca baris `bast` secara
langsung; salinan kedua adalah `storage_bast_location_id()`
(`20260824090000_bast_storage_no_asset.sql:31-37`), yang dibuat setelah cacat
ini ditemukan — lihat §8.6.

### 3.3 `bast_versions`

**Peran:** berkas PDF tiap versi dokumen BAST; append-only.
**Migrasi asal:** `20260729090000_init_schema.sql:325-337`

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `bast_id` | uuid | NO | — | FK → `bast` |
| `version` | int | NO | — | |
| `kind` | bast_file_kind | NO | — | enum, §6.4 |
| `file_path` | text | NO | — | `bast/<bast_id>/v<version>.pdf` (`:330`) |
| `file_size` | bigint | YES | — | |
| `mime_type` | text | YES | — | |
| `note` | text | YES | — | `'PDF generated (v1)'`, `'Signed scan uploaded'` (`:333`) |
| `uploaded_by` | uuid | YES | — | FK → `accounts`. null = System (`:334`) |
| `created_at` | timestamptz | NO | `now()` | |

**Primary key:** `(id)`
**Foreign key:**

| Kolom | Tabel tujuan | ON DELETE | ON UPDATE | Sumber |
| --- | --- | --- | --- | --- |
| `bast_id` | `bast(id)` | **CASCADE** | NO ACTION (bawaan) | `:327` |
| `uploaded_by` | `accounts(id)` | **tidak ditulis → NO ACTION** | NO ACTION (bawaan) | `:334` |

**Unique constraint:** `(bast_id, version)` (`:336`)
**Index:** tidak ada index tambahan.
**CHECK constraint:** tidak ada.
**Trigger:**

| Nama | Waktu | Fungsi | Sumber |
| --- | --- | --- | --- |
| `bast_versions_no_update` | BEFORE UPDATE, FOR EACH ROW | `forbid_mutation()` | `init_schema:339-340` |
| `bast_versions_no_delete` | BEFORE DELETE, FOR EACH ROW | `forbid_mutation()` | `init_schema:341-342` |

> **Ketegangan yang perlu dicatat:** tabel ini append-only lewat trigger dan
> revoke (`init_schema:433`), tetapi FK-nya `on delete cascade` ke `bast`.
> Artinya menghapus satu baris `bast` akan menghapus versi-versinya — dan
> `forbid_mutation()` di BEFORE DELETE justru akan menggagalkan penghapusan itu.
> Lihat §8.7.

### 3.4 `bast_items`

**Peran:** baris-baris barang pada lembar BAST — termasuk charger dan mouse yang
bukan aset dan tidak punya nomor seri.
**Migrasi asal:** `20260804140000_bast_documents_and_maintenance_status.sql:205-213`

Dikutip dari `20260804140000:199-203`:

> "the SHEET lists everything that physically changed hands, and the charger and
> the mouse are not assets in their own right… So these rows are document lines,
> not inventory. Deliberately so."

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `bast_id` | uuid | NO | — | FK → `bast` |
| `position` | int | NO | `1` | urutan baris pada lembar |
| `jenis` | text | NO | — | `"HP Laptop 14-ep1188TU"` (`:209`) |
| `serial_number` | text | YES | — | null dicetak sebagai `"-"` (`:210`) |
| `kondisi` | text | NO | `'Baik'` | |
| `created_at` | timestamptz | NO | `now()` | |

**Primary key:** `(id)`
**Foreign key:**

| Kolom | Tabel tujuan | ON DELETE | ON UPDATE | Sumber |
| --- | --- | --- | --- | --- |
| `bast_id` | `bast(id)` | **CASCADE** | NO ACTION (bawaan) | `:207` |

**Unique constraint:** tidak ada. Tidak ada jaminan `position` unik per BAST.
**Index:** `bast_items_bast_idx` — `(bast_id, position)` (`:215`)
**CHECK constraint:** tidak ada.
**Trigger:** tidak ada.

> Tabel ini sengaja **bukan** append-only, berbeda dari `movements` dan
> `bast_versions`. Yang menahannya berubah setelah ditandatangani adalah
> penjagaan status di dalam RPC `set_bast_items()`, bukan trigger. Dikutip dari
> `20260804140000:224-227`:
>
> "Unlike movements these are NOT append-only: the list is part of a draft
> document and gets corrected before anyone signs it. What stops it changing
> afterwards is the status guard in the RPC, not a trigger."

### 3.5 `bast_signatories`

**Peran:** daftar "Yang Menyerahkan" — orang yang menyerahkan barang, yang belum
tentu punya akun di aplikasi.
**Migrasi asal:** `20260731090000_ebast_signatures.sql:56-65`

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `full_name` | text | NO | — | unik case-insensitive lewat index |
| `title` | text | YES | — | jabatan, dicetak di bawah nama (`:59`) |
| `department_id` | uuid | YES | — | FK → `departments` |
| `is_active` | boolean | NO | `true` | |
| `created_at` | timestamptz | NO | `now()` | |
| `created_by` | uuid | YES | — | FK → `accounts` |
| `updated_at` | timestamptz | NO | `now()` | |

**Primary key:** `(id)`
**Foreign key:**

| Kolom | Tabel tujuan | ON DELETE | ON UPDATE | Sumber |
| --- | --- | --- | --- | --- |
| `department_id` | `departments(id)` | SET NULL | NO ACTION (bawaan) | `:60` |
| `created_by` | `accounts(id)` | **tidak ditulis → NO ACTION** | NO ACTION (bawaan) | `:63` |

**Unique constraint dan index:**

| Nama | Definisi | Sumber |
| --- | --- | --- |
| `bast_signatories_name_key` | **`unique index on bast_signatories (lower(full_name))`** | `:69` |

Index fungsional, bukan constraint kolom: "Budi Santoso" dan "budi santoso"
dianggap satu orang (`:67-68`).

**CHECK constraint:** tidak ada.
**Trigger:**

| Nama | Waktu | Fungsi | Sumber |
| --- | --- | --- | --- |
| `bast_signatories_set_updated_at` | BEFORE UPDATE, FOR EACH ROW | `set_updated_at()` | `:71-72` |
| `bast_signatories_audit` | AFTER INSERT OR UPDATE, FOR EACH ROW | `audit_row('master_created','master_updated')` | `:74-75` |

### 3.6 `bast_signatures`

**Peran:** tanda tangan digital sebagai **lintasan goresan**, bukan gambar;
append-only.
**Migrasi asal:** `20260731090000_ebast_signatures.sql:94-107`

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `bast_id` | uuid | NO | — | FK → `bast` |
| `role` | bast_signature_role | NO | — | enum, §6.11 |
| `signer_name` | text | NO | — | |
| `signer_title` | text | YES | — | |
| `strokes` | jsonb | NO | — | `[[[x,y],[x,y],...], ...]` — satu array dalam per goresan pena (`:100`) |
| `signed_at` | timestamptz | NO | `now()` | |
| `recorded_by` | uuid | YES | — | FK → `accounts`. Akun yang mengoperasikan perangkat, bukan yang bertanda tangan (`:103-104`) |

**Primary key:** `(id)`
**Foreign key:**

| Kolom | Tabel tujuan | ON DELETE | ON UPDATE | Sumber |
| --- | --- | --- | --- | --- |
| `bast_id` | `bast(id)` | **RESTRICT** | NO ACTION (bawaan) | `:96` |
| `recorded_by` | `accounts(id)` | **tidak ditulis → NO ACTION** | NO ACTION (bawaan) | `:105` |

`RESTRICT` di sini berbeda dari `CASCADE` pada `bast_versions` dan `bast_items`
— dokumen yang sudah ditandatangani tidak dapat dihapus selama tanda tangannya
ada.

**Unique constraint:** tidak ada. Menandatangani ulang menyisipkan baris baru;
yang terbaru yang dicetak, yang lama tetap tersimpan (`:29-35`).
**Index:** `bast_signatures_bast_idx` — `(bast_id, role, signed_at desc)`
(`:109`)
**CHECK constraint:**

| Nama | Ekspresi | Sumber |
| --- | --- | --- |
| `strokes_is_array` | `(jsonb_typeof(strokes) = 'array')` | `:106` |

**Trigger:**

| Nama | Waktu | Fungsi | Sumber |
| --- | --- | --- | --- |
| `bast_signatures_no_update` | BEFORE UPDATE, FOR EACH ROW | `forbid_mutation()` | `:111-112` |
| `bast_signatures_no_delete` | BEFORE DELETE, FOR EACH ROW | `forbid_mutation()` | `:113-114` |
| `bast_signatures_audit` | AFTER INSERT, FOR EACH ROW | `audit_row('bast_signed','bast_signed')` | `:116-117` |

**Alasan menyimpan goresan, bukan PNG** — tiga alasan berurut kepentingan,
diparafrasekan dari `20260731090000:10-23`: (1) data yang sama menggambar tanda
tangan di layar dan di PDF sehingga pratinjau dan cetakan tidak mungkin
berbeda; (2) tetap tajam di ukuran berapa pun; (3) hanya beberapa kilobyte
jsonb di dalam baris, sehingga tercakup RLS dan backup yang sama dengan record
induknya. Koordinat dinormalisasi terhadap **lebar** pad, bukan tiap sumbu
sendiri-sendiri, agar rasio aspek tulisan tangan tidak melar (`:25-27`).

**Catatan tentang makna "signed":** merekam kedua tanda tangan **tidak**
mengubah `bast.status` menjadi `'signed'`. Status berpindah hanya ketika PDF
bertanda tangan sudah ada, lewat `attach_signed_bast()` (`:37-43`).

---

## 4. Modul Perlengkapan

Dua tabel. Perlengkapan (accessories) adalah barang habis pakai atau barang
kecil yang dikelola per jumlah, bukan per unit ber-nomor-seri.

### 4.1 `accessories`

**Peran:** stok perlengkapan per lokasi, dihitung dengan kuantitas.
**Migrasi asal:** `20260821090200_accessories.sql:32-51`

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `name` | text | NO | — | unik per lokasi |
| `category_id` | uuid | NO | — | FK → `categories` |
| `brand_id` | uuid | YES | — | FK → `brands` |
| `model_no` | text | YES | — | teks bebas, bukan FK ke `models` |
| `vendor_id` | uuid | YES | — | FK → `vendors` |
| `location_id` | uuid | NO | — | FK → `locations` |
| `total_qty` | int | NO | `0` | CHECK `>= 0` |
| `min_qty` | int | NO | `0` | CHECK `>= 0`. **Belum dibaca kode mana pun** (`:27-29`) |
| `purchase_date` | date | YES | — | |
| `purchase_price` | numeric(16,2) | YES | — | per unit, bukan per batch (`:43`) |
| `notes` | text | YES | — | |
| `photo_path` | text | YES | — | |
| `is_active` | boolean | NO | `true` | |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | **tidak pernah diperbarui otomatis** — §8.1 |
| `created_by` | uuid | YES | — | FK → `accounts` |

**Primary key:** `(id)`
**Foreign key:**

| Kolom | Tabel tujuan | ON DELETE | ON UPDATE | Sumber |
| --- | --- | --- | --- | --- |
| `category_id` | `categories(id)` | RESTRICT | NO ACTION (bawaan) | `:35` |
| `brand_id` | `brands(id)` | RESTRICT | NO ACTION (bawaan) | `:36` |
| `vendor_id` | `vendors(id)` | RESTRICT | NO ACTION (bawaan) | `:38` |
| `location_id` | `locations(id)` | RESTRICT | NO ACTION (bawaan) | `:39` |
| `created_by` | `accounts(id)` | **tidak ditulis → NO ACTION** | NO ACTION (bawaan) | `:49` |

**Unique constraint:** `(name, location_id)` (`:50`) — nama yang sama boleh ada
di dua lokasi sebagai dua baris stok terpisah.
**Index:** `accessories_location_idx` — `(location_id)` (`:53`);
`accessories_category_idx` — `(category_id)` (`:54`)
**CHECK constraint:**

| Nama | Ekspresi | Sumber |
| --- | --- | --- |
| `[nama dibuat PostgreSQL — tidak tertulis di DDL]` | `(total_qty >= 0)` | `:40` |
| `[nama dibuat PostgreSQL — tidak tertulis di DDL]` | `(min_qty >= 0)` | `:41` |

**Trigger:**

| Nama | Waktu | Fungsi | Sumber |
| --- | --- | --- | --- |
| `accessories_audit` | AFTER INSERT OR UPDATE, FOR EACH ROW | `audit_row('accessory_created','accessory_updated')` | `:108-109` |

Tidak ada trigger `set_updated_at` — lihat §8.1.

### 4.2 `accessory_checkouts`

**Peran:** pengeluaran sejumlah perlengkapan kepada seseorang, dan
pengembaliannya.
**Migrasi asal:** `20260821090200_accessories.sql:56-69`

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `accessory_id` | uuid | NO | — | FK → `accessories` |
| `account_id` | uuid | NO | — | FK → `accounts` |
| `qty` | int | NO | — | CHECK `> 0` |
| `assigned_date` | date | NO | `current_date` | |
| `returned_date` | date | YES | — | |
| `state` | assignment_state | NO | `'active'` | enum yang sama dengan `assignments`, §6.5 |
| `bast_id` | uuid | YES | — | FK → `bast` |
| `notes` | text | YES | — | |
| `created_at` | timestamptz | NO | `now()` | |
| `created_by` | uuid | YES | — | FK → `accounts` |

**Primary key:** `(id)`
**Foreign key:**

| Kolom | Tabel tujuan | ON DELETE | ON UPDATE | Sumber |
| --- | --- | --- | --- | --- |
| `accessory_id` | `accessories(id)` | RESTRICT | NO ACTION (bawaan) | `:58` |
| `account_id` | `accounts(id)` | RESTRICT | NO ACTION (bawaan) | `:59` |
| `bast_id` | `bast(id)` | SET NULL | NO ACTION (bawaan) | `:64` |
| `created_by` | `accounts(id)` | **tidak ditulis → NO ACTION** | NO ACTION (bawaan) | `:67` |

**Unique constraint:** tidak ada.
**Index:**

| Nama | Definisi | Sumber |
| --- | --- | --- |
| `accessory_checkouts_active_idx` | `index on accessory_checkouts(accessory_id) where state = 'active'` — **parsial, TIDAK unik** | `:71-72` |
| `accessory_checkouts_account_idx` | `(account_id)` | `:73-74` |

> Perbedaan penting dari `assignments_one_active`: index parsial di sini
> **bukan** `unique`, karena satu jenis perlengkapan memang boleh dipegang
> banyak orang sekaligus. Bentuknya mirip, maknanya berlawanan.

**CHECK constraint:**

| Nama | Ekspresi | Sumber |
| --- | --- | --- |
| `[nama dibuat PostgreSQL — tidak tertulis di DDL]` | `(qty > 0)` | `:60` |
| `[nama dibuat PostgreSQL — tidak tertulis di DDL]` | `(returned_date is null or returned_date >= assigned_date)` | `:68` |

**Trigger:**

| Nama | Waktu | Fungsi | Sumber |
| --- | --- | --- | --- |
| `accessory_checkouts_audit` | AFTER INSERT OR UPDATE, FOR EACH ROW | `audit_row('accessory_assigned','accessory_returned')` | `:110-111` |

---

## 5. Modul Sistem

Tiga tabel yang melayani aplikasi, bukan domain aset.

### 5.1 `notifications`

**Peran:** kotak masuk pemberitahuan per akun.
**Migrasi asal:** `20260729090000_init_schema.sql:383-393`
**Diperluas oleh:** `20260801090000_phase6.sql:282`

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `account_id` | uuid | NO | — | FK → `accounts` |
| `kind` | notification_kind | NO | — | enum, §6.9 |
| `title` | text | NO | — | |
| `body` | text | YES | — | |
| `asset_id` | uuid | YES | — | FK → `assets` |
| `bast_id` | uuid | YES | — | FK → `bast` |
| `read_at` | timestamptz | YES | — | null = belum dibaca |
| `created_at` | timestamptz | NO | `now()` | |
| `dedupe_key` | text | YES | — | Ditambahkan `20260801090000:282`. **Apa** isi notifikasi, bukan kapan dikirim (`:278-280`) |

**Primary key:** `(id)`
**Foreign key:**

| Kolom | Tabel tujuan | ON DELETE | ON UPDATE | Sumber |
| --- | --- | --- | --- | --- |
| `account_id` | `accounts(id)` | **CASCADE** | NO ACTION (bawaan) | `:385` |
| `asset_id` | `assets(id)` | **CASCADE** | NO ACTION (bawaan) | `:389` |
| `bast_id` | `bast(id)` | **CASCADE** | NO ACTION (bawaan) | `:390` |

**Unique constraint dan index:**

| Nama | Definisi | Sumber |
| --- | --- | --- |
| `notifications_inbox_idx` | `(account_id, read_at, created_at desc)` | `init_schema:394` |
| `notifications_dedupe_key` | **`unique index on notifications (account_id, dedupe_key) where dedupe_key is not null`** | `20260801090000:284-286` |

Index parsial unik itulah yang mencegah job harian mengirim pemberitahuan yang
sama dua kali. `dedupe_key` nullable karena notifikasi hasil tindakan manusia
bersifat sekali jalan dan tidak punya lawan tabrakan (`:279-280`).

**CHECK constraint:** tidak ada.
**Trigger:** tidak ada.

### 5.2 `import_batches`

**Peran:** riwayat setiap impor CSV, baik impor aset maupun impor pegawai.
**Migrasi asal:** `20260729090000_init_schema.sql:396-406`
**Diperluas oleh:** `20260820090300_import_accounts.sql:36`

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `file_name` | text | NO | — | |
| `file_path` | text | NO | — | |
| `total_rows` | int | NO | `0` | |
| `imported_rows` | int | NO | `0` | |
| `skipped_rows` | int | NO | `0` | |
| `errors` | jsonb | NO | `'[]'` | `[{"row":12,"column":"serial_number","message":"Duplicate"}]` (`:403`) |
| `imported_by` | uuid | YES | — | FK → `accounts` |
| `created_at` | timestamptz | NO | `now()` | |
| `kind` | text | NO | `'assets'` | Ditambahkan `20260820090300:36`. **text bebas, bukan enum** — §8.3 |

**Primary key:** `(id)`
**Foreign key:**

| Kolom | Tabel tujuan | ON DELETE | ON UPDATE | Sumber |
| --- | --- | --- | --- | --- |
| `imported_by` | `accounts(id)` | **tidak ditulis → NO ACTION** | NO ACTION (bawaan) | `:404` |

**Unique constraint:** tidak ada.
**Index:** tidak ada index tambahan.
**CHECK constraint:** tidak ada — termasuk tidak ada yang membatasi nilai
`kind`.
**Trigger:** tidak ada.

Tabel ini append-only lewat grant: `grant select, insert on import_batches to
authenticated` (`20260729120000_grants.sql:61`), tetapi **tanpa** trigger
`forbid_mutation()` dan tanpa revoke eksplisit — berbeda dari tiga tabel
append-only lainnya. Lihat §8.8.

### 5.3 `audit_log`

**Peran:** jejak audit seluruh sistem; immutable dan hanya diisi trigger.
**Migrasi asal:** `20260729090000_init_schema.sql:411-424`

| Nama | Tipe | Null | Default | Keterangan |
| --- | --- | --- | --- | --- |
| `id` | **bigserial** | NO | dari sequence | PK. Satu-satunya PK non-uuid non-komposit |
| `action` | audit_action | NO | — | enum, §6.7 |
| `table_name` | text | NO | — | diisi `tg_table_name` (`:446`) |
| `record_id` | uuid | YES | — | `coalesce(new.id, old.id)` (`:447`) |
| `target_label` | text | YES | — | `'LPT045-24-118 · Dell Latitude 5440'` (`:416`) |
| `old_value` | jsonb | YES | — | null saat INSERT (`:448`) |
| `new_value` | jsonb | YES | — | null saat DELETE (`:449`) |
| `actor_id` | uuid | YES | — | FK → `accounts` |
| `actor_label` | text | YES | — | `'Site IT · Rizky Hidayat'` (`:420`) |
| `device` | text | YES | — | dari header `x-client-info` (`:451`) |
| `ip_address` | inet | YES | — | dari header `x-forwarded-for` (`:452`) |
| `created_at` | timestamptz | NO | `now()` | |

**Primary key:** `(id)` — `bigserial`, sehingga ada sequence implisit
`audit_log_id_seq`. `authenticated` sengaja **tidak** diberi hak pakai sequence
itu (`20260729120000_grants.sql:75-76`).
**Foreign key:**

| Kolom | Tabel tujuan | ON DELETE | ON UPDATE | Sumber |
| --- | --- | --- | --- | --- |
| `actor_id` | `accounts(id)` | **tidak ditulis → NO ACTION** | NO ACTION (bawaan) | `:419` |

**Unique constraint:** tidak ada.
**Index:** `audit_created_idx` — `(created_at desc)` (`:425`);
`audit_record_idx` — `(table_name, record_id)` (`:426`)
**CHECK constraint:** tidak ada.
**Trigger:**

| Nama | Waktu | Fungsi | Sumber |
| --- | --- | --- | --- |
| `audit_no_update` | BEFORE UPDATE, FOR EACH ROW | `forbid_mutation()` | `:428-429` |
| `audit_no_delete` | BEFORE DELETE, FOR EACH ROW | `forbid_mutation()` | `:430-431` |

**Yang menulis ke sini.** Dua belas trigger `audit_row()` di dua belas tabel:

| Tabel | Trigger | Aksi INSERT | Aksi UPDATE/DELETE |
| --- | --- | --- | --- |
| `assets` | `assets_audit` | `asset_created` | `asset_updated` |
| `accounts` | `accounts_audit` | `account_created` | `account_updated` |
| `assignments` | `assignments_audit` | `assignment_created` | `assignment_returned` |
| `movements` | `movements_audit` | `movement_recorded` | `movement_recorded` |
| `bast` | `bast_audit` | `bast_generated` | `bast_signed` |
| `maintenance_records` | `maintenance_audit` | `maintenance_updated` | `maintenance_updated` |
| `asset_tags` | `asset_tags_audit` | `asset_created` | `asset_updated` |
| `bast_signatories` | `bast_signatories_audit` | `master_created` | `master_updated` |
| `bast_signatures` | `bast_signatures_audit` | `bast_signed` | `bast_signed` |
| `asset_status_changes` | `asset_status_changes_audit` | `status_changed` | `status_changed` |
| `accessories` | `accessories_audit` | `accessory_created` | `accessory_updated` |
| `accessory_checkouts` | `accessory_checkouts_audit` | `accessory_assigned` | `accessory_returned` |

Perintah untuk memverifikasi daftar ini:

```sh
grep -rn "execute function audit_row" supabase/migrations/*.sql
```

Hasilnya 12 — dua belas tabel dari 33 tabel diaudit oleh trigger.
**Dua puluh satu tabel tidak punya trigger audit sama sekali**, termasuk
`documents` dan `bast_items` — lihat §8.9.

---

## 6. Tipe ENUM

Dua belas tipe. Urutan nilai adalah **urutan deklarasi**, yang di PostgreSQL juga
menentukan urutan pengurutan (`ORDER BY`) dan perbandingan `<`/`>`.

Nilai yang ditambahkan `alter type … add value` **selalu masuk di akhir**, karena
tidak satu pun pernyataan `alter type` di repositori ini memakai klausa
`BEFORE`/`AFTER`:

```sh
grep -rniE "alter[[:space:]]+type" supabase/migrations/*.sql
# 6 hasil, semuanya berbentuk `add value if not exists '<nilai>';` tanpa BEFORE/AFTER
```

| # | Nama tipe | Jml | Nilai, berurut |
| ---: | --- | ---: | --- |
| 6.1 | `user_role` | 4 | `super_admin`, `corporate_it`, `site_it`, `viewer` |
| 6.2 | `location_kind` | 2 | `head_office`, `site` |
| 6.3 | `bast_status` | 4 | `draft`, `awaiting_signature`, `signed`, `void` |
| 6.4 | `bast_file_kind` | 2 | `generated`, `signed` |
| 6.5 | `assignment_state` | 2 | `active`, `returned` |
| 6.6 | `maintenance_state` | 4 | `open`, `in_progress`, `completed`, `cancelled` |
| 6.7 | `audit_action` | 20 | lihat rincian di bawah |
| 6.8 | `document_kind` | 7 | `invoice`, `purchase_order`, `warranty_card`, `manual`, `photo`, `signed_bast`, `other` |
| 6.9 | `notification_kind` | 6 | `warranty_expiring`, `asset_returned`, `new_assignment`, `new_bast`, `maintenance_reminder`, `import_completed` |
| 6.10 | `tag_status` | 3 | `untagged`, `tagged`, `void` |
| 6.11 | `bast_signature_role` | 3 | `handover`, `receiver`, `receiver_2` |
| 6.12 | `bast_kind` | 3 | `handover`, `return`, `accessory` |

Sumber baris per tipe:

| Tipe | Definisi awal | Penambahan nilai |
| --- | --- | --- |
| `user_role` | `init_schema:20` | — |
| `location_kind` | `init_schema:21` | — |
| `bast_status` | `init_schema:22` | — |
| `bast_file_kind` | `init_schema:23` | — |
| `assignment_state` | `init_schema:24` | — |
| `maintenance_state` | `init_schema:25` | — |
| `audit_action` | `init_schema:26-30` | `20260820090100:22-25` (4 nilai) |
| `document_kind` | `init_schema:31` | — |
| `notification_kind` | `init_schema:32-33` | — |
| `tag_status` | `20260730080000_asset_tags.sql:25` | — |
| `bast_signature_role` | `20260731090000_ebast_signatures.sql:46` | `20260820090100:33` (1 nilai) |
| `bast_kind` | `20260804140000:187` (di dalam blok `do $$`) | `20260820090100:29` (1 nilai) |

### 6.7 `audit_action` — 20 nilai

Enam belas nilai awal (`init_schema:26-30`), berurut:

`asset_created`, `asset_updated`, `status_changed`, `assignment_created`,
`assignment_returned`, `movement_recorded`, `bast_generated`, `bast_signed`,
`maintenance_updated`, `document_uploaded`, `master_created`, `master_updated`,
`master_deleted`, `account_created`, `account_updated`, `import_completed`

Empat nilai ditambahkan di akhir (`20260820090100:22-25`):

`accessory_created`, `accessory_updated`, `accessory_assigned`,
`accessory_returned`

```sh
sed -n '26,30p' supabase/migrations/20260729090000_init_schema.sql \
  | tr ',' '\n' | grep -c "'"          # -> 16
```

### 6.12 `bast_kind` — dibuat di dalam blok `do $$`

Berbeda dari sebelas tipe lain, `bast_kind` tidak dibuat dengan `create type`
polos melainkan di dalam penjaga (`20260804140000:184-189`):

```sql
do $$
begin
  if not exists (select 1 from pg_type where typname = 'bast_kind') then
    create type bast_kind as enum ('handover', 'return');
  end if;
end $$;
```

### Mengapa penambahan nilai enum menempati migrasi tersendiri

`20260820090100_new_enum_values.sql` hanya berisi enam pernyataan `alter type`
dan tidak ada yang lain. Alasannya ditulis di `:5-14`:

> "Postgres refuses to USE a new enum value in the same transaction that added
> it. Supabase runs each migration in a transaction, so a file that both adds
> 'accessory' to `bast_kind` and creates a function comparing against it fails
> on a fresh `supabase db reset` — while appearing to work on a database where
> the value already exists. That is the worst kind of failure: it only shows up
> for the next person."

Catatan yang relevan untuk skripsi: nilai enum **tidak dapat dihapus** di
PostgreSQL, sehingga tidak ada jalur turun (down migration) untuk berkas ini
(`:16-17`).

---

## 7. Matriks relasi

Kardinalitas dibaca dari sisi database: `1..N` berarti satu baris induk dapat
dirujuk banyak baris anak; `0..1` berarti kolom FK-nya nullable dan unik.

### 7.1 Matriks lengkap (79 foreign key)

| Induk | Anak | Kolom FK | Kardinalitas | ON DELETE |
| --- | --- | --- | --- | --- |
| `locations` | `models` | — | — | *(tidak ada relasi)* |
| `locations` | `accounts` | `location_id` | 1..N (opsional) | SET NULL |
| `locations` | `assets` | `location_id` | 1..N (wajib) | RESTRICT |
| `locations` | `assignments` | `location_id` | 1..N (wajib) | RESTRICT |
| `locations` | `movements` | `from_location` | 1..N (opsional) | RESTRICT |
| `locations` | `movements` | `to_location` | 1..N (wajib) | RESTRICT |
| `locations` | `bast` | `location_id` | 1..N (wajib) | RESTRICT |
| `locations` | `account_scope_preferences` | `location_id` | 1..N (wajib) | CASCADE |
| `locations` | `asset_tags` | `location_id` | 1..N (opsional) | RESTRICT |
| `locations` | `units` | `location_id` | 1..N (wajib) | RESTRICT |
| `locations` | `accessories` | `location_id` | 1..N (wajib) | RESTRICT |
| `departments` | `accounts` | `department_id` | 1..N (opsional) | SET NULL |
| `departments` | `assets` | `department_id` | 1..N (opsional) | SET NULL |
| `departments` | `assignments` | `department_id` | 1..N (opsional) | SET NULL |
| `departments` | `bast` | `department_id` | 1..N (opsional) | SET NULL |
| `departments` | `bast_signatories` | `department_id` | 1..N (opsional) | SET NULL |
| `categories` | `models` | `category_id` | 1..N (opsional) | SET NULL |
| `categories` | `assets` | `category_id` | 1..N (wajib) | RESTRICT |
| `categories` | `accessories` | `category_id` | 1..N (wajib) | RESTRICT |
| `brands` | `models` | `brand_id` | 1..N (wajib) | RESTRICT |
| `brands` | `assets` | `brand_id` | 1..N (opsional) | RESTRICT |
| `brands` | `accessories` | `brand_id` | 1..N (opsional) | RESTRICT |
| `models` | `assets` | `model_id` | 1..N (opsional) | RESTRICT |
| `vendors` | `assets` | `vendor_id` | 1..N (opsional) | RESTRICT |
| `vendors` | `maintenance_records` | `vendor_id` | 1..N (opsional) | SET NULL |
| `vendors` | `accessories` | `vendor_id` | 1..N (opsional) | RESTRICT |
| `asset_statuses` | `assets` | `status_id` | 1..N (wajib) | RESTRICT |
| `asset_statuses` | `asset_status_changes` | `from_status` | 1..N (opsional) | NO ACTION |
| `asset_statuses` | `asset_status_changes` | `to_status` | 1..N (wajib) | NO ACTION |
| `asset_conditions` | `assets` | `condition_id` | 1..N (wajib) | RESTRICT |
| `asset_conditions` | `asset_status_changes` | `from_condition` | 1..N (opsional) | NO ACTION |
| `asset_conditions` | `asset_status_changes` | `to_condition` | 1..N (opsional) | NO ACTION |
| `companies` | `accounts` | `company_id` | 1..N (opsional) | RESTRICT |
| `units` | `assets` | `unit_id` | 1..N (opsional) | RESTRICT |
| `auth.users` | `accounts` | `auth_user_id` | **0..1 : 1** (unique) | SET NULL |
| `accounts` | `accounts` | `created_by` | 1..N (self-reference) | NO ACTION |
| `accounts` | `account_scope_preferences` | `account_id` | 1..N (wajib) | CASCADE |
| `accounts` | `assets` | `assigned_to` | 1..N (opsional) | SET NULL |
| `accounts` | `assets` | `assigned_to_secondary` | 1..N (opsional) | SET NULL |
| `accounts` | `assets` | `created_by` | 1..N (opsional) | NO ACTION |
| `accounts` | `assignments` | `account_id` | 1..N (wajib) | RESTRICT |
| `accounts` | `assignments` | `secondary_account_id` | 1..N (opsional) | RESTRICT |
| `accounts` | `assignments` | `created_by` | 1..N (opsional) | NO ACTION |
| `accounts` | `movements` | `moved_by` | 1..N (wajib) | NO ACTION |
| `accounts` | `asset_status_changes` | `changed_by` | 1..N (opsional) | NO ACTION |
| `accounts` | `asset_photos` | `created_by` | 1..N (opsional) | NO ACTION |
| `accounts` | `asset_tags` | `tagged_by`, `voided_by`, `created_by` | 1..N (opsional, 3 kolom) | NO ACTION |
| `accounts` | `documents` | `uploaded_by` | 1..N (opsional) | NO ACTION |
| `accounts` | `maintenance_records` | `created_by` | 1..N (opsional) | NO ACTION |
| `accounts` | `bast` | `account_id` | 1..N (wajib) | RESTRICT |
| `accounts` | `bast` | `secondary_account_id` | 1..N (opsional) | RESTRICT |
| `accounts` | `bast` | `created_by` | 1..N (opsional) | NO ACTION |
| `accounts` | `bast_versions` | `uploaded_by` | 1..N (opsional) | NO ACTION |
| `accounts` | `bast_signatories` | `created_by` | 1..N (opsional) | NO ACTION |
| `accounts` | `bast_signatures` | `recorded_by` | 1..N (opsional) | NO ACTION |
| `accounts` | `notifications` | `account_id` | 1..N (wajib) | CASCADE |
| `accounts` | `import_batches` | `imported_by` | 1..N (opsional) | NO ACTION |
| `accounts` | `audit_log` | `actor_id` | 1..N (opsional) | NO ACTION |
| `accounts` | `accessories` | `created_by` | 1..N (opsional) | NO ACTION |
| `accounts` | `accessory_checkouts` | `account_id` | 1..N (wajib) | RESTRICT |
| `accounts` | `accessory_checkouts` | `created_by` | 1..N (opsional) | NO ACTION |
| `assets` | `assignments` | `asset_id` | 1..N (wajib) | RESTRICT |
| `assets` | `movements` | `asset_id` | 1..N (wajib) | RESTRICT |
| `assets` | `asset_status_changes` | `asset_id` | 1..N (wajib) | RESTRICT |
| `assets` | `asset_photos` | `asset_id` | 1..N (wajib) | **CASCADE** |
| `assets` | `asset_tags` | `asset_id` | **1..1** (unique) | RESTRICT |
| `assets` | `documents` | `asset_id` | 1..N (wajib) | **CASCADE** |
| `assets` | `maintenance_records` | `asset_id` | 1..N (wajib) | RESTRICT |
| `assets` | `bast` | `asset_id` | 1..N (opsional sejak `20260821090300:31`) | RESTRICT |
| `assets` | `notifications` | `asset_id` | 1..N (opsional) | **CASCADE** |
| `assignments` | `bast` | `assignment_id` | 1..N (opsional) | SET NULL |
| `bast` | `bast_versions` | `bast_id` | 1..N (wajib) | **CASCADE** |
| `bast` | `bast_items` | `bast_id` | 1..N (wajib) | **CASCADE** |
| `bast` | `bast_signatures` | `bast_id` | 1..N (wajib) | RESTRICT |
| `bast` | `documents` | `bast_id` | 1..N (opsional) | SET NULL |
| `bast` | `notifications` | `bast_id` | 1..N (opsional) | **CASCADE** |
| `bast` | `accessory_checkouts` | `bast_id` | 1..N (opsional) | SET NULL |
| `accessories` | `accessory_checkouts` | `accessory_id` | 1..N (wajib) | RESTRICT |

Baris pertama tabel di atas sengaja diisi *(tidak ada relasi)* untuk menegaskan
bahwa `locations` dan `models` tidak berhubungan langsung.

### 7.2 Dua relasi non-1..N

Hanya ada dua relasi yang bukan satu-ke-banyak, dan keduanya ditegakkan oleh
`unique` pada kolom FK:

| Relasi | Kolom | Kardinalitas | Sumber |
| --- | --- | --- | --- |
| `auth.users` → `accounts` | `accounts.auth_user_id` unique | 0..1 : 1 — satu akun paling banyak satu auth user, dan sebaliknya | `init_schema:143` |
| `assets` → `asset_tags` | `asset_tags.asset_id` unique | 1..1 — satu aset paling banyak satu stiker | `20260730080000:34` |

Yang kedua adalah setengah dari aturan inti modul label; setengah lainnya adalah
CHECK `tag_status_matches_asset` (§2.9).

### 7.3 Empat kelompok perilaku ON DELETE

Ringkasan pola yang terlihat setelah seluruh 44 FK dibaca:

1. **RESTRICT ke master data dan ke aset** — pola bawaan. Menghapus record yang
   masih dipakai menghasilkan error 23503 yang ditangkap lapisan API dan diubah
   menjadi kalimat "Cannot delete … still used by n assets"
   (`init_schema:134-136`).
2. **SET NULL untuk atribut opsional** — `department_id`, `location_id` pada
   `accounts`, `assigned_to` pada `assets`, `vendor_id` pada
   `maintenance_records`. Menghapus induknya melemahkan data, tidak
   menggagalkannya.
3. **CASCADE hanya di tujuh tempat**, seluruhnya untuk data yang tidak punya
   makna sendiri tanpa induknya: `account_scope_preferences` (dua kolom),
   `asset_photos`, `documents`, `bast_versions`, `bast_items`, dan tiga kolom
   pada `notifications`.
4. **NO ACTION (tidak ditulis)** — seluruh kolom bertipe "siapa pelakunya"
   (`created_by`, `uploaded_by`, `moved_by`, `changed_by`, `recorded_by`,
   `imported_by`, `actor_id`, `tagged_by`, `voided_by`). Konsisten dan
   tampaknya disengaja: akun yang pernah melakukan sesuatu tidak dapat dihapus
   selama jejaknya masih ada. Lihat §8.10 untuk kualifikasi klaim ini.

---

## 8. Temuan: penyimpangan dan pertentangan

### 8.1 Tiga tabel punya `updated_at` yang tidak pernah diperbarui

`units`, `companies`, dan `accessories` masing-masing punya kolom
`updated_at timestamptz not null default now()`, tetapi **tidak** punya trigger
`set_updated_at`. Nilainya akan tetap sama dengan `created_at` selamanya, betapa
pun sering barisnya disunting.

Verifikasi:

```sh
# 14 tabel punya kolom updated_at
awk '/^[[:space:]]*create table/{tbl=$0; sub(/.*(table|exists)[[:space:]]+/,"",tbl); sub(/[[:space:]]*\(.*/,"",tbl); intbl=1} \
     intbl&&/^[[:space:]]+updated_at/{print tbl} /^\);/{intbl=0}' \
  supabase/migrations/*.sql | sort -u
# -> accessories accounts assets bast bast_signatories brands categories
#    companies departments locations maintenance_records models units vendors

# 11 trigger set_updated_at
grep -rn "execute function set_updated_at" supabase/migrations/*.sql | wc -l
# -> 11
```

14 − 11 = 3. Tabel yang tertinggal adalah tiga tabel termuda: `units` dan
`companies` (`20260820090200`) dan `accessories` (`20260821090200`). Pola
`set_updated_at` ditetapkan di migrasi pertama dan tampaknya terlewat ketika
tabel-tabel ini ditambahkan sepuluh bulan kemudian.

**Dampak:** setiap laporan atau layar yang mengurutkan perlengkapan menurut
"terakhir diubah" akan salah. `[BELUM TERVERIFIKASI — apakah ada kode di src/
yang benar-benar membaca ketiga kolom updated_at ini; pemeriksaan itu masuk
cakupan fase berikutnya.]`

### 8.2 DATABASE.md mengklaim setiap tabel punya `created_at` dan `updated_at`

`DATABASE.md:3-4` menyatakan:

> "All identifiers are `snake_case`; every table has `created_at`,
> `updated_at`, and (where a person acted) `created_by`."

Klaim itu tidak benar untuk skema yang ada sekarang.

- **Hanya 25 dari 33 tabel** punya `created_at`. Delapan yang tidak punya:
  `asset_statuses`, `asset_conditions`, `account_scope_preferences`,
  `asset_code_counters`, `bast_number_counters`, `tag_code_counters`,
  `asset_status_changes` (memakai `changed_at`), dan `bast_signatures`
  (memakai `signed_at`).
- **Hanya 14 dari 33 tabel** punya `updated_at`.

```sh
awk '/^[[:space:]]*create table/{tbl=$0; sub(/.*(table|exists)[[:space:]]+/,"",tbl); sub(/[[:space:]]*\(.*/,"",tbl); intbl=1} \
     intbl&&/^[[:space:]]+created_at/{print tbl} /^\);/{intbl=0}' \
  supabase/migrations/*.sql | sort -u | wc -l
# -> 25
```

Untuk tabel penghitung dan tabel jembatan, ketiadaan kolom itu wajar dan
tampak disengaja. Untuk `asset_statuses` dan `asset_conditions` — dua tabel
master yang dapat disunting admin lewat layar Master Data — ketiadaannya berarti
**tidak ada catatan kapan sebuah status atau kondisi diubah**, selain lewat
`audit_log`, dan kedua tabel itu juga tidak punya trigger audit (§8.9).

Sebaiknya kalimat di `DATABASE.md:3-4` diperbaiki, atau skripsi tidak mengutip
klaim itu.

### 8.3 `import_batches.kind` adalah text bebas, bukan enum

`20260820090300:36` menambahkan `kind text not null default 'assets'`, tanpa
CHECK dan tanpa tipe enum, padahal repositori ini memakai enum untuk sebelas
pembedaan sejenis lainnya (`bast_kind`, `tag_status`, `document_kind`, dan
seterusnya). Tidak ada apa pun di level database yang mencegah nilai ketiga yang
salah eja masuk ke kolom ini.

`[BELUM TERVERIFIKASI — nilai apa saja yang benar-benar ditulis ke kolom ini
oleh RPC import; perlu membaca import_assets() dan import_accounts() yang berada
di luar cakupan kamus data.]`

### 8.4 `asset_tags.batch_id` adalah uuid tanpa foreign key

`20260730080000:36` mendefinisikan `batch_id uuid,` — tanpa `references`. Tidak
ada tabel `tag_batches` di skema, sehingga nilai ini adalah pengenal yang
dibangkitkan dan dibagikan oleh `create_tag_batch()` untuk menandai satu kali
cetak. Komentar di `:35` menyebutnya "Which print run this sticker came from, so
a bad batch can be traced."

Konsekuensinya: batch tidak punya metadata sendiri — tidak ada kapan dicetak
sebagai satu kesatuan, siapa yang mencetak, atau berapa lembar. Semua itu hanya
dapat direkonstruksi dengan mengagregasi baris `asset_tags`. Ini keputusan
desain yang sah, tetapi **bukan** relasi, dan tidak boleh digambar sebagai
entitas di ERD skripsi.

### 8.5 `maintenance_records.cost` punya default tetapi nullable

`init_schema:369` menulis `cost numeric(16,2) default 0` — tanpa `not null`.
Bandingkan dengan `total_qty int not null default 0` pada `accessories`
(`20260821090200:40`), yang mengikuti pola yang benar.

Akibatnya `cost` bisa bernilai NULL bila pemanggil menulis NULL secara eksplisit,
dan setiap `sum(cost)` akan mengabaikannya diam-diam sementara `count(*)`
menghitungnya. Untuk laporan biaya perawatan, selisih itu tidak akan terlihat
sebagai error.

### 8.6 Satu aturan visibilitas BAST ditulis dua kali, dan sempat berbeda

Ketika `bast.asset_id` menjadi nullable (`20260821090300:31`), seluruh policy
pada **tabel** BAST dipindahkan ke `can_see_bast_row()`. Policy pada
`storage.objects` terlewat dan masih menyelesaikan path berkas menjadi aset lalu
memanggil `can_see_asset()` — yang bernilai false ketika tidak ada aset.

Akibatnya, dikutip dari `20260824090000_bast_storage_no_asset.sql:11-17`:

> "So a BAST Perlengkapan could be raised, read, edited and signed, and then
> failed at the last step with `new row violates row-level security policy`
> (AccessDenied, 403) when generate-bast-pdf tried to upload
> `bast/<id>/v1.pdf`. The document existed and could never become a PDF."

Yang membuat temuan ini layak masuk skripsi adalah cara ia ditemukan
(`20260824090000:19-21`):

> "Found by rendering one, which was only possible once the local edge runtime
> would start — reading the code had not shown it, because the code that was
> wrong lives in a different migration from the one that changed."

Perbaikannya (`20260824090000:31-37`) menambahkan
`storage_bast_location_id()`. Aturannya kini benar, tetapi **tetap tertulis di
dua tempat** yang harus dijaga tetap sinkron secara manual — penulisnya
mengakuinya di `:26-28`: "One rule, expressed twice, because storage policies
cannot see the bast row directly."

### 8.7 `bast_versions` append-only tetapi FK-nya CASCADE

`bast_versions.bast_id` memakai `on delete cascade` (`init_schema:327`),
sementara tabel yang sama punya trigger `bast_versions_no_delete` BEFORE DELETE
yang memanggil `forbid_mutation()` (`init_schema:341-342`).

Kedua aturan itu saling meniadakan: menghapus baris `bast` akan memicu CASCADE
ke `bast_versions`, yang lalu ditolak trigger dengan
`This table is append-only`. Hasil yang paling mungkin adalah **baris `bast`
tidak dapat dihapus sama sekali** selama ia punya versi.

Pola yang sama berlaku untuk `bast_items` (CASCADE, tanpa trigger — jadi aman)
dan `bast_signatures` (RESTRICT, dengan trigger — konsisten).

`[BELUM TERVERIFIKASI — perilaku sesungguhnya saat DELETE dijalankan; ini
memerlukan database yang berjalan. Yang saya nyatakan di sini adalah bahwa dua
aturan di DDL bertentangan secara logis, bukan hasil eksekusi.]` Perlu dicatat
bahwa `20260824090300_delete_account_and_void_bast.sql` menambahkan RPC untuk
mem-*void* BAST, bukan menghapusnya — yang konsisten dengan dugaan bahwa
penghapusan memang tidak pernah dilakukan.

### 8.8 `import_batches` append-only hanya lewat satu lapis

Aturan kerja proyek menuntut penegakan tiga lapis untuk tabel append-only, dan
`movements`, `bast_versions`, serta `audit_log` memang mendapatkannya: grant
sempit, `revoke` eksplisit, dan trigger `forbid_mutation()`
(`20260729120000_grants.sql:22-24`).

`import_batches` hanya mendapat lapis pertama — `grant select, insert`
(`grants.sql:61`). Ia **tidak** disebut dalam pernyataan `revoke` di
`init_schema:433` maupun `grants.sql:83`, dan tidak punya trigger apa pun.

```sh
grep -rn "revoke update, delete" supabase/migrations/*.sql
# 2 hasil, keduanya menyebut: audit_log, movements, bast_versions
```

Ini mungkin memang disengaja — komentar di `grants.sql:57-61` mengelompokkan
`import_batches` bersama tabel append-only, tetapi bagian `revoke` di bawahnya
tidak ikut menyebutnya. Selisih antara komentar dan kode inilah yang saya
laporkan; mana yang benar adalah keputusan Anda.

### 8.9 Dua belas dari 33 tabel punya trigger audit

```sh
grep -rn "execute function audit_row" supabase/migrations/*.sql | wc -l
# -> 12
```

Yang **tidak** diaudit trigger mencakup dua tabel yang menyimpan tindakan
manusia dan tampak layak diaudit:

- **`documents`** — unggah dan hapus dokumen aset tidak meninggalkan jejak di
  `audit_log` lewat trigger, padahal `document_uploaded` **ada** sebagai nilai
  `audit_action` (`init_schema:28`). Nilai enum itu karenanya hanya dapat
  ditulis oleh RPC, bukan oleh trigger.
- **`bast_items`** — baris barang pada BAST dapat disunting selama dokumen masih
  draft, tanpa jejak trigger.

Selebihnya wajar tidak diaudit: tabel penghitung, tabel jembatan, dan
`audit_log` sendiri.

`[BELUM TERVERIFIKASI — apakah RPC add_document()/delete_document() menulis
sendiri ke audit_log; membaca badan RPC berada di luar cakupan Fase 2 dan
dijadwalkan untuk fase RPC.]` Perlu dicatat bahwa aturan kerja proyek melarang
penulisan langsung ke `audit_log`, sehingga bila RPC itu menulis sendiri, hal
tersebut justru menjadi temuan tersendiri.

### 8.10 Kualifikasi atas klaim "NO ACTION disengaja"

Di §7.3 poin 4 saya menyatakan bahwa seluruh kolom pelaku memakai NO ACTION
secara konsisten dan tampaknya disengaja. Yang terverifikasi adalah
**konsistensinya**: 19 kolom pelaku, tidak satu pun menuliskan `on delete`.

`[BELUM TERVERIFIKASI — apakah itu keputusan sadar atau kelalaian yang berulang.
Tidak ada komentar di migrasi mana pun yang menjelaskan pilihan NO ACTION untuk
kolom pelaku, berbeda dari FK master data yang alasannya ditulis eksplisit di
init_schema:134-136.]` Karena `accounts` juga tidak pernah benar-benar dihapus
— `20260824090300_delete_account_and_void_bast.sql` ada untuk itu — perbedaan
antara "disengaja" dan "tidak pernah diuji" mungkin memang tidak pernah muncul
di produksi.

### 8.11 Koreksi atas Fase 1 §8.1: alasan pembatalan larangan barcode DITEMUKAN

Pada dokumen [01-inventaris.md](01-inventaris.md) §8.1 saya menulis
`[BELUM TERVERIFIKASI — tidak ditemukan catatan, komentar, atau pesan commit
yang menjelaskan mengapa larangan di README.md:15 dibatalkan.]`

**Penanda itu sekarang dapat dicabut.** Alasannya ada, tertulis lengkap di
header migrasi yang membuat tabelnya —
`20260730080000_asset_tags.sql:4-9`:

> "**REVERSES AN EARLIER CONSTRAINT, ON THE CLIENT'S INSTRUCTION**
>
> README states the physical stickers already exist and that scanning is out of
> scope. On 2026-07-30 the client replaced that with the opposite: stickers are
> pre-printed BLANK, carrying only a code, and are meaningless until someone
> sticks one on a device and records what it is."

Jadi ini bukan penyimpangan diam-diam dari spesifikasi, melainkan **perubahan
requirement dari klien pada 2026-07-30 yang dicatat di tempat perubahannya
terjadi**. Untuk skripsi ini justru bahan yang kuat: ada tanggal, ada pihak yang
memutuskan, dan ada alasan teknis yang mengikutinya (siklus hidup
untagged → tagged → void).

Yang tetap menjadi temuan adalah bahwa **`README.md:15` tidak pernah
diperbarui** dan masih memuat larangan yang sudah dibatalkan sebelas bulan lalu.
Pertentangan yang dilaporkan di Fase 1 tetap berdiri sebagai pertentangan
dokumentasi; yang berubah adalah ia bukan lagi pertentangan yang tidak dapat
dijelaskan.

Pola yang sama terlihat di `20260731090000_ebast_signatures.sql:4-8`, yang
mencatat instruksi klien 2026-07-30 dalam bahasa aslinya ("ganti BAST menjadi
E-BAST yang serba digital", "saya mau ttd digital dengan langsung tanda tangan
dari layar secara langsung"), dan di `20260731140000_status_changes.sql:4-5`.
Repositori ini secara konsisten mencatat instruksi klien di header migrasi —
kebiasaan yang berharga untuk bab metodologi.

---

## 9. Ringkasan hal yang belum terverifikasi di Fase 2

| # | Butir | Alasan | Cara menutupnya |
| ---: | --- | --- | --- |
| 1 | Nama CHECK constraint yang tidak ditulis eksplisit (6 buah) | PostgreSQL yang menamai; tidak terbaca dari DDL | Query `pg_constraint` pada database yang berjalan |
| 2 | Perilaku DELETE pada `bast` yang punya `bast_versions` (§8.7) | Dua aturan DDL bertentangan; hasil eksekusi belum diuji | Jalankan DELETE pada stack lokal |
| 3 | Apakah kode di `src/` membaca `updated_at` milik `units`/`companies`/`accessories` (§8.1) | Di luar cakupan kamus data | Fase pembacaan `src/` |
| 4 | Nilai sah `import_batches.kind` (§8.3) | Perlu membaca badan RPC import | Fase RPC |
| 5 | Apakah RPC dokumen menulis sendiri ke `audit_log` (§8.9) | Perlu membaca badan RPC | Fase RPC |
| 6 | Apakah NO ACTION pada kolom pelaku disengaja (§8.10) | Tidak ada komentar yang menjelaskan | Tanyakan kepada penulis kode |
| 7 | Kecocokan skema hasil rekonstruksi ini dengan katalog sistem | Tidak ada database berjalan | `supabase db reset` lalu bandingkan dengan `information_schema` |

Butir 7 adalah yang paling berharga dan paling murah: satu kali `supabase start`
dan `supabase db reset` akan mengubah seluruh dokumen ini dari "rekonstruksi
dari DDL" menjadi "terverifikasi terhadap database yang berjalan". Saya
menyarankan itu dilakukan sebelum dokumen ini masuk naskah.
