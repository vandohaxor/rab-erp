'use strict';

/* Hapus file foto absensi yang tidak lagi dirujuk tabel absensi. */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const AKAR = path.resolve('public/uploads/absensi');
if (!fs.existsSync(AKAR)) {
  console.log('public/uploads/absensi tidak ada, tidak ada yang dibersihkan.');
  process.exit(0);
}

const db = new DatabaseSync(path.resolve('data/rab.sqlite'));
const dipakai = new Set(
  db.prepare("SELECT foto_path FROM absensi WHERE foto_path IS NOT NULL AND foto_path <> ''")
    .all()
    .map((r) => path.basename(String(r.foto_path).replace(/\\/g, '/')))
);
db.close();

let hapus = 0;
const jalankan = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) {
      jalankan(f);
      if (fs.readdirSync(f).length === 0) fs.rmdirSync(f);
    } else if (!dipakai.has(e.name)) {
      fs.unlinkSync(f);
      hapus += 1;
      console.log('  dihapus:', path.relative(process.cwd(), f));
    }
  }
};
jalankan(AKAR);
console.log(`total file yatim dihapus: ${hapus}`);
