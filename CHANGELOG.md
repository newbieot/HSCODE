# Changelog

## 2.1.1 — 2026-08-16

### Fixed

- Tombol "Unduh template" sebelumnya mengandalkan pustaka SheetJS yang baru dimuat saat file Excel pertama diunggah, sehingga klik pertama sering gagal dengan pesan "Template belum siap".
- Template kini menjadi file statis `TEMPLATE_CIPL.xlsx` di root yang diunduh langsung melalui link download — selalu siap, bahkan sebelum pustaka Excel termuat.
- Fungsi `downloadTemplate` pada `app-v2.1.0.js` dihapus karena tidak lagi diperlukan.

## 2.1.0 — 2026-08-16

### Removed

- Fitur **Quick Search** dan **Detailed Analysis** dihapus seluruhnya sesuai kebutuhan: aplikasi kini fokus pada pemrosesan **Excel CIPL** saja.
- Bagian hasil analisis manual (recommended code, confidence, taxonomy, alternatives, missing information, verification checklist) beserta tombol salin/unduh JSON/print/share/refine dihapus.
- Histori pencarian lokal beserta pencarian, buka, salin, dan hapus histori dihapus karena hanya relevan untuk analisis manual.
- Mode payload `manual` pada Pages Function `/api/analyze` dihapus; tersisa `test` dan `batch`.
- LocalStorage histori `hs_posnew_history_v2` tidak lagi digunakan.

### Added

- Tombol **Unduh template** untuk mengunduh `TEMPLATE_CIPL.xlsx` berisi format kolom yang pasti terbaca sistem (`No`, `Barang`, `Jumlah`, `Satuan`, `Hs Code`).
- Panduan format Excel langsung di halaman utama: tabel contoh, aturan kolom wajib, perilaku kolom HS Code, dan tips penulisan nama barang.
- Pesan error deteksi kolom kini mengarahkan pengguna ke tombol template.
- CSS baru untuk tabel contoh format dan teks screen-reader.

### Changed

- Aset terversi dinaikkan ke `styles-v2.1.0.css` dan `app-v2.1.0.js` sesuai kebijakan cache-busting.
- Konten hero, meta SEO, dan structured data diperbarui untuk fokus klasifikasi massal CIPL Excel.
- Alur penggunaan dipersingkat menjadi: unduh template (opsional) → unggah → AI melengkapi → unduh & verifikasi.
- `404.html` kini memuat `styles-v2.1.0.css`.

## 2.0.2 — 2026-07-27

### Fixed
- Memperbaiki footer yang dapat tampil sebagai teks polos setelah deploy akibat browser atau CDN masih menggunakan `styles.css` versi lama.
- CSS dan JavaScript utama kini memakai nama file terversi di folder `assets`, sehingga deployment baru selalu memuat aset yang sesuai.
- HTML diberi kebijakan cache `no-cache, must-revalidate`; aset terversi diberi cache immutable melalui middleware dan `_headers`.
- Struktur dan tampilan footer tetap mengikuti footer `lacak.posnew.com`: bar gelap 38px, garis oranye, brand kiri, deskripsi tengah, dan badge kreator kanan.

## 2.0.1 — 27 Juli 2026

- Menyesuaikan footer agar konsisten dengan desain `lacak.posnew.com`.
- Menggunakan footer dashboard gelap setinggi 38px dengan garis aksen oranye.
- Menambahkan badge kreator, responsivitas mobile, dan perilaku footer tetap berada di bawah halaman pendek.

## 2.0.0 — 2026-07-27

### Added

- UI/UX baru untuk desktop dan mobile dengan visual hierarchy yang lebih jelas.
- Quick Search dan Detailed Analysis tanpa menghapus alur Excel CIPL lama.
- Hasil manual terstruktur: recommended HS Code, confidence, chapter, heading, subheading, product summary, classification rationale, alternatives, missing information, verification checklist, dan disclaimer.
- Tombol Copy HS Code, Copy Full Analysis, New Search, Refine Description, Print/Save PDF, Download JSON, dan Share Summary.
- Histori pencarian lokal lengkap dengan pencarian, buka, salin, hapus per item, dan clear all dengan konfirmasi.
- Modal onboarding Groq API key, Test Connection, Replace/Remove Key, status koneksi, dan panduan Groq Console.
- Cloudflare Pages Function `/api/analyze` sebagai proxy aman dengan opsi secret server atau BYOK.
- Timeout, AbortController/cancel, validasi request, body limit, error mapping, dan rate limiting sederhana.
- SEO metadata, Open Graph, Twitter Card, SoftwareApplication schema, manifest, robots.txt, sitemap.xml, dan halaman 404.
- Security headers melalui middleware.
- Preview mode internal untuk regression screenshot: `?preview=result`, `?preview=api`, dan `?preview=error`.

### Changed

- Model lama `llama-3.3-70b-versatile` dan endpoint Groq chat completions dipertahankan karena masih valid.
- Prompt batch lama dipertahankan secara fungsional: output JSON murni `{BARANG: HSCODE}` dengan nama barang kapital.
- API key tidak lagi otomatis disimpan permanen. Default sekarang `sessionStorage`; `localStorage` hanya opt-in.
- Key lama pada `pos_batam_groq_key` dimigrasikan satu kali agar user lama tidak kehilangan konfigurasi.
- Panggilan Groq dipindah dari frontend langsung ke endpoint internal Cloudflare Pages Function.
- Library Excel diarahkan ke CDN resmi SheetJS versi 0.20.3.
- Pemrosesan Excel sekarang memperbarui cell pada worksheet asli, bukan membangun ulang seluruh sheet, sehingga format lebih terjaga.
- Admin panel tersembunyi diganti dengan status basis pengetahuan yang ringkas dan dapat dibuka.
- Feedback browser `alert()` diganti dengan inline alert, modal, confirm dialog, dan toast.

### Fixed

- File dengan header yang tidak terdeteksi tidak lagi diproses menggunakan indeks kolom `-1`.
- Kolom HS Code otomatis dibuat bila kolom barang ditemukan tetapi kolom HS belum tersedia.
- Respons Groq kosong/rusak tidak lagi menyebabkan akses `choices[0]` atau `JSON.parse` yang membuat aplikasi gagal.
- Error 401, 403, 429, timeout, network, model unavailable, dan payload terlalu besar kini memiliki pesan yang jelas.
- Tombol submit dinonaktifkan selama request untuk mencegah request ganda.
- Request manual dan batch dapat dibatalkan.
- API key tidak ditampilkan penuh setelah disimpan dan tidak disertakan dalam hasil/ekspor/histori.
- Horizontal overflow mobile dan target sentuh kecil diperbaiki.
- Middleware redirect domain lama dipertahankan tanpa menambahkan `_redirects` yang berpotensi loop.
