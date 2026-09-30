'use strict';

const express = require('express');
const db = require('../config/database');
const h = require('../utils/helpers');
const { requireAuth } = require('../middleware/auth');
const { can } = require('../utils/constants');
const absensiService = require('../services/absensi.service');
const keuanganService = require('../services/keuangan.service');
const payrollService = require('../services/payroll.service');

const router = express.Router();
router.use(requireAuth);

function getPeriode(query = {}) {
  const now = h.dayjs();
  return {
    bulan: Math.min(12, Math.max(1, Number(query.bulan) || now.month() + 1)),
    tahun: Number(query.tahun) || now.year(),
  };
}

router.get('/', (req, res) => {
  const { role } = req.user;
  const hariIni = absensiService.rekapHarian(h.today());
  const jadwal = absensiService.getJadwal();
  const periode = getPeriode(req.query);

  const data = {
    role,
    hariIni,
    jadwal,
    nama: req.user.nama,
    absensiSaya: null,
    rekapSaya: null,
    totalKaryawan: Number(db.db.pluck("SELECT COUNT(*) FROM karyawan WHERE status_karyawan = 'aktif'") || 0),
    totalDepartemen: Number(db.db.pluck('SELECT COUNT(*) FROM departemen') || 0),
    absensiBulanIni: null,
    keuangan: null,
    trenKehadiran: absensiService.trenKehadiran(14),
    trenKas: null,
    payroll: null,
    aktivitas: [],
    absensiTerlambat: [],
  };

  // Ringkasan untuk Superadmin
  if (can(role, 'karyawan')) {
    data.karyawanBaru = db.db.all(
      `SELECT id, nip, nama_lengkap, jabatan, tanggal_masuk
         FROM karyawan WHERE status_karyawan = 'aktif'
        ORDER BY tanggal_masuk DESC LIMIT 5`,
    );
    data.absensiBulanIni = absensiService.rekapPeriode(periode.bulan, periode.tahun);
    data.penggunaAktif = Number(db.db.pluck("SELECT COUNT(*) FROM users WHERE status = 'aktif'") || 0);
  }

  // Ringkasan untuk Keuangan
  if (can(role, 'keuangan')) {
    const awal = h.dayjs().startOf('month').format('YYYY-MM-DD');
    const akhir = h.dayjs().endOf('month').format('YYYY-MM-DD');
    data.keuangan = {
      bulanIni: keuanganService.rekap(awal, akhir),
      tahunIni: keuanganService.saldorunning(h.today()),
      tren: keuanganService.trenBulanan(),
      perKategoriMasuk: keuanganService.perKategori(awal, akhir, 'pemasukan'),
      perKategoriKeluar: keuanganService.perKategori(awal, akhir, 'pengeluaran'),
      transaksiTerbaru: keuanganService.daftar({ limit: 6 }).rows,
    };
    const daftarPayroll = payrollService.daftar(periode.bulan, periode.tahun);
    data.payroll = {
      periode,
      total: payrollService.rekap(daftarPayroll),
      jumlah: daftarPayroll.length,
      sudahDibayar: daftarPayroll.filter((p) => p.status === 'dibayar').length,
    };
  }

  // Ringkasan untuk Karyawan
  if (req.user.karyawanId) {
    data.absensiSaya = absensiService.getById(req.user.karyawanId, h.today());
    data.rekapSaya = absensiService.rekapKaryawan(req.user.karyawanId, periode.bulan, periode.tahun);
    const slip = payrollService.slipTersimpan(req.user.karyawanId, periode.bulan, periode.tahun);
    data.slipSaya = slip;
    data.payrollSaya = slip
      ? slip
      : payrollService.hitungSlip(
        db.db.get('SELECT * FROM karyawan WHERE id = ?', req.user.karyawanId),
        periode.bulan,
        periode.tahun,
      );
    data.riwayatAbsensiSaya = db.db.all(
      `SELECT * FROM absensi WHERE karyawan_id = ? ORDER BY tanggal DESC LIMIT 10`,
      req.user.karyawanId,
    );
  }

  // Aktivitas terbaru & keterlambatan
  data.aktivitas = db.db.all('SELECT * FROM audit_log ORDER BY created_at DESC, id DESC LIMIT 8');
  data.absensiTerlambat = db.db.all(
    `SELECT a.*, k.nama_lengkap, k.nip
       FROM absensi a JOIN karyawan k ON k.id = a.karyawan_id
      WHERE a.tanggal = ? AND a.jam_masuk IS NOT NULL AND a.status = 'hadir'
      ORDER BY a.jam_masuk ASC LIMIT 6`,
    h.today(),
  );

  res.render('dashboard/index', {
    title: 'Dashboard',
    subtitle: `Selamat datang, ${req.user.nama.split(' ')[0]} - ringkasan perusahaan ${h.date(h.today(), 'D MMMM YYYY')}`,
    data,
    crumbs: [],
  });
});

module.exports = router;
