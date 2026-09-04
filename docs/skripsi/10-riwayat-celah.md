# 10 — Riwayat Pengembangan dan Celah

Hasil Fase 10: urutan migrasi, fase pengembangan dari git, penanda sementara,
kode tak terpakai, ketidakkonsistenan, dan perbedaan perilaku dari dokumentasi.

**Tanggal:** 2026-09-01  
**Revisi:** working tree di atas commit `cd0d9f3`

---

## 1. Seluruh migrasi berurutan

**61 migrasi.** Kolom penanda memakai tiga kategori terpisah, karena
menggabungkannya menjadi satu angka "perbaikan" akan menyesatkan:

| Penanda | Arti | Jumlah | Kriteria |
| :-: | --- | ---: | --- |
| 🐞 | Memperbaiki cacat pada migrasi sebelumnya | 8 | Nama berkas memuat `fix`, **atau** headernya memuat bagian `THE BUG` / `THE PROBLEM` |
| ↩ | Membalik keputusan requirement sebelumnya | 1 | Header memuat `REVERSES AN EARLIER CONSTRAINT` |
| ♻ | Mengerjakan ulang setelah menemukan kekurangan | 2 | Header menjelaskan kekurangan pendekatan lama tanpa menyebutnya cacat |

```sh
ls -1 supabase/migrations/ | grep -c '_fix\|fix_'                    # -> 5
grep -rliE "^-- (THE BUG|THE PROBLEM|REVERSES|WHAT WENT WRONG)" \
  supabase/migrations/*.sql | wc -l                                  # -> 8
# irisan keduanya 3, gabungan = 10; ditambah signed_bast_without_asset.sql yang
# headernya menyebut dirinya "second half of the same omission" = 11 bertanda
```

> **Catatan tentang tanggal.** Kolom Tanggal adalah tanggal **commit git**,
> bukan timestamp pada nama berkasnya. Keduanya berbeda: dua belas migrasi
> bertimestamp `20260729` seluruhnya di-commit 2026-07-30. Timestamp nama
> menentukan **urutan penerapan**, tanggal commit menentukan **kapan ditulis**.
> Untuk jadwal penelitian di BAB III, yang benar adalah tanggal commit.

