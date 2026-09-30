'use strict';

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const db = require('../config/database');
const h = require('../utils/helpers');
const { requireAuth, requireModule, requireKaryawan } = require('../middleware/auth');
const { STATUS_PAYROLL } = require('../utils/constants');
const payrollService = require('../services/payroll.service');
const settingsService = require('../services/settings.service');
const exportService = require('../services/export.service');

const router = express.Router();
router.use(requireAuth);

function periode(req) {
  const now = h.dayjs();
  return {
    bulan: Math.min(12, Math.max(1, Number(req.query.bulan) || now.month() + 1)),
    tahun: Number(req.query.tahun) || now.year(),
  };
}

/* ================= SLIP GAJI SAYA ================= */
router.get('/slip-saya', requireKaryawan, (req, res, next) => {
  const { bulan, tahun } = periode(req);
  const karyawan = db.db.get('SELECT * FROM karyawan WHERE id = ?', req.user.karyawanId);
  if (!karyawan) {
    req.session.flash = { type: 'warning', message: 'Akun ini belum terhubung dengan data karyawan.' };
    return next();
  }

  const tersimpan = payrollService.slipTersimpan(req.user.karyawanId, bulan, tahun);
  const slip = tersimpan
    ? {
      ...tersimpan,
      nama_lengkap: karyawan.nama_lengkap,
      nip: karyawan.nip,
      jabatan: karyawan.jabatan,
      persen_bpjs: payrollService.getParameter().persenPotonganBpjs,
    }
    : payrollService.hitungSlip(karyawan, bulan, tahun);

  const absensi = db.db.all(
    `SELECT tanggal, jam_masuk, jam_pulang, durasi_menit, menit_lembur, status
       FROM absensi WHERE karyawan_id = ? AND strftime('%Y-%m', tanggal) = ?
      ORDER BY tanggal`,
    req.user.karyawanId,
    `${tahun}-${String(bulan).padStart(2, '0')}`,
  );

  return res.render('payroll/slip-saya', {
    title: 'Slip Gaji Saya',
    subtitle: `Rincian gaji ${h.monthName(bulan)} ${tahun}`,
    crumbs: [{ label: 'Slip Gaji Saya' }],
    slip,
    karyawan,
    periode: { bulan, tahun },
    absensi,
    pratinjau: !tersimpan,
    param: payrollService.getParameter(),
  });
});

/* ================= DAFTAR PAYROLL ================= */
router.get('/', requireModule('payroll'), [
  query('bulan').optional().isInt({ min: 1, max: 12 }),
  query('tahun').optional().isInt({ min: 2000, max: 2100 }),
  query('status').optional().isIn(Object.keys(STATUS_PAYROLL)),
  query('q').optional().trim(),
], (req, res) => {
  const p = periode(req);
  const filter = { status: req.query.status || '', q: req.query.q || '' };
  const daftar = payrollService.daftar(p.bulan, p.tahun, filter);
  const semua = payrollService.daftar(p.bulan, p.tahun);
  const total = payrollService.rekap(daftar);

  res.render('payroll/index', {
    title: 'Payroll Karyawan',
    subtitle: `Perhitungan gaji ${h.monthName(p.bulan)} ${p.tahun} berdasarkan data absensi`,
    crumbs: [{ label: 'Payroll' }],
    rows: daftar,
    total,
    periode: p,
    filter,
    semuaSlip: semua,
    param: payrollService.getParameter(),
    departments: db.db.all('SELECT * FROM departemen ORDER BY nama'),
    actions: `
      <a href="/payroll/export/xlsx?bulan=${p.bulan}&tahun=${p.tahun}" class="btn btn-success btn-sm">
        <i class="bi bi-file-earmark-excel me-1"></i>Excel Rekap Gaji
      </a>
      <button class="btn btn-outline-secondary btn-sm" onclick="window.print()">
        <i class="bi bi-printer me-1"></i>Cetak
      </button>`,
  });
});

