'use strict';

const bcrypt = require('bcryptjs');
const db = require('../config/database');
const env = require('../config/env');
const settings = require('./settings.service');
const { ROLES, ROLE_META } = require('../utils/constants');

const DEPARTEMEN = [
  ['Direksi', 'Pimpinan perusahaan dan pengambilan keputusan strategis'],
  ['Administrasi & HRD', 'Administrasi, kepegawaian, dan sumber daya manusia'],
  ['Keuangan', 'Pembukuan, perpajakan, dan pelaporan keuangan'],
  ['Operasional', 'Pelaksanaan pekerjaan lapangan dan operasional harian'],
  ['Pemasaran', 'Pelanggan, penjualan, dan pengembangan pasar'],
];

const KARYAWAN = [
  {
    nip: 'RB-001', nama_lengkap: 'Rangga Prasetyo Wibowo', nik: '3273010101900001',
    jenis_kelamin: 'L', tempat_lahir: 'Bandung', tanggal_lahir: '1990-01-01',
    jabatan: 'Direktur Utama', departemen: 'Direksi', tipe_kontrak: 'PKWTT',
    tanggal_masuk: '2018-03-01', gaji_pokok: 45000000,
    tunjangan_transport: 2000000, tunjangan_makan: 750000, tunjangan_lain: 5000000,
    no_hp: '081200000001', email: 'direktur@rajawaliatasbumi.co.id',
    nama_bank: 'BCA', no_rekening: '1234567890',
    alamat: 'Jl. Puspa Raya No. 12, Bandung',
    role: ROLES.SUPERADMIN,
  },
  {
    nip: 'RB-002', nama_lengkap: 'Siti Rahmawati', nik: '3273025506920002',
    jenis_kelamin: 'P', tempat_lahir: 'Tangerang', tanggal_lahir: '1992-06-15',
    jabatan: 'Manager Keuangan', departemen: 'Keuangan', tipe_kontrak: 'PKWTT',
    tanggal_masuk: '2019-07-15', gaji_pokok: 22000000,
    tunjangan_transport: 1000000, tunjangan_makan: 500000, tunjangan_lain: 1500000,
    no_hp: '081200000002', email: 'keuangan@rajawaliatasbumi.co.id',
    nama_bank: 'Mandiri', no_rekening: '9876543210',
    alamat: 'Jl. Melati Hijau No. 8, Tangerang',
    role: ROLES.KEUANGAN,
  },
  {
    nip: 'RB-003', nama_lengkap: 'Ahmad Fauzi Hidayat', nik: '3273031205880003',
    jenis_kelamin: 'L', tempat_lahir: 'Bandung', tanggal_lahir: '1988-08-12',
    jabatan: 'HRD Manager', departemen: 'Administrasi & HRD', tipe_kontrak: 'PKWTT',
    tanggal_masuk: '2019-01-10', gaji_pokok: 18000000,
    tunjangan_transport: 800000, tunjangan_makan: 450000, tunjangan_lain: 1000000,
    no_hp: '081200000003', email: 'hrd@rajawaliatasbumi.co.id',
    nama_bank: 'BNI', no_rekening: '1122334455',
    alamat: 'Jl. Cikutra Baru No. 5, Bandung',
    role: ROLES.SUPERADMIN,
  },
  {
    nip: 'RB-004', nama_lengkap: 'Dewi Anggraini', nik: '3273046707950004',
    jenis_kelamin: 'P', tempat_lahir: 'Cimahi', tanggal_lahir: '1995-07-17',
    jabatan: 'Staff Administrasi', departemen: 'Administrasi & HRD', tipe_kontrak: 'PKWT',
    tanggal_masuk: '2021-02-01', gaji_pokok: 6500000,
    tunjangan_transport: 400000, tunjangan_makan: 300000, tunjangan_lain: 300000,
    no_hp: '081200000004', email: 'dewi.anggraini@rajawaliatasbumi.co.id',
    nama_bank: 'BRI', no_rekening: '5566778899',
    alamat: 'Jl. Cibadak No. 21, Bandung',
    role: ROLES.KARYAWAN,
  },
  {
    nip: 'RB-005', nama_lengkap: 'Budi Santoso', nik: '3273051103820005',
    jenis_kelamin: 'L', tempat_lahir: 'Solo', tanggal_lahir: '1982-03-11',
    jabatan: 'Mandor Operasional', departemen: 'Operasional', tipe_kontrak: 'PKWT',
    tanggal_masuk: '2020-09-01', gaji_pokok: 7800000,
    tunjangan_transport: 450000, tunjangan_makan: 350000, tunjangan_lain: 400000,
    no_hp: '081200000005', email: 'budi.santoso@rajawaliatasbumi.co.id',
    nama_bank: 'BCA', no_rekening: '2233445566',
    alamat: 'Jl. Ahmad Yani No. 90, Solo',
    role: ROLES.KARYAWAN,
  },
  {
    nip: 'RB-006', nama_lengkap: 'Rina Marlina', nik: '3273062509030006',
    jenis_kelamin: 'P', tempat_lahir: 'Bandung', tanggal_lahir: '2003-09-25',
    jabatan: 'Staff Pemasaran', departemen: 'Pemasaran', tipe_kontrak: 'PKWT',
    tanggal_masuk: '2023-06-01', gaji_pokok: 5200000,
    tunjangan_transport: 400000, tunjangan_makan: 300000, tunjangan_lain: 200000,
    no_hp: '081200000006', email: 'rina.marlina@rajawaliatasbumi.co.id',
    nama_bank: 'BRI', no_rekening: '3344556677',
    alamat: 'Jl. Margahayu Raya B-14, Bandung',
    role: ROLES.KARYAWAN,
  },
];

