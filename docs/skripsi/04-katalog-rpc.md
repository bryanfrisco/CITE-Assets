# 04 — Katalog RPC dan Fungsi Database CITE Assets

Hasil Fase 4: seluruh **135 fungsi** yang terdefinisi di `supabase/migrations/`,
dikelompokkan per modul.

**Tanggal:** 2026-08-31  
**Revisi:** working tree di atas commit `cd0d9f3`

---

## 0. Metode dan cara membaca

### 0.1 Definisi terakhir yang berlaku

Migrasi bersifat aditif dan sebuah fungsi dapat didefinisikan ulang berkali-kali
dengan `create or replace`. Yang didokumentasikan di sini adalah **definisi
terakhir menurut urutan nama berkas migrasi** — yaitu yang benar-benar hidup di
database. Jumlah pendefinisian tiap fungsi dicantumkan sebagai `Didefinisikan n×`;
bila n lebih dari satu, rujukan berkas menunjuk ke definisi terakhir, bukan yang pertama.

```sh
# 135 nama berbeda dari 191 pernyataan create function
grep -rhoiE "create[[:space:]]+(or[[:space:]]+replace[[:space:]]+)?function[[:space:]]+[a-z_]+" \
  supabase/migrations/*.sql | sed -E 's/.*[Ff]unction[[:space:]]+//' | sort -u | wc -l
```

### 0.2 Bagaimana tiap kolom diperoleh

| Bidang | Cara diperoleh |
| --- | --- |
| Signature, tipe kembalian, SECURITY, volatilitas, `search_path` | Diurai dari header definisi |
| Tabel ditulis | `insert into` / `update … set` / `delete from` pada 33 nama tabel yang dikenal, sesudah komentar dibuang |
| Tabel dibaca | `from` / `join` pada nama tabel yang dikenal, dikurangi yang sudah terhitung sebagai tulisan |
| Pesan galat | `raise exception '…'` dikutip **persis**, beserta `errcode` bila ada |
| Fungsi yang dipanggil | Identifier pemanggilan yang cocok dengan salah satu dari 135 nama |
| Dipanggil dari | `.rpc('nama')` di `src/`, dengan nomor baris |
| Dipakai di layar | Ditelusuri RPC → fungsi pembungkus di `src/api/*.ts` → berkas di `app/` yang mengimpornya |

### 0.3 Dua batasan yang harus Anda ketahui

1. **SQL dinamis tidak terbaca analisis statis.** Dua puluh dua pernyataan
   `execute format(...)` tersebar di empat migrasi. Fungsi master data
   (`master_rename`, `master_delete`, `master_set_active`) menulis lewat
   `format('%I')` sehingga kolom "Menulis ke" untuk ketiganya tampak kosong
   padahal mereka benar-benar menulis. Hal ini ditandai eksplisit pada
   entri yang bersangkutan.

   ```sh
   grep -rn "execute format" supabase/migrations/*.sql | wc -l   # -> 22
   ```

2. **Tidak ada database yang berjalan.** Seluruh isi dokumen ini dibaca dari DDL,
   bukan dari `pg_proc`. Karena PostgreSQL mengizinkan overloading, satu nama
   dapat memiliki lebih dari satu signature hidup bila `drop function` signature
   lama pernah terlewat. `[BELUM TERVERIFIKASI — jumlah entri pg_proc yang
   sesungguhnya; 135 adalah batas bawah.]`

### 0.4 Ringkasan angka

| Besaran | Jumlah |
| --- | ---: |
| Fungsi terdefinisi (nama berbeda) | 135 |
| Pernyataan `create function` | 191 |
| Dipanggil dari `src/` sebagai RPC | 87 |
| Dipakai sebagai fungsi trigger | 5 |
| Dipanggil Edge Function | 5 |
| Dipakai di policy RLS / storage | 9 |
| **Tidak dirujuk sama sekali (kode mati)** | **4** |
| Dipanggil klien tetapi definisinya tidak ada | **0** |
| Total baris badan fungsi (definisi terakhir) | 5.443 |

---

## M1. Sesi, identitas, dan otorisasi

17 fungsi.

### `bootstrap_session`

```sql
bootstrap_session()
  returns jsonb
  language plpgsql stable security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260729100000_auth_session.sql:42`
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Mengembalikan seluruh yang dibutuhkan klien saat aplikasi dibuka dalam satu round trip: baris akun, perannya, daftar lokasi yang boleh dilihat, dan scope tersimpannya. SECURITY DEFINER karena ia membaca `account_scope_preferences` dan `locations` untuk pengguna yang konteks RLS-nya justru sedang dibangun. Scope tersimpan dipotong dengan `my_location_ids()` sebelum dikembalikan, sehingga Site IT tidak bisa memperlebar aksesnya dengan menyunting preferensi. Bila akun tidak ada atau dinonaktifkan, ia mengembalikan `{'account': null}` alih-alih melempar galat.

- **Menulis ke:** —
- **Membaca:** `account_scope_preferences`, `accounts`, `departments`, `locations`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** `my_location_ids()`
- **Dipanggil dari:** `src/api/session.ts:52`
- **Pembungkus TS:** `bootstrapSession()` di `src/api/session.ts`
- **Dipakai di layar:** — (lihat §Z.3)

### `link_auth_user_to_account`

```sql
link_auth_user_to_account()
  returns trigger
  language plpgsql security definer set search_path = public,
```

- **Definisi:** `supabase/migrations/20260729100000_auth_session.sql:19`
- **Security:** SECURITY DEFINER
- **Kembalian:** `trigger`

**Tujuan.** Trigger di `auth.users` yang menyambungkan pengguna Auth baru ke baris `accounts` yang sudah menunggu, dicocokkan lewat email case-insensitive. Hanya mengisi baris yang `auth_user_id`-nya masih null dan `can_login` bernilai true, sehingga akun harus dibuat lebih dulu oleh Super Admin — pendaftaran mandiri dimatikan di `supabase/config.toml:34`.

- **Menulis ke:** `accounts` (UPDATE)
- **Membaca:** —
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipasang sebagai trigger:** `auth_user_created` pada `auth.users`
- **Dipanggil dari:** bukan RPC — dijalankan sebagai trigger

### `my_account_id`

```sql
my_account_id()
  returns uuid
  language sql stable security definer
```

- **Definisi:** `supabase/migrations/20260729090100_rls.sql:53`
- **Security:** SECURITY DEFINER  ⚠ tanpa `set search_path`
- **Kembalian:** `uuid`

**Tujuan.** Mengembalikan id akun pemanggil dari view `v_me`. Dipakai hampir setiap RPC tulis untuk mengisi kolom pelaku (`created_by`, `changed_by`, dan sejenisnya).

- **Menulis ke:** —
- **Membaca:** —
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat policy RLS/storage, fungsi SQL lain. Contoh rujukan: `20260729090100_rls.sql:145`, `20260729090100_rls.sql:146`, `20260729090100_rls.sql:156`

### `my_role`

```sql
my_role()
  returns user_role
  language sql stable security definer
```

- **Definisi:** `supabase/migrations/20260729090100_rls.sql:48`
- **Security:** SECURITY DEFINER  ⚠ tanpa `set search_path`
- **Kembalian:** `user_role`

**Tujuan.** Mengembalikan `user_role` pemanggil dari `v_me`. Fondasi setiap pemeriksaan izin di seluruh sistem.

- **Menulis ke:** —
- **Membaca:** —
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat policy RLS/storage, fungsi SQL lain. Contoh rujukan: `20260729090100_rls.sql:69`, `20260729090100_rls.sql:78`, `20260729090100_rls.sql:82`

### `my_location_ids`

```sql
my_location_ids()
  returns setof uuid
  language sql stable security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260729110000_fix_my_location_ids.sql:31` · Didefinisikan 2×
- **Security:** SECURITY DEFINER
- **Kembalian:** `setof uuid`

**Tujuan.** Mengembalikan himpunan lokasi yang boleh dilihat pemanggil: seluruh lokasi untuk Super Admin dan Corporate IT, hanya lokasi sendiri untuk Site IT dan Viewer. Inilah fungsi yang paling banyak dipanggil policy RLS. Definisi awal di DATABASE.md memakai subquery skalar `(select id from locations)` yang langsung gagal begitu ada lebih dari satu lokasi — persis keadaan setelah seed — dengan `more than one row returned by a subquery used as an expression`, sehingga Super Admin tidak bisa membaca baris apa pun. Migrasi ini menggantinya dengan query set-returning yang benar sambil mempertahankan deny-by-default: tanpa baris `v_me`, kedua cabang menghasilkan nol baris.

- **Menulis ke:** —
- **Membaca:** `locations`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat policy RLS/storage, fungsi SQL lain. Contoh rujukan: `20260729090100_rls.sql:63`, `20260729090100_rls.sql:75`, `20260729090100_rls.sql:79`

### `can_see_asset`

```sql
can_see_asset(p_asset uuid)
  returns boolean
  language sql stable security definer
```

- **Definisi:** `supabase/migrations/20260729090100_rls.sql:59`
- **Security:** SECURITY DEFINER  ⚠ tanpa `set search_path`
- **Kembalian:** `boolean`

**Tujuan.** Menjawab apakah sebuah aset berada dalam scope pemanggil, dengan memeriksa `assets.location_id` terhadap `my_location_ids()`. Dipakai oleh setiap tabel anak aset sebagai satu-satunya definisi keterlihatan.

- **Menulis ke:** —
- **Membaca:** `assets`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** `my_location_ids()`
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat policy RLS/storage, fungsi SQL lain. Contoh rujukan: `20260729090100_rls.sql:90`, `20260729090100_rls.sql:92`, `20260729090100_rls.sql:94`

### `can_write_assets`

```sql
can_write_assets()
  returns boolean
  language sql stable security definer
```

- **Definisi:** `supabase/migrations/20260729090100_rls.sql:67`
- **Security:** SECURITY DEFINER  ⚠ tanpa `set search_path`
- **Kembalian:** `boolean`

**Tujuan.** Menjawab apakah peran pemanggil boleh menulis data aset — benar untuk `super_admin`, `corporate_it`, dan `site_it`, salah untuk `viewer`. Dipakai berulang oleh RPC SECURITY DEFINER yang harus menyatakan ulang penjagaan yang seharusnya dilakukan RLS.

- **Menulis ke:** —
- **Membaca:** —
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** `my_role()`
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat policy RLS/storage, fungsi SQL lain. Contoh rujukan: `20260729090100_rls.sql:92`, `20260729090100_rls.sql:94`, `20260729090100_rls.sql:102`

### `can_see_bast_row`

```sql
can_see_bast_row(
    p_asset uuid,
    p_location uuid
)
  returns boolean
  language sql stable security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260821090300_accessory_bast.sql:39`
- **Security:** SECURITY DEFINER
- **Kembalian:** `boolean`

**Tujuan.** Satu definisi terpusat untuk 'bolehkah orang ini melihat BAST ini'. Bila `p_asset` null — kasus BAST Perlengkapan sejak `asset_id` dilonggarkan — keputusan jatuh ke `p_location`; bila tidak, ke `can_see_asset()`. Ditulis sebagai fungsi alih-alih diulang inline supaya hanya ada satu tempat cadangan itu bisa salah.

- **Menulis ke:** —
- **Membaca:** —
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** `can_see_asset()`, `my_location_ids()`
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat policy RLS/storage, fungsi SQL lain. Contoh rujukan: `20260821090300_accessory_bast.sql:52`, `20260821090300_accessory_bast.sql:54`, `20260821090300_accessory_bast.sql:56`

### `can_see_bast_file`

```sql
can_see_bast_file(p_name text)
  returns boolean
  language sql stable security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260824090000_bast_storage_no_asset.sql:41`
- **Security:** SECURITY DEFINER
- **Kembalian:** `boolean`

**Tujuan.** Cermin `can_see_bast_row()` untuk policy `storage.objects`, yang tidak dapat membaca baris `bast` secara langsung sehingga harus menyelesaikan path berkas lebih dulu. Aturan yang sama, ditulis dua kali, dan itu diakui penulisnya sebagai konsekuensi yang tidak terhindarkan.

- **Menulis ke:** —
- **Membaca:** —
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** `can_see_asset()`, `my_location_ids()`, `storage_bast_asset_id()`, `storage_bast_location_id()`
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat policy RLS/storage. Contoh rujukan: `20260824090000_bast_storage_no_asset.sql:55`, `20260824090000_bast_storage_no_asset.sql:58`, `20260824090000_bast_storage_no_asset.sql:61`

### `set_account_scope`

```sql
set_account_scope(p_locations uuid[])
  returns jsonb
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260729100000_auth_session.sql:101`
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Menyimpan pilihan scope pengguna ke `account_scope_preferences`, menghapus baris lama lalu menulis yang baru dalam satu transaksi. Lokasi yang dikirim dipotong dengan `my_location_ids()` di sini juga, sehingga preferensi tersimpan tidak akan pernah melebihi yang diizinkan RLS.

- **Menulis ke:** `account_scope_preferences` (DELETE/INSERT)
- **Membaca:** `accounts`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `No active account for the current session` | — |

- **Memanggil fungsi lain:** `my_location_ids()`
- **Dipanggil dari:** `src/api/session.ts:65`
- **Pembungkus TS:** `setAccountScope()` di `src/api/session.ts`
- **Dipakai di layar:** — (lihat §Z.3)

### `other_super_admins`

```sql
other_super_admins(p_except uuid)
  returns int
  language sql stable security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260731170000_account_management.sql:85`
- **Security:** SECURITY DEFINER
- **Kembalian:** `int`

**Tujuan.** Menghitung Super Admin lain yang masih aktif dan bisa login, di luar id yang dikecualikan. Dipakai sebagai penjaga agar Super Admin terakhir tidak dapat menghapus dirinya, mencabut perannya, atau mematikan loginnya sendiri.

- **Menulis ke:** —
- **Membaca:** `accounts`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat fungsi SQL lain. Contoh rujukan: `20260731170000_account_management.sql:213`, `20260731170000_account_management.sql:261`, `20260731170000_account_management.sql:295`

### `assert_can_manage_accounts`

```sql
assert_can_manage_accounts()
  returns void
  language plpgsql stable security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260731170000_account_management.sql:71`
- **Security:** SECURITY DEFINER
- **Kembalian:** `void`

**Tujuan.** Penjaga bersama untuk setiap operasi tulis pada akun: melempar galat kecuali peran pemanggil adalah `super_admin`. Dipanggil di baris pertama hampir semua RPC modul akun.

- **Menulis ke:** —
- **Membaca:** —
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Only a Super Admin can manage accounts` | `P0001` |

- **Memanggil fungsi lain:** `my_role()`
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat fungsi SQL lain. Contoh rujukan: `20260731170000_account_management.sql:106`, `20260731170000_account_management.sql:180`, `20260731170000_account_management.sql:247`

### `account_for_credentials`

```sql
account_for_credentials(p_id uuid)
  returns jsonb
  language plpgsql stable security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260731170000_account_management.sql:276`
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Menyediakan satu fakta yang dibutuhkan Edge Function `manage-account` di bawah token pemanggil sendiri, sebelum ia beralih ke service role: bolehkah orang ini mengelola akun, dan email mana yang sedang ditangani. Mengembalikan keduanya dalam satu panggilan supaya Edge Function tidak perlu mempercayai apa pun yang dikirim klien.

- **Menulis ke:** —
- **Membaca:** `accounts`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Account not found` | `P0001` |

- **Memanggil fungsi lain:** `assert_can_manage_accounts()`, `other_super_admins()`
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat Edge Function. Contoh rujukan: `supabase/functions/manage-account/index.ts:166`

### `set_account_login`

```sql
set_account_login(
    p_id uuid,
    p_can_login boolean
)
  returns jsonb
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260731170000_account_management.sql:243`
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Menyalakan atau mematikan kemampuan login sebuah akun, terpisah dari `update_account()` supaya Edge Function dapat mengerjakan dua paruh proses dalam urutan yang benar tanpa mengirim ulang seluruh formulir. Menolak menyalakan login bila peran atau email belum ada, dan menolak mematikan login Super Admin terakhir.

- **Menulis ke:** `accounts` (UPDATE)
- **Membaca:** —
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Account not found` | `P0001` |
  | `Choose a role before this account can log in` | `P0001` |
  | `An email address is required for an account that logs in` | `P0001` |
  | `This is the only Super Admin left — give someone else the role first` | `P0001` |

- **Memanggil fungsi lain:** `assert_can_manage_accounts()`, `other_super_admins()`
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat Edge Function. Contoh rujukan: `supabase/functions/manage-account/index.ts:178`, `supabase/functions/manage-account/index.ts:211`, `supabase/functions/manage-account/index.ts:217`

### `storage_asset_id`

```sql
storage_asset_id(p_name text)
  returns uuid
  language plpgsql immutable security invoker
```

- **Definisi:** `supabase/migrations/20260729170000_asset_photos_storage.sql:22`
- **Security:** SECURITY INVOKER (bawaan — tidak ditulis di DDL)
- **Kembalian:** `uuid`

**Tujuan.** Mengurai `storage.objects.name` berbentuk `<asset_id>/<uuid>.jpg` menjadi uuid aset. Path yang rusak menghasilkan null lewat blok exception, yang berarti tidak ada akses — deny-by-default.

- **Menulis ke:** —
- **Membaca:** —
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat policy RLS/storage, fungsi SQL lain. Contoh rujukan: `20260729170000_asset_photos_storage.sql:33`, `20260729170000_asset_photos_storage.sql:40`, `20260729170000_asset_photos_storage.sql:47`

### `storage_bast_asset_id`

```sql
storage_bast_asset_id(p_name text)
  returns uuid
  language plpgsql stable security invoker
```

- **Definisi:** `supabase/migrations/20260729200000_bast.sql:142`
- **Security:** SECURITY INVOKER (bawaan — tidak ditulis di DDL)
- **Kembalian:** `uuid`

**Tujuan.** Menyelesaikan path berkas BAST menjadi `asset_id` dokumennya. Bernilai null untuk BAST Perlengkapan yang memang tidak punya aset, dan itulah yang memicu perlunya fungsi berikutnya.

- **Menulis ke:** —
- **Membaca:** —
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat policy RLS/storage, fungsi SQL lain. Contoh rujukan: `20260729200000_bast.sql:154`, `20260729200000_bast.sql:160`, `20260729200000_bast.sql:167`

### `storage_bast_location_id`

```sql
storage_bast_location_id(p_name text)
  returns uuid
  language plpgsql stable security invoker
```

- **Definisi:** `supabase/migrations/20260824090000_bast_storage_no_asset.sql:31`
- **Security:** SECURITY INVOKER (bawaan — tidak ditulis di DDL)
- **Kembalian:** `uuid`

**Tujuan.** Menyelesaikan path berkas BAST menjadi `location_id` dokumennya, sebagai cadangan ketika tidak ada aset. Ditambahkan setelah ketahuan bahwa BAST Perlengkapan dapat dibuat, dibaca, disunting, dan ditandatangani, lalu gagal di langkah terakhir dengan `new row violates row-level security policy` saat PDF-nya diunggah — cacat yang hanya muncul saat dokumen benar-benar dirender.

- **Menulis ke:** —
- **Membaca:** —
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat fungsi SQL lain. Contoh rujukan: `20260824090000_bast_storage_no_asset.sql:45`

---

## M2. Manajemen akun

6 fungsi.

### `accounts_list`

```sql
accounts_list(p_search text default null)
  returns table ( id uuid, full_name text, nik text, email text, phone text, job_title text, department_id uuid, department_name text, company_id uuid, company_name text, location_id uuid, location_name text, role user_role, can_login boolean, has_credentials boolean, is_active boolean, is_me boolean )
  language sql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260821090900_account_company.sql:169` · Didefinisikan 3×
- **Security:** SECURITY INVOKER
- **Kembalian:** `table ( id uuid, full_name text, nik text, email text, phone text, job_title text, department_id uuid, department_name text, company_id uuid, company_name text, location_id uuid, location_name text, role user_role, can_login boolean, has_credentials boolean, is_active boolean, is_me boolean )`

**Tujuan.** Daftar akun untuk layar Accounts, lengkap dengan nama departemen, perusahaan, dan lokasi hasil join, ditambah `has_credentials` (apakah `auth_user_id` terisi) dan `is_me`. SECURITY INVOKER karena `accounts` memang dapat dibaca setiap pengguna yang login lewat policy `accounts_read`.

- **Menulis ke:** —
- **Membaca:** `accounts`, `companies`, `departments`, `locations`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** `my_account_id()`
- **Dipanggil dari:** `src/api/accounts.ts:55`
- **Pembungkus TS:** `fetchAccounts()` di `src/api/accounts.ts`
- **Dipakai di layar:** `app/(tabs)/account-edit.tsx`, `app/(tabs)/accounts.tsx`

### `create_account`

```sql
create_account(
    p_full_name text,
    p_nik text default null,
    p_email text default null,
    p_phone text default null,
    p_department uuid default null,
    p_location uuid default null,
    p_role text default null,
    p_can_login boolean default false,
    p_job_title text default null,
    p_company uuid default null
)
  returns jsonb
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260821090900_account_company.sql:26` · Didefinisikan 3×
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Membuat baris `accounts` baru. Hanya Super Admin. Memvalidasi nama wajib, peran wajib bila akun boleh login, email wajib bila boleh login, serta keunikan NIK dan email sebelum menyisipkan. Tidak membuat pengguna Auth — kredensial diterbitkan terpisah lewat Edge Function `manage-account`.

- **Menulis ke:** `accounts` (INSERT)
- **Membaca:** —
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `A name is required` | `P0001` |
  | `Unknown role` | `P0001` |
  | `Choose a role before this account can log in` | `P0001` |
  | `An email address is required for an account that logs in` | `P0001` |
  | `Choose a location — this role only sees its own` | `P0001` |
  | `That NIK or email is already on another account` | `P0001` |

- **Memanggil fungsi lain:** `assert_can_manage_accounts()`, `my_account_id()`
- **Dipanggil dari:** `src/api/accounts.ts:76`
- **Pembungkus TS:** `createAccount()` di `src/api/accounts.ts`
- **Dipakai di layar:** `app/(tabs)/account-edit.tsx`

### `update_account`

```sql
update_account(
    p_id uuid,
    p_full_name text,
    p_nik text default null,
    p_email text default null,
    p_phone text default null,
    p_department uuid default null,
    p_location uuid default null,
    p_role text default null,
    p_can_login boolean default null,
    p_is_active boolean default null,
    p_job_title text default null,
    p_company uuid default null
)
  returns jsonb
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260821090900_account_company.sql:85` · Didefinisikan 3×
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Menyunting akun yang ada, dengan penjagaan yang sama seperti pembuatan ditambah perlindungan Super Admin terakhir: peran tidak boleh dicabut, akun tidak boleh dinonaktifkan, dan login tidak boleh dimatikan bila tidak ada Super Admin aktif lain.

- **Menulis ke:** `accounts` (UPDATE)
- **Membaca:** —
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Account not found` | `P0001` |
  | `Unknown role` | `P0001` |
  | `Choose a role before this account can log in` | `P0001` |
  | `An email address is required for an account that logs in` | `P0001` |
  | `Choose a location — this role only sees its own` | `P0001` |
  | `This is the only Super Admin left — give someone else the role first` | `P0001` |
  | `That NIK or email is already on another account` | `P0001` |

