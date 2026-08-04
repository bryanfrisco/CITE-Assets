# CITE Assets — Panduan Pengguna

Aplikasi pencatatan aset IT untuk tim Corporate IT (CITE), mencakup Head Office (Jakarta)
dan Site (Konawe).

Dokumen ini ditulis untuk orang yang akan memakainya setiap hari, bukan untuk yang
membangunnya. Kalau Anda mencari alasan teknis di balik sebuah keputusan, itu ada di
komentar kode dan di `README-DEV.md`.

---

## 1. Masuk pertama kali

1. Pasang APK-nya. Android akan bertanya soal "instal dari sumber tidak dikenal" —
   izinkan, karena aplikasi ini memang dibagikan langsung, belum lewat Play Store.
2. Buka aplikasi, masuk dengan akun yang diberikan.

Akun awal:

| Email             | Kata sandi  | Peran       |
| ----------------- | ----------- | ----------- |
| `admin@aspire.id` | `Aspire123` | Super Admin |

**Ganti kata sandi ini begitu ada akun lain yang bisa masuk.** Caranya ada di §7.

Kalau muncul _"cannot reach server"_, itu jaringan, bukan aplikasi. Coba matikan Wi-Fi dan
pakai data seluler sekali untuk memastikan.

---

## 2. Peta layar

Empat tombol di bawah, satu tombol **+** di tengah.

| Tombol     | Isinya                                                                          |
| ---------- | ------------------------------------------------------------------------------- |
| **Home**   | Ringkasan: jumlah aset, sebaran status, aktivitas terakhir                      |
| **Assets** | Daftar aset, pencarian, filter status                                           |
| **E-BAST** | Semua berita acara serah terima                                                 |
| **More**   | Movement, Labels, Maintenance, Import, Reports, Master data, Accounts, Settings |

Tombol **+** memuat lima tindakan yang paling sering: Scan Label, Add Asset, Assign Asset,
Transfer Asset, Generate E-BAST.

**Lingkup lokasi.** Di header ada chip lokasi. Isinya menentukan apa yang Anda lihat di
seluruh aplikasi — Dashboard, Assets, E-BAST, Documents, Reports, semuanya ikut. Kalau
sebuah aset "hilang", periksa chip ini lebih dulu.

---

## 3. Alur utama: dari barang datang sampai terpakai

Ini urutan yang dipakai sehari-hari. Ikuti sekali saja, sisanya jadi jelas.

### 3.1 Cetak stiker label

**More → Labels → Print a batch**

1. Isi jumlah label, pilih lebar pita (default 24 mm, sesuai kaset di printer).
2. Tekan **Issue and export**.
3. Aplikasi membagikan **dua file**: CSV dan PDF.

Kode labelnya diterbitkan ke database **sebelum** file dibuat. Kalau terbalik, bisa ada
kode tercetak di pita yang tidak dikenal sistem — dan tim baru sadar saat stikernya sudah
menempel di barang.

**Mencari label.** Di bawah daftar ada kolom pencarian: ketik kode stiker (`CT-000001`),
kode aset, atau nama barangnya.

**Melihat isi satu label.** Ketuk barisnya. Yang muncul: gambar **barcode dan QR**-nya,
barang yang ditempeli, statusnya, dan riwayat kapan dicetak / ditempel / dibatalkan.
Keduanya ditampilkan supaya bisa dibandingkan dengan stiker yang ada di tangan — itu cara
tercepat membedakan "scanner-nya rusak" dari "datanya beda".

### 3.2 Cetak di printer Epson LW-700

**LW-700 tidak bisa dicetak dari HP.** Sambungannya hanya USB ke PC; tidak ada Bluetooth
maupun Wi-Fi. Itu batas perangkat kerasnya, bukan pilihan aplikasi.

Jalur yang bekerja:

1. Kirim file **CSV** dari HP ke PC (email, Drive, atau kabel).
2. Buka **Epson Label Editor** di PC, colok LW-700 lewat USB.
3. Buat satu template: satu objek QR + satu objek teks.
4. Pakai fitur **data merge** (gabung data), arahkan ke file CSV, ikat objek QR ke kolom
   `qr` dan objek teks ke kolom `code`.
5. Cetak — seluruh batch keluar sekali jalan.

File **PDF** adalah cadangan: sudah tertata seukuran pita, satu label per halaman, untuk
printer apa pun selain LW-700.

### 3.3 Tempel dan daftarkan

1. Tempel stiker di barangnya.
2. Di aplikasi: tombol **+ → Scan Label**, arahkan kamera ke QR.
3. Aplikasi akan bereaksi sesuai keadaan stiker:

| Yang terjadi             | Artinya                                            |
| ------------------------ | -------------------------------------------------- |
| Membuka form aset baru   | Stiker masih kosong — isi datanya, aset terdaftar  |
| Membuka halaman aset     | Stiker sudah menempel di aset itu                  |
| "Not one of ours"        | Bukan stiker terbitan sistem ini                   |
| "Outside your locations" | Asetnya ada, tapi di lokasi yang tidak Anda pegang |

Aset juga bisa didaftarkan tanpa stiker: **+ → Add Asset**.

### 3.4 Serahkan ke orang

**+ → Assign Asset** — tiga langkah: pilih orang, pilih aset, konfirmasi.

Di langkah terakhir ada saklar **Auto-generate E-BAST**. Biarkan menyala kalau serah
terimanya perlu dokumen.

Setelah selesai: status aset jadi _Assigned_, pemegangnya tercatat, riwayat penugasan
bertambah, dan kalau lokasinya berpindah, satu baris movement ikut tercatat.

### 3.5 Terima kembali

**+ → Assign Asset**, pilih mode Return. Bedanya dengan penyerahan: ada isian **Condition
on return** yang wajib.

Saklar E-BAST tetap ada, dan sebaiknya dibiarkan menyala: pengembalian menghasilkan
**Berita Acara Penarikan Barang** — surat yang membuktikan barangnya sudah kembali,
ditandatangani dua pihak persis seperti serah terima.

---

## 4. E-BAST — serah terima digital

**E-BAST** menggantikan BAST kertas. Semuanya digital, termasuk tanda tangannya.

Ada **dua jenis surat**, satu tampilan, satu urutan nomor:

| Jenis            | Kapan terbit          | Kolom kiri       | Kolom kanan     |
| ---------------- | --------------------- | ---------------- | --------------- |
| **Serah Terima** | saat aset di-_assign_ | Yang Menyerahkan | Yang Menerima   |
| **Penarikan**    | saat aset di-_return_ | Yang Menerima    | Yang Memberikan |

Kolom kiri selalu pihak Divisi IT. Di layar E-BAST ada chip **All / Serah Terima /
Penarikan** untuk memisahkannya.

### Rincian barang

Tabel `No | Jenis/Type | Serial Number | Kondisi` di surat bisa diisi lebih dari satu
baris — laptop, charger, mouse. Buka surat → kartu **Rincian barang** → **Edit the list**.

Charger dan mouse **tidak** menjadi aset di register: barang seperti itu tidak punya
serial dan tidak perlu didaftar. Mereka hanya ada di kertas. Kalau daftarnya tidak pernah
disentuh, surat mencetak satu baris berisi aset itu sendiri.

Begitu surat berstatus **Signed**, daftarnya terkunci. Tanda tangan harus menjamin isi
yang tidak berubah lagi.

### Jabatan

Baris `Jabatan` di surat diambil dari data orangnya. Isi lewat **More → Accounts → pilih
orang → Jabatan**. Kalau kosong, surat mencetak tanda `-`.

### 4.1 Nomor dokumen

Nomor E-BAST dibuat oleh database, bukan oleh aplikasi di HP. Formatnya
`BAST/CITE/2026/0001`. Tidak ada cara membuat atau mengubahnya dari layar mana pun — itu
disengaja, supaya dua orang yang menekan tombol bersamaan tidak mendapat nomor yang sama.