const TRANSAKSI = [
  { tanggal: -4, jenis: 'pemasukan', kategori: 'Penjualan Produk', jumlah: 185000000, metode: 'transfer', pic: 'Rina Marlina', keterangan: 'Penjualan batch material bulan berjalan' },
  { tanggal: -9, jenis: 'pemasukan', kategori: 'Penjualan Jasa', jumlah: 75000000, metode: 'transfer', pic: 'Dewi Anggraini', keterangan: 'Jasa proyek maintenance gedung' },
  { tanggal: -2, jenis: 'pengeluaran', kategori: 'Pembelian Bahan Baku', jumlah: 62000000, metode: 'transfer', pic: 'Budi Santoso', keterangan: 'Pembelian bahan baku proyek A' },
  { tanggal: -1, jenis: 'pengeluaran', kategori: 'Utilitas (Listrik, Air, Internet)', jumlah: 8750000, metode: 'transfer', pic: 'Siti Rahmawati', keterangan: 'Tagihan listrik, air, dan internet' },
  { tanggal: -3, jenis: 'pengeluaran', kategori: 'Transportasi & Logistik', jumlah: 12400000, metode: 'tunai', pic: 'Budi Santoso', keterangan: 'Ongkos angkut material dan BBM' },
];

function seedDepartemen() {
  for (const [nama, deskripsi] of DEPARTEMEN) {
    const ada = db.db.get('SELECT 1 FROM departemen WHERE nama = ?', nama);
    if (!ada) db.db.run('INSERT INTO departemen (nama, deskripsi) VALUES (?, ?)', nama, deskripsi);
  }
}

function seedKaryawanDanUser() {
  const created = [];
  for (const k of KARYAWAN) {
    const ada = db.db.get('SELECT id FROM karyawan WHERE nip = ?', k.nip);
    if (ada) continue;

    const dep = db.db.pluck('SELECT id FROM departemen WHERE nama = ?', k.departemen);
    const karyawanId = db.db.run(
      `INSERT INTO karyawan (nip, nama_lengkap, nik, jenis_kelamin, tempat_lahir, tanggal_lahir,
        alamat, no_hp, email, departemen_id, jabatan, tipe_kontrak, tanggal_masuk, status_karyawan,
        gaji_pokok, tunjangan_transport, tunjangan_makan, tunjangan_lain, nama_bank, no_rekening)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'aktif',?,?,?,?,?,?)`,
      k.nip, k.nama_lengkap, k.nik, k.jenis_kelamin, k.tempat_lahir, k.tanggal_lahir,
      k.alamat, k.no_hp, k.email, dep, k.jabatan, k.tipe_kontrak, k.tanggal_masuk,
      k.gaji_pokok, k.tunjangan_transport, k.tunjangan_makan, k.tunjangan_lain, k.nama_bank, k.no_rekening,
    ).lastInsertRowid;

    const defaultPassword = k.role === ROLES.SUPERADMIN
      ? env.seed.adminPassword
      : k.role === ROLES.KEUANGAN ? 'Keuangan123!' : 'Karyawan123!';
    const hash = bcrypt.hashSync(defaultPassword, 10);

    db.db.run(
      `INSERT INTO users (nama, email, password_hash, password_teks, role, karyawan_id, status)
       VALUES (?, ?, ?, ?, ?, ?, 'aktif')`,
      k.nama_lengkap, k.email, hash, defaultPassword, k.role, karyawanId,
    );
    created.push({ ...k, karyawanId, password: defaultPassword });
  }
  return created;
}

