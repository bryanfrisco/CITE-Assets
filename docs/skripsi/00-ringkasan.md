# 00 — Ringkasan dan Konsolidasi

Berkas ini adalah **titik masuk** sepuluh dokumen di `docs/skripsi/`, dan
**satu-satunya sumber kebenaran** untuk angka yang akan dikutip berulang di
skripsi.

**Tanggal konsolidasi:** 2026-09-01  
**Revisi yang didokumentasikan:** working tree di atas commit `cd0d9f3`
(2026-08-26), termasuk migrasi `20260831090000_audit_targets.sql` yang belum
di-commit  
**Patokan:** kode di repositori. Dokumen panduan (`README.md`, `DATABASE.md`,
`IMPLEMENTATION_PLAN.md`) hanya dipakai sebagai pembanding, tidak pernah
sebagai sumber fakta.

---

## 1. Daftar isi

| # | Dokumen | Isi | Baris |
| ---: | --- | --- | ---: |
| 01 | [01-inventaris.md](01-inventaris.md) | Identitas revisi, struktur folder, statistik baris kode, dependency dan versinya, serta enam angka pokok sistem beserta perintah hitungnya. | 917 |
| 02 | [02-kamus-data.md](02-kamus-data.md) | Kamus data 33 tabel: kolom, kunci, foreign key, index, CHECK, dan trigger — direkonstruksi dari 61 migrasi, bukan dari migrasi pertama. | 2027 |
| 03 | [03-erd.md](03-erd.md) | Lima ERD Mermaid terpisah per modul plus satu ringkas, seluruhnya sudah dirender dan diukur ukuran cetaknya. | 1074 |
| 04 | [04-katalog-rpc.md](04-katalog-rpc.md) | Katalog 135 fungsi database: signature, security, tujuan, tabel yang disentuh, pesan galat, pemanggil, dan layar yang memakainya. | 4307 |
| 05 | [05-keamanan.md](05-keamanan.md) | RLS dan policy per tabel, GRANT/REVOKE, matriks izin tabel × peran, mekanisme append-only, perbandingan gerbang UI dengan RLS, dan 35 trigger. | 1179 |
| 06 | [06-katalog-layar.md](06-katalog-layar.md) | Katalog 29 rute expo-router: judul, izin, komponen, query dan mutation, state lokal, penanganan status, dan navigasi keluar — plus dua peta navigasi. | 1117 |
| 07 | [07-alur-proses.md](07-alur-proses.md) | Dua belas alur proses sebagai sequence diagram, tiga di antaranya ditambah activity diagram, dengan urutan transaksi dan perilaku saat gagal. | 1430 |
| 08 | [08-aturan-bisnis.md](08-aturan-bisnis.md) | 198 aturan bisnis berkode BR, dikelompokkan per lapisan penegakan, plus jawaban atas aturan mana yang hanya hidup di UI. | 525 |
| 09 | [09-pengujian.md](09-pengujian.md) | 23 suite pengujian, 679 assertion, matriks keterlacakan aturan bisnis, dan daftar aturan yang belum diuji sama sekali. | 1430 |
| 10 | [10-riwayat-celah.md](10-riwayat-celah.md) | 61 migrasi berurutan dengan tanggal commit, enam fase pengembangan, kode tak terpakai, ketidakkonsistenan penamaan, dan tujuh perbedaan dari dokumentasi. | 488 |

Total **14.494 baris** dokumentasi di sepuluh dokumen, ditambah 365 baris berkas ini. Berkas pendukung: lima SVG ERD di
[`erd/`](erd/), dua peta navigasi di [`nav/`](nav/), dan 15 diagram alur di
[`alur/`](alur/) — seluruhnya sudah dirender, bukan sekadar ditulis.

### 1.1 Urutan membaca yang disarankan

