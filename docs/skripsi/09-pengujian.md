# 09 — Katalog Pengujian CITE Assets

Hasil Fase 9: 23 suite integrasi, kasus ujinya, dan matriks keterlacakan
terhadap aturan bisnis Fase 8.

**Tanggal:** 2026-09-01  
**Revisi:** working tree di atas commit `cd0d9f3`

---

## 0. Metode

### 0.1 Suite ini bukan unit test

Tidak ada framework. Tidak ada Jest, Vitest, atau `node:test`. Setiap suite
adalah skrip Node biasa yang:

1. Masuk sebagai pengguna sungguhan lewat `signInWithPassword()`
2. Memanggil RPC lewat klien Supabase dengan token itu
3. Memeriksa hasilnya dengan helper `check(nama, kondisi, detail)` buatan sendiri
4. Menghitung `failures` dan keluar dengan kode status

Artinya **RLS ikut diuji**, bukan dilewati. Header `tests/rls-site-it.mjs:6-7`
menyatakan maksud itu: *"This queries `assets` with a real signed-in token, so
hiding things in the UI cannot make it pass."*

### 0.2 Menghitung assertion

Satu assertion = satu pemanggilan `check(...)`. Definisi helper-nya sendiri
tidak dihitung.

```sh
grep -rho "check(" tests/ | wc -l          # -> 720 termasuk 23 definisi helper
grep -rc "function check" tests/ | awk -F: '{s+=$2} END {print s}'   # -> 23
# 720 - 23 = 697 ... tetapi lihat kualifikasi di bawah
```

> **Kualifikasi.** Angka `697` di atas terlalu besar. Penghitungan yang benar
> hanya mengambil pemanggilan `check(` yang argumen pertamanya berupa literal
> string, karena beberapa suite membungkus `check` di dalam helper lain.
> Hasil yang dipakai dokumen ini: **679 assertion**, dari pemindaian yang
> mengabaikan definisi fungsi dan hanya menerima literal.

### 0.3 Prasyarat menjalankan

Dua puluh dua dari 23 suite menuntut stack Supabase lokal yang benar-benar
berjalan. `tests/_guard.mjs:13` menolak berjalan terhadap apa pun yang bukan
localhost, dan pintu daruratnya `ALLOW_NON_LOCAL_TESTS=yes-i-mean-it`
(`:17-20`). Alasannya di `:4-8`: setiap suite menulis, dan sebagian tulisan
bersifat append-only sehingga tidak dapat dibatalkan.

```sh
supabase start && supabase db reset     # menerapkan 61 migrasi + seed.sql
npm test                                # 23 suite berurutan
```

Hanya `barcode.mjs` yang murni Node tanpa database — dan hanya itu yang
dijalankan CI pada setiap push (`.github/workflows/ci.yml:55-56`). Dua puluh
dua sisanya berjalan terjadwal atau manual (`:58-62`).

### 0.4 Dua helper

| Berkas | Peran |
| --- | --- |
| `tests/_guard.mjs` | Refuses to run a suite against anything but a local stack. |
| `tests/_ts.mjs` | Loads a TypeScript module into a `.mjs` suite. |

---

## 1. Tabel ringkas seluruh suite

| # | Suite | Modul | Assertion | RPC diuji | Tabel disentuh | Script |
| ---: | --- | --- | ---: | ---: | ---: | --- |
| 1 | `accessories.mjs` | M8 | 21 | 7 | 2 | `test:accessories` |
| 2 | `accounts.mjs` | M2 | 35 | 5 | 2 | `test:accounts` |
| 3 | `analytics.mjs` | M12 | 14 | 10 | 4 | `test:analytics` |
| 4 | `asset-code.mjs` | M4 | 12 | 5 | 0 | `test:code` |
| 5 | `asset-photos.mjs` | M4 | 17 | 5 | 2 | `test:photos` |
| 6 | `asset-register.mjs` | M4 | 43 | 5 | 2 | `test:register` |
| 7 | `asset-tags.mjs` | M5 | 37 | 7 | 1 | `test:tags` |
| 8 | `assign-movement.mjs` | M6 | 48 | 7 | 6 | `test:assign` |
| 9 | `audit-delete-search.mjs` | M14 | 30 | 7 | 6 | `test:audit` |
| 10 | `barcode.mjs` | M5 | 16 | 0 | 0 | `test:barcode` |
| 11 | `bast-accessory.mjs` | M7 | 32 | 13 | 8 | `test:bast-accessory` |
| 12 | `bast-document.mjs` | M7 | 32 | 11 | 5 | `test:bast-doc` |
| 13 | `bast-two-holders.mjs` | M7 | 21 | 11 | 7 | `test:two-holders` |
| 14 | `bast.mjs` | M7 | 62 | 8 | 5 | `test:bast` |
| 15 | `ebast-signature.mjs` | M7 | 41 | 8 | 7 | `test:signature` |
| 16 | `import-accounts.mjs` | M11 | 32 | 2 | 3 | `test:import-accounts` |
| 17 | `import.mjs` | M11 | 26 | 3 | 2 | `test:import` |
| 18 | `master-data.mjs` | M3 | 23 | 7 | 1 | `test:master` |
| 19 | `phase6.mjs` | M9 | 53 | 19 | 6 | `test:phase6` |
| 20 | `reports.mjs` | M12 | 13 | 2 | 2 | `test:reports` |
| 21 | `rls-site-it.mjs` | M1 | 22 | 2 | 4 | `test:rls` |
| 22 | `status-changes.mjs` | M4 | 26 | 7 | 6 | `test:status` |
| 23 | `units.mjs` | M6 | 23 | 9 | 7 | `test:units` |
| | **Total** | | **679** | | | |

Suite terbesar `bast.mjs` (62 assertion) dan
terkecil `reports.mjs` (12). Rata-rata
30 assertion per suite.

---

## 2. Katalog per suite

### 1. `tests/accessories.mjs`

- **Modul:** M8 — Perlengkapan
- **Baris:** 256 · **Assertion:** 21
- **Script:** `npm run test:accessories`
- **Tujuan:** Accessories — counted stock, not identified assets.
- **RPC diuji (7):** `accessories_list()`, `accessory_detail()`, `assign_accessory()`, `assignable_employees()`, `create_accessory()`, `return_accessory()`, `update_accessory()`
- **Tabel dibaca langsung:** `categories`, `locations`
- **Aturan yang dibuktikan harfiah:** — (tidak mengutip pesan galat apa pun)

<details><summary>21 kasus uji</summary>

| # | Baris | Kasus |
| ---: | ---: | --- |
| 1 | 77 | an accessory is created |
| 2 | 80 | everything is on the shelf to begin with |
| 3 | 94 | the same name at the same location is refused |
| 4 | 108 | ...but the same name at another location is a separate stock |
| 5 | 125 | more than the shelf holds is refused, and the message says how many are left |
| 6 | 136 | zero is refused |
| 7 | 144 | three go out |
| 8 | 145 | the shelf drops by three |
| 9 | 153 | the total is untouched |
| 10 | 158 | three are counted as out |
| 11 | 163 | the hand-out is in the history with the holder named |
| 12 | 176 | reducing the total below three is refused |
| 13 | 183 | ...but reducing it to forty is fine |
| 14 | 184 | and the shelf follows |
| 15 | 194 | they come back |
| 16 | 195 | the shelf is whole again |
| 17 | 202 | returning twice is refused |
| 18 | 212 | an admin sees both mice |
| 19 | 222 | Site IT sees exactly one location worth of stock |
| 20 | 230 | and RLS decides, not the list query |
| 21 | 245 | a Viewer is refused |

</details>

### 2. `tests/accounts.mjs`

- **Modul:** M2 — Manajemen akun
- **Baris:** 457 · **Assertion:** 35
- **Script:** `npm run test:accounts`
- **Tujuan:** Account management — migration 0017 and the manage-account Edge Function.
- **RPC diuji (5):** `accounts_list()`, `assignable_employees()`, `bootstrap_session()`, `create_account()`, `update_account()`
- **Tabel dibaca langsung:** `accounts`, `locations`
- **Aturan yang dibuktikan harfiah (1):** `BR-105`

<details><summary>35 kasus uji</summary>

| # | Baris | Kasus |
| ---: | ---: | --- |
| 1 | 117 | they are created |
| 2 | 118 | with no role and no login |
| 3 | 119 | and no credentials behind them |
| 4 | 120 | they are active |
| 5 | 125 | and they can still be assigned an asset |
| 6 | 144 | no role is refused |
| 7 | 156 | no email is refused |
| 8 | 168 | a location-bound role without a location is refused |
| 9 | 184 | an unknown role is refused |
| 10 | 200 | there is nothing to sign in with yet |
| 11 | 203 | a short password is refused |
| 12 | 206 | the sign-in is created |
| 13 | 209 | and it actually signs in |
| 14 | 215 | the account is linked to the auth user |
| 15 | 216 | and marked as able to log in |
| 16 | 220 | the new user gets the role they were given |
| 17 | 231 | the password can be changed |
| 18 | 234 | the old password stops working |
| 19 | 237 | the new one works |
| 20 | 240 | the sign-in can be removed |
| 21 | 243 | and then nothing signs in |
| 22 | 246 | the person is still on the register |
| 23 | 247 | just without a login |
| 24 | 258 | resetting a password that does not exist is refused |
| 25 | 269 | the seeded Super Admin is found |
| 26 | 277 | and is currently the only one |
| 27 | 295 | demoting them is refused |
| 28 | 309 | deactivating them is refused |
| 29 | 312 | and removing their sign-in is refused |
| 30 | 315 | they can still sign in afterwards |
| 31 | 338 | with a second Super Admin, demoting the first is allowed |
| 32 | 358 | and the role can be restored |
| 33 | 398 | … cannot create an account |
| 34 | 414 | … cannot issue credentials either |
| 35 | 424 | even a Super Admin cannot write the row directly |