| # | Berkas | Tanggal | Baris | | Apa yang diubahnya |
| ---: | --- | --- | ---: | :-: | --- |
| 1 | `20260729090000_init_schema.sql` | 2026-07-30 | 468 |  | init schema |
| 2 | `20260729090100_rls.sql` | 2026-07-30 | 189 |  | Row Level Security |
| 3 | `20260729090200_seed_master_data.sql` | 2026-07-30 | 62 |  | master data seed |
| 4 | `20260729100000_auth_session.sql` | 2026-07-30 | 129 |  | auth linkage & session bootstrap  (Phase 1) |
| 5 | `20260729110000_fix_my_location_ids.sql` | 2026-07-30 | 49 | 🐞 | fix my_location_ids()  (Phase 1) |
| 6 | `20260729120000_grants.sql` | 2026-07-30 | 84 |  | table privileges  (Phase 1) |
| 7 | `20260729130000_master_data_rpcs.sql` | 2026-07-30 | 415 |  | master data RPCs  (Phase 2) |
| 8 | `20260729140000_create_asset.sql` | 2026-07-30 | 140 |  | create_asset()  (bridges Phase 2 → Phase 3) |
| 9 | `20260729150000_fix_counters_and_rename.sql` | 2026-07-30 | 101 | 🐞 | two fixes found by tests/master-data.mjs |
| 10 | `20260729160000_asset_register.sql` | 2026-07-30 | 383 |  | asset register  (Phase 3) |
| 11 | `20260729170000_asset_photos_storage.sql` | 2026-07-30 | 86 |  | asset photo storage  (Phase 3) |
| 12 | `20260729180000_assign_return_movement.sql` | 2026-07-30 | 360 |  | assignment & movement  (Phase 4) |
| 13 | `20260729200000_bast.sql` | 2026-07-30 | 273 |  | BAST  (Phase 5) |
| 14 | `20260730080000_asset_tags.sql` | 2026-07-30 | 309 | ↩ | asset tags  (QR / barcode lifecycle) |
| 15 | `20260731090000_ebast_signatures.sql` | 2026-07-31 | 377 |  | E-BAST signatures |
| 16 | `20260731140000_status_changes.sql` | 2026-07-31 | 405 |  | Status changes and disposal |
| 17 | `20260731170000_account_management.sql` | 2026-07-31 | 326 |  | Account management |
| 18 | `20260731190000_fix_audit_search_path.sql` | 2026-07-31 | 55 | 🐞 | Fix audit_row()'s search_path |
| 19 | `20260801090000_phase6.sql` | 2026-07-31 | 551 |  | Documents, maintenance, notifications  (Phase 6) |
| 20 | `20260801100000_scheduled_jobs.sql` | 2026-07-31 | 41 |  | Reading the schedule |
| 21 | `20260801110000_lock_internal_functions.sql` | 2026-07-31 | 76 |  | Take EXECUTE away from PUBLIC on the internal functions |
| 22 | `20260801120000_regrant_counters.sql` | 2026-07-31 | 32 |  | Give the counters back to `authenticated` |
| 23 | `20260801130000_run_jobs_now.sql` | 2026-07-31 | 38 |  | Run the notification jobs on demand |
| 24 | `20260801150000_csv_import.sql` | 2026-08-01 | 395 |  | CSV import  (Phase 7) |
| 25 | `20260801170000_reports.sql` | 2026-08-01 | 130 |  | Reports and export  (Phase 7) |
| 26 | `20260803090000_audit_and_delete.sql` | 2026-08-03 | 286 |  | Audit log reader, search sorting, and asset deletion |
| 27 | `20260803110000_fix_delete_asset_array.sql` | 2026-08-03 | 93 | 🐞 | Fix the blocker list in delete_asset() |
| 28 | `20260803140000_dashboard.sql` | 2026-08-03 | 143 |  | dashboard_summary() |
| 29 | `20260803160000_drop_old_search.sql` | 2026-08-03 | 25 | 🐞 | Drop the three-argument search_assets() |
| 30 | `20260804090000_maintenance_and_tags.sql` | 2026-08-03 | 322 |  | Maintenance as a record, and labels for existing assets |
| 31 | `20260804110000_fix_edit_maintenance_cast.sql` | 2026-08-03 | 74 | 🐞 | Cast the derived state in edit_maintenance() |
| 32 | `20260804140000_bast_documents_and_maintenance_status.sql` | 2026-08-04 | 949 |  | The real BAST, the return BAST, and maintenance moving |
| 33 | `20260806090000_location_scoped_labels.sql` | 2026-08-07 | 404 |  | A label belongs to a location |
| 34 | `20260806110000_asset_code_format.sql` | 2026-08-07 | 249 |  | The asset code the company actually uses |
| 35 | `20260807090000_asset_code_sequence_typed.sql` | 2026-08-07 | 257 |  | The prefix is the system's, the number is the user's |
| 36 | `20260811090000_asset_photo_gallery.sql` | 2026-08-11 | 184 |  | An asset has photos, not a photo |
| 37 | `20260811110000_photo_limit_five.sql` | 2026-08-11 | 54 |  | Five photos, not ten |
| 38 | `20260820090000_assets_category_index.sql` | 2026-08-21 | 16 |  | Index assets(category_id) |
| 39 | `20260820090100_new_enum_values.sql` | 2026-08-21 | 34 |  | Enum values for accessories, accessory BAST, and the |
| 40 | `20260820090200_units_and_companies.sql` | 2026-08-21 | 399 |  | Units (kendaraan) and Companies |
| 41 | `20260820090300_import_accounts.sql` | 2026-08-21 | 97 |  | Groundwork for the employee import |
| 42 | `20260820090400_import_accounts_rpc.sql` | 2026-08-21 | 307 |  | import_accounts() |
| 43 | `20260821090000_install_to_unit.sql` | 2026-08-21 | 184 |  | Fitting an asset into a unit |
| 44 | `20260821090100_asset_detail_unit.sql` | 2026-08-21 | 229 |  | asset_detail() knows which unit an asset is fitted to |
| 45 | `20260821090200_accessories.sql` | 2026-08-21 | 433 |  | Accessories |
| 46 | `20260821090300_accessory_bast.sql` | 2026-08-21 | 349 |  | BAST Perlengkapan — a handover note with no asset on it |
| 47 | `20260821090400_accessories_on_bast.sql` | 2026-08-21 | 154 |  | Accessories on an existing BAST |
| 48 | `20260821090500_second_holder.sql` | 2026-08-21 | 182 |  | A second holder, and a signature block for them |
| 49 | `20260821090600_second_holder_reads.sql` | 2026-08-21 | 298 |  | Reading the second holder back |
| 50 | `20260821090700_asset_detail_second_holder.sql` | 2026-08-21 | 231 |  | asset_detail() names the second holder |
| 51 | `20260821090800_value_analytics.sql` | 2026-08-21 | 181 |  | What it is all worth, and who is holding what |
| 52 | `20260821090900_account_company.sql` | 2026-08-21 | 212 |  | A company somebody can actually set |
| 53 | `20260821091000_import_department.sql` | 2026-08-21 | 291 |  | The employee import learns about departments |
| 54 | `20260821091100_import_match_by_name.sql` | 2026-08-21 | 316 | ♻ | A department-only file finds the people already there |
| 55 | `20260821091200_import_asset_label.sql` | 2026-08-21 | 318 | ♻ | The asset import can attach the sticker too |
| 56 | `20260821091300_master_usage_list.sql` | 2026-08-21 | 111 |  | Master data says WHICH, not just how many |
| 57 | `20260824090000_bast_storage_no_asset.sql` | 2026-08-24 | 71 | 🐞 | The BAST bucket lets an asset-less document be written |
| 58 | `20260824090100_signed_bast_without_asset.sql` | 2026-08-24 | 70 | 🐞 | Signing a BAST Perlengkapan no longer fails on documents |
| 59 | `20260824090200_import_location.sql` | 2026-08-24 | 349 |  | The employee import can set a location |
| 60 | `20260824090300_delete_account_and_void_bast.sql` | 2026-08-24 | 260 |  | Deleting a person, and voiding a document |
| 61 | `20260831090000_audit_targets.sql` | **belum di-commit** | 164 |  | An audit entry says where it happened |