| Kebutuhan | Baca |
| --- | --- |
| Gambaran cepat | Berkas ini, lalu `03-erd.md` §E |
| Menyusun BAB III (metodologi) | `10-riwayat-celah.md` §2 untuk jadwal, `01-inventaris.md` untuk lingkungan |
| Menyusun BAB IV (hasil) | `03-erd.md`, `07-alur-proses.md`, `05-keamanan.md` §3, `08-aturan-bisnis.md` |
| Menyusun bab keterbatasan | `08-aturan-bisnis.md` §4, `09-pengujian.md` §4, §4 berkas ini |
| Lampiran | `02-kamus-data.md`, `04-katalog-rpc.md`, `06-katalog-layar.md`, `09-pengujian.md` §2 |

---

## 2. Seluruh angka faktual — satu sumber kebenaran

Setiap angka di bawah dihitung ulang dengan perintah di kolom terakhir.
**Kutip dari sini**, jangan dari ingatan atau dari dokumen lain.

### 2.1 Repositori dan lingkungan

| Besaran | Nilai | Perintah |
| --- | ---: | --- |
| Commit HEAD | `cd0d9f3` | `git rev-parse --short HEAD` |
| Tanggal commit | 2026-08-26 | `git log -1 --format=%cd --date=format:'%Y-%m-%d'` |
| Total commit | 39 | `git rev-list --count HEAD` |
| Rentang pengembangan | 2026-07-30 – 08-26 (28 hari, 11 hari ada commit) | `git log --format='%cd' --date=short \| sort -u \| wc -l` |
| Node (CI) | 22 | `.github/workflows/ci.yml:44` |
| Expo SDK | 57 | `package.json:54` |
| React Native | 0.86.0 | `package.json:76` |
| TypeScript | 6.0.3 | `package.json:96` |
| PostgreSQL (lokal/CI) | 15 | `supabase/config.toml:17` |
| PostgreSQL (produksi) | 17.6.1.147 | `supabase/.temp/postgres-version` (di-ignore) |
| Dependency langsung | 48 (38 runtime + 10 dev) | `node -e "const p=require('./package.json');console.log(Object.keys(p.dependencies).length, Object.keys(p.devDependencies).length)"` |

### 2.2 Ukuran kode

| Besaran | Nilai | Perintah |
| --- | ---: | --- |
| Berkas kode aplikasi | 195 | `npx cloc src app supabase/migrations supabase/functions tests scripts --force-lang=JavaScript,mjs` |
| Baris kode (tanpa komentar dan baris kosong) | 36.186 | idem |
| — TypeScript | 20.136 (104 berkas) | idem |
| — SQL | 9.443 (61 berkas) | idem |
| — JavaScript `.mjs` | 6.607 (30 berkas) | idem |
| Baris komentar | 6.709 | idem |
| Rasio komentar SQL | 32% | 3.039 ÷ 9.443 |
| Rasio komentar TypeScript | 14% | 2.788 ÷ 20.136 |

### 2.3 Database

| Besaran | Nilai | Perintah |
| --- | ---: | --- |
| Berkas migrasi | 61 (60 ter-commit) | `ls -1 supabase/migrations/*.sql \| wc -l` |
| Tabel | 33 | `grep -rniE "^[[:space:]]*create[[:space:]]+table" supabase/migrations/*.sql \| wc -l` |
| Foreign key | 79 | `grep -rhoiE "references[[:space:]]+[a-z_.]+\(" supabase/migrations/*.sql \| wc -l` (80 − 1 di komentar) |
| Tipe ENUM | 12 | `grep -rhoiE "create type [a-z_]+ +as enum" supabase/migrations/*.sql \| wc -l` |
| CHECK constraint | 12 | `grep -rn "check (" supabase/migrations/*.sql \| grep -v "with check"` |
| Unique index eksplisit | 4 | `grep -rc 'create unique index' supabase/migrations/*.sql` |
| Trigger | 35 | `grep -rcE "^[[:space:]]*create[[:space:]]+trigger" supabase/migrations/*.sql \| awk -F: '{s+=$2} END {print s}'` |
| Fungsi database (nama berbeda) | 135 | lihat `04-katalog-rpc.md` §0.1 |
| Pernyataan `create function` | 191 | `grep -rciE "create[[:space:]]+(or[[:space:]]+replace[[:space:]]+)?function" supabase/migrations/*.sql` |
| Baris badan fungsi (definisi terakhir) | 5.443 | pemindaian definisi terakhir |
| Policy RLS | 95 (85 tabel aplikasi + 10 `storage.objects`) | lihat `05-keamanan.md` §0 |
| Tabel dengan RLS aktif | 30 dari 33 | `grep -rcE "enable row level security" supabase/migrations/*.sql` |

