'use strict';

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const db = require('../config/database');
const h = require('../utils/helpers');
const csv = require('../utils/csv');
const xls = require('../utils/excel');
const exportService = require('../services/export.service');
const { uploadFotoAbsensi, urlFoto, hapusFoto } = require('../config/upload');
const { requireAuth, requireModule, requireKaryawan } = require('../middleware/auth');
const { STATUS_ABSENSI } = require('../utils/constants');
const absensiService = require('../services/absensi.service');
const payrollService = require('../services/payroll.service');

const router = express.Router();
router.use(requireAuth);

function ambilFilter(req) {
  return {
    tanggal: req.query.tanggal || h.today(),
    tanggalMulai: req.query.tanggal_mulai || h.dayjs().startOf('month').format('YYYY-MM-DD'),
    tanggalSelesai: req.query.tanggal_selesai || h.today(),
    karyawanId: req.query.karyawan_id ? Number(req.query.karyawan_id) : null,
    departemenId: req.query.departemen_id ? Number(req.query.departemen_id) : null,
    status: req.query.status || '',
    q: req.query.q || '',
  };
}

/* ================= ABSENSI SAYA (KARYAWAN) ================= */
router.get('/saya', requireKaryawan, (req, res) => {
  const karyawanId = req.user.karyawanId;
  const hariIni = absensiService.getById(karyawanId, h.today());
  const jadwal = absensiService.getJadwal();
  const now = h.dayjs();

  const batas = h.timeToMinutes(jadwal.jamMasuk) + jadwal.toleransi;
  const menitSekarang = now.hour() * 60 + now.minute();
  const terlambat = hariIni?.jam_masuk
    ? Math.max(0, (h.timeToMinutes(hariIni.jam_masuk) || 0) - batas)
    : Math.max(0, menitSekarang - batas);

  const bulan = Number(req.query.bulan) || now.month() + 1;
  const tahun = Number(req.query.tahun) || now.year();
  const rekap = absensiService.rekapKaryawan(karyawanId, bulan, tahun);

  const riwayat = db.db.all(
    `SELECT * FROM absensi WHERE karyawan_id = ? ORDER BY tanggal DESC LIMIT 60`,
    karyawanId,
  );

  const karyawan = db.db.get('SELECT * FROM karyawan WHERE id = ?', karyawanId);
  const statusTerpilih = absensiService.STATUS_MANDIRI.includes(req.query.status) ? req.query.status : 'hadir';
  const fotoTerpilih = hariIni ? urlFoto(hariIni.foto_path) : null;

  res.render('absensi/saya', {
    title: 'Absensi Saya',
    subtitle: 'Absen masuk dengan foto, isi keterangan izin atau sakit, lalu pantau rekap Anda',
    crumbs: [{ label: 'Absensi Saya' }],
    hariIni,
    jadwal,
    rekap,
    riwayat,
    karyawan,
    terlambat,
    bulan,
    tahun,
    statusTerpilih,
    fotoTerpilih,
    hariKerjaBulanan: payrollService.getParameter().hariKerjaBulanan,
    actions: `<button class="btn btn-outline-secondary btn-sm" onclick="window.print()"><i class="bi bi-printer me-1"></i>Cetak Rekap</button>`,
  });
});

/** Validasi form absen mandiri. */
const aturanAbsenMasuk = [
  body('tanggal').isISO8601().withMessage('Tanggal tidak valid.'),
  body('jam').matches(/^\d{2}:\d{2}$/).withMessage('Jam tidak valid.'),
  body('status').isIn(absensiService.STATUS_MANDIRI).withMessage('Status absen tidak valid.'),
  body('keterangan').optional({ values: 'falsy' }).trim().isLength({ max: 250 }).withMessage('Keterangan terlalu panjang.'),
  body('keterangan').custom((value, { req }) => req.body.status === 'hadir' || String(value || '').trim().length >= 3)
    .withMessage('Keterangan wajib diisi saat memilih izin atau sakit.'),
];

