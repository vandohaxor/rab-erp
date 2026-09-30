'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const h = require('../utils/helpers');
const { requireAuth, requireKaryawan, requireModule } = require('../middleware/auth');
const { JENIS_IZIN } = require('../utils/constants');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const bisaProses = req.user.role === 'superadmin';

  const milikSaya = db.db.all(
    'SELECT * FROM pengajuan_izin WHERE karyawan_id = ? ORDER BY created_at DESC LIMIT 30',
    req.user.karyawanId || 0,
  );

  const semua = bisaProses
    ? db.db.all(
      `SELECT p.*, k.nip, k.nama_lengkap, u.nama AS diproses_nama
         FROM pengajuan_izin p
         JOIN karyawan k ON k.id = p.karyawan_id
         LEFT JOIN users u ON u.id = p.diproses_oleh
        ORDER BY CASE p.status WHEN 'pending' THEN 0 ELSE 1 END, p.tanggal_mulai DESC
        LIMIT 100`,
    )
    : [];

  res.render('pengajuan/index', {
    title: 'Pengajuan Izin',
    subtitle: bisaProses
      ? 'Kelola pengajuan izin, sakit, dan cuti karyawan'
      : 'Ajukan izin, sakit, atau cuti dan pantau statusnya',
    crumbs: [{ label: 'Pengajuan Izin' }],
    milikSaya,
    semua,
    bisaProses,
    pending: semua.filter((p) => p.status === 'pending').length,
    actions: bisaProses ? '' : '<a href="#form-izin" class="btn btn-navy btn-sm"><i class="bi bi-plus-lg me-1"></i>Ajukan Izin</a>',
  });
});

/* Buat pengajuan (karyawan) */
router.post('/', requireKaryawan, [
  body('jenis').isIn(Object.keys(JENIS_IZIN)).withMessage('Jenis pengajuan tidak valid.'),
  body('tanggal_mulai').isISO8601().withMessage('Tanggal mulai tidak valid.'),
  body('tanggal_selesai').isISO8601().withMessage('Tanggal selesai tidak valid.'),
  body('alasan').trim().notEmpty().withMessage('Alasan wajib diisi.').isLength({ max: 500 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.session.flash = { type: 'danger', message: errors.array()[0].msg };
    return res.redirect('/pengajuan');
  }

  if (req.body.tanggal_selesai < req.body.tanggal_mulai) {
    req.session.flash = { type: 'danger', message: 'Tanggal selesai tidak boleh lebih awal dari tanggal mulai.' };
    return res.redirect('/pengajuan');
  }

  const id = db.db.run(
    `INSERT INTO pengajuan_izin (karyawan_id, jenis, tanggal_mulai, tanggal_selesai, alasan)
     VALUES (?, ?, ?, ?, ?)`,
    req.user.karyawanId, req.body.jenis, req.body.tanggal_mulai, req.body.tanggal_selesai, req.body.alasan,
  ).lastInsertRowid;

  req.audit(req, 'AJUKAN_IZIN', 'pengajuan_izin', id,
    `${JENIS_IZIN[req.body.jenis]} ${req.body.tanggal_mulai} s.d. ${req.body.tanggal_selesai}`);
  req.session.flash = { type: 'success', message: 'Pengajuan berhasil dikirim dan menunggu persetujuan atasan.' };
  return res.redirect('/pengajuan');
});

/* Proses persetujuan (superadmin) */
router.post('/:id/proses', requireModule('karyawan'), [
  body('status').isIn(['disetujui', 'ditolak']).withMessage('Status tidak valid.'),
  body('catatan').optional({ values: 'falsy' }).trim().isLength({ max: 300 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.session.flash = { type: 'danger', message: errors.array()[0].msg };
    return res.redirect('/pengajuan');
  }

  const pengajuan = db.db.get(
    `SELECT p.*, k.nama_lengkap FROM pengajuan_izin p JOIN karyawan k ON k.id = p.karyawan_id
      WHERE p.id = ?`,
    req.params.id,
  );
  if (!pengajuan) return res.redirect('/pengajuan');

  db.db.run(
    `UPDATE pengajuan_izin SET status = ?, diproses_oleh = ?, catatan = ?, updated_at = datetime('now','localtime')
      WHERE id = ?`,
    req.body.status, req.user.id, req.body.catatan || null, req.params.id,
  );

  // Otomatis catat ke tabel absensi bila disetujui.
  if (req.body.status === 'disetujui') {
    let tanggal = pengajuan.tanggal_mulai;
    const akhir = pengajuan.tanggal_selesai;
    let guard = 0;
    while (tanggal <= akhir && guard < 60) {
      const ada = db.db.get('SELECT 1 FROM absensi WHERE karyawan_id = ? AND tanggal = ?', pengajuan.karyawan_id, tanggal);
      if (!ada) {
        db.db.run(
          `INSERT INTO absensi (karyawan_id, tanggal, status, keterangan)
           VALUES (?, ?, ?, ?)`,
          pengajuan.karyawan_id, tanggal, pengajuan.jenis,
          `Disetujui oleh ${req.user.nama}: ${pengajuan.alasan}`,
        );
      }
      tanggal = h.dayjs(tanggal).add(1, 'day').format('YYYY-MM-DD');
      guard += 1;
    }
  }

  req.audit(req, req.body.status === 'disetujui' ? 'SETUJUI_IZIN' : 'TOLAK_IZIN', 'pengajuan_izin',
    req.params.id, `${pengajuan.nama_lengkap} - ${pengajuan.jenis} ${pengajuan.tanggal_mulai}`);
  req.session.flash = {
    type: req.body.status === 'disetujui' ? 'success' : 'info',
    message: `Pengajuan ${pengajuan.nama_lengkap} berhasil ${req.body.status}.`,
  };
  return res.redirect('/pengajuan');
});

module.exports = router;