### 2.4 Aplikasi

| Besaran | Nilai | Perintah |
| --- | ---: | --- |
| Rute (layar) | 29 | `find app -name '*.tsx' -not -name '_layout.tsx' \| wc -l` |
| Layout | 2 | `find app -name '_layout.tsx'` |
| RPC dipanggil dari `src/` | 87 | `grep -rhoE "\.rpc\([[:space:]]*'[a-zA-Z0-9_]+'" src/ \| sort -u \| wc -l` |
| Pemanggilan `useQuery` di layar | 64 | `grep -rho 'useQuery(' app/ \| wc -l` → 65, satu di `_layout.tsx` |
| Pemanggilan `useMutation` | 46 | `grep -rho 'useMutation(' app/ \| wc -l` |
| Tepi navigasi antar layar | 61 | `06-katalog-layar.md` §3 |
| Komponen `.tsx` di `src/components/` | 25 | `ls -1 src/components/**/*.tsx` |

### 2.5 Keamanan

| Besaran | Nilai | Sumber |
| --- | ---: | --- |
| Peran pengguna | 4 | `20260729090000_init_schema.sql:20` |
| Hak `anon` atas tabel | **0** | `05-keamanan.md` §2.1 |
| Tabel yang hanya dapat ditulis lewat RPC | 6 | `05-keamanan.md` §2.3 |
| Tabel append-only tiga lapis | 5 | `05-keamanan.md` §4.1 |
| Tabel append-only dua lapis | 1 (`import_batches`) | `05-keamanan.md` §4.2 |
| Fungsi SECURITY DEFINER | 61 | `04-katalog-rpc.md` §ZZ.4 |
| — tanpa `set search_path` | 4 | `05-keamanan.md` §ZZ.2 |
| Fungsi tanpa `grant`/`revoke` sama sekali | 9 | `05-keamanan.md` §2.4 |

### 2.6 Aturan bisnis dan pengujian

| Besaran | Nilai | Sumber |
| --- | ---: | --- |
| Aturan bisnis total | 198 | `08-aturan-bisnis.md` |
| — lapisan skema (CHECK + unique) | 16 | §1 |
| — lapisan RPC (pesan galat unik) | 171 | §2 |
| — lapisan UI | 11 | §3 |
| Aturan yang **hanya** hidup di UI | **2** | §4.1 |
| Suite pengujian | 23 | `ls -1 tests/*.mjs \| grep -v '/_' \| wc -l` |
| Assertion | 679 | `09-pengujian.md` §0.2 |
| Aturan RPC terbukti harfiah oleh suite | 36 / 171 (21%) | §3.2 |
| Aturan RPC tanpa sentuhan suite | **29 / 171 (16%)** | §4 |
| Suite dijalankan CI tiap push | 1 dari 23 | `.github/workflows/ci.yml:55-62` |

### 2.7 Kode tak terpakai

| Besaran | Nilai | Sumber |
| --- | ---: | --- |
| Fungsi database tanpa rujukan | 4 (136 baris) | `10-riwayat-celah.md` §4.1 |
| Tabel tanpa penulis | 1 (`asset_code_counters`) | §4.2 |
| Pembungkus TypeScript tanpa pengimpor | 4 | §4.3 |
| Dependency tanpa pemakai | 1 (`expo-build-properties`) | §4.4 |
| Komponen tanpa pemakai | 0 | §4.5 |
| `TODO` / `FIXME` / `HACK` | **0** | §3 |
| `@ts-ignore` / `eslint-disable` | **0** | §3 |

---

## 3. Seluruh butir yang belum terverifikasi

Dikumpulkan dari sepuluh dokumen. **Ini daftar yang harus Anda tutup sebelum
sidang**, karena setiap butir di sini adalah pertanyaan yang saya sadari belum
terjawab — dan penguji cenderung menemukan justru yang seperti ini.