router.post('/saya/masuk', requireKaryawan, uploadFotoAbsensi, aturanAbsenMasuk, (req, res) => {
  const fotoRelatif = req.file
    ? `uploads/absensi/${h.today()}/${req.file.filename}`
    : null;
  const bersihkanFoto = () => hapusFoto(fotoRelatif);

  try {
    const errors = validationResult(req);
    if (errors.isEmpty() && !req.file) {
      errors.addError({ path: 'foto', msg: 'Foto absensi wajib diunggah.' });
    }
    if (!errors.isEmpty()) throw Object.assign(new Error(errors.array()[0].msg), { statusCode: 422 });

    const hasil = absensiService.absenMasuk(req.user.karyawanId, {
      tanggal: req.body.tanggal || h.today(),
      jam: req.body.jam || h.nowTime(),
      status: req.body.status,
      keterangan: req.body.keterangan || '',
      fotoPath: fotoRelatif,
      fotoWajib: true,
      ip: req.clientIp,
    });
    req.audit(req, 'ABSEN_MASUK', 'absensi', req.user.karyawanId,
      `Absen ${hasil.status} pukul ${req.body.jam || h.nowTime()}`);

    const jamAbsen = req.body.jam || h.nowTime();
    if (hasil.status !== 'hadir') {
      req.session.flash = {
        type: 'info',
        message: `Absen ${STATUS_ABSENSI[hasil.status].label.toLowerCase()} tercatat. Keterangan Anda sudah terkirim ke HRD.`,
      };
    } else {
      req.session.flash = hasil.terlambat
        ? {
          type: 'warning',
          message: `Absen masuk tercatat pukul ${jamAbsen} - terlambat ${hasil.menitKeterlambatan} menit dari jadwal ${h.dotTime(hasil.jadwal.jamMasuk)}.`,
        }
        : { type: 'success', message: `Absen masuk berhasil dicatat pukul ${jamAbsen}.` };
    }
    return res.redirect('/absensi/saya');
  } catch (error) {
    bersihkanFoto();
    req.session.flash = { type: 'danger', message: error.message };
    return res.redirect('/absensi/saya');
  }
});

router.post('/saya/pulang', requireKaryawan, (req, res) => {
  try {
    const hasil = absensiService.absenPulang(req.user.karyawanId, {
      tanggal: req.body.tanggal || h.today(),
      jam: req.body.jam || h.nowTime(),
      ip: req.clientIp,
    });
    req.audit(req, 'ABSEN_PULANG', 'absensi', req.user.karyawanId, `Absen pulang pukul ${req.body.jam || h.nowTime()}, lembur ${hasil.menitLembur} menit`);

    req.session.flash = {
      type: 'success',
      message: hasil.menitLembur > 0
        ? `Absen pulang pukul ${req.body.jam || h.nowTime()}. Lembur tercatat ${h.duration(hasil.menitLembur)} dan akan masuk perhitungan gaji.`
        : `Absen pulang berhasil dicatat pukul ${req.body.jam || h.nowTime()}.`,
    };
    return res.redirect('/absensi/saya');
  } catch (error) {
    req.session.flash = { type: 'danger', message: error.message };
    return res.redirect('/absensi/saya');
  }
});

/* ================= REKAP BULANAN ================= */router.get('/rekap', requireModule('absensi'), [
  query('bulan').optional().isInt({ min: 1, max: 12 }),
  query('tahun').optional().isInt({ min: 2000, max: 2100 }),
], (req, res) => {
  const now = h.dayjs();
  const bulan = Number(req.query.bulan) || now.month() + 1;
  const tahun = Number(req.query.tahun) || now.year();

  const rekap = absensiService.rekapPeriode(bulan, tahun);
  const total = rekap.reduce((acc, r) => ({
    hadir: acc.hadir + Number(r.hari_hadir),
    izin: acc.izin + Number(r.hari_izin),
    sakit: acc.sakit + Number(r.hari_sakit),
    cuti: acc.cuti + Number(r.hari_cuti),
    wfh: acc.wfh + Number(r.hari_wfh),
    menitLembur: acc.menitLembur + Number(r.menit_lembur),
  }), { hadir: 0, izin: 0, sakit: 0, cuti: 0, wfh: 0, menitLembur: 0 });

  res.render('absensi/rekap', {
    title: 'Rekap Kehadiran Bulanan',
    subtitle: `Rekap absensi seluruh karyawan ${h.monthName(bulan)} ${tahun}`,
    crumbs: [{ label: 'Absensi', href: '/absensi' }, { label: 'Rekap Bulanan' }],
    rekap,
    total,
    bulan,
    tahun,
    actions: `
      <a href="/absensi/export/rekap?bulan=${bulan}&tahun=${tahun}" class="btn btn-success btn-sm">
        <i class="bi bi-file-earmark-excel me-1"></i>Excel Rekap Bulanan
      </a>
      <a href="/absensi/export/lembur?bulan=${bulan}&tahun=${tahun}" class="btn btn-success btn-sm">
        <i class="bi bi-clock-history me-1"></i>Excel Rekap Lembur
      </a>
      <a href="/laporan/absensi?bulan=${bulan}&tahun=${tahun}" class="btn btn-outline-primary btn-sm">
        <i class="bi bi-file-earmark-spreadsheet me-1"></i>Laporan Lengkap
      </a>
      <button class="btn btn-outline-secondary btn-sm" onclick="window.print()">
        <i class="bi bi-printer me-1"></i>Cetak
      </button>`,
  });
});