- **Memanggil fungsi lain:** `assert_can_manage_accounts()`, `other_super_admins()`
- **Dipanggil dari:** `src/api/accounts.ts:95`
- **Pembungkus TS:** `updateAccount()` di `src/api/accounts.ts`
- **Dipakai di layar:** `app/(tabs)/account-edit.tsx`

### `delete_account`

```sql
delete_account(
    p_id uuid,
    p_reason text default null
)
  returns jsonb
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260824090300_delete_account_and_void_bast.sql:33`
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Menghapus akun secara permanen, hanya untuk baris yang belum menyentuh apa pun. Mengumpulkan seluruh penghalang sekaligus — aset yang dipegang, penugasan, BAST, checkout perlengkapan — dan melaporkannya dalam satu kalimat, karena diberi tahu satu penghalang per percobaan adalah cara seseorang mencoba enam kali. Alasan wajib diisi dan ditulis ke `audit_log` sebelum baris hilang, sebab trigger audit tahu apa yang berubah tetapi tidak tahu mengapa.

- **Menulis ke:** `accounts` (DELETE); `audit_log` (INSERT)
- **Membaca:** `accessory_checkouts`, `asset_status_changes`, `assets`, `assignments`, `bast`, `bast_signatures`, `movements`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Account not found` | `P0001` |
  | `Say why this person is being deleted` | `P0001` |
  | `You cannot delete your own account` | `P0001` |
  | `This is the only Super Admin left — give someone else the role first` | `P0001` |
  | `% has % behind them. Set them to Inactive instead — deleting would leave those records naming nobody.` | `P0001` |

- **Memanggil fungsi lain:** `assert_can_manage_accounts()`, `my_account_id()`, `other_super_admins()`
- **Dipanggil dari:** `src/api/accounts.ts:195`
- **Pembungkus TS:** `deleteAccount()` di `src/api/accounts.ts`
- **Dipakai di layar:** `app/(tabs)/account-edit.tsx`

### `account_holdings`

```sql
account_holdings(p_account uuid)
  returns jsonb
  language sql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260821090800_value_analytics.sql:134`
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Menjawab 'orang ini sedang memegang apa' untuk kedua jenis barang: aset dan perlengkapan. Untuk aset ia juga menyebut peran pemegang — utama atau kedua — sebab tanpa itu sepasang pemegang radio bersama tampak seperti dua serah terima terpisah.

- **Menulis ke:** —
- **Membaca:** `accessories`, `accessory_checkouts`, `asset_statuses`, `assets`, `bast`, `categories`, `locations`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** `src/api/accounts.ts:178`
- **Pembungkus TS:** `fetchAccountHoldings()` di `src/api/accounts.ts`
- **Dipakai di layar:** `app/(tabs)/account-edit.tsx`

### `assignable_employees`

```sql
assignable_employees(p_locations uuid[])
  returns table ( id uuid, full_name text, nik text, department_name text, location_name text )
  language sql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260729180000_assign_return_movement.sql:279`
- **Security:** SECURITY INVOKER
- **Kembalian:** `table ( id uuid, full_name text, nik text, department_name text, location_name text )`

**Tujuan.** Memasok langkah pertama wizard penugasan: daftar orang yang dapat menerima aset, dengan nama departemen dan lokasi. SECURITY INVOKER karena tidak ada elevasi yang perlu di sini.

- **Menulis ke:** —
- **Membaca:** `accounts`, `departments`, `locations`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** `src/api/assignments.ts:21`
- **Pembungkus TS:** `fetchAssignableEmployees()` di `src/api/assignments.ts`
- **Dipakai di layar:** `app/(tabs)/accessory/[id].tsx`, `app/(tabs)/assign.tsx`

---

## M3. Master data

11 fungsi.

### `master_assert_entity`

```sql
master_assert_entity(p_entity text)
  returns text
  language plpgsql immutable security invoker
```

- **Definisi:** `supabase/migrations/20260729130000_master_data_rpcs.sql:41`
- **Security:** SECURITY INVOKER (bawaan — tidak ditulis di DDL)
- **Kembalian:** `text`

**Tujuan.** Menerjemahkan slug entitas master menjadi nama tabel dan melempar galat bila slug tidak dikenal. Gerbang yang dilewati setiap RPC master data sebelum menyusun SQL dinamis, sehingga nama tabel tidak pernah berasal langsung dari klien.

- **Menulis ke:** —
- **Membaca:** —
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Unknown master data entity: %` | `P0001` |

- **Memanggil fungsi lain:** `master_table()`
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat fungsi SQL lain. Contoh rujukan: `20260729130000_master_data_rpcs.sql:64`, `20260729130000_master_data_rpcs.sql:111`, `20260729130000_master_data_rpcs.sql:207`

### `master_table`

```sql
master_table(p_entity text)
  returns text
  language sql immutable security invoker
```

- **Definisi:** `supabase/migrations/20260820090200_units_and_companies.sql:113` · Didefinisikan 2×
- **Security:** SECURITY INVOKER (bawaan — tidak ditulis di DDL)
- **Kembalian:** `text`

**Tujuan.** Peta slug entitas ke nama tabel sesungguhnya — sepuluh cabang, dari `category` sampai `company`. IMMUTABLE dan tanpa akses tabel; inilah satu-satunya tempat daftar entitas master ditulis.

- **Menulis ke:** —
- **Membaca:** —
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat fungsi SQL lain. Contoh rujukan: `20260729130000_master_data_rpcs.sql:45`

### `master_label`

```sql
master_label(p_entity text)
  returns text
  language sql immutable security invoker
```

- **Definisi:** `supabase/migrations/20260729130000_master_data_rpcs.sql:36`
- **Security:** SECURITY INVOKER (bawaan — tidak ditulis di DDL)
- **Kembalian:** `text`

**Tujuan.** Mengubah slug entitas menjadi label tampilan berkapital, dipakai di teks validasi dan toast seperti `"X" already exists in Category`.

- **Menulis ke:** —
- **Membaca:** —
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat fungsi SQL lain. Contoh rujukan: `20260729130000_master_data_rpcs.sql:208`, `20260729130000_master_data_rpcs.sql:297`, `20260729150000_fix_counters_and_rename.sql:69`

### `master_list`

```sql
master_list(p_entity text)
  returns jsonb
  language plpgsql stable security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260820090200_units_and_companies.sql:180` · Didefinisikan 2×
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Mengembalikan isi satu tabel master sebagai jsonb, dengan cabang khusus per entitas supaya tiap baris membawa kolom detail yang relevan — merek untuk model, kode untuk lokasi, warna untuk status, dan seterusnya.

- **Menulis ke:** —
- **Membaca:** `asset_conditions`, `asset_statuses`, `brands`, `categories`, `companies`, `locations`, `models`, `units`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** `master_assert_entity()`, `master_usage()`
- **Dipanggil dari:** `src/api/masterData.ts:82`
- **Pembungkus TS:** `listMaster()` di `src/api/masterData.ts`
- **Dipakai di layar:** `app/(tabs)/accessories.tsx`, `app/(tabs)/accessory-edit.tsx`, `app/(tabs)/account-edit.tsx`, `app/(tabs)/asset/[code].tsx`, `app/(tabs)/assets.tsx`, `app/(tabs)/master.tsx`

### `master_create`

```sql
master_create(
    p_entity text,
    p_name text,
    p_extra jsonb default '{}'::jsonb
)
  returns jsonb
  language plpgsql security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260820090200_units_and_companies.sql:282` · Didefinisikan 2×
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Menambah satu record master apa pun. Satu fungsi untuk sepuluh tabel, dengan validasi per entitas: duplikat nama diperiksa case-insensitive, model diperiksa unik per merek, dan kolom tambahan diambil dari argumen `p_extra` bertipe jsonb.

- **Menulis ke:** `asset_conditions` (INSERT); `asset_statuses` (INSERT); `categories` (INSERT); `companies` (INSERT); `locations` (INSERT); `models` (INSERT); `units` (INSERT)
- **Membaca:** `asset_conditions`, `asset_statuses`, `categories`, `companies`, `locations`, `models`, `units`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Enter a name first` | `P0001` |
  | `Select a brand first` | `P0001` |
  | `"%" already exists in %` | `P0001` |
  | `Enter a category code first` | `P0001` |
  | `Enter a location code first` | `P0001` |
  | `Enter a unit code first` | `P0001` |
  | `Select a location first` | `P0001` |
  | `Enter a company code first` | `P0001` |

- **Memanggil fungsi lain:** `master_assert_entity()`, `master_label()`
- **Dipanggil dari:** `src/api/masterData.ts:92`
- **Pembungkus TS:** `createMaster()` di `src/api/masterData.ts`
- **Dipakai di layar:** `app/(tabs)/master.tsx`

### `master_rename`

```sql
master_rename(
    p_entity text,
    p_id uuid,
    p_name text
)
  returns jsonb
  language plpgsql security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260729150000_fix_counters_and_rename.sql:64` · Didefinisikan 2×
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Mengganti nama satu record master lewat `execute format(%I)`. Sempat selalu melaporkan `Record not found` karena PL/pgSQL tidak menyetel `FOUND` sesudah `EXECUTE`; diperbaiki dengan `GET DIAGNOSTICS ... ROW_COUNT`, satu-satunya cara resmi menanyakan berapa baris disentuh pernyataan dinamis.

- **Menulis ke:** —
- **Membaca:** `models`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Enter a name first` | `P0001` |
  | `"%" already exists in %` | `P0001` |
  | `Record not found` | `P0001` |

- **Memanggil fungsi lain:** `master_assert_entity()`, `master_label()`
- **Dipanggil dari:** `src/api/masterData.ts:102`
- **Pembungkus TS:** `renameMaster()` di `src/api/masterData.ts`
- **Dipakai di layar:** `app/(tabs)/master.tsx`

### `master_delete`

```sql
master_delete(
    p_entity text,
    p_id uuid
)
  returns jsonb
  language plpgsql security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260729130000_master_data_rpcs.sql:357`
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Menghapus permanen satu record master — hanya Super Admin, ditegakkan policy RLS. Karena setiap FK ke master data bersifat `on delete restrict`, record yang masih dipakai memunculkan 23503; galat itu ditangkap di sini dan diubah menjadi satu kalimat berisi jumlah pemakainya, sehingga klien tidak perlu tahu kode galat PostgreSQL.

- **Menulis ke:** —
- **Membaca:** —
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Record not found` | `P0001` |
  | `Cannot delete % — still used by % assets` | `P0001` |
  | `Cannot delete % — still referenced by % other records` | `P0001` |

- **Memanggil fungsi lain:** `master_assert_entity()`, `master_usage()`
- **Dipanggil dari:** `src/api/masterData.ts:130`
- **Pembungkus TS:** `deleteMaster()` di `src/api/masterData.ts`
- **Dipakai di layar:** `app/(tabs)/master.tsx`

### `master_set_active`

```sql
master_set_active(
    p_entity text,
    p_id uuid,
    p_active boolean
)
  returns jsonb
  language plpgsql security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260729130000_master_data_rpcs.sql:334`
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Menyalakan atau mematikan `is_active` sebuah record master. Ini jalur yang dianjurkan alih-alih penghapusan: record nonaktif mempertahankan seluruh referensi historis tetapi hilang dari picker di formulir.

- **Menulis ke:** —
- **Membaca:** —
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Record not found` | `P0001` |

- **Memanggil fungsi lain:** `master_assert_entity()`
- **Dipanggil dari:** `src/api/masterData.ts:116`
- **Pembungkus TS:** `setMasterActive()` di `src/api/masterData.ts`
- **Dipakai di layar:** `app/(tabs)/master.tsx`

### `master_usage`

```sql
master_usage(
    p_entity text,
    p_id uuid
)
  returns table (asset_count bigint, total_count bigint)
  language plpgsql stable security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260820090200_units_and_companies.sql:132` · Didefinisikan 2×
- **Security:** SECURITY DEFINER
- **Kembalian:** `table (asset_count bigint, total_count bigint)`

**Tujuan.** Menghitung berapa aset dan berapa record lain yang memakai satu record master. Dipakai `master_delete()` untuk menyusun pesan penolakan dan oleh layar Master Data untuk menampilkan angka pemakaian.

- **Menulis ke:** —
- **Membaca:** `account_scope_preferences`, `accounts`, `assets`, `assignments`, `bast`, `maintenance_records`, `models`, `movements`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** `master_assert_entity()`
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat fungsi SQL lain. Contoh rujukan: `20260729130000_master_data_rpcs.sql:184`, `20260729130000_master_data_rpcs.sql:368`, `20260729130000_master_data_rpcs.sql:383`

### `master_usage_list`

```sql
master_usage_list(
    p_entity text,
    p_id uuid
)
  returns jsonb
  language plpgsql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260821091300_master_usage_list.sql:25`
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Mendaftar record yang benar-benar memakai satu entri master, bukan sekadar menghitungnya, sehingga seseorang dapat melihat aset mana yang menghalangi penghapusan.

- **Menulis ke:** —
- **Membaca:** `accessories`, `accounts`, `asset_statuses`, `assets`, `categories`, `departments`, `locations`, `units`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** `accessory_available()`, `master_assert_entity()`
- **Dipanggil dari:** `src/api/masterData.ts:182`
- **Pembungkus TS:** `fetchMasterUsage()` di `src/api/masterData.ts`
- **Dipakai di layar:** `app/(tabs)/master-usage.tsx`

### `asset_form_options`

```sql
asset_form_options()
  returns jsonb
  language sql stable security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260729140000_create_asset.sql:115`
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Mengembalikan seluruh isi picker formulir aset — kategori, merek, model, vendor, departemen, lokasi, status, kondisi, unit — dalam satu panggilan, supaya formulir tidak menembakkan sembilan query saat dibuka.

- **Menulis ke:** —
- **Membaca:** `asset_conditions`, `asset_statuses`, `brands`, `categories`, `departments`, `locations`, `models`, `vendors`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** `my_location_ids()`
- **Dipanggil dari:** `src/api/assets.ts:35`
- **Pembungkus TS:** `fetchAssetFormOptions()` di `src/api/assets.ts`
- **Dipakai di layar:** `app/(tabs)/account-edit.tsx`, `app/(tabs)/add-asset.tsx`, `app/(tabs)/asset/status.tsx`, `app/(tabs)/assign.tsx`, `app/(tabs)/maintenance-log.tsx`, `app/(tabs)/reports.tsx`, `app/(tabs)/transfer.tsx`

---

## M4. Register aset, foto, dan status

18 fungsi.

### `create_asset`

```sql
create_asset(
    p_name text,
    p_category uuid,
    p_serial text,
    p_location uuid,
    p_status uuid,
    p_condition uuid,
    p_brand uuid default null,
    p_model uuid default null,
    p_vendor uuid default null,
    p_department uuid default null,
    p_assigned_to uuid default null,
    p_purchase_date date default null,
    p_purchase_price numeric default null,
    p_warranty_start date default null,
    p_warranty_end date default null,
    p_specifications jsonb default '[]'::jsonb,
    p_notes text default null,
    /** The whole code,
    verbatim. Super Admin only — for legacy imports. */ p_asset_code text default null,
    /** Just the number. Anyone who may create an asset may choose it. */ p_code_seq text default null
)
  returns jsonb
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260807090000_asset_code_sequence_typed.sql:43` · Didefinisikan 3×
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Membuat aset baru beserta kode asetnya. SECURITY DEFINER, sehingga setiap penjagaan yang seharusnya dilakukan RLS dinyatakan ulang di awal. Memvalidasi nama, nomor seri unik, kategori, lokasi dalam scope, status, dan kondisi. Kode aset dibangkitkan server-side lewat `next_asset_code()`; hanya Super Admin yang boleh memaksakan kode sendiri.

- **Menulis ke:** `assets` (INSERT)
- **Membaca:** `assets`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `You do not have permission to create assets` | `P0001` |
  | `Asset name is required` | `P0001` |
  | `Category is required` | `P0001` |
  | `Serial number is required` | `P0001` |
  | `Location is required` | `P0001` |
  | `That location is outside your scope` | `P0001` |
  | `Serial number already registered` | `P0001` |
  | `Only a Super Admin may set the whole asset code` | `P0001` |
  | `A category and a location are needed before a code can be made` | `P0001` |
  | `The asset number must be digits` | `P0001` |
  | `That asset number is too long` | `P0001` |
  | `Asset code % is already in use` | `P0001` |

- **Memanggil fungsi lain:** `asset_code_prefix()`, `can_write_assets()`, `my_account_id()`, `my_location_ids()`, `my_role()`, `next_asset_code()`
- **Dipanggil dari:** `src/api/assets.ts:273`
- **Pembungkus TS:** `createAsset()` di `src/api/assets.ts`
- **Dipakai di layar:** `app/(tabs)/add-asset.tsx`

### `update_asset`

```sql
update_asset(
    p_id uuid,
    p_name text,
    p_category uuid,
    p_serial text,
    p_location uuid,
    p_status uuid,
    p_condition uuid,
    p_brand uuid default null,
    p_model uuid default null,
    p_vendor uuid default null,
    p_department uuid default null,
    p_purchase_date date default null,
    p_purchase_price numeric default null,
    p_warranty_start date default null,
    p_warranty_end date default null,
    p_specifications jsonb default '[]'::jsonb,
    p_notes text default null,
    p_asset_code text default null
)
  returns jsonb
  language plpgsql security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260729160000_asset_register.sql:292`
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Paruh Edit dari formulir aset. Keunikan nomor seri dan aturan 'hanya Super Admin boleh mengubah kode aset' ditegakkan di sini persis seperti di `create_asset()`, supaya kedua jalur tidak menyimpang satu sama lain.

- **Menulis ke:** `assets` (UPDATE)
- **Membaca:** `accounts`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Asset not found` | `P0001` |
  | `Asset name is required` | `P0001` |
  | `Serial number is required` | `P0001` |
  | `Serial number already registered` | `P0001` |
  | `Only a Super Admin may edit the asset code` | `P0001` |
  | `Asset code % is already in use` | `P0001` |

- **Memanggil fungsi lain:** —
- **Dipanggil dari:** `src/api/assets.ts:301`
- **Pembungkus TS:** `updateAsset()` di `src/api/assets.ts`
- **Dipakai di layar:** `app/(tabs)/add-asset.tsx`

### `delete_asset`

```sql
delete_asset(
    p_asset uuid,
    p_reason text default null
)
  returns jsonb
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260803110000_fix_delete_asset_array.sql:22` · Didefinisikan 2×
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Menghapus aset permanen, hanya bila tidak ada riwayat yang menggantung padanya. Mengumpulkan seluruh penghalang lebih dulu — penugasan, perpindahan, BAST, perawatan, label — lalu menolak dengan satu kalimat berisi semuanya. Alasan ditulis ke `audit_log` sebelum baris dihapus, karena trigger audit memang ikut menangkap DELETE tetapi tidak dapat tahu alasannya. Sempat gagal dengan `malformed array literal` karena `holds || 'teks'` dibaca PostgreSQL sebagai penggabungan dua array; diperbaiki dengan `array_append()`.

- **Menulis ke:** `assets` (DELETE); `audit_log` (INSERT)
- **Membaca:** `asset_status_changes`, `asset_tags`, `assignments`, `bast`, `documents`, `maintenance_records`, `movements`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Asset not found` | `P0001` |
  | `Only a Super Admin can delete an asset` | `P0001` |
  | `Say why this is being deleted` | `P0001` |
  | `This asset has % behind it. Retire it instead — deleting it would leave those records pointing at nothing.` | `P0001` |

- **Memanggil fungsi lain:** `can_see_asset()`, `my_account_id()`, `my_role()`
- **Dipanggil dari:** `src/api/assets.ts:111`
- **Pembungkus TS:** `deleteAsset()` di `src/api/assets.ts`
- **Dipakai di layar:** `app/(tabs)/asset/[code].tsx`

### `asset_detail`

```sql
asset_detail(p_code text)
  returns jsonb
  language plpgsql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260821090700_asset_detail_second_holder.sql:12` · Didefinisikan 4×
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Payload lengkap layar detail aset dalam satu panggilan: baris aset, seluruh nama hasil join, pemegang utama dan kedua, unit terpasang, label, foto, dan riwayat. Didefinisikan ulang empat kali sepanjang proyek, terakhir untuk menampilkan nama pemegang kedua — tanpa itu, radio yang dipertanggungjawabkan dua orang hanya menampilkan satu nama, yang sama saja dengan tidak mencatat nama kedua.

