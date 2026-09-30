'use strict';

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const db = require('../config/database');
const h = require('../utils/helpers');
const { requireAuth, requireModule } = require('../middleware/auth');
const { TIPE_KONTRAK } = require('../utils/constants');
const exportService = require('../services/export.service');
const xls = require('../utils/excel');

const router = express.Router();
router.use(requireAuth, requireModule('karyawan'));

function nextNip() {
  const tahun = new Date().getFullYear();
  const row = db.db.get(
    "SELECT nip FROM karyawan WHERE nip LIKE ? ORDER BY nip DESC LIMIT 1",
    `RB-%`,
  );
  let urut = 1;
  if (row?.nip) {
    const angka = Number(String(row.nip).replace(/\D/g, ''));
    urut = (Number.isFinite(angka) ? angka : 0) + 1;
  }
  return `RB-${String(urut).padStart(3, '0')}`;
}

function ambilNilai(req, errors) {
  const b = req.body;
  return {
    nip: (b.nip || '').trim(),
    nama_lengkap: (b.nama_lengkap || '').trim(),
    nik: (b.nik || '').trim(),
    jenis_kelamin: b.jenis_kelamin || 'L',
    tempat_lahir: (b.tempat_lahir || '').trim(),
    tanggal_lahir: b.tanggal_lahir || '',
    alamat: (b.alamat || '').trim(),
    no_hp: (b.no_hp || '').trim(),
    email: (b.email || '').trim(),
    departemen_id: b.departemen_id ? Number(b.departemen_id) : null,
    jabatan: (b.jabatan || '').trim(),
    tipe_kontrak: b.tipe_kontrak || 'PKWT',
    tanggal_masuk: b.tanggal_masuk || '',
    tanggal_keluar: b.tanggal_keluar || '',
    status_karyawan: b.status_karyawan || 'aktif',
    gaji_pokok: h.toNumber(b.gaji_pokok),
    tunjangan_transport: h.toNumber(b.tunjangan_transport),
    tunjangan_makan: h.toNumber(b.tunjangan_makan),
    tunjangan_lain: h.toNumber(b.tunjangan_lain),
    nama_bank: (b.nama_bank || '').trim(),
    no_rekening: (b.no_rekening || '').trim(),
    alamat_darurat: (b.alamat_darurat || '').trim(),
    catatan: (b.catatan || '').trim(),
    errors,
  };
}

const rules = [
  body('nip').trim().notEmpty().withMessage('NIP wajib diisi.').isLength({ max: 30 }).withMessage('NIP terlalu panjang.'),
  body('nama_lengkap').trim().notEmpty().withMessage('Nama lengkap wajib diisi.').isLength({ min: 3 }).withMessage('Nama minimal 3 karakter.'),
  body('nik').optional({ values: 'falsy' }).trim().isLength({ max: 20 }).withMessage('NIK tidak valid.'),
  body('email').optional({ values: 'falsy' }).trim().isEmail().withMessage('Format email tidak valid.'),
  body('no_hp').optional({ values: 'falsy' }).trim().isLength({ max: 30 }).withMessage('Nomor HP terlalu panjang.'),
  body('tanggal_masuk').notEmpty().withMessage('Tanggal masuk wajib diisi.').isISO8601().withMessage('Tanggal masuk tidak valid.'),
  body('gaji_pokok').isNumeric({ no_symbols: true }).withMessage('Gaji pokok harus berupa angka.'),
  body('jabatan').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
];