</details>

### 3. `tests/analytics.mjs`

- **Modul:** M12 — Laporan dan analitik
- **Baris:** 230 · **Assertion:** 14
- **Script:** `npm run test:analytics`
- **Tujuan:** Value analytics and holdings.
- **RPC diuji (10):** `accessories_list()`, `account_holdings()`, `assign_accessory()`, `assign_asset()`, `assignable_employees()`, `create_accessory()`, `create_asset()`, `return_asset()`, `set_secondary_holder()`, `value_analytics()`
- **Tabel dibaca langsung:** `asset_conditions`, `asset_statuses`, `categories`, `locations`
- **Aturan yang dibuktikan harfiah:** — (tidak mengutip pesan galat apa pun)

<details><summary>14 kasus uji</summary>

| # | Baris | Kasus |
| ---: | ---: | --- |
| 1 | 80 | 100 × 85,000 lands in the accessory value |
| 2 | 81 | the asset value is untouched by it |
| 3 | 86 | the quantity owned is reported too |
| 4 | 108 | the value is the same after ten go out |
| 5 | 116 | the ten appear against that person |
| 6 | 146 | and so does the laptop |
| 7 | 151 | ...marked as the first holder |
| 8 | 162 | the second holder sees it too |
| 9 | 167 | ...marked as the second holder |
| 10 | 181 | and a returned asset leaves both lists |
| 11 | 190 | assets break down by category, location and department |
| 12 | 196 | accessories break down by category and location |
| 13 | 202 | a category filter narrows both sides |
| 14 | 214 | a scoped user sees no more than an admin |

</details>

### 4. `tests/asset-code.mjs`

- **Modul:** M4 — Register aset, foto, dan status
- **Baris:** 266 · **Assertion:** 12
- **Script:** `npm run test:code`
- **Tujuan:** The asset code — migrations 0034 and 0035.
- **RPC diuji (5):** `asset_code_prefix()`, `asset_form_options()`, `create_asset()`, `master_create()`, `preview_asset_code()`
- **Aturan yang dibuktikan harfiah (3):** `BR-136`, `BR-144`, `BR-147`

<details><summary>12 kasus uji</summary>

| # | Baris | Kasus |
| ---: | ---: | --- |
| 1 | 110 | company + category + year + location, in that order |
| 2 | 121 | the location decides HO vs SITE |
| 3 | 128 | with no purchase date the current year is used |
| 4 | 143 | a typed number is padded to four and glued to the prefix |
| 5 | 155 | the same number written differently is refused by name |
| 6 | 166 | letters in the number are refused |
| 7 | 177 | an implausible number is refused |
| 8 | 191 | the next code continues from 0064, with no counter to seed |
| 9 | 202 | and the form preview agrees with what would be allocated |
| 10 | 213 | another year starts its own run |
| 11 | 233 | Site IT cannot send a whole code |
| 12 | 251 | but it may choose the number |

</details>

### 5. `tests/asset-photos.mjs`

- **Modul:** M4 — Register aset, foto, dan status
- **Baris:** 241 · **Assertion:** 17
- **Script:** `npm run test:photos`
- **Tujuan:** Asset photos — migration 0036.
- **RPC diuji (5):** `add_asset_photo()`, `asset_form_options()`, `asset_photos_list()`, `create_asset()`, `remove_asset_photo()`
- **Tabel dibaca langsung:** `asset_photos`, `assets`
- **Aturan yang dibuktikan harfiah (3):** `BR-127`, `BR-137`, `BR-138`

<details><summary>17 kasus uji</summary>

| # | Baris | Kasus |
| ---: | ---: | --- |
| 1 | 95 | a new asset has no cover |
| 2 | 101 | a path outside the asset folder is refused |
| 3 | 114 | photo … lands at position … |
| 4 | 118 | the list comes back in order |
| 5 | 125 | the cover is the first photo, set by the trigger |
| 6 | 135 | removing returns the file to delete |
| 7 | 140 | and says what is left |
| 8 | 144 | the gap is closed — positions stay 1..n |
| 9 | 151 | the cover moves to the next photo |
| 10 | 159 | removing the last one clears the cover |
| 11 | 162 | removing something already gone says so |
| 12 | 185 | the sixth is refused, and the message says how to make room |
| 13 | 196 | removing one makes room again |
| 14 | 215 | a Viewer can see the photos |
| 15 | 221 | a Viewer cannot add one |
| 16 | 224 | a Viewer cannot remove one |
| 17 | 230 | nobody can insert a row directly |

</details>

### 6. `tests/asset-register.mjs`

- **Modul:** M4 — Register aset, foto, dan status
- **Baris:** 352 · **Assertion:** 43
- **Script:** `npm run test:register`
- **Tujuan:** Asset register — IMPLEMENTATION_PLAN.md § Phase 3, "Done when":
- **RPC diuji (5):** `asset_detail()`, `count_assets_in_scope()`, `search_assets()`, `set_asset_photo()`, `update_asset()`
- **Tabel dibaca langsung:** `asset_statuses`, `locations`
- **Aturan yang dibuktikan harfiah (3):** `BR-135`, `BR-138`, `BR-142`

<details><summary>43 kasus uji</summary>

| # | Baris | Kasus |
| ---: | ---: | --- |
| 1 | 67 | empty query returns every asset in scope |
| 2 | 75 | finds an asset by serial number |
| 3 | 84 | finds an asset by the holder's name |
| 4 | 93 | finds by asset code |
| 5 | 96 | finds by asset name |
| 6 | 99 | finds by brand |
| 7 | 102 | finds by model |
| 8 | 105 | finds by department |
| 9 | 112 | search is case-insensitive |
| 10 | 115 | a miss returns an empty list, not an error |
| 11 | 124 | status chip filters the list |
| 12 | 132 | scope narrows the list to Head Office |
| 13 | 140 | an out-of-scope asset is not returned even by exact serial |
| 14 | 146 | scope count feeds the "n of m in scope" line |
| 15 | 162 | Site IT asking for a wider scope still only gets its own location |
| 16 | 168 | no Site rows leak through the widened scope |
| 17 | 174 | asset_detail returns null for an out-of-scope asset |
| 18 | 180 | returns the asset |
| 19 | 181 | resolves display names |
| 20 | 182 | resolves the holder |
| 21 | 183 | carries the specifications JSON |
| 22 | 184 | assignments tab has the active row |
| 23 | 185 | the assignment carries its BAST number |
| 24 | 190 | documents tab is populated |
| 25 | 193 | maintenance tab is populated |
| 26 | 201 | timeline is not empty |
| 27 | 202 | has a purchased event |
| 28 | 203 | has a registered event |
| 29 | 204 | has an assigned event |
| 30 | 209 | events are sorted newest first |
| 31 | 213 | purchase precedes registration |
| 32 | 220 | the assignment event names the holder |
| 33 | 225 | the assignment event tags the BAST number |
| 34 | 233 | a moved asset shows its movement event |
| 35 | 235 | the movement event reads origin → destination |
| 36 | 242 | a serviced asset shows its maintenance event |
| 37 | 262 | edit rejects a serial that belongs to another asset |
| 38 | 279 | edit saves |
| 39 | 282 | the edit is visible immediately |
| 40 | 295 | only a Super Admin may edit the asset code |
| 41 | 314 | cleanup restored the seeded name |
| 42 | 329 | a photo path from another asset is rejected |
| 43 | 339 | a well-formed photo path is accepted |

</details>

### 7. `tests/asset-tags.mjs`

- **Modul:** M5 — Label dan pemindaian
- **Baris:** 364 · **Assertion:** 37
- **Script:** `npm run test:tags`
- **Tujuan:** Asset tags — the QR / barcode lifecycle the client specified on 2026-07-30:
- **RPC diuji (7):** `asset_form_options()`, `create_tag_batch()`, `list_tags()`, `scan_tag()`, `tag_asset()`, `tag_stock()`, `void_tag()`
- **Tabel dibaca langsung:** `asset_tags`
- **Aturan yang dibuktikan harfiah (10):** `BR-153`, `BR-154`, `BR-155`, `BR-156`, `BR-157`, `BR-158`, `BR-161`, `BR-162`, `BR-166`, `BR-168`

<details><summary>37 kasus uji</summary>

