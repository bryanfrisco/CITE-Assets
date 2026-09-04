# 11 — Daftar Jurnal Rujukan

Lima belas rujukan terbitan lima tahun terakhir (2021–2026) yang relevan dengan
CITE Assets, dikelompokkan menurut bagian skripsi yang akan memakainya.

**Tanggal penelusuran:** 2026-09-01

---

## 0. Cara daftar ini disusun

### 0.1 Setiap entri diverifikasi, bukan dikira-kira

Setiap judul di bawah **dibuka halaman penerbitnya** untuk mengambil nama
penulis, volume, nomor, tahun, halaman, dan DOI. Tidak ada entri yang ditulis
dari ingatan atau dari ringkasan mesin pencari saja.

Kandidat yang halaman penerbitnya menolak diakses (HTTP 403) **dibuang**, bukan
dikutip dengan detail tebakan. Itu sebabnya beberapa jurnal yang muncul di
penelusuran tidak masuk daftar ini.

### 0.2 Tanda kelengkapan

| Tanda | Arti |
| :-: | --- |
| ✔ | Seluruh detail sitasi lengkap termasuk DOI |
| ◐ | Terverifikasi, tetapi penerbit tidak menampilkan nomor halaman atau DOI |

### 0.3 Satu catatan penting sebelum Anda menulis BAB II

Penelusuran untuk **Supabase, PostgREST, dan PostgreSQL Row Level Security**
hampir tidak menemukan literatur peer-review — yang muncul adalah dokumentasi
vendor, blog engineering, dan tutorial. Ini **bukan kegagalan penelusuran**,
melainkan keadaan literaturnya.

Konsekuensinya untuk skripsi Anda ada dua, dan keduanya menguntungkan:

1. **Ini celah penelitian yang dapat Anda nyatakan.** Otorisasi di lapisan
   database untuk aplikasi mobile lapangan belum banyak dibahas secara akademis,
   sementara Fase 5 dokumentasi ini menemukan bukti empiris bahwa gerbang UI dan
   RLS dapat menyimpang. Itu kontribusi yang dapat diklaim.
2. **Rujukan untuk konsepnya harus diambil dari literatur kontrol akses yang
   lebih umum** (RBAC, fine-grained access control), bukan dari nama produknya.

---

## A. Sistem manajemen aset — pembanding langsung (BAB II)

Enam rujukan ini adalah **pembanding terdekat** dengan CITE Assets. Dipakai di
tinjauan pustaka untuk menunjukkan posisi penelitian Anda.

### 1. ✔ Saputra & Ratnasari (2025)

> Saputra, T. A., & Ratnasari, A. (2025). Optimalisasi Pengelolaan Aset IT
> melalui Sistem Manajemen Aset Berbasis Web. *TIN: Terapan Informatika
> Nusantara*, 6(7), 1144–1153. https://doi.org/10.47065/tin.v6i7.8892

Sistem manajemen aset IT berbasis web untuk PT Putra Dumas Lestari memakai
CodeIgniter 4 dan MySQL, mencakup pencatatan aset, pemantauan keluar-masuk,
pelaporan real-time, dan penyusutan otomatis.

**Mengapa relevan:** paling dekat dengan domain Anda — aset IT, perusahaan
swasta Indonesia. **Pembeda CITE Assets:** mobile-first, otorisasi di database,
dan E-BAST bertanda tangan.

### 2. ✔ Syafril & Wahyudin (2025)

> Syafril, R., & Wahyudin, W. (2025). Perancangan Sistem Informasi Manajemen
> Aset Berbasis Web pada Divisi Teknologi Informasi PAM JAYA. *Jurnal Teknologi
> dan Sistem Informasi Bisnis*, 7(4), 527–533.
> https://doi.org/10.47233/jteksis.v7i4.2261

SIMASPAM: pencatatan dan pemantauan aset, pemeliharaan, penghapusan, pelacakan
lewat QR Code, dan notifikasi pemeliharaan otomatis.

**Mengapa relevan:** cakupan fungsinya nyaris sama dengan CITE Assets —
termasuk QR dan modul perawatan. Pembanding paling kuat untuk BAB II.

### 3. ◐ Yahya, Amali, & Padiku (2024)

> Yahya, A., Amali, L. N., & Padiku, I. R. (2024). Pengembangan Sistem Aplikasi
> Manajemen Aset Berbasis Android di Universitas Negeri Gorontalo. *Diffusion:
> Journal of Systems and Information Technology*, 4(1).

Aplikasi Android "Simastung" mencakup inventarisasi, pengoperasian,
pemeliharaan, dan penghapusan aset, memanfaatkan kamera untuk pemindaian QR.

