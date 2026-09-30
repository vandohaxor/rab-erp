'use strict';

/*
  Crawler seluruh halaman GET untuk setiap role, mencari status 4xx/5xx.
  Jalankan: node scripts/crawl-halaman.js
*/
const { DatabaseSync } = require('node:sqlite');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3001';

const cek = new DatabaseSync('./data/rab.sqlite');
const kredensial = cek.prepare('SELECT email, password_teks FROM users').all();
cek.close();

const HALAMAN = [
  '/', '/profil', '/absensi', '/absensi/saya', '/absensi/rekap',
  '/karyawan', '/karyawan/tambah', '/users', '/users/tambah',
  '/keuangan', '/keuangan/transaksi', '/keuangan/transaksi/tambah',
  '/keuangan/kategori', '/keuangan/rekap',
  '/payroll', '/payroll/slip-saya', '/payroll/proses', '/payroll/laporan',
  '/pengajuan', '/pengajuan/tambah',
  '/laporan', '/laporan/absensi', '/laporan/payroll', '/laporan/keuangan',
  '/pengaturan', '/pengaturan/profil', '/pengaturan/jadwal', '/pengaturan/parameter',
];

function cookieFrom(res) {
  return (res.headers.getSetCookie ? res.headers.getSetCookie() : []).map((c) => c.split(';')[0]).join('; ');
}

async function login(email, password) {
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password }).toString(),
  });
  if (res.status !== 302) throw new Error(`login ${email} -> ${res.status}`);
  return cookieFrom(res);
}

(async () => {
  for (const k of kredensial) {
    const cookie = await login(k.email, k.password_teks);
    const role = await (await fetch(`${BASE}/profil`, { headers: { cookie } })).text()
      .then((t) => (t.match(/SuperAdmin|Karyawan|Keuangan|HRD/i) || ['?'])[0]);
    console.log(`\n=== ${k.email} (${role}) ===`);
    for (const p of HALAMAN) {
      const res = await fetch(BASE + p, { redirect: 'manual', headers: { cookie } });
      const status = res.status;
      const loc = res.headers.get('location') || '';
      if (status >= 400) {
        let pesan = '';
        if (status === 500) pesan = (await res.text()).replace(/\s+/g, ' ').slice(0, 90);
        console.log(`  ${String(status).padEnd(4)} ${p} ${pesan}`);
      } else if (loc) {
        console.log(`  ${status}    ${p} -> ${loc}`);
      } else {
        console.log(`  ${status}    ${p}`);
      }
    }
  }
  process.exit(0);
})().catch((e) => { console.error('GAGAL:', e.message); process.exit(1); });