| # | Baris | Kasus |
| ---: | ---: | --- |
| 1 | 70 | a batch of zero is rejected |
| 2 | 77 | an implausible batch size is rejected |
| 3 | 84 | a batch with no location is rejected |
| 4 | 92 | three labels are issued |
| 5 | 96 | Head Office stock is CTH and zero-padded |
| 6 | 101 | the batch reports which stock it is |
| 7 | 106 | they share one batch id |
| 8 | 109 | Site stock is CTS, on its own sequence |
| 9 | 116 | a second batch does not reuse a code |
| 10 | 133 | a Site label cannot go on a Head Office asset |
| 11 | 139 | and the refused label is still blank — no half-registered device |
| 12 | 149 | a label we never issued reports found: false |
| 13 | 152 | a printed label reads untagged |
| 14 | 153 | scanning is case-insensitive |
| 15 | 171 | the asset is created |
| 16 | 172 | the response carries the label code |
| 17 | 173 | the asset code came from the generator |
| 18 | 181 | scanning it now resolves to the asset |
| 19 | 182 | the scan returns what the screen needs |
| 20 | 199 | the same label cannot be put on a second asset |
| 21 | 214 | a label we never issued is refused |
| 22 | 230 | a label cannot be marked tagged with no asset behind it |
| 23 | 241 | a tagged label cannot have its asset removed underneath it |
| 24 | 252 | two labels cannot claim the same asset |
| 25 | 259 | a label cannot be deleted — the sticker physically exists |
| 26 | 269 | a reason is required |
| 27 | 276 | a label already on an asset cannot be voided |
| 28 | 286 | a spare label can be voided |
| 29 | 297 | a voided label cannot be used |
| 30 | 308 | a Viewer cannot print labels |
| 31 | 315 | a Viewer cannot void a label |
| 32 | 322 | a Viewer can still scan |
| 33 | 328 | the stock line counts each state |
| 34 | 335 | the list carries the stock location |
| 35 | 341 | scoping to Head Office hides Site stock |
| 36 | 346 | the untagged list excludes used labels |
| 37 | 353 | the list joins the asset through |

</details>

### 8. `tests/assign-movement.mjs`

- **Modul:** M6 — Penugasan, perpindahan, dan unit
- **Baris:** 517 · **Assertion:** 48
- **Script:** `npm run test:assign`
- **Tujuan:** Assignment & movement — IMPLEMENTATION_PLAN.md § Phase 4, "Done when":
- **RPC diuji (7):** `asset_detail()`, `assign_asset()`, `assignable_assets()`, `assignable_employees()`, `movement_history()`, `record_movement()`, `return_asset()`
- **Tabel dibaca langsung:** `asset_conditions`, `assignments`, `audit_log`, `bast`, `locations`, `movements`
- **Aturan yang dibuktikan harfiah (13):** `BR-130`, `BR-146`, `BR-170`, `BR-172`, `BR-174`, `BR-179`, `BR-181`, `BR-182`, `BR-183`, `BR-187`, `BR-189`, `BR-192`, `BR-194`

<details><summary>48 kasus uji</summary>

| # | Baris | Kasus |
| ---: | ---: | --- |
| 1 | 82 | step 1 lists employees in scope |
| 2 | 83 | each employee row carries Department · Location · NIK |
| 3 | 103 | the asset row shows location and condition |
| 4 | 113 | step 2 (return) lists only Assigned assets |
| 5 | 119 | return rows carry the current holder |
| 6 | 125 | step 2 respects the scope |
| 7 | 141 | no employee → "Select an employee to continue" |
| 8 | 153 | no asset → "Select an asset to continue" |
| 9 | 165 | no date → "Assignment date is required" |
| 10 | 178 | expected return before the assignment date is rejected |
| 11 | 194 | a Viewer cannot assign |
| 12 | 205 | a Viewer cannot record a movement |
| 13 | 218 | Site IT cannot assign an asset outside its own location |
| 14 | 229 | Site IT cannot move an asset out of its scope |
| 15 | 252 | assign returns an assignment id |
| 16 | 253 | Auto-generate BAST off → no number |
| 17 | 256 | the asset status becomes Assigned |
| 18 | 257 | the holder line updates |
| 19 | 264 | an assignment row exists and is active |
| 20 | 265 | the assignment carries the date and notes |
| 21 | 274 | an audit entry is written |
| 22 | 289 | the same asset cannot be assigned twice |
| 23 | 299 | no movement row when the location did not change |
| 24 | 313 | a return before the assignment date is rejected |
| 25 | 325 | return closes the assignment |
| 26 | 332 | and raises the Berita Acara Penarikan Barang |
| 27 | 339 | the asset status becomes Available |
| 28 | 340 | the holder is cleared |
| 29 | 347 | the assignment row is marked returned |
| 30 | 348 | the return date is recorded |
| 31 | 355 | returning an unassigned asset is rejected |
| 32 | 372 | the BAST number matches BAST/CITE/<year>/<seq> |
| 33 | 377 | it continues the sequence past the seeded numbers |
| 34 | 388 | the BAST is created as a draft |
| 35 | 389 | it is linked to the assignment it documents |
| 36 | 403 | cleanup left the monitor Available and unassigned |
| 37 | 416 | destination must differ from origin |
| 38 | 427 | a reason is required |
| 39 | 439 | the movement is recorded |
| 40 | 442 | the asset location follows the movement |
| 41 | 450 | the rail reads Origin → Destination |
| 42 | 455 | the rail carries date, user, reason and remarks |
| 43 | 470 | movements are audited |
| 44 | 478 | a raw UPDATE on movements fails |
| 45 | 485 | a raw DELETE on movements fails |
| 46 | 492 | the row survived both attempts, unchanged |
| 47 | 504 | cleanup moved it back |
| 48 | 506 | the asset is at Head Office again |

</details>

### 9. `tests/audit-delete-search.mjs`

- **Modul:** M14 — Audit dan trigger generik
- **Baris:** 324 · **Assertion:** 30
- **Script:** `npm run test:audit`
- **Tujuan:** Audit log, asset deletion and the narrowed search — migration 0026.
- **RPC diuji (7):** `assign_asset()`, `assignable_employees()`, `audit_list()`, `audit_stats()`, `create_asset()`, `delete_asset()`, `search_assets()`
- **Tabel dibaca langsung:** `asset_conditions`, `asset_statuses`, `assets`, `audit_log`, `categories`, `locations`
- **Aturan yang dibuktikan harfiah:** — (tidak mengutip pesan galat apa pun)

<details><summary>30 kasus uji</summary>

| # | Baris | Kasus |
| ---: | ---: | --- |
| 1 | 87 | the stats load |
| 2 | 88 | creating an asset shows up in the count |
| 3 | 95 | the log loads |
| 4 | 98 | the new asset has an entry |
| 5 | 99 | it names the action |
| 6 | 100 | it names the person, not just a uuid |
| 7 | 105 | and it summarises what was touched |
| 8 | 112 | the action filter returns only that action |
| 9 | 120 | the search matches on the actor |
| 10 | 128 | paging returns different rows |
| 11 | 143 | inserting an entry is refused |
| 12 | 154 | update is refused |
| 13 | 157 | delete is refused |
| 14 | 161 | Site IT cannot open it |
| 15 | 169 | a reason is required |
| 16 | 176 | a Viewer cannot |
| 17 | 182 | a fresh mistake can be deleted |
| 18 | 183 | and it reports which one |
| 19 | 186 | the row really went |
| 20 | 190 | the deletion and its reason are in the log |
| 21 | 210 | an asset with an assignment is refused |
| 22 | 215 | and the message says what is holding it |
| 23 | 220 | and points at retiring instead |
| 24 | 244 | without a category, both are found |
| 25 | 258 | with a category, only that category is searched |
| 26 | 264 | and every row really is in it |
| 27 | 277 | sorting by name really sorts by name |
| 28 | 291 | and the default sorts by asset code |
| 29 | 307 | an unknown sort falls back instead of failing |
| 30 | 313 | and the table is still there |

</details>

### 10. `tests/barcode.mjs`

- **Modul:** M5 — Label dan pemindaian
- **Baris:** 207 · **Assertion:** 16
- **Script:** `npm run test:barcode`
- **Tujuan:** Code 128 — src/lib/barcode.ts.
- **Aturan yang dibuktikan harfiah:** — (tidak mengutip pesan galat apa pun)

<details><summary>16 kasus uji</summary>

| # | Baris | Kasus |
| ---: | ---: | --- |
| 1 | 67 | 107 patterns were found in the source |
| 2 | 70 | every symbol except stop is 6 runs of 11 modules |
| 3 | 81 | stop is 7 runs of 13 modules |
| 4 | 89 | no two values share a pattern |
| 5 | 96 | every run is between 1 and 4 modules |
| 6 | 109 | start code comes first |
| 7 | 110 | stop code comes last |
| 8 | 111 | ABC checksums to 1 |
| 9 | 118 | a real label code checksums correctly |
| 10 | 154 | "…" starts with start-B |
| 11 | 158 | "…" round-trips |
| 12 | 162 | "…" carries the right checksum |
| 13 | 187 | one rect per bar run |
| 14 | 188 | the drawing fits inside the requested width |
| 15 | 193 | the quiet zone is left blank at both ends |
| 16 | 198 | the module total includes both quiet zones |

</details>

### 11. `tests/bast-accessory.mjs`

- **Modul:** M7 — E-BAST
- **Baris:** 452 · **Assertion:** 32
- **Script:** `npm run test:bast-accessory`
- **Tujuan:** BAST Perlengkapan — a handover note with no asset on it.
- **RPC diuji (13):** `accessories_list()`, `assign_accessory()`, `assign_asset()`, `assignable_employees()`, `attach_accessories_to_bast()`, `bast_detail()`, `bast_list()`, `bast_stats()`, `create_accessory()`, `create_accessory_bast()`, `create_asset()`, `set_bast_items()`, `sign_bast()`
- **Tabel dibaca langsung:** `asset_conditions`, `asset_statuses`, `bast`, `bast_items`, `bast_versions`, `categories`, `documents`, `locations`
- **Aturan yang dibuktikan harfiah:** — (tidak mengutip pesan galat apa pun)

