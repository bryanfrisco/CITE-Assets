# 08 — Aturan Bisnis CITE Assets

Hasil Fase 8: setiap aturan bisnis yang ditegakkan sistem, dari lapisan mana
pun ia berada.

**Tanggal:** 2026-09-01  
**Revisi:** working tree di atas commit `cd0d9f3`

---

## 0. Metode dan cakupan

### 0.1 Empat lapisan yang disisir

| Lapisan | Sumber | Cara mengumpulkan |
| --- | --- | --- |
| **DB — skema** | CHECK constraint, unique index (termasuk parsial) | Dibaca dari DDL migrasi |
| **DB — RPC** | `raise exception` di dalam badan fungsi | Diekstrak dari 135 definisi terakhir |
| **API** | `throw` di `src/api/*.ts` sebelum RPC dipanggil | Disisir seluruh berkas |
| **UI** | Validasi medan di layar | Disisir seluruh `app/**/*.tsx` |

### 0.2 Angka

| Lapisan | Jumlah aturan | Perintah |
| --- | ---: | --- |
| CHECK constraint | 12 | `grep -rn "check (" supabase/migrations/*.sql \| grep -v "with check"` |
| Unique index (di luar PK dan kolom `unique`) | 4 | `grep -rc 'create unique index' supabase/migrations/*.sql` |
| Pesan galat RPC unik | **171** | lihat §0.3 |
| Validasi lapisan API | 0 | `grep -rn 'throw new Error(' src/api/*.ts` — ketiganya hanya meneruskan galat, bukan aturan |
| Validasi lapisan UI | 11 | `grep -rnE "next\.[a-zA-Z]+ = ['\`]" app/ --include=*.tsx` |

Total 171 pesan galat unik muncul 257 kali di **63 fungsi**.
Selisihnya karena pesan seperti `Asset not found` dipakai belasan fungsi.

### 0.3 Perintah untuk menghitung ulang pesan galat RPC

```sh
# jumlah pemunculan
grep -rc "raise exception" supabase/migrations/*.sql | awk -F: '{s+=$2} END {print s}'

# pesan unik — perlu mengambil definisi TERAKHIR tiap fungsi lebih dulu,
# karena migrasi aditif memuat versi lama yang sudah tergantikan
```

> **Kualifikasi penting.** Angka pesan unik dihitung dari **definisi terakhir**
> tiap fungsi, bukan dari seluruh migrasi. `grep` polos atas
> `supabase/migrations/*.sql` akan ikut menghitung `raise exception` di dalam
> definisi yang sudah digantikan `create or replace`, dan hasilnya lebih besar.
> Metode pengambilan definisi terakhir dijelaskan di
> [04-katalog-rpc.md](04-katalog-rpc.md) §0.1.

### 0.4 Penomoran

`BR-001` sampai `BR-016` adalah aturan lapisan skema — yang paling kuat,
karena ditegakkan PostgreSQL sendiri dan tidak dapat dilewati jalur mana pun.
`BR-101` ke atas adalah aturan lapisan RPC, dikelompokkan per modul mengikuti
pembagian [04-katalog-rpc.md](04-katalog-rpc.md). `BR-901` ke atas adalah
aturan yang hanya hidup di UI.

---

## 1. Aturan lapisan skema (BR-001 – BR-016)

Ditegakkan PostgreSQL. **Tidak dapat ditembus jalur apa pun** — bukan lewat
RPC, bukan lewat PostgREST langsung, bukan lewat psql.

### 1.1 CHECK constraint

| Kode | Aturan | Tabel | Ekspresi | Rujukan |
| --- | --- | --- | --- | --- |
| BR-001 | Akun yang boleh login wajib punya role | `accounts` | `not can_login or role is not null` | `supabase/migrations/20260729090000_init_schema.sql:156` |
| BR-002 | Akhir garansi tidak boleh mendahului awalnya | `assets` | `warranty_end is null or warranty_start is null or warranty_end >= warranty_start` | `supabase/migrations/20260729090000_init_schema.sql:199` |
| BR-003 | Tanggal kembali tidak boleh mendahului tanggal serah | `assignments` | `returned_date is null or returned_date >= assigned_date` | `supabase/migrations/20260729090000_init_schema.sql:254` |
| BR-004 | Perpindahan tidak boleh dari dan ke lokasi yang sama | `movements` | `from_location is null or from_location <> to_location` | `supabase/migrations/20260729090000_init_schema.sql:274` |
| BR-005 | Stiker berstatus `tagged` jika dan hanya jika punya aset | `asset_tags` | `(status = 'tagged' and asset_id is not null) or (status <> 'tagged' and asset_id is null)` | `supabase/migrations/20260730080000_asset_tags.sql:47-50` |
| BR-006 | Stiker yang dibatalkan wajib punya alasan | `asset_tags` | `status <> 'void' or void_reason is not null` | `supabase/migrations/20260730080000_asset_tags.sql:51-53` |
| BR-007 | Goresan tanda tangan wajib berupa array JSON | `bast_signatures` | `jsonb_typeof(strokes) = 'array'` | `supabase/migrations/20260731090000_ebast_signatures.sql:106` |
| BR-008 | Jumlah stok perlengkapan tidak boleh negatif | `accessories` | `total_qty >= 0` | `supabase/migrations/20260821090200_accessories.sql:40` |
| BR-009 | Ambang stok minimum tidak boleh negatif | `accessories` | `min_qty >= 0` | `supabase/migrations/20260821090200_accessories.sql:41` |
| BR-010 | Jumlah yang dikeluarkan wajib lebih dari nol | `accessory_checkouts` | `qty > 0` | `supabase/migrations/20260821090200_accessories.sql:60` |
| BR-011 | Tanggal kembali perlengkapan tidak boleh mendahului tanggal keluar | `accessory_checkouts` | `returned_date is null or returned_date >= assigned_date` | `supabase/migrations/20260821090200_accessories.sql:68` |
| BR-012 | Pemegang kedua tidak boleh orang yang sama dengan pemegang utama | `assignments` | `secondary_account_id is null or secondary_account_id <> account_id` | `supabase/migrations/20260821090500_second_holder.sql:37-38` |

