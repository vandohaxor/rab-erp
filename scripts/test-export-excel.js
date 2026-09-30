'use strict';

/*
  Uji semua export Excel: buat data uji sementara, unduh semua file .xlsx,
  cek isinya, lalu hapus data uji kembali.
  Jalankan: node scripts/test-export-excel.js
*/
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { DatabaseSync } = require('node:sqlite');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3001';
const DB_FILE = process.env.DB_FILE || './data/rab.sqlite';
const OUT = path.resolve('logs/export-test');
fs.mkdirSync(OUT, { recursive: true });

const db = new DatabaseSync(DB_FILE);
const dbMod = require('../src/config/database');

function pass(kredensial) {
  const r = kredensial.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  return { cookie: r };
}

async function login(email, password) {
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password }).toString(),
  });
  if (res.status !== 302) throw new Error(`login gagal ${res.status}`);
  return pass(res).cookie;
}

async function unduh(cookie, url, label) {
  const res = await fetch(BASE + url, { redirect: 'manual', headers: { cookie } });
  if (res.status !== 200) {
    const t = await res.text();
    console.log(`  GAGAL ${label.padEnd(26)} ${res.status} ${t.replace(/\s+/g, ' ').slice(0, 120)}`);
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const file = path.join(OUT, label.replace(/[^\w.-]/g, '_') + '.xlsx');
  fs.writeFileSync(file, buf);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const namaSheet = wb.worksheets.map((w) => w.name);
  const w = wb.worksheets[0];
  console.log(`  OK    ${label.padEnd(26)} ${(buf.length / 1024).toFixed(0)} KB | sheet: ${namaSheet.join(' | ')} | baris: ${w.rowCount}`);
  return { wb, file, w, namaSheet };
}

/* ---------- siapkan data uji ---------- */
const UJI = [
  { nip: 'UJI-01', nama: 'Budi Uji Santoso', gaji: 7800000, ttrans: 450000, tmakan: 350000, tlain: 400000 },
  { nip: 'UJI-02', nama: 'Sari Uji Wijaya', gaji: 6500000, ttrans: 400000, tmakan: 300000, tlain: 300000 },
];

const idKaryawan = [];
const idKategori = db.prepare("SELECT id FROM kategori_transaksi WHERE jenis = 'pemasukan' LIMIT 1").get()?.id;

for (const k of UJI) {
  const dep = db.prepare("SELECT id FROM departemen WHERE nama = 'Operasional'").get()?.id;
  const id = dbMod.db.run(
    `INSERT INTO karyawan (nip, nama_lengkap, departemen_id, jabatan, tipe_kontrak, tanggal_masuk,
      status_karyawan, gaji_pokok, tunjangan_transport, tunjangan_makan, tunjangan_lain, email, no_hp, nama_bank, no_rekening)
     VALUES (?,?,?,?,?,'2024-01-15','aktif',?,?,?,?,?,?,?,?)`,
    k.nip, k.nama, dep, 'Staff Uji', 'PKWT', k.gaji, k.ttrans, k.tmakan, k.tlain,
    `${k.nip.toLowerCase()}@uji.co.id`, '081200000099', 'BCA', '9999999999',
  ).lastInsertRowid;
  idKaryawan.push({ id, ...k });
}

// Absensi 12 hari kerja + lembur + izin + sakit
const dayjs = require('dayjs');
let hari = 0;
for (let i = 20; i >= 1 && hari < 12; i -= 1) {
  const d = dayjs().subtract(i, 'day');
  if (d.day() === 0 || d.day() === 6) continue;
  hari += 1;
  for (const k of idKaryawan) {
    if (hari === 3) {
      dbMod.db.run("INSERT INTO absensi (karyawan_id, tanggal, status, keterangan) VALUES (?,?,'izin','Uji otomatis: izin acara keluarga')", k.id, d.format('YYYY-MM-DD'));
      continue;
    }
    if (hari === 5) {
      dbMod.db.run("INSERT INTO absensi (karyawan_id, tanggal, status, keterangan) VALUES (?,?,'sakit','Uji otomatis:demam')", k.id, d.format('YYYY-MM-DD'));
      continue;
    }
    const menit = 480 + (hari % 3) * 10; // 08:00 + sedikit
    const lembur = hari % 4 === 0 ? 90 : 30;
    dbMod.db.run(
      `INSERT INTO absensi (karyawan_id, tanggal, jam_masuk, jam_pulang, durasi_menit, menit_lembur, status, sumber)
       VALUES (?,?,?,?,?,?,'hadir','mandiri')`,
      k.id, d.format('YYYY-MM-DD'),
      `${String(Math.floor(menit / 60)).padStart(2, '0')}:${String(menit % 60).padStart(2, '0')}`,
      `${String(Math.floor((menit + 480 + lembur) / 60)).padStart(2, '0')}:${String((menit + 480 + lembur) % 60).padStart(2, '0')}`,
      480 + lembur, lembur,
    );
  }
}

// Transaksi keuangan
if (idKategori) {
  dbMod.db.run(
    `INSERT INTO transaksi (kode, tanggal, jenis, kategori_id, jumlah, metode, pic, keterangan, dibuat_oleh)
     VALUES ('UJI-001', ?, 'pemasukan', ?, 52500000, 'transfer', 'Sari Uji Wijaya', 'Transaksi uji otomatis', 1)`,
    dayjs().subtract(3, 'day').format('YYYY-MM-DD'), idKategori,
  );
  dbMod.db.run(
    `INSERT INTO transaksi (kode, tanggal, jenis, kategori_id, jumlah, metode, pic, keterangan, dibuat_oleh)
     VALUES ('UJI-002', ?, 'pengeluaran', ?, 18750000, 'transfer', 'Budi Uji Santoso', 'Transaksi uji otomatis', 1)`,
    dayjs().subtract(2, 'day').format('YYYY-MM-DD'),
    db.prepare("SELECT id FROM kategori_transaksi WHERE jenis = 'pengeluaran' LIMIT 1").get()?.id,
  );
}

const bl = dayjs().format('YYYY-MM');
console.log(`Data uji siap: ${idKaryawan.length} karyawan, absensi ${db.prepare('SELECT COUNT(*) n FROM absensi WHERE karyawan_id IN (?,?)').get(...idKaryawan.map((k) => k.id)).n} baris, transaksi 2\n`);

(async () => {
  const u = db.prepare('SELECT email, password_teks FROM users LIMIT 1').get();
  const cookie = await login(u.email, u.password_teks);
  const bulan = dayjs().format('MM');
  const tahun = dayjs().format('YYYY');
  const blNow = encodeURIComponent(bl);

  console.log('EXPORT ABSENSI:');
  await unduh(cookie, `/absensi/export/harian?tanggal=${bl}-02`, '01-absensi-harian');
  await unduh(cookie, `/absensi/export/rekap?bulan=${bulan}&tahun=${tahun}`, '02-absensi-rekap-bulanan');
  await unduh(cookie, `/absensi/export/lembur?bulan=${bulan}&tahun=${tahun}`, '03-rekap-lembur');
  await unduh(cookie, `/absensi/export/periode?tanggal_mulai=${bl}-01&tanggal_selesai=${blNow}`, '04-absensi-periode');

  console.log('\nEXPORT MODUL LAIN:');
  await unduh(cookie, '/karyawan/export/xlsx', '05-karyawan');
  await unduh(cookie, `/keuangan/transaksi/export/xlsx?tanggal_mulai=${bl}-01&tanggal_selesai=${blNow}`, '06-keuangan-transaksi');
  await unduh(cookie, `/payroll/export/xlsx?bulan=${bulan}&tahun=${tahun}`, '07-payroll-rekap');

  // Cek isi salah satu file secara detail.
  const f = path.join(OUT, '02-absensi-rekap-bulanan.xlsx');
  if (fs.existsSync(f)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(f);
    console.log('\nCEK ISI rekap bulanan:');
    for (const name of wb.worksheets.map((w) => w.name)) {
      const w = wb.getWorksheet(name);
      const hdr = w.getRow(8).values.filter(Boolean);
      console.log(`  [${name}] header: ${hdr.join(' | ')}`);
      const r9 = w.getRow(9).values.filter(Boolean);
      console.log(`  [${name}] baris1: ${r9.map((v) => (typeof v === 'number' ? v : v)).join(' | ')}`);
      const rTot = w.getRow(w.rowCount);
      console.log(`  [${name}] baris terakhir: ${rTot.values.filter(Boolean).join(' | ')}`);
      if (w.getRow(6).values.filter(Boolean).length) {
        console.log(`  [${name}] ringkasan: ${w.getRow(6).values.filter(Boolean).join(' | ')}`);
      }
      const c = w.getRow(9).getCell(2);
      console.log(`  [${name}] B9 bold=${c.font?.bold} warna=${c.font?.color?.argb || '-'} | filter=${w.autoFilter ? 'ada' : 'tidak'}`);
    }
  }

  // Bersihkan data uji.
  dbMod.db.run('DELETE FROM absensi WHERE karyawan_id IN (?,?)', ...idKaryawan.map((k) => k.id));
  dbMod.db.run("DELETE FROM transaksi WHERE kode LIKE 'UJI-%'");
  dbMod.db.run('DELETE FROM users WHERE email LIKE ?', '%@uji.co.id');
  dbMod.db.run('DELETE FROM karyawan WHERE nip LIKE ?', 'UJI-%');
  console.log('\nData uji sudah dihapus. Sisa karyawan:', db.prepare('SELECT COUNT(*) n FROM karyawan').get().n);
  process.exit(0);
})().catch((e) => { console.error('GAGAL:', e); process.exit(1); });