<details><summary>32 kasus uji</summary>

| # | Baris | Kasus |
| ---: | ---: | --- |
| 1 | 93 | it is raised |
| 2 | 96 | the number comes from the same yearly sequence |
| 3 | 101 | both accessories are on it |
| 4 | 110 | it carries no asset |
| 5 | 111 | its kind is 'accessory' |
| 6 | 112 | and it belongs to the location the stock came from |
| 7 | 115 | bast_detail survives a null asset |
| 8 | 116 | ...and the goods table is an array, not null |
| 9 | 121 | ...naming the recipient |
| 10 | 128 | it appears in the list at all |
| 11 | 135 | and the stat tiles count it |
| 12 | 146 | the same hand-out twice is refused |
| 13 | 153 | somebody else's hand-out is refused |
| 14 | 170 | a mixed-location document is refused |
| 15 | 210 | a scoped user CANNOT see an accessory BAST from another location |
| 16 | 215 | ...and bast_detail refuses it too |
| 17 | 219 | ...and so does its goods table |
| 18 | 244 | ...but CAN see one from its own location |
| 19 | 249 | ...and can read that one in full |
| 20 | 280 | the asset got its own BAST |
| 21 | 287 | an accessory is appended to it |
| 22 | 294 | the laptop's own line survived the append |
| 23 | 299 | ...and the headset is on it too |
| 24 | 340 | nothing can be appended once it is signed |
| 25 | 350 | and the goods list still refuses to be rewritten |
| 26 | 360 | the late accessory gets a document of its own instead |
| 27 | 373 | set_bast_items works on a document with no asset |
| 28 | 419 | the PDF renders |
| 29 | 420 | ...and is a real file, not an empty one |
| 30 | 429 | a signed version is recorded |
| 31 | 432 | and the document is Signed |
| 32 | 437 | nothing is mirrored into an asset that does not exist |

</details>

### 12. `tests/bast-document.mjs`

- **Modul:** M7 — E-BAST
- **Baris:** 326 · **Assertion:** 32
- **Script:** `npm run test:bast-doc`
- **Tujuan:** The Berita Acara, as it is actually printed — migration 0032.
- **RPC diuji (11):** `assign_asset()`, `attach_signed_bast()`, `bast_detail()`, `bast_list()`, `bast_stats()`, `create_account()`, `create_asset()`, `indonesian_date_words()`, `return_asset()`, `set_bast_items()`, `terbilang_kapital()`
- **Tabel dibaca langsung:** `asset_conditions`, `asset_statuses`, `categories`, `departments`, `locations`
- **Aturan yang dibuktikan harfiah:** — (tidak mengutip pesan galat apa pun)

<details><summary>32 kasus uji</summary>

| # | Baris | Kasus |
| ---: | ---: | --- |
| 1 | 98 | … reads "…" |
| 2 | 103 | the opening date matches the scanned sentence |
| 3 | 143 | assigning raises a document |
| 4 | 147 | it is listed as a handover |
| 5 | 153 | the kind reaches the renderer |
| 6 | 154 | Jabatan is on the sheet |
| 7 | 155 | NIK is on the sheet |
| 8 | 156 | the company and office name the second paragraph |
| 9 | 161 | the place line is rendered |
| 10 | 162 | the date is spelled out |
| 11 | 166 | the goods table falls back to the asset |
| 12 | 171 | and that line carries the asset serial |
| 13 | 189 | three lines are accepted |
| 14 | 193 | all three reach the sheet in order |
| 15 | 194 | the charger is second |
| 16 | 195 | an empty serial prints as a dash |
| 17 | 201 | a line with no Jenis/Type is refused |
| 18 | 206 | and the refusal rolled back — the three lines are still there |
| 19 | 217 | a Viewer cannot edit the list |
| 20 | 232 | the document can be marked signed |
| 21 | 238 | and then the list is frozen |
| 22 | 241 | the three signed-for lines are what it still says |
| 23 | 257 | returning raises its own document |
| 24 | 265 | it is a withdrawal |
| 25 | 266 | against the same asset |
| 26 | 267 | and the same person |
| 27 | 268 | its number comes from the one sequence, not a second one |
| 28 | 276 | both sheets sit in one list |
| 29 | 283 | and the filter separates them |
| 30 | 289 | the tiles count both kinds |
| 31 | 303 | a second assignment succeeds |
| 32 | 311 | and a return can be made without a document |

</details>

### 13. `tests/bast-two-holders.mjs`

- **Modul:** M7 — E-BAST
- **Baris:** 395 · **Assertion:** 21
- **Script:** `npm run test:two-holders`
- **Tujuan:** Two holders on one asset — the shared handy-talkie.
- **RPC diuji (11):** `assign_accessory()`, `assign_asset()`, `assignable_employees()`, `bast_detail()`, `create_accessory()`, `create_accessory_bast()`, `create_asset()`, `return_asset()`, `search_assets()`, `set_secondary_holder()`, `sign_bast()`
- **Tabel dibaca langsung:** `asset_conditions`, `asset_statuses`, `assets`, `assignments`, `bast`, `categories`, `locations`
- **Aturan yang dibuktikan harfiah:** — (tidak mengutip pesan galat apa pun)

<details><summary>21 kasus uji</summary>

| # | Baris | Kasus |
| ---: | ---: | --- |
| 1 | 94 | a second holder needs a first one |
| 2 | 113 | the same person twice is refused |
| 3 | 123 | the second holder is set |
| 4 | 136 | both names are on the asset |
| 5 | 149 | and on the assignment |
| 6 | 154 | there is still exactly one active assignment |
| 7 | 161 | the draft document names the second recipient |
| 8 | 177 | one signature is not complete |
| 9 | 190 | TWO signatures are STILL not complete when there is a second recipient |
| 10 | 203 | the third signature completes it |
| 11 | 210 | all three blocks are on the document |
| 12 | 246 | two signatures still complete a one-recipient document |
| 13 | 270 | by the first holder |
| 14 | 275 | and by the second holder |
| 15 | 291 | the return succeeds |
| 16 | 300 | the first holder is released |
| 17 | 301 | and so is the second |
| 18 | 308 | the withdrawal sheet carries the pair across |
| 19 | 328 | ...and needs both of them to sign it back in too |
| 20 | 371 | the IT side can sign it |
| 21 | 380 | and so can the recipient, which completes it |

</details>

### 14. `tests/bast.mjs`

- **Modul:** M7 — E-BAST
- **Baris:** 440 · **Assertion:** 62
- **Script:** `npm run test:bast`
- **Tujuan:** BAST — IMPLEMENTATION_PLAN.md § Phase 5, "Done when":
- **RPC diuji (8):** `asset_detail()`, `assign_asset()`, `assignable_employees()`, `attach_signed_bast()`, `bast_detail()`, `bast_list()`, `bast_stats()`, `return_asset()`
- **Tabel dibaca langsung:** `asset_conditions`, `bast`, `bast_versions`, `documents`, `locations`
- **Aturan yang dibuktikan harfiah (2):** `BR-201`, `BR-220`

<details><summary>62 kasus uji</summary>

| # | Baris | Kasus |
| ---: | ---: | --- |
| 1 | 72 | the list loads |
| 2 | 74 | a record card carries its number, asset and employee |
| 3 | 85 | the status comes through as the enum |
| 4 | 86 | the list is newest first |
| 5 | 92 | the three stat tiles have their counts |
| 6 | 99 | the seeded signed records are counted |
| 7 | 106 | the stats follow the scope |
| 8 | 119 | the Indonesian long date is rendered in SQL |
| 9 | 124 | Asset Code |
| 10 | 125 | Nama Aset |
| 11 | 126 | Penerima |
| 12 | 127 | Departemen |
| 13 | 128 | Lokasi |
| 14 | 129 | Kondisi |
| 15 | 130 | Yang Menyerahkan resolves to the issuer |
| 16 | 131 | the version rail reads "PDF generated (v1) — System" |
| 17 | 140 | a Saturday reads "Sabtu" |
| 18 | 149 | Site IT cannot open a BAST from another location |
| 19 | 168 | assign_asset created a numbered BAST |
| 20 | 179 | it starts as a draft at version 1 |
| 21 | 190 | the function returns successfully |
| 22 | 198 | it stores bast/<id>/v1.pdf |
| 23 | 199 | it reports the BAST number back |
| 24 | 202 | the file is readable from the private bucket |
| 25 | 207 | it is a PDF |
| 26 | 208 | it ends with a proper EOF marker |
| 27 | 209 | it has one page |
| 28 | 214 | the title is on it |
| 29 | 215 | the CITE wordmark is gone |
| 30 | 219 | the Indonesian sentence is on it |
| 31 | 223 | the date is spelled out |
| 32 | 224 | both signature blocks are on it |
| 33 | 228 | the party block is on it |
| 34 | 232 | the goods table is on it |
| 35 | 236 | the closing paragraph is on it |
| 36 | 237 | the ASPIRE lockup is embedded |
| 37 | 245 | the cross-reference offset is correct |
| 38 | 260 | every object is in the table |
| 39 | 265 | every offset lands on its object header |
| 40 | 270 | the file is a plausible size |
| 41 | 273 | a v1 "generated" version row was inserted |
| 42 | 277 | the note reads "PDF generated (v1)" |
| 43 | 281 | the uploader is System |
| 44 | 282 | a draft with a document is now awaiting signature |
| 45 | 291 | regenerating replaces v1 rather than adding a version |
| 46 | 307 | the scan uploads into the bast bucket |
| 47 | 314 | a path outside this BAST is rejected |
| 48 | 326 | the version is recorded |
| 49 | 333 | the status flips to Signed |
| 50 | 334 | current_version is bumped |
| 51 | 335 | the version history gained a signed entry |
| 52 | 339 | the rail reads "Signed scan uploaded — Dewi Lestari · Corporate IT" |
| 53 | 351 | the BAST list badge reads Signed |
| 54 | 355 | the scan appears on the asset Documents tab |
| 55 | 360 | it is filed as a signed_bast document |
| 56 | 361 | it points at the uploaded file |
| 57 | 369 | a raw UPDATE on bast_versions fails |
| 58 | 376 | a raw DELETE on bast_versions fails |
| 59 | 383 | both versions survived unchanged |
| 60 | 401 | a Viewer cannot upload a signed BAST |
| 61 | 410 | a Viewer cannot generate a document |
| 62 | 427 | \ncleanup left the monitor Available and unassigned |

