# Cara Mencetak Label QR — Epson LW-700

Panduan ini khusus untuk mencetak stiker label. Untuk hal lain, lihat
`PANDUAN-PENGGUNA.md`.

Yang dipakai di sini: **Epson LW-700** dengan pita **24 mm** (LK-6WBVN, hitam di
atas putih vinyl).

---

## Ringkasan dalam satu kalimat

Aplikasi menerbitkan kode → kirim file CSV ke PC → Epson Label Editor menggambar
QR-nya dan mencetak seluruh batch sekali jalan lewat kabel USB.

---

## Yang perlu dipahami dulu

**LW-700 tidak bisa dicetak dari HP.** Sambungannya hanya USB ke PC. Tidak ada
Bluetooth, tidak ada Wi-Fi. Yang bisa dicetak dari HP itu seri berakhiran "P"
seperti LW-600P. Ini batas mesinnya, bukan batasan aplikasi.

**QR-nya digambar oleh Label Editor, bukan oleh aplikasi.** File CSV hanya
berisi teks. Label Editor yang mengubah teks itu jadi QR saat mencetak — dan itu
justru bagus, karena dia menggambarnya di resolusi printer, bukan resolusi HP.

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
3. Atur panjang label: **Fixed length**, isi **48 mm**.
   (Kalau dibiarkan "Auto", panjang tiap stiker akan berbeda-beda mengikuti
   isinya, dan hasilnya tidak rapi saat ditempel berjajar.)
4. Taruh **dua objek** di atas kanvas:

   **Objek pertama — QR**
   - Menu **Insert → Barcode** (atau ikon barcode di toolbar)
   - Jenis: **QR Code**
   - Ukuran: sekitar **16 × 16 mm**
   - Posisi: rapat ke kiri, beri jarak ±2 mm dari tepi

   **Objek kedua — teks**
   - Menu **Insert → Text**
   - Posisi: di sebelah kanan QR
   - Font: apa saja yang jelas, ukuran ±14–16 pt, tebal
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
   - Klik objek **QR** → cari properti **Field** / **Data source** → pilih
     kolom **`qr`**
   - Klik objek **teks** → pilih kolom **`code`**
6. Simpan template lagi.

Kolom `qr` dan `code` isinya sama persis. Dipisah supaya Anda bisa mengubah
salah satunya tanpa mengganggu yang lain — misalnya nanti ingin teksnya
dipendekkan tapi QR-nya tetap penuh.

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

Pakai file **PDF** dari Langkah 1. Ukurannya sudah pas: **48 × 18 mm** per
halaman untuk pita 24 mm, satu label per halaman.

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
2. Buka aplikasi → **+ → Scan Label** → arahkan ke QR.
3. Aplikasi membuka form aset baru. Isi datanya, simpan.

Stiker itu berubah dari **Blank** menjadi **In use**, dan sejak itu menempel
permanen pada satu aset. Satu stiker tidak bisa dipindahkan ke barang lain —
kalau salah tempel, tandai stikernya **Void** dan pakai yang baru.

Sisa stiker yang belum tertempel tetap terhitung di **More → Labels** sebagai
**Blank**, jadi Anda selalu tahu berapa yang masih ada di laci.

---

## Kalau bermasalah

| Gejala                             | Penyebab dan solusi                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Stiker pertama isinya tulisan `qr` | Opsi _first row contains field names_ belum dicentang. Ulangi Langkah 3 poin 3.                         |
| Hanya 1 stiker yang keluar         | Anda menekan Print biasa, bukan _Print all records_.                                                    |
| QR terpotong di tepi               | Objek QR terlalu dekat ke tepi. Beri jarak minimal 2 mm dari semua sisi.                                |
| QR tidak terbaca saat di-scan      | Ukuran QR terlalu kecil. Minimal 14 mm untuk pita 24 mm.                                                |
| Panjang stiker berbeda-beda        | Panjang label masih "Auto". Ubah ke Fixed 48 mm.                                                        |
| Mesin tidak terdeteksi             | Belum ditekan tombol PC-link, atau kabel USB hanya kabel charge tanpa jalur data.                       |
| Karakter aneh di kolom             | CSV dibuka dulu di Excel lalu disimpan ulang. Pakai file aslinya, jangan lewat Excel.                   |
| File CSV hilang di HP              | Buka **More → Labels**, filter **Blank**, tekan **Re-export these labels**. Kode yang sama keluar lagi. |

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