### 3.1 Dua puluh lima butir terbuka

Dikelompokkan menurut **cara menutupnya**, bukan menurut dokumen asalnya,
karena satu tindakan sering menutup banyak butir sekaligus.

#### A. Ditutup dengan menjalankan stack lokal (14 butir)

Satu tindakan: `supabase start && supabase db reset`. Itu menutup lebih dari
separuh daftar ini.

| # | Butir | Dari |
| ---: | --- | --- |
| A1 | Jumlah tabel menurut `pg_class`, bukan menurut DDL | 01 §6.1 |
| A2 | Jumlah entri `pg_proc` sesungguhnya — 135 adalah batas bawah karena overloading | 01 §6.3, 04 §0.3 |
| A3 | Nama enam CHECK constraint yang tidak ditulis eksplisit di DDL | 02 §0.2 |
| A4 | Nama policy master data hasil `format('%I')` | 05 §0 |
| A5 | Perilaku DELETE pada `bast` yang punya `bast_versions` — cascade vs trigger append-only | 02 §8.7, 03 §C, 05 §4.4 |
| A6 | Apakah UPDATE langsung ke `asset_tags` lintas lokasi oleh Site IT benar-benar lolos | 05 §5.5 |
| A7 | Apakah 9 fungsi tanpa `revoke` benar-benar dapat dipanggil `anon` | 05 §2.4 |
| A8 | Apakah 4 fungsi DEFINER tanpa `search_path` dapat dijangkau dari sesi non-public | 04 §ZZ.2 |
| A9 | Hasil eksekusi 23 suite — apakah 679 assertion semuanya lulus | 09 §4.3 |
| A10 | Apakah lapisan API menerjemahkan galat 23505 dari `assignments_one_active` | 07 alur 3 |
| A11 | Perilaku dua hand-out perlengkapan bersamaan sebelum commit | 07 alur 9 |
| A12 | Apakah `record_movement()` menerima tanggal berformat tidak lazim (BR-911) | 08 §6 |
| A13 | Apakah aset tanpa merek (BR-903) merusak layar detail atau laporan | 08 §6 |
| A14 | Apakah ada fitur SQL yang berperilaku berbeda antara PostgreSQL 15 dan 17 | 01 §8.4 |

Butir A5 dan A9 yang paling berharga. A5 karena ia pertentangan logis di DDL
yang belum diuji; A9 karena seluruh angka cakupan di `09-pengujian.md` adalah
**cakupan statis** — apa yang suite sebutkan, bukan apa yang terbukti saat
dijalankan.

#### B. Ditutup dengan membaca kode lebih jauh (6 butir)

| # | Butir | Dari |
| ---: | --- | --- |
| B1 | Pengelompokan 48 fungsi tanpa pemanggil klien — disusun dari nama, belum dari isi | 01 §6.4.2 |
| B2 | Apakah kode di `src/` membaca `updated_at` milik `units`/`companies`/`accessories` | 02 §8.1 |
| B3 | Nilai sah `import_batches.kind` — perlu membaca badan RPC impor | 02 §8.3 |
| B4 | Apakah RPC dokumen menulis sendiri ke `audit_log` | 02 §8.9 |
| B5 | Pemetaan BR-001..016 (aturan skema) ke suite pengujian | 09 §4.2 |
| B6 | Apakah ada aturan bisnis di Edge Function yang belum tersisir | 08 §6 |

Butir B6 paling mendesak: Fase 7 sudah menemukan **satu** aturan yang hanya
hidup di Edge Function — gerbang `complete` di `generate-bast-pdf/index.ts:531`
— dan aturan itu tidak cocok dengan padanannya di `sign_bast()`. Kemungkinan
ada yang lain.

#### C. Hanya Anda yang dapat menjawab (5 butir)

