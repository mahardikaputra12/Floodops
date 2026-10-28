# FloodOps – Sistem Analisis Dampak Banjir dan Prioritas Penanganan Jalan

Prototipe MVP sesuai PRD v1.0 (20 Oktober 2026). Stack: **React + Vite**, **Leaflet + OpenStreetMap**, **Express.js**, **Chart.js**, mesin graf (Dijkstra) pada `server/analysis.js`, PWA (manifest + service worker), skema **PostgreSQL/Supabase** pada `supabase/schema.sql`, ringkasan AI opsional via **OpenRouter**.

## Menjalankan di VS Code
Prasyarat: Node.js 18+.
```bash
npm install
npm run dev        # API: http://localhost:4000 · Web: http://localhost:5173
npm test           # uji logika Skenario A–F (PRD bagian 15)
npm run test:api   # uji integrasi API: login per portal, hak akses, laporan warga, batas laju
npm run test:all   # keduanya
npm run build && npm start   # produksi: satu server di http://localhost:4000
```
## Pintu masuk (dipisah per peran)
Buka `http://localhost:5173` lalu pilih peran, atau langsung ke alamat berikut:

| Peran | Alamat | Akun demo |
|---|---|---|
| Petugas Penanganan Banjir | `/#/masuk/petugas` | `petugas@floodops.id` / `petugas123` |
| Pengguna | `/#/masuk/pengguna` | `pengguna@floodops.id` / `pengguna123` |
| Administrator | `/#/masuk/admin` | `admin@floodops.id` / `admin123` |
| Warga (tanpa akun) | `/#/lapor` | – |

Server menolak login jika peran akun tidak sesuai portal (HTTP 403) dan membatasi 5 percobaan gagal per 5 menit.

## Laporan warga
Warga mengirim laporan di `/#/lapor` tanpa login dan mendapat kode (mis. `LW-2E73D5`) untuk mengecek status. Laporan berstatus *belum terverifikasi* dan masuk ke **Dashboard Petugas → Antrean laporan warga**. Kontak warga (opsional) hanya terlihat petugas/admin. Perlindungan: validasi input, kolom jebakan bot, batas 5 laporan per 10 menit per IP.
Salin `.env.example` menjadi `.env` untuk mengatur `JWT_SECRET` dan (opsional) `OPENROUTER_API_KEY`. Peta OpenStreetMap membutuhkan koneksi internet.

## Struktur
| Lokasi | Isi |
|---|---|
| `server/analysis.js` | Skor prioritas (rumus PRD 10.2), alasan skor, graf jalan, simulasi penutupan |
| `server/index.js` | REST API, login JWT + bcrypt, hak akses per peran, validasi, audit log, ekspor CSV |
| `server/seed.js` | Data uji **sintetis** (16 simpul, 23 ruas, 7 fasilitas, 10 laporan, 3 akun) |
| `server/store.js` | Penyimpanan file JSON `server/data/db.json` (hapus file ini untuk reset data) |
| `server/test.js` | Uji otomatis Skenario A–F |
| `supabase/schema.sql` | 7 tabel sesuai PRD bagian 12 |
| `src/pages/*` | Dashboard Utama, Dashboard Petugas (laporan), Simulasi, Data Banjir, Pengelolaan Data |

## Rumus (PRD 10.2)
Nilai indikator = (skala − 1) ÷ 2 × 100. Skor = 40% genangan + 35% dampak akses + 25% jalur alternatif.
Genangan: ≤20 cm = 1, 21–50 cm = 2, >50 cm = 3 (dapat diubah di kode/parameter). Dampak akses: 3 jika ada permukiman–fasilitas terputus saat ruas ditutup, 2 jika rute terdekat memanjang >25%, selain itu 1. Jalur alternatif: 0 rute pengganti = 3, 1 = 2, ≥2 = 1. Kategori: 70–100 tinggi, 40–69 menengah, 0–39 lebih rendah.

## Batasan yang perlu dinyatakan kepada juri (PRD bagian 23)
- Jaringan jalan berupa **skema ilustratif** (garis lurus antar persimpangan), bukan hasil ekstraksi OSM; laporan dan fasilitas adalah **data sintetis**. Untuk produksi, ganti `server/seed.js` dengan data OSM/pemerintah yang diverifikasi.
- Penyimpanan default adalah file JSON agar langsung jalan. Untuk memakai Supabase, jalankan `supabase/schema.sql` lalu ganti fungsi pada `server/store.js` dan `server/index.js` dengan klien Supabase (belum dikerjakan).
- Pembatasan laporan/login memakai memori server (reset saat server restart) dan belum memakai Redis/WAF. Sebelum dipakai nyata: ganti `JWT_SECRET`, batasi CORS, dan gunakan HTTPS.
- Skor bukan keputusan resmi penanganan bencana. Target pengujian PRD (uji pengguna, waktu muat ≤5 detik) belum diukur; catat hasil aktualnya sendiri.

## Peran dan hak akses (mengikuti use case)
| Peran | Dapat melakukan |
|---|---|
| Warga (tanpa akun) | Kirim laporan, cek status dengan kode |
| Pengguna | Login, lihat peta & dashboard, input laporan kondisi jalan. Skor dan penjelasan skor **disembunyikan oleh server** |
| Petugas Penanganan Banjir | Semua milik Pengguna + daftar prioritas & penjelasan skor, verifikasi/tolak/perbarui laporan, simulasi penutupan, ekspor |
| Administrator | Verifikasi/perbarui laporan, kelola pengguna, parameter, dan fasilitas, lihat audit log |

Peran "Peneliti/Pengelola Wilayah" pada PRD belum memiliki portal tersendiri; kebutuhannya (rekap data) saat ini dipenuhi lewat ekspor CSV oleh Petugas. Pengelolaan *wilayah* oleh admin belum tersedia (wilayah berupa teks pada ruas).

## Deployment
```bash
docker build -t floodops . && docker run -p 4000:4000 -e JWT_SECRET=ganti-ini floodops
```
Atau hubungkan repositori ke Render (`render.yaml`) / Railway / Fly.io. CI GitHub Actions (`.github/workflows/ci.yml`) menjalankan uji dan build. Penting: data disimpan pada berkas JSON; pada hosting bergaya sementara (mis. Render gratis) data kembali ke data uji saat restart.

## Desain antarmuka
Gaya mengikuti referensi dashboard (sidebar berkelompok, kartu KPI, grafik, donut). Peta memakai tampilan Leaflet sendiri. Kategori prioritas: merah = tinggi, kuning = menengah, biru = lebih rendah (hijau dipakai sebagai warna merek sehingga tidak dipakai untuk kategori).