Enam di antaranya diberi nama eksplisit di DDL; enam lainnya tidak, sehingga
PostgreSQL yang menamainya. Nama hasil generate itu **tidak** saya tebak —
lihat [02-kamus-data.md](02-kamus-data.md) §0.2.

### 1.2 Unique index

| Kode | Aturan | Tabel | Definisi | Rujukan |
| --- | --- | --- | --- | --- |
| BR-013 | Satu aset hanya boleh punya satu penugasan aktif | `assignments` | `unique index on assignments(asset_id) where state = 'active'` | `supabase/migrations/20260729090000_init_schema.sql:258` |
| BR-014 | Nama penanda tangan unik tanpa membedakan huruf besar-kecil | `bast_signatories` | `unique index on bast_signatories (lower(full_name))` | `supabase/migrations/20260731090000_ebast_signatures.sql:69` |
| BR-015 | Dua lokasi tidak boleh berbagi awalan label | `locations` | `unique index on locations (upper(tag_prefix)) where tag_prefix is not null` | `supabase/migrations/20260806090000_location_scoped_labels.sql:60-61` |
| BR-016 | Satu pemberitahuan per kunci dedupe per akun | `notifications` | `unique index on notifications (account_id, dedupe_key) where dedupe_key is not null` | `supabase/migrations/20260801090000_phase6.sql:284-286` |

**BR-013 adalah aturan paling menentukan di seluruh sistem.** Index parsial
unik `assignments_one_active` itulah yang membuat "satu aset, satu pemegang
aktif" menjadi jaminan struktural. Bandingkan `accessory_checkouts_active_idx`
yang bentuknya mirip tetapi **tidak** unique — dan justru itu yang membedakan
barang ber-nomor-seri dari barang berjumlah.

---

## 2. Aturan lapisan RPC (BR-101 ke atas)

Ditegakkan di dalam badan fungsi PostgreSQL. **Tidak dapat ditembus lewat
`curl` ke PostgREST**, karena PostgREST memanggil fungsi yang sama. Yang dapat
melewatinya hanyalah tulisan langsung ke tabel — dan untuk enam tabel, grant
tulisnya sudah dicabut sehingga jalur itu pun tertutup
([05-keamanan.md](05-keamanan.md) §2.3).

Aturan dikelompokkan per modul. Kolom **Fungsi** menyebut seluruh fungsi yang
melempar pesan itu — pesan seperti `Asset not found` dipakai belasan fungsi
dengan maksud yang sama, jadi dicatat sekali.

### M1 — Sesi, identitas, dan otorisasi (6 aturan)

| Kode | Pesan galat (dikutip persis) | errcode | Fungsi |
| --- | --- | --- | --- |
| BR-101 | `Account not found` | `P0001` | `account_for_credentials()`, `delete_account()`, `set_account_login()` (+1) |
| BR-102 | `An email address is required for an account that logs in` | `P0001` | `create_account()`, `set_account_login()`, `update_account()` |
| BR-103 | `Choose a role before this account can log in` | `P0001` | `create_account()`, `set_account_login()`, `update_account()` |
| BR-104 | `No active account for the current session` | — | `set_account_scope()` |
| BR-105 | `Only a Super Admin can manage accounts` | `P0001` | `assert_can_manage_accounts()` |
| BR-106 | `This is the only Super Admin left — give someone else the role first` | `P0001` | `delete_account()`, `set_account_login()`, `update_account()` |

### M2 — Manajemen akun (7 aturan)