**Mengapa relevan:** satu-satunya pembanding yang **berbasis Android dan
memakai pemindaian QR** — dua hal yang juga ada di CITE Assets.

### 4. ✔ Sohat dkk. (2025)

> Sohat, I. P., Maatu, P., Sadam, S., Mangadang, I., Saikim, L., Wibowo K., T.,
> & Permana, I G. P. R. (2025). Sistem Informasi Manajemen Aset Barang dan
> Kendaraan dengan Fitur Pengingat Otomatis Service dan Pajak Berbasis Mobile
> Web pada AMIK Luwuk Banggai. *Jurnal Publikasi Sistem Informasi dan Manajemen
> Bisnis*, 4(3), 100–115. https://doi.org/10.55606/jupsim.v4i3.5264

Manajemen aset **dan kendaraan** berbasis mobile web, dengan pengingat otomatis
servis dan pajak lewat Telegram Bot.

**Mengapa relevan:** satu-satunya yang menangani **unit kendaraan** — sejajar
dengan modul `units` dan `install_asset_to_unit()` di CITE Assets.

### 5. ✔ Musoffa, Susanto, & Mulyanto (2022)

> Musoffa, M. Z., Susanto, E. S., & Mulyanto, Y. (2022). Sistem Informasi
> Manajemen Aset Berbasis Web di Universitas Teknologi Sumbawa. *Jurnal
> Informatika Teknologi dan Sains (Jinteks)*, 4(1), 42–51.
> https://doi.org/10.51401/jinteks.v4i1.1530

Memakai model spiral SDLC dan black-box testing, menangani pengadaan, pelacakan
lokasi, dan dokumentasi penyusutan.

**Mengapa relevan:** contoh penyajian **metodologi pengembangan** yang rapi —
berguna sebagai acuan bentuk BAB III Anda.

### 6. ◐ Adriansyah & Sutrisna (2022)

> Adriansyah, M., & Sutrisna, E. (2022). Perancangan Sistem Informasi
> Pengelolaan Aset Inventaris Divisi Parkir Menggunakan QR Code Berbasis Web
> (Studi Kasus: Universitas Pamulang). *OKTAL: Jurnal Ilmu Komputer dan Sains*,
> 1(10), 1756–1765.

Pengelolaan inventaris berbasis QR Code lintas lokasi kampus dengan PHP dan
MySQL.

**Mengapa relevan:** menekankan **aset tersebar di banyak lokasi** — masalah
yang di CITE Assets dijawab dengan scope RLS per lokasi.

---

## B. Pelabelan QR dan pelacakan aset (BAB II & BAB IV)

### 7. ✔ Sukron, Ramadhan, & Sihabillah (2024)

> Sukron, M., Ramadhan, M. R., & Sihabillah, A. (2024). Design of a Quick
> Response Code-Based Infrastructure Management Information System.
> *International Journal of Engineering and Computer Science Applications
> (IJECSA)*, 3(2), 89–96. https://doi.org/10.30812/ijecsa.v3i2.4653

Metode Research and Development dengan pendekatan kuantitatif; pengujian
menunjukkan tingkat kepuasan **82,67%**.

**Mengapa relevan:** memberi **angka pembanding** untuk evaluasi sistem Anda,
bukan sekadar deskripsi fitur.

### 8. ✔ Hugo & Ngo (2024)

> Hugo, A. A., & Ngo, G. N. C. (2024). Private Blockchain-based Procurement and
> Asset Management System with QR Code. *International Journal of Computing
> Sciences Research*, 8, 2971–2983. arXiv:2407.09353

Sistem pengadaan berbasis blockchain privat dengan Proof-of-Authority dan
SHA3-512, mencakup kanvasing, pembelian, pengiriman, inspeksi, inventaris, dan
penghapusan aset.

**Mengapa relevan:** membahas **integritas dan akuntabilitas** siklus aset —
masalah yang sama dengan `audit_log` dan tabel append-only CITE Assets, tetapi
dengan solusi berbeda. Bagus untuk paragraf pembanding pendekatan.

---

## C. Pengembangan mobile lintas platform (justifikasi React Native, BAB III)

### 9. ✔ Ramachandrappa (2024)

> Ramachandrappa, N. C. (2024). A Comparative Analysis of Native vs React Native
> Mobile App Development. *International Journal of Computer Trends and
> Technology (IJCTT)*, 72(9), 57–62.
> https://doi.org/10.14445/22312803/IJCTT-V72I9P110

Eksperimen sistematis atas performa, skalabilitas, biaya, dan pengalaman
pengguna antara native dan React Native.