function seedAbsensi() {
  const karyawanList = db.db.all("SELECT id, nip FROM karyawan WHERE status_karyawan = 'aktif' ORDER BY nip");
  if (!karyawanList.length) return;

  const h = require('../utils/helpers');
  const dayjs = h.dayjs;
  // Pastikan baris jadwal kerja ada agar seed dan absensi memakai aturan yang sama.
  require('./absensi.service').getJadwal();
  const jadwal = db.db.get('SELECT * FROM jadwal_kerja WHERE is_default = 1');
  const jamMasuk = jadwal?.jam_masuk || '08:00';
  const jamPulang = jadwal?.jam_pulang || '18:00';
  const normalMenit = h.timeToMinutes(jamPulang) - h.timeToMinutes(jamMasuk);

  for (let i = 20; i >= 1; i -= 1) {
    const d = dayjs().subtract(i, 'day');
    if (d.day() === 0 || d.day() === 6) continue;
    for (const k of karyawanList) {
      const tanggal = d.format('YYYY-MM-DD');
      if (db.db.get('SELECT 1 FROM absensi WHERE karyawan_id = ? AND tanggal = ?', k.id, tanggal)) continue;

      const acak = Math.random();
      if (acak < 0.08) {
        db.db.run(
          `INSERT INTO absensi (karyawan_id, tanggal, status, keterangan) VALUES (?,?,'izin','Izin kerja dari rumah')`,
          k.id, tanggal,
        );
        continue;
      }
      if (acak < 0.13) {
        db.db.run(
          `INSERT INTO absensi (karyawan_id, tanggal, status, keterangan) VALUES (?,?,'sakit','Kurang sehat')`,
          k.id, tanggal,
        );
        continue;
      }

      const menitTambah = Math.floor(Math.random() * 10);
      const mulai = h.timeToMinutes(jamMasuk);
      const masuk = h.minutesToTime(mulai + menitTambah);
      const lemburMenit = Math.random() < 0.35 ? 30 + Math.floor(Math.random() * 120) : 0;
      const pulang = h.minutesToTime(mulai + normalMenit + lemburMenit);

      db.db.run(
        `INSERT INTO absensi (karyawan_id, tanggal, jam_masuk, jam_pulang, durasi_menit, menit_lembur, status)
         VALUES (?,?,?,?,?,?,'hadir')`,
        k.id, tanggal, masuk, pulang, normalMenit + lemburMenit, lemburMenit,
      );
    }
  }
}

