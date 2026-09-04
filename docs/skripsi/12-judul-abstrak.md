# 12 — Judul dan Abstrak

Judul dalam dua bahasa, abstrak Indonesia, dan abstract Inggris.

**Tanggal:** 2026-09-02

---

## ⚠ Baca ini sebelum menyalin

Abstrak di bawah memuat **empat isian bertanda `[ISI: ...]`** yang **tidak boleh
saya karang** dan harus Anda lengkapi sendiri:

| Isian | Mengapa kosong |
| --- | --- |
| Metode pengembangan | Anda belum menyebutkan memakai Waterfall, Prototyping, atau lainnya. Repositori tidak menyatakannya |
| Hasil pengujian | **23 suite berisi 679 assertion belum pernah dijalankan** dalam sesi mana pun. Saya tahu jumlahnya, bukan berapa yang lulus |
| Hasil pengujian pengguna | Belum ada. Bila tidak dilakukan, hapus kalimatnya — jangan diisi angka karangan |
| Ejaan resmi PT ASPIRE | Ambil dari dokumen perusahaan |

**Satu klaim yang belum benar hari ini:** abstrak menyebut sistem dapat diakses
lewat peramban web. Per 2026-09-02 versi web **belum dibangun** — konfigurasinya
ada, tetapi nol cabang `Platform.OS === 'web'`, dan empat layar ekspor/impor
masih memakai `expo-sharing` yang tidak berfungsi di web.

Jangan serahkan abstrak ini sebelum versi web benar-benar berjalan, atau
hapus seluruh penyebutan web dan kembalikan judul ke "Berbasis Android".

---

## 1. Judul

### 1.1 Bahasa Indonesia

> **Rancang Bangun Sistem Informasi Manajemen Aset Teknologi Informasi Lintas
> Platform Berbasis Web dan Android Menggunakan React Native dan Supabase
> (Studi Kasus: Divisi Corporate IT PT ASPIRE)**

25 kata.

### 1.2 Bahasa Inggris

> **Design and Development of a Cross-Platform Information Technology Asset
> Management Information System for Web and Android Using React Native and
> Supabase (Case Study: Corporate IT Division of PT ASPIRE)**

29 kata.

**Varian yang lebih ringkas** bila pembimbing menghendaki:

| # | Judul Inggris | Kata |
| ---: | --- | ---: |
| E1 | Design and Development of a Cross-Platform IT Asset Management System Using React Native and Supabase (Case Study: Corporate IT Division of PT ASPIRE) | 24 |
| E2 | Design and Development of a Cross-Platform IT Asset Management System for Web and Android Using React Native and Supabase | 20 |

> **Catatan penerjemahan.** "Rancang Bangun" lazim diterjemahkan **"Design and
> Development"** atau **"Design and Implementation"**. Keduanya diterima; pilih
> satu dan pakai konsisten di seluruh naskah. Hindari "Design and Build" — jarang
> dipakai di penulisan ilmiah Inggris.

---

## 2. Abstrak (Bahasa Indonesia)

Pengelolaan aset teknologi informasi pada Divisi Corporate IT PT ASPIRE selama
ini dilakukan secara manual menggunakan lembar kerja dan dokumen serah terima
berbasis kertas, sehingga penelusuran keberadaan aset serta riwayat pemegangnya
sulit dilakukan. Penelitian ini bertujuan merancang dan membangun sistem
informasi manajemen aset teknologi informasi lintas platform yang dapat diakses
melalui peramban web maupun perangkat Android dari satu basis kode. Sistem
dikembangkan dengan metode [ISI: metode pengembangan, mis. Waterfall /
Prototyping] menggunakan React Native dan Expo pada sisi klien serta Supabase
(PostgreSQL, PostgREST, dan Edge Function) pada sisi peladen. Berbeda dari
penelitian terdahulu yang menempatkan penegakan hak akses pada lapisan aplikasi,
penelitian ini menegakkannya pada lapisan basis data melalui Row Level Security,
sehingga pembatasan akses tetap berlaku meskipun antarmuka dilewati. Sistem yang
dihasilkan terdiri atas 29 layar dan 33 tabel basis data dengan 135 fungsi,
mencakup registrasi aset, pelabelan QR, berita acara serah terima elektronik
(E-BAST) bertanda tangan pada layar, perpindahan antarlokasi, pencatatan
perawatan, serta impor data karyawan. Hak akses ditegakkan melalui 95 kebijakan
Row Level Security untuk empat peran pengguna, dan 198 aturan bisnis ditegakkan
secara berlapis pada skema, fungsi basis data, dan antarmuka. Pengujian
dilakukan menggunakan 23 suite pengujian integrasi berisi 679 assertion yang
mengakses basis data menggunakan token pengguna sungguhan, dengan hasil [ISI:
jumlah assertion yang lulus]. [ISI: hasil pengujian pengguna, atau hapus kalimat
ini bila tidak dilakukan.]