- **Menulis ke:** —
- **Membaca:** `accounts`, `asset_conditions`, `asset_status_changes`, `asset_statuses`, `assets`, `assignments`, `bast`, `brands`, `categories`, `departments`, `documents`, `locations`, `maintenance_records`, `models`, `movements`, `units`, `vendors`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** `src/api/assets.ts:241`
- **Pembungkus TS:** `fetchAssetDetail()` di `src/api/assets.ts`
- **Dipakai di layar:** `app/(tabs)/add-asset.tsx`, `app/(tabs)/asset/[code].tsx`, `app/(tabs)/asset/status.tsx`, `app/(tabs)/maintenance-log.tsx`

### `search_assets`

```sql
search_assets(
    p_locations uuid[],
    p_query text default null,
    p_status uuid default null,
    p_category uuid default null,
    p_sort text default 'code'
)
  returns table ( id uuid, asset_code text, name text, serial_number text, category_name text, category_icon text, brand_name text, model_name text, status_name text, condition_name text, location_name text, holder_name text, department_name text, warranty_end date )
  language sql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260821090600_second_holder_reads.sql:235` · Didefinisikan 3×
- **Security:** SECURITY INVOKER
- **Kembalian:** `table ( id uuid, asset_code text, name text, serial_number text, category_name text, category_icon text, brand_name text, model_name text, status_name text, condition_name text, location_name text, holder_name text, department_name text, warranty_end date )`

**Tujuan.** Pencarian dan penyaringan register aset. Menyapu kode, nomor seri, nama, merek, model, departemen, serta nama pemegang utama **dan** kedua. Filter kategori diterapkan sebelum sapuan ILIKE, itulah sebabnya `assets_category_idx` ditambahkan belakangan.

- **Menulis ke:** —
- **Membaca:** `accounts`, `asset_conditions`, `asset_statuses`, `assets`, `brands`, `categories`, `departments`, `locations`, `models`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** `src/api/assets.ts:94`
- **Pembungkus TS:** `searchAssets()` di `src/api/assets.ts`
- **Dipakai di layar:** `app/(tabs)/assets.tsx`, `app/(tabs)/transfer.tsx`

### `count_assets_in_scope`

```sql
count_assets_in_scope(p_locations uuid[])
  returns bigint
  language sql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260729160000_asset_register.sql:77`
- **Security:** SECURITY INVOKER
- **Kembalian:** `bigint`

**Tujuan.** Menghitung total aset dalam scope, supaya baris jumlah dapat berbunyi '4 dari 7 dalam scope'.

- **Menulis ke:** —
- **Membaca:** `assets`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** `src/api/assets.ts:121`
- **Pembungkus TS:** `countAssetsInScope()` di `src/api/assets.ts`
- **Dipakai di layar:** `app/(tabs)/assets.tsx`

### `asset_code_prefix`

```sql
asset_code_prefix(
    p_category uuid,
    p_location uuid,
    p_purchase date default null
)
  returns text
  language plpgsql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260806110000_asset_code_format.sql:63`
- **Security:** SECURITY INVOKER
- **Kembalian:** `text`

**Tujuan.** Menyusun awalan kode aset dari kategori, lokasi, dan tanggal pembelian — memakai aturan yang sama persis dengan yang nanti memproduksi kodenya, sehingga formulir dapat menampilkan bentuk kode sebelum apa pun disimpan.

- **Menulis ke:** —
- **Membaca:** `categories`, `locations`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** `src/api/assets.ts:427`
- **Pembungkus TS:** `fetchAssetCodePrefix()` di `src/api/assets.ts`
- **Dipakai di layar:** `app/(tabs)/add-asset.tsx`

### `preview_asset_code`

```sql
preview_asset_code(
    p_category uuid,
    p_location uuid,
    p_purchase date default null
)
  returns text
  language plpgsql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260806110000_asset_code_format.sql:98`
- **Security:** SECURITY INVOKER
- **Kembalian:** `text`

**Tujuan.** Menggabungkan awalan dengan nomor urut berikutnya untuk ditampilkan sebagai pratinjau di formulir. STABLE dan tidak menyentuh penghitung, jadi memanggilnya tidak menghabiskan nomor.

- **Menulis ke:** —
- **Membaca:** —
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** `asset_code_prefix()`, `next_in_asset_prefix()`
- **Dipanggil dari:** `src/api/assets.ts:405`
- **Pembungkus TS:** `previewAssetCode()` di `src/api/assets.ts`
- **Dipakai di layar:** `app/(tabs)/add-asset.tsx`

### `next_asset_code`

```sql
next_asset_code(
    p_category uuid,
    p_purchase date,
    p_location uuid
)
  returns text
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260806110000_asset_code_format.sql:119` · Didefinisikan 3×
- **Security:** SECURITY DEFINER
- **Kembalian:** `text`

**Tujuan.** Menerbitkan kode aset berikutnya yang benar-benar terpakai. SECURITY DEFINER karena `asset_code_counters` sengaja tidak diberi grant apa pun kepada klien; semula SECURITY INVOKER dan gagal dengan `permission denied for table asset_code_counters` pada penyimpanan aset pertama. Punya lingkar percobaan ulang untuk menghadapi tabrakan nomor.

- **Menulis ke:** —
- **Membaca:** `assets`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `A category and a location are needed before a code can be made` | `P0001` |
  | `Could not allocate an asset code for %` | `P0001` |

- **Memanggil fungsi lain:** `asset_code_prefix()`, `next_in_asset_prefix()`
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat fungsi SQL lain. Contoh rujukan: `20260729140000_create_asset.sql:78`, `20260806110000_asset_code_format.sql:217`, `20260807090000_asset_code_sequence_typed.sql:128`

### `next_in_asset_prefix`

```sql
next_in_asset_prefix(p_prefix text)
  returns int
  language sql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260806110000_asset_code_format.sql:89`
- **Security:** SECURITY INVOKER
- **Kembalian:** `int`

**Tujuan.** Mencari nomor urut tertinggi yang sudah dipakai di bawah satu awalan lalu menambah satu, dengan regex yang meng-escape karakter khusus pada awalan.

- **Menulis ke:** —
- **Membaca:** `assets`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat fungsi SQL lain. Contoh rujukan: `20260806110000_asset_code_format.sql:107`, `20260806110000_asset_code_format.sql:136`

### `assignable_assets`

```sql
assignable_assets(
    p_locations uuid[],
    p_mode text default 'assign'
)
  returns table ( id uuid, asset_code text, name text, location_name text, condition_name text, holder_name text )
  language sql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260729180000_assign_return_movement.sql:298`
- **Security:** SECURITY INVOKER
- **Kembalian:** `table ( id uuid, asset_code text, name text, location_name text, condition_name text, holder_name text )`

**Tujuan.** Memasok langkah kedua wizard: aset berstatus Available untuk penugasan, atau Assigned untuk pengembalian, dalam scope pemanggil.

- **Menulis ke:** —
- **Membaca:** `accounts`, `asset_conditions`, `asset_statuses`, `assets`, `locations`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** `src/api/assignments.ts:43`
- **Pembungkus TS:** `fetchAssignableAssets()` di `src/api/assignments.ts`
- **Dipakai di layar:** `app/(tabs)/assign.tsx`

### `add_asset_photo`

```sql
add_asset_photo(
    p_asset uuid,
    p_path text,
    p_caption text default null
)
  returns jsonb
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260811110000_photo_limit_five.sql:16` · Didefinisikan 2×
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Mencatat foto yang byte-nya sudah lebih dulu diunggah klien lewat Storage API. Memvalidasi keberadaan aset, izin tulis, dan bahwa path berada di dalam folder aset itu sendiri — tanpa pemeriksaan terakhir itu satu aset dapat diarahkan ke foto aset lain dan melewati policy storage. Batas lima foto ditegakkan di sini, bukan sebagai CHECK constraint; aset yang terlanjur punya lebih dari lima tetap mempertahankannya karena menurunkan batas bukan alasan menghapus foto orang.

- **Menulis ke:** `asset_photos` (INSERT)
- **Membaca:** `asset_photos`, `assets`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Asset not found` | `P0001` |
  | `You do not have permission to change this asset` | `P0001` |
  | `Photo path does not belong to this asset` | `P0001` |
  | `An asset can carry five photos. Remove one first.` | `P0001` |

- **Memanggil fungsi lain:** `can_see_asset()`, `can_write_assets()`, `my_account_id()`
- **Dipanggil dari:** `src/api/assets.ts:484`
- **Pembungkus TS:** `addAssetPhoto()` di `src/api/assets.ts`
- **Dipakai di layar:** `app/(tabs)/asset/[code].tsx`

### `remove_asset_photo`

```sql
remove_asset_photo(p_id uuid)
  returns jsonb
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260811090000_asset_photo_gallery.sql:127`
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Menghapus satu baris foto lalu menomori ulang sisanya supaya `sort_order` tetap rapat. Berkasnya sendiri dihapus klien lewat Storage API.

- **Menulis ke:** `asset_photos` (DELETE/UPDATE)
- **Membaca:** —
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Photo not found` | `P0001` |
  | `You do not have permission to change this asset` | `P0001` |

- **Memanggil fungsi lain:** `can_see_asset()`, `can_write_assets()`
- **Dipanggil dari:** `src/api/assets.ts:497`
- **Pembungkus TS:** `removeAssetPhoto()` di `src/api/assets.ts`
- **Dipakai di layar:** `app/(tabs)/asset/[code].tsx`

### `set_asset_photo`

```sql
set_asset_photo(
    p_asset uuid,
    p_path text
)
  returns jsonb
  language plpgsql security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260729170000_asset_photos_storage.sql:64`
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Menautkan path foto sampul ke `assets.photo_path`. Ada supaya klien tidak pernah meng-UPDATE kolom itu langsung, sehingga trigger audit selalu melihat perubahan aset yang normal.

- **Menulis ke:** `assets` (UPDATE)
- **Membaca:** —
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Asset not found` | `P0001` |
  | `Photo path does not belong to this asset` | `P0001` |

- **Memanggil fungsi lain:** —
- **Dipanggil dari:** `src/api/assets.ts:372`
- **Pembungkus TS:** `uploadAssetPhoto()` di `src/api/assets.ts`
- **Dipakai di layar:** — (lihat §Z.3)

### `asset_photos_list`

```sql
asset_photos_list(p_asset uuid)
  returns table (id uuid, file_path text, sort_order int, caption text, created_at timestamptz)
  language sql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260811090000_asset_photo_gallery.sql:153`
- **Security:** SECURITY INVOKER
- **Kembalian:** `table (id uuid, file_path text, sort_order int, caption text, created_at timestamptz)`

**Tujuan.** Mendaftar foto satu aset berurutan `sort_order`, dengan `can_see_asset()` di klausa WHERE sebagai penjagaan scope.

- **Menulis ke:** —
- **Membaca:** `asset_photos`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** `can_see_asset()`
- **Dipanggil dari:** `src/api/assets.ts:458`
- **Pembungkus TS:** `fetchAssetPhotos()` di `src/api/assets.ts`
- **Dipakai di layar:** `app/(tabs)/asset/[code].tsx`

### `sync_asset_cover`

```sql
sync_asset_cover()
  returns trigger
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260811090000_asset_photo_gallery.sql:63`
- **Security:** SECURITY DEFINER
- **Kembalian:** `trigger`

**Tujuan.** Trigger di `asset_photos` yang menulis ulang `assets.photo_path` dengan foto ber-`sort_order` terkecil setiap kali galeri berubah. Ditegakkan trigger alih-alih diserahkan ke tiap pemanggil, karena hal terburuk setelah aset tanpa gambar adalah aset yang gambarnya menunjuk foto yang sudah dihapus.

- **Menulis ke:** `assets` (UPDATE)
- **Membaca:** `asset_photos`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipasang sebagai trigger:** `asset_photos_cover` pada `asset_photos`
- **Dipanggil dari:** bukan RPC — dijalankan sebagai trigger

### `change_asset_status`

```sql
change_asset_status(
    p_asset uuid,
    p_status uuid,
    p_condition uuid default null,
    p_reason text default null
)
  returns jsonb
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260731140000_status_changes.sql:70`
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Satu-satunya jalur tulis untuk perubahan status atau kondisi aset. Menulis dua tabel dalam satu transaksi — baris aset dan riwayatnya — sebab melakukannya dari klien berarti perubahan status yang tidak meninggalkan jejak setiap kali panggilan kedua gagal. Menolak menyetel status terminal (Retired atau Lost) selama aset masih dipegang seseorang: kembalikan dulu, karena itu yang menghasilkan catatan siapa yang menyerahkannya.

- **Menulis ke:** `asset_status_changes` (INSERT); `assets` (UPDATE)
- **Membaca:** `accounts`, `asset_statuses`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Asset not found` | `P0001` |
  | `You do not have permission to change this asset` | `P0001` |
  | `Unknown status` | `P0001` |
  | `Please say why the status is changing` | `P0001` |
  | `That is already the status` | `P0001` |
  | `Use Assign to put this asset in someone's hands` | `P0001` |
  | `Return this asset first — % still has it` | `P0001` |

- **Memanggil fungsi lain:** `can_see_asset()`, `can_write_assets()`, `my_account_id()`
- **Dipanggil dari:** `src/api/assets.ts:341`
- **Pembungkus TS:** `changeAssetStatus()` di `src/api/assets.ts`
- **Dipakai di layar:** `app/(tabs)/asset/status.tsx`

### `asset_status_history`

```sql
asset_status_history(p_asset uuid)
  returns table ( id uuid, from_status text, to_status text, from_condition text, to_condition text, reason text, changed_by_name text, changed_at timestamptz )
  language sql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260731140000_status_changes.sql:152`
- **Security:** SECURITY INVOKER
- **Kembalian:** `table ( id uuid, from_status text, to_status text, from_condition text, to_condition text, reason text, changed_by_name text, changed_at timestamptz )`

**Tujuan.** Riwayat perubahan status satu aset tanpa payload detail lengkap, untuk laporan atau ekspor.

- **Menulis ke:** —
- **Membaca:** `accounts`, `asset_conditions`, `asset_status_changes`, `asset_statuses`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** **TIDAK DIPAKAI** — nol rujukan di seluruh repositori (bukan RPC, bukan trigger, tidak dipanggil policy, Edge Function, cron, DEFAULT, maupun fungsi SQL lain). Lihat §Z.1.e.

---

## M5. Label dan pemindaian

12 fungsi.

### `next_tag_code`

```sql
next_tag_code(p_prefix text default 'CT')
  returns text
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260730080000_asset_tags.sql:71`
- **Security:** SECURITY DEFINER
- **Kembalian:** `text`

**Tujuan.** Menerbitkan kode stiker berikutnya untuk satu awalan lokasi, berurut dan diberi nol di depan supaya setumpuk stiker mudah dicocokkan dengan mata. SECURITY DEFINER karena `tag_code_counters` tidak dapat disentuh klien.

- **Menulis ke:** `tag_code_counters` (INSERT)
- **Membaca:** —
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat fungsi SQL lain. Contoh rujukan: `20260730080000_asset_tags.sql:107`, `20260806090000_location_scoped_labels.sql:129`

### `create_tag_batch`

```sql
create_tag_batch(
    p_count int,
    p_location uuid default null
)
  returns table (batch_id uuid, code text, location_name text, prefix text)
  language plpgsql security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260806090000_location_scoped_labels.sql:89` · Didefinisikan 2×
- **Security:** SECURITY INVOKER
- **Kembalian:** `table (batch_id uuid, code text, location_name text, prefix text)`

**Tujuan.** Mencetak satu batch stiker kosong untuk satu lokasi, mengembalikan `batch_id` bersama kodenya. Bentuk dua argumen menggantikan bentuk lama; `p_location` diberi nilai default supaya memanggilnya tanpa lokasi tetap mendarat di fungsi ini dan memunculkan kalimat penjelas, bukan gagal di PostgREST dengan 'Could not find the function'.

- **Menulis ke:** `asset_tags` (INSERT)
- **Membaca:** `asset_tags`, `locations`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `You do not have permission to create tags` | `P0001` |
  | `How many labels do you need?` | `P0001` |
  | `A batch is limited to 500 labels` | `P0001` |
  | `Choose which location these labels are for` | `P0001` |
  | `Unknown location` | `P0001` |
  | `That location is outside your scope` | `P0001` |

- **Memanggil fungsi lain:** `can_write_assets()`, `my_account_id()`, `my_location_ids()`, `next_tag_code()`
- **Dipanggil dari:** `src/api/tags.ts:110`
- **Pembungkus TS:** `createTagBatch()` di `src/api/tags.ts`
- **Dipakai di layar:** `app/(tabs)/labels.tsx`

### `list_tags`

```sql
list_tags(
    p_status text default null,
    p_batch uuid default null,
    p_locations uuid[] default null
)
  returns table ( id uuid, code text, status tag_status, batch_id uuid, asset_code text, asset_name text, tagged_at timestamptz, created_at timestamptz, location_id uuid, location_name text )
  language sql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260806090000_location_scoped_labels.sql:145` · Didefinisikan 2×
- **Security:** SECURITY INVOKER
- **Kembalian:** `table ( id uuid, code text, status tag_status, batch_id uuid, asset_code text, asset_name text, tagged_at timestamptz, created_at timestamptz, location_id uuid, location_name text )`

**Tujuan.** Mendaftar stiker dengan penyaringan status, batch, dan lokasi, untuk layar Labels.

- **Menulis ke:** —
- **Membaca:** `asset_tags`, `assets`, `locations`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** `src/api/tags.ts:54`
- **Pembungkus TS:** `listTags()` di `src/api/tags.ts`
- **Dipakai di layar:** `app/(tabs)/labels.tsx`

### `tag_stock`

```sql
tag_stock(p_locations uuid[] default null)
  returns jsonb
  language sql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260806090000_location_scoped_labels.sql:173` · Didefinisikan 2×
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Menghitung stok stiker per status — untagged, tagged, void, dan total — untuk kartu ringkasan.

- **Menulis ke:** —
- **Membaca:** `asset_tags`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** `src/api/tags.ts:90`
- **Pembungkus TS:** `fetchTagStock()` di `src/api/tags.ts`
- **Dipakai di layar:** `app/(tabs)/labels.tsx`

### `tag_detail`

```sql
tag_detail(p_code text)
  returns jsonb
  language plpgsql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260806090000_location_scoped_labels.sql:331` · Didefinisikan 2×
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Detail satu stiker dari kodenya, termasuk stok asalnya, aset yang dilekatinya bila ada, dan riwayat pembatalan. Mengembalikan null bila kode tidak dikenal.

- **Menulis ke:** —
- **Membaca:** `accounts`, `asset_conditions`, `asset_statuses`, `asset_tags`, `assets`, `locations`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** `can_see_asset()`
- **Dipanggil dari:** `src/api/tags.ts:206`
- **Pembungkus TS:** `fetchTagDetail()` di `src/api/tags.ts`
- **Dipakai di layar:** `app/(tabs)/labels.tsx`

### `tag_asset`

```sql
tag_asset(
    p_code text,
    p_name text,
    p_category uuid,
    p_serial text,
    p_location uuid,
    p_status uuid,
    p_condition uuid,
    p_brand uuid default null,
    p_model uuid default null,
    p_vendor uuid default null,
    p_department uuid default null,
    p_purchase_date date default null,
    p_purchase_price numeric default null,
    p_warranty_start date default null,
    p_warranty_end date default null,
    p_specifications jsonb default '[]'::jsonb,
    p_notes text default null,
    p_asset_code text default null,
    p_code_seq text default null
)
  returns jsonb
  language plpgsql security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260807090000_asset_code_sequence_typed.sql:162` · Didefinisikan 3×
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Menempelkan stiker ke aset **baru** dalam satu langkah: membuat asetnya sekaligus menautkan labelnya. Jalur ini dipakai ketika seseorang memindai stiker kosong lalu mendaftarkan perangkat di tempat.

- **Menulis ke:** `asset_tags` (UPDATE)
- **Membaca:** —
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `That label is not one of ours` | `P0001` |
  | `That label is already on another asset` | `P0001` |
  | `That label has been voided` | `P0001` |

- **Memanggil fungsi lain:** `assert_tag_location()`, `create_asset()`, `my_account_id()`
- **Dipanggil dari:** `src/api/tags.ts:137`
- **Pembungkus TS:** `tagAsset()` di `src/api/tags.ts`
- **Dipakai di layar:** `app/(tabs)/add-asset.tsx`

### `attach_tag`

```sql
attach_tag(
    p_code text,
    p_asset uuid
)
  returns jsonb
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260806090000_location_scoped_labels.sql:217` · Didefinisikan 2×
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Menempelkan stiker yang sudah ada ke aset yang sudah ada. Memvalidasi bahwa stiker berstatus `untagged`, bahwa aset belum berlabel, dan bahwa keduanya berada di lokasi yang sama.