### 1.1 Sebelas migrasi bertanda, dan apa yang sebenarnya terjadi

Angka 11 dari 61 (18%) ini **bukan** ukuran kualitas buruk. Aturan kerja #1
melarang menyunting migrasi yang sudah diterapkan, sehingga setiap perbaikan
**wajib** menjadi berkas baru. Di proyek yang menyunting migrasi di tempat,
kesepuluh peristiwa ini tidak akan meninggalkan jejak sama sekali.

| Migrasi | Jenis | Yang terjadi |
| --- | :-: | --- |
| `20260729110000_fix_my_location_ids.sql` | 🐞 | `my_location_ids()` memakai subquery skalar `(select id from locations)` yang gagal begitu ada lebih dari satu lokasi. Karena setiap policy RLS melewatinya, Super Admin dan Corporate IT **tidak dapat membaca baris apa pun** |
| `20260729150000_fix_counters_and_rename.sql` | 🐞 | Dua generator nomor SECURITY INVOKER, gagal `permission denied for table asset_code_counters` pada penyimpanan aset pertama. Sekaligus memperbaiki `master_rename()` yang selalu melaporkan `Record not found` karena PL/pgSQL tidak menyetel `FOUND` sesudah `EXECUTE` |
| `20260730080000_asset_tags.sql` | ↩ | Klien membalik larangan pemindaian barcode pada 2026-07-30. Lihat §6.1 |
| `20260731190000_fix_audit_search_path.sql` | 🐞 | `audit_row()` SECURITY DEFINER tanpa `set search_path`; gagal ketika pemanggilnya GoTrue, dan pencabutan login berakhir `Database error deleting user` tanpa petunjuk |
| `20260803110000_fix_delete_asset_array.sql` | 🐞 | `holds \|\| 'an assignment'` dibaca PostgreSQL sebagai `anyarray \|\| anyarray`, menghasilkan `malformed array literal` alih-alih kalimat penolakan yang dapat ditindaklanjuti |
| `20260803160000_drop_old_search.sql` | 🐞 | Dua overload `search_assets()` sama-sama cocok dengan satu pemanggilan bernama argumen; **seluruh pencarian rusak** |
| `20260804110000_fix_edit_maintenance_cast.sql` | 🐞 | Kesalahan cast pada `edit_maintenance()` |
| `20260821091100_import_match_by_name.sql` | ♻ | Pencocokan impor diperluas ke nama + perusahaan |
| `20260821091200_import_asset_label.sql` | ♻ | Impor 500 aset berarti 500 penempelan stiker manual — alur yang tidak pernah diselesaikan siapa pun |
| `20260824090000_bast_storage_no_asset.sql` | 🐞 | Policy `storage.objects` terlewat saat `bast.asset_id` dijadikan nullable |
| `20260824090100_signed_bast_without_asset.sql` | 🐞 | Paruh kedua kelalaian yang sama, pada `documents.asset_id NOT NULL` |