</details>

### 15. `tests/ebast-signature.mjs`

- **Modul:** M7 — E-BAST
- **Baris:** 493 · **Assertion:** 41
- **Script:** `npm run test:signature`
- **Tujuan:** E-BAST digital signature — migration 0015.
- **RPC diuji (8):** `add_bast_signatory()`, `assign_asset()`, `assignable_employees()`, `bast_detail()`, `bast_list()`, `bast_signatories_list()`, `create_asset()`, `sign_bast()`
- **Tabel dibaca langsung:** `asset_conditions`, `asset_statuses`, `bast`, `bast_signatures`, `categories`, `documents`, `locations`
- **Aturan yang dibuktikan harfiah (1):** `BR-198`

<details><summary>41 kasus uji</summary>

| # | Baris | Kasus |
| ---: | ---: | --- |
| 1 | 140 | assigning with auto-BAST produced a BAST |
| 2 | 150 | a person can be added |
| 3 | 163 | adding the same person again reactivates instead of failing |
| 4 | 170 | the picker shows them with their title |
| 5 | 181 | a blank name is refused |
| 6 | 192 | writing the table directly is refused — sign_bast() is the only way in |
| 7 | 205 | a stray tap is not a signature |
| 8 | 214 | un-normalised coordinates are refused |
| 9 | 227 | a malformed path is refused |
| 10 | 236 | an unknown role is refused |
| 11 | 245 | signing without a name is refused |
| 12 | 257 | the handover signature is recorded |
| 13 | 258 | it does not claim the document is complete |
| 14 | 261 | the status has NOT become Signed |
| 15 | 266 | the strokes come back exactly as they went in |
| 16 | 270 | the document shows the signer, not the account that held the phone |
| 17 | 275 | the receiver block is still empty |
| 18 | 294 | both attempts are still in the table |
| 19 | 301 | the document shows the newest one |
| 20 | 321 | update is refused |
| 21 | 324 | delete is refused |
| 22 | 345 | finalising before both signatures is refused |
| 23 | 358 | the receiver signature is recorded |
| 24 | 359 | it reports the document as complete |
| 25 | 362 | two signatures alone still do not set the status |
| 26 | 370 | the finalised PDF is produced |
| 27 | 377 | NOW the status is Signed |
| 28 | 378 | the signed version is on top of the history |
| 29 | 387 | the versions run from 1 with no gaps |
| 30 | 398 | it is mirrored into the asset documents |
| 31 | 407 | the list badge says Signed too |
| 32 | 414 | the finalised file is in the bucket |
| 33 | 417 | it is a PDF |
| 34 | 421 | the signature strokes were drawn |
| 35 | 422 | both signatures are on the page |
| 36 | 426 | the signers are named under the lines |
| 37 | 432 | the cross-reference offset is correct |
| 38 | 454 | a document outside your locations cannot be signed |
| 39 | 459 | and it is refused as "not found" rather than admitting it exists |
| 40 | 472 | a document inside your locations can be |
| 41 | 482 | a Viewer cannot sign |

</details>

### 16. `tests/import-accounts.mjs`

- **Modul:** M11 — Impor CSV
- **Baris:** 274 · **Assertion:** 32
- **Script:** `npm run test:import-accounts`
- **Tujuan:** Employee import — run against the real Odoo export in the repo root.
- **RPC diuji (2):** `import_accounts()`, `update_account()`
- **Tabel dibaca langsung:** `accounts`, `departments`, `locations`
- **Aturan yang dibuktikan harfiah:** — (tidak mengutip pesan galat apa pun)

<details><summary>32 kasus uji</summary>

| # | Baris | Kasus |
| ---: | ---: | --- |
| 1 | 76 | every column is recognised |
| 2 | 81 | nothing required is missing |
| 3 | 86 | 527 rows parsed |
| 4 | 99 | a dry run adds no rows |
| 5 | 104 | one row is skipped |
| 6 | 107 | the skipped row is Heidi Lianawaty SMA |
| 7 | 112 | ...because NH2565 is already used |
| 8 | 117 | everything else is importable |
| 9 | 124 | the two malformed addresses are dropped |
| 10 | 129 | every blank employee ID is reported |
| 11 | 134 | warnings are grouped for the screen |
| 12 | 144 | numbers match the rehearsal exactly |
| 13 | 154 | an address in mixed case is stored lower-cased |
| 14 | 159 | ...and its phone number survives |
| 15 | 162 | somebody with no employee ID still imported |
| 16 | 163 | ...with a null NIK rather than an empty string |
| 17 | 168 | ...and their job position |
| 18 | 174 | everyone arrives as Record only |
| 19 | 177 | a malformed address is stored as null, and the person still exists |
| 20 | 186 | two blank-ID people at two companies stay two people |
| 21 | 192 | Excel's text-forcing apostrophe is stripped |
| 22 | 206 | adds nobody |
| 23 | 207 | changes nobody |
| 24 | 208 | recognises everyone |
| 25 | 230 | the person can be configured through the app |
| 26 | 239 | the import really does have to rewrite that row |
| 27 | 247 | job position is corrected from the file |
| 28 | 252 | role survives |
| 29 | 253 | sign-in survives |
| 30 | 254 | location survives |
| 31 | 255 | department survives |
| 32 | 264 | Site IT is refused |

</details>

### 17. `tests/import.mjs`

- **Modul:** M11 — Impor CSV
- **Baris:** 322 · **Assertion:** 26
- **Script:** `npm run test:import`
- **Tujuan:** CSV import — migration 0024 (Phase 7).
- **RPC diuji (3):** `import_assets()`, `import_history()`, `search_assets()`
- **Tabel dibaca langsung:** `categories`, `locations`
- **Aturan yang dibuktikan harfiah:** — (tidak mengutip pesan galat apa pun)

<details><summary>26 kasus uji</summary>

| # | Baris | Kasus |
| ---: | ---: | --- |
| 1 | 108 | the preview runs |
| 2 | 109 | it counts all 45 rows |
| 3 | 110 | 42 can be imported |
| 4 | 111 | 3 cannot |
| 5 | 112 | and nothing was written — it was only a rehearsal |
| 6 | 122 | the unknown category is named as such |
| 7 | 127 | the missing serial is reported as required |
| 8 | 132 | and the unreadable date says what a date should look like |
| 9 | 137 | every error carries the row number, so the report lines up with the file |
| 10 | 151 | the import runs |
| 11 | 152 | the preview told the truth — 42 imported |
| 12 | 157 | and 42 assets came back with codes |
| 13 | 164 | a batch was recorded |
| 14 | 168 | the history says who did it and how it went |
| 15 | 175 | and keeps the errors, so the report can be produced again later |
| 16 | 187 | the assets are findable in the register |
| 17 | 202 | an already-imported serial is reported, not re-added |
| 18 | 207 | and it says why |
| 19 | 228 | the first is fine and the second is refused |
| 20 | 233 | and it points at the file, not the register |
| 21 | 254 | DD/MM/YYYY and DD-MM-YYYY are accepted |
| 22 | 259 | a warranty that ends before it starts is refused |
| 23 | 276 | a Viewer cannot import |
| 24 | 286 | a location outside your scope is refused |
| 25 | 303 | an empty file is refused |
| 26 | 311 | an enormous one is refused with a number |

</details>

### 18. `tests/master-data.mjs`

- **Modul:** M3 — Master data
- **Baris:** 275 · **Assertion:** 23
- **Script:** `npm run test:master`
- **Tujuan:** Master data — IMPLEMENTATION_PLAN.md § Phase 2, "Done when":
- **RPC diuji (7):** `asset_form_options()`, `create_asset()`, `master_create()`, `master_delete()`, `master_list()`, `master_rename()`, `master_set_active()`
- **Tabel dibaca langsung:** `assets`
- **Aturan yang dibuktikan harfiah (2):** `BR-120`, `BR-142`

