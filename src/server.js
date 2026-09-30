'use strict';

const env = require('./config/env');
const { db, migrate } = require('./config/database');
const seed = require('./services/seed.service');
const { createApp } = require('./app');

function banner(hasilSeed) {
  const line = '='.repeat(72);
  const akun = hasilSeed.akunDemo || [];
  const baris = [
    line,
    `  ${env.companyName.toUpperCase()} - SISTEM INFORMASI MANAJEMEN`,
    line,
    `  Server        : http://localhost:${env.port}`,
    `  Mode          : ${env.nodeEnv}`,
    `  Database      : ${env.databaseFile}`,
    `  Data karyawan : ${hasilSeed.karyawan}`,
    `  Akun pengguna : ${hasilSeed.users}`,
    `  Data absensi  : ${hasilSeed.absensi} record`,
    `  Transaksi     : ${hasilSeed.transaksi} record`,
    line,
  ];
  if (akun.length) {
    baris.push('  AKUN AWAL - password dapat dilihat kembali di Manajemen Pengguna:');
    akun.forEach((a, i) => {
      baris.push(`   ${i + 1}. ${a.role.padEnd(22)} : ${a.nama}`);
      baris.push(`      ${a.email}  /  ${a.password}`);
    });
    baris.push(line);
  }
  console.log(baris.join('\n'));
}

function start() {
  migrate();
  const hasilSeed = seed.run();

  const app = createApp();
  const server = app.listen(env.port, env.host, () => {
    banner(hasilSeed);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`\n  Port ${env.port} sudah dipakai aplikasi lain.`);
      console.error('  Ubah PORT pada file .env lalu jalankan ulang.\n');
      process.exit(1);
    }
    throw error;
  });

  const shutdown = (signal) => {
    console.log(`\n  ${signal} diterima, menutup server...`);
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}

if (require.main === module) start();

module.exports = { start };