Dua yang terakhir adalah pasangan, dan headernya mencatat bagaimana keduanya
ditemukan: *"Both halves were found by rendering a PDF, which became possible
for the first time once the local edge runtime would start."* Membaca kode
tidak menemukannya, karena **kode yang salah berada di migrasi yang berbeda
dari migrasi yang berubah**. Ini pelajaran metodologis yang layak masuk bab
pembahasan.

---

## 2. Fase pengembangan dari git log

**39 commit**, 2026-07-30 sampai 2026-08-26 — 28 hari kalender.

```sh
git rev-list --count HEAD                                      # -> 39
git log --format='%cd' --date=format:'%Y-%m-%d' | sort | uniq -c
```

### 2.1 Enam fase

Pembagian di bawah dibuat dari **isi pesan commit**, bukan dari jeda tanggal.
Batas fase diambil pada titik ketika pokok pekerjaan berpindah.

| Fase | Rentang | Hari | Commit | Pokok pekerjaan |
| --- | --- | ---: | ---: | --- |
| **I — Fondasi** | 2026-07-30 | 1 | 6 | Skema, RLS, RPC inti ("Phases 0-5" dalam satu commit), jalur build EAS, siklus hidup label |
| **II — Fitur inti** | 2026-07-31 | 1 | 7 | Pindah ke Supabase hosted, pemindaian label, E-BAST dengan tanda tangan layar, perubahan status, manajemen akun, Fase 6 |
| **III — Impor, laporan, dan pematangan** | 2026-08-01 – 08-04 | 4 | 13 | Impor CSV, laporan, dashboard, barcode Code 128, pindah ke pnpm, CI, perawatan sebagai record |
| **IV — Kode aset dan foto** | 2026-08-07 – 08-11 | 2 | 5 | Stok label per lokasi, format kode aset perusahaan, galeri foto, batas lima foto |
| **V — Perluasan domain** | 2026-08-21 – 08-24 | 2 | 4 | Perlengkapan, unit kendaraan, pemegang kedua, impor pegawai, BAST Perlengkapan |
| **VI — Penghalusan antarmuka** | 2026-08-26 | 1 | 2 | Pengukuran keyboard, pencarian di setiap picker |

### 2.2 Bentuk yang terlihat dari sebarannya

| Pengamatan | Angka |
| --- | ---: |
| Hari kalender dari commit pertama ke terakhir | 28 |
| Hari yang benar-benar ada commit | 11 |
| Hari tanpa commit | 17 |
| Commit terbanyak dalam satu hari | 7 (2026-07-31) |
| Commit terakhir sebelum jeda terpanjang | 2026-08-11 → 2026-08-21 (10 hari) |

Sebelas hari kerja menghasilkan 61 migrasi, 135 fungsi database, dan 29 layar.
Fase I dan II saja — dua hari — menghasilkan seluruh fondasi skema, RLS, dan
E-BAST.

> **Kualifikasi untuk BAB III.** Commit pertama berjudul *"CITE Assets —
> Phases 0-5"*, yang berarti pekerjaan lima fase perencanaan masuk dalam satu
> commit. Jadi **tanggal commit bukan tanggal pengerjaan** untuk bagian itu;
> ia hanya menandai kapan pekerjaan itu masuk repositori.
> `[BELUM TERVERIFIKASI — kapan pekerjaan Fase 0-5 sesungguhnya dimulai;
> tidak dapat diketahui dari git.]`

---

## 3. Penanda sementara: TODO, FIXME, HACK, @ts-ignore

**Tidak ada satu pun.**

```sh
grep -rniE "\b(TODO|FIXME|HACK|XXX)\b" app/ src/ supabase/ tests/ scripts/
# 1 hasil: tests/asset-code.mjs:164 — string 'HACK' sebagai data uji,
#          dipakai untuk menguji bahwa nomor kode harus berupa digit.
#          Bukan penanda sementara.

grep -rniE "@ts-ignore|@ts-expect-error|eslint-disable" app/ src/ supabase/ tests/
# tidak ada hasil
```

Nol penekanan tipe dan nol penekanan lint di seluruh repositori adalah temuan
yang layak dikutip. `tsconfig.json:4-6` bahkan menyalakan `strict`,
`noUncheckedIndexedAccess`, dan `noImplicitOverride` — ketiganya lolos tanpa
satu pun pengecualian.