| Kode | Pesan galat (dikutip persis) | errcode | Fungsi |
| --- | --- | --- | --- |
| BR-107 | `% has % behind them. Set them to Inactive instead — deleting would leave those records naming nobody.` | `P0001` | `delete_account()` |
| BR-108 | `A name is required` | `P0001` | `add_bast_signatory()`, `create_account()` |
| BR-109 | `Choose a location — this role only sees its own` | `P0001` | `create_account()`, `update_account()` |
| BR-110 | `Say why this person is being deleted` | `P0001` | `delete_account()` |
| BR-111 | `That NIK or email is already on another account` | `P0001` | `create_account()`, `update_account()` |
| BR-112 | `Unknown role` | `P0001` | `create_account()`, `update_account()` |
| BR-113 | `You cannot delete your own account` | `P0001` | `delete_account()` |

### M3 — Master data (12 aturan)

| Kode | Pesan galat (dikutip persis) | errcode | Fungsi |
| --- | --- | --- | --- |
| BR-114 | `"%" already exists in %` | `P0001` | `master_create()`, `master_rename()` |
| BR-115 | `Cannot delete % — still referenced by % other records` | `P0001` | `master_delete()` |
| BR-116 | `Cannot delete % — still used by % assets` | `P0001` | `master_delete()` |
| BR-117 | `Enter a category code first` | `P0001` | `master_create()` |
| BR-118 | `Enter a company code first` | `P0001` | `master_create()` |
| BR-119 | `Enter a location code first` | `P0001` | `master_create()` |
| BR-120 | `Enter a name first` | `P0001` | `create_accessory()`, `master_create()`, `master_rename()` |
| BR-121 | `Enter a unit code first` | `P0001` | `master_create()` |
| BR-122 | `Record not found` | `P0001` | `master_delete()`, `master_rename()`, `master_set_active()` |
| BR-123 | `Select a brand first` | `P0001` | `master_create()` |
| BR-124 | `Select a location first` | `P0001` | `master_create()` |
| BR-125 | `Unknown master data entity: %` | `P0001` | `master_assert_entity()` |

### M4 — Register aset, foto, dan status (27 aturan)

| Kode | Pesan galat (dikutip persis) | errcode | Fungsi |
| --- | --- | --- | --- |
| BR-126 | `A category and a location are needed before a code can be made` | `P0001` | `create_asset()`, `next_asset_code()` |
| BR-127 | `An asset can carry five photos. Remove one first.` | `P0001` | `add_asset_photo()` |
| BR-128 | `Asset code % is already in use` | `P0001` | `create_asset()`, `update_asset()` |
| BR-129 | `Asset name is required` | `P0001` | `create_asset()`, `update_asset()` |
| BR-130 | `Asset not found` | `P0001` | `add_asset_photo()`, `assign_asset()`, `attach_tag()` (+9) |
| BR-131 | `Category is required` | `P0001` | `create_asset()` |
| BR-132 | `Could not allocate an asset code for %` | `P0001` | `next_asset_code()` |
| BR-133 | `Location is required` | `P0001` | `create_asset()` |
| BR-134 | `Only a Super Admin can delete an asset` | `P0001` | `delete_asset()` |
| BR-135 | `Only a Super Admin may edit the asset code` | `P0001` | `update_asset()` |
| BR-136 | `Only a Super Admin may set the whole asset code` | `P0001` | `create_asset()` |
| BR-137 | `Photo not found` | `P0001` | `remove_asset_photo()` |
| BR-138 | `Photo path does not belong to this asset` | `P0001` | `add_asset_photo()`, `set_asset_photo()` |
| BR-139 | `Please say why the status is changing` | `P0001` | `change_asset_status()` |
| BR-140 | `Return this asset first — % still has it` | `P0001` | `change_asset_status()`, `install_asset_to_unit()` |
| BR-141 | `Say why this is being deleted` | `P0001` | `delete_asset()` |
| BR-142 | `Serial number already registered` | `P0001` | `create_asset()`, `update_asset()` |
| BR-143 | `Serial number is required` | `P0001` | `create_asset()`, `update_asset()` |
| BR-144 | `That asset number is too long` | `P0001` | `create_asset()` |
| BR-145 | `That is already the status` | `P0001` | `change_asset_status()` |
| BR-146 | `That location is outside your scope` | `P0001` | `assign_asset()`, `create_accessory_bast()`, `create_asset()` (+2) |
| BR-147 | `The asset number must be digits` | `P0001` | `create_asset()` |
| BR-148 | `This asset has % behind it. Retire it instead — deleting it would leave those records pointing at nothing.` | `P0001` | `delete_asset()` |
| BR-149 | `Unknown status` | `P0001` | `change_asset_status()` |
| BR-150 | `Use Assign to put this asset in someone's hands` | `P0001` | `change_asset_status()` |
| BR-151 | `You do not have permission to change this asset` | `P0001` | `add_asset_photo()`, `change_asset_status()`, `install_asset_to_unit()` (+3) |
| BR-152 | `You do not have permission to create assets` | `P0001` | `create_asset()` |

### M5 — Label dan pemindaian (16 aturan)

