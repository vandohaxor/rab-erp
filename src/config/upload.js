'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const env = require('./env');
const h = require('../utils/helpers');

const PUBLIC_DIR = path.join(env.rootDir, 'public');
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');
const ABSENSI_DIR = path.join(UPLOAD_DIR, 'absensi');

const TIPE_GAMBAR = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

const MAKS_UKURAN = 3 * 1024 * 1024;

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const folder = path.join(ABSENSI_DIR, h.today());
    fs.mkdir(folder, { recursive: true }, (error) => cb(error, folder));
  },
  filename(req, file, cb) {
    const ext = TIPE_GAMBAR.get(file.mimetype) || '.jpg';
    const unik = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    cb(null, `${unik}${ext}`);
  },
});

/** Terima satu foto absensi (field "foto") dan simpan ke public/uploads/absensi/<tanggal>/. */
const uploadFotoAbsensi = multer({
  storage,
  limits: { fileSize: MAKS_UKURAN, files: 1, fields: 20 },
  fileFilter(req, file, cb) {
    if (!TIPE_GAMBAR.has(file.mimetype)) {
      const error = new Error('Foto harus berupa gambar JPG, PNG, atau WEBP.');
      error.code = 'LIMIT_UNEXPECTED_FILE';
      return cb(error);
    }
    return cb(null, true);
  },
}).single('foto');

/** "uploads/absensi/2026-09-30/123-abc.jpg" -> "/uploads/absensi/2026-09-30/123-abc.jpg" */
function urlFoto(fotoPath) {
  if (!fotoPath) return null;
  return `/${String(fotoPath).replace(/\\/g, '/').replace(/^\/+/, '')}`;
}

/** Hapus file foto dari disk. Dipakai saat validasi gagal atau catatan absensi dihapus. */
function hapusFoto(fotoPath) {
  if (!fotoPath) return;
  const target = path.join(PUBLIC_DIR, String(fotoPath).replace(/[\\/]+/g, path.sep));
  if (!target.startsWith(PUBLIC_DIR)) return;
  fs.rm(target, { force: true }, () => {});
}

module.exports = { uploadFotoAbsensi, urlFoto, hapusFoto, MAKS_UKURAN, UPLOAD_DIR, ABSENSI_DIR };
