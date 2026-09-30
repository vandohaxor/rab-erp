'use strict';

const db = require('../config/database');
const h = require('../utils/helpers');

function nextKode(jenis, tanggal) {
  const prefix = jenis === 'pemasukan' ? 'PN' : 'PG';
  const periode = h.dayjs(tanggal).format('YYMM');
  const row = db.db.get(
    "SELECT COUNT(*) AS total FROM transaksi WHERE kode LIKE ?",
    `${prefix}/${periode}/%`,
  );
  const next = Number(row?.total || 0) + 1;
  return `${prefix}/${periode}/${String(next).padStart(4, '0')}`;
}

function kategori(jenis) {
  return db.db.all('SELECT * FROM kategori_transaksi WHERE jenis = ? ORDER BY nama', jenis);
}

function kategoriSemua() {
  return db.db.all('SELECT * FROM kategori_transaksi ORDER BY jenis, nama');
}

function simpanKategori({ nama, jenis, keterangan }) {
  const ada = db.db.get('SELECT id FROM kategori_transaksi WHERE nama = ?', nama);
  if (ada) {
    db.db.run('UPDATE kategori_transaksi SET jenis = ?, keterangan = ? WHERE id = ?', jenis, keterangan || null, ada.id);
    return ada.id;
  }
  return db.db.run(
    'INSERT INTO kategori_transaksi (nama, jenis, keterangan) VALUES (?, ?, ?)',
    nama, jenis, keterangan || null,
  ).lastInsertRowid;
}

function hapusKategori(id) {
  const dipakai = Number(db.db.pluck('SELECT COUNT(*) FROM transaksi WHERE kategori_id = ?', id) || 0);
  if (dipakai > 0) {
    throw Object.assign(new Error('Kategori masih dipakai pada transaksi dan tidak dapat dihapus.'), { statusCode: 409 });
  }
  return db.db.run('DELETE FROM kategori_transaksi WHERE id = ?', id).changes;
}

function filters(params = {}) {
  const where = [];
  const args = [];
  if (params.tanggalMulai) { where.push('t.tanggal >= ?'); args.push(params.tanggalMulai); }
  if (params.tanggalSelesai) { where.push('t.tanggal <= ?'); args.push(params.tanggalSelesai); }
  if (params.jenis) { where.push('t.jenis = ?'); args.push(params.jenis); }
  if (params.kategoriId) { where.push('t.kategori_id = ?'); args.push(Number(params.kategoriId)); }
  if (params.q) {
    where.push('(t.keterangan LIKE ? OR t.pic LIKE ? OR t.kode LIKE ? OR t.no_referensi LIKE ?)');
    args.push(`%${params.q}%`, `%${params.q}%`, `%${params.q}%`, `%${params.q}%`);
  }
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', args };
}