| Kode | Pesan galat (dikutip persis) | errcode | Fungsi |
| --- | --- | --- | --- |
| BR-153 | `A batch is limited to 500 labels` | `P0001` | `create_tag_batch()` |
| BR-154 | `Choose which location these labels are for` | `P0001` | `create_tag_batch()` |
| BR-155 | `Detach the label from its asset before voiding it` | `P0001` | `void_tag()` |
| BR-156 | `How many labels do you need?` | `P0001` | `create_tag_batch()` |
| BR-157 | `Say why the label is being voided` | `P0001` | `void_tag()` |
| BR-158 | `That label has been voided` | `P0001` | `tag_asset()` |
| BR-159 | `That label is % stock — it cannot go on a % asset` | `P0001` | `assert_tag_location()` |
| BR-160 | `That label is already on %` | `P0001` | `attach_tag()` |
| BR-161 | `That label is already on another asset` | `P0001` | `tag_asset()` |
| BR-162 | `That label is not one of ours` | `P0001` | `attach_tag()`, `tag_asset()`, `void_tag()` |
| BR-163 | `That label was voided and cannot be used again` | `P0001` | `attach_tag()` |
| BR-164 | `This asset already carries label %` | `P0001` | `attach_tag()` |
| BR-165 | `Unknown location` | `P0001` | `create_tag_batch()` |
| BR-166 | `You do not have permission to create tags` | `P0001` | `create_tag_batch()` |
| BR-167 | `You do not have permission to label this asset` | `P0001` | `attach_tag()` |
| BR-168 | `You do not have permission to void a label` | `P0001` | `void_tag()` |

### M6 — Penugasan, perpindahan, dan unit (27 aturan)

| Kode | Pesan galat (dikutip persis) | errcode | Fungsi |
| --- | --- | --- | --- |
| BR-169 | `% is no longer in service` | `P0001` | `install_asset_to_unit()` |
| BR-170 | `Assignment date is required` | `P0001` | `assign_asset()`, `return_asset()` |
| BR-171 | `Choose somebody who is still active` | `P0001` | `set_secondary_holder()` |
| BR-172 | `Destination must be different from the origin` | `P0001` | `record_movement()` |
| BR-173 | `Employee not found` | `P0001` | `assign_asset()` |
| BR-174 | `Expected return cannot be before the assignment date` | `P0001` | `assign_asset()` |
| BR-175 | `It is already fitted to %` | `P0001` | `install_asset_to_unit()` |
| BR-176 | `Nobody holds this asset yet — assign it first` | `P0001` | `set_secondary_holder()` |
| BR-177 | `Please say why it is being fitted` | `P0001` | `install_asset_to_unit()` |
| BR-178 | `Please say why it is being removed` | `P0001` | `remove_asset_from_unit()` |
| BR-179 | `Return date cannot be before the assignment date` | `P0001` | `return_asset()` |
| BR-180 | `Select a destination` | `P0001` | `record_movement()` |
| BR-181 | `Select a reason` | `P0001` | `record_movement()` |
| BR-182 | `Select an asset to continue` | `P0001` | `assign_asset()`, `record_movement()`, `return_asset()` |
| BR-183 | `Select an employee to continue` | `P0001` | `assign_asset()` |
| BR-184 | `That is already the first holder` | `P0001` | `set_secondary_holder()` |
| BR-185 | `The "Assigned" status is missing from master data` | `P0001` | `assign_asset()` |
| BR-186 | `The "Available" status is missing from master data` | `P0001` | `return_asset()` |
| BR-187 | `This asset has no active assignment` | `P0001` | `return_asset()` |
| BR-188 | `This asset is % and cannot be fitted to anything` | `P0001` | `install_asset_to_unit()` |
| BR-189 | `This asset is already assigned` | `P0001` | `assign_asset()` |
| BR-190 | `This asset is not fitted to a unit` | `P0001` | `remove_asset_from_unit()` |
| BR-191 | `Unit not found` | `P0001` | `install_asset_to_unit()` |
| BR-192 | `You do not have permission to assign assets` | `P0001` | `assign_asset()` |
| BR-193 | `You do not have permission to change this assignment` | `P0001` | `set_secondary_holder()` |
| BR-194 | `You do not have permission to move assets` | `P0001` | `record_movement()` |
| BR-195 | `You do not have permission to return assets` | `P0001` | `return_asset()` |

### M7 — E-BAST (26 aturan)