**Mengapa relevan:** **rujukan langsung untuk membenarkan pemilihan React
Native** di BAB III. Ini pertanyaan yang hampir pasti ditanyakan penguji.

### 10. ✔ Mushtaq, Azam, & Anwar (2024)

> Mushtaq, F., Azam, F., & Anwar, M. W. (2024). Performance Comparison of Single
> Code Base Development Tools: Flutter, React Native, and Xamarin. *2024
> International Conference on Software and Technology Engineering (ICSTE)*.
> https://doi.org/10.1109/ICSTE63875.2024.00011

Benchmark empiris memakai Android Studio Profiler dan Perfetto. Temuan: Flutter
unggul performa; React Native punya kurva belajar paling landai karena
JavaScript.

**Mengapa relevan:** terbitan **IEEE** — bobot sitasinya lebih tinggi. Ia jujur
menyebut React Native bukan yang tercepat, sehingga justifikasi Anda harus
bersandar pada alasan lain (ekosistem, kecepatan pengembangan) — dan itu argumen
yang lebih kuat karena tidak mengabaikan bukti.

---

## D. Tanda tangan digital dan integritas dokumen (E-BAST, BAB II & IV)

### 11. ◐ Hutomo & Kurniawan (2026)

> Hutomo, D. S., & Kurniawan, W. (2026). Development of a Digital Signature
> System for Electronic Certification Services Based on Public Key
> Infrastructure. *SMATIKA Jurnal: STIKI Informatika Jurnal*, 16(2).
> https://doi.org/10.32664/smatika.v16i02.2348

PKI dengan RSA 2048-bit dan SHA-256 untuk menjamin integritas data, autentisitas
pengirim, dan nirsangkal. Waktu eksekusi rata-rata 8,05 ms atas 30 dokumen PDF,
memenuhi standar hukum transaksi elektronik Indonesia.

**Mengapa relevan — dan ini penting.** Ini rujukan yang menjawab **pertanyaan
penguji nomor 9** di [00-ringkasan.md](00-ringkasan.md): keabsahan hukum E-BAST.

**Peringatan yang harus Anda sadari:** CITE Assets **tidak** memakai PKI. Ia
menyimpan tanda tangan sebagai **lintasan pena (stroke)** dalam JSONB, dijaga
append-only tiga lapis. Itu memberi *bukti tak-terubah bahwa tanda tangan
direkam*, bukan *tanda tangan elektronik tersertifikasi* menurut UU ITE. Rujukan
ini sebaiknya dipakai untuk **menyatakan batas** sistem Anda di bab keterbatasan
— bukan untuk mengklaim kesetaraan hukum.

---

## E. Audit trail dan integritas log (tabel append-only, BAB IV)

### 12. ◐ Koisser & Sadeghi (2023)

> Koisser, D., & Sadeghi, A.-R. (2023). Accountability of Things: Large-Scale
> Tamper-Evident Logging for Smart Devices. arXiv:2308.05557.

Skema tamper-evident logging skala besar dengan konstruksi binary hash tree
berbasis timestamp, mencapai overhead penyimpanan konstan.

**Mengapa relevan:** memberi **kerangka teori** untuk apa yang CITE Assets
lakukan secara praktis lewat `audit_log`, trigger `forbid_mutation()`, dan lima
tabel append-only. Ia membedakan *tamper-proof* (butuh perangkat keras khusus)
dari *tamper-evident* (dapat dideteksi) — dan sistem Anda ada di kategori kedua.

---

## F. Metode pengujian dan evaluasi (BAB III & BAB IV)

### 13. ◐ Sakinah, Aditiawan, & Nurlaili (2024)

> Sakinah, F. A., Aditiawan, F. P., & Nurlaili, A. L. (2024). Pengujian pada
> Aplikasi Manajemen Aset Menggunakan Black Box Testing. *JATI (Jurnal Mahasiswa
> Teknik Informatika)*, 8(3). https://doi.org/10.36040/jati.v8i3.9524

Black Box Testing dengan Boundary Value Analysis dan Equivalence Partitioning
pada aplikasi manajemen aset: **227 skenario, 226 sesuai harapan, tingkat
keberhasilan 99%**.

**Mengapa relevan — rujukan paling berguna di seluruh daftar ini.** Ia
mengerjakan persis apa yang perlu Anda kerjakan: menguji aplikasi manajemen aset
dan melaporkan angkanya. Bandingkan dengan milik Anda: **679 assertion di 23
suite** ([09-pengujian.md](09-pengujian.md)). Pengujian Anda berbeda jenis —
integrasi terhadap database dengan token sungguhan, bukan black box fungsional —
dan perbedaan itu justru layak dibahas.

