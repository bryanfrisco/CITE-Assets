# 01 — Inventaris Repositori CITE Assets

Dokumen ini adalah hasil Fase 1 (inventaris) dari ekstraksi dokumentasi teknis
repositori CITE Assets untuk keperluan skripsi Teknik Informatika.

**Tanggal ekstraksi:** 2026-08-31
**Metode:** setiap angka dihitung ulang dengan perintah shell yang dituliskan di
bawah angkanya. Setiap klaim non-numerik merujuk ke berkas dan baris. Hal yang
tidak dapat diverifikasi dari isi repositori ditandai
`[BELUM TERVERIFIKASI — alasan]`.

**Batasan yang berlaku untuk seluruh dokumen:** tidak ada instance PostgreSQL
yang berjalan selama ekstraksi (`psql` dan `supabase` CLI tidak tersedia pada
PATH mesin ini). Karena itu seluruh angka tentang database dihitung dari DDL di
`supabase/migrations/`, **bukan** dari katalog sistem (`pg_class`, `pg_proc`).
Implikasinya disebutkan di tempat yang relevan.

---

## 1. Identitas revisi

| Butir | Nilai |
| --- | --- |
| Commit hash (HEAD) | `cd0d9f34199d982e7add1cdadde68d6205904a86` |
| Tanggal commit | 2026-08-26 10:10:47 +0700 (WIB) |
| Judul commit | "Search inside every picker, not just the assign wizard" |
| Author | Bryan |
| Branch | `main` |

Perintah:

```sh
git rev-parse HEAD
git log -1 --format='%H%n%cI%n%an%n%s'
git branch --show-current
```

### 1.1 Working tree TIDAK bersih pada saat ekstraksi

Ini penting untuk reproduksibilitas skripsi: angka di dokumen ini dihitung dari
**working tree**, bukan dari commit `cd0d9f3`. Berkas berikut berbeda dari HEAD:

```
 M .gitignore
 M app/(tabs)/audit.tsx
 M package.json
 M pnpm-lock.yaml
 M src/api/audit.ts
?? .env.local-backup
?? supabase/migrations/20260831090000_audit_targets.sql
```

Perintah: `git status --porcelain`

Konsekuensi yang sudah dipetakan:

- `supabase/migrations/20260831090000_audit_targets.sql` **belum di-commit**.
  Berkas ini ikut terhitung dalam seluruh angka SQL di dokumen ini. Angka
  migrasi versi tracked-only adalah 60, versi working tree adalah 61 (lihat
  §6.2).
- `.env.local-backup` **tidak tercakup oleh `.gitignore`**. Pola yang ada hanya
  `.env` dan `.env.local` (`.gitignore:18-19`), bukan `.env.local*`. Berkas ini
  saat ini untracked, sehingga sebuah `git add .` akan memasukkannya ke
  repositori. Isinya tidak dibuka dan tidak dikutip di sini.

---

## 2. Struktur folder (kedalaman 3)

```
CITE Assets Prototype/
├── .github/
│   └── workflows/
├── app/
│   └── (tabs)/
│       ├── accessory/
│       ├── asset/
│       └── bast/
├── assets/
├── scripts/
├── src/
│   ├── api/
│   ├── auth/
│   ├── components/
│   │   ├── charts/
│   │   ├── chrome/
│   │   └── ui/
│   ├── lib/
│   ├── store/
│   └── theme/
├── supabase/
│   ├── functions/
│   │   ├── generate-bast-pdf/
│   │   └── manage-account/
│   ├── migrations/
│   └── snippets/
└── tests/
```

Perintah:

```sh
find . -maxdepth 3 -type d \
  -not -path './node_modules*' -not -path './.git*' -not -path './.expo*' | sort
```

Dua folder yang muncul di disk tetapi sengaja tidak ditampilkan di atas —
`supabase/.temp/` dan `supabase/.branches/` — adalah state lokal Supabase CLI
dan di-ignore secara eksplisit (`.gitignore:22-23`). `supabase/snippets/` ada
tetapi kosong (`ls -1 supabase/snippets/` tidak mengeluarkan apa pun).

### 2.1 Peran tiap folder utama

| Folder | Peran | Rujukan |
| --- | --- | --- |
| `app/` | Pohon rute expo-router. Berkas `.tsx` di sini **adalah** rute — nama berkas menjadi path URL. `app/_layout.tsx` memasang provider dan route guard autentikasi. | `app/_layout.tsx:1-6` |
| `app/(tabs)/` | Route group; tanda kurung berarti segmen ini tidak masuk ke URL. `_layout.tsx` di dalamnya merender chrome aplikasi (header, scope dropdown, bottom nav mengambang + FAB, quick-action sheet) secara manual, bukan lewat komponen `Tabs` expo-router. | `app/(tabs)/_layout.tsx:1-7` |
| `src/api/` | Satu-satunya lapisan yang berbicara ke Supabase. Seluruh operasi tulis lewat sini atau lewat RPC — tidak ada penulisan multi-tabel langsung dari client. | `src/api/session.ts:1-7` |
| `src/auth/` | Matriks permission per role (Super Admin, Corporate IT, Site IT, Viewer) dan provider sesi. Matriksnya disalin dari `IMPLEMENTATION_PLAN.md` dan ditulis sebagai tabel di komentar berkas. | `src/auth/permissions.ts:1-13` |
| `src/components/ui/` | Pustaka komponen presentasional generik (Screen, Card, Badge, Chip, Input, BottomSheet, SignaturePad, dll.), diekspor lewat satu `index.ts`. | `src/components/ui/index.ts:1-14` |
| `src/components/chrome/` | Komponen kerangka aplikasi yang tidak generik: AppHeader, BottomNav, ScopeDropdown, ToastHost, OfflineBanner, QuickActionSheet, Avatar. | `ls -1 src/components/chrome` |
| `src/components/charts/` | Dua komponen grafik saja: `Donut.tsx` dan `Bars.tsx`. | `ls -1 src/components/charts` |
| `src/lib/` | Utilitas tanpa dependensi UI: client Supabase, parser CSV, generator Code 128, output label, tanggal, tanda tangan, queryClient, hook keyboard inset. | `src/lib/supabase.ts:1-10` |
| `src/store/` | Tiga store Zustand: scope, sesi, dan UI. Store scope diberi catatan tegas bahwa ia adalah **filter, bukan security boundary** — RLS yang membatasi. | `src/store/useScopeStore.ts:1-11` |
| `src/theme/` | Design token, tipografi, layout, motion, font, dan ThemeProvider; diekspor lewat satu barrel `index.ts`. | `src/theme/index.ts:1-9` |
| `supabase/migrations/` | Seluruh skema, RPC, trigger, RLS policy dan grant, sebagai migrasi berurutan dan aditif. | `supabase/config.toml:2-3` |
| `supabase/functions/` | Dua Edge Function Deno: `generate-bast-pdf` dan `manage-account`. | `ls -1 supabase/functions` |
| `tests/` | Suite integrasi Node murni (`.mjs`) yang dijalankan lewat `npm run test:*`; sebagian besar menuntut stack Supabase lokal yang benar-benar berjalan. | `tests/_guard.mjs:1-11` |
| `scripts/` | Utilitas developer sekali jalan: bootstrap admin, build ikon aplikasi, build logo BAST, cari LAN IP, reset register. | `ls -1 scripts` |
| `.github/workflows/` | Satu workflow CI (`ci.yml`) dengan dua job: `check` (lint/typecheck/tes offline) dan `db` (suite yang butuh database, hanya terjadwal atau manual). | `.github/workflows/ci.yml:31-62` |
| `assets/` | Aset statis (ikon, logo) yang dirujuk `app.json`. | `app.json:7,21,29,39` |

