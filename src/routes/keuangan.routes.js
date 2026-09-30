'use strict';

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const db = require('../config/database');
const h = require('../utils/helpers');
const { requireAuth, requireModule } = require('../middleware/auth');
const keuanganService = require('../services/keuangan.service');
const exportService = require('../services/export.service');
const xls = require('../utils/excel');

const router = express.Router();
router.use(requireAuth, requireModule('keuangan'));

function defaultRange() {
  const akhir = h.today();
  const mulai = h.dayjs().startOf('month').format('YYYY-MM-DD');
  return { mulai, akhir };
}

function ambilRange(req) {
  const def = defaultRange();
  return {
    tanggalMulai: req.query.tanggal_mulai || def.mulai,
    tanggalSelesai: req.query.tanggal_selesai || def.akhir,
  };
}

/* ================= DASHBOARD KEUANGAN ================= */
router.get('/', (req, res) => {
  const { tanggalMulai, tanggalSelesai } = ambilRange(req);
  const rekap = keuanganService.rekap(tanggalMulai, tanggalSelesai);

  res.render('keuangan/index', {
    title: 'Keuangan Perusahaan',
    subtitle: `Arus kas ${h.date(tanggalMulai)} s.d. ${h.date(tanggalSelesai)}`,
    crumbs: [{ label: 'Keuangan' }],
    rekap,
    tanggalMulai,
    tanggalSelesai,
    tren: keuanganService.trenBulanan(),
    perKategoriMasuk: keuanganService.perKategori(tanggalMulai, tanggalSelesai, 'pemasukan'),
    perKategoriKeluar: keuanganService.perKategori(tanggalMulai, tanggalSelesai, 'pengeluaran'),
    arusKas: keuanganService.arusKas(tanggalMulai, tanggalSelesai),
    saldoTahun: keuanganService.saldorunning(h.today()),
    transaksiTerbaru: keuanganService.daftar({ limit: 8 }).rows,
    actions: `
      <a href="/keuangan/laporan" class="btn btn-outline-primary btn-sm"><i class="bi bi-file-earmark-text me-1"></i>Laporan</a>
      <a href="/keuangan/transaksi/tambah?jenis=pengeluaran" class="btn btn-navy btn-sm"><i class="bi bi-plus-lg me-1"></i>Catat Transaksi</a>`,
  });
});

/* ================= TRANSAKSI ================= */
router.get('/transaksi', [
  query('q').optional().trim(),
  query('jenis').optional().isIn(['pemasukan', 'pengeluaran']),
  query('kategori_id').optional(),
  query('page').optional().isInt({ min: 1 }),
], (req, res) => {
  const params = {
    q: req.query.q || '',
    jenis: req.query.jenis || '',
    kategoriId: req.query.kategori_id || '',
    tanggalMulai: req.query.tanggal_mulai || h.dayjs().startOf('month').format('YYYY-MM-DD'),
    tanggalSelesai: req.query.tanggal_selesai || h.today(),
    page: Number(req.query.page) || 1,
    limit: 15,
  };

  const hasil = keuanganService.daftar(params);
  const rekap = keuanganService.rekap(params.tanggalMulai, params.tanggalSelesai);

  res.render('keuangan/transaksi', {
    title: 'Transaksi Keuangan',
    subtitle: 'Catatan seluruh penerimaan dan pengeluaran perusahaan',
    crumbs: [{ label: 'Keuangan', href: '/keuangan' }, { label: 'Transaksi' }],
    ...hasil,
    rekap,
    kategori: keuanganService.kategoriSemua(),
    filter: req.query,
    actions: `
      <a href="/keuangan/transaksi/export/xlsx?tanggal_mulai=${params.tanggalMulai}&tanggal_selesai=${params.tanggalSelesai}&jenis=${params.jenis}&kategori_id=${params.kategoriId}&q=${encodeURIComponent(params.q)}" class="btn btn-success btn-sm">
        <i class="bi bi-file-earmark-excel me-1"></i>Excel Transaksi
      </a>
      <a href="/keuangan/transaksi/tambah?jenis=pemasukan" class="btn btn-outline-success btn-sm"><i class="bi bi-arrow-down-circle me-1"></i>Pemasukan</a>
      <a href="/keuangan/transaksi/tambah?jenis=pengeluaran" class="btn btn-navy btn-sm"><i class="bi bi-arrow-up-circle me-1"></i>Pengeluaran</a>`,
  });
});

router.get('/transaksi/tambah', (req, res) => {
  const jenis = req.query.jenis === 'pemasukan' ? 'pemasukan' : 'pengeluaran';
  res.render('keuangan/form-transaksi', {
    title: `Catat ${h.capitalize(jenis)}`,
    subtitle: 'Masukkan detail transaksi keuangan',
    crumbs: [{ label: 'Keuangan', href: '/keuangan' }, { label: 'Transaksi', href: '/keuangan/transaksi' }, { label: 'Tambah' }],
    transaksi: null,
    jenis,
    kategori: keuanganService.kategori(jenis),
    semuaKategori: keuanganService.kategoriSemua(),
    values: { jenis, tanggal: h.today(), metode: 'transfer' },
    errors: [],
  });
});