Perlu dicatat bahwa ketiadaan `TODO` **bukan** berarti tidak ada pekerjaan
tersisa. Repositori ini mencatat pekerjaan tersisa di tempat lain: header
migrasi menyebut apa yang sengaja belum dikerjakan (`min_qty` yang belum
dibaca kode mana pun, misalnya, di
`supabase/migrations/20260821090200_accessories.sql:27-29`).

---

## 4. Kode yang tidak terpakai

Dikumpulkan dari Fase 4, 6, dan 7, ditambah pemindaian baru untuk dependency
dan komponen.

### 4.1 Fungsi database tanpa rujukan

Empat, seluruhnya signature lama yang tergantikan tetapi tidak pernah
di-`drop`. Rincian di [04-katalog-rpc.md](04-katalog-rpc.md) §Z.1.e.

| Fungsi | Definisi | Baris | Digantikan |
| --- | --- | ---: | --- |
| `asset_status_history` | `20260731140000_status_changes.sql:152` | 23 | `asset_detail()` |
| `maintenance_list` | `20260801090000_phase6.sql:236` | 25 | `maintenance_log()` |
| `open_maintenance` | `20260801090000_phase6.sql:145` | 35 | `log_maintenance()` |
| `update_maintenance` | `20260801090000_phase6.sql:181` | 53 | `edit_maintenance()` |

Keempatnya masih memegang `grant execute ... to authenticated`, jadi secara
teknis masih dapat dipanggil siapa pun yang tahu namanya. 136 baris SQL mati.

### 4.2 Tabel tanpa penulis

| Tabel | Keadaan |
| --- | --- |
| `asset_code_counters` | **Tidak ada yang menulis ke sana.** Dua definisi `next_asset_code()` yang menulisnya sudah digantikan; definisi ketiga memakai `max()+1` atas `assets`. Tanpa grant, tanpa RLS. Lihat [07-alur-proses.md](07-alur-proses.md) alur 2 |

Dua tabel penghitung lain — `bast_number_counters` dan `tag_code_counters` —
masih hidup dan dipakai generator masing-masing.

### 4.3 Pembungkus TypeScript tanpa pengimpor

Empat, dari [04-katalog-rpc.md](04-katalog-rpc.md) §Z.3:

| Pembungkus | Berkas | RPC di baliknya |
| --- | --- | --- |
| `deleteDocument()` | `src/api/documents.ts` | `delete_document` |
| `uploadAssetPhoto()` | `src/api/assets.ts` | `set_asset_photo` |
| `fetchUnitAssets()` | `src/api/units.ts` | `unit_assets` |
| `voidTag()` | `src/api/tags.ts` | `void_tag` |

```sh
for w in deleteDocument uploadAssetPhoto fetchUnitAssets voidTag; do
  grep -rn "\b$w\b" app/ src/ --include=*.ts --include=*.tsx | grep -vc "^src/api/"
done      # keempatnya -> 0
```

`voidTag` yang paling menonjol: membatalkan stiker adalah satu dari tiga
keadaan siklus hidup label yang ditegakkan CHECK `void_needs_reason`, RPC-nya
**diuji** `tests/asset-tags.mjs:268-282`, tetapi tidak ada jalan ke sana dari
aplikasi.

### 4.4 Dependency tanpa pemakai

**Satu:** `expo-build-properties` (`package.json:56`).

| Pemeriksaan | Hasil |
| --- | --- |
| Diimpor di `app/` atau `src/`? | Tidak |
| Terdaftar di `app.json` `plugins`? | **Tidak** |
| Dirujuk `eas.json`? | Tidak |

> **Peringatan metodologis.** Pemindaian naif "dependency yang tidak diimpor"
> menghasilkan **15** nama, dan empat belas di antaranya **salah**. Sebagian
> dipakai lewat `app.json` `plugins` (`expo-font`, `expo-secure-store`,
> `expo-splash-screen`, `expo-system-ui`), sebagian adalah peer dependency
> expo-router dan react-navigation (`react-native-gesture-handler`,
> `react-native-reanimated`, `react-native-screens`, `react-native-worklets`),
> dan sebagian melayani target web (`react-dom`, `react-native-web`).
> Hanya `expo-build-properties` yang lolos ketiga pemeriksaan.