- **Menulis ke:** `asset_tags` (UPDATE)
- **Membaca:** `assets`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Asset not found` | `P0001` |
  | `You do not have permission to label this asset` | `P0001` |
  | `That label is not one of ours` | `P0001` |
  | `That label was voided and cannot be used again` | `P0001` |
  | `That label is already on %` | `P0001` |
  | `This asset already carries label %` | `P0001` |

- **Memanggil fungsi lain:** `assert_tag_location()`, `can_see_asset()`, `can_write_assets()`, `my_account_id()`
- **Dipanggil dari:** `src/api/tags.ts:223`
- **Pembungkus TS:** `attachTag()` di `src/api/tags.ts`
- **Dipakai di layar:** `app/(tabs)/asset/[code].tsx`

### `void_tag`

```sql
void_tag(
    p_code text,
    p_reason text
)
  returns jsonb
  language plpgsql security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260730080000_asset_tags.sql:217`
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Membatalkan stiker yang rusak, hilang, atau salah tempel, dengan alasan wajib. Statusnya menjadi `void` dan kodenya tidak pernah dipakai ulang.

- **Menulis ke:** `asset_tags` (UPDATE)
- **Membaca:** —
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `You do not have permission to void a label` | `P0001` |
  | `Say why the label is being voided` | `P0001` |
  | `That label is not one of ours` | `P0001` |
  | `Detach the label from its asset before voiding it` | `P0001` |

- **Memanggil fungsi lain:** `can_write_assets()`, `my_account_id()`
- **Dipanggil dari:** `src/api/tags.ts:163`
- **Pembungkus TS:** `voidTag()` di `src/api/tags.ts`
- **Dipakai di layar:** — (lihat §Z.3)

### `scan_tag`

```sql
scan_tag(p_code text)
  returns jsonb
  language plpgsql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260730080000_asset_tags.sql:119`
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Menjawab keempat kemungkinan hasil pemindaian dalam satu round trip: kode bukan milik sistem ini, stiker masih kosong, stiker sudah menempel pada aset, atau stiker menempel pada aset di luar scope pemanggil. Layar pemindai hanya merutekan; ia tidak pernah menebak, sebab salah tebak di sini berarti perangkat tersambung ke record yang salah.

- **Menulis ke:** —
- **Membaca:** `accounts`, `asset_statuses`, `asset_tags`, `assets`, `locations`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** `src/api/tags.ts:30`
- **Pembungkus TS:** `scanTag()` di `src/api/tags.ts`
- **Dipakai di layar:** `app/(tabs)/scan.tsx`

### `asset_tag_code`

```sql
asset_tag_code(p_asset uuid)
  returns text
  language sql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260804090000_maintenance_and_tags.sql:292`
- **Security:** SECURITY INVOKER
- **Kembalian:** `text`

**Tujuan.** Mengembalikan kode stiker yang menempel pada satu aset, atau null bila belum ada.

- **Menulis ke:** —
- **Membaca:** `asset_tags`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** `src/api/tags.ts:230`
- **Pembungkus TS:** `fetchAssetTagCode()` di `src/api/tags.ts`
- **Dipakai di layar:** `app/(tabs)/asset/[code].tsx`

### `tag_prefixes`

```sql
tag_prefixes(p_locations uuid[])
  returns table (location_id uuid, location_name text, prefix text, blank int)
  language sql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260806090000_location_scoped_labels.sql:186`
- **Security:** SECURITY INVOKER
- **Kembalian:** `table (location_id uuid, location_name text, prefix text, blank int)`

**Tujuan.** Mendaftar awalan label per lokasi beserta nama lokasinya, untuk picker saat mencetak batch.

- **Menulis ke:** —
- **Membaca:** `asset_tags`, `locations`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** `src/api/tags.ts:77`
- **Pembungkus TS:** `fetchTagPrefixes()` di `src/api/tags.ts`
- **Dipakai di layar:** `app/(tabs)/labels.tsx`

### `assert_tag_location`

```sql
assert_tag_location(
    p_tag_location uuid,
    p_asset_location uuid
)
  returns void
  language plpgsql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260806090000_location_scoped_labels.sql:203`
- **Security:** SECURITY INVOKER
- **Kembalian:** `void`

**Tujuan.** Penjaga yang memastikan stiker dan aset berada di lokasi yang sama sebelum keduanya ditautkan.

- **Menulis ke:** —
- **Membaca:** `locations`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `That label is % stock — it cannot go on a % asset` | `P0001` |

- **Memanggil fungsi lain:** —
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat fungsi SQL lain. Contoh rujukan: `20260806090000_location_scoped_labels.sql:254`, `20260806090000_location_scoped_labels.sql:301`, `20260807090000_asset_code_sequence_typed.sql:201`

---

## M6. Penugasan, perpindahan, dan unit

8 fungsi.

### `assign_asset`

```sql
assign_asset(
    p_asset uuid,
    p_account uuid,
    p_location uuid,
    p_date date,
    p_expected_return date default null,
    p_notes text default null,
    p_auto_bast boolean default true
)
  returns table (assignment_id uuid, bast_number text)
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260729180000_assign_return_movement.sql:37`
- **Security:** SECURITY DEFINER
- **Kembalian:** `table (assignment_id uuid, bast_number text)`

**Tujuan.** Menyerahkan aset kepada seseorang dalam satu transaksi: baris penugasan, status dan pemegang pada aset, baris perpindahan bila lokasinya berubah, serta draf BAST bila opsi otomatis dinyalakan. SECURITY DEFINER, sehingga ketiga penjagaan yang seharusnya dilakukan RLS dinyatakan ulang di awal. `auth.uid()` tidak terpengaruh SECURITY DEFINER, jadi trigger audit tetap merekam pelaku yang sebenarnya.

- **Menulis ke:** `assets` (UPDATE); `assignments` (INSERT); `bast` (INSERT); `movements` (INSERT)
- **Membaca:** `accounts`, `asset_conditions`, `asset_statuses`, `assignments`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `You do not have permission to assign assets` | `P0001` |
  | `Select an employee to continue` | `P0001` |
  | `Select an asset to continue` | `P0001` |
  | `Assignment date is required` | `P0001` |
  | `Asset not found` | `P0001` |
  | `Employee not found` | `P0001` |
  | `This asset is already assigned` | `P0001` |
  | `Expected return cannot be before the assignment date` | `P0001` |
  | `That location is outside your scope` | `P0001` |
  | `The "Assigned" status is missing from master data` | `P0001` |

- **Memanggil fungsi lain:** `can_see_asset()`, `can_write_assets()`, `my_account_id()`, `my_location_ids()`
- **Dipanggil dari:** `src/api/assignments.ts:69`
- **Pembungkus TS:** `assignAsset()` di `src/api/assignments.ts`
- **Dipakai di layar:** `app/(tabs)/assign.tsx`

### `return_asset`

```sql
return_asset(
    p_asset uuid,
    p_date date,
    p_condition uuid,
    p_notes text default null,
    p_auto_bast boolean default true
)
  returns jsonb
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260821090600_second_holder_reads.sql:18` · Didefinisikan 3×
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Menutup penugasan aktif dan melepas pemegangnya — kedua nama sekaligus bila ada pemegang kedua, karena lembar penarikan ditandatangani keduanya. Menyimpang dari DATABASE.md §11 secara sadar: dokumen itu menyebut aset dipindahkan 'ke lokasi gudang', padahal tidak ada kolom atau penanda gudang di mana pun dalam skema. Aset karena itu tetap di tempatnya dan hanya kehilangan pemegangnya; memindahkannya adalah tugas formulir Transfer, yang menulis baris perpindahan dengan alasan.

- **Menulis ke:** `assets` (UPDATE); `assignments` (UPDATE); `bast` (INSERT)
- **Membaca:** `accounts`, `asset_conditions`, `asset_statuses`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `You do not have permission to return assets` | `P0001` |
  | `Select an asset to continue` | `P0001` |
  | `Assignment date is required` | `P0001` |
  | `Asset not found` | `P0001` |
  | `This asset has no active assignment` | `P0001` |
  | `Return date cannot be before the assignment date` | `P0001` |
  | `The "Available" status is missing from master data` | `P0001` |

- **Memanggil fungsi lain:** `can_see_asset()`, `can_write_assets()`, `my_account_id()`
- **Dipanggil dari:** `src/api/assignments.ts:108`
- **Pembungkus TS:** `returnAsset()` di `src/api/assignments.ts`
- **Dipakai di layar:** `app/(tabs)/assign.tsx`

### `set_secondary_holder`

```sql
set_secondary_holder(
    p_asset uuid,
    p_account uuid
)
  returns jsonb
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260821090500_second_holder.sql:51`
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Menetapkan atau menghapus pemegang kedua sesudah penugasan ada, sehingga `assign_asset()` tidak perlu berubah signature — kesalahan yang justru dibersihkan migrasi 0029. Menulis ke tiga tempat pasangan itu harus muncul: penugasan sebagai record, aset sebagai yang dibaca pencarian, dan draf BAST sebagai yang ditandatangani. BAST hanya disentuh selama masih draf.

- **Menulis ke:** `assets` (UPDATE); `assignments` (UPDATE); `bast` (UPDATE)
- **Membaca:** `accounts`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Asset not found` | `P0001` |
  | `You do not have permission to change this assignment` | `P0001` |
  | `Nobody holds this asset yet — assign it first` | `P0001` |
  | `That is already the first holder` | `P0001` |
  | `Choose somebody who is still active` | `P0001` |

- **Memanggil fungsi lain:** `can_see_asset()`, `can_write_assets()`
- **Dipanggil dari:** `src/api/assignments.ts:192`
- **Pembungkus TS:** `setSecondaryHolder()` di `src/api/assignments.ts`
- **Dipakai di layar:** `app/(tabs)/assign.tsx`

### `record_movement`

```sql
record_movement(
    p_asset uuid,
    p_to_location uuid,
    p_reason text,
    p_remarks text default null,
    p_at timestamptz default now()
)
  returns uuid
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260729180000_assign_return_movement.sql:219`
- **Security:** SECURITY DEFINER
- **Kembalian:** `uuid`

**Tujuan.** Mencatat perpindahan aset antar lokasi. Baris perpindahan bersifat append-only lewat tiga lapis independen, sehingga fungsi ini adalah satu-satunya cara sebuah baris perpindahan dapat lahir.

- **Menulis ke:** `assets` (UPDATE); `movements` (INSERT)
- **Membaca:** —
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `You do not have permission to move assets` | `P0001` |
  | `Select an asset to continue` | `P0001` |
  | `Asset not found` | `P0001` |
  | `Select a destination` | `P0001` |
  | `Destination must be different from the origin` | `P0001` |
  | `That location is outside your scope` | `P0001` |
  | `Select a reason` | `P0001` |

- **Memanggil fungsi lain:** `can_see_asset()`, `can_write_assets()`, `my_account_id()`, `my_location_ids()`
- **Dipanggil dari:** `src/api/assignments.ts:140`
- **Pembungkus TS:** `recordMovement()` di `src/api/assignments.ts`
- **Dipakai di layar:** `app/(tabs)/transfer.tsx`

### `movement_history`

```sql
movement_history(
    p_locations uuid[],
    p_asset uuid default null
)
  returns table ( id uuid, asset_id uuid, asset_code text, asset_name text, from_location text, to_location text, moved_at timestamptz, reason text, remarks text, moved_by_name text )
  language sql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260729180000_assign_return_movement.sql:320`
- **Security:** SECURITY INVOKER
- **Kembalian:** `table ( id uuid, asset_id uuid, asset_code text, asset_name text, from_location text, to_location text, moved_at timestamptz, reason text, remarks text, moved_by_name text )`

**Tujuan.** Rel riwayat perpindahan, dengan nama lokasi asal dan tujuan, tanggal, pelaku, alasan, dan catatan. Read-only secara konstruksi: tidak ada fungsi pasangan untuk menyunting atau menghapusnya di mana pun.

- **Menulis ke:** —
- **Membaca:** `accounts`, `assets`, `locations`, `movements`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** `src/api/assignments.ts:170`
- **Pembungkus TS:** `fetchMovements()` di `src/api/assignments.ts`
- **Dipakai di layar:** `app/(tabs)/transfer.tsx`

### `install_asset_to_unit`

```sql
install_asset_to_unit(
    p_asset uuid,
    p_unit uuid,
    p_reason text
)
  returns jsonb
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260821090000_install_to_unit.sql:41`
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Memasang aset ke sebuah unit alat berat atau kendaraan, mencatat perubahan statusnya beserta alasan. SECURITY DEFINER dengan penjagaan yang dinyatakan ulang.

- **Menulis ke:** `asset_status_changes` (INSERT); `assets` (UPDATE)
- **Membaca:** `accounts`, `asset_statuses`, `assignments`, `units`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Asset not found` | `P0001` |
  | `You do not have permission to change this asset` | `P0001` |
  | `Please say why it is being fitted` | `P0001` |
  | `Unit not found` | `P0001` |
  | `% is no longer in service` | `P0001` |
  | `Return this asset first — % still has it` | `P0001` |
  | `This asset is % and cannot be fitted to anything` | `P0001` |
  | `It is already fitted to %` | `P0001` |

- **Memanggil fungsi lain:** `can_see_asset()`, `can_write_assets()`, `my_account_id()`, `record_movement()`
- **Dipanggil dari:** `src/api/units.ts:37`
- **Pembungkus TS:** `installAssetToUnit()` di `src/api/units.ts`
- **Dipakai di layar:** `app/(tabs)/asset/[code].tsx`

### `remove_asset_from_unit`

```sql
remove_asset_from_unit(
    p_asset uuid,
    p_reason text
)
  returns jsonb
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260821090000_install_to_unit.sql:120`
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Melepas aset dari unit dan mengembalikannya ke status Available. Lokasinya sengaja tidak diubah — keluar dari kendaraan tidak berarti diserahkan kepada siapa pun, dan radio itu secara fisik tetap di Site sampai ada yang mencatat perpindahan.

- **Menulis ke:** `asset_status_changes` (INSERT); `assets` (UPDATE)
- **Membaca:** `asset_statuses`, `units`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Asset not found` | `P0001` |
  | `You do not have permission to change this asset` | `P0001` |
  | `This asset is not fitted to a unit` | `P0001` |
  | `Please say why it is being removed` | `P0001` |

- **Memanggil fungsi lain:** `can_see_asset()`, `can_write_assets()`, `my_account_id()`
- **Dipanggil dari:** `src/api/units.ts:47`
- **Pembungkus TS:** `removeAssetFromUnit()` di `src/api/units.ts`
- **Dipakai di layar:** `app/(tabs)/asset/[code].tsx`

### `unit_assets`

```sql
unit_assets(p_unit uuid)
  returns table ( id uuid, asset_code text, name text, category_name text, status_name text, condition_name text, location_name text )
  language sql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260821090000_install_to_unit.sql:161`
- **Security:** SECURITY INVOKER
- **Kembalian:** `table ( id uuid, asset_code text, name text, category_name text, status_name text, condition_name text, location_name text )`

**Tujuan.** Mendaftar aset yang sedang terpasang pada satu unit.

- **Menulis ke:** —
- **Membaca:** `asset_conditions`, `asset_statuses`, `assets`, `categories`, `locations`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** `src/api/units.ts:57`
- **Pembungkus TS:** `fetchUnitAssets()` di `src/api/units.ts`
- **Dipakai di layar:** — (lihat §Z.3)

---

## M7. E-BAST

19 fungsi.

### `next_bast_number`

```sql
next_bast_number()
  returns text
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260729150000_fix_counters_and_rename.sql:44` · Didefinisikan 2×
- **Security:** SECURITY DEFINER
- **Kembalian:** `text`

**Tujuan.** Menerbitkan nomor BAST berikutnya dalam format `BAST/CITE/<tahun>/<4 digit>`, memakai penghitung per tahun. SECURITY DEFINER karena `bast_number_counters` tidak dapat disentuh klien; inilah yang menjadikan klaim 'nomor tidak mungkin bertabrakan' jaminan struktural, bukan janji aplikasi. Dipasang sebagai DEFAULT kolom `bast.bast_number`, sehingga INSERT yang lupa menyertakan nomor pun tetap mendapat nomor yang sah.

- **Menulis ke:** `bast_number_counters` (INSERT)
- **Membaca:** —
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat DEFAULT kolom. Contoh rujukan: `20260729090000_init_schema.sql:305`

### `bast_list`

```sql
bast_list(
    p_locations uuid[],
    p_kind text default null
)
  returns table ( id uuid, bast_number text, kind bast_kind, status bast_status, bast_date date, asset_code text, asset_name text, employee_name text, department_name text, location_name text, current_version int )
  language sql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260821090300_accessory_bast.sql:86` · Didefinisikan 3×
- **Security:** SECURITY INVOKER
- **Kembalian:** `table ( id uuid, bast_number text, kind bast_kind, status bast_status, bast_date date, asset_code text, asset_name text, employee_name text, department_name text, location_name text, current_version int )`

**Tujuan.** Daftar dokumen BAST dalam scope, dengan penyaringan jenis. Join ke `assets` diubah menjadi LEFT join saat `asset_id` menjadi nullable, dan filter scope jatuh ke lokasi dokumen sendiri — tanpa itu dokumen tanpa aset bukan tersembunyi melainkan tak terlihat sama sekali, yang lebih buruk karena tidak ada yang tampak salah.

- **Menulis ke:** —
- **Membaca:** `accounts`, `assets`, `bast`, `departments`, `locations`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** `src/api/bast.ts:189`
- **Pembungkus TS:** `fetchBastList()` di `src/api/bast.ts`
- **Dipakai di layar:** `app/(tabs)/bast/index.tsx`

### `bast_detail`

```sql
bast_detail(p_id uuid)
  returns jsonb
  language plpgsql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260821090600_second_holder_reads.sql:114` · Didefinisikan 5×
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Payload lengkap satu dokumen BAST: kop surat dari lokasinya, penerima pertama dan kedua beserta NIK dan jabatan, baris barang, tanda tangan, dan versi berkas. Inilah yang memasok Edge Function perender PDF.

- **Menulis ke:** —
- **Membaca:** `accounts`, `assets`, `bast`, `bast_items`, `bast_signatures`, `bast_versions`, `departments`, `locations`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** `indonesian_date_words()`, `indonesian_long_date()`, `indonesian_short_date()`
- **Dipanggil dari:** `src/api/bast.ts:232`
- **Pembungkus TS:** `fetchBastDetail()` di `src/api/bast.ts`
- **Dipakai di layar:** `app/(tabs)/bast/[id].tsx`, `app/(tabs)/bast/sign.tsx`

### `bast_stats`

```sql
bast_stats(p_locations uuid[])
  returns jsonb
  language sql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260821090300_accessory_bast.sql:109` · Didefinisikan 3×
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Menghitung kartu statistik BAST — total, ditandatangani, menunggu tanda tangan, draf, dan void — dalam scope pemanggil.

- **Menulis ke:** —
- **Membaca:** `assets`, `bast`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** `src/api/bast.ts:198`
- **Pembungkus TS:** `fetchBastStats()` di `src/api/bast.ts`
- **Dipakai di layar:** `app/(tabs)/bast/index.tsx`

### `set_bast_items`

```sql
set_bast_items(
    p_bast uuid,
    p_items jsonb
)
  returns jsonb
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260821090400_accessories_on_bast.sql:20` · Didefinisikan 2×
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Mengganti seluruh baris barang pada sebuah BAST. Sempat memakai `can_see_asset(b.asset_id)`, sehingga BAST Perlengkapan — satu-satunya dokumen yang isinya justru **hanya** tabel barang — adalah satu-satunya dokumen yang tabel barangnya tidak dapat disunting; kini memakai `can_see_bast_row()` yang sama dengan policy. Menolak menyunting dokumen yang sudah ditandatangani.

- **Menulis ke:** `bast_items` (DELETE/INSERT)
- **Membaca:** `bast`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `BAST not found` | `P0001` |
  | `You do not have permission to change this document` | `P0001` |
  | `This BAST is already signed — its contents cannot change` | `P0001` |
  | `Expected a list of items` | `P0001` |
  | `A BAST cannot list more than 20 items` | `P0001` |
  | `Every line needs a Jenis/Type` | `P0001` |

- **Memanggil fungsi lain:** `can_see_bast_row()`, `can_write_assets()`
- **Dipanggil dari:** `src/api/bast.ts:218`
- **Pembungkus TS:** `setBastItems()` di `src/api/bast.ts`
- **Dipakai di layar:** `app/(tabs)/bast/[id].tsx`

### `set_bast_kind`

```sql
set_bast_kind(
    p_bast uuid,
    p_kind text
)
  returns jsonb
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260824090300_delete_account_and_void_bast.sql:230`
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Menetapkan jenis dokumen kertas yang sedang diarsipkan ke sistem. BAST yang dibuat aplikasi sudah tahu jenisnya; kertas tidak. Hanya diizinkan selama dokumen belum ditandatangani, sebab judul di halaman berbunyi SERAH TERIMA atau PENARIKAN dan mengubahnya sesudah itu membuat record bertentangan dengan kertas yang ditandatangani orang.

- **Menulis ke:** `bast` (UPDATE)
- **Membaca:** —
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `BAST not found` | `P0001` |
  | `You do not have permission to change this document` | `P0001` |
  | `This BAST is already signed — its kind cannot change` | `P0001` |
  | `Unknown kind of document` | `P0001` |

- **Memanggil fungsi lain:** `can_see_bast_row()`, `can_write_assets()`
- **Dipanggil dari:** `src/api/bast.ts:468`
- **Pembungkus TS:** `setBastKind()` di `src/api/bast.ts`
- **Dipakai di layar:** `app/(tabs)/bast/[id].tsx`

### `attach_generated_bast`

```sql
attach_generated_bast(
    p_bast uuid,
    p_path text,
    p_size bigint default null
)
  returns jsonb
  language plpgsql security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260729200000_bast.sql:181`
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Mencatat PDF hasil render ke `bast_versions` sesudah Edge Function menaruhnya di bucket. Idempoten: v1 adalah 'PDF yang dibangkitkan' dan me-render ulang menimpa objek yang sama alih-alih menumbuhkan riwayat versi — yang penting karena `bast_versions` tidak dapat di-UPDATE.

- **Menulis ke:** `bast` (UPDATE); `bast_versions` (INSERT)
- **Membaca:** `bast_versions`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `BAST not found` | `P0001` |
  | `You do not have permission to generate this document` | `P0001` |
  | `File path does not belong to this BAST` | `P0001` |

- **Memanggil fungsi lain:** `can_write_assets()`
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat Edge Function. Contoh rujukan: `supabase/functions/generate-bast-pdf/index.ts:565`

