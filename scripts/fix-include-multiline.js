'use strict';

/*
  Perbaiki pola include multi-baris di template EJS.
  EJS tidak boleh punya tag <%- ... %> yang membentang beberapa baris.
  Filter periode dipindah ke partial; sisanya jadi include satu baris.
*/
const fs = require('fs');
const path = require('path');

const FILTER = `<div class="d-flex flex-wrap justify-content-end align-items-center gap-2 mb-3">
  <%- include('../partials/filter-periode', { periode: periode }) %>
  <button class="btn btn-outline-secondary btn-sm" onclick="window.print()">
    <i class="bi bi-printer me-1"></i>Cetak
  </button>
</div>`;

const FILTER_TANPA_CETAK = `<div class="d-flex flex-wrap justify-content-end align-items-center gap-2 mb-3">
  <%- include('../partials/filter-periode', { periode: periode }) %>
</div>`;

const FILES = [
  { f: 'views/laporan/absensi.ejs', filter: FILTER },
  { f: 'views/laporan/lembur.ejs', filter: FILTER },
  { f: 'views/laporan/payroll.ejs', filter: FILTER },
  { f: 'views/laporan/perusahaan.ejs', filter: FILTER },
  { f: 'views/payroll/slip-saya.ejs', filter: FILTER },
  { f: 'views/payroll/index.ejs', filter: FILTER_TANPA_CETAK },
];

for (const { f, filter } of FILES) {
  const p = path.resolve(f);
  let src = fs.readFileSync(p, 'utf8');
  const awal = src.indexOf('<%- include(');
  const akhir = src.indexOf('}) %>', awal);
  if (awal < 0 || akhir < 0) {
    console.log(`LEWAT  ${f} (pola tidak ditemukan)`);
    continue;
  }
  const ganti = `<%- include('../partials/page-head', { title: title, subtitle: subtitle, crumbs: crumbs, actions: actions }) %>\n\n${filter}`;
  src = src.slice(0, awal) + ganti + src.slice(akhir + '}) %>'.length);
  fs.writeFileSync(p, src);
  console.log(`OK     ${f}`);
}
