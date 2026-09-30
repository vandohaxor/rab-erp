'use strict';

const express = require('express');
const db = require('../config/database');
const h = require('../utils/helpers');
const { requireAuth, requireModule } = require('../middleware/auth');
const absensiService = require('../services/absensi.service');
const keuanganService = require('../services/keuangan.service');
const payrollService = require('../services/payroll.service');
const settingsService = require('../services/settings.service');

const router = express.Router();
router.use(requireAuth, requireModule('laporan'));

function periode(req) {
  const now = h.dayjs();
  return {
    bulan: Math.min(12, Math.max(1, Number(req.query.bulan) || now.month() + 1)),
    tahun: Number(req.query.tahun) || now.year(),
  };
}

router.get('/', (req, res) => {
  res.render('laporan/index', {
    title: 'Pusat Laporan',
    subtitle: 'Berbagai laporan operasional, kepegawaian, dan keuangan perusahaan',
    crumbs: [{ label: 'Laporan' }],
  });
});

/* Laporan absensi */
router.get('/absensi', (req, res) => {
  const p = periode(req);
  const rekap = absensiService.rekapPeriode(p.bulan, p.tahun);
  const total = rekap.reduce((acc, r) => ({
    hadir: acc.hadir + Number(r.hari_hadir),
    izin: acc.izin + Number(r.hari_izin),
    sakit: acc.sakit + Number(r.hari_sakit),
    alpha: acc.alpha + Number(r.hari_alpha),
    menitLembur: acc.menitLembur + Number(r.menit_lembur),
  }), { hadir: 0, izin: 0, sakit: 0, alpha: 0, menitLembur: 0 });

  res.render('laporan/absensi', {
    title: 'Laporan Absensi',
    subtitle: `Rekap kehadiran karyawan ${h.monthName(p.bulan)} ${p.tahun}`,
    crumbs: [{ label: 'Laporan', href: '/laporan' }, { label: 'Absensi' }],
    rekap,
    total,
    periode: p,
    jadwal: absensiService.getJadwal(),
  });
});

/* Laporan payroll */
router.get('/payroll', (req, res) => {
  const p = periode(req);
  const daftar = payrollService.daftar(p.bulan, p.tahun);
  const total = payrollService.rekap(daftar);

  res.render('laporan/payroll', {
    title: 'Laporan Penggajian',
    subtitle: `Daftar gaji karyawan ${h.monthName(p.bulan)} ${p.tahun}`,
    crumbs: [{ label: 'Laporan', href: '/laporan' }, { label: 'Payroll' }],
    daftar,
    total,
    periode: p,
    param: payrollService.getParameter(),
  });
});

/* Laporan keuangan */
router.get('/keuangan', (req, res) => {
  const tanggalMulai = req.query.tanggal_mulai || h.dayjs().startOf('month').format('YYYY-MM-DD');
  const tanggalSelesai = req.query.tanggal_selesai || h.today();

  res.render('laporan/keuangan', {
    title: 'Laporan Keuangan',
    subtitle: `Laba rugi dan arus kas ${h.date(tanggalMulai)} s.d. ${h.date(tanggalSelesai)}`,
    crumbs: [{ label: 'Laporan', href: '/laporan' }, { label: 'Keuangan' }],
    tanggalMulai,
    tanggalSelesai,
    rekap: keuanganService.rekap(tanggalMulai, tanggalSelesai),
    perKategoriMasuk: keuanganService.perKategori(tanggalMulai, tanggalSelesai, 'pemasukan'),
    perKategoriKeluar: keuanganService.perKategori(tanggalMulai, tanggalSelesai, 'pengeluaran'),
    arusKas: keuanganService.arusKas(tanggalMulai, tanggalSelesai),
  });
});

/* Laporan karyawan */
router.get('/karyawan', (req, res) => {
  const status = req.query.status || 'aktif';
  const rows = db.db.all(
    `SELECT k.*, d.nama AS departemen FROM karyawan k
       LEFT JOIN departemen d ON d.id = k.departemen_id
      WHERE (? = 'semua' OR k.status_karyawan = ?)
      ORDER BY k.nama_lengkap`,
    status, status,
  );

  const total = rows.reduce((acc, r) => acc + Number(r.gaji_pokok) + Number(r.tunjangan_transport)
    + Number(r.tunjangan_makan) + Number(r.tunjangan_lain), 0);

  res.render('laporan/karyawan', {
    title: 'Laporan Karyawan',
    subtitle: `Daftar karyawan ${status === 'semua' ? 'seluruhnya' : STATUS_KARYAWAN[status].label.toLowerCase()}`,
    crumbs: [{ label: 'Laporan', href: '/laporan' }, { label: 'Karyawan' }],
    rows,
    total,
    status,
  });
});

/* Rekap lembur seluruh karyawan */
router.get('/lembur', (req, res) => {
  const p = periode(req);
  const rows = payrollService.preview(p.bulan, p.tahun)
    .filter((s) => s.menit_lembur > 0)
    .sort((a, b) => b.menit_lembur - a.menit_lembur);

  const totalMenit = rows.reduce((a, r) => a + r.menit_lembur, 0);
  const totalNilai = rows.reduce((a, r) => a + r.nilai_lembur, 0);
  const param = payrollService.getParameter();

  res.render('laporan/lembur', {
    title: 'Laporan Lembur',
    subtitle: `Rekap lembur karyawan ${h.monthName(p.bulan)} ${p.tahun}`,
    crumbs: [{ label: 'Laporan', href: '/laporan' }, { label: 'Lembur' }],
    rows,
    totalMenit,
    totalNilai,
    periode: p,
    param,
    jadwal: absensiService.getJadwal(),
  });
});

/* Ringkasan perusahaan */
router.get('/perusahaan', (req, res) => {
  const p = periode(req);
  const employees = db.db.all("SELECT * FROM karyawan WHERE status_karyawan = 'aktif'");
  const genders = employees.reduce(
    (acc, k) => { acc[k.jenis_kelamin === 'P' ? 'wanita' : 'pria'] += 1; return acc; },
    { pria: 0, wanita: 0 },
  );

  const perDepartemen = db.db.all(
    `SELECT d.nama AS departemen, COUNT(k.id) AS jumlah,
            COALESCE(SUM(k.gaji_pokok + k.tunjangan_transport + k.tunjangan_makan + k.tunjangan_lain), 0) AS payroll
       FROM departemen d
       LEFT JOIN karyawan k ON k.departemen_id = d.id AND k.status_karyawan = 'aktif'
      GROUP BY d.id ORDER BY jumlah DESC`,
  );

  const tanggalMulai = `${p.tahun}-01-01`;
  const tanggalSelesai = `${p.tahun}-12-31`;
  const keuangan = keuanganService.rekap(tanggalMulai, tanggalSelesai);
  const payroll = payrollService.daftar(p.bulan, p.tahun);
  const rekapPayroll = payrollService.rekap(payroll);
  const absensi = absensiService.rekapPeriode(p.bulan, p.tahun);
  const totalLembur = absensi.reduce((a, r) => a + Number(r.menit_lembur), 0);

  res.render('laporan/perusahaan', {
    title: 'Ringkasan Perusahaan',
    subtitle: `Ikhtisar perusahaan tahun ${p.tahun}`,
    crumbs: [{ label: 'Laporan', href: '/laporan' }, { label: 'Ringkasan' }],
    employees,
    genders,
    perDepartemen,
    keuangan,
    rekapPayroll,
    totalLembur,
    periode: p,
    company: settingsService.perusahaan(),
    jadwal: absensiService.getJadwal(),
  });
});

module.exports = router;