| Kode | Pesan galat (dikutip persis) | errcode | Fungsi |
| --- | --- | --- | --- |
| BR-196 | `% has %. Void it instead — a signed document is the evidence a handover happened, and deleting it would remove the proof rather than the mistake.` | `P0001` | `delete_bast()` |
| BR-197 | `A BAST cannot list more than 20 items` | `P0001` | `attach_accessories_to_bast()`, `set_bast_items()` |
| BR-198 | `BAST not found` | `P0001` | `attach_accessories_to_bast()`, `attach_generated_bast()`, `attach_signed_bast()` (+5) |
| BR-199 | `Every line needs a Jenis/Type` | `P0001` | `set_bast_items()` |
| BR-200 | `Expected a list of items` | `P0001` | `set_bast_items()` |
| BR-201 | `File path does not belong to this BAST` | `P0001` | `attach_generated_bast()`, `attach_signed_bast()` |
| BR-202 | `Only a Super Admin can delete a document` | `P0001` | `delete_bast()` |
| BR-203 | `Say why this document is being deleted` | `P0001` | `delete_bast()` |
| BR-204 | `Say why this document is being voided` | `P0001` | `void_bast()` |
| BR-205 | `Signature has too many strokes` | `P0001` | `validate_signature_strokes()` |
| BR-206 | `Signature is not in the expected format` | `P0001` | `validate_signature_strokes()` |
| BR-207 | `Signature is out of bounds` | `P0001` | `validate_signature_strokes()` |
| BR-208 | `Signature is too large` | `P0001` | `validate_signature_strokes()` |
| BR-209 | `That document is already void` | `P0001` | `void_bast()` |
| BR-210 | `That signature is too short — please sign again` | `P0001` | `validate_signature_strokes()` |
| BR-211 | `This BAST has been voided` | `P0001` | `sign_bast()` |
| BR-212 | `This BAST is already signed — its contents cannot change` | `P0001` | `attach_accessories_to_bast()`, `set_bast_items()` |
| BR-213 | `This BAST is already signed — its kind cannot change` | `P0001` | `set_bast_kind()` |
| BR-214 | `Unknown kind of document` | `P0001` | `set_bast_kind()` |
| BR-215 | `Unknown signature role` | `P0001` | `sign_bast()` |
| BR-216 | `Who is signing?` | `P0001` | `sign_bast()` |
| BR-217 | `You do not have permission to change this document` | `P0001` | `attach_accessories_to_bast()`, `set_bast_items()`, `set_bast_kind()` |
| BR-218 | `You do not have permission to generate this document` | `P0001` | `attach_generated_bast()` |
| BR-219 | `You do not have permission to sign this document` | `P0001` | `sign_bast()` |
| BR-220 | `You do not have permission to upload a signed BAST` | `P0001` | `attach_signed_bast()` |
| BR-221 | `You do not have permission to void this document` | `P0001` | `void_bast()` |

### M8 — Perlengkapan (22 aturan)

| Kode | Pesan galat (dikutip persis) | errcode | Fungsi |
| --- | --- | --- | --- |
| BR-222 | `"%" already exists at that location` | `P0001` | `create_accessory()` |
| BR-223 | `% is no longer in use` | `P0001` | `assign_accessory()` |
| BR-224 | `Accessory not found` | `P0001` | `assign_accessory()`, `update_accessory()` |
| BR-225 | `Cannot go below % — that many are still out` | `P0001` | `update_accessory()` |
| BR-226 | `Choose a category` | `P0001` | `create_accessory()` |
| BR-227 | `Choose a location you can write to` | `P0001` | `create_accessory()` |
| BR-228 | `Choose at least one accessory` | `P0001` | `create_accessory_bast()` |
| BR-229 | `Choose someone to give it to` | `P0001` | `assign_accessory()` |
| BR-230 | `Choose who it is for` | `P0001` | `create_accessory_bast()` |
| BR-231 | `How many?` | `P0001` | `assign_accessory()` |
| BR-232 | `It cannot come back before it went out` | `P0001` | `return_accessory()` |
| BR-233 | `Only % left at %` | `P0001` | `assign_accessory()` |
| BR-234 | `Quantity cannot be negative` | `P0001` | `create_accessory()` |
| BR-235 | `Some of those are already on a document, returned, or somebody else's` | `P0001` | `attach_accessories_to_bast()`, `create_accessory_bast()` |
| BR-236 | `That hand-out was not found` | `P0001` | `return_accessory()` |
| BR-237 | `That has already been returned` | `P0001` | `return_accessory()` |
| BR-238 | `Those come from different locations — raise one document each` | `P0001` | `create_accessory_bast()` |
| BR-239 | `You do not have permission to add accessories` | `P0001` | `create_accessory()` |
| BR-240 | `You do not have permission to change this accessory` | `P0001` | `update_accessory()` |
| BR-241 | `You do not have permission to hand this out` | `P0001` | `assign_accessory()` |
| BR-242 | `You do not have permission to raise a BAST` | `P0001` | `create_accessory_bast()` |
| BR-243 | `You do not have permission to take this back` | `P0001` | `return_accessory()` |

### M9 — Perawatan (9 aturan)