function daftar(params = {}) {
  const { clause, args } = filters(params);
  const limit = Number(params.limit || 100);
  const page = Math.max(1, Number(params.page || 1));
  const offset = (page - 1) * limit;

  const total = Number(db.db.pluck(
    `SELECT COUNT(*) FROM transaksi t ${clause}`,
    ...args,
  ) || 0);

  const rows = db.db.all(
    `SELECT t.*, k.nama AS kategori
       FROM transaksi t
       LEFT JOIN kategori_transaksi k ON k.id = t.kategori_id
       ${clause}
      ORDER BY t.tanggal DESC, t.id DESC
      LIMIT ? OFFSET ?`,
    ...args, limit, offset,
  );

  return { rows, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

function getById(id) {
  return db.db.get(
    `SELECT t.*, k.nama AS kategori, u.nama AS dibuat_oleh_nama
       FROM transaksi t
       LEFT JOIN kategori_transaksi k ON k.id = t.kategori_id
       LEFT JOIN users u ON u.id = t.dibuat_oleh
      WHERE t.id = ?`,
    id,
  );
}

function simpan(data, userId) {
  const tanggal = data.tanggal || h.today();
  const jenis = data.jenis;
  const kode = nextKode(jenis, tanggal);
  return db.db.run(
    `INSERT INTO transaksi (kode, tanggal, jenis, kategori_id, jumlah, metode, pic, keterangan, no_referensi, status, dibuat_oleh)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    kode, tanggal, jenis, data.kategori_id || null, h.toNumber(data.jumlah), data.metode || 'transfer',
    data.pic || null, data.keterangan || null, data.no_referensi || null, data.status || 'posted', userId || null,
  ).lastInsertRowid;
}

function ubah(id, data) {
  return db.db.run(
    `UPDATE transaksi
        SET tanggal = ?, jenis = ?, kategori_id = ?, jumlah = ?, metode = ?, pic = ?,
            keterangan = ?, no_referensi = ?, updated_at = datetime('now','localtime')
      WHERE id = ?`,
    data.tanggal || h.today(), data.jenis, data.kategori_id || null, h.toNumber(data.jumlah),
    data.metode || 'transfer', data.pic || null, data.keterangan || null, data.no_referensi || null, id,
  ).changes;
}

function hapus(id) {
  return db.db.run('DELETE FROM transaksi WHERE id = ?', id).changes;
}

/** Agregat income/expense + saldo dalam rentang tanggal. */
function rekap(tanggalMulai, tanggalSelesai) {
  const row = db.db.get(
    `SELECT
        COALESCE(SUM(CASE WHEN jenis = 'pemasukan' THEN jumlah ELSE 0 END), 0) AS pemasukan,
        COALESCE(SUM(CASE WHEN jenis = 'pengeluaran' THEN jumlah ELSE 0 END), 0) AS pengeluaran,
        COUNT(*) AS jumlah_transaksi
      FROM transaksi
      WHERE status = 'posted' AND tanggal BETWEEN ? AND ?`,
    tanggalMulai,
    tanggalSelesai,
  );

  const pemasukan = Number(row?.pemasukan || 0);
  const pengeluaran = Number(row?.pengeluaran || 0);
  return {
    tanggalMulai,
    tanggalSelesai,
    pemasukan,
    pengeluaran,
    labaBersih: pemasukan - pengeluaran,
    jumlahTransaksi: Number(row?.jumlah_transaksi || 0),
  };
}

/** Rekap per kategori untuk tabel breakdown. */
function perKategori(tanggalMulai, tanggalSelesai, jenis) {
  return db.db.all(
    `SELECT COALESCE(k.nama, 'Tanpa Kategori') AS kategori, COALESCE(k.jenis, t.jenis) AS jenis,
            COUNT(*) AS jumlah_transaksi, SUM(t.jumlah) AS total
       FROM transaksi t
       LEFT JOIN kategori_transaksi k ON k.id = t.kategori_id
      WHERE t.status = 'posted' AND t.jenis = ? AND t.tanggal BETWEEN ? AND ?
      GROUP BY k.nama, k.jenis
      ORDER BY total DESC`,
    jenis, tanggalMulai, tanggalSelesai,
  );
}

/** Deret harian (grafik arus kas). */
function arusKas(tanggalMulai, tanggalSelesai) {
  return db.db.all(
    `SELECT tanggal,
            SUM(CASE WHEN jenis = 'pemasukan' THEN jumlah ELSE 0 END) AS pemasukan,
            SUM(CASE WHEN jenis = 'pengeluaran' THEN jumlah ELSE 0 END) AS pengeluaran
       FROM transaksi
      WHERE status = 'posted' AND tanggal BETWEEN ? AND ?
      GROUP BY tanggal
      ORDER BY tanggal`,
    tanggalMulai, tanggalSelesai,
  );
}

/** 12 bulan terakhir untuk grafik dashboard. */
function trenBulanan() {
  const hasil = [];
  for (let i = 11; i >= 0; i -= 1) {
    const d = h.dayjs().subtract(i, 'month');
    const mulai = d.startOf('month').format('YYYY-MM-DD');
    const akhir = d.endOf('month').format('YYYY-MM-DD');
    const r = rekap(mulai, akhir);
    hasil.push({
      periode: d.format('MMM YY'),
      bulan: d.month() + 1,
      tahun: d.year(),
      pemasukan: r.pemasukan,
      pengeluaran: r.pengeluaran,
      laba: r.labaBersih,
    });
  }
  return hasil;
}

/** Saldo berjalan kumulatif dari awal tahun. */
function saldorunning(tanggal) {
  const awalTahun = `${tanggal.slice(0, 4)}-01-01`;
  return rekap(awalTahun, tanggal);
}

module.exports = {
  nextKode,
  kategori,
  kategoriSemua,
  simpanKategori,
  hapusKategori,
  daftar,
  getById,
  simpan,
  ubah,
  hapus,
  rekap,
  perKategori,
  arusKas,
  trenBulanan,
  saldorunning,
};
