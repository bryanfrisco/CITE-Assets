# Cara Mencetak Label Barcode — Epson LW-700

Panduan ini khusus untuk mencetak stiker label. Untuk hal lain, lihat
`PANDUAN-PENGGUNA.md`.

Yang dipakai di sini: **Epson LW-700** dengan pita **24 mm** (LK-6WBVN, hitam di
atas putih vinyl).

---

## Ringkasan dalam satu kalimat

Aplikasi menerbitkan kode → kirim file CSV ke PC → Epson Label Editor menggambar
barcode-nya dan mencetak seluruh batch sekali jalan lewat kabel USB.

---

## Yang perlu dipahami dulu

**LW-700 tidak bisa dicetak dari HP.** Sambungannya hanya USB ke PC. Tidak ada
Bluetooth, tidak ada Wi-Fi. Yang bisa dicetak dari HP itu seri berakhiran "P"
seperti LW-600P. Ini batas mesinnya, bukan batasan aplikasi.

**Barcode-nya digambar oleh Label Editor, bukan oleh aplikasi.** File CSV hanya
berisi teks. Label Editor yang mengubah teks itu jadi barcode saat mencetak —
dan itu justru bagus, karena dia menggambarnya di resolusi printer, bukan
resolusi HP.

**Jenisnya Code 128.** Aplikasi juga bisa QR kalau Anda pilih di layar Labels,
dan scanner membaca keduanya. Barcode jadi default karena pada pita 24 mm
batangnya bisa memakai seluruh lebar, kodenya terbaca di bawahnya, dan scanner
laser murah membacanya dari jarak lebih jauh daripada QR.

**Kode diterbitkan sebelum file dibuat.** Begitu Anda menekan tombol, kode-kode
itu sudah tercatat di database sebagai stiker kosong. Kalau proses cetaknya
gagal di tengah jalan, kode itu tetap ada dan bisa diekspor ulang — tidak
hilang.

---

## Sekali saja: siapkan PC

1. Sambungkan LW-700 ke PC dengan kabel USB.
2. Tekan tombol bergambar laptop di kiri bawah mesin. Itu mode **PC-link** —
   layar mesin akan menampilkan indikator PC.
3. Di PC, pasang **Epson Label Editor**. Unduh dari situs support Epson, cari
   model LW-700. Driver printernya ikut dalam paket yang sama.
4. Buka Label Editor sekali, pastikan LW-700 terdeteksi sebagai printer.

Kalau mesin tidak terdeteksi: cabut USB, matikan mesin, nyalakan lagi, tekan
tombol PC-link, baru colok USB.

---

## Langkah 1 — Terbitkan label di aplikasi

1. Buka **More → Labels**.
2. Isi **How many labels**. Isi sesuai kebutuhan; batas maksimal 500 per batch.
3. Pilih **Tape width**: **24 mm**.
4. Tekan **Issue and export**.

Aplikasi akan membagikan **dua file** berturut-turut:

| File                  | Untuk apa                                       |
| --------------------- | ----------------------------------------------- |
| `labels-xxxxxxxx.csv` | **Ini yang dipakai LW-700**                     |
| PDF                   | Cadangan, untuk printer biasa (lihat Langkah 5) |

Kirim **file CSV** ke PC — lewat email ke diri sendiri, Google Drive, WhatsApp
Web, atau kabel. Terserah, yang penting file-nya sampai ke PC.

> Kalau share sheet muncul dua kali, itu memang benar: yang pertama CSV, yang
> kedua PDF. Kirim keduanya kalau ragu.

---

## Langkah 2 — Sekali saja: buat template di Label Editor

Template ini dibuat **satu kali**, lalu disimpan dan dipakai selamanya.

1. Buka **Epson Label Editor**.
2. Buat label baru. Pilih lebar pita **24 mm**.
3. Atur panjang label: **Fixed length**, isi **62 mm**.
   (Kalau dibiarkan "Auto", panjang tiap stiker akan berbeda-beda mengikuti
   isinya, dan hasilnya tidak rapi saat ditempel berjajar.

   Kenapa 62 mm: barcode `CT-000123` terdiri dari 134 modul, 154 dengan quiet
   zone. Diuji dengan dekoder zxing-cpp pada render bersih 180 dpi, 48 mm masih
   terbaca dan 40 mm tidak. Jadi 48 mm sebenarnya cukup — 62 mm dipilih sebagai
   margin antara render bersih dan stiker sungguhan: tinta thermal melebar,
   vinyl meregang di tutup laptop yang melengkung, dan kamera HP membaca dari
   sudut miring dengan cahaya seadanya. Tidak satu pun dari itu ada di dalam
   pengujian, dan semuanya memakan modul yang sama.)

4. Taruh **dua objek** di atas kanvas:

   **Objek pertama — barcode**
   - Menu **Insert → Barcode** (atau ikon barcode di toolbar)
   - Jenis: **CODE128** — bukan CODE39, bukan EAN
   - Lebar: hampir selebar label, sisakan **2 mm** di kiri dan kanan
   - Tinggi: sekitar **10 mm**
   - Matikan opsi "print human readable text" kalau ada — teksnya kita taruh
     sendiri di objek kedua supaya fontnya bisa diatur

   **Objek kedua — teks**
   - Menu **Insert → Text**
   - Posisi: di bawah barcode, rata tengah
   - Font: apa saja yang jelas, ukuran ±10–12 pt, tebal
   - Isi sementara: ketik `CT-000000` supaya Anda bisa melihat ukurannya

5. Simpan template ini, misalnya `cite-label-24mm.lbl`.

---

## Langkah 3 — Hubungkan template ke file CSV (data merge)

