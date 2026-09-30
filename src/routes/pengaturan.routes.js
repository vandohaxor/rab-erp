'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const h = require('../utils/helpers');
const { requireAuth, requireModule } = require('../middleware/auth');
const settingsService = require('../services/settings.service');
const absensiService = require('../services/absensi.service');

const router = express.Router();
router.use(requireAuth, requireModule('pengaturan'));

router.get('/', (req, res) => {
  res.render('pengaturan/index', {
    title: 'Pengaturan Sistem',
    subtitle: 'Konfigurasi profil perusahaan, jadwal kerja, dan parameter penggajian',
    crumbs: [{ label: 'Pengaturan' }],
    tab: req.query.tab || 'perusahaan',
    values: settingsService.semua(),
    jadwal: absensiService.getJadwal(),
    payrollParam: settingsService.semua(),
    departemen: db.db.all(
      `SELECT d.*, (SELECT COUNT(*) FROM karyawan k WHERE k.departemen_id = d.id) AS jumlah_karyawan
         FROM departemen d ORDER BY d.nama`,
    ),
    errors: [],
  });
});

router.post('/perusahaan', [
  body('perusahaan.badan').trim().notEmpty().withMessage('Nama badan usaha wajib diisi.'),
  body('perusahaan.alamat').optional({ values: 'falsy' }).trim().isLength({ max: 300 }),
  body('perusahaan.logo')
    .optional({ values: 'falsy' })
    .trim()
    .matches(/^\/[\w\-./]*\.(png|jpe?g|svg|webp)$/i)
    .withMessage('Alamat logo harus berupa path file di folder publik, contoh /uploads/logo.png'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.session.flash = { type: 'danger', message: errors.array()[0].msg };
    return res.redirect('/pengaturan?tab=perusahaan');
  }

  const payload = {};
  for (const [key, value] of Object.entries(req.body)) payload[key] = value;
  settingsService.setMany(payload);

  req.audit(req, 'UBAH_PENGATURAN', 'settings', null, 'Profil perusahaan diperbarui');
  req.session.flash = { type: 'success', message: 'Profil perusahaan berhasil disimpan.' };
  return res.redirect('/pengaturan?tab=perusahaan');
});

router.post('/jadwal', [
  body('jam_masuk').matches(/^\d{2}:\d{2}$/).withMessage('Jam masuk tidak valid.'),
  body('jam_pulang').matches(/^\d{2}:\d{2}$/).withMessage('Jam pulang tidak valid.'),
  body('toleransi_menit').isInt({ min: 0, max: 120 }).withMessage('Toleransi harus 0-120 menit.'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.session.flash = { type: 'danger', message: errors.array()[0].msg };
    return res.redirect('/pengaturan?tab=jadwal');
  }

  if (h.timeToMinutes(req.body.jam_pulang) <= h.timeToMinutes(req.body.jam_masuk)) {
    req.session.flash = { type: 'danger', message: 'Jam pulang harus lebih besar dari jam masuk.' };
    return res.redirect('/pengaturan?tab=jadwal');
  }

  const hariKerja = [].concat(req.body.hari_kerja || []).join(',');
  const jadwal = absensiService.getJadwal();

  db.db.run(
    `UPDATE jadwal_kerja
        SET jam_masuk = ?, jam_pulang = ?, hari_kerja = ?, toleransi_menit = ?
      WHERE id = ?`,
    req.body.jam_masuk, req.body.jam_pulang, hariKerja || '1,2,3,4,5',
    Number(req.body.toleransi_menit), jadwal.id,
  );

  settingsService.setMany({
    'absensi.jam_masuk': req.body.jam_masuk,
    'absensi.jam_pulang': req.body.jam_pulang,
    'absensi.toleransi_menit': String(req.body.toleransi_menit),
    'absensi.batas_absen_masuk': req.body.batas_absen_masuk || '',
  });

  req.audit(req, 'UBAH_PENGATURAN', 'jadwal_kerja', jadwal.id,
    `Jadwal kerja ${req.body.jam_masuk} - ${req.body.jam_pulang}`);
  req.session.flash = { type: 'success', message: 'Jadwal kerja berhasil disimpan.' };
  return res.redirect('/pengaturan?tab=jadwal');
});