/* ================= GENERATE ================= */
router.post('/generate', requireModule('payroll'), [
  body('bulan').isInt({ min: 1, max: 12 }).withMessage('Bulan tidak valid.'),
  body('tahun').isInt({ min: 2000, max: 2100 }).withMessage('Tahun tidak valid.'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.session.flash = { type: 'danger', message: errors.array()[0].msg };
    return res.redirect('/payroll');
  }

  const bulan = Number(req.body.bulan);
  const tahun = Number(req.body.tahun);
  const opsi = {
    bonus: h.toNumber(req.body.bonus),
    kasbon: h.toNumber(req.body.kasbon),
    potongan_lain: h.toNumber(req.body.potongan_lain),
    catatan: req.body.catatan || null,
  };

  const hasil = payrollService.generate(bulan, tahun, opsi);
  const dibuat = hasil.filter((x) => !x.dilewati).length;
  const dilewati = hasil.filter((x) => x.dilewati).length;

  req.audit(req, 'GENERATE_PAYROLL', 'payroll', `${tahun}-${bulan}`,
    `Generate payroll ${h.monthName(bulan)} ${tahun}: ${dibuat} slip, ${dilewati} dilewati (sudah dibayar)`);
  req.session.flash = {
    type: 'success',
    message: `Payroll ${h.monthName(bulan)} ${tahun} berhasil dihitung untuk ${dibuat} karyawan`
      + (dilewati ? ` (${dilewati} slip sudah dibayar dan tidak diubah).` : '.'),
  };
  return res.redirect(`/payroll?bulan=${bulan}&tahun=${tahun}`);
});

/* ================= SLIP DETAIL ================= */
router.get('/:id', requireModule('payroll'), (req, res, next) => {
  const slip = payrollService.getById(req.params.id);
  if (!slip) return next();

  const karyawan = db.db.get('SELECT * FROM karyawan WHERE id = ?', slip.karyawan_id);
  const absensi = db.db.all(
    `SELECT * FROM absensi WHERE karyawan_id = ? AND strftime('%Y-%m', tanggal) = ? ORDER BY tanggal`,
    slip.karyawan_id,
    `${slip.tahun}-${String(slip.bulan).padStart(2, '0')}`,
  );

  return res.render('payroll/slip', {
    title: `Slip Gaji ${slip.nama_lengkap}`,
    subtitle: `${h.monthName(slip.bulan)} ${slip.tahun}`,
    crumbs: [{ label: 'Payroll', href: '/payroll' }, { label: slip.nama_lengkap }],
    slip,
    karyawan,
    absensi,
    param: payrollService.getParameter(),
  });
});

/* ================= UBAH SLIP INDIVIDU ================= */
router.post('/:id/ubah', requireModule('payroll'), (req, res, next) => {
  const slip = payrollService.getById(req.params.id);
  if (!slip) return next();

  if (slip.status === 'dibayar') {
    req.session.flash = { type: 'warning', message: 'Slip gaji yang sudah dibayar tidak dapat diubah.' };
    return res.redirect(`/payroll/${slip.id}`);
  }

  const bonus = h.toNumber(req.body.bonus);
  const kasbon = h.toNumber(req.body.kasbon);
  const potonganLain = h.toNumber(req.body.potongan_lain);

  payrollService.simpanPenyesuaian(slip.id, {
    bonus,
    kasbon,
    potongan_lain: potonganLain,
    catatan: req.body.catatan || null,
  });

  req.audit(req, 'UBAH_PAYROLL', 'payroll', slip.id,
    `Adjustment slip ${slip.nama_lengkap} ${h.monthName(slip.bulan)} ${slip.tahun}`);
  req.session.flash = { type: 'success', message: 'Penyesuaian slip gaji berhasil disimpan.' };
  return res.redirect(`/payroll/${slip.id}`);
});

