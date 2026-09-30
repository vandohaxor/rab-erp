'use strict';

const db = require('../config/database');
const { ROLE_META, MODULES, can, titleCase } = require('../utils/constants');

function findUserById(id) {
  return db.db.get(
    `SELECT u.*, k.nip, k.jabatan, k.nama_lengkap, k.status_karyawan, k.departemen_id, d.nama AS departemen
       FROM users u
       LEFT JOIN karyawan k ON k.id = u.karyawan_id
       LEFT JOIN departemen d ON d.id = k.departemen_id
      WHERE u.id = ?`,
    id,
  );
}

function log(req, aksi, entitas, entitasId, detail) {
  try {
    db.db.run(
      `INSERT INTO audit_log (user_id, nama, aksi, entitas, entitas_id, detail, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      req.session?.user?.id ?? null,
      req.session?.user?.nama ?? 'Sistem',
      aksi,
      entitas ?? null,
      entitasId != null ? String(entitasId) : null,
      detail ?? null,
      req.clientIp || null,
    );
  } catch {
    /* audit tidak boleh menggagalkan transaksi bisnis */
  }
}

/** Wajib login. Menyuntikkan req.user, req.audit, res.locals.user. */
function requireAuth(req, res, next) {
  if (!req.session?.user) {
    req.session.flash = {
      type: 'warning',
      message: 'Silakan masuk terlebih dahulu untuk mengakses halaman tersebut.',
    };
    const target = req.originalUrl || '/';
    if (target.startsWith('/login')) return res.redirect('/login');
    return res.redirect(`/login?next=${encodeURIComponent(target)}`);
  }

  const user = findUserById(req.session.user.id);
  if (!user || user.status !== 'aktif') {
    req.session.destroy(() => {});
    res.clearCookie(req.app.get('sessionName'));
    req.session = null;
    res.locals.user = null;
    return res.redirect('/login?alasan=nonaktif');
  }

  // `karyawanId` dipakai banyak route sebagai alias kolom `karyawan_id`.
  req.user = { ...user, karyawanId: user.karyawan_id };
  req.audit = log;
  res.locals.user = {
    id: user.id,
    nama: user.nama,
    email: user.email,
    role: user.role,
    roleLabel: ROLE_META[user.role]?.label || titleCase(user.role),
    roleBadge: ROLE_META[user.role]?.badge || 'secondary',
    karyawanId: user.karyawan_id,
    nip: user.nip,
    jabatan: user.jabatan,
    departemen: user.departemen,
    inisial: (user.nama || '?').split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join(''),
  };
  return next();
}

/** Batasi akses berdasarkan role: requireRole('superadmin', 'keuangan') */
function requireRole(...roles) {
  const allowed = new Set(roles);
  return (req, res, next) => {
    if (!req.user) return res.redirect('/login');
    if (!allowed.has(req.user.role)) {
      return res.status(403).render('errors/403', {
        title: 'Akses Ditolak',
        requiredRoles: [...allowed].map((r) => ROLE_META[r]?.label || r),
      });
    }
    return next();
  };
}

/** Guard berbasis modul; konsisten dengan menu sidebar. */
function requireModule(moduleKey) {
  return (req, res, next) => {
    if (!req.user) return res.redirect('/login');
    if (!can(req.user.role, moduleKey)) {
      const allowedRoles = Object.keys(MODULES[moduleKey] || {})
        .filter((role) => MODULES[moduleKey][role])
        .map((role) => ROLE_META[role]?.label || titleCase(role));
      return res.status(403).render('errors/403', {
        title: 'Akses Ditolak',
        requiredRoles: allowedRoles,
      });
    }
    return next();
  };
}

/** Pastikan akun logged-in tertaut ke data karyawan. */
function requireKaryawan(req, res, next) {
  if (!req.user?.karyawan_id) {
    return res.status(403).render('errors/403', {
      title: 'Data Karyawan Belum Terhubung',
      requiredRoles: [],
    });
  }
  return next();
}

module.exports = { requireAuth, requireRole, requireModule, requireKaryawan, log };