### 4.5 Komponen tanpa pemakai

**Tidak ada.** Kedua puluh lima komponen `.tsx` di `src/components/` — 15 di
`ui/`, 7 di `chrome/`, 2 di `charts/`, dan `CategoryIcon` — seluruhnya diimpor
setidaknya satu berkas di luar barrel `index.ts`-nya.

### 4.6 Kemampuan yang ada di database tetapi tidak ada yang menjalankan

| Kemampuan | Bukti |
| --- | --- |
| Menghapus perlengkapan | Policy `accessories_delete` ada dan `grant delete` ada, tetapi **tidak ada RPC `delete_accessory` dan tidak ada kendali di layar mana pun** |

```sh
grep -rn "delete_accessory\|deleteAccessory" supabase/migrations/ src/ app/   # -> kosong
```

---

## 5. Ketidakkonsistenan penamaan dan pola

Enam pola yang tidak seragam. Tidak satu pun adalah cacat — dicatat karena
penguji yang membaca skema akan menanyakannya.

### 5.1 Dua belas policy tidak berawalan nama tabelnya

Dari **85 policy pada tabel aplikasi** (di luar 10 policy `storage.objects`
yang konvensinya memang lain), dua belas memakai singkatan atau bentuk lain:

| Tabel | Policy | Bentuk yang konsisten seharusnya |
| --- | --- | --- |
| `account_scope_preferences` | `scope_pref_own` | `account_scope_preferences_*` |
| `asset_tags` | `tags_read`, `tags_write`, `tags_update` | `asset_tags_*` |
| `audit_log` | `audit_read` | `audit_log_read` |
| `import_batches` | `imports_read`, `imports_write` | `import_batches_*` |
| `maintenance_records` | `maintenance_read`, `maintenance_write`, `maintenance_update` | `maintenance_records_*` |
| `notifications` | `notif_own`, `notif_mark_read` | `notifications_*` |

Tujuh puluh tiga policy lain **memang** berawalan nama tabelnya, termasuk
keempat puluh policy master data yang di-generate loop `do $$`. Jadi konvensi
itu ada; dua belas ini menyimpang darinya.

Akibat praktisnya kecil tetapi nyata: mencari policy sebuah tabel dengan
`grep '^create policy notifications'` akan **gagal menemukan keduanya**.

### 5.2 Dua tabel bernama tunggal

| Tabel | Catatan |
| --- | --- |
| `bast` | Tiga puluh satu tabel lain jamak (`assets`, `accounts`, `movements`). `bast` tunggal — mungkin karena BAST adalah akronim, bukan kata benda Inggris |
| `audit_log` | Tunggal karena ia sebuah *log*, bukan kumpulan *audit* |

Anak-anak `bast` justru jamak: `bast_items`, `bast_versions`,
`bast_signatures`, `bast_signatories`. Jadi ketidakkonsistenannya terbatas
pada induknya saja.

### 5.3 Kolom berbahasa Indonesia di tengah skema berbahasa Inggris

Dua kolom, keduanya di `bast_items`:

| Kolom | Definisi |
| --- | --- |
| `jenis` | `supabase/migrations/20260804140000_...:209` |
| `kondisi` | `supabase/migrations/20260804140000_...:211` |

Ini **dapat dibenarkan**: keduanya adalah judul kolom pada lembar BAST yang
dicetak, dan lembar itu berbahasa Indonesia. Menamainya `type` dan `condition`
akan memutus hubungan antara kolom database dan kata yang muncul di kertas.
Kolom `condition_text` pada `bast` menempuh jalan sebaliknya — nama Inggris,
isi Indonesia (`'Baik / Good'`).

### 5.4 Dua generasi fungsi perawatan hidup berdampingan

| Generasi | Fungsi | Keadaan |
| --- | --- | --- |
| Lama (`phase6`, 2026-08-01) | `open_maintenance()`, `update_maintenance()`, `maintenance_list()` | **Mati** — nol rujukan |
| Baru (2026-08-04) | `log_maintenance()`, `edit_maintenance()`, `maintenance_log()` | Dipakai |

Penamaannya juga terbalik urutannya: yang lama `open_`/`update_` + objek, yang
baru kata kerja + objek (`log_maintenance`) tetapi pembacanya objek + kata
benda (`maintenance_log`). Nama `maintenance_log()` dan `maintenance_list()`
terutama mudah tertukar padahal satu hidup dan satu mati.

