'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { requireAuth, log } = require('../middleware/auth');
const { titleCase } = require('../utils/constants');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: 'Terlalu banyak percobaan masuk. Silakan coba lagi dalam 10 menit.',
});

const loginRules = [
  body('email').trim().isEmail().withMessage('Format email tidak valid.'),
  body('password').notEmpty().withMessage('Password wajib diisi.'),
];

function authenticate(email, password) {
  const user = db.db.get('SELECT * FROM users WHERE email = ?', String(email).toLowerCase().trim());
  if (!user) return null;
  if (!bcrypt.compareSync(String(password), user.password_hash)) return null;
  return user;
}

router.get('/login', loginLimiter, (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('auth/login', {
    title: 'Masuk',
    layout: 'layouts/auth',
    email: req.query.email || '',
    next: req.query.next || '',
    alasan: req.query.alasan || '',
    values: {},
    errors: [],
  });
});

router.post('/login', loginLimiter, loginRules, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).render('auth/login', {
      title: 'Masuk',
      layout: 'layouts/auth',
      email: req.body.email || '',
      next: req.body.next || '',
      alasan: '',
      values: {},
      errors: errors.array(),
    });
  }

  const user = authenticate(req.body.email, req.body.password);
  if (!user) {
    return res.status(401).render('auth/login', {
      title: 'Masuk',
      layout: 'layouts/auth',
      email: req.body.email || '',
      next: req.body.next || '',
      alasan: 'credential',
      values: {},
      errors: [{ msg: 'Email atau password tidak sesuai.' }],
    });
  }

  if (user.status !== 'aktif') {
    return res.status(403).render('auth/login', {
      title: 'Masuk',
      layout: 'layouts/auth',
      email: req.body.email || '',
      next: '',
      alasan: 'nonaktif',
      values: {},
      errors: [],
    });
  }

  req.session.regenerate((err) => {
    if (err) throw err;
    req.session.user = { id: user.id, nama: user.nama, role: user.role };
    db.db.run("UPDATE users SET terakhir_masuk = datetime('now','localtime') WHERE id = ?", user.id);
    log(req, 'LOGIN', 'users', user.id, `${user.email} masuk dari ${req.clientIp || 'unknown'}`);

    const next = typeof req.body.next === 'string' && req.body.next.startsWith('/')
      && !req.body.next.startsWith('//')
      ? req.body.next
      : '/';
    return res.redirect(next);
  });
});

router.post('/logout', requireAuth, (req, res) => {
  const nama = req.user.nama;
  log(req, 'LOGOUT', 'users', req.user.id, `${nama} keluar dari sistem`);
  req.session.destroy(() => {
    res.clearCookie(req.app.get('sessionName'));
    res.redirect('/login');
  });
});

router.get('/logout', requireAuth, (req, res) => res.redirect('/'));

/** Ganti password milik sendiri. Sepenuhnya opsional, tidak pernah dipaksa sistem. */
router.get('/ubah-password', requireAuth, (req, res) => {
  res.render('auth/ubah-password', {
    title: 'Ubah Password',
    errors: [],
    values: {},
  });
});

router.post('/ubah-password', requireAuth, [
  body('password_lama').notEmpty().withMessage('Password lama wajib diisi.'),
  body('password_baru').isLength({ min: 8 }).withMessage('Password baru minimal 8 karakter.'),
  body('konfirmasi').custom((value, { req }) => value !== req.body.password_baru)
    .withMessage('Konfirmasi password tidak cocok.'),
], (req, res) => {
  const errors = validationResult(req);
  const values = { password_lama: '', konfirmasi: '' };

  if (!errors.isEmpty()) {
    return res.status(422).render('auth/ubah-password', {
      title: 'Ubah Password', errors: errors.array(), values,
    });
  }

  const row = db.db.get('SELECT password_hash FROM users WHERE id = ?', req.user.id);
  if (!bcrypt.compareSync(String(req.body.password_lama), row.password_hash)) {
    return res.status(422).render('auth/ubah-password', {
      title: 'Ubah Password',
      errors: [{ msg: 'Password lama tidak sesuai.' }],
      values,
    });
  }

  const baru = String(req.body.password_baru);
  db.db.run(
    "UPDATE users SET password_hash = ?, password_teks = ?, updated_at = datetime('now','localtime') WHERE id = ?",
    bcrypt.hashSync(baru, 10), baru, req.user.id,
  );
  log(req, 'UBAH_PASSWORD', 'users', req.user.id, 'Ganti password sendiri');

  req.session.flash = { type: 'success', message: 'Password berhasil diperbarui.' };
  return res.redirect('/');
});

/** Profil pengguna yang sedang masuk. */
router.get('/profil', requireAuth, (req, res) => {
  res.render('auth/profil', {
    title: 'Profil Saya',
    karyawan: db.db.get('SELECT * FROM karyawan WHERE id = ?', req.user.karyawanId) || null,
    errors: [],
    values: {},
  });
});

router.post('/profil', requireAuth, [
  body('no_hp').optional({ values: 'falsy' }).trim().isLength({ max: 30 }).withMessage('Nomor HP terlalu panjang.'),
  body('alamat').optional({ values: 'falsy' }).trim().isLength({ max: 500 }).withMessage('Alamat terlalu panjang.'),
  body('nama_bank').optional({ values: 'falsy' }).trim().isLength({ max: 60 }),
  body('no_rekening').optional({ values: 'falsy' }).trim().isLength({ max: 40 }),
], (req, res) => {
  const errors = validationResult(req);
  const values = {
    nama: req.user.nama,
    no_hp: req.body.no_hp || '',
    alamat: req.body.alamat || '',
    nama_bank: req.body.nama_bank || '',
    no_rekening: req.body.no_rekening || '',
  };

  if (!errors.isEmpty()) {
    return res.status(422).render('auth/profil', {
      title: 'Profil Saya',
      karyawan: db.db.get('SELECT * FROM karyawan WHERE id = ?', req.user.karyawanId) || null,
      errors: errors.array(),
      values,
    });
  }

  db.db.run(
    `UPDATE karyawan SET no_hp = ?, alamat = ?, nama_bank = ?, no_rekening = ?,
            updated_at = datetime('now','localtime') WHERE id = ?`,
    values.no_hp, values.alamat, values.nama_bank, values.no_rekening, req.user.karyawanId,
  );
  db.db.run("UPDATE users SET nama = ?, updated_at = datetime('now','localtime') WHERE id = ?", req.user.nama, req.user.id);
  log(req, 'UBAH_PROFIL', 'karyawan', req.user.karyawanId, 'Karyawan memperbarui profil sendiri');

  req.session.flash = { type: 'success', message: 'Profil berhasil diperbarui.' };
  return res.redirect('/profil');
});

module.exports = router;
