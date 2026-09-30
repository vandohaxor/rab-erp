'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const env = require('./env');

fs.mkdirSync(path.dirname(env.databaseFile), { recursive: true });

const db = new DatabaseSync(env.databaseFile);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');

/**
 * node:sqlite hanya menerima null | number | bigint | string | Uint8Array.
 * Ubah tipe JS umum (boolean, Date, undefined) sebelum masuk ke statement.
 */
function normalize(params) {
  return params.map((value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'number' && !Number.isFinite(value)) return null;
    return value;
  });
}

const cache = new Map();
let depth = 0;
function stmt(sql) {
  let prepared = cache.get(sql);
  if (!prepared) {
    prepared = db.prepare(sql);
    cache.set(sql, prepared);
  }
  return prepared;
}

const api = {
  raw: db,

  exec(sql) {
    db.exec(sql);
  },

  run(sql, ...params) {
    const result = stmt(sql).run(...normalize(params));
    return {
      changes: Number(result.changes),
      lastInsertRowid: Number(result.lastInsertRowid),
    };
  },

  get(sql, ...params) {
    return stmt(sql).get(...normalize(params)) ?? null;
  },

  all(sql, ...params) {
    return stmt(sql).all(...normalize(params));
  },

  pluck(sql, ...params) {
    const row = api.get(sql, ...params);
    if (!row) return null;
    return Object.values(row)[0];
  },

  /**
   * Jalankan callback di dalam transaksi. Rollback otomatis bila error.
   * Transaksi bersarang memakai SAVEPOINT sehingga service yang memanggil
   * transaction() sendiri tetap aman dipanggil dari dalam transaksi lain.
   */
  transaction(fn) {
    const nested = depth > 0;
    const point = `sp_${depth}`;
    db.exec(nested ? `SAVEPOINT ${point}` : 'BEGIN');
    depth += 1;
    try {
      const result = fn();
      depth -= 1;
      db.exec(nested ? `RELEASE ${point}` : 'COMMIT');
      return result;
    } catch (error) {
      depth -= 1;
      try {
        db.exec(nested ? `ROLLBACK TO ${point}; RELEASE ${point}` : 'ROLLBACK');
      } catch {
        /* ignore */
      }
      throw error;
    }
  },

  close() {
    cache.clear();
    db.close();
  },

  TABLE_SCHEMA: [
    `
    CREATE TABLE IF NOT EXISTS departemen (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      nama        TEXT NOT NULL UNIQUE,
      deskripsi   TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`,
    `
    CREATE TABLE IF NOT EXISTS karyawan (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      nip                 TEXT NOT NULL UNIQUE,
      nama_lengkap        TEXT NOT NULL,
      nik                 TEXT,
      jenis_kelamin       TEXT NOT NULL DEFAULT 'L',
      tempat_lahir        TEXT,
      tanggal_lahir       TEXT,
      alamat              TEXT,
      no_hp               TEXT,
      email               TEXT,
      departemen_id       INTEGER REFERENCES departemen(id) ON DELETE SET NULL,
      jabatan             TEXT,
      tipe_kontrak        TEXT NOT NULL DEFAULT 'PKWT',
      tanggal_masuk       TEXT NOT NULL,
      tanggal_keluar      TEXT,
      status_karyawan     TEXT NOT NULL DEFAULT 'aktif',
      gaji_pokok          INTEGER NOT NULL DEFAULT 0,
      tunjangan_transport INTEGER NOT NULL DEFAULT 0,
      tunjangan_makan     INTEGER NOT NULL DEFAULT 0,
      tunjangan_lain      INTEGER NOT NULL DEFAULT 0,
      nama_bank           TEXT,
      no_rekening         TEXT,
      alamat_darurat      TEXT,
      catatan             TEXT,
      created_at          TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at          TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`,
    `
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      nama          TEXT NOT NULL,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_teks TEXT,
      role          TEXT NOT NULL DEFAULT 'karyawan',
      karyawan_id   INTEGER REFERENCES karyawan(id) ON DELETE SET NULL,
      status        TEXT NOT NULL DEFAULT 'aktif',
      harus_ganti_password INTEGER NOT NULL DEFAULT 0,
      terakhir_masuk TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`,
    `
    CREATE TABLE IF NOT EXISTS jadwal_kerja (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      nama        TEXT NOT NULL UNIQUE,
      jam_masuk   TEXT NOT NULL DEFAULT '08:00',
      jam_pulang  TEXT NOT NULL DEFAULT '18:00',
      hari_kerja  TEXT NOT NULL DEFAULT '1,2,3,4,5',
      toleransi_menit INTEGER NOT NULL DEFAULT 15,
      is_default  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`,
    `
    CREATE TABLE IF NOT EXISTS absensi (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      karyawan_id   INTEGER NOT NULL REFERENCES karyawan(id) ON DELETE CASCADE,
      tanggal       TEXT NOT NULL,
      jam_masuk     TEXT,
      jam_pulang    TEXT,
      durasi_menit  INTEGER NOT NULL DEFAULT 0,
      menit_lembur  INTEGER NOT NULL DEFAULT 0,
      status        TEXT NOT NULL DEFAULT 'hadir',
      keterangan    TEXT,
      foto_path     TEXT,
      sumber        TEXT NOT NULL DEFAULT 'mandiri',
      ip_address    TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      UNIQUE (karyawan_id, tanggal)
    )`,
    `
    CREATE TABLE IF NOT EXISTS pengajuan_izin (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      karyawan_id   INTEGER NOT NULL REFERENCES karyawan(id) ON DELETE CASCADE,
      jenis         TEXT NOT NULL DEFAULT 'izin',
      tanggal_mulai TEXT NOT NULL,
      tanggal_selesai TEXT NOT NULL,
      alasan        TEXT,
      status        TEXT NOT NULL DEFAULT 'pending',
      diproses_oleh INTEGER REFERENCES users(id) ON DELETE SET NULL,
      catatan       TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`,
    `
    CREATE TABLE IF NOT EXISTS kategori_transaksi (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      nama      TEXT NOT NULL UNIQUE,
      jenis     TEXT NOT NULL,
      keterangan TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`,
    `
    CREATE TABLE IF NOT EXISTS transaksi (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      kode        TEXT NOT NULL UNIQUE,
      tanggal     TEXT NOT NULL,
      jenis       TEXT NOT NULL,
      kategori_id  INTEGER REFERENCES kategori_transaksi(id) ON DELETE SET NULL,
      jumlah      INTEGER NOT NULL,
      metode      TEXT NOT NULL DEFAULT 'transfer',
      pic         TEXT,
      keterangan  TEXT,
      no_referensi TEXT,
      status      TEXT NOT NULL DEFAULT 'posted',
      dibuat_oleh INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`,
    `
    CREATE TABLE IF NOT EXISTS payroll (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      bulan             INTEGER NOT NULL,
      tahun             INTEGER NOT NULL,
      karyawan_id       INTEGER NOT NULL REFERENCES karyawan(id) ON DELETE CASCADE,
      hari_kerja        INTEGER NOT NULL DEFAULT 0,
      hari_hadir        INTEGER NOT NULL DEFAULT 0,
      hari_izin         INTEGER NOT NULL DEFAULT 0,
      hari_sakit        INTEGER NOT NULL DEFAULT 0,
      hari_alpha        INTEGER NOT NULL DEFAULT 0,
      menit_lembur      INTEGER NOT NULL DEFAULT 0,
      gaji_pokok        INTEGER NOT NULL DEFAULT 0,
      tunjangan_harian  INTEGER NOT NULL DEFAULT 0,
      total_tunjangan   INTEGER NOT NULL DEFAULT 0,
      nilai_lembur      INTEGER NOT NULL DEFAULT 0,
      bonus             INTEGER NOT NULL DEFAULT 0,
      kasbon            INTEGER NOT NULL DEFAULT 0,
      potongan_lain     INTEGER NOT NULL DEFAULT 0,
      total_pendapatan  INTEGER NOT NULL DEFAULT 0,
      total_potongan    INTEGER NOT NULL DEFAULT 0,
      gaji_bersih       INTEGER NOT NULL DEFAULT 0,
      status            TEXT NOT NULL DEFAULT 'draft',
      catatan           TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      UNIQUE (bulan, tahun, karyawan_id)
    )`,
    `
    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`,
    `
    CREATE TABLE IF NOT EXISTS audit_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER,
      nama       TEXT,
      aksi       TEXT NOT NULL,
      entitas    TEXT,
      entitas_id TEXT,
      detail     TEXT,
      ip         TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`,
    `
    CREATE TABLE IF NOT EXISTS sessions (
      sid     TEXT PRIMARY KEY,
      sess    TEXT NOT NULL,
      expires INTEGER NOT NULL
    )`,
  ],

  INDEXES: [
    'CREATE INDEX IF NOT EXISTS idx_absensi_tanggal ON absensi (tanggal)',
    'CREATE INDEX IF NOT EXISTS idx_absensi_karyawan ON absensi (karyawan_id, tanggal)',
    'CREATE INDEX IF NOT EXISTS idx_transaksi_tanggal ON transaksi (tanggal)',
    'CREATE INDEX IF NOT EXISTS idx_transaksi_jenis ON transaksi (jenis, tanggal)',
    'CREATE INDEX IF NOT EXISTS idx_payroll_periode ON payroll (tahun, bulan)',
    'CREATE INDEX IF NOT EXISTS idx_karyawan_status ON karyawan (status_karyawan)',
    'CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires)',
  ],

  /** Penyesuaian data untuk database lama. Aman dijalankan berkali-kali. */
  CLEANUP: [
    // Ganti password kini murni opsional, seluruh flag lama dimatikan.
    'UPDATE users SET harus_ganti_password = 0 WHERE harus_ganti_password <> 0',
  ],

  /** Kolom tambahan untuk database yang sudah dibuat pada versi sebelumnya. */
  COLUMNS: {
    users: [
      ['password_teks', 'TEXT'],
    ],
    absensi: [
      ['foto_path', 'TEXT'],
      ['sumber', "TEXT NOT NULL DEFAULT 'mandiri'"],
    ],
    payroll: [
      ['hari_cuti', 'INTEGER NOT NULL DEFAULT 0'],
      ['hari_wfh', 'INTEGER NOT NULL DEFAULT 0'],
      ['gaji_per_hari', 'INTEGER NOT NULL DEFAULT 0'],
      ['dasar_lembur', 'INTEGER NOT NULL DEFAULT 0'],
      ['potongan_absensi', 'INTEGER NOT NULL DEFAULT 0'],
      ['bonus_alpha', 'INTEGER NOT NULL DEFAULT 0'],
      ['persen_bpjs', 'REAL NOT NULL DEFAULT 0'],
    ],
  },
};

function columns(table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
}

function migrate() {
  for (const sql of api.TABLE_SCHEMA) db.exec(sql);
  for (const sql of api.INDEXES) db.exec(sql);

  for (const [table, list] of Object.entries(api.COLUMNS)) {
    const ada = columns(table);
    for (const [name, definition] of list) {
      if (!ada.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    }
  }

  for (const sql of api.CLEANUP) db.exec(sql);
}

module.exports = { db: api, migrate, env };