### `attach_signed_bast`

```sql
attach_signed_bast(
    p_bast uuid,
    p_path text,
    p_size bigint default null,
    p_mime text default 'application/pdf'
)
  returns jsonb
  language plpgsql security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260824090100_signed_bast_without_asset.sql:24` · Didefinisikan 2×
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Mencatat PDF bertanda tangan dan memindahkan status dokumen menjadi `signed`. Inilah satu-satunya tempat status itu berpindah, sehingga 'Signed' tetap punya satu makna: dokumennya ada. Salinan cermin ke tab Documents aset kini bersyarat, sebab `documents.asset_id` bersifat NOT NULL dan BAST Perlengkapan tidak punya aset untuk ditumpangi.

- **Menulis ke:** `bast` (UPDATE); `bast_versions` (INSERT); `documents` (INSERT)
- **Membaca:** `bast_versions`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `BAST not found` | `P0001` |
  | `You do not have permission to upload a signed BAST` | `P0001` |
  | `File path does not belong to this BAST` | `P0001` |

- **Memanggil fungsi lain:** `can_write_assets()`, `my_account_id()`
- **Dipanggil dari:** `src/api/bast.ts:348`
- **Pembungkus TS:** `attachSignedBast()` di `src/api/bast.ts`
- **Dipakai di layar:** `app/(tabs)/bast/[id].tsx`

### `delete_bast`

```sql
delete_bast(
    p_bast uuid,
    p_reason text default null
)
  returns jsonb
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260824090300_delete_account_and_void_bast.sql:156`
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Menghapus draf BAST yang dibuat karena kekeliruan — hanya untuk dokumen yang belum ditandatangani, belum punya PDF, dan belum punya tanda tangan. Selain itu, `void_bast()` yang dipakai.

- **Menulis ke:** `accessory_checkouts` (UPDATE); `audit_log` (INSERT); `bast` (DELETE); `bast_items` (DELETE)
- **Membaca:** `bast_signatures`, `bast_versions`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `BAST not found` | `P0001` |
  | `Only a Super Admin can delete a document` | `P0001` |
  | `Say why this document is being deleted` | `P0001` |
  | `% has %. Void it instead — a signed document is the evidence a handover happened, and deleting it would remove the proof rather than the mistake.` | `P0001` |

- **Memanggil fungsi lain:** `can_see_bast_row()`, `my_account_id()`, `my_role()`
- **Dipanggil dari:** `src/api/bast.ts:454`
- **Pembungkus TS:** `deleteBast()` di `src/api/bast.ts`
- **Dipakai di layar:** `app/(tabs)/bast/[id].tsx`

### `void_bast`

```sql
void_bast(
    p_bast uuid,
    p_reason text default null
)
  returns jsonb
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260824090300_delete_account_and_void_bast.sql:112`
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Bentuk jujur dari 'hapus' untuk dokumen yang sudah terlanjur ada: status menjadi `void`, nomornya tetap terpakai, alasannya dicatat, dan lembar itu berhenti dihitung. Alasan ditulis ke `audit_log` sebelum bertindak.

- **Menulis ke:** `audit_log` (INSERT); `bast` (UPDATE)
- **Membaca:** —
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `BAST not found` | `P0001` |
  | `You do not have permission to void this document` | `P0001` |
  | `Say why this document is being voided` | `P0001` |
  | `That document is already void` | `P0001` |

- **Memanggil fungsi lain:** `can_see_bast_row()`, `can_write_assets()`, `my_account_id()`
- **Dipanggil dari:** `src/api/bast.ts:448`
- **Pembungkus TS:** `voidBast()` di `src/api/bast.ts`
- **Dipakai di layar:** `app/(tabs)/bast/[id].tsx`

### `sign_bast`

```sql
sign_bast(
    p_bast uuid,
    p_role text,
    p_name text,
    p_title text,
    p_strokes jsonb
)
  returns jsonb
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260821090500_second_holder.sql:112` · Didefinisikan 2×
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Merekam satu tanda tangan sebagai lintasan pena. Memvalidasi visibilitas lewat `can_see_bast_row()` sehingga BAST Perlengkapan dapat ditandatangani sama sekali, menolak dokumen yang sudah void, dan menolak nama penanda tangan kosong. Penanda `complete` menunggu penerima kedua bila ada. Perlu dicatat: merekam tanda tangan **tidak** mengubah status menjadi `signed` — itu tugas `attach_signed_bast()`.

- **Menulis ke:** `bast_signatures` (INSERT)
- **Membaca:** `bast`, `bast_signatures`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Unknown signature role` | `P0001` |
  | `BAST not found` | `P0001` |
  | `You do not have permission to sign this document` | `P0001` |
  | `This BAST has been voided` | `P0001` |
  | `Who is signing?` | `P0001` |

- **Memanggil fungsi lain:** `can_see_bast_row()`, `can_write_assets()`, `my_account_id()`, `validate_signature_strokes()`
- **Dipanggil dari:** `src/api/bast.ts:406`
- **Pembungkus TS:** `signBast()` di `src/api/bast.ts`
- **Dipakai di layar:** `app/(tabs)/bast/sign.tsx`

### `validate_signature_strokes`

```sql
validate_signature_strokes(p_strokes jsonb)
  returns void
  language plpgsql immutable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260731090000_ebast_signatures.sql:137`
- **Security:** SECURITY INVOKER (bawaan — tidak ditulis di DDL)
- **Kembalian:** `void`

**Tujuan.** Memeriksa bentuk jsonb goresan tanda tangan sebelum disimpan. Berjalan di database, bukan di aplikasi, karena perender PDF di sisi lain tidak punya cara pulih dari path yang rusak: ia akan memancarkan content stream cacat dan dokumennya gagal dibuka. Menolak di titik tulis adalah satu-satunya tempat galat itu masih murah.

- **Menulis ke:** —
- **Membaca:** —
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Signature is not in the expected format` | `P0001` |
  | `Signature has too many strokes` | `P0001` |
  | `Signature is out of bounds` | `P0001` |
  | `That signature is too short — please sign again` | `P0001` |
  | `Signature is too large` | `P0001` |

- **Memanggil fungsi lain:** —
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat fungsi SQL lain. Contoh rujukan: `20260731090000_ebast_signatures.sql:230`, `20260821090500_second_holder.sql:154`

### `bast_signatories_list`

```sql
bast_signatories_list()
  returns table (id uuid, full_name text, title text, department_name text)
  language sql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260731090000_ebast_signatures.sql:253`
- **Security:** SECURITY INVOKER
- **Kembalian:** `table (id uuid, full_name text, title text, department_name text)`

**Tujuan.** Memasok picker 'Yang Menyerahkan'. Perlu dicatat bahwa daftar ini tidak terhubung ke `bast_signatures` lewat foreign key mana pun — namanya disalin sebagai nilai saat menandatangani.

- **Menulis ke:** —
- **Membaca:** `bast_signatories`, `departments`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** `src/api/bast.ts:371`
- **Pembungkus TS:** `fetchSignatories()` di `src/api/bast.ts`
- **Dipakai di layar:** `app/(tabs)/bast/sign.tsx`

### `add_bast_signatory`

```sql
add_bast_signatory(
    p_name text,
    p_title text default null,
    p_department uuid default null
)
  returns jsonb
  language plpgsql security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260731090000_ebast_signatures.sql:263`
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Menambah nama ke daftar 'Yang Menyerahkan', atau memperbarui yang sudah ada bila namanya cocok case-insensitive. Satu isian saja, karena itulah arti 'fully customizeable' dalam praktik.

- **Menulis ke:** `bast_signatories` (INSERT/UPDATE)
- **Membaca:** —
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `A name is required` | `P0001` |

- **Memanggil fungsi lain:** `my_account_id()`
- **Dipanggil dari:** `src/api/bast.ts:382`
- **Pembungkus TS:** `addSignatory()` di `src/api/bast.ts`
- **Dipakai di layar:** `app/(tabs)/bast/sign.tsx`

### `terbilang`

```sql
terbilang(n bigint)
  returns text
  language plpgsql immutable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260804140000_bast_documents_and_maintenance_status.sql:72`
- **Security:** SECURITY INVOKER (bawaan — tidak ditulis di DDL)
- **Kembalian:** `text`

**Tujuan.** Mengubah bilangan menjadi kata-kata bahasa Indonesia untuk dicetak pada dokumen BAST.

- **Menulis ke:** —
- **Membaca:** —
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat fungsi SQL lain. Contoh rujukan: `20260804140000_bast_documents_and_maintenance_status.sql:112`

### `terbilang_kapital`

```sql
terbilang_kapital(n bigint)
  returns text
  language sql immutable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260804140000_bast_documents_and_maintenance_status.sql:110`
- **Security:** SECURITY INVOKER (bawaan — tidak ditulis di DDL)
- **Kembalian:** `text`

**Tujuan.** Membungkus `terbilang()` dan mengapitalkan huruf pertamanya.

- **Menulis ke:** —
- **Membaca:** —
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** `terbilang()`
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat fungsi SQL lain. Contoh rujukan: `20260804140000_bast_documents_and_maintenance_status.sql:126`, `20260804140000_bast_documents_and_maintenance_status.sql:131`

### `indonesian_date_words`

```sql
indonesian_date_words(p_date date)
  returns text
  language sql immutable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260804140000_bast_documents_and_maintenance_status.sql:122`
- **Security:** SECURITY INVOKER (bawaan — tidak ditulis di DDL)
- **Kembalian:** `text`

**Tujuan.** Mengubah tanggal menjadi rangkaian kata bahasa Indonesia untuk badan dokumen BAST.

- **Menulis ke:** —
- **Membaca:** —
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** `terbilang_kapital()`
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat fungsi SQL lain. Contoh rujukan: `20260804140000_bast_documents_and_maintenance_status.sql:317`, `20260821090300_accessory_bast.sql:259`, `20260821090600_second_holder_reads.sql:137`

### `indonesian_long_date`

```sql
indonesian_long_date(p_date date)
  returns text
  language sql immutable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260729200000_bast.sql:20`
- **Security:** SECURITY INVOKER (bawaan — tidak ditulis di DDL)
- **Kembalian:** `text`

**Tujuan.** Memformat tanggal panjang bahasa Indonesia, misalnya `31 Agustus 2026`.

- **Menulis ke:** —
- **Membaca:** —
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat fungsi SQL lain. Contoh rujukan: `20260729200000_bast.sql:89`, `20260731090000_ebast_signatures.sql:314`, `20260804140000_bast_documents_and_maintenance_status.sql:314`

### `indonesian_short_date`

```sql
indonesian_short_date(p_date date)
  returns text
  language sql immutable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260804140000_bast_documents_and_maintenance_status.sql:135`
- **Security:** SECURITY INVOKER (bawaan — tidak ditulis di DDL)
- **Kembalian:** `text`

**Tujuan.** Memformat tanggal pendek bahasa Indonesia untuk tempat yang sempit di dokumen.

- **Menulis ke:** —
- **Membaca:** —
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat fungsi SQL lain. Contoh rujukan: `20260804140000_bast_documents_and_maintenance_status.sql:319`, `20260821090300_accessory_bast.sql:261`, `20260821090600_second_holder_reads.sql:139`

---

## M8. Perlengkapan

9 fungsi.

### `accessories_list`

```sql
accessories_list(
    p_locations uuid[],
    p_query text default null,
    p_category uuid default null
)
  returns table ( id uuid, name text, category_id uuid, category_name text, brand_name text, model_no text, location_id uuid, location_name text, total_qty int, assigned_qty int, available_qty int, min_qty int, is_active boolean )
  language sql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260821090200_accessories.sql:129`
- **Security:** SECURITY INVOKER
- **Kembalian:** `table ( id uuid, name text, category_id uuid, category_name text, brand_name text, model_no text, location_id uuid, location_name text, total_qty int, assigned_qty int, available_qty int, min_qty int, is_active boolean )`

**Tujuan.** Register perlengkapan dalam scope, dengan penyaringan kata kunci dan kategori, disertai jumlah yang tersedia per baris.

- **Menulis ke:** —
- **Membaca:** `accessories`, `brands`, `categories`, `locations`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** `accessory_available()`
- **Dipanggil dari:** `src/api/accessories.ts:43`
- **Pembungkus TS:** `fetchAccessories()` di `src/api/accessories.ts`
- **Dipakai di layar:** `app/(tabs)/accessories.tsx`, `app/(tabs)/assign.tsx`

### `accessory_detail`

```sql
accessory_detail(p_id uuid)
  returns jsonb
  language plpgsql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260821090200_accessories.sql:162`
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Detail satu baris perlengkapan beserta daftar checkout aktifnya.

- **Menulis ke:** —
- **Membaca:** `accessories`, `accessory_checkouts`, `accounts`, `bast`, `brands`, `categories`, `locations`, `vendors`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** `accessory_available()`
- **Dipanggil dari:** `src/api/accessories.ts:92`
- **Pembungkus TS:** `fetchAccessoryDetail()` di `src/api/accessories.ts`
- **Dipakai di layar:** `app/(tabs)/accessory-edit.tsx`, `app/(tabs)/accessory/[id].tsx`

### `accessory_available`

```sql
accessory_available(p_id uuid)
  returns int
  language sql stable security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260821090200_accessories.sql:116`
- **Security:** SECURITY DEFINER
- **Kembalian:** `int`

**Tujuan.** Satu definisi 'berapa yang ada di rak': `total_qty` dikurangi jumlah checkout aktif, dijaga tidak negatif. Ketersediaan sengaja tidak disimpan sebagai kolom sehingga tidak dapat menyimpang dari kenyataan.

- **Menulis ke:** —
- **Membaca:** `accessories`, `accessory_checkouts`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat fungsi SQL lain. Contoh rujukan: `20260821090200_accessories.sql:144`, `20260821090200_accessories.sql:145`, `20260821090200_accessories.sql:188`

### `create_accessory`

```sql
create_accessory(p_input jsonb)
  returns jsonb
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260821090200_accessories.sql:223`
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Membuat baris stok perlengkapan baru dari payload jsonb. SECURITY DEFINER dengan penjagaan RLS dinyatakan ulang. Memvalidasi nama, lokasi dalam scope, kategori, dan jumlah tidak negatif.

- **Menulis ke:** `accessories` (INSERT)
- **Membaca:** `accessories`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `You do not have permission to add accessories` | `P0001` |
  | `Enter a name first` | `P0001` |
  | `Choose a category` | `P0001` |
  | `Choose a location you can write to` | `P0001` |
  | `Quantity cannot be negative` | `P0001` |
  | `"%" already exists at that location` | `P0001` |

- **Memanggil fungsi lain:** `can_write_assets()`, `my_account_id()`, `my_location_ids()`
- **Dipanggil dari:** `src/api/accessories.ts:113`
- **Pembungkus TS:** `createAccessory()` di `src/api/accessories.ts`
- **Dipakai di layar:** `app/(tabs)/accessory-edit.tsx`

### `update_accessory`

```sql
update_accessory(
    p_id uuid,
    p_input jsonb
)
  returns jsonb
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260821090200_accessories.sql:273`
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Menyunting baris stok perlengkapan. Menolak menurunkan `total_qty` di bawah jumlah yang sedang dipegang orang, sebab itu akan membuat ketersediaan menjadi negatif.

- **Menulis ke:** `accessories` (UPDATE)
- **Membaca:** —
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Accessory not found` | `P0001` |
  | `You do not have permission to change this accessory` | `P0001` |
  | `Cannot go below % — that many are still out` | `P0001` |

- **Memanggil fungsi lain:** `accessory_available()`, `can_write_assets()`, `my_location_ids()`
- **Dipanggil dari:** `src/api/accessories.ts:122`
- **Pembungkus TS:** `updateAccessory()` di `src/api/accessories.ts`
- **Dipakai di layar:** `app/(tabs)/accessory-edit.tsx`

### `assign_accessory`

```sql
assign_accessory(
    p_accessory uuid,
    p_account uuid,
    p_qty int,
    p_date date default current_date,
    p_notes text default null,
    p_bast uuid default null
)
  returns jsonb
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260821090200_accessories.sql:322`
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Mengeluarkan sejumlah perlengkapan kepada seseorang. Memvalidasi jumlah positif dan ketersediaan cukup. Istilahnya sengaja memakai kata yang sama dengan sisa aplikasi — Snipe-IT menyebutnya check out dan check in, dan mempelajari dua kosakata untuk satu gagasan adalah biaya tanpa imbalan.

- **Menulis ke:** `accessory_checkouts` (INSERT)
- **Membaca:** `accessories`, `accounts`, `locations`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Accessory not found` | `P0001` |
  | `You do not have permission to hand this out` | `P0001` |
  | `% is no longer in use` | `P0001` |
  | `Choose someone to give it to` | `P0001` |
  | `How many?` | `P0001` |
  | `Only % left at %` | `P0001` |

- **Memanggil fungsi lain:** `accessory_available()`, `can_write_assets()`, `my_account_id()`, `my_location_ids()`
- **Dipanggil dari:** `src/api/accessories.ts:143`
- **Pembungkus TS:** `assignAccessory()` di `src/api/accessories.ts`
- **Dipakai di layar:** `app/(tabs)/accessory/[id].tsx`, `app/(tabs)/assign.tsx`

### `return_accessory`

```sql
return_accessory(
    p_checkout uuid,
    p_date date default current_date
)
  returns jsonb
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260821090200_accessories.sql:378`
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Menutup satu checkout perlengkapan dan mengembalikan jumlahnya ke rak.

- **Menulis ke:** `accessory_checkouts` (UPDATE)
- **Membaca:** `accessories`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `That hand-out was not found` | `P0001` |
  | `You do not have permission to take this back` | `P0001` |
  | `That has already been returned` | `P0001` |
  | `It cannot come back before it went out` | `P0001` |

- **Memanggil fungsi lain:** `accessory_available()`, `can_write_assets()`, `my_location_ids()`
- **Dipanggil dari:** `src/api/accessories.ts:166`
- **Pembungkus TS:** `returnAccessory()` di `src/api/accessories.ts`
- **Dipakai di layar:** `app/(tabs)/accessory/[id].tsx`

### `create_accessory_bast`

```sql
create_accessory_bast(
    p_account uuid,
    p_checkouts uuid[]
)
  returns jsonb
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260821090300_accessory_bast.sql:132`
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Membungkus checkout yang **sudah terjadi** dengan sebuah dokumen BAST. Ia tidak mengeluarkan stok apa pun sendiri — hanya `assign_accessory()` yang menggerakkan stok — sehingga kegagalan di sini tidak akan pernah membuat hitungan rak salah.

- **Menulis ke:** `accessory_checkouts` (UPDATE); `bast` (INSERT); `bast_items` (INSERT)
- **Membaca:** `accessories`, `accounts`, `bast`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `You do not have permission to raise a BAST` | `P0001` |
  | `Choose at least one accessory` | `P0001` |
  | `Choose who it is for` | `P0001` |
  | `Some of those are already on a document, returned, or somebody else's` | `P0001` |
  | `Those come from different locations — raise one document each` | `P0001` |
  | `That location is outside your scope` | `P0001` |

- **Memanggil fungsi lain:** `can_write_assets()`, `my_account_id()`, `my_location_ids()`
- **Dipanggil dari:** `src/api/accessories.ts:191`
- **Pembungkus TS:** `createAccessoryBast()` di `src/api/accessories.ts`
- **Dipakai di layar:** `app/(tabs)/accessory/[id].tsx`

### `attach_accessories_to_bast`

```sql
attach_accessories_to_bast(
    p_bast uuid,
    p_checkouts uuid[]
)
  returns jsonb
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260821090400_accessories_on_bast.sql:76`
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Menambahkan baris perlengkapan ke BAST aset yang sudah ada, menempel alih-alih mengganti karena baris aset itu sendiri sudah ada di sana dan `set_bast_items()` akan menghapusnya. Dibuat sebagai panggilan terpisah yang dilakukan wizard sesudah penugasan berhasil, supaya `assign_asset()` tidak perlu melebarkan signature-nya.

- **Menulis ke:** `accessory_checkouts` (UPDATE); `bast_items` (INSERT)
- **Membaca:** `accessories`, `assets`, `bast`, `bast_items`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `BAST not found` | `P0001` |
  | `You do not have permission to change this document` | `P0001` |
  | `This BAST is already signed — its contents cannot change` | `P0001` |
  | `Some of those are already on a document, returned, or somebody else's` | `P0001` |
  | `A BAST cannot list more than 20 items` | `P0001` |

- **Memanggil fungsi lain:** `can_see_bast_row()`, `can_write_assets()`
- **Dipanggil dari:** `src/api/accessories.ts:208`
- **Pembungkus TS:** `attachAccessoriesToBast()` di `src/api/accessories.ts`
- **Dipakai di layar:** `app/(tabs)/assign.tsx`

---

## M9. Perawatan

8 fungsi.

### `log_maintenance`

```sql
log_maintenance(
    p_asset uuid,
    p_title text,
    p_started date,
    p_completed date default null,
    p_detail text default null,
    p_vendor uuid default null,
    p_is_internal boolean default false,
    p_warranty boolean default false,
    p_cost numeric default null,
    p_next_due date default null
)
  returns jsonb
  language plpgsql security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260804140000_bast_documents_and_maintenance_status.sql:643` · Didefinisikan 2×
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Mencatat satu pekerjaan perawatan, termasuk yang sudah selesai, sekaligus menyelaraskan status aset lewat `sync_asset_maintenance_status()`.

- **Menulis ke:** `maintenance_records` (INSERT)
- **Membaca:** `asset_statuses`, `assets`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `You do not have permission to record maintenance here` | `P0001` |
  | `What was done?` | `P0001` |
  | `It cannot have finished before it started` | `P0001` |
  | `The next service cannot be due before this one started` | `P0001` |
  | `A cost cannot be negative` | `P0001` |