| # | Butir | Mengapa |
| ---: | --- | --- |
| C1 | Versi Deno yang dipakai Edge Function | Tidak ada satu pun berkas di repositori yang menyebutnya |
| C2 | Kapan pekerjaan "Phases 0-5" sesungguhnya dimulai | Commit pertama sudah memuat lima fase — tidak dapat diketahui dari git |
| C3 | Apakah keseragaman `NO ACTION` pada 19 kolom pelaku disengaja | Tidak ada komentar yang menjelaskannya, berbeda dari FK master data |
| C4 | Apakah 4 pembungkus TS mati disiapkan lebih dulu atau layarnya dihapus | Perlu `git log --diff-filter=D`, atau ingatan Anda |
| C5 | Apakah anon key di `eas.json` aman dipublikasikan | Bergantung pada apakah setiap tabel benar-benar tertutup RLS — sebagian sudah dijawab 05, sisanya keputusan Anda |

### 3.2 Tiga penanda yang bukan butir terbuka

Agar hitungannya jujur: `grep -c "BELUM TERVERIFIKASI"` atas seluruh dokumen
mengembalikan **28**, bukan 25. Tiga selisihnya bukan butir terbuka:

| Lokasi | Sebabnya |
| --- | --- |
| `01-inventaris.md:10` | Contoh notasi di bagian metode, bukan penanda |
| `01-inventaris.md:366` | Sel tabel `| Deno | [BELUM TERVERIFIKASI] |` yang merujuk butir C1 — sama dengan butir yang sudah dihitung |
| `02-kamus-data.md:1977` | **Kutipan** penanda Fase 1 yang justru sedang dicabut di §8.11 itu |

Satu penanda sudah **dicabut** selama konsolidasi ini: `01-inventaris.md` §8.1
tentang alasan pembatalan larangan barcode. Fase 2 menemukan jawabannya di
`supabase/migrations/20260730080000_asset_tags.sql:4-9`, tetapi Fase 1 tidak
pernah diperbarui. Sekarang sudah.

---

## 4. Pertentangan antara kode dan dokumentasi

Tujuh, seluruhnya dari `10-riwayat-celah.md` §6 dan `01-inventaris.md` §8.

| # | Pertentangan | Dokumen | Kode | Dijelaskan di kode? |
| ---: | --- | --- | --- | :-: |
| 1 | Larangan pemindaian barcode | `README.md:15` | `app/(tabs)/scan.tsx:190-195` + seluruh modul label | **Ya** — perubahan requirement klien 2026-07-30 |
| 2 | Klaim setiap tabel punya `created_at`/`updated_at` | `DATABASE.md:3-4` | 25 dari 33 punya `created_at`; 14 punya `updated_at` | Tidak |
| 3 | `return_asset()` memindahkan aset ke "lokasi gudang" | `DATABASE.md §11` | Aset tetap di tempatnya | **Ya** — kolom gudang tidak ada di skema |
| 4 | PDF dibuat dengan Puppeteer atau `pdf-lib` | `README.md:29` | Penulis PDF buatan sendiri, nol dependensi | **Ya** |
| 5 | Impor memakai SheetJS dan `.xlsx` | `README.md:30`, `:395` | Parser CSV buatan sendiri, di perangkat | **Ya** |
| 6 | Target PostgreSQL "15+" | `DATABASE.md:3` | Lokal 15, produksi 17.6.1 | Tidak |
| 7 | Aturan kerja #3: jangan pernah menulis `audit_log` | aturan proyek | 4 RPC menulis langsung | **Ya** — trigger tidak dapat tahu *mengapa* |

**Lima dari tujuh dijelaskan di dalam kode itu sendiri.** Ini pola yang
konsisten: ketika kode menyimpang dari rencana, alasannya ditulis di header
migrasi. Yang tertinggal adalah dokumen rencananya.

### 4.1 Ketidakcocokan internal — kode vs kode

Bukan kode vs dokumen, tetapi dua bagian kode yang menyatakan aturan yang sama
secara berbeda. Kelas ini lebih berbahaya karena tidak ada dokumen yang dapat
disalahkan.

| # | Ketidakcocokan | Otoritatif | Salinan yang tertinggal |
| ---: | --- | --- | --- |
| 1 | Gerbang `complete` BAST | `sign_bast()` memperhitungkan `receiver_2` | `generate-bast-pdf/index.ts:531` tidak |
| 2 | Visibilitas BAST | `can_see_bast_row()` untuk tabel | `can_see_bast_file()` untuk `storage.objects` — aturan sama ditulis dua kali |
| 3 | Keunikan nomor seri | `assets.serial_number unique` (case-sensitive) | `create_asset()` memakai `lower()` — RPC lebih ketat |
| 4 | Izin hapus dokumen | Policy `documents_delete`: super_admin + corporate_it | `delete_document()`: super_admin saja |