---

## 3. Statistik baris kode

Alat: **cloc v1.72**, dipanggil lewat `npx --yes cloc@2.02`. Ekstensi `.mjs`
tidak dikenali cloc 1.72 secara bawaan, sehingga dipetakan eksplisit ke
JavaScript dengan `--force-lang=JavaScript,mjs`. Tanpa flag itu folder `tests/`
dan `scripts/` terhitung nol berkas.

### 3.1 Ringkasan per bahasa (folder kode aplikasi)

| Bahasa | Berkas | Kosong | Komentar | Kode |
| --- | ---: | ---: | ---: | ---: |
| TypeScript | 104 | 1.932 | 2.788 | 20.136 |
| SQL | 61 | 1.227 | 3.039 | 9.443 |
| JavaScript (`.mjs`) | 30 | 980 | 882 | 6.607 |
| **Total** | **195** | **4.139** | **6.709** | **36.186** |

Perintah:

```sh
npx --yes cloc@2.02 src app supabase/migrations supabase/functions tests scripts \
  --force-lang=JavaScript,mjs --quiet
```

### 3.2 Rincian per folder

| Folder | Bahasa | Berkas | Kosong | Komentar | Kode |
| --- | --- | ---: | ---: | ---: | ---: |
| `app/` | TypeScript | 31 | 1.018 | 876 | 11.931 |
| `src/` | TypeScript | 68 | 781 | 1.672 | 6.176 |
| `supabase/migrations/` | SQL | 61 | 1.227 | 3.039 | 9.443 |
| `supabase/functions/` | TypeScript | 5 | 133 | 240 | 2.029 |
| `tests/` | JavaScript | 25 | 897 | 733 | 6.123 |
| `scripts/` | JavaScript | 5 | 83 | 149 | 484 |

Perintah:

```sh
for d in src app supabase/migrations supabase/functions tests scripts; do
  echo "== $d =="
  npx --yes cloc@2.02 "$d" --force-lang=JavaScript,mjs --quiet
done
```

### 3.3 Rincian sub-folder `src/`

| Sub-folder | Berkas | Kosong | Komentar | Kode |
| --- | ---: | ---: | ---: | ---: |
| `src/api/` | 16 | 264 | 665 | 2.257 |
| `src/components/` | 27 | 260 | 347 | 2.306 |
| `src/lib/` | 8 | 120 | 362 | 762 |
| `src/theme/` | 9 | 72 | 193 | 552 |
| `src/auth/` | 5 | 27 | 56 | 171 |
| `src/store/` | 3 | 38 | 49 | 128 |

Jumlah berkas: 16 + 27 + 8 + 9 + 5 + 3 = 68, cocok dengan total `src/` di §3.2.
Tidak ada berkas `.ts`/`.tsx` yang berada langsung di akar `src/`
(`ls -1 src/*.ts src/*.tsx` mengembalikan galat "No such file").

### 3.4 Catatan atas komposisi kode

Tiga hal yang layak disebut dalam skripsi karena tidak biasa:

1. **Rasio komentar terhadap kode pada SQL adalah 3.039 : 9.443 ≈ 32%.** Ini
   jauh di atas rasio TypeScript (2.788 : 20.136 ≈ 14%). Penyebabnya adalah
   kebiasaan menulis alasan desain di header migrasi, bukan sekadar apa yang
   dilakukan migrasi.
2. **`app/` lebih besar dari `src/`** (11.931 vs 6.176 baris kode). Logika
   layar berada di berkas rute, bukan diekstrak ke `src/`.
3. **`tests/` (6.123 baris) hampir sebesar seluruh `src/` (6.176 baris).**

### 3.5 Berkas yang sengaja TIDAK dihitung sebagai kode aplikasi

Tiga berkas besar di akar repositori bukan kode aplikasi dan tidak diimpor dari
mana pun (`grep -rn "support\.js\|ios-frame" app src package.json babel.config.js`
tidak menghasilkan hasil):

- `support.js` (69 KB) — runtime hasil generate; baris pertamanya menyatakan
  `// GENERATED from dc-runtime/src/*.ts — do not edit.` (`support.js:1`).
- `ios-frame.jsx` (16 KB) — scaffold device frame iOS, ditandai
  `@ds-adherence-ignore` (`ios-frame.jsx:1-2`).
- `CITE Assets.dc.html` (123 KB) — halaman HTML mandiri (`<!DOCTYPE html>` pada
  baris 1), tidak diimpor berkas mana pun:
  `grep -rn "dc\.html" app/ src/ package.json app.json babel.config.js` tidak
  memberi hasil. Ia bukan bagian dari bundel aplikasi.

Jika ketiganya diikutkan, cloc atas seluruh repositori (tanpa `node_modules`,
`.git`, `.expo`, `.temp`, `.branches`) melaporkan 214 berkas / 49.942 baris
kode — angka itu juga memuat `pnpm-lock.yaml` (7.535 baris YAML) dan 6 berkas
Markdown (2.078 baris), sehingga tidak dipakai sebagai ukuran besar sistem.

Perintah:

```sh
npx --yes cloc@2.02 . \
  --exclude-dir=node_modules,.expo,.git,.temp,.branches \
  --force-lang=JavaScript,mjs --quiet
```

---

