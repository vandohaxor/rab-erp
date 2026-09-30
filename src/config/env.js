'use strict';

const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const rootDir = path.resolve(__dirname, '..', '..');

function required(key, fallback) {
  const value = process.env[key];
  if (value !== undefined && value !== '') return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Konfigurasi environment "${key}" wajib diisi. Salin .env.example menjadi .env`);
}

const isProd = process.env.NODE_ENV === 'production';

const env = {
  isProd,
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',
  rootDir,

  companyName: process.env.COMPANY_NAME || 'PT Rajawali Atas Bumi',

  session: {
    name: process.env.SESSION_NAME || 'rab.sid',
    secret: required('SESSION_SECRET', isProd ? undefined : 'dev-only-insecure-secret'),
    maxAge: Number(process.env.SESSION_MAX_AGE_MS) || 1000 * 60 * 60 * 8,
  },

  databaseFile: path.isAbsolute(process.env.DB_FILE || '')
    ? process.env.DB_FILE
    : path.join(rootDir, process.env.DB_FILE || './data/rab.sqlite'),

  seed: {
    adminEmail: process.env.DEFAULT_ADMIN_EMAIL || 'direktur@rajawaliatasbumi.co.id',
    adminPassword: process.env.DEFAULT_ADMIN_PASSWORD || 'Direktor123!',
    // Isi data contoh (karyawan, transaksi, absensi) hanya bila SEED_DEMO=true.
    demo: process.env.SEED_DEMO === 'true',
  },
};

module.exports = env;