router.get('/transaksi/:id/edit', (req, res, next) => {
  const transaksi = keuanganService.getById(req.params.id);
  if (!transaksi) return next();

  return res.render('keuangan/form-transaksi', {
    title: 'Ubah Transaksi',
    subtitle: transaksi.kode,
    crumbs: [{ label: 'Keuangan', href: '/keuangan' }, { label: 'Transaksi', href: '/keuangan/transaksi' }, { label: 'Ubah' }],
    transaksi,
    jenis: transaksi.jenis,
    kategori: keuanganService.kategori(transaksi.jenis),
    semuaKategori: keuanganService.kategoriSemua(),
    values: transaksi,
    errors: [],
  });
});

const rules = [
  body('tanggal').isISO8601().withMessage('Tanggal tidak valid.'),
  body('jenis').isIn(['pemasukan', 'pengeluaran']).withMessage('Jenis transaksi tidak valid.'),
  body('jumlah').custom((v) => h.toNumber(v) > 0).withMessage('Nominal harus lebih dari nol.'),
  body('keterangan').optional({ values: 'falsy' }).trim().isLength({ max: 500 }),
];

const persist = (req, res, next) => {
  const errors = validationResult(req);
  const id = req.params.id;
  const jenis = req.body.jenis;

  const kategoriValid = db.db.pluck('SELECT id FROM kategori_transaksi WHERE id = ? AND jenis = ?',
    Number(req.body.kategori_id || 0), jenis);
  if (!req.body.kategori_id) errors.addError({ path: '_', msg: 'Kategori transaksi wajib dipilih.' });
  else if (!kategoriValid) errors.addError({ path: '_', msg: 'Kategori tidak sesuai dengan jenis transaksi.' });

  const renderForm = () => res.status(422).render('keuangan/form-transaksi', {
    title: id ? 'Ubah Transaksi' : `Catat ${h.capitalize(jenis)}`,
    subtitle: id ? 'Perbarui detail transaksi' : 'Masukkan detail transaksi keuangan',
    crumbs: [{ label: 'Keuangan', href: '/keuangan' }, { label: 'Transaksi', href: '/keuangan/transaksi' }, { label: id ? 'Ubah' : 'Tambah' }],
    transaksi: id ? keuanganService.getById(id) : null,
    jenis,
    kategori: keuanganService.kategori(jenis),
    semuaKategori: keuanganService.kategoriSemua(),
    values: { ...req.body, jumlah: h.toPlainInput(req.body.jumlah) },
    errors: errors.array(),
  });

  if (!errors.isEmpty()) return renderForm();

  const data = {
    tanggal: req.body.tanggal,
    jenis,
    kategori_id: Number(req.body.kategori_id),
    jumlah: req.body.jumlah,
    metode: req.body.metode || 'transfer',
    pic: req.body.pic,
    keterangan: req.body.keterangan,
    no_referensi: req.body.no_referensi,
  };

  if (id) {
    keuanganService.ubah(id, data);
    req.audit(req, 'UBAH', 'transaksi', id, `Update transaksi ${jenis} ${h.money(h.toNumber(data.jumlah))}`);
    req.session.flash = { type: 'success', message: 'Transaksi berhasil diperbarui.' };
    return res.redirect('/keuangan/transaksi');
  }

  const newId = keuanganService.simpan(data, req.user.id);
  req.audit(req, 'TAMBAH', 'transaksi', newId,
    `${h.capitalize(jenis)} ${h.money(h.toNumber(data.jumlah))} - ${data.keterangan || ''}`);
  req.session.flash = { type: 'success', message: `Transaksi ${h.capitalize(jenis)} ${h.money(h.toNumber(data.jumlah))} berhasil dicatat.` };
  return res.redirect('/keuangan/transaksi');
};

router.post('/transaksi/tambah', rules, persist);
router.put('/transaksi/:id', rules, persist);

router.delete('/transaksi/:id', (req, res, next) => {
  const transaksi = keuanganService.getById(req.params.id);
  if (!transaksi) return next();

  keuanganService.hapus(transaksi.id);
  req.audit(req, 'HAPUS', 'transaksi', transaksi.id, `Hapus transaksi ${transaksi.kode}`);
  req.session.flash = { type: 'success', message: `Transaksi ${transaksi.kode} berhasil dihapus.` };
  return res.redirect('/keuangan/transaksi');
});