## 4. Dependency

Kolom "Specifier" diambil dari `package.json`; kolom "Terpasang" diambil dari
bagian `importers` di `pnpm-lock.yaml` (lockfileVersion 9.0, `pnpm-lock.yaml:1`).
Suffix peer-dependency yang panjang pada lockfile dipangkas — hanya nomor versi
paket itu sendiri yang ditulis.

Jumlah: **38 runtime + 10 development = 48 dependency langsung.**

Perintah:

```sh
node -e "const p=require('./package.json');\
console.log('dependencies:',Object.keys(p.dependencies).length);\
console.log('devDependencies:',Object.keys(p.devDependencies).length)"
```

### 4.1 Runtime (`dependencies`) — `package.json:46-85`

| # | Paket | Specifier | Terpasang |
| ---: | --- | --- | --- |
| 1 | `@expo-google-fonts/inter` | `^0.4.2` | 0.4.2 |
| 2 | `@expo/metro-runtime` | `~57.0.13` | 57.0.13 |
| 3 | `@react-native-async-storage/async-storage` | `2.2.0` | 2.2.0 |
| 4 | `@react-native-community/datetimepicker` | `9.1.0` | 9.1.0 |
| 5 | `@react-native-community/netinfo` | `12.0.1` | 12.0.1 |
| 6 | `@supabase/supabase-js` | `^2.111.0` | **2.112.0** |
| 7 | `@tanstack/react-query` | `^5.101.4` | 5.101.4 |
| 8 | `expo` | `^57.0.8` | **57.0.9** |
| 9 | `expo-blur` | `~57.0.2` | 57.0.2 |
| 10 | `expo-build-properties` | `~57.0.7` | **57.0.8** |
| 11 | `expo-camera` | `~57.0.3` | 57.0.3 |
| 12 | `expo-constants` | `~57.0.7` | **57.0.8** |
| 13 | `expo-document-picker` | `~57.0.1` | 57.0.1 |
| 14 | `expo-file-system` | `~57.0.1` | 57.0.1 |
| 15 | `expo-font` | `~57.0.1` | 57.0.1 |
| 16 | `expo-image-picker` | `~57.0.6` | **57.0.7** |
| 17 | `expo-linear-gradient` | `^57.0.1` | 57.0.1 |
| 18 | `expo-linking` | `~57.0.4` | 57.0.4 |
| 19 | `expo-print` | `~57.0.1` | 57.0.1 |
| 20 | `expo-router` | `~57.0.8` | **57.0.9** |
| 21 | `expo-secure-store` | `~57.0.1` | 57.0.1 |
| 22 | `expo-sharing` | `~57.0.8` | 57.0.8 |
| 23 | `expo-splash-screen` | `~57.0.5` | 57.0.5 |
| 24 | `expo-status-bar` | `~57.0.1` | 57.0.1 |
| 25 | `expo-system-ui` | `~57.0.1` | **57.0.2** |
| 26 | `lucide-react-native` | `^1.27.0` | **1.28.0** |
| 27 | `qrcode` | `^1.5.4` | 1.5.4 |
| 28 | `react` | `^19.2.3` | **19.2.8** |
| 29 | `react-dom` | `19.2.3` | 19.2.3 |
| 30 | `react-native` | `0.86.0` | 0.86.0 |
| 31 | `react-native-gesture-handler` | `~2.32.0` | 2.32.0 |
| 32 | `react-native-reanimated` | `4.5.0` | 4.5.0 |
| 33 | `react-native-safe-area-context` | `~5.7.0` | 5.7.0 |
| 34 | `react-native-screens` | `~4.26.0` | **4.26.2** |
| 35 | `react-native-svg` | `15.15.4` | 15.15.4 |
| 36 | `react-native-web` | `^0.21.2` | 0.21.2 |
| 37 | `react-native-worklets` | `0.10.0` | 0.10.0 |
| 38 | `zustand` | `^5.0.14` | 5.0.14 |

Versi yang **ditebalkan** adalah paket yang versi terpasangnya lebih tinggi dari
angka yang tertulis di `package.json` — akibat range `^`/`~`. Ada 11 paket
seperti itu. Ini relevan untuk skripsi: nomor di `package.json` bukan nomor yang
benar-benar dipakai saat aplikasi dibangun.

### 4.2 Development (`devDependencies`) — `package.json:86-97`

| # | Paket | Specifier | Terpasang |
| ---: | --- | --- | --- |
| 1 | `@types/qrcode` | `^1.5.6` | 1.5.6 |
| 2 | `@types/react` | `^19.2.17` | **19.2.18** |
| 3 | `babel-plugin-module-resolver` | `^5.0.3` | 5.0.3 |
| 4 | `eslint` | `^9.39.5` | 9.39.5 |
| 5 | `eslint-config-expo` | `^57.0.0` | **57.0.1** |
| 6 | `eslint-config-prettier` | `^10.1.8` | 10.1.8 |
| 7 | `eslint-plugin-prettier` | `^5.5.6` | 5.5.6 |
| 8 | `prettier` | `^3.9.6` | 3.9.6 |
| 9 | `supabase` | `^2.110.0` | **2.111.0** |
| 10 | `typescript` | `^6.0.3` | 6.0.3 |

### 4.3 Dependency Edge Function: nol

Kedua Edge Function tidak mengimpor satu pun paket eksternal. Seluruh baris
`import` di `supabase/functions/` hanya dua, dan keduanya relatif:

```
supabase/functions/generate-bast-pdf/index.ts:47  from './pdf.ts'
supabase/functions/generate-bast-pdf/index.ts:48  from './aspire-logo.ts'
```

Perintah:

```sh
grep -rnE "from ['\"](https?://|npm:|jsr:|node:)" supabase/functions/   # tidak ada hasil
grep -rn "^import" supabase/functions/
```

Tidak ada `deno.json`, `deno.jsonc`, maupun `import_map.json` di repositori.
Penulis PDF dibuat sendiri; alasannya ditulis di berkasnya:

> "Written by hand rather than pulled from a library because the document needs
> exactly five primitives … and a dependency-free function cold-starts faster
> and cannot drift." — `supabase/functions/generate-bast-pdf/pdf.ts:1-10`

Pola yang sama berlaku pada parser CSV di sisi client (`src/lib/csv.ts:1-13`)
dan pada generator Code 128 (`src/lib/barcode.ts`, dipakai oleh
`src/lib/labels.ts:35`).

### 4.4 Manajer paket