<details><summary>23 kasus uji</summary>

| # | Baris | Kasus |
| ---: | ---: | --- |
| 1 | 59 | empty name rejected with "Enter a name first" |
| 2 | 66 | duplicate rejected with the exact copy |
| 3 | 73 | duplicate check is case-insensitive |
| 4 | 84 | creates a brand |
| 5 | 92 | renames a brand |
| 6 | 99 | rename onto an existing name is rejected |
| 7 | 110 | soft delete sets is_active false |
| 8 | 113 | an inactive brand disappears from the Add Asset pickers |
| 9 | 120 | restoring is_active brings it back |
| 10 | 132 | Laptop reports a non-zero asset usage |
| 11 | 139 | referenced category cannot be deleted, with the exact copy |
| 12 | 151 | unreferenced record deletes |
| 13 | 158 | a Viewer cannot create master data |
| 14 | 162 | Site IT cannot create master data |
| 15 | 176 | admin adds a new category |
| 16 | 181 | the new category appears in the Add Asset picker straight away |
| 17 | 198 | an asset saves against the brand-new category |
| 18 | 199 | the generated asset code uses the new category code |
| 19 | 215 | duplicate serial rejected with the inline copy |
| 20 | 226 | the new category is now protected by its asset |
| 21 | 244 | created assets removed |
| 22 | 252 | created categories removed |
| 23 | 261 | created brands removed |

</details>

### 19. `tests/phase6.mjs`

- **Modul:** M9 — Perawatan
- **Baris:** 508 · **Assertion:** 53
- **Script:** `npm run test:phase6`
- **Tujuan:** Documents, maintenance and notifications — migration 0019 (Phase 6).
- **RPC diuji (19):** `add_document()`, `asset_detail()`, `asset_status_history()`, `assignable_assets()`, `bootstrap_session()`, `change_asset_status()`, `create_asset()`, `delete_document()`, `edit_maintenance()`, `log_maintenance()`, `maintenance_log()`, `maintenance_stats()`, `mark_all_notifications_read()`, `mark_notification_read()`, `notification_unread_count()`, `notifications_list()`, `notify_warranty_expiring()`, `run_notification_jobs_now()`, `scheduled_jobs()`
- **Tabel dibaca langsung:** `asset_conditions`, `asset_statuses`, `assets`, `categories`, `locations`, `notifications`
- **Aturan yang dibuktikan harfiah:** — (tidak mengutip pesan galat apa pun)

<details><summary>53 kasus uji</summary>

| # | Baris | Kasus |
| ---: | ---: | --- |
| 1 | 114 | a file from another asset’s folder is refused |
| 2 | 128 | a blank title is refused |
| 3 | 138 | a signed E-BAST cannot be uploaded as an ordinary document |
| 4 | 152 | an invoice is recorded |
| 5 | 155 | and it appears on the asset’s Documents tab |
| 6 | 170 | a Viewer cannot add one |
| 7 | 173 | a Super Admin can remove it |
| 8 | 188 | a record needs a title |
| 9 | 196 | it cannot have finished before it started |
| 10 | 208 | a negative cost is refused |
| 11 | 218 | a repair is recorded |
| 12 | 219 | with no end date it is still in the shop |
| 13 | 223 | opening a repair puts the asset into Maintenance |
| 14 | 229 | and it drops out of the assign picker while it is away |
| 15 | 235 | it shows under what is still away |
| 16 | 240 | and everything on that list really is still away |
| 17 | 246 | the elapsed days are counted from the start |
| 18 | 253 | giving it an end date closes it |
| 19 | 254 | and it reports itself finished |
| 20 | 258 | the range is what the log now shows |
| 21 | 262 | closing it brings the asset back to Available |
| 22 | 268 | and the assets row agrees |
| 23 | 274 | so it is assignable again — the bug this whole change exists for |
| 24 | 281 | both hops are recorded with a reason |
| 25 | 291 | clearing the end date puts it back in the shop |
| 26 | 292 | and the asset goes back into Maintenance with it |
| 27 | 300 | the spend and the days both add up |
| 28 | 312 | a Viewer cannot record one |
| 29 | 333 | the nightly pass runs |
| 30 | 337 | an asset 20 days from expiry produces a notification |
| 31 | 342 | it names the asset and the days left |
| 32 | 347 | and it deep-links to the asset |
| 33 | 348 | a retired asset produces nothing |
| 34 | 354 | the bell’s red dot has something to show |
| 35 | 362 | running it again sends nothing new |
| 36 | 369 | and there is still exactly one |
| 37 | 378 | a service due in 3 days is flagged too |
| 38 | 389 | there is something unread |
| 39 | 392 | one can be marked read |
| 40 | 395 | and the rest at once |
| 41 | 398 | the dot goes out |
| 42 | 404 | a Viewer is not notified about warranties |
| 43 | 411 | and cannot mark somebody else’s as read |
| 44 | 425 | it lands in the Super Admin’s inbox |
| 45 | 426 | and says what to actually do |
| 46 | 433 | running the pass again in the same week does not repeat it |
| 47 | 441 | a Viewer does not get it — they cannot run a backup |
| 48 | 453 | the schedule can be read |
| 49 | 456 | the nightly run is scheduled |
| 50 | 461 | and the weekly backup reminder is too |
| 51 | 476 | inserting a notification is refused |
| 52 | 485 | the generators are not callable directly, even by a Super Admin |
| 53 | 493 | and only a Super Admin can run the pass |

</details>

### 20. `tests/reports.mjs`

- **Modul:** M12 — Laporan dan analitik
- **Baris:** 163 · **Assertion:** 13
- **Script:** `npm run test:reports`
- **Tujuan:** Reports and export — migration 0025 (Phase 7).
- **RPC diuji (2):** `asset_report()`, `report_summary()`
- **Tabel dibaca langsung:** `asset_statuses`, `locations`
- **Aturan yang dibuktikan harfiah:** — (tidak mengutip pesan galat apa pun)

<details><summary>13 kasus uji</summary>

| # | Baris | Kasus |
| ---: | ---: | --- |
| 1 | 58 | the report loads |
| 2 | 59 | it returns something |
| 3 | 62 | the summary loads |
| 4 | 63 | the total matches the number of rows |
| 5 | 70 | and the status breakdown adds up to the same number |
| 6 | 77 | every row carries the columns a report needs, not just the list ones |
| 7 | 97 | a status filter returns only that status |
| 8 | 105 | a location scope returns only that location |
| 9 | 115 | a window with nothing in it returns nothing, not an error |
| 10 | 128 | asking for another location returns nothing |
| 11 | 135 | and asking for everything still only returns your own |
| 12 | 142 | the summary is scoped the same way |
| 13 | 152 | a Viewer can still run a report |

</details>

### 21. `tests/rls-site-it.mjs`

- **Modul:** M1 — Sesi, identitas, dan otorisasi
- **Baris:** 200 · **Assertion:** 22
- **Script:** `npm run test:rls`
- **Tujuan:** RLS verification — IMPLEMENTATION_PLAN.md § Phase 1, "Done when":
- **Fixture seed yang dipakai:**
  - Dewi Lestari  — super_admin, sees all 7 assets
  - Siti Rahayu   — site_it at Head Office, must see only the 4 HO assets
  - Andi Prasetyo — viewer at Head Office, reads only, writes must fail
- **RPC diuji (2):** `bootstrap_session()`, `set_account_scope()`
- **Tabel dibaca langsung:** `assets`, `audit_log`, `locations`, `movements`
- **Aturan yang dibuktikan harfiah:** — (tidak mengutip pesan galat apa pun)

<details><summary>22 kasus uji</summary>

| # | Baris | Kasus |
| ---: | ---: | --- |
| 1 | 68 | reads assets without error |
| 2 | 70 | sees every seeded asset, both locations |
| 3 | 73 | bootstrap_session returns an account |
| 4 | 74 | role is super_admin |
| 5 | 75 | allowed locations = 2 |
| 6 | 86 | set_account_scope keeps the single chosen location |
| 7 | 91 | a new session restores the persisted scope |
| 8 | 96 | allowed locations stay wider than the chosen scope |
| 9 | 104 | scope can be widened again |
| 10 | 111 | reads assets without error |
| 11 | 120 | every visible asset is at Head Office |
| 12 | 125 | all the seeded Head Office assets are visible |
| 13 | 126 | no Site asset leaks through |
| 14 | 137 | cannot read a Site asset by code |
| 15 | 140 | allowed locations = 1 |
| 16 | 147 | set_account_scope clamps scope to the allowed location |
| 17 | 158 | reads assets without error |
| 18 | 162 | a Viewer also sees only its own location |
| 19 | 174 | cannot update an asset |
| 20 | 178 | cannot read the audit log |
| 21 | 186 | movements reject delete even for Super Admin |
| 22 | 189 | audit_log rejects delete |

</details>

### 22. `tests/status-changes.mjs`

- **Modul:** M4 — Register aset, foto, dan status
- **Baris:** 341 · **Assertion:** 26
- **Script:** `npm run test:status`
- **Tujuan:** Status changes and disposal — migration 0016.
- **RPC diuji (7):** `asset_detail()`, `asset_status_history()`, `assign_asset()`, `assignable_assets()`, `assignable_employees()`, `change_asset_status()`, `create_asset()`
- **Tabel dibaca langsung:** `asset_conditions`, `asset_status_changes`, `asset_statuses`, `assets`, `categories`, `locations`
- **Aturan yang dibuktikan harfiah (1):** `BR-130`