| Kode | Pesan galat (dikutip persis) | errcode | Fungsi |
| --- | --- | --- | --- |
| BR-244 | `A cost cannot be negative` | `P0001` | `edit_maintenance()`, `log_maintenance()`, `update_maintenance()` |
| BR-245 | `It cannot have finished before it started` | `P0001` | `edit_maintenance()`, `log_maintenance()` |
| BR-246 | `Maintenance record not found` | `P0001` | `edit_maintenance()`, `update_maintenance()` |
| BR-247 | `The next service cannot be due before this one started` | `P0001` | `log_maintenance()`, `open_maintenance()` |
| BR-248 | `Unknown state` | `P0001` | `update_maintenance()` |
| BR-249 | `What is being done?` | `P0001` | `open_maintenance()` |
| BR-250 | `What was done?` | `P0001` | `log_maintenance()` |
| BR-251 | `You do not have permission to change this record` | `P0001` | `edit_maintenance()`, `update_maintenance()` |
| BR-252 | `You do not have permission to record maintenance here` | `P0001` | `log_maintenance()`, `open_maintenance()` |

### M10 — Dokumen aset (8 aturan)

| Kode | Pesan galat (dikutip persis) | errcode | Fungsi |
| --- | --- | --- | --- |
| BR-253 | `A signed E-BAST cannot be removed — it is the record of a handover` | `P0001` | `delete_document()` |
| BR-254 | `A signed E-BAST is recorded by signing, not uploaded here` | `P0001` | `add_document()` |
| BR-255 | `Document not found` | `P0001` | `delete_document()` |
| BR-256 | `File path does not belong to this asset` | `P0001` | `add_document()` |
| BR-257 | `Give the document a title` | `P0001` | `add_document()` |
| BR-258 | `Only a Super Admin can remove a document` | `P0001` | `delete_document()` |
| BR-259 | `Unknown document kind` | `P0001` | `add_document()` |
| BR-260 | `You do not have permission to add a document here` | `P0001` | `add_document()` |

### M11 — Impor CSV (6 aturan)

| Kode | Pesan galat (dikutip persis) | errcode | Fungsi |
| --- | --- | --- | --- |
| BR-261 | `That is more than 5000 rows — split the file` | `P0001` | `import_accounts()`, `import_assets()` |
| BR-262 | `The file could not be read` | `P0001` | `import_accounts()`, `import_assets()` |
| BR-263 | `The file has no rows` | `P0001` | `import_accounts()`, `import_assets()` |
| BR-264 | `Unknown lookup %` | `P0001` | `import_lookup()` |
| BR-265 | `You do not have permission to import assets` | `P0001` | `import_assets()` |
| BR-266 | `unparseable date` | — | `import_date()` |

### M13 — Notifikasi dan job terjadwal (3 aturan)

| Kode | Pesan galat (dikutip persis) | errcode | Fungsi |
| --- | --- | --- | --- |
| BR-267 | `Notification not found` | `P0001` | `mark_notification_read()` |
| BR-268 | `Only a Super Admin can run the notification jobs` | `P0001` | `run_notification_jobs_now()` |
| BR-269 | `Only a Super Admin can see the schedule` | `P0001` | `scheduled_jobs()` |

### M14 — Audit dan trigger generik (2 aturan)

| Kode | Pesan galat (dikutip persis) | errcode | Fungsi |
| --- | --- | --- | --- |
| BR-270 | `Only Corporate IT and above can read the audit log` | `P0001` | `audit_list()`, `audit_stats()` |
| BR-271 | `This table is append-only` | — | `forbid_mutation()` |

**Total aturan lapisan RPC: 171.**

---

## 3. Aturan lapisan UI (BR-901 – BR-911)

Hanya **dua dari 29 layar** melakukan validasi medan sendiri: `add-asset.tsx`
dan `transfer.tsx`. Dua puluh tujuh layar lain memanggil RPC lalu menampilkan
pesan apa pun yang dikembalikannya.

```sh
grep -rnE "next\.[a-zA-Z]+ = ['\`]" app/ --include=*.tsx | wc -l    # -> 11
```

Ini pilihan desain yang membuat pesan tidak dapat menyimpang: satu kalimat
ditulis sekali di RPC dan dipakai di mana-mana. Komentar di
`supabase/migrations/20260729180000_assign_return_movement.sql:88-89`
menyebutnya eksplisit — wizard memblokir hal yang sama di sisi klien, dan
*"the same copy is used here so a direct RPC call cannot produce a different
message"*.