function seedTransaksi() {
  // Jangan pernah dobel: kalau sudah ada transaksi, lewati.
  if (Number(db.db.pluck('SELECT COUNT(*) FROM transaksi') || 0) > 0) return;
  const dayjs = require('dayjs');
  const adminId = db.db.pluck("SELECT id FROM users WHERE role = 'superadmin' ORDER BY id LIMIT 1");
  for (const t of TRANSAKSI) {
    const tanggal = dayjs().add(t.tanggal, 'day').format('YYYY-MM-DD');
    const kategoriId = db.db.pluck('SELECT id FROM kategori_transaksi WHERE nama = ?', t.kategori);
    if (!kategoriId) continue;

    const kode = require('./keuangan.service').nextKode(t.jenis, tanggal);
    db.db.run(
      `INSERT INTO transaksi (kode, tanggal, jenis, kategori_id, jumlah, metode, pic, keterangan, dibuat_oleh)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      kode, tanggal, t.jenis, kategoriId, t.jumlah, t.metode, t.pic, t.keterangan, adminId,
    );
  }
}

/**
 * Isi password_teks untuk akun lama yang hash-nya cocok dengan password awal bawaan,
 * supaya password tersebut langsung bisa dilihat di Manajemen Pengguna.
 */
function backfillPasswordTeks() {
  const kandidat = [...new Set([
    env.seed.adminPassword, 'Direktur123!', 'Keuangan123!', 'Karyawan123!',
  ].filter(Boolean))];

  const rows = db.db.all("SELECT id, password_hash FROM users WHERE password_teks IS NULL OR password_teks = ''");
  for (const row of rows) {
    const cocok = kandidat.find((p) => {
      try {
        return bcrypt.compareSync(p, row.password_hash);
      } catch {
        return false;
      }
    });
    if (cocok) db.db.run("UPDATE users SET password_teks = ? WHERE id = ?", cocok, row.id);
  }
}

/** Pastikan selalu ada satu akun direktur dari .env (dipakai juga saat data dikosongkan). */
function ensureAdminUtama() {
  const email = env.seed.adminEmail;
  if (db.db.pluck('SELECT 1 FROM users WHERE email = ?', email)) return null;

  let karyawanId = db.db.pluck('SELECT id FROM karyawan WHERE email = ?', email);
  if (!karyawanId) {
    const k = KARYAWAN[0];
    const dep = db.db.pluck('SELECT id FROM departemen WHERE nama = ?', k.departemen);
    karyawanId = db.db.run(
      `INSERT INTO karyawan (nip, nama_lengkap, nik, jenis_kelamin, tempat_lahir, tanggal_lahir,
        alamat, no_hp, email, departemen_id, jabatan, tipe_kontrak, tanggal_masuk, status_karyawan,
        gaji_pokok, tunjangan_transport, tunjangan_makan, tunjangan_lain, nama_bank, no_rekening)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'aktif',?,?,?,?,?,?)`,
      k.nip, k.nama_lengkap, k.nik, k.jenis_kelamin, k.tempat_lahir, k.tanggal_lahir,
      k.alamat, k.no_hp, k.email, dep, k.jabatan, k.tipe_kontrak, k.tanggal_masuk,
      k.gaji_pokok, k.tunjangan_transport, k.tunjangan_makan, k.tunjangan_lain, k.nama_bank, k.no_rekening,
    ).lastInsertRowid;
  }

  db.db.run(
    `INSERT INTO users (nama, email, password_hash, password_teks, role, karyawan_id, status)
     VALUES (?, ?, ?, ?, ?, ?, 'aktif')`,
    'Direktur Utama', email, bcrypt.hashSync(env.seed.adminPassword, 10), env.seed.adminPassword,
    ROLES.SUPERADMIN, karyawanId,
  );
  return {
    nama: 'Direktur Utama',
    email,
    password: env.seed.adminPassword,
    role: ROLE_META[ROLES.SUPERADMIN].label,
  };
}

/**
 * Jalankan seluruh proses inisialisasi database. Aman dipanggil berkali-kali.
 * Data contoh hanya diisi bila env.seed.demo (SEED_DEMO=true); default-nya tidak,
 * supaya data asli yang sudah diinput tidak ditimpa atau digandakan saat restart.
 */
function run() {
  let dibuat = [];
  db.db.transaction(() => {
    settings.ensureDefaults();
    seedDepartemen();
    backfillPasswordTeks();

    const sudahAdaUser = Number(db.db.pluck('SELECT COUNT(*) FROM users') || 0);
    if (sudahAdaUser === 0) {
      const admin = ensureAdminUtama();
      if (admin) dibuat.push(admin);
    } else if (env.seed.demo) {
      dibuat = seedKaryawanDanUser();
    }
  });

  // Transaksi & absensi demo di luar transaksi utama agar tidak mengunci tabel terlalu lama.
  if (env.seed.demo) {
    db.db.transaction(seedTransaksi);
    db.db.transaction(seedAbsensi);
  }

  return {
    karyawan: Number(db.db.pluck('SELECT COUNT(*) FROM karyawan') || 0),
    users: Number(db.db.pluck('SELECT COUNT(*) FROM users') || 0),
    absensi: Number(db.db.pluck('SELECT COUNT(*) FROM absensi') || 0),
    transaksi: Number(db.db.pluck('SELECT COUNT(*) FROM transaksi') || 0),
    dibuat,
    akunDemo: dibuat.map((a) => ({
      nama: a.nama_lengkap,
      email: a.email,
      password: a.password,
      role: ROLE_META[a.role]?.label || a.role,
    })),
  };
}

module.exports = { run, DEPARTEMEN, KARYAWAN };