### 5.5 Dua jalur penempelan label dengan konvensi berbeda

`tag_asset()` membuat aset **dan** menempel stiker; `attach_tag()` menempel
stiker ke aset yang sudah ada. Nama keduanya menukar posisi objek dan kata
kerja, sehingga tidak terbaca sebagai sepasang. Hanya yang pertama diuji
([09-pengujian.md](09-pengujian.md) §4.1).

### 5.6 Satu enum tanpa nilai yang dibutuhkan

`audit_action` tidak punya nilai `bast_voided`, sehingga `void_bast()`
memakai `'bast_generated'` untuk baris audit manualnya dan trigger memakai
`'bast_signed'`. Dua baris audit untuk satu tindakan void, keduanya berlabel
aksi yang salah. Lihat [07-alur-proses.md](07-alur-proses.md) alur 7.

Pola yang sama pada `asset_tags_audit`, yang memakai ulang
`asset_created`/`asset_updated` sehingga entri audit label tidak dapat
dibedakan dari entri aset kecuali lewat kolom `table_name`.

---

## 6. Perilaku yang berbeda dari dokumentasi di repositori

Tujuh perbedaan, dikumpulkan dari Fase 1, 2, dan 7. Diurut menurut seberapa
besar akibatnya bila penguji menemukannya lebih dulu.

### 6.1 README melarang pemindaian barcode; sistem memindainya

| | |
| --- | --- |
| **Dokumentasi** | `README.md:15` — *"The physical asset stickers already exist — **do NOT implement QR code or barcode scanning.**"* |
| **Kode** | `app/(tabs)/scan.tsx:190-195` memasang `<CameraView>` dengan `barcodeTypes: ['qr','code128','ean13','code39']`. Ada tabel `asset_tags`, 10 RPC label, generator Code 128 buatan sendiri, dan `PANDUAN-CETAK-LABEL.md` |
| **Penjelasannya ADA** | `supabase/migrations/20260730080000_asset_tags.sql:4-9` — *"REVERSES AN EARLIER CONSTRAINT, ON THE CLIENT'S INSTRUCTION … On 2026-07-30 the client replaced that with the opposite"* |

Jadi ini **perubahan requirement bertanggal yang dicatat di tempat
perubahannya terjadi**, bukan penyimpangan diam-diam. Yang tetap menjadi celah
adalah `README.md` tidak pernah diperbarui — larangan yang sudah dibatalkan
sebelas bulan lalu masih terbaca sebagai aturan yang berlaku.

### 6.2 DATABASE.md mengklaim setiap tabel punya `created_at` dan `updated_at`

| | |
| --- | --- |
| **Dokumentasi** | `DATABASE.md:3-4` — *"every table has `created_at`, `updated_at`, and (where a person acted) `created_by`"* |
| **Kode** | 25 dari 33 tabel punya `created_at`; **14 dari 33** punya `updated_at` |

Rincian di [02-kamus-data.md](02-kamus-data.md) §8.2. Delapan tabel tanpa
`created_at` sebagian besar tabel penghitung dan jembatan — wajar. Tetapi
`asset_statuses` dan `asset_conditions`, dua tabel master yang dapat disunting
admin, juga tidak punya keduanya **dan** tidak punya trigger audit.

### 6.3 DATABASE.md §11 menyebut lokasi gudang yang tidak ada

| | |
| --- | --- |
| **Dokumentasi** | `return_asset()` memindahkan aset "ke lokasi gudang" |
| **Kode** | Aset tetap di tempatnya, hanya kehilangan pemegangnya |
| **Penjelasannya ADA** | `supabase/migrations/20260729180000_assign_return_movement.sql:11-17` — *"No such column or flag exists anywhere in the schema — there is no way to know which location is the store"* |

Kode menolak mengarang mekanisme yang tidak ada di skema, dan mencatat
penolakannya. Ini contoh baik untuk bab pembahasan.

### 6.4 README menetapkan pustaka PDF; implementasi tidak memakai pustaka

| | |
| --- | --- |
| **Dokumentasi** | `README.md:29` — Puppeteer/Playwright atau `pdf-lib` |
| **Kode** | Penulis PDF 1.4 buatan sendiri, nol dependensi eksternal di `supabase/functions/` |
| **Alasan tertulis** | `generate-bast-pdf/pdf.ts:1-10` — hanya butuh lima primitif, cold-start lebih cepat, tidak bisa hanyut versinya |