`.npmrc:9-10` menyetel `node-linker=hoisted` dan `shamefully-hoist=true`.
Alasannya ditulis pada `.npmrc:1-3`: Metro tidak memahami symlink store pnpm,
sehingga node_modules harus rata.

---

## 5. Versi toolchain

| Komponen | Versi | Sumber |
| --- | --- | --- |
| Node.js | 22 | `.github/workflows/ci.yml:44` dan `:72` (`node-version: 22`) |
| pnpm (deklarasi proyek) | 9.15.4 | `package.json:98` (`"packageManager": "pnpm@9.15.4"`) |
| pnpm (CI) | 9 (mayor saja) | `.github/workflows/ci.yml:39-40`, `:67-68` |
| Expo SDK | 57 | `package.json:54` (`"expo": "^57.0.8"`), terpasang 57.0.9 |
| React Native | 0.86.0 | `package.json:76`; lockfile juga 0.86.0 |
| React | 19.2.8 terpasang (specifier `^19.2.3`) | `package.json:74` |
| TypeScript | 6.0.3 | `package.json:96` (`^6.0.3`); lockfile 6.0.3 |
| PostgreSQL (lokal) | mayor 15 | `supabase/config.toml:17` (`major_version = 15`) |
| PostgreSQL (target dokumentasi) | "15+" | `DATABASE.md:3` |
| PostgreSQL (proyek hosted tertaut) | 17.6.1.147 | `supabase/.temp/postgres-version` — **berkas ini di-ignore** (`.gitignore:22`) |
| Supabase CLI | 2.111.0 terpasang (`^2.110.0`) | `package.json:95` |
| Deno | `[BELUM TERVERIFIKASI]` | lihat §5.2 |

### 5.1 Tidak ada penguncian versi Node di dalam repositori

`package.json` **tidak** memiliki field `engines`, dan tidak ada `.nvmrc`,
`.node-version`, maupun setelan `node` di `eas.json` atau `app.json`.

Perintah:

```sh
grep -n "engines\|nodeVersion\|node-version" package.json eas.json app.json
# hasil: tidak ada di package.json/eas.json/app.json
```

Node 22 hanya mengikat runner GitHub Actions. Mesin pengembangan yang dipakai
saat ekstraksi menjalankan **Node v25.2.1** dan **pnpm 9.15.9** (`node --version`,
`pnpm --version`) — keduanya berbeda dari yang dipakai CI dan dari
`packageManager`. Untuk skripsi, versi Node yang dapat dipertanggungjawabkan
adalah **22**, karena itulah satu-satunya angka yang tercatat di dalam
repositori.

### 5.2 Versi Deno tidak dapat ditentukan dari repositori

`[BELUM TERVERIFIKASI — tidak ada satu pun berkas di repositori yang menyebut
versi Deno.]` Yang dapat dipastikan hanyalah bahwa Edge Function berjalan di
atas runtime Deno, karena keduanya memanggil API global `Deno`:

- `supabase/functions/generate-bast-pdf/index.ts:502` — `Deno.serve(...)`
- `supabase/functions/generate-bast-pdf/index.ts:522-523` — `Deno.env.get(...)`
- `supabase/functions/manage-account/index.ts:137` — `Deno.serve(...)`
- `supabase/functions/manage-account/index.ts:161-168` — `Deno.env.get(...)`

Versi Deno ditentukan oleh image `edge_runtime` Supabase
(`supabase/config.toml:51-52` hanya menyalakannya tanpa menyebut versi). Untuk
mengisi angka ini diperlukan `supabase start` lalu memeriksa versi runtime pada
container — di luar jangkauan tugas baca-saja ini.

### 5.3 Versi komponen stack lokal (bukan bagian repositori)

Berkas berikut ada di disk tetapi di-ignore (`.gitignore:22`), sehingga **tidak
boleh dikutip sebagai properti sistem** — ia hanya mencatat apa yang kebetulan
terpasang di mesin ini: `supabase/.temp/gotrue-version` = `v2.195.0`,
`supabase/.temp/storage-version` = `v1.67.26`, `supabase/.temp/rest-version` =
`v14.5`, `supabase/.temp/cli-latest` = `v2.116.0`.

---

## 6. Angka-angka terverifikasi

### 6.1 Jumlah tabel: **33**

Dihitung dari pernyataan `create table` di seluruh migrasi. Terdapat 33
pernyataan `create table` dengan 33 nama berbeda, dan **tidak ada satu pun
`drop table`** di seluruh migrasi — sehingga jumlah pernyataan = jumlah tabel
akhir.

Perintah:

```sh
# jumlah pernyataan create table
grep -rciE "^[[:space:]]*create[[:space:]]+(or[[:space:]]+replace[[:space:]]+)?table" \
  supabase/migrations/*.sql | awk -F: '{s+=$2} END {print s}'      # -> 33

# jumlah nama tabel yang berbeda
grep -rniE "^[[:space:]]*create[[:space:]]+table" supabase/migrations/*.sql \
  | sed -E 's/.*[Tt]able[[:space:]]+//' | awk '{print $1}' | tr -d '(' \
  | sort -u | wc -l                                                # -> 33

# pemeriksaan: adakah tabel yang di-drop?
grep -rniE "drop[[:space:]]+table" supabase/migrations/*.sql       # -> tidak ada hasil
```

Daftar 33 tabel beserta migrasi yang membuatnya:

| Migrasi | Tabel |
| --- | --- |
| `20260729090000_init_schema.sql` (22 tabel) | `locations`, `departments`, `categories`, `brands`, `models`, `vendors`, `asset_statuses`, `asset_conditions`, `accounts`, `account_scope_preferences`, `assets`, `asset_code_counters`, `assignments`, `movements`, `bast_number_counters`, `bast`, `bast_versions`, `documents`, `maintenance_records`, `notifications`, `import_batches`, `audit_log` |
| `20260730080000_asset_tags.sql` | `asset_tags`, `tag_code_counters` |
| `20260731090000_ebast_signatures.sql` | `bast_signatories`, `bast_signatures` |
| `20260731140000_status_changes.sql` | `asset_status_changes` |
| `20260804140000_bast_documents_and_maintenance_status.sql` | `bast_items` |
| `20260811090000_asset_photo_gallery.sql` | `asset_photos` |
| `20260820090200_units_and_companies.sql` | `units`, `companies` |
| `20260821090200_accessories.sql` | `accessories`, `accessory_checkouts` |

Perintah untuk tabel ini:

```sh
grep -rniE "^[[:space:]]*create[[:space:]]+table" supabase/migrations/*.sql
```

**Kualifikasi:** angka 33 adalah jumlah tabel yang dibuat oleh DDL migrasi di
schema default. Tidak ada nama tabel yang berkualifikasi schema (semuanya nama
polos), dan tidak ada `create table` di `supabase/seed.sql`. Angka ini **tidak**
termasuk tabel yang dibuat oleh Supabase sendiri (schema `auth`, `storage`,
`realtime`). `[BELUM TERVERIFIKASI — tidak dibandingkan dengan pg_class karena
tidak ada database yang berjalan.]`

### 6.2 Jumlah berkas migrasi: **61** (working tree) / **60** (tracked)

```sh
ls -1 supabase/migrations/*.sql | wc -l        # -> 61
git ls-files supabase/migrations/ | wc -l      # -> 60
```

Selisih 1 adalah `20260831090000_audit_targets.sql`, yang belum di-commit
(lihat §1.1). Migrasi paling awal bertanggal 2026-07-29, paling akhir
2026-08-31.

### 6.3 Jumlah function database: **135 nama berbeda**, dari **191 pernyataan**

```sh
# total pernyataan create [or replace] function
grep -rciE "create[[:space:]]+(or[[:space:]]+replace[[:space:]]+)?function" \
  supabase/migrations/*.sql | awk -F: '{s+=$2} END {print s}'          # -> 191

# nama yang berbeda
grep -rhoiE "create[[:space:]]+(or[[:space:]]+replace[[:space:]]+)?function[[:space:]]+[a-z_]+" \
  supabase/migrations/*.sql | sed -E 's/.*[Ff]unction[[:space:]]+//' \
  | sort -u | wc -l                                                    # -> 135
```

Selisih 191 − 135 = 56 adalah pendefinisian ulang (`create or replace`) atas
function yang sama di migrasi berikutnya — jejak evolusi, bukan function baru.
Contoh terbanyak: `bast_detail` didefinisikan 5 kali, `import_accounts` dan
`asset_detail` masing-masing 4 kali.

Terdapat 20 pernyataan `drop function` di 12 migrasi, seluruhnya untuk membuang
**signature lama** sebelum mendefinisikan signature baru (perubahan parameter),
misalnya `supabase/migrations/20260821090900_account_company.sql:23-24`.

```sh
grep -rniE "drop[[:space:]]+function" supabase/migrations/*.sql | wc -l   # -> 20
```

**Kualifikasi penting:** 135 adalah jumlah **nama** function, bukan jumlah
entri `pg_proc`. Karena PostgreSQL mengizinkan overloading, satu nama bisa
memiliki lebih dari satu signature yang hidup berdampingan bila `drop function`
signature lama terlewat. `[BELUM TERVERIFIKASI — jumlah entri pg_proc yang
sesungguhnya tidak dapat dihitung tanpa database yang berjalan; 135 adalah
batas bawah.]`

### 6.4 Jumlah RPC yang benar-benar dipanggil dari `src/`: **87**

```sh
grep -rhoE "\.rpc\([[:space:]]*'[a-zA-Z0-9_]+'" src/ \
  | sed -E "s/.*'(.*)'/\1/" | sort -u | wc -l      # -> 87 (nama berbeda)

grep -rhoE "\.rpc\(" src/ | wc -l                  # -> 87 (total pemanggilan)
```

Kedua angka sama: **setiap RPC dipanggil tepat satu kali** dari seluruh `src/`.
Tidak ada satu pun `.rpc(` di dalam `app/`:

```sh
grep -rnE "\.rpc\(" app/                            # -> tidak ada hasil
```

Ini adalah bukti terukur bahwa aturan "semua akses database lewat `src/api/`"
benar-benar dipegang, bukan sekadar konvensi tertulis.

Sebaran per berkas (`grep -rcE "\.rpc\(" src/ | grep -v ':0$'`):

| Berkas | RPC | Berkas | RPC |
| --- | ---: | --- | ---: |
| `src/api/assets.ts` | 14 | `src/api/notifications.ts` | 6 |
| `src/api/bast.ts` | 11 | `src/api/accounts.ts` | 5 |
| `src/api/tags.ts` | 10 | `src/api/maintenance.ts` | 4 |
| `src/api/accessories.ts` | 8 | `src/api/imports.ts` | 3 |
| `src/api/assignments.ts` | 7 | `src/api/reports.ts` | 3 |
| `src/api/masterData.ts` | 6 | `src/api/units.ts` | 3 |
| | | `src/api/audit.ts` | 2 |
| | | `src/api/documents.ts` | 2 |
| | | `src/api/session.ts` | 2 |
| | | `src/api/dashboard.ts` | 1 |

Total: 14+11+10+8+7+6+6+5+4+3+3+3+2+2+2+1 = 87.

#### 6.4.1 Silang-periksa: setiap RPC yang dipanggil benar-benar ada

```sh
grep -rhoE "\.rpc\([[:space:]]*'[a-zA-Z0-9_]+'" src/ \
  | sed -E "s/.*'(.*)'/\1/" | sort -u > /tmp/rpc_called.txt
grep -rhoiE "create[[:space:]]+(or[[:space:]]+replace[[:space:]]+)?function[[:space:]]+[a-z_]+" \
  supabase/migrations/*.sql | sed -E 's/.*[Ff]unction[[:space:]]+//' \
  | sort -u > /tmp/fn_defined.txt
comm -23 /tmp/rpc_called.txt /tmp/fn_defined.txt     # dipanggil tapi tak terdefinisi
```

Hasil: **kosong.** Tidak ada RPC yang dipanggil client tanpa definisi di
migrasi. Ini temuan positif yang layak dikutip.

#### 6.4.2 Function yang tidak pernah dipanggil dari `src/`: **48**

```sh
comm -13 /tmp/rpc_called.txt /tmp/fn_defined.txt | wc -l   # -> 48
```

87 + 48 = 135, konsisten dengan §6.3. Ke-48 ini **bukan** kode mati; dari
namanya mereka terbagi menjadi beberapa kelompok yang memang tidak dipanggil
client:

- **Trigger function** — `audit_row`, `forbid_mutation`, `set_updated_at`,
  `sync_asset_cover`, `sync_asset_maintenance_status`,
  `validate_signature_strokes`
- **Helper RLS / security** — `my_role`, `my_account_id`, `my_location_ids`,
  `can_see_asset`, `can_see_bast_row`, `can_see_bast_file`, `can_write_assets`,
  `assert_can_manage_accounts`, `assert_tag_location`
