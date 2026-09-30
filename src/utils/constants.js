'use strict';

const ROLES = {
  SUPERADMIN: 'superadmin',
  KEUANGAN: 'keuangan',
  KARYAWAN: 'karyawan',
};

const ROLE_LIST = Object.values(ROLES);

const ROLE_META = {
  [ROLES.SUPERADMIN]: {
    label: 'Superadmin',
    badge: 'danger',
    short: 'SA',
    deskripsi: 'Direktur - akses penuh seluruh fitur dan pengaturan perusahaan',
  },
  [ROLES.KEUANGAN]: {
    label: 'Keuangan',
    badge: 'success',
    short: 'KU',
    deskripsi: 'Mengelola transaksi keuangan, payroll, dan laporan keuangan',
  },
  [ROLES.KARYAWAN]: {
    label: 'Karyawan',
    badge: 'primary',
    short: 'KR',
    deskripsi: 'Absensi harian, lihat slip gaji, dan data profil sendiri',
  },
};

const STATUS_ABSENSI = {
  hadir: { label: 'Hadir', badge: 'success',icon: 'bi-check-circle' },
  izin: { label: 'Izin', badge: 'info', icon: 'bi-envelope-check' },
  sakit: { label: 'Sakit', badge: 'warning', icon: 'bi-heart-pulse' },
  cuti: { label: 'Cuti', badge: 'secondary', icon: 'bi-briefcase' },
  wfh: { label: 'Work From Home', badge: 'info', icon: 'bi-house' },
  hari_libur: { label: 'Hari Libur', badge: 'light', icon: 'bi-cup-hot' },
};

const STATUS_KARYAWAN = {
  aktif: { label: 'Aktif', badge: 'success' },
  cuti: { label: 'Cuti', badge: 'info' },
  resign: { label: 'Resign', badge: 'secondary' },
  phk: { label: 'PHK', badge: 'danger' },
};

const METODE_PEMBAYARAN = ['tunai', 'transfer', 'bca', 'bni', 'bri', 'mandiri', 'bjb', 'cimb', 'qris', 'cek'];

const TIPE_KONTRAK = ['PKWT', 'PKWTT', 'Magang', 'Kontrak', 'Freelance'];

const STATUS_PAYROLL = {
  draft: { label: 'Draft', badge: 'secondary' },
  disetujui: { label: 'Disetujui', badge: 'info' },
  dibayar: { label: 'Dibayar', badge: 'success' },
};

const JENIS_IZIN = {
  izin: 'Izin',
  sakit: 'Sakit',
  cuti: 'Cuti',
};

const BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/** Hak akses tiap modul per role. Dipakai untuk menu dan guard route. */
const MODULES = {
  dashboard: { superadmin: true, keuangan: true, karyawan: true },
  karyawan: { superadmin: true, keuangan: false, karyawan: false },
  users: { superadmin: true, keuangan: false, karyawan: false },
  // Karyawan hanya boleh absensi miliknya sendiri (absensi-saya).
  absensi: { superadmin: true, keuangan: true, karyawan: false },
  'absensi-saya': { superadmin: true, keuangan: false, karyawan: true },
  pengajuan: { superadmin: true, keuangan: false, karyawan: true },
  keuangan: { superadmin: true, keuangan: true, karyawan: false },
  // Slip gaji diakses lewat route slip-saya, jadi tidak perlu modul slip tersendiri.
  payroll: { superadmin: true, keuangan: true, karyawan: false },
  'slip-gaji': { superadmin: false, keuangan: false, karyawan: true },
  laporan: { superadmin: true, keuangan: true, karyawan: false },
  pengaturan: { superadmin: true, keuangan: false, karyawan: false },
  audit: { superadmin: true, keuangan: false, karyawan: false },
};

function can(role, moduleKey) {
  const row = MODULES[moduleKey];
  if (!row) return false;
  return Boolean(row[role]);
}