<details><summary>26 kasus uji</summary>

| # | Baris | Kasus |
| ---: | ---: | --- |
| 1 | 103 | a blank reason is refused |
| 2 | 111 | an unknown status is refused |
| 3 | 119 | Assigned cannot be declared — it is what assigning produces |
| 4 | 134 | the status changes |
| 5 | 135 | the response says which status |
| 6 | 136 | and whether it ended the asset |
| 7 | 143 | the asset row really moved |
| 8 | 151 | the history records where it came from and where it went |
| 9 | 156 | the condition change is on the record too |
| 10 | 161 | the reason survives |
| 11 | 162 | so does the person |
| 12 | 170 | changing to the status it already has is refused |
| 13 | 179 | it shows up on the Timeline with its reason |
| 14 | 204 | writing the log directly is refused |
| 15 | 214 | update is refused |
| 16 | 217 | delete is refused |
| 17 | 233 | the asset is in someone’s hands |
| 18 | 241 | retiring it is refused while it is held |
| 19 | 246 | and the message names who has it |
| 20 | 260 | but marking it Broken while held is allowed |
| 21 | 276 | an unheld asset can be retired |
| 22 | 277 | the response marks it terminal |
| 23 | 284 | it leaves its department and holds nobody |
| 24 | 293 | and it can no longer be handed out |
| 25 | 308 | a Viewer cannot |
| 26 | 326 | an asset outside your locations cannot be touched |

</details>

### 23. `tests/units.mjs`

- **Modul:** M6 — Penugasan, perpindahan, dan unit
- **Baris:** 294 · **Assertion:** 23
- **Script:** `npm run test:units`
- **Tujuan:** Units — fitting an asset into a vehicle.
- **RPC diuji (9):** `assign_asset()`, `assignable_assets()`, `assignable_employees()`, `create_asset()`, `install_asset_to_unit()`, `master_create()`, `master_list()`, `remove_asset_from_unit()`, `unit_assets()`
- **Tabel dibaca langsung:** `asset_conditions`, `asset_status_changes`, `asset_statuses`, `assets`, `categories`, `locations`, `movements`
- **Aturan yang dibuktikan harfiah:** — (tidak mengutip pesan galat apa pun)

<details><summary>23 kasus uji</summary>

| # | Baris | Kasus |
| ---: | ---: | --- |
| 1 | 67 | a unit without a code is refused |
| 2 | 78 | a unit without a location is refused |
| 3 | 101 | a unit lists its code and location |
| 4 | 112 | the three companies are seeded |
| 5 | 113 | Stargate Pasific Resources is one of them |
| 6 | 141 | a blank reason is refused |
| 7 | 152 | it reports the unit back |
| 8 | 162 | unit_id is set |
| 9 | 163 | status becomes 'Installed' |
| 10 | 167 | the reason is recorded, and it is the one given |
| 11 | 183 | it is not offered |
| 12 | 198 | refitting to a unit elsewhere succeeds |
| 13 | 203 | the asset is now at Head Office |
| 14 | 204 | and it belongs to LV-007 |
| 15 | 208 | one movement row records the trip |
| 16 | 209 | ...naming the unit in its remarks |
| 17 | 222 | it says where it came from |
| 18 | 232 | unit_id is cleared |
| 19 | 233 | status returns to 'Available' |
| 20 | 239 | removing it twice is refused |
| 21 | 262 | it is refused, and the message names the holder |
| 22 | 272 | an empty unit reports nothing |
| 23 | 283 | a Viewer is refused |

</details>

---

## 3. Matriks keterlacakan

### 3.1 Dua tingkat keterlacakan, dan bedanya penting

Memetakan aturan ke suite dapat dilakukan dua cara, dan menyamakan keduanya
akan melebih-lebihkan cakupan:

| Tingkat | Arti | Kekuatan bukti |
| --- | --- | --- |
| **Kuat** | Suite memuat **teks pesan galatnya secara harfiah** — jadi ia benar-benar memaksa cabang itu berjalan lalu memeriksa kalimatnya | Tinggi. Cabang itu terbukti dieksekusi |
| **Lemah** | Suite memanggil fungsi yang memuat aturan itu, tetapi tidak menyebut pesannya | Rendah. Fungsinya jalan, cabang aturannya belum tentu |

```sh
# tingkat kuat: cari teks pesan di dalam berkas suite
grep -rn "This asset is already assigned" tests/
```

### 3.2 Hasil

| Tingkat | Jumlah aturan | Persen |
| --- | ---: | ---: |
| Kuat — pesannya dikutip suite | **36** | 21% |
| Lemah — hanya fungsinya tersentuh | 106 | 61% |
| **Tidak tersentuh sama sekali** | **29** | 16% |
| Total aturan lapisan RPC | 171 | 100% |

Angka yang jujur untuk naskah adalah **yang kuat**: 679 assertion membuktikan
36 dari 171 aturan lapisan RPC secara langsung. Sisanya bukan berarti
salah — hanya belum terbukti oleh suite.

### 3.3 Matriks: aturan × suite (hanya keterlacakan kuat)

Baris adalah aturan yang pesannya dikutip setidaknya satu suite. Sel kosong
berarti suite itu tidak menyebutnya.

| Aturan | Modul | Pesan | Suite |
| --- | --- | --- | --- |
| `BR-105` | M1 | `Only a Super Admin can manage accounts` | `accounts` |
| `BR-120` | M3 | `Enter a name first` | `master-data` |
| `BR-127` | M4 | `An asset can carry five photos. Remove one first.` | `asset-photos` |
| `BR-130` | M4 | `Asset not found` | `assign-movement`, `status-changes` |
| `BR-135` | M4 | `Only a Super Admin may edit the asset code` | `asset-register` |
| `BR-136` | M4 | `Only a Super Admin may set the whole asset code` | `asset-code` |
| `BR-137` | M4 | `Photo not found` | `asset-photos` |
| `BR-138` | M4 | `Photo path does not belong to this asset` | `asset-photos`, `asset-register` |
| `BR-142` | M4 | `Serial number already registered` | `asset-register`, `master-data` |
| `BR-144` | M4 | `That asset number is too long` | `asset-code` |
| `BR-146` | M4 | `That location is outside your scope` | `assign-movement` |
| `BR-147` | M4 | `The asset number must be digits` | `asset-code` |
| `BR-153` | M5 | `A batch is limited to 500 labels` | `asset-tags` |
| `BR-154` | M5 | `Choose which location these labels are for` | `asset-tags` |
| `BR-155` | M5 | `Detach the label from its asset before voiding it` | `asset-tags` |
| `BR-156` | M5 | `How many labels do you need?` | `asset-tags` |
| `BR-157` | M5 | `Say why the label is being voided` | `asset-tags` |
| `BR-158` | M5 | `That label has been voided` | `asset-tags` |
| `BR-161` | M5 | `That label is already on another asset` | `asset-tags` |
| `BR-162` | M5 | `That label is not one of ours` | `asset-tags` |
| `BR-166` | M5 | `You do not have permission to create tags` | `asset-tags` |
| `BR-168` | M5 | `You do not have permission to void a label` | `asset-tags` |
| `BR-170` | M6 | `Assignment date is required` | `assign-movement` |
| `BR-172` | M6 | `Destination must be different from the origin` | `assign-movement` |
| `BR-174` | M6 | `Expected return cannot be before the assignment date` | `assign-movement` |
| `BR-179` | M6 | `Return date cannot be before the assignment date` | `assign-movement` |
| `BR-181` | M6 | `Select a reason` | `assign-movement` |
| `BR-182` | M6 | `Select an asset to continue` | `assign-movement` |
| `BR-183` | M6 | `Select an employee to continue` | `assign-movement` |
| `BR-187` | M6 | `This asset has no active assignment` | `assign-movement` |
| `BR-189` | M6 | `This asset is already assigned` | `assign-movement` |
| `BR-192` | M6 | `You do not have permission to assign assets` | `assign-movement` |
| `BR-194` | M6 | `You do not have permission to move assets` | `assign-movement` |
| `BR-198` | M7 | `BAST not found` | `ebast-signature` |
| `BR-201` | M7 | `File path does not belong to this BAST` | `bast` |
| `BR-220` | M7 | `You do not have permission to upload a signed BAST` | `bast` |

36 aturan terbukti harfiah oleh 10 suite berbeda.

### 3.4 Cakupan per modul

| Modul | Aturan RPC | Kuat | Lemah | Tidak tersentuh |
| --- | ---: | ---: | ---: | ---: |
| M1 — Sesi, identitas, dan otorisasi | 6 | 1 | 5 | **0** |
| M2 — Manajemen akun | 7 | 0 | 4 | **3** ⚠ |
| M3 — Master data | 12 | 1 | 10 | **1** |
| M4 — Register aset, foto, dan status | 27 | 10 | 16 | **1** |
| M5 — Label dan pemindaian | 16 | 10 | 1 | **5** |
| M6 — Penugasan, perpindahan, dan unit | 27 | 11 | 16 | **0** |
| M7 — E-BAST | 26 | 3 | 9 | **14** ⚠ |
| M8 — Perlengkapan | 22 | 0 | 22 | **0** |
| M9 — Perawatan | 9 | 0 | 7 | **2** |
| M10 — Dokumen aset | 8 | 0 | 8 | **0** |
| M11 — Impor CSV | 6 | 0 | 4 | **2** |
| M13 — Notifikasi dan job terjadwal | 3 | 0 | 3 | **0** |
| M14 — Audit dan trigger generik | 2 | 0 | 1 | **1** ⚠ |

