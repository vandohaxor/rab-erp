'use strict';

const fs = require('fs');
const path = require('path');
const env = require('../config/env');

const target = process.env.DB_FILE
  ? path.isAbsolute(process.env.DB_FILE)
    ? process.env.DB_FILE
    : path.join(env.rootDir, process.env.DB_FILE)
  : path.join(env.rootDir, './data/rab.sqlite');

for (const suffix of ['', '-wal', '-shm', '-journal']) {
  const file = `${target}${suffix}`;
  if (fs.existsSync(file)) {
    fs.rmSync(file);
    console.log(`  Dihapus: ${file}`);
  }
}

const { migrate } = require('../config/database');
const seed = require('../services/seed.service');
migrate();
const hasil = seed.run();
console.log('\n  Database berhasil dibuat ulang.');
console.log(`  Karyawan: ${hasil.karyawan} | Users: ${hasil.users} | Absensi: ${hasil.absensi} | Transaksi: ${hasil.transaksi}`);
console.log(`  Login superadmin: ${env.seed.adminEmail} / ${env.seed.adminPassword}\n`);
process.exit(0);
