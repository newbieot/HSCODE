# HS Code Finder Indonesia

Versi: **2.1.0**

Aplikasi web ringan untuk mengklasifikasi HS Code secara massal dari dokumen CIPL Excel. Aplikasi ini menggunakan Groq API dan dapat langsung dideploy ke Cloudflare Pages tanpa build command.

> Hasil AI merupakan rekomendasi awal, bukan penetapan resmi kepabeanan. Selalu verifikasi melalui BTKI, INSW, peraturan yang berlaku, atau pihak berwenang.

## Fitur

- **Excel CIPL** — satu-satunya mode analisis: unggah file `.xlsx`/`.xls`, sistem mendeteksi kolom barang/HS Code, mempertahankan kode yang sudah ada, memakai database lokal dan Google Sheets, lalu mengirim hanya item yang belum ditemukan ke Groq.
- **Template resmi** — tombol "Unduh template" menyediakan file contoh `TEMPLATE_CIPL.xlsx` agar pengguna tidak salah format.
- Hasil diproses langsung di browser dan dapat diunduh sebagai `HASIL_CIPL_KCU_BATAM.xlsx`.
- Loading state, cancel request, timeout, validasi, inline error, toast, dan respons non-JSON yang aman.
- Aksesibilitas keyboard, focus state, focus trap modal, aria-live, serta dukungan `prefers-reduced-motion`.
- SEO, manifest, sitemap, robots.txt, halaman 404, structured data, security headers, serta cache-busting aset.

## Format Excel yang benar

Sistem membaca **sheet pertama** dan mencari baris header yang memuat kata `Barang`, `Uraian`, atau `Description`.

| No | Barang | Jumlah | Satuan | Hs Code |
|----|--------|--------|--------|---------|
| 1 | Filter udara mesin kendaraan bermotor | 2 | PCS | *(kosong)* |
| 2 | Baju anak katun | 12 | PCS | *(kosong)* |
| 3 | Televisi LED 43 inch | 1 | UNIT | *(kosong)* |

Aturan penting:

1. **Kolom `Barang` wajib ada** — header harus memuat kata `Barang`, `Uraian`, atau `Description`. File tanpa kolom ini akan ditolak.
2. **Kolom `Hs Code` opsional** — bila tidak ada, kolom baru bernama `HS CODE` otomatis dibuat di sisi kanan.
3. **Kode yang sudah terisi tidak diubah** — sistem hanya melengkapi cell yang kosong.
4. **Satu baris = satu jenis barang** — jangan menggabungkan beberapa barang dalam satu cell.
5. **Tulis nama barang sejelas mungkin** — contoh baik: `Filter udara mesin kendaraan bermotor`; contoh buruk: `Sparepart`.
6. Bila ragu, klik **Unduh template** di halaman utama untuk memperoleh file contoh yang pasti terbaca.

## Struktur repository

```text
.
├── index.html
├── assets
│   ├── styles-v2.1.0.css
│   └── app-v2.1.0.js
├── favicon-hscode.png
├── manifest.webmanifest
├── robots.txt
├── sitemap.xml
├── 404.html
├── _headers
├── database.json
├── CHANGELOG.md
└── functions
    ├── _middleware.js
    └── api
        └── analyze.js
```

## Cara mendapatkan Groq API key

1. Buka `https://console.groq.com/keys`.
2. Daftar atau login menggunakan akun Groq.
3. Pilih atau buat project.
4. Klik **Create API Key**.
5. Berikan nama, misalnya `hs-posnew`.
6. Salin key yang dihasilkan. Groq biasanya hanya menampilkan key lengkap saat dibuat.

Jangan commit key ke GitHub, menaruh key di HTML/JavaScript, memasukkannya ke URL, atau membagikannya kepada orang lain. Revoke dan buat key baru jika key bocor.

## Opsi A — Cloudflare Pages secret (direkomendasikan)

Frontend memanggil endpoint internal `/api/analyze`. Pages Function membaca key hanya dari `env.GROQ_API_KEY`, lalu meneruskan request ke Groq. Key tidak dikirim ke browser.

1. Buka Cloudflare Dashboard.
2. Masuk ke **Workers & Pages**.
3. Pilih project untuk `hs.posnew.com`.
4. Buka **Settings** → **Variables and Secrets**.
5. Tambahkan secret terenkripsi:

```text
GROQ_API_KEY
```

6. Isi dengan key dari Groq Console.
7. Tambahkan untuk environment **Production** dan **Preview** bila keduanya digunakan.
8. Deploy ulang project.

## Opsi B — API key milik pengguna (BYOK)

Bila secret server belum tersedia, user dapat memasukkan key melalui modal onboarding.

- Penyimpanan default: `sessionStorage` (berakhir bersama sesi/tab browser).
- Penyimpanan perangkat hanya dilakukan bila checkbox **Ingat di perangkat ini** dipilih.
- Key ditampilkan dalam bentuk empat karakter terakhir setelah tersimpan.
- Key dapat diuji, diganti, dan dihapus.
- Key tidak dimasukkan ke clipboard hasil, file JSON, file Excel, print, URL, atau log aplikasi.

## Deploy ke Cloudflare Pages

### Git integration

1. Upload isi repository ini ke root repository GitHub. Jangan membungkusnya dalam folder tingkat kedua.
2. Di Cloudflare Dashboard pilih **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
3. Pilih repository.
4. Konfigurasi build:
   - Framework preset: **None**
   - Build command: kosong
   - Build output directory: `/` atau kosong sesuai UI Cloudflare
5. Tambahkan secret `GROQ_API_KEY` seperti panduan di atas.
6. Deploy.
7. Tambahkan custom domain `hs.posnew.com`.

Cloudflare Pages otomatis mengenali folder `functions/`. Endpoint yang tersedia adalah:

```text
POST /api/analyze
```

Mode payload internal:

- `test` — memeriksa key dan ketersediaan model.
- `batch` — klasifikasi item CIPL dalam beberapa batch.

## Google Sheets database

Aplikasi mempertahankan integrasi Google Apps Script lama untuk:

- mengambil mapping nama barang → HS Code;
- menyimpan mapping baru yang diperoleh dari analisis batch;
- fallback ke database offline jika Google Sheets tidak tersedia.

URL Apps Script dikonfigurasi sekali di `assets/app-v2.1.0.js`. Pastikan deployment Apps Script mengizinkan request dari domain aplikasi dan tidak mengembalikan data sensitif.

## Troubleshooting

- **401 / invalid API key** — periksa key atau buat key baru di Groq Console.
- **Missing secret** — pastikan `GROQ_API_KEY` tersedia pada environment Cloudflare yang sedang dipakai, lalu deploy ulang.
- **403** — periksa model permissions pada project Groq.
- **429 / rate limit** — tunggu dan coba kembali; aplikasi juga memiliki pembatasan sederhana per IP pada Pages Function.
- **Model unavailable** — periksa status/model Groq dan konfigurasi `MODEL` di `functions/api/analyze.js`.
- **Network error** — periksa koneksi, Content Security Policy, dan izin Apps Script.
- **Kolom Excel tidak ditemukan** — pastikan header memuat `Barang`, `Uraian`, atau `Description`. Kolom HS Code akan dibuat bila belum ada. Gunakan tombol **Unduh template** bila ragu.
- **Library Excel gagal dimuat** — periksa akses ke CDN resmi SheetJS dan CSP di middleware.

## Privasi

- Nama barang diproses melalui Groq hanya saat user menjalankan analisis.
- User dapat menghapus key dari tombol **Hapus data lokal**.
- Tidak ada analytics baru.
- Tidak ada API key atau secret di repository ini.