| Kode | Aturan | Rujukan | Pesan UI | Padanan di database |
| --- | --- | --- | --- | --- |
| BR-901 | Nama aset wajib diisi | `app/(tabs)/add-asset.tsx:279` | `Asset name is required` | `create_asset()` — `Asset name is required` |
| BR-902 | Kategori wajib dipilih | `app/(tabs)/add-asset.tsx:280` | `Category is required` | `create_asset()` — `Category is required` |
| BR-903 | Merek wajib dipilih | `app/(tabs)/add-asset.tsx:281` | `Brand is required` | **TIDAK ADA** — `assets.brand_id` nullable, `create_asset()` tidak memeriksanya |
| BR-904 | Nomor seri wajib diisi | `app/(tabs)/add-asset.tsx:282` | `Serial number is required` | `create_asset()` — `Serial number is required` |
| BR-905 | Lokasi wajib dipilih | `app/(tabs)/add-asset.tsx:283` | `Location is required` | `create_asset()` — `Location is required` |
| BR-906 | Status wajib dipilih | `app/(tabs)/add-asset.tsx:284` | `Status is required` | `assets.status_id NOT NULL` — ditolak, tetapi dengan galat 23502, bukan kalimat |
| BR-907 | Kondisi wajib dipilih | `app/(tabs)/add-asset.tsx:285` | `Condition is required` | `assets.condition_id NOT NULL` — idem |
| BR-908 | Aset wajib dipilih | `app/(tabs)/transfer.tsx:130` | `Select an asset to continue` | `record_movement()` memeriksa aset ada dan terlihat |
| BR-909 | Tujuan wajib dipilih | `app/(tabs)/transfer.tsx:131` | `Select a destination` | `movements.to_location NOT NULL` + pemeriksaan scope di RPC |
| BR-910 | Alasan wajib dipilih | `app/(tabs)/transfer.tsx:132` | `Select a reason` | `record_movement()` — `Select a reason`, **kalimat identik** (`…assign_return_movement.sql:256-258`) |
| BR-911 | Format tanggal harus cocok pola | `app/(tabs)/transfer.tsx:133` | `Use <DATE_HINT>` | **TIDAK ADA** — tipe `date` menerima banyak format, tidak ada pemeriksaan pola |

---

## 4. (a) Aturan yang HANYA ditegakkan di UI

Pertanyaan Anda: mana yang dapat ditembus lewat `curl` langsung ke API?

### 4.1 Dua aturan tanpa padanan sama sekali

| Kode | Aturan | Apa yang terjadi bila dilewati |
| --- | --- | --- |
| **BR-903** | Merek wajib dipilih | Aset tersimpan dengan `brand_id = null`. Sah menurut skema — kolomnya memang nullable (`supabase/migrations/20260729090000_init_schema.sql:180`) dan `create_asset()` tidak menyebut merek sama sekali. Register akan memuat aset tanpa merek, yang tidak dapat dibuat lewat aplikasi |
| **BR-911** | Format tanggal harus cocok pola | `record_movement()` menerima `p_at timestamptz`; PostgreSQL menerima banyak format tanggal. Tanggal yang di UI ditolak akan diterima lewat panggilan langsung |

### 4.2 Tiga aturan yang ditegakkan database, tetapi dengan galat mentah

Bukan celah — datanya tetap tidak dapat rusak — tetapi kalimatnya hilang.
Panggilan langsung akan mendapat kode galat PostgreSQL, bukan pesan yang
disiapkan:

| Kode | Aturan | Penegakan sesungguhnya | Galat yang muncul |
| --- | --- | --- | --- |
| BR-906 | Status wajib dipilih | `assets.status_id NOT NULL` | `23502 null value in column "status_id"` |
| BR-907 | Kondisi wajib dipilih | `assets.condition_id NOT NULL` | `23502` |

Keduanya tetap tidak dapat merusak data — kolomnya `NOT NULL` — tetapi kalimat
yang disiapkan hilang dan penggunanya menerima kode galat PostgreSQL.

> **Koreksi terhadap dugaan awal.** Saya sempat menghitung BR-910 (alasan
> perpindahan wajib) sebagai lubang, dengan alasan `movements.reason` hanya
> `NOT NULL` dan string kosong tidak dilarang `NOT NULL`. Itu **salah**.
> `record_movement()` memeriksanya eksplisit di
> `supabase/migrations/20260729180000_assign_return_movement.sql:256-258`:
>
> ```sql
> if btrim(coalesce(p_reason, '')) = '' then
>   raise exception 'Select a reason' using errcode = 'P0001';
> end if;
> ```
>
> Pesannya bahkan **identik** dengan yang di UI. BR-910 berlapis penuh.
> Pola `coalesce(btrim(p_reason), '') = ''` dipakai konsisten oleh
> `change_asset_status()`, `void_bast()`, `delete_asset()`,
> `install_asset_to_unit()`, **dan** `record_movement()` — tidak ada yang
> terlewat.

### 4.3 Tujuh sisanya berlapis penuh

BR-901, 902, 904, 905, 908, 909, dan 910 punya padanan RPC dengan **kalimat
yang sama persis**. Menembus UI hanya memindahkan tempat penolakan, bukan
menghilangkannya.

### 4.4 Ringkasan untuk bab keterbatasan

Dari 11 aturan lapisan UI:

| Golongan | Jumlah | Kode |
| --- | ---: | --- |
| Berlapis penuh — pesan identik di RPC | 7 | BR-901, 902, 904, 905, 908, 909, 910 |
| Ditegakkan database, kalimat hilang | 2 | BR-906, BR-907 |
| **Tanpa padanan sama sekali** | **2** | **BR-903, BR-911** |