### 4.2 Menandatangani

Buka E-BAST → kartu **Tanda tangan** → pilih blok:

- **Yang Menyerahkan** — pilih orangnya dari daftar. Kalau belum ada, tekan **Add someone
  who is not on the list**, isi nama dan jabatan. Orang ini tidak perlu punya akun login.
- **Yang Menerima** — sudah terisi otomatis dari data penugasan, tidak bisa diubah di sini.
  Kalau salah, yang perlu diperbaiki adalah penugasannya, bukan dokumennya.

Lalu tanda tangan langsung dengan jari di kotak putih, dan tekan **Simpan tanda tangan**.

**Begitu tanda tangan kedua masuk, dokumennya langsung terbit.** Status berubah jadi
_Signed_, PDF-nya dibuat dengan tinta tanda tangan di dalamnya, dan salinannya muncul di
tab Documents aset tersebut.

Beberapa hal yang perlu Anda tahu:

- Tanda tangan tidak bisa dihapus. Kalau hasilnya jelek, tanda tangan ulang — yang terbaru
  yang tercetak, yang lama tetap tersimpan di catatan.
- Waktu penandatanganan ikut tercetak di dokumen. Itu yang tidak bisa dibawa oleh tanda
  tangan di atas kertas.
- Kalau pembuatan PDF gagal (jaringan putus), tanda tangannya **sudah aman**. Buka lagi
  dokumennya dan ulangi — tidak ada yang hilang.

### 4.3 Kalau ada yang tanda tangan di kertas

Masih bisa. Kartu **Signed document** → **Upload a signed paper copy**. Statusnya berubah
sama seperti jalur digital.

### 4.4 Kop surat

**Hanya logo ASPIRE.** Logo CITE dan tulisan "CORPORATE IT — CITE" sudah dihapus atas
permintaan Anda; Divisi IT tetap disebut di kalimat isi surat ("dari Divisi IT").

Di kaki halaman tercetak nama dan alamat perusahaan.

> **Satu hal yang masih perlu Anda lakukan:** simpan file logo ASPIRE sebagai
> `assets/aspire-logo.png` di folder proyek, lalu jalankan `npm run build:bast-logo`.
> Sekarang di sana ada berkas kosong sementara, jadi kop tercetak **tanpa** logo ASPIRE.

---

## 5. Memindahkan aset antar lokasi

**More → Movement** (atau **+ → Transfer Asset**).

Perpindahan hanya antara **Head Office** dan **Site**. Isi asal, tujuan, alasan, dan
catatan bila perlu.

**Riwayat perpindahan tidak bisa diubah atau dihapus** — tidak ada tombolnya, dan database
pun menolak kalaupun dicoba lewat jalur lain. Kalau ada yang salah, catat perpindahan baru
yang membetulkannya.

---

## 6. Mengubah status aset (termasuk pemusnahan)

**Buka aset → tombol ⋯ → Change status**

Pilih status baru, lalu **isi alasannya** — ini wajib.

Alasannya wajib karena log otomatis sudah mencatat _siapa_ dan _kapan_, tapi tidak bisa
mencatat _kenapa_. "Available → Retired" dan "Available → Lost" adalah perubahan yang
identik di mata sistem. Enam bulan lagi, saat auditor bertanya laptop itu ke mana, hanya
alasannya yang berguna.

Dua hal yang perlu diketahui:

- **Aset yang masih di tangan orang tidak bisa di-_Retired_ atau _Lost_.** Kembalikan dulu.
  Kalau boleh, register akan menyatakan barang sudah dibuang padahal orangnya masih membawa
  — dan tidak ada laporan yang bisa memberi tahu Anda itu terjadi.
- **Tapi boleh ditandai _Broken_ saat masih dipegang.** Laptop bisa rusak saat dipakai.

_Assigned_ tidak muncul sebagai pilihan — itu hasil dari proses penyerahan, bukan label
yang dideklarasikan.

---

