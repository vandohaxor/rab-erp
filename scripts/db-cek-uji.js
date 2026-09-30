'use strict';

/* Ringkasan data uji yang tertinggal: karyawan/users UJI, absensi, transaksi uji. */
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('./data/rab.sqlite');

console.log('karyawan:');
for (const r of db.prepare('SELECT id, nip, nama_lengkap, email, tanggal_masuk FROM karyawan ORDER BY id').all()) {
  console.log('  ', JSON.stringify(r));
}
console.log('users:');
for (const r of db.prepare('SELECT id, email, role, karyawan_id FROM users ORDER BY id').all()) {
  console.log('  ', JSON.stringify(r));
}
console.log('absensi:');
for (const r of db.prepare('SELECT id, karyawan_id, tanggal, status, foto_path FROM absensi ORDER BY id').all()) {
  console.log('  ', JSON.stringify(r));
}
console.log('transaksi:', JSON.stringify(db.prepare('SELECT id, kode, tanggal, jenis FROM transaksi ORDER BY id').all()));
console.log('sessions:', db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n);
db.close();