### 6.5 README menetapkan SheetJS dan `.xlsx`; implementasi memakai CSV

| | |
| --- | --- |
| **Dokumentasi** | `README.md:30` — `xlsx` (SheetJS) di Edge Function · `README.md:395` — *"Upload accepts .xlsx ≤ 5 MB"* |
| **Kode** | Parser CSV buatan sendiri di `src/lib/csv.ts`, berjalan **di perangkat**; validasi di RPC PostgreSQL, bukan Edge Function. Tidak ada dependency `xlsx` |

Bagian *"validation must run server-side before insert"* tetap terpenuhi —
tetapi oleh RPC, bukan oleh Edge Function seperti yang tertulis.

### 6.6 PostgreSQL 15 di pengembangan, 17 di produksi

| | |
| --- | --- |
| **Dokumentasi** | `DATABASE.md:3` — *"Target: PostgreSQL 15+"* |
| **Lokal dan CI** | `supabase/config.toml:17` — `major_version = 15` |
| **Produksi** | `supabase/.temp/postgres-version` — `17.6.1.147` |

Klaim "15+" tidak salah, tetapi **suite pengujian tidak pernah dijalankan pada
versi mayor yang sama dengan produksi**, dan berkas `.temp` di-ignore sehingga
ketidaksesuaian ini tidak terlihat oleh siapa pun yang hanya membaca
repositori.

### 6.7 Aturan kerja proyek #3 dilanggar empat kali, dengan sengaja

| | |
| --- | --- |
| **Aturan** | Jangan pernah menulis ke `audit_log`; baris hanya masuk lewat trigger |
| **Kode** | `delete_account()`, `delete_asset()`, `delete_bast()`, `void_bast()` menulis langsung |
| **Alasan tertulis** | `20260803110000_fix_delete_asset_array.sql:53-54` — *"the audit trigger fires on the delete itself, but a trigger cannot know why, and why is the only part worth reading here"* |

Naskah sebaiknya menyebut aturan #3 sebagai "tiga lapis pada tabel
append-only, dengan empat pengecualian tercatat di jalur penghapusan".

### 6.8 Ringkasan

| # | Perbedaan | Dijelaskan di kode? | Dokumen perlu diperbaiki? |
| ---: | --- | :-: | :-: |
| 6.1 | Larangan barcode | **Ya** | Ya — `README.md:15` |
| 6.2 | Klaim `created_at`/`updated_at` | Tidak | Ya — `DATABASE.md:3-4` |
| 6.3 | Lokasi gudang | **Ya** | Ya — `DATABASE.md §11` |
| 6.4 | Pustaka PDF | **Ya** | Ya — `README.md:29` |
| 6.5 | SheetJS dan `.xlsx` | **Ya** | Ya — `README.md:30`, `:395` |
| 6.6 | Versi PostgreSQL | Tidak | Perlu dinyatakan, bukan diperbaiki |
| 6.7 | Aturan kerja #3 | **Ya** | Ya — aturan kerja proyek |

**Lima dari tujuh dijelaskan di dalam kode itu sendiri.** Ini pola yang
konsisten di repositori ini: ketika kode menyimpang dari rencana, alasannya
ditulis di header migrasi atau di komentar berkasnya. Yang tertinggal adalah
dokumen rencananya, yang tidak pernah menyusul.

---

## 7. Yang belum terverifikasi di Fase 10

| # | Butir | Cara menutupnya |
| ---: | --- | --- |
| 1 | Kapan pekerjaan "Phases 0-5" sesungguhnya dimulai | Tidak dapat diketahui dari git — commit pertama sudah memuat lima fase. Perlu catatan Anda sendiri |
| 2 | Apakah `expo-build-properties` pernah dipakai lalu ditinggalkan | `git log -- package.json` untuk melihat kapan ia ditambahkan dan bersama apa |
| 3 | Apakah keempat pembungkus TS mati (§4.3) sengaja disiapkan atau layarnya dihapus | `git log --diff-filter=D` untuk mencari layar yang pernah ada |
| 4 | Apakah ada ketidakkonsistenan penamaan di `src/` dan `app/` yang belum tersisir | Fase ini hanya menyisir skema dan policy secara sistematis |

Butir 3 paling mudah dijawab dan paling berguna: bila layarnya memang pernah
ada lalu dihapus, keempat pembungkus itu sisa yang aman dibuang; bila belum
pernah ada, keempatnya adalah fitur yang tinggal dipasang.