Ini bagian yang membuat pencetakan jadi bulk.

1. Di Label Editor, buka menu **File → Import/Link Database** — namanya bisa
   sedikit berbeda tergantung versi. Cari kata **Database**, **Data merge**,
   atau **Mail merge**.
2. Pilih file CSV yang Anda kirim dari HP.
3. Centang opsi bahwa **baris pertama adalah nama kolom** (_first row contains
   field names_). Kalau tidak dicentang, tulisan `qr` dan `code` akan ikut
   tercetak sebagai stiker pertama.
4. Setelah terhubung, Label Editor menampilkan daftar kolom: **qr**, **code**,
   **caption**.
5. Ikat objek ke kolom:
   - Klik objek **barcode** → cari properti **Field** / **Data source** → pilih
     kolom **`code`**
   - Klik objek **teks** → pilih kolom **`code`** juga
6. Simpan template lagi.

Kolom `qr` dan `code` isinya sama persis. Dipisah supaya template QR dan
template barcode bisa hidup berdampingan tanpa saling mengganggu: kalau suatu
saat Anda ingin kembali ke QR, ikat objek QR ke kolom `qr` dan sisanya tidak
berubah.

---

## Langkah 4 — Cetak

1. Pastikan mesin dalam mode PC-link dan pita 24 mm terpasang.
2. Di Label Editor: **File → Print**.
3. Pilih **Print all records** (atau _All_ pada bagian database/merge).
4. Opsi yang layak dinyalakan:
   - **Auto cut** — mesin memotong tiap stiker. Kalau dimatikan, semuanya keluar
     sebagai satu pita panjang dan harus dipotong manual.
   - **Half cut** — memotong lapisan stikernya saja, kertas belakangnya utuh.
     Ini yang paling enak dikupas satu per satu.
5. Tekan Print.

**Cetak 3 dulu sebagai uji coba** sebelum mencetak 100. Cek dengan aplikasi:
buka **+ → Scan Label** dan arahkan ke stiker yang baru keluar. Kalau terbaca
dan aplikasi membuka form aset baru, berarti sudah benar.

---

## Langkah 5 — Kalau tidak ada LW-700

Pakai file **PDF** dari Langkah 1. Ukurannya sudah pas: **62 × 18 mm** per
halaman untuk pita 24 mm dengan barcode, satu label per halaman. (Kalau Anda
pilih QR, jadi 48 × 18 mm.)

Cetak di kertas stiker A4 biasa dengan pengaturan:

- **Actual size** / **100%** — jangan **Fit to page**, karena itu akan
  memperbesar dan QR-nya jadi tidak sesuai ukuran
- Potong manual mengikuti tepi tiap label

Ini hanya untuk sementara. Stiker vinyl dari LW-700 tahan gesekan dan tidak
lepas dari bodi laptop; stiker kertas A4 akan mengelupas dalam hitungan minggu.

---

## Setelah stiker tercetak

1. Tempel di barangnya. Untuk laptop, tempat yang bagus adalah bagian bawah
   dekat engsel — tidak terkena tangan, tidak terkelupas di dalam tas.
2. Buka aplikasi → **+ → Scan Label** → arahkan ke barcode.
3. Aplikasi membuka form aset baru. Isi datanya, simpan.

Stiker itu berubah dari **Blank** menjadi **In use**, dan sejak itu menempel
permanen pada satu aset. Satu stiker tidak bisa dipindahkan ke barang lain —
kalau salah tempel, tandai stikernya **Void** dan pakai yang baru.

Sisa stiker yang belum tertempel tetap terhitung di **More → Labels** sebagai
**Blank**, jadi Anda selalu tahu berapa yang masih ada di laci.

---

## Kalau bermasalah

| Gejala                               | Penyebab dan solusi                                                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Stiker pertama isinya tulisan `code` | Opsi _first row contains field names_ belum dicentang. Ulangi Langkah 3 poin 3.                                      |
| Hanya 1 stiker yang keluar           | Anda menekan Print biasa, bukan _Print all records_.                                                                 |
| Barcode terpotong di tepi            | Objeknya terlalu dekat ke tepi. Beri jarak minimal 2 mm kiri-kanan — itu _quiet zone_, dan scanner butuh melihatnya. |
| Barcode tidak terbaca saat di-scan   | Terlalu rapat, atau quiet zone-nya hilang. Panjangkan label ke 62 mm dan sisakan 2 mm kosong di kedua ujung.         |
| Panjang stiker berbeda-beda          | Panjang label masih "Auto". Ubah ke Fixed 62 mm.                                                                     |
| Mesin tidak terdeteksi               | Belum ditekan tombol PC-link, atau kabel USB hanya kabel charge tanpa jalur data.                                    |
| Karakter aneh di kolom               | CSV dibuka dulu di Excel lalu disimpan ulang. Pakai file aslinya, jangan lewat Excel.                                |
| File CSV hilang di HP                | Buka **More → Labels**, filter **Blank**, tekan **Re-export these labels**. Kode yang sama keluar lagi.              |

---

## Yang perlu diingat

**Jangan mencetak ulang batch yang sama dua kali** kecuali stiker lamanya
memang hilang. Kode yang sama di dua stiker fisik berarti dua barang berbeda
akan mengaku sebagai aset yang sama — dan itu satu-satunya kesalahan yang tidak
bisa dideteksi sistem setelah terjadi, karena stiker adalah satu-satunya
penghubung fisik antara barang dan catatannya.

Kalau ragu apakah sebuah batch sudah tercetak, buka **More → Labels** dan lihat
daftarnya. Yang berstatus **Blank** berarti sudah diterbitkan tapi belum
ditempel di apa pun.