## 7. Akun dan hak akses

**More → Accounts** (hanya Super Admin).

Ada dua jenis orang di sini, dan daftarnya memisahkannya:

- **Can sign in** — orang yang memakai aplikasi.
- **Record only** — orang yang hanya menerima aset. Mereka tetap bisa muncul di E-BAST
  tanpa pernah punya login.

### 7.1 Menambah orang

**Add a person** → isi nama (wajib), NIK, email, telepon, departemen, lokasi.

Kalau orang ini hanya penerima aset, **kosongkan perannya**. Selesai.

### 7.2 Memberi akses login

Buka orangnya → kartu **Sign-in** → isi kata sandi → **Create the sign-in**.

Syaratnya: sudah punya **email** dan **peran**.

Kata sandinya diberikan langsung ke orangnya. Proyek ini belum punya layanan email, jadi
tidak ada cara mengirimkannya otomatis — sampaikan langsung dan minta mereka menggantinya.

### 7.3 Peran

| Peran            | Bisa apa                                            |
| ---------------- | --------------------------------------------------- |
| **Super Admin**  | Semuanya, termasuk akun dan menghapus master data   |
| **Corporate IT** | Semua lokasi · aset, penugasan, E-BAST, master data |
| **Site IT**      | Hanya lokasinya sendiri · aset, penugasan, E-BAST   |
| **Viewer**       | Hanya membaca, di lokasinya sendiri                 |

**Super Admin terakhir tidak bisa diturunkan, dinonaktifkan, atau dicabut loginnya.**
Sistem akan menolak. Kalau memang mau memindahkan peran itu, angkat orang lain jadi Super
Admin dulu.

### 7.4 Menonaktifkan orang

Ubah **Active** jadi _Inactive_. Mereka tidak bisa masuk dan tidak ditawarkan saat
penugasan, tapi **tetap ada di semua catatan yang sudah menyebut nama mereka**. Riwayat
tidak dihapus hanya karena seseorang berhenti.

---

## 8. Dokumen dan perawatan

### 8.1 Dokumen per aset

**Buka aset → tab Documents**

Pilih jenisnya (Invoice, Purchase order, Warranty card, Manual, Photo, Other) lalu **Add a
document**. Maksimal 20 MB.

E-BAST yang sudah ditandatangani muncul di sini otomatis, dan **tidak bisa dihapus** — itu
bukti serah terima, bukan berkas yang seseorang arsipkan.

### 8.2 Perawatan

**Buka aset → tab Maintenance → Record a repair**, atau **More → Maintenance** untuk
melihat semuanya.

Perawatan adalah **pencatatan tanggal**, bukan tiket dengan status. Isinya: judul,
tanggal masuk, dan tanggal kembali.

**Tanggal kembali itulah saklarnya:**

| Tanggal kembali | Status aset                                                                    |
| --------------- | ------------------------------------------------------------------------------ |
| kosong          | **Maintenance** — dan aset tidak muncul di daftar yang bisa di-_assign_        |
| diisi           | kembali sendiri ke **Assigned** kalau masih dipegang orang, atau **Available** |

Jadi tidak perlu lagi mengubah status aset secara terpisah, dan tidak ada lagi aset yang
tersangkut di Maintenance setelah perbaikannya selesai. Setiap perpindahan tercatat di
riwayat status aset lengkap dengan alasannya.

Aset yang sudah **Lost** atau **Retired** tidak ikut berpindah — barang yang sudah
dihapusbukukan tidak hidup lagi hanya karena catatan perbaikan ditutup.

Isian yang paling sering dilewat: **Next service due**. Itu yang memicu pengingat. Servis
yang selesai tanpa tanggal berikutnya tidak akan mengingatkan siapa pun tentang apa pun.

---

## 9. Notifikasi

Ikon lonceng di kanan atas. Titik merah artinya ada yang belum dibaca.

Yang masuk ke sini:

| Jenis                         | Kapan                                                      |
| ----------------------------- | ---------------------------------------------------------- |
| Garansi akan berakhir         | Setiap malam, untuk aset yang garansinya tinggal ≤ 30 hari |
| Servis jatuh tempo            | Setiap malam, untuk pekerjaan yang jatuh tempo ≤ 7 hari    |
| **Pengingat backup mingguan** | Setiap Jumat 15:00 WIB, khusus Super Admin                 |

Menekan sebuah notifikasi menandainya terbaca **dan** membuka apa yang dimaksud.

Notifikasi hanya dikirim ke orang yang bisa berbuat sesuatu tentangnya. Viewer tidak
menerima peringatan garansi — kotak masuk berisi hal yang tidak bisa Anda apa-apakan hanya
melatih orang mengabaikan loncengnya.

### 9.1 Backup — apa yang harus dilakukan

Setiap Jumat Anda akan dapat pengingat. Yang perlu dikerjakan:

1. **More → Reports → Export CSV** — simpan berkasnya di luar HP.
2. Untuk cadangan penuh (termasuk dokumen dan E-BAST), gunakan fitur backup di dashboard
   Supabase.

Backup yang belum pernah diperiksa bukan backup.

### 9.2 Memastikan pengingatnya hidup

**Settings → Scheduled jobs** (Super Admin). Di sana terlihat kedua jadwal dan tombol **Run
now**.

Kalau daftarnya kosong, artinya penjadwal di database tidak aktif dan **tidak ada
pengingat yang akan datang sendiri**. Itu keadaan yang tidak akan mengeluarkan pesan error
di mana pun — makanya ditampilkan.

Tombol **Run now** aman ditekan berkali-kali. Setiap notifikasi hanya dikirim sekali untuk
hal yang sama.

---

## 10. Memasukkan data lama (impor CSV)

**More → Import assets**

Tiga langkah, dan langkah kedua adalah intinya.

### Langkah 1 — unduh template

Tekan **Download the template**. Isinya 16 kolom dan satu baris contoh yang sudah terisi.
Timpa baris contohnya dengan data Anda.

Kolom wajib: `name`, `category`, `serial_number`, `location`.

Kosongkan `asset_code` kalau ingin nomornya dibuatkan sistem.

### Langkah 2 — periksa

Tekan **Choose a CSV**. Aplikasi akan menjalankan **gladi bersih sungguhan** melewati
importer yang sama, lalu menampilkan:

- berapa baris seluruhnya,
- berapa yang akan masuk,
- berapa yang dilewati, **beserta alasannya per kolom**.

Kalau ada yang dilewati, tekan **Download the error report** — file CSV berisi nomor baris,
kolom, dan masalahnya, supaya bisa dibuka bersebelahan dengan file asli Anda.

### Langkah 3 — impor

Tekan tombolnya. Baris yang bermasalah **dibiarkan** — perbaiki dan impor lagi file yang
sama; yang sudah masuk akan dilaporkan sebagai duplikat, bukan digandakan.

### Yang sering jadi masalah

| Pesan                                              | Artinya                                                                |
| -------------------------------------------------- | ---------------------------------------------------------------------- |
| `category: Not in master data`                     | Nama kategorinya belum ada. Tambahkan di **More → Master data** dulu   |
| `serial_number: Already in the register`           | Sudah pernah diimpor                                                   |
| `serial_number: Duplicated earlier in this file`   | Ada dua baris dengan serial sama di file yang sama                     |
| `purchase_date: Not a date`                        | Tulis `2024-03-18`. Format `18/03/2024` dan `18-03-2024` juga diterima |
| `location: Outside the locations you can write to` | Lokasinya di luar lingkup peran Anda                                   |

**Nama master data yang tidak dikenal ditolak, bukan dibuat otomatis.** Kalau dibuat
otomatis, satu file berisi "Laptop", "laptops", dan "Notebook" akan menghasilkan tiga
kategori yang artinya sama — dan semua laporan setelah itu salah dengan cara yang tidak
terlihat siapa pun.

---

## 11. Laporan

**More → Reports & Export**