**Ini temuan, bukan kegagalan.** Permukaan yang dapat ditembus sangat kecil:
**dua aturan kosmetik saja** — merek wajib dan format tanggal. Tidak satu pun
dapat merusak integritas referensial, melanggar append-only, atau melewati RLS. Alasannya struktural — **171 dari 182 aturan
hidup di database**, dan enam tabel bahkan tidak dapat ditulis langsung sama
sekali.

---

## 5. (b) Aturan yang ditegakkan berlapis

### 5.1 Tiga lapis: skema + RPC + UI

| Aturan | Skema | RPC | UI |
| --- | --- | --- | --- |
| Nomor seri unik | `assets.serial_number unique` | `create_asset()`: `Serial number already registered` (case-insensitive) | `add-asset.tsx:282` wajib diisi |
| Satu penugasan aktif per aset | BR-013 index parsial unik | `assign_asset()`: `This asset is already assigned` | Wizard hanya menampilkan aset `Available` |
| Tanggal kembali >= tanggal serah | BR-003 CHECK | `return_asset()`: `Return date cannot be before the assignment date` | — |

Baris pertama menarik karena ketiga lapisnya **tidak identik**: unique
constraint bersifat case-sensitive, sedangkan pemeriksaan RPC memakai
`lower()`. RPC karena itu **lebih ketat** daripada skema — `ABC123` dan
`abc123` ditolak RPC tetapi akan diterima constraint.

### 5.2 Dua lapis: skema + RPC

| Aturan | Skema | RPC |
| --- | --- | --- |
| Stiker `tagged` iff punya aset | BR-005 CHECK | `attach_tag()`, `tag_asset()`, `void_tag()` |
| Pembatalan stiker wajib beralasan | BR-006 CHECK | `void_tag()` memeriksa lebih dulu |
| Perpindahan bukan ke lokasi yang sama | BR-004 CHECK | `record_movement()` memeriksa scope tujuan |
| Jumlah keluar > 0 | BR-010 CHECK | `assign_accessory()`: `How many?` |
| Stok tidak negatif | BR-008 CHECK | `assign_accessory()`: `Only % left at %` |
| Pemegang kedua bukan orang yang sama | BR-012 CHECK | `set_secondary_holder()` |
| Akun bisa login wajib punya role | BR-001 CHECK | `create_account()`, `update_account()`, `set_account_login()` |

### 5.3 Dua lapis: RPC + hak akses

Bentuk pelapisan yang paling banyak dipakai sistem ini, dan tidak terlihat
sebagai "validasi" sama sekali. Enam tabel dicabut hak tulisnya, sehingga
seluruh aturan di dalam RPC-nya **tidak dapat dilewati** meski RPC-nya sendiri
dilewati:

| Tabel | Hak `authenticated` | Akibatnya |
| --- | --- | --- |
| `accounts` | SELECT saja | Seluruh aturan `create_account()` / `update_account()` mutlak |
| `bast_signatures` | SELECT saja | `validate_signature_strokes()` tidak dapat dilewati |
| `asset_status_changes` | SELECT saja | Riwayat status hanya lahir dari `change_asset_status()` |
| `bast_items` | SELECT saja | Baris barang hanya lewat `set_bast_items()` |
| `asset_photos` | SELECT saja | Batas lima foto tidak dapat dilewati |
| 3 tabel penghitung | tidak ada hak sama sekali | Penomoran mutlak server-side |

Batas lima foto adalah contoh terbaiknya: ia **bukan** CHECK constraint,
melainkan `count(*)` di dalam `add_asset_photo()`
(`supabase/migrations/20260811110000_photo_limit_five.sql:36-40`). Aturan itu
secara teknis lemah — tetapi karena `asset_photos` tidak dapat ditulis
langsung, ia tetap mutlak dalam praktik.

### 5.4 Tiga lapis untuk append-only

Lima tabel dijaga tiga cara sekaligus: grant sempit, ketiadaan policy
UPDATE/DELETE, dan trigger `forbid_mutation()`. Rinciannya di
[05-keamanan.md](05-keamanan.md) §4.1. `import_batches` hanya dua lapis.

---

## 6. Yang belum terverifikasi

| # | Butir | Cara menutupnya |
| ---: | --- | --- |
| 1 | Apakah aset tanpa merek (BR-903) menimbulkan masalah di layar detail atau laporan | Sisipkan satu baris uji lalu buka `/asset/:code` |
| 2 | Apakah tanggal berformat aneh (BR-911) benar-benar diterima `record_movement()` | `curl` satu panggilan dengan `p_at` berformat tidak lazim |
| 3 | Apakah ada aturan bisnis di dalam Edge Function yang belum tercakup | Menyisir `supabase/functions/` untuk pemeriksaan selain yang di alur 6 |

Butir 3 patut dikerjakan sebelum naskah final: Fase 7 sudah menemukan satu
aturan yang hanya hidup di Edge Function — gerbang `complete` di
`generate-bast-pdf/index.ts:531` — dan aturan itu **tidak cocok** dengan
padanannya di `sign_bast()`. Kemungkinan ada yang lain.