Nomor 1 adalah satu-satunya yang berakibat nyata: BAST dua pemegang dapat
difinalisasi dengan blok tanda tangan ketiga kosong, lewat pemanggilan langsung
Edge Function. Jalur aplikasi aman.

---

## 5. Sepuluh pertanyaan penguji yang belum terjawab dokumen mana pun

Bagian ini bukan ringkasan. Ini daftar yang saya susun dengan bertanya: apa
yang akan ditanyakan seseorang yang membaca sistem ini dengan curiga, dan
tidak akan menemukan jawabannya di sepuluh dokumen itu.

### 1. Mengapa memilih RLS PostgreSQL alih-alih otorisasi di lapisan aplikasi?

**Mengapa belum terjawab.** Sepuluh dokumen menjelaskan **bagaimana** RLS bekerja di sistem ini, tetapi tidak satu pun membandingkannya dengan alternatif. Penguji akan menanyakan trade-off: kinerja, kemudahan diuji, dan portabilitas bila kelak pindah dari Supabase.

**Siapa yang dapat menjawab.** Bab pembahasan. Bahannya sudah ada di `05-keamanan.md` §5 — bukti bahwa gerbang UI dan RLS dapat menyimpang justru argumen terkuat untuk menaruh otorisasi di database.

### 2. Berapa pengguna dan berapa aset yang sudah diuji? Bagaimana kinerjanya pada skala itu?

**Mengapa belum terjawab.** Tidak ada satu pun angka kinerja di seluruh dokumentasi. `search_assets()` memakai GIN trigram dan `assets_category_idx` ditambahkan justru karena masalah kinerja — tetapi tidak ada pengukuran sebelum dan sesudah.

**Siapa yang dapat menjawab.** Perlu pengukuran baru. Data nyata ada: 527 pegawai dari ekspor Odoo.

### 3. Mengapa kode aset boleh dipakai ulang setelah aset dihapus, sedangkan nomor BAST tidak?

**Mengapa belum terjawab.** `07-alur-proses.md` alur 2 menemukan dan menjelaskan perbedaannya, tetapi tidak menjawab apakah itu **disengaja**. Kode aset memakai `max()+1`, nomor BAST memakai penghitung atomik.

**Siapa yang dapat menjawab.** Anda. Bila tidak disengaja, ini cacat yang layak diperbaiki sebelum sidang.

### 4. Apa yang terjadi kalau dua orang menugaskan aset yang sama pada saat bersamaan?

**Mengapa belum terjawab.** `07-alur-proses.md` alur 3 menyatakan yang kedua akan gagal dengan 23505 dan menandainya belum terverifikasi. Penguji yang paham database akan menanyakan ini.

**Siapa yang dapat menjawab.** Uji konkurensi terhadap stack lokal — butir A10.

### 5. Mengapa 29 dari 171 aturan bisnis tidak diuji sama sekali?

**Mengapa belum terjawab.** `09-pengujian.md` §4 mendaftarnya dengan jujur tetapi sengaja mengosongkan kolom "mengapa penting". Penguji akan meminta pembenaran atau rencana.

**Siapa yang dapat menjawab.** Anda. Minimal: nyatakan mana yang akan diuji dan mana yang diterima sebagai risiko.

### 6. Bagaimana sistem berperilaku ketika jaringan putus di tengah penandatanganan?

**Mengapa belum terjawab.** Alur 6 menjelaskan bahwa Edge Function melintasi batas transaksi dan dapat meninggalkan berkas yatim. Tetapi tidak ada dokumen yang membahas **perilaku klien** saat offline — padahal `@react-native-community/netinfo` ada di dependency dan ada komponen `OfflineBanner`.

