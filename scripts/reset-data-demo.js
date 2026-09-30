'use strict';

/*
  Bersihkan data demo/testing, sisakan hanya akun + data karyawan direktur.
  Jalankan: node scripts/reset-data-demo.js
*/
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB = path.resolve('data/rab.sqlite');
const BACKUP_DIR = path.resolve('data/backup');

// 1. Backup dulu.
fs.mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const backup = path.join(BACKUP_DIR, `rab-${stamp}.sqlite`);
fs.copyFileSync(DB, backup);
console.log('1. backup              :', backup, `(${(fs.statSync(backup).size / 1024).toFixed(0)} KB)`);

const db = new DatabaseSync(DB);
db.exec('PRAGMA foreign_keys = ON');

const KEEP_KARYAWAN = 1; // Rangga Prasetyo Wibowo - direktur
const KEEP_USER = 1; // direktur@rajawaliatasbumi.co.id

// 2. Pastikan user direktur tertaut ke karyawan direktur.
db.prepare('UPDATE users SET karyawan_id = ? WHERE id = ?').run(KEEP_KARYAWAN, KEEP_USER);

// 3. Hapus data operasional (semua kolom *_id sudah diset NULL oleh trigger/fk).
const langkah = [
  ['transaksi', 'DELETE FROM transaksi'],
  ['transaksi_detail', 'DELETE FROM transaksi_detail'],
  ['pengajuan_izin', 'DELETE FROM pengajuan_izin'],
  ['absensi', 'DELETE FROM absensi'],
  ['payroll', 'DELETE FROM payroll'],
  ['audit_log', 'DELETE FROM audit_log'],
  ['sessions', 'DELETE FROM sessions'],
];
for (const [label, sql] of langkah) {
  try {
    const info = db.prepare(sql).run();
    console.log(`   ${label.padEnd(18)}: ${info.changes} baris dihapus`);
  } catch (e) {
    console.log(`   ${label.padEnd(18)}: dilewati (${e.message})`);
  }
}

// 4. Reset auto increment tabel transaksi.
try { db.exec("DELETE FROM sqlite_sequence WHERE name IN ('transaksi','transaksi_detail','absensi','payroll','pengajuan_izin')"); } catch {}

// 5. Hapus user & karyawan selain direktur.
const u = db.prepare('DELETE FROM users WHERE id <> ?').run(KEEP_USER);
const k = db.prepare('DELETE FROM karyawan WHERE id <> ?').run(KEEP_KARYAWAN);
console.log(`   users               : ${u.changes} dihapus`);
console.log(`   karyawan            : ${k.changes} dihapus`);

// 6. Pastikan tidak ada user/karyawan yatim.
const yatimUser = db.prepare('SELECT COUNT(*) AS n FROM users WHERE karyawan_id IS NOT NULL AND karyawan_id NOT IN (SELECT id FROM karyawan)').get().n;
if (yatimUser) {
  db.prepare('UPDATE users SET karyawan_id = NULL WHERE karyawan_id IS NOT NULL AND karyawan_id NOT IN (SELECT id FROM karyawan)').run();
  console.log(`   user yatim          : ${yatimUser} dilepas`);
}
db.exec('PRAGMA foreign_keys = ON');
db.exec('VACUUM');

// 7. Laporan akhir.
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
console.log('\n2. isi database setelah bersih:');
for (const t of tables) {
  const n = db.prepare(`SELECT COUNT(*) AS n FROM "${t.name}"`).get().n;
  if (n) console.log(`   ${t.name.padEnd(20)}: ${n}`);
}
console.log('\n3. user & karyawan tersisa:');
for (const row of db.prepare('SELECT u.id, u.email, u.role, u.nama, k.nip, k.nama_lengkap FROM users u LEFT JOIN karyawan k ON k.id = u.karyawan_id').all()) {
  console.log(`   ${row.id} | ${row.email} | ${row.role} | ${row.nip} ${row.nama_lengkap}`);
}
db.close();

// 8. Hapus file foto absensi hasil testing (logo perusahaan tetap disimpan).
const up = path.resolve('public/uploads/absensi');
if (fs.existsSync(up)) {
  fs.rmSync(up, { recursive: true, force: true });
  console.log('\n4. folder foto absensi  : public/uploads/absensi dihapus');
}
console.log('\nSelesai. Jalankan ulang server, lalu masuk dengan akun direktur.');
