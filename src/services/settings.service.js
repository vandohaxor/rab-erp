'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../config/database');

const LOGO_DEFAULT = '/uploads/logo.png';

/** Path logo yang benar-benar ada di folder publik, atau string kosong. */
function logoDefault() {
  const f = path.resolve(__dirname, '..', '..', 'public', LOGO_DEFAULT.replace(/^\/+/, ''));
  try {
    return fs.statSync(f).isFile() ? LOGO_DEFAULT : '';
  } catch (e) {
    return '';
  }
}

const DEFAULTS = {
  'perusahaan.nama': 'PT Rajawali Atas Bumi',
  'perusahaan.badan': 'PT Rajawali Atas Bumi',
  'perusahaan.tagline': 'Mitra Terpercaya dalam Solusi Bisnis',
  'perusahaan.alamat': 'Jl. Raya Rajawali No. 00, Indonesia',
  'perusahaan.kota': '',
  'perusahaan.provinsi': '',
  'perusahaan.kode_pos': '',
  'perusahaan.telepon': '',
  'perusahaan.email': '',
  'perusahaan.website': '',
  'perusahaan.npwp': '',
  'perusahaan.direktur': '',
  'perusahaan.logo': LOGO_DEFAULT,
  'absensi.jam_masuk': '08:00',
  'absensi.jam_pulang': '18:00',
  'absensi.batas_absen_masuk': '09:00',
  'absensi.toleransi_menit': '15',
  'payroll.hari_kerja_bulanan': '22',
  'payroll.jam_kerja_harian': '8',
  'payroll.faktor_lembur': '1.5',
  'payroll.persen_tunjangan_hadir': '0',
  'payroll.persen_bpjs': '0',
  'payroll.hari_libur': '0',
};

const KATEGORI_DEFAULT = [
  ['Penjualan Produk', 'pemasukan'],
  ['Penjualan Jasa', 'pemasukan'],
  ['Pendapatan Sewa', 'pemasukan'],
  ['Pendapatan Bunga', 'pemasukan'],
  ['Pendapatan Lain-lain', 'pemasukan'],
  ['Pembelian Bahan Baku', 'pengeluaran'],
  ['Gaji Karyawan', 'pengeluaran'],
  ['Tunjangan & Lembur', 'pengeluaran'],
  ['Sewa Tempat', 'pengeluaran'],
  ['Utilitas (Listrik, Air, Internet)', 'pengeluaran'],
  ['Transportasi & Logistik', 'pengeluaran'],
  ['Peralatan & ATK', 'pengeluaran'],
  ['Perawatan & Pemeliharaan', 'pengeluaran'],
  ['Pajak & Retribusi', 'pengeluaran'],
  ['Biaya Administrasi', 'pengeluaran'],
  ['Pengeluaran Lain-lain', 'pengeluaran'],
];

function semua() {
  const rows = db.db.all('SELECT key, value FROM settings');
  const map = { ...DEFAULTS };
  for (const row of rows) map[row.key] = row.value;
  return map;
}

function get(key, fallback) {
  const row = db.db.get('SELECT value FROM settings WHERE key = ?', key);
  if (row && row.value !== null && row.value !== '') return row.value;
  if (fallback !== undefined) return fallback;
  return DEFAULTS[key];
}

function num(key, fallback = 0) {
  const value = get(key, fallback);
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function set(key, value) {
  db.db.run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now','localtime'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key,
    value === null || value === undefined ? '' : String(value),
  );
}

function setMany(obj) {
  db.db.transaction(() => {
    for (const [key, value] of Object.entries(obj)) set(key, value);
  });
}

/** Informasi perusahaan yang dipakai header, footer, dan kop surat. */
function perusahaan() {
  const s = semua();
  return {
    nama: s['perusahaan.nama'],
    badan: s['perusahaan.badan'] || s['perusahaan.nama'],
    tagline: s['perusahaan.tagline'],
    alamat: s['perusahaan.alamat'],
    kota: s['perusahaan.kota'],
    provinsi: s['perusahaan.provinsi'],
    kodePos: s['perusahaan.kode_pos'],
    telepon: s['perusahaan.telepon'],
    email: s['perusahaan.email'],
    website: s['perusahaan.website'],
    npwp: s['perusahaan.npwp'],
    direktur: s['perusahaan.direktur'],
    logo: s['perusahaan.logo'] || logoDefault(),
    alamatLengkap: [s['perusahaan.alamat'], s['perusahaan.kota'], s['perusahaan.provinsi'], s['perusahaan.kode_pos']]
      .filter(Boolean)
      .join(', '),
  };
}

function ensureDefaults() {
  db.db.transaction(() => {
    for (const [key, value] of Object.entries(DEFAULTS)) {
      const ada = db.db.get('SELECT 1 FROM settings WHERE key = ?', key);
      if (!ada) set(key, value);
    }
    for (const [nama, jenis] of KATEGORI_DEFAULT) {
      const ada = db.db.get('SELECT 1 FROM kategori_transaksi WHERE nama = ?', nama);
      if (!ada) db.db.run('INSERT INTO kategori_transaksi (nama, jenis) VALUES (?, ?)', nama, jenis);
    }
  });
}

module.exports = { DEFAULTS, KATEGORI_DEFAULT, semua, get, num, set, setMany, perusahaan, ensureDefaults };
