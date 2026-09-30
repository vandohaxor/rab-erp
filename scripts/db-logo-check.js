'use strict';
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('./data/rab.sqlite');
const cek = (sql) => { try { return db.prepare(sql).all(); } catch (e) { return [{ err: e.message }]; } };
console.log('absensi  :', JSON.stringify(cek("SELECT id, foto_path FROM absensi WHERE foto_path LIKE '%logo%'")));
console.log('karyawan :', JSON.stringify(cek("SELECT id, nama_lengkap, foto_path FROM karyawan WHERE foto_path LIKE '%logo%'")));
console.log('settings :', JSON.stringify(cek("SELECT nama, nilai FROM settings WHERE nama LIKE '%logo%'")));
db.close();