- **Memanggil fungsi lain:** `can_see_asset()`, `can_write_assets()`, `my_account_id()`, `sync_asset_maintenance_status()`
- **Dipanggil dari:** `src/api/maintenance.ts:95`
- **Pembungkus TS:** `logMaintenance()` di `src/api/maintenance.ts`
- **Dipakai di layar:** `app/(tabs)/maintenance-log.tsx`

### `edit_maintenance`

```sql
edit_maintenance(
    p_id uuid,
    p_title text default null,
    p_started date default null,
    p_completed date default null,
    p_detail text default null,
    p_vendor uuid default null,
    p_cost numeric default null,
    p_next_due date default null,
    p_clear_completed boolean default false
)
  returns jsonb
  language plpgsql security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260804140000_bast_documents_and_maintenance_status.sql:696` · Didefinisikan 3×
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Menyunting catatan perawatan yang ada dan menyelaraskan ulang status asetnya.

- **Menulis ke:** `maintenance_records` (UPDATE)
- **Membaca:** `asset_statuses`, `assets`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Maintenance record not found` | `P0001` |
  | `You do not have permission to change this record` | `P0001` |
  | `It cannot have finished before it started` | `P0001` |
  | `A cost cannot be negative` | `P0001` |

- **Memanggil fungsi lain:** `can_see_asset()`, `can_write_assets()`, `sync_asset_maintenance_status()`
- **Dipanggil dari:** `src/api/maintenance.ts:125`
- **Pembungkus TS:** `editMaintenance()` di `src/api/maintenance.ts`
- **Dipakai di layar:** `app/(tabs)/maintenance-log.tsx`

### `maintenance_log`

```sql
maintenance_log(
    p_locations uuid[],
    p_ongoing boolean default null
)
  returns table ( id uuid, asset_id uuid, asset_code text, asset_name text, title text, detail text, vendor_name text, is_internal boolean, cost numeric, under_warranty boolean, started_at date, completed_at date, next_due_at date, days int, ongoing boolean, location_name text )
  language sql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260804090000_maintenance_and_tags.sql:153`
- **Security:** SECURITY INVOKER
- **Kembalian:** `table ( id uuid, asset_id uuid, asset_code text, asset_name text, title text, detail text, vendor_name text, is_internal boolean, cost numeric, under_warranty boolean, started_at date, completed_at date, next_due_at date, days int, ongoing boolean, location_name text )`

**Tujuan.** Daftar catatan perawatan dalam scope, dengan penyaringan sedang berjalan atau selesai.

- **Menulis ke:** —
- **Membaca:** `assets`, `locations`, `maintenance_records`, `vendors`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** `src/api/maintenance.ts:60`
- **Pembungkus TS:** `fetchMaintenance()` di `src/api/maintenance.ts`
- **Dipakai di layar:** `app/(tabs)/maintenance-log.tsx`, `app/(tabs)/maintenance.tsx`

### `maintenance_list`

```sql
maintenance_list(
    p_locations uuid[],
    p_state text default null
)
  returns table ( id uuid, asset_id uuid, asset_code text, asset_name text, title text, detail text, state maintenance_state, vendor_name text, cost numeric, under_warranty boolean, started_at date, completed_at date, next_due_at date, location_name text )
  language sql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260801090000_phase6.sql:236`
- **Security:** SECURITY INVOKER
- **Kembalian:** `table ( id uuid, asset_id uuid, asset_code text, asset_name text, title text, detail text, state maintenance_state, vendor_name text, cost numeric, under_warranty boolean, started_at date, completed_at date, next_due_at date, location_name text )`

**Tujuan.** Bentuk daftar perawatan yang lebih tua, disaring berdasarkan `state`. Digantikan `maintenance_log()` dan tidak lagi dipanggil klien.

- **Menulis ke:** —
- **Membaca:** `assets`, `locations`, `maintenance_records`, `vendors`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** **TIDAK DIPAKAI** — nol rujukan di seluruh repositori (bukan RPC, bukan trigger, tidak dipanggil policy, Edge Function, cron, DEFAULT, maupun fungsi SQL lain). Lihat §Z.1.e.

### `maintenance_stats`

```sql
maintenance_stats(p_locations uuid[])
  returns jsonb
  language sql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260804090000_maintenance_and_tags.sql:180` · Didefinisikan 2×
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Menghitung kartu statistik perawatan: sedang berjalan, selesai, dan total biaya.

- **Menulis ke:** —
- **Membaca:** `assets`, `maintenance_records`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** `src/api/maintenance.ts:69`
- **Pembungkus TS:** `fetchMaintenanceStats()` di `src/api/maintenance.ts`
- **Dipakai di layar:** `app/(tabs)/maintenance.tsx`

### `open_maintenance`

```sql
open_maintenance(
    p_asset uuid,
    p_title text,
    p_detail text default null,
    p_vendor uuid default null,
    p_is_internal boolean default false,
    p_warranty boolean default false,
    p_started date default null,
    p_next_due date default null
)
  returns jsonb
  language plpgsql security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260801090000_phase6.sql:145`
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Membuka satu pekerjaan perawatan berstatus `open`. Bentuk lama yang digantikan `log_maintenance()`.

- **Menulis ke:** `maintenance_records` (INSERT)
- **Membaca:** —
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `You do not have permission to record maintenance here` | `P0001` |
  | `What is being done?` | `P0001` |
  | `The next service cannot be due before this one started` | `P0001` |

- **Memanggil fungsi lain:** `can_see_asset()`, `can_write_assets()`, `my_account_id()`
- **Dipanggil dari:** **TIDAK DIPAKAI** — nol rujukan di seluruh repositori (bukan RPC, bukan trigger, tidak dipanggil policy, Edge Function, cron, DEFAULT, maupun fungsi SQL lain). Lihat §Z.1.e.

### `update_maintenance`

```sql
update_maintenance(
    p_id uuid,
    p_state text default null,
    p_cost numeric default null,
    p_detail text default null,
    p_completed date default null,
    p_next_due date default null
)
  returns jsonb
  language plpgsql security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260801090000_phase6.sql:181`
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Memperbarui status, biaya, dan tanggal selesai satu pekerjaan perawatan. Bentuk lama yang digantikan `edit_maintenance()`.

- **Menulis ke:** `maintenance_records` (UPDATE)
- **Membaca:** —
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Maintenance record not found` | `P0001` |
  | `You do not have permission to change this record` | `P0001` |
  | `Unknown state` | `P0001` |
  | `A cost cannot be negative` | `P0001` |

- **Memanggil fungsi lain:** `can_see_asset()`, `can_write_assets()`
- **Dipanggil dari:** **TIDAK DIPAKAI** — nol rujukan di seluruh repositori (bukan RPC, bukan trigger, tidak dipanggil policy, Edge Function, cron, DEFAULT, maupun fungsi SQL lain). Lihat §Z.1.e.

### `sync_asset_maintenance_status`

```sql
sync_asset_maintenance_status(
    p_asset uuid,
    p_note text
)
  returns void
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260804140000_bast_documents_and_maintenance_status.sql:572`
- **Security:** SECURITY DEFINER
- **Kembalian:** `void`

**Tujuan.** Memindahkan status aset ke Maintenance dan mengembalikannya lagi ketika pekerjaan selesai. Satu helper yang dipanggil kedua jalur tulis, supaya kedua arah tidak mungkin diimplementasikan berbeda — yang justru penyebab bug aslinya. Bukan trigger: dipanggil `perform` dari dalam RPC.

- **Menulis ke:** `asset_status_changes` (INSERT); `assets` (UPDATE)
- **Membaca:** `asset_statuses`, `maintenance_records`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `You do not have permission to change this asset` | `P0001` |

- **Memanggil fungsi lain:** `can_see_asset()`, `can_write_assets()`, `my_account_id()`
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat fungsi SQL lain. Contoh rujukan: `20260804140000_bast_documents_and_maintenance_status.sql:686`, `20260804140000_bast_documents_and_maintenance_status.sql:741`

---

## M10. Dokumen aset

2 fungsi.

### `add_document`

```sql
add_document(
    p_asset uuid,
    p_kind text,
    p_title text,
    p_path text,
    p_size bigint default null,
    p_mime text default null
)
  returns jsonb
  language plpgsql security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260801090000_phase6.sql:70`
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Mencatat unggahan dokumen yang byte-nya sudah sampai di bucket. Memvalidasi aset, jenis dokumen, judul, dan path.

- **Menulis ke:** `documents` (INSERT)
- **Membaca:** —
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `You do not have permission to add a document here` | `P0001` |
  | `Unknown document kind` | `P0001` |
  | `A signed E-BAST is recorded by signing, not uploaded here` | `P0001` |
  | `Give the document a title` | `P0001` |
  | `File path does not belong to this asset` | `P0001` |

- **Memanggil fungsi lain:** `can_see_asset()`, `can_write_assets()`, `my_account_id()`
- **Dipanggil dari:** `src/api/documents.ts:112`
- **Pembungkus TS:** `addDocument()` di `src/api/documents.ts`
- **Dipakai di layar:** `app/(tabs)/asset/[code].tsx`

### `delete_document`

```sql
delete_document(p_id uuid)
  returns jsonb
  language plpgsql security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260801090000_phase6.sql:122`
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Menghapus satu dokumen aset — hanya Super Admin, dan tidak pernah untuk E-BAST yang sudah ditandatangani. Baris dan objeknya dimaksudkan hilang bersama; menghapus salah satunya saja menyisakan daftar yang tidak membuka apa pun atau byte yang tidak terjangkau siapa pun.

- **Menulis ke:** `documents` (DELETE)
- **Membaca:** —
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Document not found` | `P0001` |
  | `Only a Super Admin can remove a document` | `P0001` |
  | `A signed E-BAST cannot be removed — it is the record of a handover` | `P0001` |

- **Memanggil fungsi lain:** `can_see_asset()`, `my_role()`
- **Dipanggil dari:** `src/api/documents.ts:129`
- **Pembungkus TS:** `deleteDocument()` di `src/api/documents.ts`
- **Dipakai di layar:** — (lihat §Z.3)

---

## M11. Impor CSV

5 fungsi.

### `import_assets`

```sql
import_assets(
    p_rows jsonb,
    p_dry_run boolean default true,
    p_file_name text default 'import.csv'
)
  returns jsonb
  language plpgsql security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260821091200_import_asset_label.sql:28` · Didefinisikan 2×
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Mengimpor aset dari baris CSV yang sudah diurai di perangkat. Pratinjau dan komit adalah panggilan yang sama dengan satu penanda berbeda, sehingga daftar yang disetujui seseorang dihasilkan oleh kode yang benar-benar mengerjakannya. Kolom `label` opsional menempelkan stiker selama impor lewat `attach_tag()`, sehingga stiker hasil impor tidak dapat dibedakan dari yang ditempel manual; tanpa itu mengimpor 500 aset berarti 500 penempelan manual, yang bukan alur kerja yang diselesaikan siapa pun.

- **Menulis ke:** `import_batches` (INSERT)
- **Membaca:** `asset_tags`, `assets`, `locations`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `You do not have permission to import assets` | `P0001` |
  | `The file could not be read` | `P0001` |
  | `The file has no rows` | `P0001` |
  | `That is more than 5000 rows — split the file` | `P0001` |

- **Memanggil fungsi lain:** `attach_tag()`, `can_write_assets()`, `create_asset()`, `import_date()`, `import_lookup()`, `my_account_id()`, `my_location_ids()`
- **Dipanggil dari:** `src/api/imports.ts:28`
- **Pembungkus TS:** `importAssets()` di `src/api/imports.ts`
- **Dipakai di layar:** `app/(tabs)/import.tsx`

### `import_accounts`

```sql
import_accounts(
    p_rows jsonb,
    p_dry_run boolean default true,
    p_file_name text default 'employees.csv'
)
  returns jsonb
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260824090200_import_location.sql:32` · Didefinisikan 4×
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Mengimpor pegawai dari ekspor Odoo. Nilai yang berantakan dikosongkan dan dilaporkan sebagai peringatan alih-alih menggugurkan baris, sebab baris itu tetap menggambarkan orang sungguhan yang memegang laptop sungguhan; hanya dua hal yang menggugurkan baris, yaitu tidak ada nama sama sekali dan NIK yang sudah diklaim baris lain di berkas yang sama. Satu asimetri yang disengaja: `location_id` akun yang dapat login **tidak** disentuh, karena bagi mereka kolom itu adalah scope RLS, dan membiarkan spreadsheet mengubahnya berarti impor bulanan rutin dapat diam-diam melebarkan atau menyempitkan akses seseorang tanpa apa pun di layar yang mengatakannya.

- **Menulis ke:** `accounts` (INSERT/UPDATE); `import_batches` (INSERT)
- **Membaca:** —
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `The file could not be read` | `P0001` |
  | `The file has no rows` | `P0001` |
  | `That is more than 5000 rows — split the file` | `P0001` |

- **Memanggil fungsi lain:** `assert_can_manage_accounts()`, `import_lookup()`, `my_account_id()`
- **Dipanggil dari:** `src/api/imports.ts:77`
- **Pembungkus TS:** `importAccounts()` di `src/api/imports.ts`
- **Dipakai di layar:** `app/(tabs)/import-employees.tsx`

### `import_lookup`

```sql
import_lookup(
    p_table text,
    p_name text
)
  returns uuid
  language plpgsql stable security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260820090300_import_accounts.sql:45` · Didefinisikan 2×
- **Security:** SECURITY DEFINER
- **Kembalian:** `uuid`

**Tujuan.** Menyelesaikan nama master data menjadi id saat impor, toleran terhadap perbedaan huruf besar-kecil dan variasi ejaan seperti `PT` dengan atau tanpa titik.

- **Menulis ke:** —
- **Membaca:** `asset_conditions`, `asset_statuses`, `brands`, `categories`, `companies`, `departments`, `locations`, `models`, `vendors`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Unknown lookup %` | `P0001` |

- **Memanggil fungsi lain:** —
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat fungsi SQL lain. Contoh rujukan: `20260801150000_csv_import.sql:200`, `20260801150000_csv_import.sql:208`, `20260801150000_csv_import.sql:221`

### `import_date`

```sql
import_date(p_value text)
  returns date
  language plpgsql immutable security invoker
```

- **Definisi:** `supabase/migrations/20260801150000_csv_import.sql:81`
- **Security:** SECURITY INVOKER (bawaan — tidak ditulis di DDL)
- **Kembalian:** `date`

**Tujuan.** Mengurai tanggal dari CSV yang formatnya bermacam-macam menjadi `date`, mengembalikan null untuk sel kosong.

- **Menulis ke:** —
- **Membaca:** —
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `unparseable date` | — |

- **Memanggil fungsi lain:** —
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat fungsi SQL lain. Contoh rujukan: `20260801150000_csv_import.sql:260`, `20260801150000_csv_import.sql:268`, `20260801150000_csv_import.sql:276`

### `import_history`

```sql
import_history(p_limit int default 25)
  returns table ( id uuid, kind text, file_name text, total_rows int, imported_rows int, skipped_rows int, errors jsonb, imported_by_name text, created_at timestamptz )
  language sql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260820090400_import_accounts_rpc.sql:290` · Didefinisikan 2×
- **Security:** SECURITY INVOKER
- **Kembalian:** `table ( id uuid, kind text, file_name text, total_rows int, imported_rows int, skipped_rows int, errors jsonb, imported_by_name text, created_at timestamptz )`

**Tujuan.** Riwayat impor terakhir dari `import_batches`, mencakup impor aset maupun impor pegawai lewat kolom `kind`.

- **Menulis ke:** —
- **Membaca:** `accounts`, `import_batches`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** `src/api/imports.ts:112`
- **Pembungkus TS:** `fetchImportHistory()` di `src/api/imports.ts`
- **Dipakai di layar:** `app/(tabs)/import-employees.tsx`, `app/(tabs)/import.tsx`

---

## M12. Laporan dan analitik

4 fungsi.

### `dashboard_summary`

```sql
dashboard_summary(p_locations uuid[])
  returns jsonb
  language sql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260803140000_dashboard.sql:18`
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Seluruh angka layar Home dalam satu round trip: grid KPI, kartu garansi, donat kategori, batang lokasi, dan rel aktivitas terakhir. Enam query yang ditembakkan setiap kali scope berubah adalah enam kesempatan bagi kartu-kartu itu untuk saling bertentangan selama satu frame. Delta seperti '+18 bulan ini' dihitung terhadap `created_at`, yaitu kapan baris dimasukkan — bukan kapan asetnya dibeli, karena itu pertanyaan berbeda dan hanya satu yang dapat dijawab tabel ini.

- **Menulis ke:** —
- **Membaca:** `accounts`, `asset_statuses`, `assets`, `assignments`, `categories`, `departments`, `locations`, `movements`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** `src/api/dashboard.ts:44`
- **Pembungkus TS:** `fetchDashboard()` di `src/api/dashboard.ts`
- **Dipakai di layar:** `app/(tabs)/index.tsx`

### `report_summary`

```sql
report_summary(p_locations uuid[])
  returns jsonb
  language sql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260801170000_reports.sql:76`
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Angka ringkasan untuk lembar laporan: jumlah, nilai, dan sebaran per status dan kategori dalam scope.

- **Menulis ke:** —
- **Membaca:** `asset_statuses`, `assets`, `categories`, `locations`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** `src/api/reports.ts:67`
- **Pembungkus TS:** `fetchReportSummary()` di `src/api/reports.ts`
- **Dipakai di layar:** `app/(tabs)/reports.tsx`

### `asset_report`

```sql
asset_report(
    p_locations uuid[],
    p_status uuid default null,
    p_category uuid default null,
    p_department uuid default null,
    p_from date default null,
    p_to date default null
)
  returns table ( asset_code text, name text, category_name text, brand_name text, model_name text, serial_number text, status_name text, condition_name text, location_name text, department_name text, holder_name text, holder_nik text, vendor_name text, purchase_date date, purchase_price numeric, warranty_start date, warranty_end date, warranty_days_left int, notes text, created_at timestamptz )
  language sql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260801170000_reports.sql:18`
- **Security:** SECURITY INVOKER
- **Kembalian:** `table ( asset_code text, name text, category_name text, brand_name text, model_name text, serial_number text, status_name text, condition_name text, location_name text, department_name text, holder_name text, holder_nik text, vendor_name text, purchase_date date, purchase_price numeric, warranty_start date, warranty_end date, warranty_days_left int, notes text, created_at timestamptz )`

**Tujuan.** Proyeksi datar register yang sudah sepenuhnya di-join untuk ekspor. Disaring scope pemanggil lebih dulu, sehingga hasil ekspor tidak akan pernah memuat baris yang tidak dapat dilihat orang itu di layar — risiko utama setiap fitur ekspor. Sengaja dibuat sebagai fungsi tersendiri alih-alih memakai ulang `search_assets()`: yang satu mengisi daftar di ponsel dan mengembalikan nama tampilan, yang lain menginginkan segalanya dan tidak peduli latensi.

- **Menulis ke:** —
- **Membaca:** `accounts`, `asset_conditions`, `asset_statuses`, `assets`, `brands`, `categories`, `departments`, `locations`, `models`, `vendors`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** `src/api/reports.ts:54`
- **Pembungkus TS:** `fetchReport()` di `src/api/reports.ts`
- **Dipakai di layar:** `app/(tabs)/reports.tsx`

### `value_analytics`

```sql
value_analytics(
    p_locations uuid[],
    p_from date default null,
    p_to date default null,
    p_category uuid default null,
    p_department uuid default null
)
  returns jsonb
  language sql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260821090800_value_analytics.sql:24`
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Tiga angka nilai sekaligus — aset, perlengkapan, dan totalnya — bukan satu. Laporan sebelumnya hanya menampilkan nilai aset, padahal 500 mouse seharga 85.000 bukan pembulatan, dan total yang diam-diam mengabaikannya lebih buruk daripada tidak ada total karena tampak lengkap. Nilai adalah yang **dibayarkan**; tidak ada kebijakan penyusutan di sistem ini, dan mengarangnya akan menaruh angka yang tampak berwibawa di depan Finance.

- **Menulis ke:** —
- **Membaca:** `accessories`, `assets`, `categories`, `departments`, `locations`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** `src/api/reports.ts:273`
- **Pembungkus TS:** `fetchValueAnalytics()` di `src/api/reports.ts`
- **Dipakai di layar:** `app/(tabs)/reports.tsx`

---

## M13. Notifikasi dan job terjadwal

11 fungsi.

### `notifications_list`

```sql
notifications_list(p_limit int default 50)
  returns table ( id uuid, kind notification_kind, title text, body text, asset_id uuid, asset_code text, bast_id uuid, bast_number text, read_at timestamptz, created_at timestamptz )
  language sql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260801090000_phase6.sql:288`
- **Security:** SECURITY INVOKER
- **Kembalian:** `table ( id uuid, kind notification_kind, title text, body text, asset_id uuid, asset_code text, bast_id uuid, bast_number text, read_at timestamptz, created_at timestamptz )`

**Tujuan.** Kotak masuk pemberitahuan pemanggil, dengan kode aset dan nomor BAST yang sudah di-join.

- **Menulis ke:** —
- **Membaca:** `assets`, `bast`, `notifications`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** `my_account_id()`
- **Dipanggil dari:** `src/api/notifications.ts:37`
- **Pembungkus TS:** `fetchNotifications()` di `src/api/notifications.ts`
- **Dipakai di layar:** `app/(tabs)/notifications.tsx`

### `notification_unread_count`

```sql
notification_unread_count()
  returns int
  language sql stable security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260801090000_phase6.sql:309`
- **Security:** SECURITY INVOKER
- **Kembalian:** `int`

**Tujuan.** Menghitung pemberitahuan yang belum dibaca milik pemanggil, untuk lencana angka di navigasi.