router.post('/payroll', [
  body('payroll.hari_kerja_bulanan').isInt({ min: 1, max: 31 }).withMessage('Hari kerja bulanan harus 1-31.'),
  body('payroll.jam_kerja_harian').isInt({ min: 1, max: 24 }).withMessage('Jam kerja harian harus 1-24.'),
  body('payroll.faktor_lembur').isFloat({ min: 1, max: 5 }).withMessage('Faktor lembur harus antara 1 dan 5.'),
  body('payroll.persen_tunjangan_hadir').isFloat({ min: 0, max: 500 }).withMessage('Persentase tunjangan 0-500%.'),
  body('payroll.persen_bpjs').isFloat({ min: 0, max: 50 }).withMessage('Persentase BPJS 0-50%.'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.session.flash = { type: 'danger', message: errors.array()[0].msg };
    return res.redirect('/pengaturan?tab=payroll');
  }

  const payload = {};
  for (const [key, value] of Object.entries(req.body)) payload[key] = value;
  settingsService.setMany(payload);

  req.audit(req, 'UBAH_PENGATURAN', 'settings', null, 'Parameter penggajian diperbarui');
  req.session.flash = {
    type: 'success',
    message: 'Parameter penggajian berhasil disimpan. Hitung ulang payroll agar nilai terupdate.',
  };
  return res.redirect('/pengaturan?tab=payroll');
});

/* Departemen */
router.post('/departemen', [
  body('nama').trim().notEmpty().withMessage('Nama departemen wajib diisi.').isLength({ max: 80 }),
], (req, res) => {
  const errors = validationResult(req);
  const nama = String(req.body.nama || '').trim();

  const dup = db.db.get('SELECT 1 FROM departemen WHERE nama = ?', nama);
  if (!errors.isEmpty() || dup) {
    req.session.flash = {
      type: 'danger',
      message: dup ? `Departemen "${nama}" sudah ada.` : errors.array()[0].msg,
    };
    return res.redirect('/pengaturan?tab=departemen');
  }

  db.db.run('INSERT INTO departemen (nama, deskripsi) VALUES (?, ?)', nama, req.body.deskripsi || null);
  req.audit(req, 'TAMBAH', 'departemen', nama, `Departemen ${nama}`);
  req.session.flash = { type: 'success', message: `Departemen "${nama}" berhasil ditambahkan.` };
  return res.redirect('/pengaturan?tab=departemen');
});

router.delete('/departemen/:id', (req, res) => {
  const dep = db.db.get('SELECT * FROM departemen WHERE id = ?', req.params.id);
  if (!dep) return res.redirect('/pengaturan?tab=departemen');

  db.db.run('DELETE FROM departemen WHERE id = ?', dep.id);
  req.audit(req, 'HAPUS', 'departemen', dep.id, `Departemen ${dep.nama}`);
  req.session.flash = { type: 'success', message: `Departemen "${dep.nama}" dihapus.` };
  return res.redirect('/pengaturan?tab=departemen');
});

/* Log aktivitas */
router.get('/audit', (req, res) => {
  const limit = Math.min(200, Number(req.query.limit) || 100);
  const page = Math.max(1, Number(req.query.page) || 1);

  const where = [];
  const args = [];
  if (req.query.aksi) { where.push('aksi = ?'); args.push(req.query.aksi); }
  if (req.query.q) { where.push('(nama LIKE ? OR detail LIKE ? OR entitas LIKE ?)'); args.push(`%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = Number(db.db.pluck(`SELECT COUNT(*) FROM audit_log ${clause}`, ...args) || 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const rows = db.db.all(
    `SELECT * FROM audit_log ${clause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    ...args, limit, (page - 1) * limit,
  );

  const aksiList = db.db.all('SELECT DISTINCT aksi FROM audit_log ORDER BY aksi');

  res.render('pengaturan/audit', {
    title: 'Log Aktivitas',
    subtitle: 'Riwayat seluruh tindakan pengguna pada sistem',
    crumbs: [{ label: 'Pengaturan', href: '/pengaturan' }, { label: 'Log Aktivitas' }],
    rows,
    aksiList,
    filter: req.query,
    pagination: { page, totalPages, total, limit },
  });
});

module.exports = router;