const AUDIT_LABEL = {
  LOGIN: 'Masuk',
  LOGOUT: 'Keluar',
  GAGAL_LOGIN: 'Gagal Masuk',
  TAMBAH: 'Tambah',
  UBAH: 'Ubah',
  HAPUS: 'Hapus',
  ABSEN_MASUK: 'Absen Masuk',
  ABSEN_PULANG: 'Absen Pulang',
  ABSEN_MANUAL: 'Absen Manual',
  CATAT_ABSENSI: 'Catat Absensi',
  HAPUS_ABSENSI: 'Hapus Absensi',
  EXPORT_ABSENSI: 'Export Absensi',
  AJUAN_PENGAJIAN: 'Ajuan Pengajuan',
  SETUJUI_PENGAJIAN: 'Setujui Pengajuan',
  TOLAK_PENGAJIAN: 'Tolak Pengajuan',
  BATAL_PENGAJIAN: 'Batalkan Pengajuan',
  TAMBAH_TRANSAKSI: 'Tambah Transaksi',
  UBAH_TRANSAKSI: 'Ubah Transaksi',
  HAPUS_TRANSAKSI: 'Hapus Transaksi',
  HITUNG_PAYROLL: 'Hitung Payroll',
  UBAH_PAYROLL: 'Ubah Payroll',
  HAPUS_PAYROLL: 'Hapus Payroll',
  UBAH_STATUS_PAYROLL: 'Ubah Status Payroll',
  UBAH_PASSWORD: 'Ubah Password',
  RESET_PASSWORD: 'Reset Password',
  UBAH_PENGATURAN: 'Ubah Pengaturan',
};

const AUDIT_META = {
  LOGIN: { badge: 'success', icon: 'bi-box-arrow-in-right' },
  LOGOUT: { badge: 'secondary', icon: 'bi-box-arrow-right' },
  GAGAL_LOGIN: { badge: 'danger', icon: 'bi-shield-exclamation' },
  TAMBAH: { badge: 'success', icon: 'bi-plus-circle' },
  UBAH: { badge: 'info', icon: 'bi-pencil' },
  HAPUS: { badge: 'danger', icon: 'bi-trash' },
  ABSEN_MASUK: { badge: 'success', icon: 'bi-box-arrow-in-right' },
  ABSEN_PULANG: { badge: 'success', icon: 'bi-box-arrow-right' },
  EXPORT_ABSENSI: { badge: 'primary', icon: 'bi-file-earmark-excel' },
  SETUJUI_PENGAJIAN: { badge: 'success', icon: 'bi-check-circle' },
  TOLAK_PENGAJIAN: { badge: 'danger', icon: 'bi-x-circle' },
  BATAL_PENGAJIAN: { badge: 'warning', icon: 'bi-slash-circle' },
  HITUNG_PAYROLL: { badge: 'primary', icon: 'bi-calculator' },
  UBAH_PAYROLL: { badge: 'info', icon: 'bi-pencil-square' },
  UBAH_STATUS_PAYROLL: { badge: 'primary', icon: 'bi-flag' },
  UBAH_PASSWORD: { badge: 'warning', icon: 'bi-key' },
  RESET_PASSWORD: { badge: 'warning', icon: 'bi-arrow-counterclockwise' },
  UBAH_PENGATURAN: { badge: 'dark', icon: 'bi-gear' },
};

function meta(map, key, fallback = { label: key, badge: 'secondary' }) {
  return map[key] || fallback;
}

module.exports = {
  ROLES,
  ROLE_LIST,
  ROLE_META,
  STATUS_ABSENSI,
  STATUS_KARYAWAN,
  STATUS_PAYROLL,
  METODE_PEMBAYARAN,
  TIPE_KONTRAK,
  JENIS_IZIN,
  BULAN,
  HARI,
  MODULES,
  AUDIT_LABEL,
  AUDIT_META,
  can,
  meta,
};