- **Menulis ke:** —
- **Membaca:** `notifications`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** `my_account_id()`
- **Dipanggil dari:** `src/api/notifications.ts:44`
- **Pembungkus TS:** `fetchUnreadCount()` di `src/api/notifications.ts`
- **Dipakai di layar:** `app/(tabs)/_layout.tsx`

### `mark_notification_read`

```sql
mark_notification_read(p_id uuid)
  returns jsonb
  language plpgsql security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260801090000_phase6.sql:315`
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Menandai satu pemberitahuan sudah dibaca, memakai `coalesce` supaya menandai ulang tidak menggeser waktu bacanya.

- **Menulis ke:** `notifications` (UPDATE)
- **Membaca:** —
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Notification not found` | `P0001` |

- **Memanggil fungsi lain:** `my_account_id()`
- **Dipanggil dari:** `src/api/notifications.ts:50`
- **Pembungkus TS:** `markNotificationRead()` di `src/api/notifications.ts`
- **Dipakai di layar:** `app/(tabs)/notifications.tsx`

### `mark_all_notifications_read`

```sql
mark_all_notifications_read()
  returns jsonb
  language plpgsql security invoker set search_path = public
```

- **Definisi:** `supabase/migrations/20260801090000_phase6.sql:327`
- **Security:** SECURITY INVOKER
- **Kembalian:** `jsonb`

**Tujuan.** Menandai seluruh pemberitahuan pemanggil sudah dibaca dan mengembalikan berapa yang terpengaruh.

- **Menulis ke:** `notifications` (UPDATE)
- **Membaca:** —
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** `my_account_id()`
- **Dipanggil dari:** `src/api/notifications.ts:55`
- **Pembungkus TS:** `markAllNotificationsRead()` di `src/api/notifications.ts`
- **Dipakai di layar:** `app/(tabs)/notifications.tsx`

### `notify_recipients`

```sql
notify_recipients(p_location uuid)
  returns setof uuid
  language sql stable security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260801090000_phase6.sql:343`
- **Security:** SECURITY DEFINER
- **Kembalian:** `setof uuid`

**Tujuan.** Menentukan siapa yang menerima pemberitahuan tentang aset di suatu lokasi. SECURITY DEFINER karena job berjalan tanpa pengguna sama sekali: cron tidak punya JWT, sehingga `my_role()` dan RLS sama-sama kosong.

- **Menulis ke:** —
- **Membaca:** `accounts`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat fungsi SQL lain. Contoh rujukan: `20260801090000_phase6.sql:384`, `20260801090000_phase6.sql:417`

### `notify_maintenance_due`

```sql
notify_maintenance_due(p_days int default 7)
  returns int
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260801090000_phase6.sql:402`
- **Security:** SECURITY DEFINER
- **Kembalian:** `int`

**Tujuan.** Job yang membuat pemberitahuan untuk perawatan yang jatuh tempo dalam sekian hari, memakai `dedupe_key` agar tidak mengirim hal yang sama dua kali.

- **Menulis ke:** `notifications` (INSERT)
- **Membaca:** `assets`, `maintenance_records`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** `notify_recipients()`
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat fungsi SQL lain. Contoh rujukan: `20260801090000_phase6.sql:477`, `20260801130000_run_jobs_now.sql:31`

### `notify_warranty_expiring`

```sql
notify_warranty_expiring(p_days int default 30)
  returns int
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260801090000_phase6.sql:366`
- **Security:** SECURITY DEFINER
- **Kembalian:** `int`

**Tujuan.** Job yang membuat pemberitahuan untuk garansi yang akan berakhir.

- **Menulis ke:** `notifications` (INSERT)
- **Membaca:** `asset_statuses`, `assets`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** `notify_recipients()`
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat fungsi SQL lain. Contoh rujukan: `20260801090000_phase6.sql:476`, `20260801130000_run_jobs_now.sql:30`

### `notify_weekly_backup`

```sql
notify_weekly_backup()
  returns int
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260801090000_phase6.sql:444`
- **Security:** SECURITY DEFINER
- **Kembalian:** `int`

**Tujuan.** Job pengingat backup mingguan.

- **Menulis ke:** `notifications` (INSERT)
- **Membaca:** `accounts`
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat job pg_cron, fungsi SQL lain. Contoh rujukan: `20260801090000_phase6.sql:545`, `20260801130000_run_jobs_now.sql:32`

### `run_daily_notifications`

```sql
run_daily_notifications()
  returns jsonb
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260801090000_phase6.sql:472`
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Membungkus ketiga job pemberitahuan menjadi satu pemanggilan untuk dijadwalkan.

- **Menulis ke:** —
- **Membaca:** —
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** `notify_maintenance_due()`, `notify_warranty_expiring()`
- **Dipanggil dari:** bukan dari `src/` — dipakai lewat job pg_cron. Contoh rujukan: `20260801090000_phase6.sql:536`

### `run_notification_jobs_now`

```sql
run_notification_jobs_now()
  returns jsonb
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260801130000_run_jobs_now.sql:21`
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Menjalankan job pemberitahuan secara manual dari layar Settings, untuk pengujian tanpa menunggu jadwal.

- **Menulis ke:** —
- **Membaca:** —
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Only a Super Admin can run the notification jobs` | `P0001` |

- **Memanggil fungsi lain:** `my_role()`, `notify_maintenance_due()`, `notify_warranty_expiring()`, `notify_weekly_backup()`
- **Dipanggil dari:** `src/api/notifications.ts:105`
- **Pembungkus TS:** `runNotificationJobsNow()` di `src/api/notifications.ts`
- **Dipakai di layar:** `app/(tabs)/settings.tsx`

### `scheduled_jobs`

```sql
scheduled_jobs()
  returns table (jobname text, schedule text, active boolean)
  language plpgsql stable security definer set search_path = public,
```

- **Definisi:** `supabase/migrations/20260801100000_scheduled_jobs.sql:18`
- **Security:** SECURITY DEFINER
- **Kembalian:** `table (jobname text, schedule text, active boolean)`

**Tujuan.** Mendaftar job terjadwal beserta waktu jalannya, supaya layar Settings dapat menampilkan apa yang berjalan dan kapan.

- **Menulis ke:** —
- **Membaca:** —
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Only a Super Admin can see the schedule` | `P0001` |

- **Memanggil fungsi lain:** `my_role()`
- **Dipanggil dari:** `src/api/notifications.ts:90`
- **Pembungkus TS:** `fetchScheduledJobs()` di `src/api/notifications.ts`
- **Dipakai di layar:** `app/(tabs)/settings.tsx`

---

## M14. Audit dan trigger generik

5 fungsi.

### `audit_row`

```sql
audit_row()
  returns trigger
  language plpgsql security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260731190000_fix_audit_search_path.sql:36` · Didefinisikan 2×
- **Security:** SECURITY DEFINER
- **Kembalian:** `trigger`

**Tujuan.** Trigger generik yang menulis satu baris ke `audit_log`, dipasang pada dua belas tabel supaya log tidak dapat dilewati aplikasi. Dua argumen trigger memilih aksi enum: yang pertama untuk INSERT, yang kedua untuk UPDATE dan DELETE. Sempat tidak punya `set search_path` meski SECURITY DEFINER, sehingga ketika pemanggilnya adalah GoTrue — yang search_path-nya tidak memuat `public` — cast `::audit_action` tidak menemukan tipenya dan pencabutan login gagal dengan `Database error deleting user` tanpa petunjuk lain. Lubang yang sama akan menelan setiap tulisan dari background job, extension, atau webhook di kemudian hari.

- **Menulis ke:** `audit_log` (INSERT)
- **Membaca:** —
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipasang sebagai trigger:** `assets_audit` pada `assets`; `assignments_audit` pada `assignments`; `movements_audit` pada `movements`; `bast_audit` pada `bast`; `maintenance_audit` pada `maintenance_records`; `accounts_audit` pada `accounts`; `asset_tags_audit` pada `asset_tags`; `bast_signatories_audit` pada `bast_signatories`; `bast_signatures_audit` pada `bast_signatures`; `asset_status_changes_audit` pada `asset_status_changes`; `accessories_audit` pada `accessories`; `accessory_checkouts_audit` pada `accessory_checkouts`
- **Dipanggil dari:** bukan RPC — dijalankan sebagai trigger

### `audit_list`

```sql
audit_list(
    p_action text default null,
    p_table text default null,
    p_search text default null,
    p_limit int default 100,
    p_offset int default 0
)
  returns table ( id bigint, action audit_action, table_name text, record_id uuid, target_label text, actor_label text, actor_name text, device text, created_at timestamptz, summary text, target_kind text, target_ref text, target_extra text )
  language plpgsql stable security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260831090000_audit_targets.sql:28` · Didefinisikan 2×
- **Security:** SECURITY DEFINER
- **Kembalian:** `table ( id bigint, action audit_action, table_name text, record_id uuid, target_label text, actor_label text, actor_name text, device text, created_at timestamptz, summary text, target_kind text, target_ref text, target_extra text )`

**Tujuan.** Membaca jejak audit dengan penyaringan aksi, tabel, dan kata kunci. Hanya Corporate IT ke atas. Menyelesaikan target tiap entri di dalam SQL, sebab separuhnya adalah join yang tidak dapat dilakukan klien: entri terhadap `assignments` menyebut sebuah penugasan, padahal yang ingin dibuka orang adalah asetnya. Mengembalikan `target_kind`, `target_ref`, dan `target_extra` supaya baris dapat ditekan; `target_kind` null berarti tidak ada yang bisa dibuka dan baris itu tetap datar alih-alih berpura-pura menjadi tautan.

- **Menulis ke:** —
- **Membaca:** `accessories`, `accounts`, `asset_photos`, `asset_status_changes`, `asset_tags`, `assets`, `assignments`, `audit_log`, `bast`, `bast_items`, `bast_signatures`, `bast_versions`, `documents`, `maintenance_records`, `movements`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Only Corporate IT and above can read the audit log` | `P0001` |

- **Memanggil fungsi lain:** `my_role()`
- **Dipanggil dari:** `src/api/audit.ts:128`
- **Pembungkus TS:** `fetchAuditLog()` di `src/api/audit.ts`
- **Dipakai di layar:** `app/(tabs)/audit.tsx`

### `audit_stats`

```sql
audit_stats()
  returns jsonb
  language plpgsql stable security definer set search_path = public
```

- **Definisi:** `supabase/migrations/20260803090000_audit_and_delete.sql:99`
- **Security:** SECURITY DEFINER
- **Kembalian:** `jsonb`

**Tujuan.** Menghitung ringkasan jejak audit untuk kartu di layar Audit. Hanya Corporate IT ke atas.

- **Menulis ke:** —
- **Membaca:** `audit_log`
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `Only Corporate IT and above can read the audit log` | `P0001` |

- **Memanggil fungsi lain:** `my_role()`
- **Dipanggil dari:** `src/api/audit.ts:140`
- **Pembungkus TS:** `fetchAuditStats()` di `src/api/audit.ts`
- **Dipakai di layar:** `app/(tabs)/audit.tsx`

### `forbid_mutation`

```sql
forbid_mutation()
  returns trigger
  language plpgsql security invoker
```

- **Definisi:** `supabase/migrations/20260729090000_init_schema.sql:278`
- **Security:** SECURITY INVOKER (bawaan — tidak ditulis di DDL)
- **Kembalian:** `trigger`

**Tujuan.** Trigger yang selalu melempar `This table is append-only`. Dipasang sebagai BEFORE UPDATE dan BEFORE DELETE pada tabel yang isinya adalah bukti. Ini lapis ketiga dari tiga: tidak ada grant, tidak ada policy, dan trigger ini.

- **Menulis ke:** —
- **Membaca:** —
- **Validasi dan pesan galat:**

  | Pesan galat (dikutip persis) | errcode |
  | --- | --- |
  | `This table is append-only` | — |

- **Memanggil fungsi lain:** —
- **Dipasang sebagai trigger:** `movements_no_update` pada `movements`; `movements_no_delete` pada `movements`; `bast_versions_no_update` pada `bast_versions`; `bast_versions_no_delete` pada `bast_versions`; `audit_no_update` pada `audit_log`; `audit_no_delete` pada `audit_log`; `bast_signatures_no_update` pada `bast_signatures`; `bast_signatures_no_delete` pada `bast_signatures`; `asset_status_changes_no_update` pada `asset_status_changes`; `asset_status_changes_no_delete` pada `asset_status_changes`
- **Dipanggil dari:** bukan RPC — dijalankan sebagai trigger

### `set_updated_at`

```sql
set_updated_at()
  returns trigger
  language plpgsql security invoker
```

- **Definisi:** `supabase/migrations/20260729090000_init_schema.sql:38`
- **Security:** SECURITY INVOKER (bawaan — tidak ditulis di DDL)
- **Kembalian:** `trigger`

**Tujuan.** Trigger BEFORE UPDATE yang menyetel `new.updated_at := now()`. Dipasang pada sebelas tabel; tiga tabel lain yang punya kolom `updated_at` tidak mendapatkannya — lihat catatan di kamus data.

- **Menulis ke:** —
- **Membaca:** —
- **Validasi dan pesan galat:** tidak melempar `raise exception`
- **Memanggil fungsi lain:** —
- **Dipasang sebagai trigger:** `locations_set_updated_at` pada `locations`; `departments_set_updated_at` pada `departments`; `categories_set_updated_at` pada `categories`; `brands_set_updated_at` pada `brands`; `models_set_updated_at` pada `models`; `vendors_set_updated_at` pada `vendors`; `accounts_set_updated_at` pada `accounts`; `assets_set_updated_at` pada `assets`; `bast_set_updated_at` pada `bast`; `maintenance_set_updated_at` pada `maintenance_records`; `bast_signatories_set_updated_at` pada `bast_signatories`
- **Dipanggil dari:** bukan RPC — dijalankan sebagai trigger

---
## Y. Tabel ringkas seluruh fungsi

Lima kolom sesuai permintaan, 135 baris. Keterangan kolom:

- **Menulis ke** — `—` berarti hanya membaca; ⚠ berarti menulis lewat
  `execute format(%I)` sehingga tidak terbaca analisis statis (§0.3).
- **Dipakai di layar** — berkas di `app/` yang mengimpor pembungkusnya. Nilai
  selain nama layar dijelaskan di §Z.

| Nama | Modul | Security | Menulis ke | Dipakai di layar |
| --- | --- | --- | --- | --- |
| `bootstrap_session` | M1 | DEFINER | — | _lapisan API saja_ |
| `link_auth_user_to_account` | M1 | DEFINER | `accounts` | _trigger (1×)_ |
| `my_account_id` | M1 | DEFINER | — | _policy RLS_ |
| `my_role` | M1 | DEFINER | — | _policy RLS_ |
| `my_location_ids` | M1 | DEFINER | — | _policy RLS_ |
| `can_see_asset` | M1 | DEFINER | — | _policy RLS_ |
| `can_write_assets` | M1 | DEFINER | — | _policy RLS_ |
| `can_see_bast_row` | M1 | DEFINER | — | _policy RLS_ |
| `can_see_bast_file` | M1 | DEFINER | — | _policy RLS_ |
| `set_account_scope` | M1 | DEFINER | `account_scope_preferences` | _lapisan API saja_ |
| `other_super_admins` | M1 | DEFINER | — | _helper internal_ |
| `assert_can_manage_accounts` | M1 | DEFINER | — | _helper internal_ |
| `account_for_credentials` | M1 | DEFINER | — | _Edge Function_ |
| `set_account_login` | M1 | DEFINER | `accounts` | _Edge Function_ |
| `storage_asset_id` | M1 | INVOKER | — | _policy RLS_ |
| `storage_bast_asset_id` | M1 | INVOKER | — | _policy RLS_ |
| `storage_bast_location_id` | M1 | INVOKER | — | _helper internal_ |
| `accounts_list` | M2 | INVOKER | — | `account-edit`, `accounts` |
| `create_account` | M2 | DEFINER | `accounts` | `account-edit` |
| `update_account` | M2 | DEFINER | `accounts` | `account-edit` |
| `delete_account` | M2 | DEFINER | `accounts`, `audit_log` | `account-edit` |
| `account_holdings` | M2 | INVOKER | — | `account-edit` |
| `assignable_employees` | M2 | INVOKER | — | `accessory/[id]`, `assign` |
| `master_assert_entity` | M3 | INVOKER | — | _helper internal_ |
| `master_table` | M3 | INVOKER | — | _helper internal_ |
| `master_label` | M3 | INVOKER | — | _helper internal_ |
| `master_list` | M3 | DEFINER | — | `accessories`, `accessory-edit`, `account-edit`, `asset/[code]`, `assets`, `master` |
| `master_create` | M3 | INVOKER | `asset_conditions`, `asset_statuses`, `categories`, `companies`, `locations`, `models`, `units` | `master` |
| `master_rename` | M3 | INVOKER | ⚠ dinamis | `master` |
| `master_delete` | M3 | INVOKER | ⚠ dinamis | `master` |
| `master_set_active` | M3 | INVOKER | ⚠ dinamis | `master` |
| `master_usage` | M3 | DEFINER | — | _helper internal_ |
| `master_usage_list` | M3 | INVOKER | — | `master-usage` |
| `asset_form_options` | M3 | DEFINER | — | `account-edit`, `add-asset`, `asset/status`, `assign`, `maintenance-log`, `reports`, `transfer` |
| `create_asset` | M4 | DEFINER | `assets` | `add-asset` |
| `update_asset` | M4 | INVOKER | `assets` | `add-asset` |
| `delete_asset` | M4 | DEFINER | `assets`, `audit_log` | `asset/[code]` |
| `asset_detail` | M4 | INVOKER | — | `add-asset`, `asset/[code]`, `asset/status`, `maintenance-log` |
| `search_assets` | M4 | INVOKER | — | `assets`, `transfer` |
| `count_assets_in_scope` | M4 | INVOKER | — | `assets` |
| `asset_code_prefix` | M4 | INVOKER | — | `add-asset` |
| `preview_asset_code` | M4 | INVOKER | — | `add-asset` |
| `next_asset_code` | M4 | DEFINER | — | _helper internal_ |
| `next_in_asset_prefix` | M4 | INVOKER | — | _helper internal_ |
| `assignable_assets` | M4 | INVOKER | — | `assign` |
| `add_asset_photo` | M4 | DEFINER | `asset_photos` | `asset/[code]` |
| `remove_asset_photo` | M4 | DEFINER | `asset_photos` | `asset/[code]` |
| `set_asset_photo` | M4 | INVOKER | `assets` | _lapisan API saja_ |
| `asset_photos_list` | M4 | INVOKER | — | `asset/[code]` |
| `sync_asset_cover` | M4 | DEFINER | `assets` | _trigger (1×)_ |
| `change_asset_status` | M4 | DEFINER | `asset_status_changes`, `assets` | `asset/status` |
| `asset_status_history` | M4 | INVOKER | — | **TIDAK DIPAKAI** |
| `next_tag_code` | M5 | DEFINER | `tag_code_counters` | _helper internal_ |
| `create_tag_batch` | M5 | INVOKER | `asset_tags` | `labels` |
| `list_tags` | M5 | INVOKER | — | `labels` |
| `tag_stock` | M5 | INVOKER | — | `labels` |
| `tag_detail` | M5 | INVOKER | — | `labels` |
| `tag_asset` | M5 | INVOKER | `asset_tags` | `add-asset` |
| `attach_tag` | M5 | DEFINER | `asset_tags` | `asset/[code]` |
| `void_tag` | M5 | INVOKER | `asset_tags` | _lapisan API saja_ |
| `scan_tag` | M5 | INVOKER | — | `scan` |
| `asset_tag_code` | M5 | INVOKER | — | `asset/[code]` |
| `tag_prefixes` | M5 | INVOKER | — | `labels` |
| `assert_tag_location` | M5 | INVOKER | — | _helper internal_ |
| `assign_asset` | M6 | DEFINER | `assets`, `assignments`, `bast`, `movements` | `assign` |
| `return_asset` | M6 | DEFINER | `assets`, `assignments`, `bast` | `assign` |
| `set_secondary_holder` | M6 | DEFINER | `assets`, `assignments`, `bast` | `assign` |
| `record_movement` | M6 | DEFINER | `assets`, `movements` | `transfer` |
| `movement_history` | M6 | INVOKER | — | `transfer` |
| `install_asset_to_unit` | M6 | DEFINER | `asset_status_changes`, `assets` | `asset/[code]` |
| `remove_asset_from_unit` | M6 | DEFINER | `asset_status_changes`, `assets` | `asset/[code]` |
| `unit_assets` | M6 | INVOKER | — | _lapisan API saja_ |
| `next_bast_number` | M7 | DEFINER | `bast_number_counters` | _DEFAULT kolom_ |
| `bast_list` | M7 | INVOKER | — | `bast/index` |
| `bast_detail` | M7 | INVOKER | — | `bast/[id]`, `bast/sign` |
| `bast_stats` | M7 | INVOKER | — | `bast/index` |
| `set_bast_items` | M7 | DEFINER | `bast_items` | `bast/[id]` |
| `set_bast_kind` | M7 | DEFINER | `bast` | `bast/[id]` |
| `attach_generated_bast` | M7 | INVOKER | `bast`, `bast_versions` | _Edge Function_ |
| `attach_signed_bast` | M7 | INVOKER | `bast`, `bast_versions`, `documents` | `bast/[id]` |
| `delete_bast` | M7 | DEFINER | `accessory_checkouts`, `audit_log`, `bast`, `bast_items` | `bast/[id]` |
| `void_bast` | M7 | DEFINER | `audit_log`, `bast` | `bast/[id]` |
| `sign_bast` | M7 | DEFINER | `bast_signatures` | `bast/sign` |
| `validate_signature_strokes` | M7 | INVOKER | — | _helper internal_ |
| `bast_signatories_list` | M7 | INVOKER | — | `bast/sign` |
| `add_bast_signatory` | M7 | INVOKER | `bast_signatories` | `bast/sign` |
| `terbilang` | M7 | INVOKER | — | _helper internal_ |
| `terbilang_kapital` | M7 | INVOKER | — | _helper internal_ |
| `indonesian_date_words` | M7 | INVOKER | — | _helper internal_ |
| `indonesian_long_date` | M7 | INVOKER | — | _helper internal_ |
| `indonesian_short_date` | M7 | INVOKER | — | _helper internal_ |
| `accessories_list` | M8 | INVOKER | — | `accessories`, `assign` |
| `accessory_detail` | M8 | INVOKER | — | `accessory-edit`, `accessory/[id]` |
| `accessory_available` | M8 | DEFINER | — | _helper internal_ |
| `create_accessory` | M8 | DEFINER | `accessories` | `accessory-edit` |
| `update_accessory` | M8 | DEFINER | `accessories` | `accessory-edit` |
| `assign_accessory` | M8 | DEFINER | `accessory_checkouts` | `accessory/[id]`, `assign` |
| `return_accessory` | M8 | DEFINER | `accessory_checkouts` | `accessory/[id]` |
| `create_accessory_bast` | M8 | DEFINER | `accessory_checkouts`, `bast`, `bast_items` | `accessory/[id]` |
| `attach_accessories_to_bast` | M8 | DEFINER | `accessory_checkouts`, `bast_items` | `assign` |
| `log_maintenance` | M9 | INVOKER | `maintenance_records` | `maintenance-log` |
| `edit_maintenance` | M9 | INVOKER | `maintenance_records` | `maintenance-log` |
| `maintenance_log` | M9 | INVOKER | — | `maintenance-log`, `maintenance` |
| `maintenance_list` | M9 | INVOKER | — | **TIDAK DIPAKAI** |
| `maintenance_stats` | M9 | INVOKER | — | `maintenance` |
| `open_maintenance` | M9 | INVOKER | `maintenance_records` | **TIDAK DIPAKAI** |
| `update_maintenance` | M9 | INVOKER | `maintenance_records` | **TIDAK DIPAKAI** |
| `sync_asset_maintenance_status` | M9 | DEFINER | `asset_status_changes`, `assets` | _helper internal_ |
| `add_document` | M10 | INVOKER | `documents` | `asset/[code]` |
| `delete_document` | M10 | INVOKER | `documents` | _lapisan API saja_ |
| `import_assets` | M11 | INVOKER | `import_batches` | `import` |
| `import_accounts` | M11 | DEFINER | `accounts`, `import_batches` | `import-employees` |
| `import_lookup` | M11 | DEFINER | — | _helper internal_ |
| `import_date` | M11 | INVOKER | — | _helper internal_ |
| `import_history` | M11 | INVOKER | — | `import-employees`, `import` |
| `dashboard_summary` | M12 | INVOKER | — | `index` |
| `report_summary` | M12 | INVOKER | — | `reports` |
| `asset_report` | M12 | INVOKER | — | `reports` |
| `value_analytics` | M12 | INVOKER | — | `reports` |
| `notifications_list` | M13 | INVOKER | — | `notifications` |
| `notification_unread_count` | M13 | INVOKER | — | `_layout` |
| `mark_notification_read` | M13 | INVOKER | `notifications` | `notifications` |
| `mark_all_notifications_read` | M13 | INVOKER | `notifications` | `notifications` |
| `notify_recipients` | M13 | DEFINER | — | _helper internal_ |
| `notify_maintenance_due` | M13 | DEFINER | `notifications` | _helper internal_ |
| `notify_warranty_expiring` | M13 | DEFINER | `notifications` | _helper internal_ |
| `notify_weekly_backup` | M13 | DEFINER | `notifications` | _job cron_ |
| `run_daily_notifications` | M13 | DEFINER | — | _job cron_ |
| `run_notification_jobs_now` | M13 | DEFINER | — | `settings` |
| `scheduled_jobs` | M13 | DEFINER | — | `settings` |
| `audit_row` | M14 | DEFINER | `audit_log` | _trigger (12×)_ |
| `audit_list` | M14 | DEFINER | — | `audit` |
| `audit_stats` | M14 | DEFINER | — | `audit` |
| `forbid_mutation` | M14 | INVOKER | — | _trigger (10×)_ |
| `set_updated_at` | M14 | INVOKER | — | _trigger (11×)_ |