/* Export Excel (.xlsx) transaksi + rekap per kategori */
router.get('/transaksi/export/xlsx', async (req, res, next) => {
  try {
    const tanggalMulai = req.query.tanggal_mulai || h.dayjs().startOf('month').format('YYYY-MM-DD');
    const tanggalSelesai = req.query.tanggal_selesai || h.today();
    const hasil = keuanganService.daftar({
      q: req.query.q || '',
      jenis: req.query.jenis || '',
      kategoriId: req.query.kategori_id || '',
      tanggalMulai,
      tanggalSelesai,
      limit: 100000,
    });

    req.audit(req, 'EXPORT_KEUANGAN', 'transaksi', `${tanggalMulai}..${tanggalSelesai}`,
      `Export Excel transaksi ${tanggalMulai} s.d. ${tanggalSelesai} (${hasil.rows.length} baris)`);

    const L = exportService.keuanganTransaksi({
      rows: hasil.rows,
      tanggalMulai,
      tanggalSelesai,
      user: req.user,
      perusahaan: res.locals.company,
    });
    return await L.kirim(res, `transaksi-${tanggalMulai}_sd_${tanggalSelesai}.xlsx`);
  } catch (error) {
    return next(error);
  }
});

/* ================= KATEGORI ================= */
router.get('/kategori', (req, res) => {
  res.render('keuangan/kategori', {
    title: 'Kategori Transaksi',
    subtitle: 'Kelola kategori pendapatan dan pengeluaran',
    crumbs: [{ label: 'Keuangan', href: '/keuangan' }, { label: 'Kategori' }],
    semua: keuanganService.kategoriSemua(),
    pemakaian: db.db.all(
      'SELECT kategori_id, COUNT(*) AS total FROM transaksi WHERE kategori_id IS NOT NULL GROUP BY kategori_id',
    ),
  });
});

router.post('/kategori', [
  body('nama').trim().notEmpty().withMessage('Nama kategori wajib diisi.').isLength({ max: 80 }),
  body('jenis').isIn(['pemasukan', 'pengeluaran']).withMessage('Jenis tidak valid.'),
], (req, res) => {
  const errors = validationResult(req);
  const nama = String(req.body.nama || '').trim();

  const dup = db.db.get('SELECT id FROM kategori_transaksi WHERE nama = ?', nama);
  if (dup) {
    errors.addError({ path: '_', msg: `Kategori "${nama}" sudah ada.` });
  }

  if (!errors.isEmpty()) {
    req.session.flash = { type: 'danger', message: errors.array()[0].msg };
    return res.redirect('/keuangan/kategori');
  }

  keuanganService.simpanKategori({ nama, jenis: req.body.jenis, keterangan: req.body.keterangan });
  req.audit(req, 'TAMBAH', 'kategori', nama, `Kategori ${req.body.jenis}: ${nama}`);
  req.session.flash = { type: 'success', message: `Kategori "${nama}" berhasil disimpan.` };
  return res.redirect('/keuangan/kategori');
});

router.delete('/kategori/:id', (req, res) => {
  const kategori = db.db.get('SELECT * FROM kategori_transaksi WHERE id = ?', req.params.id);
  if (!kategori) return res.redirect('/keuangan/kategori');

  try {
    keuanganService.hapusKategori(kategori.id);
    req.audit(req, 'HAPUS', 'kategori', kategori.id, `Kategori ${kategori.nama}`);
    req.session.flash = { type: 'success', message: `Kategori "${kategori.nama}" dihapus.` };
  } catch (error) {
    req.session.flash = { type: 'warning', message: error.message };
  }
  return res.redirect('/keuangan/kategori');
});

/* ================= LAPORAN KEUANGAN ================= */
router.get('/laporan', (req, res) => {
  const { tanggalMulai, tanggalSelesai } = ambilRange(req);
  res.render('keuangan/laporan', {
    title: 'Laporan Keuangan',
    subtitle: 'Laporan laba rugi dan arus kas periode terpilih',
    crumbs: [{ label: 'Keuangan', href: '/keuangan' }, { label: 'Laporan' }],
    tanggalMulai,
    tanggalSelesai,
    rekap: keuanganService.rekap(tanggalMulai, tanggalSelesai),
    perKategoriMasuk: keuanganService.perKategori(tanggalMulai, tanggalSelesai, 'pemasukan'),
    perKategoriKeluar: keuanganService.perKategori(tanggalMulai, tanggalSelesai, 'pengeluaran'),
    arusKas: keuanganService.arusKas(tanggalMulai, tanggalSelesai),
    actions: `
      <a href="/keuangan/transaksi/export/xlsx?tanggal_mulai=${tanggalMulai}&tanggal_selesai=${tanggalSelesai}" class="btn btn-success btn-sm">
        <i class="bi bi-file-earmark-excel me-1"></i>Excel
      </a>
      <button class="btn btn-outline-secondary btn-sm" onclick="window.print()">
        <i class="bi bi-printer me-1"></i>Cetak Laporan
      </button>`,
  });
});

module.exports = router;
