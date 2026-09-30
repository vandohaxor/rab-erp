'use strict';

/* Kompilasi semua file .ejs untuk mendeteksi tag yang tidak tertutup. */
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const root = path.resolve('views');
let bad = 0;
let total = 0;

(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!e.name.endsWith('.ejs')) continue;
    total += 1;
    const src = fs.readFileSync(p, 'utf8');
    try {
      ejs.compile(src, { filename: p });
    } catch (err) {
      bad += 1;
      const rel = path.relative(process.cwd(), p);
      const line = (src.slice(0, 200).match(/\n/g) || []).length + 1;
      console.log(`BROKEN ${rel}\n   ${err.message.split('\n')[0]}`);
      // Tampilkan kandidat baris dengan "<%-" yang tidak tertutup.
      src.split('\n').forEach((l, i) => {
        const open = (l.match(/<%-/g) || []).length;
        const close = (l.match(/-%>/g) || []).length;
        const openE = (l.match(/<%/g) || []).length - open;
        const closeE = (l.match(/%>/g) || []).length - close;
        if (open && !close && !openE) console.log(`   baris ${i + 1}: ${l.trim().slice(0, 120)}`);
      });
    }
  }
})(root);

console.log(`\n${total} template diperiksa, ${bad} bermasalah.`);