---

## 4. Aturan bisnis yang BELUM diuji sama sekali

Bagian yang diminta tidak dilewati meski hasilnya tidak enak dilihat.

**29 dari 171 aturan lapisan RPC** tidak tersentuh suite mana pun —
tidak dikutip, dan fungsinya pun tidak pernah dipanggil dari `tests/`.

### M2 — Manajemen akun (3 aturan)

| Aturan | Pesan galat | Fungsi | Mengapa penting |
| --- | --- | --- | --- |
| `BR-107` | `% has % behind them. Set them to Inactive instead — deleting would leave those records naming nobody.` | `delete_account()` | |
| `BR-110` | `Say why this person is being deleted` | `delete_account()` | |
| `BR-113` | `You cannot delete your own account` | `delete_account()` | |

### M3 — Master data (1 aturan)

| Aturan | Pesan galat | Fungsi | Mengapa penting |
| --- | --- | --- | --- |
| `BR-125` | `Unknown master data entity: %` | `master_assert_entity()` | |

### M4 — Register aset, foto, dan status (1 aturan)

| Aturan | Pesan galat | Fungsi | Mengapa penting |
| --- | --- | --- | --- |
| `BR-132` | `Could not allocate an asset code for %` | `next_asset_code()` | |

### M5 — Label dan pemindaian (5 aturan)

| Aturan | Pesan galat | Fungsi | Mengapa penting |
| --- | --- | --- | --- |
| `BR-159` | `That label is % stock — it cannot go on a % asset` | `assert_tag_location()` | |
| `BR-160` | `That label is already on %` | `attach_tag()` | |
| `BR-163` | `That label was voided and cannot be used again` | `attach_tag()` | |
| `BR-164` | `This asset already carries label %` | `attach_tag()` | |
| `BR-167` | `You do not have permission to label this asset` | `attach_tag()` | |

### M7 — E-BAST (14 aturan)

| Aturan | Pesan galat | Fungsi | Mengapa penting |
| --- | --- | --- | --- |
| `BR-196` | `% has %. Void it instead — a signed document is the evidence a handover happened, and deleting it would remove the proof rather than the mistake.` | `delete_bast()` | |
| `BR-202` | `Only a Super Admin can delete a document` | `delete_bast()` | |
| `BR-203` | `Say why this document is being deleted` | `delete_bast()` | |
| `BR-204` | `Say why this document is being voided` | `void_bast()` | |
| `BR-205` | `Signature has too many strokes` | `validate_signature_strokes()` | |
| `BR-206` | `Signature is not in the expected format` | `validate_signature_strokes()` | |
| `BR-207` | `Signature is out of bounds` | `validate_signature_strokes()` | |
| `BR-208` | `Signature is too large` | `validate_signature_strokes()` | |
| `BR-209` | `That document is already void` | `void_bast()` | |
| `BR-210` | `That signature is too short — please sign again` | `validate_signature_strokes()` | |
| `BR-213` | `This BAST is already signed — its kind cannot change` | `set_bast_kind()` | |
| `BR-214` | `Unknown kind of document` | `set_bast_kind()` | |
| `BR-218` | `You do not have permission to generate this document` | `attach_generated_bast()` | |
| `BR-221` | `You do not have permission to void this document` | `void_bast()` | |

### M9 — Perawatan (2 aturan)

| Aturan | Pesan galat | Fungsi | Mengapa penting |
| --- | --- | --- | --- |
| `BR-248` | `Unknown state` | `update_maintenance()` | |
| `BR-249` | `What is being done?` | `open_maintenance()` | |

### M11 — Impor CSV (2 aturan)

| Aturan | Pesan galat | Fungsi | Mengapa penting |
| --- | --- | --- | --- |
| `BR-264` | `Unknown lookup %` | `import_lookup()` | |
| `BR-266` | `unparseable date` | `import_date()` | |

### M14 — Audit dan trigger generik (1 aturan)

| Aturan | Pesan galat | Fungsi | Mengapa penting |
| --- | --- | --- | --- |
| `BR-271` | `This table is append-only` | `forbid_mutation()` | |

Kolom terakhir sengaja dibiarkan kosong — penilaian mana yang layak diuji
lebih dulu adalah keputusan Anda, bukan saya.

### 4.1 Pola yang terlihat dari daftar itu

Empat belas dari 29 ada di modul **E-BAST**, dan itu masuk akal begitu
dilihat: modul itu punya paling banyak aturan (jalur tanda tangan, void,
hapus draf, lampiran PDF), sementara lima suite BAST-nya berfokus pada jalur
bahagia dan pada satu-dua penolakan saja.

Lima di modul **Label** seluruhnya milik satu fungsi: **`attach_tag()`**,
ditambah helper `assert_tag_location()` yang dipanggilnya.

| Aturan | Pesan |
| --- | --- |
| BR-159 | `That label is % stock — it cannot go on a % asset` |
| BR-160 | `That label is already on %` |
| BR-163 | `That label was voided and cannot be used again` |
| BR-164 | `This asset already carries label %` |
| BR-167 | `You do not have permission to label this asset` |

Ini celah yang tajam. Modul label punya **dua** jalur penempelan:

| Fungsi | Kegunaan | Diuji? |
| --- | --- | --- |
| `tag_asset()` | Membuat aset **baru** sekaligus menempelkan stikernya | **Ya** — `asset-tags.mjs` |
| `attach_tag()` | Menempelkan stiker **yang sudah ada** ke aset **yang sudah ada** | **Tidak sama sekali** |

`asset-tags.mjs` menguji tujuh RPC — termasuk `void_tag()` lengkap dengan kasus
alasan kosong dan kasus stiker yang sedang dipakai (`tests/asset-tags.mjs:268`,
`:275`, `:282`) — tetapi **tidak pernah memanggil `attach_tag()`**. Padahal
justru `attach_tag()` yang memuat aturan pencocokan lokasi antara stiker dan
aset, dan aturan itulah yang menurut header migrasinya ada karena *"a
mislabelled asset is the one error this system cannot detect after the fact"*
(`supabase/migrations/20260730080000_asset_tags.sql:19-22`).

`attach_tag()` juga dipakai importir: `import_assets()` menempelkan stiker lewat
fungsi ini, supaya stiker hasil impor tidak dapat dibedakan dari yang ditempel
manual. Jadi jalur yang tidak diuji itu juga jalur yang dilalui impor massal.

### 4.2 Aturan lapisan skema: tidak dipetakan

BR-001 sampai BR-016 (CHECK constraint dan unique index) **tidak** masuk
matriks di atas. Alasannya metodologis: aturan skema tidak melempar pesan
yang dapat dicocokkan, dan pelanggarannya muncul sebagai kode galat
PostgreSQL (`23514`, `23505`). Menandainya "tidak diuji" akan menyesatkan,
karena beberapa memang diuji — `asset-tags.mjs` misalnya menguji siklus
`untagged → tagged → void` yang justru dijaga BR-005.
`[BELUM TERVERIFIKASI — pemetaan BR-001..016 ke suite; memerlukan penelusuran
per assertion untuk menentukan constraint mana yang benar-benar dipicu.]`

### 4.3 Yang tidak dapat dijawab dokumen ini

| Pertanyaan | Mengapa tidak terjawab |
| --- | --- |
| Apakah 679 assertion itu semuanya LULUS? | Suite belum pernah dijalankan dalam sesi ini — butuh stack Supabase lokal, dan disk mesin ini penuh |
| Berapa cakupan baris (line coverage) kode SQL? | Tidak ada alat cakupan untuk PL/pgSQL di repositori ini |
| Apakah suite mendeteksi regresi yang sebenarnya? | Butuh riwayat kegagalan; CI hanya menjalankan 1 dari 23 pada tiap push |

**Angka di seluruh dokumen ini adalah cakupan statis** — apa yang suite
*sebutkan*, bukan apa yang suite *buktikan saat dijalankan*. Perbedaan itu
perlu dinyatakan di naskah.
`[BELUM TERVERIFIKASI — hasil eksekusi 23 suite; jalankan `supabase start &&
supabase db reset && npm test`.]`

---

## 5. Ringkasan angka

| Besaran | Nilai | Perintah |
| --- | ---: | --- |
| Berkas di `tests/` | 25 | `ls -1 tests/*.mjs \| wc -l` |
| Helper (berawalan `_`) | 2 | `ls -1 tests/_*.mjs` |
| Suite | 23 | `ls -1 tests/*.mjs \| grep -v '/_' \| wc -l` |
| Assertion | 679 | pemindaian literal `check('...')` |
| Baris kode suite | 6.123 | `cloc tests --force-lang=JavaScript,mjs` |
| Suite dijalankan CI tiap push | 1 | `.github/workflows/ci.yml:55-56` |
| Aturan RPC terbukti harfiah | 36 / 171 | §3.2 |
| Aturan RPC tanpa sentuhan | 29 / 171 | §4 |