/* ================= KELOLA ABSENSI (ATASAN) ================= */
router.get('/', requireModule('absensi'), (req, res) => {
  const filter = ambilFilter(req);
  const jadwal = absensiService.getJadwal();

  const karyawan = db.db.all(
    `SELECT k.id, k.nip, k.nama_lengkap, k.jabatan, d.nama AS departemen,
            a.id AS absensi_id, a.jam_masuk, a.jam_pulang, a.durasi_menit, a.menit_lembur,
            a.status, a.keterangan, a.foto_path, a.sumber, a.ip_address
       FROM karyawan k
       LEFT JOIN departemen d ON d.id = k.departemen_id
       LEFT JOIN absensi a ON a.karyawan_id = k.id AND a.tanggal = ?
      WHERE k.status_karyawan = 'aktif'
        ${filter.q ? 'AND (k.nama_lengkap LIKE ? OR k.nip LIKE ?)' : ''}
        ${filter.departemenId ? 'AND k.departemen_id = ?' : ''}
      ORDER BY k.nama_lengkap`,
    filter.tanggal,
    ...(filter.q ? [`%${filter.q}%`, `%${filter.q}%`] : []),
    ...(filter.departemenId ? [filter.departemenId] : []),
  ).map((k) => ({ ...k, fotoUrl: urlFoto(k.foto_path) }));

  const rekap = absensiService.rekapHarian(filter.tanggal);
  const belum = karyawan.filter((k) => !k.absensi_id);
  const sudahMasukBelumPulang = karyawan.filter((k) => k.jam_masuk && !k.jam_pulang);
  const denganFoto = karyawan.filter((k) => k.fotoUrl).length;

  res.render('absensi/index', {
    title: 'Kelola Absensi',
    subtitle: `Monitoring dan pencatatan absensi ${h.dayName(filter.tanggal)}, ${h.date(filter.tanggal, 'D MMMM YYYY')}`,
    crumbs: [{ label: 'Absensi' }],
    karyawan,
    belum,
    sudahMasukBelumPulang,
    denganFoto,
    rekap,
    jadwal,
    filter,
    departemen: db.db.all('SELECT * FROM departemen ORDER BY nama'),
    actions: `
      <a href="/absensi/export/harian?tanggal=${filter.tanggal}${filter.departemenId ? `&departemen_id=${filter.departemenId}` : ''}${filter.q ? `&q=${encodeURIComponent(filter.q)}` : ''}"
         class="btn btn-success btn-sm">
        <i class="bi bi-file-earmark-excel me-1"></i>Excel Harian
      </a>
      <a href="/absensi/rekap" class="btn btn-outline-primary btn-sm">
        <i class="bi bi-calendar2-week me-1"></i>Rekap Bulanan
      </a>
      <button class="btn btn-outline-secondary btn-sm" onclick="window.print()">
        <i class="bi bi-printer me-1"></i>Cetak
      </button>`,
  });
});

/* Catat status manual (izin/sakit/cuti/wfh) */
router.post('/catat', requireModule('absensi'), [
  body('karyawan_id').isInt({ min: 1 }).withMessage('Karyawan tidak valid.'),
  body('tanggal').isISO8601().withMessage('Tanggal tidak valid.'),
  body('status').isIn(Object.keys(STATUS_ABSENSI)).withMessage('Status tidak valid.'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.session.flash = { type: 'danger', message: errors.array()[0].msg };
    return res.redirect(`/absensi?tanggal=${req.body.tanggal || h.today()}`);
  }

  try {
    const nama = db.db.pluck('SELECT nama_lengkap FROM karyawan WHERE id = ?', Number(req.body.karyawan_id));
    absensiService.catatStatus(
      Number(req.body.karyawan_id),
      req.body.tanggal,
      req.body.status,
      req.body.keterangan || null,
    );
    req.audit(req, 'CATAT_ABSENSI', 'absensi', req.body.karyawan_id,
      `${nama} -> ${req.body.status} pada ${req.body.tanggal}`);
    req.session.flash = { type: 'success', message: `Absensi ${nama} tercatat sebagai ${STATUS_ABSENSI[req.body.status].label}.` };
    return res.redirect(`/absensi?tanggal=${req.body.tanggal}`);
  } catch (error) {
    req.session.flash = { type: 'danger', message: error.message };
    return res.redirect(`/absensi?tanggal=${req.body.tanggal || h.today()}`);
  }
});

