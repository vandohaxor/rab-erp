'use strict';

/**
 * Smoke test: login tiap role lalu buka seluruh route utama.
 * Jalankan: node scripts/smoke-test.js
 */

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';

const AKUN = [
  { role: 'superadmin', email: 'direktur@rajawaliatasbumi.co.id', password: 'Direktur123!' },
  { role: 'keuangan', email: 'keuangan@rajawaliatasbumi.co.id', password: 'Keuangan123!' },
  { role: 'karyawan', email: 'dewi.anggraini@rajawaliatasbumi.co.id', password: 'Karyawan123!' },
];

const ROUTE = {
  superadmin: [
    '/', '/karyawan', '/karyawan/tambah', '/karyawan/export/csv', '/users', '/users/tambah',
    '/absensi', '/absensi/rekap', '/pengajuan', '/keuangan', '/keuangan/transaksi/tambah',
    '/keuangan/kategori', '/payroll', '/laporan', '/laporan/perusahaan', '/laporan/absensi',
    '/laporan/lembur', '/laporan/payroll', '/laporan/karyawan', '/laporan/keuangan',
    '/pengaturan', '/pengaturan/audit', '/profil',
  ],
  keuangan: [
    '/', '/absensi', '/absensi/rekap', '/keuangan', '/keuangan/kategori', '/payroll',
    '/laporan', '/laporan/absensi', '/laporan/lembur', '/laporan/payroll', '/laporan/keuangan',
    '/profil',
  ],
  karyawan: ['/', '/absensi', '/absensi/saya', '/pengajuan', '/payroll/slip-saya', '/profil'],
};

let gagal = 0;

function cookieFrom(res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  return raw.map((c) => c.split(';')[0]).join('; ');
}

async function req(path, cookie, options = {}) {
  const res = await fetch(BASE + path, {
    redirect: 'manual',
    ...options,
    headers: { cookie, ...(options.headers || {}) },
  });
  return res;
}

async function login(akun) {
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: akun.email, password: akun.password }).toString(),
  });
  const cookie = cookieFrom(res);
  const lokasi = res.headers.get('location') || '';
  if (!cookie || lokasi.includes('/login')) {
    throw new Error(`Login ${akun.role} gagal (${res.status} -> ${lokasi})`);
  }
  return cookie;
}

async function ujiAksesDitolak(cookie, path, label) {
  const res = await req(path, cookie);
  if (res.status !== 403 && res.status !== 302) {
    console.log(`  ! ${label} seharusnya ditolak, dapat ${res.status}`);
    gagal += 1;
  }
}

(async () => {
  for (const akun of AKUN) {
    console.log(`\n== ${akun.role} (${akun.email})`);
    let cookie;
    try {
      cookie = await login(akun);
    } catch (error) {
      console.log(`  x login: ${error.message}`);
      gagal += 1;
      continue;
    }
    console.log('  login OK');

    for (const path of ROUTE[akun.role]) {
      const res = await req(path, cookie);
      const ok = res.status === 200;
      if (!ok) gagal += 1;
      console.log(`  ${ok ? 'v' : 'x'} ${path} -> ${res.status}${ok ? '' : ` (${res.headers.get('location') || ''})`}`);
    }

    if (akun.role !== 'superadmin') {
      await ujiAksesDitolak(cookie, '/karyawan', `${akun.role} -> /karyawan`);
      await ujiAksesDitolak(cookie, '/users', `${akun.role} -> /users`);
      await ujiAksesDitolak(cookie, '/pengaturan', `${akun.role} -> /pengaturan`);
      await ujiAksesDitolak(cookie, '/payroll/slip-saya', 'tidak diuji');
    }
    if (akun.role === 'karyawan') {
      await ujiAksesDitolak(cookie, '/keuangan', 'karyawan -> /keuangan');
      await ujiAksesDitolak(cookie, '/payroll', 'karyawan -> /payroll');
    }
  }

  constanon = await fetch(`${BASE}/karyawan`, { redirect: 'manual' });
  if (anon.status !== 302) {
    console.log(`\n! tamu -> /karyawan seharusnya redirect, dapat ${anon.status}`);
    gagal += 1;
  } else {
    console.log('\nv tamu -> /karyawan redirect ke login');
  }

  console.log(gagal === 0 ? '\nSEMUA SMOKE TEST LULUS' : `\n${gagal} MASALAH DITEMUKAN`);
  process.exit(gagal === 0 ? 0 : 1);
})();
