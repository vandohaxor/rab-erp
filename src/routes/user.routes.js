'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { body, query, validationResult } = require('express-validator');
const db = require('../config/database');
const { requireAuth, requireModule } = require('../middleware/auth');
const { ROLE_LIST, ROLE_META } = require('../utils/constants');

const router = express.Router();
router.use(requireAuth, requireModule('users'));

/** Teks konfirmasi hapus akun, termasuk data karyawan yang ikut terhapus. */
function ringkasanHapus(u) {
  const dasar = `Hapus akun ${u.nama} (${u.email})?`;
  const dep = hitungKetergantungan(u.karyawan_id);
  if (!u.karyawan_id || !dep) {
    return `${dasar} Akun ini tidak tertaut ke data karyawan. Tindakan ini permanen.`;
  }
  const rincian = [
    dep.absensi ? `${dep.absensi} data absensi` : null,
    dep.payroll ? `${dep.payroll} data gaji` : null,
    dep.pengajuan ? `${dep.pengajuan} pengajuan` : null,
  ].filter(Boolean);
  return `${dasar} Data karyawan ${u.nama_lengkap || ''} beserta ${rincian.join(', ') || 'seluruh riwayatnya'} juga akan terhapus permanen.`;
}

function acakPassword() {
  const huruf = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const angka = '23456789';
  const all = huruf + angka + huruf.toLowerCase();
  let out = '';
  for (let i = 0; i < 6; i += 1) out += all[Math.floor(Math.random() * all.length)];
  return `Rab${out}!`;
}

/* ---------------- DAFTAR ---------------- */
router.get('/', [
  query('q').optional().trim(),
  query('role').optional(),
  query('status').optional(),
], (req, res) => {
  const where = [];
  const args = [];
  if (req.query.q) {
    where.push('(u.nama LIKE ? OR u.email LIKE ? OR k.nip LIKE ? OR k.nama_lengkap LIKE ?)');
    args.push(`%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`);
  }
  if (req.query.role) { where.push('u.role = ?'); args.push(req.query.role); }
  if (req.query.status) { where.push('u.status = ?'); args.push(req.query.status); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = db.db.all(
    `SELECT u.*, k.nip, k.nama_lengkap, k.jabatan, k.status_karyawan, d.nama AS departemen
       FROM users u
       LEFT JOIN karyawan k ON k.id = u.karyawan_id
       LEFT JOIN departemen d ON d.id = k.departemen_id
       ${clause}
      ORDER BY CASE u.role WHEN 'superadmin' THEN 0 WHEN 'keuangan' THEN 1 ELSE 2 END, u.nama`,
    ...args,
  );

  const statistik = {};
  for (const role of ROLE_LIST) {
    statistik[role] = Number(db.db.pluck(
      'SELECT COUNT(*) FROM users WHERE role = ? AND status = ?', role, 'aktif',
    ) || 0);
  }

  res.render('users/index', {
    title: 'Manajemen Pengguna',
    subtitle: 'Atur akun, peran, dan status akses seluruh pengguna sistem',
    crumbs: [{ label: 'Pengguna' }],
    rows,
    statistik,
    roleMeta: ROLE_META,
    filter: req.query,
    ringkasanHapus,
    actions: `<a href="/users/tambah" class="btn btn-navy btn-sm"><i class="bi bi-person-plus me-1"></i>Tambah Pengguna</a>`,
  });
});

/* ---------------- FORM TAMBAH ---------------- */
router.get('/tambah', (req, res) => {
  const karyawanTersedia = db.db.all(
    `SELECT k.id, k.nip, k.nama_lengkap, k.jabatan
       FROM karyawan k
       LEFT JOIN users u ON u.karyawan_id = k.id
      WHERE u.id IS NULL AND k.status_karyawan = 'aktif'
      ORDER BY k.nama_lengkap`,
  );
  const terpilih = req.query.karyawan_id ? Number(req.query.karyawan_id) : '';

  res.render('users/form', {
    title: 'Tambah Pengguna',
    subtitle: 'Buat akun login baru dan tentukan perannya',
    crumbs: [{ label: 'Pengguna', href: '/users' }, { label: 'Tambah' }],
    pengguna: null,
    karyawanTersedia,
    roleMeta: ROLE_META,
    roleList: ROLE_LIST,
    passwordAwal: null,
    values: { role: 'karyawan', status: 'aktif', karyawan_id: terpilih },
    errors: [],
  });
});

router.get('/:id/edit', (req, res, next) => {
  const pengguna = db.db.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!pengguna) return next();

  const karyawanTersedia = db.db.all(
    `SELECT k.id, k.nip, k.nama_lengkap, k.jabatan
       FROM karyawan k
       LEFT JOIN users u ON u.karyawan_id = k.id
      WHERE (u.id IS NULL OR u.id = ?) AND k.status_karyawan = 'aktif'
      ORDER BY k.nama_lengkap`,
    pengguna.id,
  );

  return res.render('users/form', {
    title: 'Ubah Pengguna',
    subtitle: pengguna.email,
    crumbs: [{ label: 'Pengguna', href: '/users' }, { label: 'Ubah' }],
    pengguna,
    karyawanTersedia,
    roleMeta: ROLE_META,
    roleList: ROLE_LIST,
    passwordAwal: null,
    values: pengguna,
    errors: [],
  });
});

