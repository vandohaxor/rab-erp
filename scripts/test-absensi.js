'use strict';

/* Uji cepat alur absensi karyawan + export. Jalankan: node scripts/test-absensi.js */
const { DatabaseSync } = require('node:sqlite');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3001';

// Ambil password asli dari DB agar tidak salah ketik saat pengujian.
const cek = new DatabaseSync('./data/rab.sqlite');
function password(email) {
  const u = cek.prepare('SELECT password_teks FROM users WHERE email = ?').get(email);
  cek.close();
  if (!u || !u.password_teks) throw new Error(`password_teks kosong untuk ${email}`);
  return u.password_teks;
}

function cookieFrom(res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  return raw.map((c) => c.split(';')[0]).join('; ');
}

async function req(p, cookie, options = {}) {
  return fetch(BASE + p, { redirect: 'manual', ...options, headers: { cookie, ...(options.headers || {}) } });
}

async function login(email, password) {
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password }).toString(),
  });
  const c = cookieFrom(res);
  if (!c) throw new Error(`login ${email} gagal: ${res.status} ${res.headers.get('location')}`);
  return c;
}

// PNG 1x1 supaya tidak perlu file eksternal.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const HARI_INI = new Date().toISOString().slice(0, 10);

function absenForm({ status = 'hadir', keterangan = '', foto = true, jam = '08:05' } = {}) {
  const fd = new FormData();
  fd.append('tanggal', HARI_INI);
  fd.append('jam', jam);
  fd.append('status', status);
  fd.append('keterangan', keterangan);
  if (foto) fd.append('foto', new Blob([PNG], { type: 'image/png' }), 'uji.png');
  return fd;
}

(async () => {
  const kar = await login('dewi.anggraini@rajawaliatasbumi.co.id', password('dewi.anggraini@rajawaliatasbumi.co.id'));
  console.log('1.  login karyawan        : OK');

  const halaman = await req('/absensi/saya', kar);
  const html = await halaman.text();
  console.log(`2.  /absensi/saya         : ${halaman.status} ${halaman.status === 200 ? 'OK' : 'GAGAL'}`);
  console.log(`    form + input foto     : ${html.includes('name="foto"') ? 'ada' : 'TIDAK ADA'}`);
  console.log(`    status hadir/izin/sakit: ${['hadir', 'izin', 'sakit'].every((s) => html.includes(`value="${s}"`)) ? 'lengkap' : 'KURANG'}`);

  const izin = await req('/absensi/saya/masuk', kar, {
    method: 'POST', body: absenForm({ status: 'izin', keterangan: 'Izin acara keluarga (uji otomatis)' }),
  });
  console.log(`3.  absen izin + foto     : ${izin.status} -> ${izin.headers.get('location')}`);

  const tanpaFoto = await req('/absensi/saya/masuk', kar, {
    method: 'POST', body: absenForm({ foto: false }),
  });
  console.log(`4.  absen tanpa foto      : ${tanpaFoto.status} (ditolak, pesan "Foto absensi wajib diunggah")`);

  const kedua = await req('/absensi/saya/masuk', kar, { method: 'POST', body: absenForm() });
  console.log(`5.  absen kedua kali      : ${kedua.status} (ditolak, sudah absen hari ini)`);

  const hr = await login('direktur@rajawaliatasbumi.co.id', password('direktur@rajawaliatasbumi.co.id'));
  console.log('6.  login direktur        : OK');

  const data = await req('/absensi', hr);
  const dataHtml = await data.text();
  console.log(`7.  /absensi (direktur)    : ${data.status} ${data.status === 200 ? 'OK' : 'GAGAL'}`);
  console.log(`    kolom + thumbnail foto: ${dataHtml.includes('foto-thumb') ? 'ada' : 'TIDAK ADA'}`);
  console.log(`    catatan foto terkirim : ${dataHtml.includes('Izin acara keluarga') ? 'terlihat' : 'TIDAK TERLIHAT'}`);

  const exHarian = await req('/absensi/export/harian', hr);
  const csv1 = await exHarian.text();
  console.log(`8.  export harian         : ${exHarian.status} | ${exHarian.headers.get('content-disposition')}`);
  console.log(`    judul kolom           : ${csv1.split('\r\n')[0].slice(0, 80)}`);

  const exRekap = await req('/absensi/export/rekap', hr);
  const csv2 = await exRekap.text();
  console.log(`9.  export rekap bulanan  : ${exRekap.status} | ${csv2.split('\r\n').length} baris`);

  const exPeriode = await req('/absensi/export/periode?tanggal_mulai=2020-01-01&tanggal_selesai=2030-01-01', hr);
  console.log(`10. export periode        : ${exPeriode.status}`);

  const fotoUrl = (csv1.match(/uploads\/absensi\/[^\s"]+\.png/) || [])[0];
  if (fotoUrl) {
    const f = await fetch(`${BASE}/${fotoUrl}`);
    console.log(`11. file foto di server   : ${f.status} ${f.headers.get('content-type')} ${f.headers.get('content-length')} bytes`);
  } else {
    console.log('11. file foto di server   : nama file tidak ditemukan di CSV');
  }

  const users = await req('/users', hr);
  const usersHtml = await users.text();
  console.log(`12. /users + password     : ${users.status} ${usersHtml.includes('data-password-plain') ? 'OK (password bisa dilihat)' : 'TIDAK ADA'}`);

  process.exit(0);
})().catch((e) => { console.error('GAGAL:', e.message); process.exit(1); });