- **Helper storage policy** — `storage_asset_id`, `storage_bast_asset_id`,
  `storage_bast_location_id`
- **Generator penomoran internal** — `next_asset_code`, `next_bast_number`,
  `next_tag_code`, `next_in_asset_prefix`
- **Job terjadwal / notifikasi** — `run_daily_notifications`,
  `notify_maintenance_due`, `notify_warranty_expiring`, `notify_weekly_backup`,
  `notify_recipients`
- **Utilitas bahasa Indonesia** — `terbilang`, `terbilang_kapital`,
  `indonesian_date_words`, `indonesian_long_date`, `indonesian_short_date`
- **Sisanya** — helper import (`import_date`, `import_lookup`), helper master
  (`master_table`, `master_label`, `master_assert_entity`, `master_usage`),
  serta beberapa signature lama yang tergantikan (`maintenance_list`,
  `open_maintenance`, `update_maintenance`).

`[BELUM TERVERIFIKASI — pengelompokan di atas disusun dari nama function dan
belum dikonfirmasi dengan membaca badan tiap function. Verifikasi per-function
dijadwalkan untuk fase berikutnya.]`

### 6.5 Jumlah layar (rute expo-router): **29**

```sh
find app -name '*.tsx' | wc -l                        # -> 31 (seluruh berkas)
find app -name '_layout.tsx'                          # -> 2 layout
find app -name '*.tsx' -not -name '_layout.tsx' | wc -l   # -> 29
```

Dua berkas yang dikurangkan adalah `app/_layout.tsx` dan
`app/(tabs)/_layout.tsx`; keduanya layout, bukan layar.

**Silang-periksa independen** dengan tipe rute yang di-generate expo-router
(`typedRoutes` aktif — `app.json:62-64`):

```sh
grep -oE "\`/[^\`]*\`" .expo/types/router.d.ts | grep -v '\${' | sort -u
```

Menghasilkan 30 path literal: 29 rute di atas ditambah `/_sitemap`, yang
di-generate expo-router sendiri dan tidak berkorespondensi dengan berkas mana
pun. 30 − 1 = **29**, cocok.

Tiga di antaranya rute dinamis: `app/(tabs)/accessory/[id].tsx`,
`app/(tabs)/asset/[code].tsx`, `app/(tabs)/bast/[id].tsx`.

Daftar 29 layar: `/` (dashboard), `/accessories`, `/accessory-edit`,
`/accessory/[id]`, `/account-edit`, `/accounts`, `/add-asset`, `/asset/[code]`,
`/asset/status`, `/assets`, `/assign`, `/audit`, `/bast`, `/bast/[id]`,
`/bast/sign`, `/import`, `/import-employees`, `/labels`, `/maintenance`,
`/maintenance-log`, `/master`, `/master-usage`, `/more`, `/notifications`,
`/reports`, `/scan`, `/settings`, `/sign-in`, `/transfer`.

### 6.6 Jumlah berkas test: **23 suite** (dari 25 berkas `.mjs`)

```sh
ls -1 tests/*.mjs | wc -l              # -> 25
ls -1 tests/_*.mjs                     # -> tests/_guard.mjs, tests/_ts.mjs
ls -1 tests/*.mjs | grep -v '/_' | wc -l   # -> 23
```

Dua berkas berawalan garis bawah adalah helper, bukan suite:

- `tests/_guard.mjs` — menolak menjalankan suite terhadap apa pun yang bukan
  stack lokal; regex-nya di `tests/_guard.mjs:13`, dan pintu darurat
  `ALLOW_NON_LOCAL_TESTS=yes-i-mean-it` di `tests/_guard.mjs:17-20`.
- `tests/_ts.mjs` — mengompilasi satu berkas `.ts` agar suite `.mjs` dapat
  menguji parser CSV yang asli, bukan salinannya (`tests/_ts.mjs:1-11`).

**Silang-periksa dengan `package.json`:**

```sh
grep -oE '"test:[a-z0-9-]+":' package.json | sort -u | wc -l   # -> 23 (didefinisikan)
grep -oE 'npm run test:[a-z0-9-]+' package.json | sort -u | wc -l  # -> 23 (dirantai)
```

23 berkas suite = 23 script `test:*` = 23 script yang dirantai di `npm test`
(`package.json:28`). Tidak ada suite yatim maupun script yang menunjuk berkas
yang tidak ada.

**Catatan metodologi:** pola `[a-z-]+` yang lebih sempit menghasilkan 22 dan
salah, karena melewatkan `test:phase6` yang mengandung angka. Perintah yang
benar memakai `[a-z0-9-]+`.

Hanya **1 dari 23** suite yang berjalan pada setiap push, yaitu `test:barcode`
(`.github/workflows/ci.yml:55-56`); 22 sisanya butuh stack Supabase dan hanya
dijalankan terjadwal atau manual (`.github/workflows/ci.yml:58-62`).

### 6.7 Angka pendukung lain

| Besaran | Nilai | Perintah |
| --- | ---: | --- |
| Enum PostgreSQL | 12 | `grep -rhoiE "create type [a-z_]+ +as enum" supabase/migrations/*.sql \| wc -l` |
| Role pengguna | 4 | `supabase/migrations/20260729090000_init_schema.sql:20` |
| Jenis lokasi | 2 | `supabase/migrations/20260729090000_init_schema.sql:21` |
| Edge Function | 2 | `ls -1 supabase/functions` |
| Script npm | 38 | lihat perintah `node -e` di §4 |
| Dependency langsung | 48 | idem |

12 enum tersebut: `assignment_state`, `audit_action`, `bast_file_kind`,
`bast_kind`, `bast_signature_role`, `bast_status`, `document_kind`,
`location_kind`, `maintenance_state`, `notification_kind`, `tag_status`,
`user_role`.

Empat role: `'super_admin'`, `'corporate_it'`, `'site_it'`, `'viewer'`
(`supabase/migrations/20260729090000_init_schema.sql:20`).
Dua jenis lokasi: `'head_office'`, `'site'`
(`supabase/migrations/20260729090000_init_schema.sql:21`).

---

## 7. Perbedaan dari angka yang tercatat sebelumnya

Terdapat catatan angka bertanggal **2026-08-21** yang menyebut: *"29 screens,
26 tables, 56 migrations, 23 integration test suites, 4 roles, 2 locations."*
Perbandingannya dengan hasil hitung hari ini:

| Besaran | Tercatat (2026-08-21) | Terhitung (2026-08-31) | Status |
| --- | ---: | ---: | --- |
| Layar | 29 | 29 | Cocok |
| Suite test | 23 | 23 | Cocok |
| Role | 4 | 4 | Cocok |
| Jenis lokasi | 2 | 2 | Cocok |
| Migrasi | 56 | 61 | **Berbeda — bertambah** |
| Tabel | 26 | 33 | **Berbeda — angka lama keliru** |

### 7.1 Migrasi 56 → 61: bertambah secara wajar

Angka 56 **benar** pada 2026-08-21. Lima migrasi ditambahkan sesudahnya:

```sh
ls -1 supabase/migrations/ | awk '$0 < "20260822"' | wc -l   # -> 56
```

Kelimanya: `20260824090000_bast_storage_no_asset.sql`,
`20260824090100_signed_bast_without_asset.sql`,
`20260824090200_import_location.sql`,
`20260824090300_delete_account_and_void_bast.sql`, dan
`20260831090000_audit_targets.sql` (yang belum di-commit).
56 + 5 = 61. Tidak ada masalah di sini — hanya pekerjaan yang berlanjut.

### 7.2 Tabel 26 → 33: angka lama sudah usang pada saat dicatat

Ini perbedaan yang perlu diperhatikan, karena bukan sekadar pertambahan.
Menghitung ulang keadaan pada 2026-08-21:

```sh
grep -rniE "^[[:space:]]*create[[:space:]]+table" \
  $(ls -1 supabase/migrations/*.sql | awk '$0 < "supabase/migrations/20260822"') | wc -l
# -> 33
```

Pada 2026-08-21 jumlah tabel **sudah 33**, bukan 26. Migrasi terakhir yang
membuat tabel adalah `20260821090200_accessories.sql`; sesudahnya tidak ada satu
pun tabel baru. Artinya angka 33 sudah berlaku sejak 2026-08-21 dan tidak
berubah sampai hari ini.

Angka 26 sesuai dengan keadaan repositori yang jauh lebih awal — tepatnya
setelah `20260731090000_ebast_signatures.sql` dan sebelum
`20260731140000_status_changes.sql`, yaitu sekitar **31 Juli 2026**. Untuk
pembanding:

```sh
grep -rniE "^[[:space:]]*create[[:space:]]+table" \
  $(ls -1 supabase/migrations/*.sql | awk '$0 < "supabase/migrations/20260801"') | wc -l
# -> 27  (keadaan akhir 31 Juli)
```

Tujuh tabel yang hilang dari hitungan 26 adalah: `asset_status_changes`,
`bast_items`, `asset_photos`, `units`, `companies`, `accessories`,
`accessory_checkouts`.

**Kesimpulan untuk skripsi: jangan memakai angka 26.** Angka tabel yang benar
untuk revisi `cd0d9f3` dan untuk working tree saat ini adalah **33**. Bila di
naskah skripsi sudah tertulis 26, itu perlu dikoreksi — selisih 7 tabel adalah
hal yang mudah dicek penguji dengan membuka satu berkas migrasi.

---

## 8. Pertentangan antara kode dan dokumentasi

Enam pertentangan ditemukan. Semuanya dilaporkan apa adanya, tidak diselaraskan.

### 8.1 README melarang pemindaian barcode; aplikasi memindai barcode

`README.md:15` menyatakan:

> "The physical asset stickers already exist — **do NOT implement QR code or
> barcode scanning.**"

Kode melakukan sebaliknya, dan bukan setengah-setengah:

- `app/(tabs)/scan.tsx:18` — `import { CameraView, useCameraPermissions } from 'expo-camera';`
- `app/(tabs)/scan.tsx:190-195` — komponen `<CameraView>` dengan
  `barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'ean13', 'code39'] }}`
  dan handler `onBarcodeScanned`.
- `app/(tabs)/scan.tsx:1-13` — header berkas menjelaskan empat keadaan hasil
  pemindaian ("not ours", "untagged", "tagged", "out of scope") yang dijawab
  RPC `scan_tag()` dalam satu round trip.
- Rute `/scan` ada di antara 29 layar (§6.5).
- `expo-camera` adalah runtime dependency (`package.json:57`).
- `qrcode` adalah runtime dependency (`package.json:73`), dipakai di
  `src/lib/labels.ts:33`.
- Generator Code 128 ditulis sendiri di `src/lib/barcode.ts`, dipakai oleh
  `src/lib/labels.ts:35`, dan diuji oleh `tests/barcode.mjs:41`.
- Ada tabel `asset_tags` dan `tag_code_counters`
  (`supabase/migrations/20260730080000_asset_tags.sql`), 10 RPC di
  `src/api/tags.ts`, dan panduan tersendiri `PANDUAN-CETAK-LABEL.md`.

**Ini bukan penyimpangan kecil, melainkan satu subsistem penuh yang bertentangan
dengan larangan eksplisit di dokumen desain.** Untuk skripsi, ini justru bahan
yang baik bila ditulis sebagai *perubahan requirement* yang disadari dan
beralasan.

> **Penanda belum-terverifikasi di sini SUDAH DICABUT.** Saat Fase 1 ditulis
> saya belum menemukan alasan pembatalannya. Fase 2 menemukannya, tertulis
> lengkap di header migrasi yang membuat tabelnya —
> `supabase/migrations/20260730080000_asset_tags.sql:4-9`:
>
> *"REVERSES AN EARLIER CONSTRAINT, ON THE CLIENT'S INSTRUCTION … On 2026-07-30
> the client replaced that with the opposite: stickers are pre-printed BLANK."*
>
> Jadi ini perubahan requirement dari klien pada 2026-07-30, bertanggal dan
> beralasan. Yang tetap menjadi temuan adalah `README.md:15` tidak pernah
> diperbarui. Rinciannya di [02-kamus-data.md](02-kamus-data.md) §8.11.

### 8.2 README menetapkan pustaka PDF; implementasi tidak memakai pustaka

`README.md:29` merekomendasikan:

> "PDF generation | Edge Function rendering HTML → PDF (Puppeteer/Playwright or
> `pdf-lib`)"

Implementasi sebenarnya adalah penulis PDF 1.4 buatan sendiri tanpa dependensi
apa pun (`supabase/functions/generate-bast-pdf/pdf.ts:1-10`), dengan tabel lebar
karakter Helvetica di-inline (`pdf.ts:12-27`). Tidak ada Puppeteer, Playwright,
maupun pdf-lib di `package.json` atau di `supabase/functions/` (§4.3).

