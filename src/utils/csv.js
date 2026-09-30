'use strict';

const h = require('./helpers');

/** Escape satu sel CSV: bungkus kutip, dobelkan kutip di dalam, buang baris baru. */
function sel(value) {
  const teks = value === null || value === undefined ? '' : String(value);
  return `"${teks.replace(/"/g, '""').replace(/[\r\n]+/g, ' ')}"`;
}

/**
 * Susun isi CSV yang langsung rapi dibuka di Excel (pemisah titik koma,
 * awalan BOM UTF-8 agar karakter Indonesia tampil benar).
 */
function build(headers, rows) {
  return `\uFEFF${[headers.map(sel).join(';'), ...rows.map((r) => r.map(sel).join(';'))].join('\r\n')}\r\n`;
}

/** Kirim unduhan CSV. headers = judul kolom, rows = array of array nilai. */
function send(res, filename, headers, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(build(headers, rows));
}

/** Nama file unduhan yang aman: "absensi-2026-09-30.csv" */
function filename(prefix, suffix = '') {
  return `${prefix}${suffix ? `-${suffix}` : ''}-${h.today()}.csv`;
}

module.exports = { sel, build, send, filename };