Ringkasan di atas, penyaring di tengah, dua tombol ekspor di bawah:

- **Export CSV** — dibuka oleh Excel.
- **Printable PDF** — A4 melintang, sudah tertata untuk dicetak dan diarsipkan.

Keduanya dibuat dari baris yang sama dengan yang dihitung ringkasannya, jadi angka di atas
dan jumlah baris di bawahnya tidak akan berbeda.

**Acquisition value** adalah jumlah yang dibayarkan, bukan nilai setelah penyusutan.
Aplikasi ini tidak punya kebijakan penyusutan, dan mengarangnya berarti menaruh angka yang
terlihat resmi di depan Finance.

Sebuah ekspor tidak pernah berisi baris yang tidak bisa Anda lihat di layar. Itu risiko
utama fitur ekspor: berkas adalah satu-satunya hal yang keluar dari aplikasi dan tetap
terbaca lama setelah semua orang lupa siapa boleh melihat apa.

---

## 12. Master data

**More → Master data** (Corporate IT dan Super Admin)

Kategori, merek, model, vendor, departemen, lokasi.

Menonaktifkan sebuah entri menyembunyikannya dari form aset baru, tapi **setiap aset lama
tetap menyimpan rujukannya**. Itulah gunanya nonaktif, bukan hapus.

Menghapus hanya bisa dilakukan Super Admin, dan hanya kalau entri itu belum dipakai.

---

## 13. Hal-hal yang sengaja tidak bisa dilakukan

Daftar ini bukan keterbatasan yang menunggu diperbaiki. Semuanya keputusan, dan semuanya
punya alasan yang sama: catatan yang bisa diubah belakangan tidak bisa dijadikan bukti.

| Tidak bisa                                  | Kenapa                                                         |
| ------------------------------------------- | -------------------------------------------------------------- |
| Menghapus atau mengubah riwayat perpindahan | Itu jejak fisik barang                                         |
| Menghapus tanda tangan E-BAST               | Itu bukti serah terima                                         |
| Menghapus E-BAST yang sudah ditandatangani  | Sama                                                           |
| Mengubah log perubahan status               | Itu satu-satunya catatan alasan pemusnahan                     |
| Menghapus stiker label                      | Stikernya sudah ada secara fisik di dunia nyata                |
| Mengubah nomor E-BAST                       | Dibuat database supaya tidak pernah bentrok                    |
| Menurunkan Super Admin terakhir             | Satu salah tekan akan membuat sistem tidak bisa diadministrasi |

---

## 14. Kalau ada yang tidak beres

| Gejala                             | Coba ini                                                       |
| ---------------------------------- | -------------------------------------------------------------- |
| Aset tidak ketemu di daftar        | Periksa chip lokasi di header                                  |
| "cannot reach server"              | Jaringan. Coba data seluler sekali                             |
| Kamera tidak menyala saat scan     | Izinkan akses kamera di pengaturan Android                     |
| Tidak ada notifikasi sama sekali   | **Settings → Scheduled jobs**. Kalau kosong, penjadwalnya mati |
| Impor menolak semua baris          | Buka error report-nya; hampir selalu master data belum ada     |
| Tombol tidak muncul                | Peran Anda tidak mengizinkan tindakan itu (lihat §7.3)         |
| Logo ASPIRE tidak muncul di E-BAST | Berkas logonya belum dipasang — lihat §4.4                     |

---

## 15. Yang masih harus dikerjakan pemilik sistem

1. **Pasang logo ASPIRE** — §4.4.
2. **Ganti kata sandi `admin@aspire.id`** setelah ada Super Admin kedua.
3. **Rotasi kunci Supabase.** Service role key dan kata sandi database sempat dikirim lewat
   percakapan; keduanya sebaiknya diganti dari dashboard Supabase. Aplikasi tidak memakai
   service role key sama sekali, jadi menggantinya tidak merusak apa pun.
4. **Jalankan backup pertama** dan pastikan berkasnya benar-benar bisa dibuka.
