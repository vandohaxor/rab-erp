# RAB ERP

Sistem Informasi Manajemen PT Rajawali Atas Bumi — absensi, karyawan, keuangan, payroll, dan laporan.

## Teknologi

| Bagian | Teknologi |
|---|---|
| Runtime | Node.js 24 (bawaan `.nvmrc`) |
| Framework | Express 4 + EJS (server-side, tanpa build step) |
| Database | SQLite lewat modul bawaan `node:sqlite` (`data/rab.sqlite`) |
| Session | `express-session` dengan store custom berbasis SQLite |
| Upload | `multer` ke `public/uploads/absensi/<tanggal>/` |
| Keamanan | `helmet`, `bcryptjs`, `express-rate-limit`, `express-validator` |

## Menjalankan di komputer sendiri

```bash
npm install
copy .env.example .env    # Linux/macOS: cp .env.example .env
npm start                 # atau: npm run dev (auto-reload)
```

Buka `http://localhost:3000` (port mengikuti `PORT` di `.env`).

Skrip bantu:

```bash
npm run db:reset          # hapus & buat ulang database
node scripts/list-routes.js   # daftar seluruh route
node scripts/smoke-test.js    # Smoke test
```

## ⚠️ Jangan hapus `data/rab.sqlite-wal` saat server berjalan

Database memakai mode WAL. Data yang baru di-*commit* masih bisa berada di file
`-wal` dan baru masuk ke file utama saat checkpoint. Menghapus `-wal`/`-shm`
saat server aktif akan menghilangkan data tersebut tanpa pesan error.

## Deploy ke Render.com (gratis)

### 1. Push ke GitHub

```bash
git init
git add .
git commit -m "Siap deploy ke Render"
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

> **PENTING: buat repo sebagai PRIVAT.** `data/rab.sqlite` ikut ter-commit dan
> berisi NIK, nomor rekening, serta nama karyawan. Jangan pernah dipublikasikan.

### 2. Buat Web Service di Render

1. Login ke [dashboard.render.com](https://dashboard.render.com) → **New +** → **Web Service**
2. Hubungkan repo GitHub yang tadi di-push
3. Isi pengaturan berikut:

| Pengaturan | Nilai |
|---|---|
| Name | `rab-erp` (mentukan URL `rab-erp.onrender.com`) |
| Region | **Singapore** (terdekat dengan Indonesia) |
| Branch | `main` |
| Root Directory | kosong |
| Runtime | Node (otomatis, sudah ada `.nvmrc`) |
| Build Command | **kosongkan** |
| Health Check Path | **`/login`** |
| Instance Type | **Free** |

> **Kenapa Health Check Path harus `/login`?** Halaman `/` memakai middleware
> auth sehingga mengembalikan redirect `302` ke `/login`, sedangkan Render hanya
> menganggap `2xx` sebagai sehat. Kalau diisi `/`, deploy akan terus ditandai
> "Failed" padahal aplikasinya jalan.

### 3. Environment Variables

| Key | Value | Catatan |
|---|---|---|
| `NODE_ENV` | `production` | Mengaktifkan cookie `secure` |
| `NODE_VERSION` | `24` | Sama dengan `.nvmrc` |
| `HOST` | `0.0.0.0` | Wajib agar dapat diakses Render |
| `COMPANY_NAME` | `PT Rajawali Atas Bumi` | Tampil di header & laporan |
| `SESSION_SECRET` | string acak 32+ karakter | **Wajib.** `src/config/env.js:30` melempar error kalau kosong di production |
| `DB_FILE` | `./data/rab.sqlite` | Sudah ikut ter-commit |
| `SEED_DEMO` | `false` | `true` hanya untuk mengisi data contoh |
| `DEFAULT_ADMIN_EMAIL` | `direktur@rajawaliatasbumi.co.id` | Dipakai bila database kosong |
| `DEFAULT_ADMIN_PASSWORD` | `Direktur2026!` | **Ganti** bila aplikasi diakses publik |

`PORT` dan `NODE_ENV` tidak perlu diisi manual untuk `PORT` — Render sudah
mengisi `PORT` sendiri, dan `src/config/env.js:22` membacanya otomatis.

Setelah deploy, buka **Logs** di Render. Aplikasi mencetak ringkasan data
(`src/server.js:8`) yang berguna untuk presentasi.

## Akun Demo

| Peran | Email | Password |
|---|---|---|
| Superadmin / Direktur | `direktur@rajawaliatasbumi.co.id` | `Direktur2026!` |
| Karyawan | `vandohaxor@gmail.com` | lihat menu Manajemen Pengguna |

## Mencegah instance tidur (sleep)

Instance Free Render tidur setelah **15 menit tanpa request**. Untuk presentasi,
pasang pinger gratis:

1. Daftar di [uptimerobot.com](https://uptimerobot.com) (gratis, 50 monitor)
2. **Add New Monitor** → tipe **HTTP(s)**
3. URL: `https://rab-erp.onrender.com/login` (pakai `/login`, bukan `/`)
4. **Monitoring Interval**: 5 menit

Nyalakan pinger **30 menit sebelum presentasi** (instance butuh ~30 detik untuk
start up setelah tidur), dan **matikan setelah presentasi** — pinger yang nyala
24/7 menghabiskan kuota 750 jam/bulan Render.

## Keterbatasan yang perlu diketahui

- **Data hilang setiap instance di-recycle.** Render Free tidak menyediakan
  persistent disk, jadi `data/rab.sqlite` kembali ke isi repository setiap
  kali service di-restart atau di-deploy ulang. Untuk demo justru ini
  menguntungkan (presentasi bisa diulang dengan data yang sama), tetapi jangan
  dipakai untuk data operasional nyata.
- **Foto absensi** di `public/uploads/absensi/` juga hilang setelah restart.
- **Password disimpan plaintext** di kolom `users.password_teks` agar bisa
  dilihat kembali di menu Manajemen Pengguna. Ini untuk keperluan demo; pada
  sistem produksi kolom ini harus dihapus.
- **Batas login** 100 percobaan gagal per 10 menit per IP
  (`src/routes/auth.routes.js:14`).
- `node:sqlite` masih berstatus *experimental*, jadi akan muncul
  `ExperimentalWarning` di log. Tidak berpengaruh pada aplikasi.