/* ================= STATUS ================= */
router.post('/:id/status', requireModule('payroll'), [
  body('status').isIn(Object.keys(STATUS_PAYROLL)).withMessage('Status tidak valid.'),
], (req, res, next) => {
  const slip = payrollService.getById(req.params.id);
  if (!slip) return next();

  payrollService.ubahStatus(slip.id, req.body.status);
  req.audit(req, 'STATUS_PAYROLL', 'payroll', slip.id, `${slip.nama_lengkap} -> ${req.body.status}`);
  req.session.flash = { type: 'success', message: `Status slip ${slip.nama_lengkap} diubah menjadi ${STATUS_PAYROLL[req.body.status].label}.` };
  return res.redirect(`/payroll/${slip.id}`);
});

router.post('/status-periode', requireModule('payroll'), [
  body('bulan').isInt({ min: 1, max: 12 }),
  body('tahun').isInt({ min: 2000, max: 2100 }),
  body('status').isIn(Object.keys(STATUS_PAYROLL)),
], (req, res) => {
  const perubahan = payrollService.ubahStatusPeriode(
    Number(req.body.bulan), Number(req.body.tahun), req.body.status,
  );
  req.audit(req, 'STATUS_PAYROLL', 'payroll', `${req.body.tahun}-${req.body.bulan}`,
    `Ubah status massal -> ${req.body.status} (${perubahan} slip)`);
  req.session.flash = {
    type: 'success',
    message: `${perubahan} slip gaji ${h.monthName(Number(req.body.bulan))} ${req.body.tahun} diubah menjadi ${STATUS_PAYROLL[req.body.status].label}.`,
  };
  return res.redirect(`/payroll?bulan=${req.body.bulan}&tahun=${req.body.tahun}`);
});

/* ================= PARAMETER ================= */
router.get('/parameter/payroll', requireModule('payroll'), (req, res) => {
  res.redirect('/pengaturan?tab=payroll');
});

/* ================= HAPUS PERIODE ================= */
router.delete('/hapus-periode', requireModule('payroll'), [
  body('bulan').isInt({ min: 1, max: 12 }),
  body('tahun').isInt({ min: 2000, max: 2100 }),
], (req, res) => {
  const jumlah = payrollService.hapusPeriode(Number(req.body.bulan), Number(req.body.tahun));
  req.audit(req, 'HAPUS_PAYROLL', 'payroll', `${req.body.tahun}-${req.body.bulan}`, `Hapus ${jumlah} slip draft`);
  req.session.flash = { type: 'success', message: `${jumlah} slip gaji draft berhasil dihapus.` };
  return res.redirect(`/payroll?bulan=${req.body.bulan}&tahun=${req.body.tahun}`);
});

/* ================= EXPORT EXCEL (.xlsx) ================= */
router.get('/export/xlsx', requireModule('payroll'), [
  query('bulan').optional().isInt({ min: 1, max: 12 }),
  query('tahun').optional().isInt({ min: 2000, max: 2100 }),
  query('status').optional().isIn(Object.keys(STATUS_PAYROLL)),
], async (req, res, next) => {
  try {
    const p = periode(req);
    const filter = { status: req.query.status || '', q: '' };
    const slip = payrollService.daftar(p.bulan, p.tahun, filter);
    const semua = payrollService.daftar(p.bulan, p.tahun);
    const target = semua.length ? semua : slip;

    req.audit(req, 'EXPORT_PAYROLL', 'payroll', `${p.tahun}-${p.bulan}`,
      `Export Excel payroll ${h.monthName(p.bulan)} ${p.tahun} (${target.length} slip)`);

    const L = exportService.payrollRekap({
      bulan: p.bulan,
      tahun: p.tahun,
      slip: target,
      user: req.user,
      perusahaan: res.locals.company,
    });
    return await L.kirim(res, `payroll-${p.tahun}-${String(p.bulan).padStart(2, '0')}.xlsx`);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