---

## Z. Tiga daftar penutup

### Z.0 Cara "dipakai" ditentukan

Menghitung hanya `.rpc()` di `src/` akan menyesatkan: sebuah fungsi database
dapat dipanggil dari enam tempat berbeda, dan lima di antaranya bukan `src/`.
Daftar di bawah karena itu dibangun dari pemindaian **seluruh korpus**:

| Sumber pemanggilan | Contoh |
| --- | --- |
| `.rpc()` di `src/` | `src/api/assets.ts` |
| `.rpc()` di Edge Function | `supabase/functions/generate-bast-pdf/index.ts:528` |
| Badan fungsi SQL lain | `master_delete()` memanggil `master_usage()` |
| Policy RLS dan storage | `using (... can_see_bast_file(name))` |
| DEFAULT kolom | `bast_number ... default next_bast_number()` |
| Job `pg_cron` | `$job$select public.run_daily_notifications()$job$` |
| Trigger | `create trigger ... execute function audit_row(...)` |

Yang **tidak** dihitung sebagai pemakaian: baris `create function`,
`drop function`, `grant`, `revoke`, dan komentar. Tanpa pengecualian itu setiap
fungsi akan tampak terpakai hanya karena hak aksesnya diatur.

### Z.1 Fungsi yang terdefinisi tetapi tidak pernah dipanggil klien

**48 dari 135** fungsi tidak pernah muncul sebagai `.rpc()`
di `src/`. Tetapi hampir semuanya dipakai — hanya lewat jalur lain. Rinciannya:

| Jalur pemakaian | Jumlah |
| --- | ---: |
| Dipanggil `src/` sebagai RPC | 87 |
| Dipasang sebagai trigger | 5 |
| Dipanggil Edge Function | 5 |
| Dipakai di policy RLS / storage | 9 |
| Dipakai sebagai DEFAULT kolom | 1 |
| Dipanggil job `pg_cron` | 2 |
| **Tidak dirujuk sama sekali** | **4** |

Kategori tidak saling eksklusif — `bast_detail()` misalnya dipanggil dari
`src/` **dan** dari Edge Function perender PDF.

#### Z.1.a Lima fungsi trigger

| Fungsi | Dipasang pada | Jumlah trigger |
| --- | --- | ---: |
| `audit_row` | `accessories`, `accessory_checkouts`, `accounts`, `asset_status_changes`, `asset_tags`, `assets`, `assignments`, `bast`, `bast_signatories`, `bast_signatures`, `maintenance_records`, `movements` | 12 |
| `forbid_mutation` | `asset_status_changes`, `audit_log`, `bast_signatures`, `bast_versions`, `movements` | 10 |
| `link_auth_user_to_account` | `auth.users` | 1 |
| `set_updated_at` | `accounts`, `assets`, `bast`, `bast_signatories`, `brands`, `categories`, `departments`, `locations`, `maintenance_records`, `models`, `vendors` | 11 |
| `sync_asset_cover` | `asset_photos` | 1 |

Menghapus salah satunya akan merusak jejak audit, kolom `updated_at`,
penegakan append-only, sampul foto, atau penautan akun Auth.

#### Z.1.b Lima fungsi yang dipanggil Edge Function, bukan aplikasi

Ini kelompok yang paling mudah salah dinilai mati, karena pemanggilnya berada
di luar `src/` sepenuhnya.

| Fungsi | Dipanggil dari |
| --- | --- |
| `account_for_credentials` | `supabase/functions/manage-account/index.ts:166` |
| `attach_generated_bast` | `supabase/functions/generate-bast-pdf/index.ts:565` |
| `attach_signed_bast` | `supabase/functions/generate-bast-pdf/index.ts:545` |
| `bast_detail` | `supabase/functions/generate-bast-pdf/index.ts:528` |
| `set_account_login` | `supabase/functions/manage-account/index.ts:178`, `supabase/functions/manage-account/index.ts:211`, `supabase/functions/manage-account/index.ts:217`, `supabase/functions/manage-account/index.ts:222` |

#### Z.1.c Sembilan fungsi yang hidup di dalam policy

Helper otorisasi tidak pernah dipanggil aplikasi — ia dipanggil PostgreSQL
sendiri saat mengevaluasi policy pada setiap baris.

| Fungsi | Contoh rujukan |
| --- | --- |
| `can_see_asset` | `20260729090100_rls.sql:90` |
| `can_see_bast_file` | `20260824090000_bast_storage_no_asset.sql:55` |
| `can_see_bast_row` | `20260821090300_accessory_bast.sql:52` |
| `can_write_assets` | — |
| `my_account_id` | `20260729090100_rls.sql:145` |
| `my_location_ids` | `20260729090100_rls.sql:75` |
| `my_role` | `20260729090100_rls.sql:85` |
| `storage_asset_id` | `20260801090000_phase6.sql:51` |
| `storage_bast_asset_id` | `20260729200000_bast.sql:154` |

#### Z.1.d Jalur lain

| Fungsi | Jalur | Rujukan |
| --- | --- | --- |
| `next_bast_number` | DEFAULT kolom | `20260729090000_init_schema.sql:305` |
| `notify_weekly_backup` | job `pg_cron` | `20260801090000_phase6.sql:545` |
| `run_daily_notifications` | job `pg_cron` | `20260801090000_phase6.sql:536` |

`next_bast_number()` sebagai DEFAULT kolom layak digarisbawahi: karena nomor
dibangkitkan oleh default `bast.bast_number`, bahkan INSERT yang lupa
menyertakan nomor tetap mendapat nomor yang sah. Itulah yang menjadikan klaim
"penomoran server-side sehingga nomor tidak mungkin bertabrakan" jaminan
struktural dan bukan janji aplikasi.

#### Z.1.e Empat fungsi yang benar-benar tidak dirujuk — kode mati

Setelah keenam jalur di atas diperiksa, **tepat empat** fungsi tidak dirujuk dari
mana pun. Satu-satunya kemunculannya di repositori adalah pernyataan `grant` dan
`revoke` atas dirinya sendiri.

| Fungsi | Definisi | Baris | Digantikan oleh |
| --- | --- | ---: | --- |
| `asset_status_history` | `20260731140000_status_changes.sql:152` | 23 | `asset_detail()`, yang sudah membawa riwayat status |
| `maintenance_list` | `20260801090000_phase6.sql:236` | 25 | `maintenance_log()` |
| `open_maintenance` | `20260801090000_phase6.sql:145` | 35 | `log_maintenance()` |
| `update_maintenance` | `20260801090000_phase6.sql:181` | 53 | `edit_maintenance()` |

Total **136 baris SQL mati** dari 5.443 baris
badan fungsi — sekitar 2,5%. Ketiganya di modul Perawatan adalah signature lama
dari migrasi `20260801090000_phase6.sql` yang digantikan oleh
`20260804090000_maintenance_and_tags.sql` dan
`20260804140000_bast_documents_and_maintenance_status.sql`, tetapi tidak pernah
di-`drop`. Keempatnya masih memegang `grant execute ... to authenticated`,
sehingga secara teknis **masih dapat dipanggil klien mana pun yang mengetahui
namanya** — mereka tidak terjangkau UI, bukan tidak terjangkau sama sekali.

Aturan kerja #1 melarang menyunting migrasi yang sudah diterapkan, jadi
membersihkannya berarti menambah satu migrasi baru berisi empat `drop function`.
Itu keputusan Anda, bukan saya.

### Z.2 Fungsi yang dipanggil klien tetapi definisinya tidak ditemukan

**Tidak ada. Nol.**

Ke-87 nama RPC yang muncul di `src/` seluruhnya punya definisi di
`supabase/migrations/`, begitu pula kelima yang dipanggil Edge Function.

```sh
comm -23 /tmp/dipanggil.txt /tmp/terdefinisi.txt    # -> keluaran kosong
```

Ini temuan positif dan layak dikutip: tidak ada pemanggilan RPC yang akan gagal
dengan `Could not find the function` saat dijalankan.

Satu kualifikasi yang wajib menyertainya: pemeriksaan ini mencocokkan **nama**,
bukan signature. Ketidakcocokan jumlah, nama, atau tipe parameter tidak akan
terdeteksi — dan justru itulah kelas galat yang pernah menimpa proyek ini, ketika
dua overload `search_assets()` sama-sama cocok dengan satu pemanggilan bernama
argumen dan seluruh pencarian rusak (`20260803160000_drop_old_search.sql`).
`[BELUM TERVERIFIKASI — kecocokan argumen tiap pemanggilan dengan signature
fungsinya; itu memerlukan pemeriksaan terhadap database yang berjalan.]`

### Z.3 Terjangkau lapisan API tetapi mati di antarmuka

Kategori ketiga yang tidak Anda minta tetapi muncul saat menelusuri layar, dan
penting justru karena **tidak terlihat oleh kedua daftar di atas**. RPC berikut
punya pembungkus di `src/api/`, sehingga terhitung "dipanggil dari `src/`" —
tetapi pembungkusnya tidak pernah diimpor satu berkas pun di luar `src/api/`.

| RPC | Pembungkus TS | Berkas | Status |
| --- | --- | --- | --- |
| `bootstrap_session` | `bootstrapSession()` | `src/api/session.ts` | dipakai `src/auth/SessionProvider.tsx:46` |
| `delete_document` | `deleteDocument()` | `src/api/documents.ts` | **tidak diimpor siapa pun** |
| `set_account_scope` | `setAccountScope()` | `src/api/session.ts` | dipakai `src/store/useScopeStore.ts:48,56` |
| `set_asset_photo` | `uploadAssetPhoto()` | `src/api/assets.ts` | **tidak diimpor siapa pun** |
| `unit_assets` | `fetchUnitAssets()` | `src/api/units.ts` | **tidak diimpor siapa pun** |
| `void_tag` | `voidTag()` | `src/api/tags.ts` | **tidak diimpor siapa pun** |

Dua yang pertama bukan masalah: keduanya dipakai provider dan store, bukan layar.
**4 sisanya adalah kode mati di antarmuka** — fungsi database lengkap,
pembungkus TypeScript lengkap, tetapi tidak ada jalan menuju ke sana dari aplikasi.

```sh
for w in deleteDocument uploadAssetPhoto fetchUnitAssets voidTag; do
  printf "%-18s " "$w"
  grep -rn "\b$w\b" app/ src/ --include=*.ts --include=*.tsx | grep -vc "^src/api/"
done            # keempatnya -> 0
```

Yang paling patut diperhatikan adalah **`void_tag`**. Membatalkan stiker yang
rusak atau salah tempel adalah satu dari tiga keadaan dalam siklus hidup label
yang ditegakkan skema lewat CHECK `void_needs_reason`, dan RPC-nya lengkap dengan
empat validasi — tetapi status `void` tidak dapat dicapai dari aplikasi. Begitu
pula `fetchUnitAssets`, padahal modul unit punya layarnya sendiri.
`[BELUM TERVERIFIKASI — apakah keempatnya sengaja disiapkan lebih dulu untuk
fitur yang belum dipasang, atau layarnya pernah ada lalu dihapus. Tidak ada
komentar di kode maupun pesan commit yang menjelaskannya.]`

---

## ZZ. Temuan lain dari katalog ini

### ZZ.1 Empat RPC menulis langsung ke `audit_log`

Aturan kerja proyek #3 berbunyi "jangan pernah menulis ke `audit_log`" — baris
hanya boleh masuk lewat trigger `audit_row()`. Empat fungsi melanggarnya:

| Fungsi | Definisi |
| --- | --- |
| `delete_account` | `20260824090300_delete_account_and_void_bast.sql:33` |
| `delete_asset` | `20260803110000_fix_delete_asset_array.sql:22` |
| `delete_bast` | `20260824090300_delete_account_and_void_bast.sql:156` |
| `void_bast` | `20260824090300_delete_account_and_void_bast.sql:112` |

Keempatnya melakukannya dengan sengaja dan menuliskan alasannya. Dikutip dari
`supabase/migrations/20260803110000_fix_delete_asset_array.sql:53-54`:

> "Recorded BEFORE the row goes: the audit trigger fires on the delete itself,
> but a trigger cannot know why, and why is the only part worth reading here."

Ini menutup pertanyaan terbuka [02-kamus-data.md](02-kamus-data.md) §8.9.
Penilaiannya milik Anda: aturan itu ada untuk mencegah *aplikasi* mengarang jejak
audit, sedangkan keempat fungsi ini SECURITY DEFINER milik server yang menambahkan
**alasan** — satu hal yang memang tidak dapat diketahui trigger. Tetapi sebagai
fakta, aturan #3 tidak lagi berlaku mutlak. Naskah sebaiknya menyebutnya sebagai
"ditegakkan tiga lapis pada tabel append-only, dengan empat pengecualian
tercatat di jalur penghapusan" alih-alih sebagai larangan tanpa kecuali.

### ZZ.2 Empat fungsi SECURITY DEFINER tanpa `set search_path`

**4 dari 61** fungsi SECURITY DEFINER tidak menetapkan `search_path`.

| Fungsi | Definisi |
| --- | --- |
| `can_see_asset` | `20260729090100_rls.sql:59` |
| `can_write_assets` | `20260729090100_rls.sql:67` |
| `my_account_id` | `20260729090100_rls.sql:53` |
| `my_role` | `20260729090100_rls.sql:48` |

Ini persis pola yang pernah menjatuhkan sistem sekali. `audit_row()` semula
SECURITY DEFINER tanpa `search_path`; ketika pemanggilnya GoTrue — yang
`search_path`-nya tidak memuat `public` — cast `::audit_action` tidak menemukan
tipenya, dan pencabutan login berakhir dengan `Database error deleting user`
tanpa petunjuk lain. Perbaikannya di
`supabase/migrations/20260731190000_fix_audit_search_path.sql` menyertakan
peringatan bahwa lubang yang sama akan menelan tulisan dari background job,
extension, atau webhook mana pun di kemudian hari.

Keempat fungsi di atas adalah helper RLS yang hari ini hanya dijangkau lewat
policy, sehingga pemanggilnya selalu PostgREST. Risikonya laten, bukan aktif —
tetapi ia laten dengan cara yang sama seperti `audit_row()` sebelum 31 Juli.
`[BELUM TERVERIFIKASI — apakah keempatnya dapat dijangkau dari sesi yang
search_path-nya tidak memuat public; membuktikannya memerlukan database yang
berjalan.]`

### ZZ.3 Sepuluh fungsi terbesar

| Fungsi | Baris | Modul | Definisi |
| --- | ---: | --- | --- |
| `import_accounts` | 314 | M11 | `20260824090200_import_location.sql:32` |
| `import_assets` | 287 | M11 | `20260821091200_import_asset_label.sql:28` |
| `asset_detail` | 219 | M4 | `20260821090700_asset_detail_second_holder.sql:12` |
| `audit_list` | 133 | M14 | `20260831090000_audit_targets.sql:28` |
| `dashboard_summary` | 122 | M12 | `20260803140000_dashboard.sql:18` |
| `bast_detail` | 120 | M7 | `20260821090600_second_holder_reads.sql:114` |
| `master_create` | 117 | M3 | `20260820090200_units_and_companies.sql:282` |
| `assign_asset` | 115 | M6 | `20260729180000_assign_return_movement.sql:37` |
| `create_asset` | 107 | M4 | `20260807090000_asset_code_sequence_typed.sql:43` |
| `value_analytics` | 106 | M12 | `20260821090800_value_analytics.sql:24` |

Sepuluh fungsi ini menyumbang 1640 dari 5.443 baris
badan fungsi. Dua importer sendiri hampir 600 baris: keduanya memvalidasi tiap
baris CSV sambil mengumpulkan peringatan, dan keduanya menjalankan pratinjau
serta komit lewat kode yang sama persis — sehingga daftar yang disetujui
seseorang dihasilkan oleh kode yang benar-benar akan mengerjakannya.

### ZZ.4 Sebaran security

| Security | Jumlah |
| --- | ---: |
| SECURITY DEFINER | 61 |
| SECURITY INVOKER (ditulis eksplisit) | 59 |
| SECURITY INVOKER (bawaan, tidak ditulis) | 15 |

SECURITY DEFINER dipakai pada empat keadaan yang konsisten: helper RLS itu
sendiri, generator penomoran yang tabelnya tidak diberi grant apa pun, job cron
yang berjalan tanpa JWT sehingga `my_role()` akan kosong, dan RPC tulis yang
menyentuh beberapa tabel dalam satu transaksi. Pada jenis terakhir, setiap
penjagaan yang seharusnya diterapkan RLS dinyatakan ulang secara eksplisit di
awal badan fungsi — pola yang terlihat konsisten pada `assign_asset()`,
`create_accessory()`, dan `install_asset_to_unit()`. `auth.uid()` tidak
terpengaruh SECURITY DEFINER, sehingga trigger audit tetap merekam pelaku yang
sebenarnya meski RLS dilewati.

### ZZ.5 Ringkasan hal yang belum terverifikasi di Fase 4

| # | Butir | Cara menutupnya |
| ---: | --- | --- |
| 1 | Jumlah entri `pg_proc` sesungguhnya (overload) | Query katalog pada database berjalan |
| 2 | Kecocokan argumen tiap pemanggilan dengan signature | Jalankan suite terhadap stack lokal |
| 3 | Apakah 4 DEFINER tanpa `search_path` dapat dijangkau dari sesi non-public | Uji dari sesi GoTrue |
| 4 | Apakah 4 pembungkus mati (§Z.3) disiapkan atau ditinggalkan | Tanyakan penulis kode |
| 5 | Tulisan lewat `execute format` pada 3 fungsi master data | Baca badan fungsinya, atau aktifkan `log_statement` |