/* Absen manual oleh atasan */
router.post('/manual', requireModule('absensi'), [
  body('karyawan_id').isInt({ min: 1 }).withMessage('Karyawan tidak valid.'),
  body('tanggal').isISO8601().withMessage('Tanggal tidak valid.'),
  body('jam_masuk').matches(/^\d{2}:\d{2}$/).withMessage('Jam masuk tidak valid.'),
  body('jam_pulang').optional({ values: 'falsy' }).matches(/^\d{2}:\d{2}$/).withMessage('Jam pulang tidak valid.'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.session.flash = { type: 'danger', message: errors.array()[0].msg };
    return res.redirect(`/absensi?tanggal=${req.body.tanggal || h.today()}`);
  }

  const karyawanId = Number(req.body.karyawan_id);
  const nama = db.db.pluck('SELECT nama_lengkap FROM karyawan WHERE id = ?', karyawanId);
  const jadwal = absensiService.getJadwal();

  try {
    db.db.transaction(() => {
      absensiService.catatStatus(karyawanId, req.body.tanggal, 'hadir', req.body.keterangan || 'Pencatatan manual oleh atasan');
      if (req.body.jam_pulang) {
        const { durasiMenit, menitLembur } = absensiService.hitungKerja(req.body.jam_masuk, req.body.jam_pulang, jadwal);
        db.db.run(
          `UPDATE absensi SET jam_masuk = ?, jam_pulang = ?, durasi_menit = ?, menit_lembur = ?,
                  updated_at = datetime('now','localtime')
            WHERE karyawan_id = ? AND tanggal = ?`,
          req.body.jam_masuk, req.body.jam_pulang, durasiMenit, menitLembur, karyawanId, req.body.tanggal,
        );
      } else {
        db.db.run(
          "UPDATE absensi SET jam_masuk = ?, updated_at = datetime('now','localtime') WHERE karyawan_id = ? AND tanggal = ?",
          req.body.jam_masuk, karyawanId, req.body.tanggal,
        );
      }
    });

    req.audit(req, 'ABSEN_MANUAL', 'absensi', karyawanId,
      `Absen manual ${nama}: ${req.body.jam_masuk} - ${req.body.jam_pulang || 'belum pulang'} pada ${req.body.tanggal}`);
    req.session.flash = { type: 'success', message: `Absensi ${nama} berhasil dicatat manual.` };
    return res.redirect(`/absensi?tanggal=${req.body.tanggal}`);
  } catch (error) {
    req.session.flash = { type: 'danger', message: error.message };
    return res.redirect(`/absensi?tanggal=${req.body.tanggal}`);
  }
});

router.delete('/:id', requireModule('absensi'), (req, res) => {
  const id = Number(req.params.id);
  const row = db.db.get(
    `SELECT a.*, k.nama_lengkap FROM absensi a JOIN karyawan k ON k.id = a.karyawan_id WHERE a.id = ?`,
    id,
  );
  if (!row) return res.redirect('/absensi');

  absensiService.hapus(id);
  req.audit(req, 'HAPUS_ABSENSI', 'absensi', id, `Hapus absensi ${row.nama_lengkap} tanggal ${row.tanggal}`);
  req.session.flash = { type: 'success', message: `Absensi ${row.nama_lengkap} tanggal ${h.date(row.tanggal)} dihapus.` };
  return res.redirect(`/absensi?tanggal=${row.tanggal}`);
});


/* ================= EXPORT EXCEL (.xlsx) ================= */

