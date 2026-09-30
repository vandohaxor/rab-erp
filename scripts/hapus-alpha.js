'use strict';

/* Hapus tampilan "Alpha" dari template (status alpha sudah dihapus dari aplikasi). */
const fs = require('fs');
const path = require('path');

const HAPUS = [
  // baris yang dibuang persis
  'views/dashboard/index.ejs',
  'views/laporan/absensi.ejs',
  'views/karyawan/detail.ejs',
  'views/payroll/slip-saya.ejs',
].map((f) => path.resolve(f));

for (const p of HAPUS) {
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  const sebelum = lines.length;
  const baru = lines.filter((l) => {
    const t = l.trim();
    // Blok stat "Alpha" (label + value + meta) dibuang 3 baris berurutan.
    if (t === '<div class="stat-label">Alpha</div>') return false;
    if (t.includes('r.hariAlpha') || t.includes('r.hari_alpha') || t.includes('total.alpha')
      || t.includes('rekap.alpha') || t.includes('slip.hari_alpha')) return false;
    if (t.includes("{ label: 'Alpha', data:")) return false;
    if (t.includes('<th class="text-center">Alpha</th>')) {
      // Buang hanya tag Alpha di dalam satu baris header.
      return t.replace('<th class="text-center">Alpha</th>', '') !== t;
    }
    if (t.includes('izin/sakit/alpha')) return l.replace('/alpha', '');
    return true;
  });
  fs.writeFileSync(p, baru.join('\n'));
  console.log(`OK ${path.relative(process.cwd(), p)}: ${sebelum} -> ${baru.length} baris`);
}