### 14. ✔ Jumaryadi & Mahdiana (2022)

> Jumaryadi, Y., & Mahdiana, D. (2022). Usability Testing of Budi Luhur
> University E-Learning System Using System Usability Scale. *Jurnal Teknik
> Informatika (JUTIF)*, 3(4), 1099–1107.
> https://doi.org/10.20884/1.jutif.2022.3.4.275

SUS dengan 101 responden; skor keseluruhan 65,52. Antarmuka mobile skor 41,
versi web 86.

**Mengapa relevan:** menyediakan **metode dan angka pembanding** bila Anda ingin
menambahkan evaluasi pengguna. Temuan bahwa versi mobile jauh lebih rendah
daripada web adalah peringatan yang relevan untuk aplikasi mobile-first Anda.

### 15. ◐ Yani, Nazhifah, & Pradika (2025)

> Yani, R., Nazhifah, I., & Pradika, M. I. (2025). System Usability Scale in
> Information System Application Development Using Systematic Mapping Study.
> *IJATIS: Indonesian Journal of Applied Technology and Innovation Science*,
> 2(2). https://doi.org/10.57152/ijatis.v2i2.2275

Systematic mapping atas 30 jurnal terindeks SpringerLink periode 2021–2025.

**Mengapa relevan:** rujukan **metodologis** untuk membenarkan pemakaian SUS,
dan contoh systematic mapping bila pembimbing meminta tinjauan pustaka
sistematis.

---

## G. Cara memakai daftar ini

### G.1 Pemetaan ke bab

| Bab | Rujukan |
| --- | --- |
| BAB I — latar belakang | 1, 2, 3 (masalah pengelolaan aset manual) |
| BAB II — tinjauan pustaka | 1–8 (sistem sejenis), 11, 12 (landasan teori) |
| BAB III — metodologi | 5 (SDLC), 9, 10 (pemilihan React Native), 13, 15 (metode pengujian) |
| BAB IV — hasil | 7 (angka pembanding), 8, 12 (integritas), 13, 14 (evaluasi) |
| Bab keterbatasan | 11 (batas keabsahan hukum), 10 (performa React Native) |

### G.2 Tujuh dari lima belas berbahasa Indonesia

Terbitan Indonesia (1, 2, 3, 4, 5, 6, 13) memudahkan pembimbing memeriksa, dan
umumnya terindeks SINTA. Terbitan internasional (7–12, 14, 15) memberi bobot
sitasi. Campuran ini disengaja.

### G.3 Yang TIDAK ditemukan, dan artinya

| Topik dicari | Hasil |
| --- | --- |
| Supabase / PostgREST | **Tidak ada paper peer-review.** Hanya dokumentasi vendor dan blog |
| PostgreSQL Row Level Security | **Tidak ada paper peer-review khusus.** Yang ada: panduan implementasi dan artikel blog |
| Sistem informasi perawatan (CMMS) akademis | Penelusuran hanya menghasilkan blog vendor |
| Tanda tangan elektronik + BAST di jurnal hukum | Beberapa jurnal hukum muncul di penelusuran tetapi halamannya menolak diakses (HTTP 403), sehingga tidak dikutip |

Tiga baris pertama adalah **celah literatur yang dapat Anda klaim** di BAB I.
Baris terakhir adalah pekerjaan yang tersisa: jurnal hukum tentang keabsahan
tanda tangan elektronik **ada** — saya melihat judulnya di penelusuran — tetapi
detail sitasinya tidak dapat saya verifikasi, jadi tidak saya tuliskan.

### G.4 Yang belum terverifikasi

| # | Butir | Cara menutupnya |
| ---: | --- | --- |
| 1 | Nomor halaman dan DOI untuk enam entri bertanda ◐ | Buka halaman jurnalnya lewat peramban; sebagian menolak akses otomatis tetapi terbuka normal di peramban |
| 2 | Apakah kelima belas terindeks SINTA/Scopus dan peringkatnya | Cek di sinta.kemdikbud.go.id dan scimagojr.com — pembimbing biasanya mensyaratkan ini |
| 3 | Jurnal hukum tanda tangan elektronik | Telusuri manual di Google Scholar dengan kata kunci "keabsahan tanda tangan elektronik UU ITE" |

**Butir 2 wajib Anda kerjakan sendiri sebelum memakai daftar ini.** Saya tidak
memverifikasi status indeksasi satu pun jurnal di atas, dan sebagian jurnal
nasional memiliki peringkat SINTA yang mungkin tidak memenuhi syarat prodi Anda.