/** Query detail absensi sesuai filter; dipakai oleh semua export. */
function queryAbsensi({ tanggal, dari, sampai, status, departemenId }) {
  const syarat = [];
  const arg = [];
  if (tanggal) { syarat.push('a.tanggal = ?'); arg.push(tanggal); }
  if (dari && sampai) { syarat.push('a.tanggal BETWEEN ? AND ?'); arg.push(dari, sampai); }
  if (status) { syarat.push('a.status = ?'); arg.push(status); }
  if (departemenId) { syarat.push('k.departemen_id = ?'); arg.push(departemenId); }
  return db.db.all(
    `SELECT k.id AS karyawan_id, k.nip, k.nama_lengkap, k.jabatan, d.nama AS departemen,
            a.tanggal, a.jam_masuk, a.jam_pulang, a.durasi_menit, a.menit_lembur,
            a.status, a.keterangan, a.foto_path, a.sumber, a.ip_address
       FROM absensi a
       JOIN karyawan k ON k.id = a.karyawan_id
       LEFT JOIN departemen d ON d.id = k.departemen_id
      ${syarat.length ? `WHERE ${syarat.join(' AND ')}` : ''}
      ORDER BY a.tanggal, k.nama_lengkap`,
    ...arg,
  );
}

/** Rekap kehadiran per karyawan untuk rentang tanggal bebas (mengikuti filter status). */
function rekapExport(dari, sampai, status) {
  return db.db.all(
    `SELECT k.id, k.nip, k.nama_lengkap, k.jabatan, d.nama AS departemen,
            COALESCE(SUM(CASE WHEN a.status = 'hadir' THEN 1 ELSE 0 END), 0) AS hari_hadir,
            COALESCE(SUM(CASE WHEN a.status = 'izin'  THEN 1 ELSE 0 END), 0) AS hari_izin,
            COALESCE(SUM(CASE WHEN a.status = 'sakit' THEN 1 ELSE 0 END), 0) AS hari_sakit,
            COALESCE(SUM(CASE WHEN a.status = 'cuti'  THEN 1 ELSE 0 END), 0) AS hari_cuti,
            COALESCE(SUM(CASE WHEN a.status = 'alpha' THEN 1 ELSE 0 END), 0) AS hari_alpha,
            COALESCE(SUM(CASE WHEN a.status = 'wfh'   THEN 1 ELSE 0 END), 0) AS hari_wfh,
            COALESCE(SUM(a.durasi_menit), 0) AS menit_kerja,
            COALESCE(SUM(a.menit_lembur), 0) AS menit_lembur
       FROM karyawan k
       LEFT JOIN departemen d ON d.id = k.departemen_id
       LEFT JOIN absensi a
              ON a.karyawan_id = k.id
             AND a.tanggal BETWEEN ? AND ?
             ${status ? 'AND a.status = ?' : ''}
      WHERE k.status_karyawan = 'aktif'
      GROUP BY k.id
      ORDER BY k.nama_lengkap`,
    dari, sampai, ...(status ? [status] : []),
  );
}

/** Absensi satu hari (mengikuti filter halaman Kelola Absensi). */
router.get('/export/harian', requireModule('absensi'), async (req, res, next) => {
  try {
    const filter = ambilFilter(req);
    const rows = db.db.all(
      `SELECT k.id AS karyawan_id, k.nip, k.nama_lengkap, k.jabatan, d.nama AS departemen,
              a.tanggal, a.jam_masuk, a.jam_pulang, a.durasi_menit, a.menit_lembur,
              a.status, a.keterangan, a.foto_path, a.sumber, a.ip_address
         FROM absensi a
         JOIN karyawan k ON k.id = a.karyawan_id
         LEFT JOIN departemen d ON d.id = k.departemen_id
        WHERE a.tanggal = ?
          ${filter.status ? 'AND a.status = ?' : ''}
          ${filter.departemenId ? 'AND k.departemen_id = ?' : ''}
          ${filter.q ? 'AND (k.nama_lengkap LIKE ? OR k.nip LIKE ?)' : ''}
        ORDER BY k.nama_lengkap`,
      filter.tanggal,
      ...(filter.status ? [filter.status] : []),
      ...(filter.departemenId ? [filter.departemenId] : []),
      ...(filter.q ? [`%${filter.q}%`, `%${filter.q}%`] : []),
    );

    req.audit(req, 'EXPORT_ABSENSI', 'absensi', filter.tanggal,
      `Export Excel absensi harian ${filter.tanggal} (${rows.length} baris)`);

    const L = exportService.absensiHarian({
      rows,
      tanggal: filter.tanggal,
      jadwal: absensiService.getJadwal(),
      filter: filter.status ? `Status: ${filter.status}` : '',
      user: req.user,
      perusahaan: res.locals.company,
    });
    return await L.kirim(res, xls.filename('absensi-harian', h.dayjs(filter.tanggal).format('YYYY-MM-DD')));
  } catch (error) {
    return next(error);
  }
});