**Kata kunci:** manajemen aset teknologi informasi, lintas platform, React
Native, Row Level Security, berita acara serah terima elektronik

*(±230 kata tanpa isian. Sesuaikan dengan batas prodi Anda — umumnya 150–250
kata.)*

---

## 3. Abstract (English)

Information technology asset management at the Corporate IT Division of PT
ASPIRE has been carried out manually using spreadsheets and paper-based handover
documents, making it difficult to trace asset locations and custody history.
This research aims to design and develop a cross-platform information technology
asset management information system accessible through both a web browser and
Android devices from a single codebase. The system was developed using the [ISI:
development method, e.g. Waterfall / Prototyping] method with React Native and
Expo on the client side and Supabase (PostgreSQL, PostgREST, and Edge Functions)
on the server side. Unlike previous studies that enforce access control at the
application layer, this research enforces it at the database layer through Row
Level Security, so that access restrictions remain effective even when the user
interface is bypassed. The resulting system comprises 29 screens and 33 database
tables with 135 functions, covering asset registration, QR labelling, electronic
handover documents (E-BAST) signed on screen, inter-location transfers,
maintenance records, and employee data import. Access rights are enforced
through 95 Row Level Security policies across four user roles, and 198 business
rules are enforced in layers across the schema, database functions, and user
interface. Testing was conducted using 23 integration test suites containing 679
assertions that access the database using real user tokens, with results [ISI:
number of passing assertions]. [ISI: user testing results, or delete this
sentence if not conducted.]

**Keywords:** information technology asset management, cross-platform, React
Native, Row Level Security, electronic handover document

*(±235 words without the blanks.)*

---

## 4. Catatan penyusunan

### 4.1 Setiap angka dapat dipertanggungjawabkan

| Angka di abstrak | Sumber |
| --- | --- |
| 29 layar | [01-inventaris.md](01-inventaris.md) §6, [06-katalog-layar.md](06-katalog-layar.md) |
| 33 tabel, 135 fungsi | [02-kamus-data.md](02-kamus-data.md), [04-katalog-rpc.md](04-katalog-rpc.md) |
| 95 kebijakan RLS, 4 peran | [05-keamanan.md](05-keamanan.md) |
| 198 aturan bisnis | [08-aturan-bisnis.md](08-aturan-bisnis.md) |
| 23 suite, 679 assertion | [09-pengujian.md](09-pengujian.md) |

Tidak ada angka di abstrak yang tidak punya perintah hitung ulang di
[00-ringkasan.md](00-ringkasan.md) §2.

### 4.2 Kalimat pembeda ada di kedua abstrak

Kalimat *"Berbeda dari penelitian terdahulu yang menempatkan penegakan hak akses
pada lapisan aplikasi…"* adalah **inti pembeda** Anda. Jangan dihapus saat
memangkas panjang abstrak — itu satu-satunya kalimat yang menjawab "apa
kebaruannya?" secara langsung.

Bila terpaksa memangkas, korbankan daftar fitur (registrasi, pelabelan,
perpindahan, perawatan, impor) lebih dulu.

### 4.3 Yang sengaja TIDAK diklaim

| Tidak diklaim | Alasan |
| --- | --- |
| Persentase keberhasilan pengujian | Suite belum dijalankan |
| Skor usability / SUS | Belum ada pengujian pengguna |
| Peningkatan efisiensi dalam angka | Tidak ada pengukuran sebelum–sesudah |
| Perbandingan performa web vs Android | Belum diukur |
| Keabsahan hukum E-BAST | Sistem tidak memakai PKI; lihat [11-daftar-jurnal.md](11-daftar-jurnal.md) entri 11 |

Bila pembimbing meminta angka efisiensi, itu memerlukan pengukuran baru —
bukan sesuatu yang dapat disimpulkan dari kode.