/* ---------------- SIMPAN ---------------- */
function rules() {
  return [
    body('nama').trim().notEmpty().withMessage('Nama wajib diisi.').isLength({ min: 3 }).withMessage('Nama minimal 3 karakter.'),
    body('email').trim().isEmail().withMessage('Format email tidak valid.').normalizeEmail(),
    body('role').isIn(ROLE_LIST).withMessage('Peran yang dipilih tidak valid.'),
    body('status').isIn(['aktif', 'nonaktif']).withMessage('Status tidak valid.'),
    body('karyawan_id').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Karyawan tidak valid.'),
    body('password').optional({ values: 'falsy' }).isLength({ min: 8 }).withMessage('Password minimal 8 karakter.'),
  ];
}

const persist = (req, res, next) => {
  const errors = validationResult(req);
  const id = req.params.id;
  const isEdit = Boolean(id);
  const email = String(req.body.email || '').trim().toLowerCase();
  const karyawanId = req.body.karyawan_id ? Number(req.body.karyawan_id) : null;

  const dupEmail = db.db.get('SELECT id FROM users WHERE email = ? AND id != ?', email, isEdit ? Number(id) : 0);
  if (dupEmail) errors.addError({ path: 'email', msg: `Email ${email} sudah terdaftar pada pengguna lain.` });

  if (karyawanId) {
    const dupKaryawan = db.db.get('SELECT id FROM users WHERE karyawan_id = ? AND id != ?', karyawanId, isEdit ? Number(id) : 0);
    if (dupKaryawan) errors.addError({ path: 'karyawan_id', msg: 'Karyawan tersebut sudah memiliki akun pengguna.' });
  }

  if (req.user.role !== 'superadmin') {
    errors.addError({ path: 'role', msg: 'Hanya Superadmin yang dapat menambah pengguna.' });
  }

  // Jangan biarkan sistem tanpa superadmin aktif.
  if (isEdit && req.user.role === 'superadmin') {
    const target = db.db.get('SELECT * FROM users WHERE id = ?', id);
    const sisaSuperadmin = Number(db.db.pluck(
      "SELECT COUNT(*) FROM users WHERE role = 'superadmin' AND status = 'aktif' AND id != ?", id,
    ) || 0);
    if (target?.role === 'superadmin' && (req.body.role !== 'superadmin' || req.body.status !== 'aktif') && sisaSuperadmin === 0) {
      errors.addError({ path: 'role', msg: 'Minimal harus ada satu akun Superadmin aktif.' });
    }
  }

  const renderForm = (passwordAwal = null) => res.status(422).render('users/form', {
    title: isEdit ? 'Ubah Pengguna' : 'Tambah Pengguna',
    subtitle: isEdit ? 'Perbarui akun dan perannya' : 'Buat akun login baru dan tentukan perannya',
    crumbs: [{ label: 'Pengguna', href: '/users' }, { label: isEdit ? 'Ubah' : 'Tambah' }],
    pengguna: isEdit ? db.db.get('SELECT * FROM users WHERE id = ?', id) : null,
    karyawanTersedia: db.db.all(
      `SELECT k.id, k.nip, k.nama_lengkap, k.jabatan FROM karyawan k
         LEFT JOIN users u ON u.karyawan_id = k.id
        WHERE (u.id IS NULL OR u.id = ?) AND k.status_karyawan = 'aktif' ORDER BY k.nama_lengkap`,
      isEdit ? Number(id) : 0,
    ),
    roleMeta: ROLE_META,
    roleList: ROLE_LIST,
    passwordAwal,
    values: { ...req.body, karyawan_id: karyawanId, email },
    errors: errors.array(),
  });

  if (!errors.isEmpty()) return renderForm();

  const passwordBaru = String(req.body.password || '').trim();

  if (isEdit) {
    if (passwordBaru) {
      db.db.run(
        `UPDATE users SET nama = ?, email = ?, role = ?, karyawan_id = ?, status = ?,
                password_hash = ?, password_teks = ?, updated_at = datetime('now','localtime')
          WHERE id = ?`,
        req.body.nama.trim(), email, req.body.role, karyawanId, req.body.status,
        bcrypt.hashSync(passwordBaru, 10), passwordBaru, id,
      );
      req.audit(req, 'UBAH_PASSWORD', 'users', id, `Password ${email} diganti oleh admin`);
    } else {
      db.db.run(
        `UPDATE users SET nama = ?, email = ?, role = ?, karyawan_id = ?, status = ?,
                updated_at = datetime('now','localtime')
          WHERE id = ?`,
        req.body.nama.trim(), email, req.body.role, karyawanId, req.body.status, id,
      );
    }
    req.audit(req, 'UBAH', 'users', id, `Update pengguna ${email} (role: ${req.body.role})`);
    req.session.flash = {
      type: 'success',
      message: `Pengguna ${email} berhasil diperbarui.${passwordBaru ? ' Password baru sudah aktif.' : ''}`,
    };
    return res.redirect('/users');
  }

  const password = passwordBaru || acakPassword();
  const newId = db.db.run(
    `INSERT INTO users (nama, email, password_hash, password_teks, role, karyawan_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    req.body.nama.trim(), email, bcrypt.hashSync(password, 10), password, req.body.role, karyawanId,
    req.body.status,
  ).lastInsertRowid;

  req.audit(req, 'TAMBAH', 'users', newId, `Buat pengguna ${email} dengan role ${req.body.role}`);
  req.session.flash = {
    type: 'success',
    message: `Pengguna ${email} berhasil dibuat. Password awal: ${password} - sampaikan ke pengguna secara pribadi.`,
  };
  return res.redirect(`/users/${newId}`);
};

router.post('/tambah', rules(), persist);
router.put('/:id', rules(), persist);

/* ---------------- DETAIL ---------------- */
router.get('/:id', (req, res, next) => {
  const pengguna = db.db.get(
    `SELECT u.*, k.nip, k.nama_lengkap, k.jabatan, k.status_karyawan, d.nama AS departemen
       FROM users u
       LEFT JOIN karyawan k ON k.id = u.karyawan_id
       LEFT JOIN departemen d ON d.id = k.departemen_id
      WHERE u.id = ?`,
    req.params.id,
  );
  if (!pengguna) return next();

  const aktivitas = db.db.all(
    'SELECT * FROM audit_log WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 20',
    pengguna.id,
  );

  const hak = ROLE_LIST.map((role) => ({
    role,
    meta: ROLE_META[role],
    modules: Object.entries(require('../utils/constants').MODULES)
      .filter(([, map]) => map[role])
      .map(([key]) => key),
  }));

  return res.render('users/detail', {
    title: pengguna.nama,
    subtitle: pengguna.email,
    crumbs: [{ label: 'Pengguna', href: '/users' }, { label: pengguna.nama }],
    pengguna,
    aktivitas,
    hak,
    bisaHapus: pengguna.id !== req.user.id,
    ringkasanHapus,
    actions: `
      <a href="/users/${pengguna.id}/edit" class="btn btn-navy btn-sm"><i class="bi bi-pencil-square me-1"></i>Ubah Pengguna</a>`,
  });
});

/* ---------------- AKSI ---------------- */
router.post('/:id/reset-password', (req, res, next) => {
  const pengguna = db.db.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!pengguna) return next();

  const password = acakPassword();
  db.db.run(
    "UPDATE users SET password_hash = ?, password_teks = ?, updated_at = datetime('now','localtime') WHERE id = ?",
    bcrypt.hashSync(password, 10), password, pengguna.id,
  );
  req.audit(req, 'RESET_PASSWORD', 'users', pengguna.id, `Reset password ${pengguna.email}`);
  req.session.flash = {
    type: 'success',
    message: `Password baru untuk ${pengguna.email}: ${password}. Sampaikan ke pengguna secara pribadi.`,
  };
  return res.redirect(`/users/${pengguna.id}`);
});

router.post('/:id/toggle-status', (req, res, next) => {
  const pengguna = db.db.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!pengguna) return next();

  if (pengguna.id === req.user.id) {
    req.session.flash = { type: 'warning', message: 'Anda tidak dapat menonaktifkan akun Anda sendiri.' };
    return res.redirect(`/users/${pengguna.id}`);
  }

  if (pengguna.role === 'superadmin' && pengguna.status === 'aktif') {
    const aktifLain = Number(db.db.pluck("SELECT COUNT(*) FROM users WHERE role = 'superadmin' AND status = 'aktif' AND id != ?", pengguna.id) || 0);
    if (aktifLain === 0) {
      req.session.flash = { type: 'warning', message: 'Minimal harus ada satu akun Superadmin aktif.' };
      return res.redirect(`/users/${pengguna.id}`);
    }
  }

  const baru = pengguna.status === 'aktif' ? 'nonaktif' : 'aktif';
  db.db.run("UPDATE users SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?", baru, pengguna.id);
  req.audit(req, baru === 'aktif' ? 'AKTIFKAN' : 'NONAKTIFKAN', 'users', pengguna.id, `${pengguna.email} -> ${baru}`);
  req.session.flash = { type: 'success', message: `Akun ${pengguna.email} berhasil ${baru === 'aktif' ? 'diaktifkan' : 'dinonaktifkan'}.` };
  return res.redirect('/users');
});

/** Ringkasan data yang ikut terhapus bila akun ini ditautkan ke karyawan. */
function hitungKetergantungan(karyawanId) {
  if (!karyawanId) return null;
  return {
    karyawanId,
    absensi: Number(db.db.pluck('SELECT COUNT(*) FROM absensi WHERE karyawan_id = ?', karyawanId) || 0),
    payroll: Number(db.db.pluck('SELECT COUNT(*) FROM payroll WHERE karyawan_id = ?', karyawanId) || 0),
    pengajuan: Number(db.db.pluck('SELECT COUNT(*) FROM pengajuan_izin WHERE karyawan_id = ?', karyawanId) || 0),
  };
}

router.delete('/:id', (req, res, next) => {
  const pengguna = db.db.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!pengguna) return next();

  if (pengguna.id === req.user.id) {
    req.session.flash = { type: 'warning', message: 'Anda tidak dapat menghapus akun Anda sendiri.' };
    return res.redirect('/users');
  }
  if (pengguna.role === 'superadmin') {
    const aktifLain = Number(db.db.pluck("SELECT COUNT(*) FROM users WHERE role = 'superadmin' AND id != ?", pengguna.id) || 0);
    if (aktifLain === 0) {
      req.session.flash = { type: 'warning', message: 'Minimal harus ada satu akun Superadmin.' };
      return res.redirect(`/users/${pengguna.id}`);
    }
  }

  // Karyawan yang masih punya akun lain tidak ikut terhapus agar data tidak orphan.
  const karyawanId = pengguna.karyawan_id
    && !db.db.get('SELECT 1 FROM users WHERE karyawan_id = ? AND id != ?', pengguna.karyawan_id, pengguna.id)
    ? pengguna.karyawan_id
    : null;
  const karyawan = karyawanId
    ? db.db.get('SELECT nama_lengkap, nip FROM karyawan WHERE id = ?', karyawanId)
    : null;

  db.db.transaction(() => {
    db.db.run('DELETE FROM users WHERE id = ?', pengguna.id);
    if (karyawanId) db.db.run('DELETE FROM karyawan WHERE id = ?', karyawanId);
  });

  req.audit(
    req, 'HAPUS', 'users', pengguna.id,
    `Hapus pengguna ${pengguna.email}${karyawan ? ` beserta data karyawan ${karyawan.nip}` : ''}`,
  );
  req.session.flash = {
    type: 'success',
    message: karyawan
      ? `Pengguna ${pengguna.email} dan data karyawan ${karyawan.nama_lengkap} (${karyawan.nip}) berhasil dihapus.`
      : `Pengguna ${pengguna.email} berhasil dihapus.`,
  };
  return res.redirect('/users');
});

module.exports = router;