/** Rekap bulanan: rekap karyawan + rincian harian + rekap lembur. */
router.get('/export/rekap', requireModule('absensi'), [
  query('bulan').optional().isInt({ min: 1, max: 12 }),
  query('tahun').optional().isInt({ min: 2000, max: 2100 }),
], async (req, res, next) => {
  try {
    const now = h.dayjs();
    const bulan = Number(req.query.bulan) || now.month() + 1;
    const tahun = Number(req.query.tahun) || now.year();
    const awal = `${tahun}-${String(bulan).padStart(2, '0')}-01`;
    const akhir = h.dayjs(awal).endOf('month').format('YYYY-MM-DD');

    const rekap = rekapExport(awal, akhir, req.query.status);
    const detail = queryAbsensi({ dari: awal, sampai: akhir, status: req.query.status, departemenId: req.query.departemen_id });

    req.audit(req, 'EXPORT_ABSENSI', 'absensi', `${tahun}-${bulan}`,
      `Export Excel rekap absensi ${h.monthName(bulan)} ${tahun} (${rekap.length} karyawan, ${detail.length} catatan)`);

    const L = exportService.absensiRekap({
      bulan, tahun, rekap, detail,
      jadwal: absensiService.getJadwal(),
      user: req.user,
      perusahaan: res.locals.company,
    });
    return await L.kirim(res, `absensi-rekap-${tahun}-${String(bulan).padStart(2, '0')}.xlsx`);
  } catch (error) {
    return next(error);
  }
});

/** Absensi periode bebas: rekap + rincian + lembur. */
router.get('/export/periode', requireModule('absensi'), [
  query('tanggal_mulai').isISO8601().withMessage('Tanggal mulai tidak valid.'),
  query('tanggal_selesai').isISO8601().withMessage('Tanggal selesai tidak valid.'),
], async (req, res, next) => {
  try {
    const dari = req.query.tanggal_mulai;
    const sampai = req.query.tanggal_selesai;
    const rows = queryAbsensi({
      dari, sampai, status: req.query.status, departemenId: req.query.departemen_id,
    });
    const rekap = rekapExport(dari, sampai, req.query.status);

    req.audit(req, 'EXPORT_ABSENSI', 'absensi', `${dari}..${sampai}`,
      `Export Excel absensi periode ${dari} s.d. ${sampai} (${rows.length} baris)`);

    const L = exportService.absensiPeriode({
      dari, sampai, rows, rekap,
      jadwal: absensiService.getJadwal(),
      user: req.user,
      perusahaan: res.locals.company,
    });
    return await L.kirim(res, `absensi-periode-${dari}_sd_${sampai}.xlsx`);
  } catch (error) {
    return next(error);
  }
});

/** Rekap lembur (jam lembur per karyawan). */
router.get('/export/lembur', requireModule('absensi'), [
  query('bulan').optional().isInt({ min: 1, max: 12 }),
  query('tahun').optional().isInt({ min: 2000, max: 2100 }),
], async (req, res, next) => {
  try {
    const now = h.dayjs();
    const bulan = Number(req.query.bulan) || now.month() + 1;
    const tahun = Number(req.query.tahun) || now.year();
    const awal = `${tahun}-${String(bulan).padStart(2, '0')}-01`;
    const akhir = h.dayjs(awal).endOf('month').format('YYYY-MM-DD');

    const rows = queryAbsensi({ dari: awal, sampai: akhir, status: 'hadir' });
    const rekap = rekapExport(awal, akhir, null);

    req.audit(req, 'EXPORT_ABSENSI', 'absensi', `lembur-${tahun}-${bulan}`,
      `Export Excel rekap lembur ${h.monthName(bulan)} ${tahun}`);

    const L = exportService.absensiLembur({
      bulan, tahun, rows, rekap, user: req.user, perusahaan: res.locals.company,
    });
    return await L.kirim(res, `lembur-${tahun}-${String(bulan).padStart(2, '0')}.xlsx`);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