**Siapa yang dapat menjawab.** `src/components/chrome/OfflineBanner.tsx` **disebut** di `01-inventaris.md` (daftar isi folder) dan `06-katalog-layar.md` (komponen yang dipakai layar), tetapi **perilakunya tidak pernah ditelusuri** — tidak ada dokumen yang menjelaskan apa yang terjadi pada antrean mutasi saat koneksi putus. Perlu satu penelusuran.

### 7. Mengapa scope pengguna disimpan di database, bukan di perangkat?

**Mengapa belum terjawab.** `01-inventaris.md` mengutip alasannya dari komentar kode ("scope is global and read by every query"), tetapi tidak membahas konsekuensinya: satu round trip tambahan saat login, dan scope yang tidak dapat diubah offline.

**Siapa yang dapat menjawab.** Bab pembahasan.

### 8. Apa rencana migrasi data dari sistem lama?

**Mengapa belum terjawab.** Ada dua importir dan `20260824090200_import_location.sql` menyebut ekspor Odoo nyata. Tetapi tidak ada dokumen yang menjelaskan **strategi migrasi keseluruhan** — hanya mekanisme impornya.

**Siapa yang dapat menjawab.** Anda. Ini pertanyaan BAB IV yang hampir pasti muncul.

### 9. Bagaimana memastikan BAST digital sah secara hukum?

**Mengapa belum terjawab.** Sistem menyimpan tanda tangan sebagai lintasan pena, append-only, dengan audit. Tidak ada dokumen yang membahas apakah itu memenuhi syarat hukum Indonesia untuk dokumen serah terima aset.

**Siapa yang dapat menjawab.** Di luar jangkauan pembacaan kode. Perlu rujukan regulasi — dan ini justru pertanyaan yang paling mungkin ditanyakan penguji untuk sistem bernama E-BAST.

### 10. Mengapa tidak ada pengujian antarmuka sama sekali?

**Mengapa belum terjawab.** Dua puluh tiga suite seluruhnya menguji database lewat token sungguhan. Nol pengujian komponen, nol pengujian end-to-end. `06-katalog-layar.md` menemukan `/transfer` tanpa gerbang izin — cacat yang akan tertangkap pengujian UI paling sederhana.

**Siapa yang dapat menjawab.** Anda. Jawaban yang jujur mungkin: waktu terbatas, dan lapisan database dinilai lebih berisiko. Itu pembenaran yang sah bila dinyatakan.

---

## 6. Catatan penutup tentang dokumen-dokumen ini

Sepuluh dokumen ini adalah **bahan mentah**, bukan isi bab. Menyalinnya
bulat-bulat akan terbaca seperti lampiran teknis.

| Masuk badan bab | Masuk lampiran |
| --- | --- |
| ERD (`03`), diagram alur (`07`), matriks hak akses (`05` §3), tabel aturan bisnis (`08`) | Kamus data (`02`), katalog RPC (`04`), katalog layar (`06`), katalog pengujian (`09` §2) |

Tiga hal yang membedakan dokumentasi ini dari daftar isi teknis biasa, dan
layak dipertahankan saat ditulis ulang menjadi bab:

1. **Setiap angka punya perintah hitungnya.** Penguji yang meminta Anda
   membuktikan sebuah angka dapat dilayani di tempat.
2. **Setiap pertentangan dilaporkan, tidak diselaraskan.** Termasuk yang
   membuat sistem tampak kurang rapi.
3. **Dua puluh lima hal dinyatakan belum terverifikasi.** Satu baris "belum
   terverifikasi" lebih berharga daripada satu kalimat mulus yang salah,
   karena yang salah akan ditanyakan penguji.

Selama pengerjaan sepuluh fase ini, **enam klaim saya sendiri terbukti salah
dan dikoreksi** — jumlah tabel 26 yang ternyata 33, jumlah trigger
`forbid_mutation` 8 yang ternyata 10, `void_tag` yang saya kira tidak diuji
padahal diuji, BR-910 yang saya kira lubang padahal berlapis, jumlah komponen
38 yang ternyata 25, dan klaim bahwa kelima ERD muat A4 padahal tidak satu pun
muat. Semua koreksi itu ditulis di tempatnya, bukan dihapus.