Berbeda dengan 8.1, di sini alasannya **tertulis** di berkasnya: dokumen hanya
butuh lima primitif dan function tanpa dependensi cold-start lebih cepat serta
tidak bisa hanyut versinya.

### 8.3 README menetapkan Excel/SheetJS; implementasi memakai CSV tanpa pustaka

`README.md:30` merekomendasikan:

> "Excel import/export | `xlsx` (SheetJS) in an Edge Function | validation must
> run server-side before insert"

dan `README.md:395` menyebut "Upload accepts .xlsx ≤ 5 MB."

Kenyataannya:

- Tidak ada dependency `xlsx` (`grep -n "xlsx\|SheetJS" package.json` tidak
  memberi hasil).
- Parser **CSV** ditulis sendiri di `src/lib/csv.ts:1-13`, dengan alasan
  tertulis: hanya tiga aturan CSV yang relevan, dan pustaka akan menambah
  ratusan kilobyte.
- Parsing terjadi **di perangkat**, bukan di Edge Function
  (`src/lib/csv.ts:9-12`).
- Validasi dan penulisan terjadi di dalam Postgres lewat RPC `import_assets`
  (`src/api/imports.ts:28`), bukan di Edge Function.

Bagian "validation must run server-side before insert" tetap terpenuhi — tetapi
oleh RPC PostgreSQL, bukan oleh Edge Function seperti yang tertulis. Catatan di
`src/lib/csv.ts:9-12` menyatakan pemisahan ini disengaja.

### 8.4 Versi PostgreSQL: 15 (lokal) vs 17.6.1.147 (hosted)

- `DATABASE.md:3` — "Target: **PostgreSQL 15+ / Supabase**"
- `supabase/config.toml:17` — `major_version = 15` (stack lokal, dipakai CI)
- `supabase/.temp/postgres-version` — `17.6.1.147` (proyek hosted tertaut)

Pengembangan dan CI berjalan di PostgreSQL 15, produksi di PostgreSQL 17. Klaim
"15+" tidak salah, tetapi **suite test tidak pernah dijalankan pada versi mayor
yang sama dengan produksi**. Berkas `.temp` di-ignore, jadi ketidaksesuaian ini
tidak terlihat oleh siapa pun yang hanya membaca repositori.

`[BELUM TERVERIFIKASI — apakah ada fitur SQL yang dipakai dan berperilaku
berbeda antara PostgreSQL 15 dan 17; pemeriksaan itu memerlukan menjalankan
suite pada kedua versi.]`

### 8.5 `.npmrc` menyebut sebuah script yang sudah tidak ada

`.npmrc:6-8` menyebut:

> "`scripts/eas-build-pre-install.mjs` — which deleted package-lock.json on the
> builder … — is no longer needed"

Berkas itu memang sudah tidak ada di `scripts/` (isinya hanya
`bootstrap-admin.mjs`, `build-app-icons.mjs`, `build-bast-logo.mjs`,
`lan-ip.mjs`, `reset-register.mjs`). Komentar ini konsisten dengan kenyataan —
dicatat di sini hanya agar tidak disalahbaca sebagai referensi yang rusak saat
pembaca lain menelusurinya.

### 8.6 Aturan kerja proyek juga menyebut larangan pemindaian

Catatan aturan kerja proyek memuat: *"the physical asset stickers already exist,
so **do not build QR or barcode scanning**."* Ini adalah pengulangan
`README.md:15` dan tertentang oleh bukti yang sama seperti di §8.1. Karena
larangan itu tercatat sebagai aturan proyek — bukan sekadar saran README —
pertentangannya perlu diselesaikan secara eksplisit di naskah skripsi:
apakah requirement berubah, dan atas dasar apa.

---

## 9. Ringkasan hal yang belum terverifikasi

Daftar ini dikumpulkan agar tidak tercecer, dan agar tiap butir dapat ditutup di
fase berikutnya.

1. **Versi Deno** — tidak ada berkas apa pun di repositori yang menyebutkannya
   (§5.2). Perlu `supabase start` lalu memeriksa container edge runtime.
2. **Jumlah entri `pg_proc` yang sesungguhnya** — 135 adalah jumlah *nama*
   function dan merupakan batas bawah; overloading dapat membuat angka
   sebenarnya lebih besar (§6.3). Perlu query ke database yang berjalan.
3. **Jumlah tabel menurut katalog sistem** — 33 dihitung dari DDL, belum
   dibandingkan dengan `pg_class` (§6.1).
4. **Pengelompokan 48 function yang tidak dipanggil client** — disusun dari nama,
   belum dari isi function (§6.4.2).
5. **Alasan dibatalkannya larangan pemindaian barcode** — tidak ditemukan
   tertulis di README, komentar kode, maupun pesan commit (§8.1).
6. **Dampak selisih versi PostgreSQL 15 vs 17** — belum diuji (§8.4).
7. **Angka pengujian pengguna** — tidak ada di repositori dan sengaja tidak
   dikarang.

---

## 10. Catatan keamanan yang ditemukan sambil jalan

Dicatat karena relevan untuk bab pembahasan, bukan sebagai temuan audit formal.

1. **`.env.local-backup` tidak ter-ignore** (§1.1). Pola `.gitignore:18-19`
   hanya mencakup `.env` dan `.env.local`. Isinya tidak dibuka.
2. **Anon key Supabase produksi tertulis di `eas.json:27` dan `eas.json:43`**,
   dan `eas.json` adalah berkas yang di-commit. Anon key memang dirancang untuk
   dipublikasikan dan dilindungi RLS, jadi ini belum tentu cacat — tetapi
   perlu disebut agar penguji tidak menemukannya lebih dulu.
   `[BELUM TERVERIFIKASI — apakah setiap tabel benar-benar tertutup RLS
   sehingga anon key aman dipublikasikan; verifikasi RLS dijadwalkan fase
   berikutnya.]`
3. **`.gitignore:33-45` secara sadar mengecualikan data nyata** — ekspor HR
   (`Hr Employee*.csv/xlsx`) dan data lisensi (`SOFTWARE LICENSING*.xlsx`),
   dengan alasan tertulis bahwa repositori bersifat publik dan berkas-berkas itu
   memuat nama lengkap, NIK, jabatan, email, telepon, serta sebagian password
   teks biasa. Kedua berkas tersebut **ada di direktori kerja** saat ekstraksi
   tetapi tidak ter-track. Isinya tidak dibuka.