/* ---------------- DAFTAR ---------------- */
router.get('/', [
  query('q').optional().trim(),
  query('departemen_id').optional(),
  query('status').optional(),
  query('page').optional().isInt({ min: 1 }),
], (req, res) => {
  const where = [];
  const args = [];

  if (req.query.q) {
    where.push('(k.nama_lengkap LIKE ? OR k.nip LIKE ? OR k.jabatan LIKE ?)');
    args.push(`%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`);
  }
  if (req.query.departemen_id) {
    where.push('k.departemen_id = ?');
    args.push(Number(req.query.departemen_id));
  }
  if (req.query.status) {
    where.push('k.status_karyawan = ?');
    args.push(req.query.status);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const limit = 10;
  const page = Math.max(1, Number(req.query.page) || 1);
  const total = Number(db.db.pluck(`SELECT COUNT(*) FROM karyawan k ${clause}`, ...args) || 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const rows = db.db.all(
    `SELECT k.*, d.nama AS departemen, u.email AS user_email, u.status AS user_status, u.role AS user_role
       FROM karyawan k
       LEFT JOIN departemen d ON d.id = k.departemen_id
       LEFT JOIN users u ON u.karyawan_id = k.id
       ${clause}
      ORDER BY k.status_karyawan = 'aktif' DESC, k.nama_lengkap
      LIMIT ? OFFSET ?`,
    ...args, limit, (page - 1) * limit,
  );

  const statistik = db.db.get(
    `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status_karyawan = 'aktif' THEN 1 ELSE 0 END) AS aktif,
        SUM(CASE WHEN status_karyawan = 'resign' THEN 1 ELSE 0 END) AS resign,
        COALESCE(SUM(CASE WHEN status_karyawan = 'aktif' THEN gaji_pokok + tunjangan_transport + tunjangan_makan + tunjangan_lain ELSE 0 END), 0) AS payroll_bulanan
      FROM karyawan`,
  );

  res.render('karyawan/index', {
    title: 'Data Karyawan',
    subtitle: 'Kelola data kepegawaian, jabatan, dan komponen penggajian',
    crumbs: [{ label: 'Karyawan' }],
    rows,
    departemen: db.db.all('SELECT * FROM departemen ORDER BY nama'),
    statistik,
    pagination: { page, totalPages, total, limit },
    filter: req.query,
    actions: `
      <a href="/karyawan/export/xlsx" class="btn btn-success btn-sm">
        <i class="bi bi-file-earmark-excel me-1"></i>Excel Data Karyawan
      </a>
      <a href="/karyawan/tambah" class="btn btn-navy btn-sm">
        <i class="bi bi-person-plus me-1"></i>Tambah Karyawan
      </a>`,
  });
});

/* ---------------- EXPORT EXCEL (.xlsx) ---------------- */
router.get('/export/xlsx', async (req, res, next) => {
  try {
    const rows = db.db.all(
      `SELECT k.*, d.nama AS departemen FROM karyawan k
         LEFT JOIN departemen d ON d.id = k.departemen_id
        WHERE k.status_karyawan = 'aktif'
        ORDER BY k.nama_lengkap`,
    );

    req.audit(req, 'EXPORT_KARYAWAN', 'karyawan', null, `Export Excel data karyawan (${rows.length} baris)`);

    const L = exportService.karyawan({
      rows,
      user: req.user,
      perusahaan: res.locals.company,
    });
    return await L.kirim(res, xls.filename('karyawan'));
  } catch (error) {
    return next(error);
  }
});

/* ---------------- FORM ---------------- */
router.get('/tambah', (req, res) => {
  res.render('karyawan/form', {
    title: 'Tambah Karyawan',
    subtitle: 'Lengkapi data kepegawaian dan komponen gaji',
    crumbs: [{ label: 'Karyawan', href: '/karyawan' }, { label: 'Tambah' }],
    karyawan: null,
    suggestNip: nextNip(),
    departemen: db.db.all('SELECT * FROM departemen ORDER BY nama'),
    tipeKontrak: TIPE_KONTRAK,
    values: { nip: nextNip(), jenis_kelamin: 'L', tipe_kontrak: 'PKWT', status_karyawan: 'aktif', tanggal_masuk: h.today() },
    errors: [],
  });
});

router.get('/:id/edit', (req, res, next) => {
  const karyawan = db.db.get('SELECT * FROM karyawan WHERE id = ?', req.params.id);
  if (!karyawan) return next();

  return res.render('karyawan/form', {
    title: 'Ubah Data Karyawan',
    subtitle: `${karyawan.nama_lengkap} (${karyawan.nip})`,
    crumbs: [{ label: 'Karyawan', href: '/karyawan' }, { label: 'Ubah' }],
    karyawan,
    suggestNip: karyawan.nip,
    departemen: db.db.all('SELECT * FROM departemen ORDER BY nama'),
    tipeKontrak: TIPE_KONTRAK,
    values: karyawan,
    errors: [],
  });
});

/* ---------------- SIMPAN ---------------- */
const persist = (req, res, next) => {
  const errors = validationResult(req);
  const id = req.params.id;
  const values = ambilNilai(req, errors.array());

  const dup = db.db.get(
    'SELECT id FROM karyawan WHERE nip = ? AND id != ?',
    values.nip,
    id ? Number(id) : 0,
  );

  if (dup) errors.addError({ path: 'nip', msg: `NIP ${values.nip} sudah digunakan karyawan lain.` });

  const renderForm = () => res.status(422).render('karyawan/form', {
    title: id ? 'Ubah Data Karyawan' : 'Tambah Karyawan',
    subtitle: id ? 'Perbarui data kepegawaian' : 'Lengkapi data kepegawaian dan komponen gaji',
    crumbs: [
      { label: 'Karyawan', href: '/karyawan' },
      { label: id ? 'Ubah' : 'Tambah' },
    ],
    karyawan: id ? db.db.get('SELECT * FROM karyawan WHERE id = ?', id) : null,
    suggestNip: values.nip,
    departemen: db.db.all('SELECT * FROM departemen ORDER BY nama'),
    tipeKontrak: TIPE_KONTRAK,
    values,
    errors: errors.array(),
  });

  if (!errors.isEmpty()) return renderForm();

  const params = [
    values.nip, values.nama_lengkap, values.nik, values.jenis_kelamin, values.tempat_lahir,
    values.tanggal_lahir, values.alamat, values.no_hp, values.email, values.departemen_id,
    values.jabatan, values.tipe_kontrak, values.tanggal_masuk, values.tanggal_keluar || null,
    values.status_karyawan, values.gaji_pokok, values.tunjangan_transport, values.tunjangan_makan,
    values.tunjangan_lain, values.nama_bank, values.no_rekening, values.alamat_darurat, values.catatan,
  ];

  if (id) {
    db.db.run(
      `UPDATE karyawan SET
         nip = ?, nama_lengkap = ?, nik = ?, jenis_kelamin = ?, tempat_lahir = ?, tanggal_lahir = ?,
         alamat = ?, no_hp = ?, email = ?, departemen_id = ?, jabatan = ?, tipe_kontrak = ?,
         tanggal_masuk = ?, tanggal_keluar = ?, status_karyawan = ?, gaji_pokok = ?,
         tunjangan_transport = ?, tunjangan_makan = ?, tunjangan_lain = ?, nama_bank = ?,
         no_rekening = ?, alamat_darurat = ?, catatan = ?, updated_at = datetime('now','localtime')
       WHERE id = ?`,
      ...params, id,
    );
    req.audit(req, 'UBAH', 'karyawan', id, `Update karyawan ${values.nama_lengkap} (${values.nip})`);
    req.session.flash = { type: 'success', message: `Data ${values.nama_lengkap} berhasil diperbarui.` };
    return res.redirect('/karyawan');
  }

  const newId = db.db.run(
    `INSERT INTO karyawan (
       nip, nama_lengkap, nik, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, no_hp, email,
       departemen_id, jabatan, tipe_kontrak, tanggal_masuk, tanggal_keluar, status_karyawan,
       gaji_pokok, tunjangan_transport, tunjangan_makan, tunjangan_lain, nama_bank, no_rekening,
       alamat_darurat, catatan
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ...params,
  ).lastInsertRowid;

  req.audit(req, 'TAMBAH', 'karyawan', newId, `Tambah karyawan ${values.nama_lengkap} (${values.nip})`);
  req.session.flash = {
    type: 'success',
    message: `Karyawan ${values.nama_lengkap} berhasil ditambahkan.`,
  };
  return res.redirect(`/karyawan/${newId}`);
};

router.post('/tambah', rules, persist);
router.put('/:id', rules, persist);

/* ---------------- DETAIL ---------------- */
router.get('/:id', (req, res, next) => {
  const karyawan = db.db.get(
    `SELECT k.*, d.nama AS departemen FROM karyawan k
       LEFT JOIN departemen d ON d.id = k.departemen_id WHERE k.id = ?`,
    req.params.id,
  );
  if (!karyawan) return next();

  const periode = {
    bulan: Number(req.query.bulan) || h.dayjs().month() + 1,
    tahun: Number(req.query.tahun) || h.dayjs().year(),
  };

  const rekap = db.db.get(
    `SELECT
       COUNT(*) AS total_hari,
       SUM(CASE WHEN status = 'hadir' THEN 1 ELSE 0 END) AS hadir,
       SUM(CASE WHEN status = 'izin' THEN 1 ELSE 0 END) AS izin,
       SUM(CASE WHEN status = 'sakit' THEN 1 ELSE 0 END) AS sakit,
       SUM(CASE WHEN status = 'alpha' THEN 1 ELSE 0 END) AS alpha,
       COALESCE(SUM(menit_lembur), 0) AS menit_lembur
      FROM absensi WHERE karyawan_id = ? AND strftime('%Y-%m', tanggal) = ?`,
    karyawan.id,
    `${periode.tahun}-${String(periode.bulan).padStart(2, '0')}`,
  );

  const absensi = db.db.all(
    'SELECT * FROM absensi WHERE karyawan_id = ? ORDER BY tanggal DESC LIMIT 30',
    karyawan.id,
  );

  const payroll = db.db.all(
    'SELECT * FROM payroll WHERE karyawan_id = ? ORDER BY tahun DESC, bulan DESC LIMIT 12',
    karyawan.id,
  );

  const pengguna = db.db.get('SELECT id, email, role, status FROM users WHERE karyawan_id = ?', karyawan.id);

  return res.render('karyawan/detail', {
    title: karyawan.nama_lengkap,
    subtitle: `${karyawan.nip} &middot; ${karyawan.jabatan || 'Tanpa jabatan'}`,
    crumbs: [{ label: 'Karyawan', href: '/karyawan' }, { label: karyawan.nama_lengkap }],
    karyawan,
    rekap,
    absensi,
    payroll,
    pengguna,
    periode,
    actions: `
      <a href="/absensi?karyawan_id=${karyawan.id}&tanggal=${h.today()}" class="btn btn-outline-primary btn-sm">
        <i class="bi bi-calendar2-check me-1"></i>Catat Absensi
      </a>
      <a href="/karyawan/${karyawan.id}/edit" class="btn btn-navy btn-sm">
        <i class="bi bi-pencil-square me-1"></i>Ubah Data
      </a>
      ${pengguna ? '' : `<a href="/users/tambah?karyawan_id=${karyawan.id}" class="btn btn-gold btn-sm"><i class="bi bi-person-gear me-1"></i>Buat Akun</a>`}`,
  });
});

/* ---------------- HAPUS ---------------- */
router.delete('/:id', (req, res, next) => {
  const karyawan = db.db.get('SELECT * FROM karyawan WHERE id = ?', req.params.id);
  if (!karyawan) return next();

  const punyaPayroll = Number(db.db.pluck('SELECT COUNT(*) FROM payroll WHERE karyawan_id = ?', karyawan.id) || 0);
  if (punyaPayroll > 0) {
    req.session.flash = {
      type: 'warning',
      message: `Data ${karyawan.nama_lengkap} tidak dapat dihapus karena sudah memiliki riwayat penggajian. Ubah status menjadi Resign atau PHK.`,
    };
    return res.redirect(`/karyawan/${karyawan.id}`);
  }

  db.db.run('DELETE FROM users WHERE karyawan_id = ?', karyawan.id);
  db.db.run('DELETE FROM karyawan WHERE id = ?', karyawan.id);
  req.audit(req, 'HAPUS', 'karyawan', karyawan.id, `Hapus karyawan ${karyawan.nama_lengkap} (${karyawan.nip})`);
  req.session.flash = { type: 'success', message: `Data ${karyawan.nama_lengkap} berhasil dihapus.` };
  return res.redirect('/karyawan');
});

module.exports = router;
