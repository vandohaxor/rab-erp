'use strict';

const db = require('../config/database');
const h = require('../utils/helpers');

/** Pengaturan jam kerja aktif (jadwal default) - sumber kebenaran hitungan lembur. */
function getJadwal() {
  let jadwal = db.db.get('SELECT * FROM jadwal_kerja WHERE is_default = 1');
  if (!jadwal) jadwal = db.db.get('SELECT * FROM jadwal_kerja ORDER BY id LIMIT 1');
  if (!jadwal) {
    db.db.run(
      `INSERT INTO jadwal_kerja (nama, jam_masuk, jam_pulang, hari_kerja, toleransi_menit, is_default)
       VALUES (?, ?, ?, ?, ?, 1)`,
      'Jam Kerja Reguler', '08:00', '18:00', '1,2,3,4,5', 15,
    );
    jadwal = db.db.get('SELECT * FROM jadwal_kerja WHERE is_default = 1');
  }
  return {
    ...jadwal,
    jamMasuk: jadwal.jam_masuk,
    jamPulang: jadwal.jam_pulang,
    durasiNormal: h.timeToMinutes(jadwal.jam_pulang) - h.timeToMinutes(jadwal.jam_masuk),
    hariKerja: String(jadwal.hari_kerja || '1,2,3,4,5').split(',').map((n) => Number(n.trim())),
    toleransi: Number(jadwal.toleransi_menit || 0),
  };
}

function isHariKerja(tanggal, jadwal = getJadwal()) {
  return jadwal.hariKerja.includes(h.dayjs(tanggal).day());
}

/**
 * Hitung durasi kerja & lembur.
 * Lembur = durasi kerja nyata melebihi jam pulang jadwal kerja.
 * Break tidak dipotong otomatis untuk hari kerja normal.
 */
function hitungKerja(jamMasuk, jamPulang, jadwal = getJadwal()) {
  const mulai = h.timeToMinutes(jamMasuk);
  const selesai = h.timeToMinutes(jamPulang);
  if (mulai === null || selesai === null || selesai <= mulai) {
    return { durasiMenit: 0, menitLembur: 0 };
  }
  const durasiMenit = selesai - mulai;
  const menitLembur = Math.max(0, durasiMenit - Math.max(0, jadwal.durasiNormal));
  return { durasiMenit, menitLembur };
}

function getById(karyawanId, tanggal) {
  return db.db.get(
    'SELECT * FROM absensi WHERE karyawan_id = ? AND tanggal = ?',
    karyawanId,
    tanggal,
  );
}

/** Status absen yang boleh dipilih karyawan sendiri saat absen masuk. */
const STATUS_MANDIRI = ['hadir', 'izin', 'sakit'];

function sudahAbsen(karyawanId, tanggal = h.today()) {
  return Boolean(getById(karyawanId, tanggal));
}

/**
 * Absen masuk oleh karyawan sendiri.
 * opts: { tanggal, jam, status, keterangan, fotoPath, ip }
 * Hanya status 'hadir' yang mencatat jam masuk; izin/sakit tidak menambah jam kerja.
 */
function absenMasuk(karyawanId, opts = {}) {
  const tanggal = opts.tanggal || h.today();
  const jam = opts.jam || h.nowTime();
  const status = STATUS_MANDIRI.includes(opts.status) ? opts.status : 'hadir';
  const keterangan = opts.keterangan ? String(opts.keterangan).trim() : '';

  if (status !== 'hadir' && keterangan.length < 3) {
    throw Object.assign(new Error('Keterangan wajib diisi saat memilih izin atau sakit.'), { statusCode: 422 });
  }
  if (opts.fotoWajib && !opts.fotoPath) {
    throw Object.assign(new Error('Foto absensi wajib diunggah.'), { statusCode: 422 });
  }

  const karyawan = db.db.get('SELECT * FROM karyawan WHERE id = ?', karyawanId);
  if (!karyawan) throw Object.assign(new Error('Data karyawan tidak ditemukan.'), { statusCode: 404 });
  if (karyawan.status_karyawan !== 'aktif') {
    throw Object.assign(new Error('Absensi hanya dapat dilakukan karyawan dengan status aktif.'), { statusCode: 400 });
  }
  if (sudahAbsen(karyawanId, tanggal)) {
    throw Object.assign(new Error('Anda sudah melakukan absen hari ini.'), { statusCode: 409 });
  }

  db.db.run(
    `INSERT INTO absensi (karyawan_id, tanggal, jam_masuk, status, keterangan, foto_path, sumber, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, 'mandiri', ?)`,
    karyawanId,
    tanggal,
    status === 'hadir' ? jam : null,
    status,
    keterangan || null,
    opts.fotoPath || null,
    opts.ip || null,
  );

  const jadwal = getJadwal();
  if (status !== 'hadir') {
    return { status, terlambat: false, menitKeterlambatan: 0, jadwal };
  }

  const menitMasuk = h.timeToMinutes(jam);
  const batasMasuk = h.timeToMinutes(jadwal.jamMasuk) + jadwal.toleransi;
  return {
    status,
    terlambat: menitMasuk !== null && batasMasuk !== null && menitMasuk > batasMasuk,
    menitKeterlambatan: menitMasuk !== null && batasMasuk !== null ? Math.max(0, menitMasuk - batasMasuk) : 0,
    jadwal,
  };
}

/** Absen pulang -> hitung durasi + lembur otomatis. */
function absenPulang(karyawanId, opts = {}) {
  const tanggal = opts.tanggal || h.today();
  const jam = opts.jam || h.nowTime();

  const row = getById(karyawanId, tanggal);
  if (!row) throw Object.assign(new Error('Anda belum melakukan absen masuk hari ini.'), { statusCode: 400 });
  if (row.jam_pulang) throw Object.assign(new Error('Anda sudah melakukan absen pulang hari ini.'), { statusCode: 409 });
  if (!row.jam_masuk) {
    throw Object.assign(new Error('Absensi hari ini berstatus tidak hadir, tidak dapat absen pulang.'), { statusCode: 400 });
  }

  const jadwal = getJadwal();
  const { durasiMenit, menitLembur } = hitungKerja(row.jam_masuk, jam, jadwal);

  db.db.run(
    `UPDATE absensi
        SET jam_pulang = ?, durasi_menit = ?, menit_lembur = ?, ip_address = COALESCE(?, ip_address),
            updated_at = datetime('now','localtime')
      WHERE id = ?`,
    jam,
    durasiMenit,
    menitLembur,
    opts.ip || null,
    row.id,
  );

  return { ...getById(karyawanId, tanggal), menitLembur, jadwal };
}

/** Catat status selain hadir (izin/sakit/cuti/wfh) oleh atasan. */
function catatStatus(karyawanId, tanggal, status, keterangan = null, fotoPath = null) {
  const jadwal = getJadwal();
  const dihitung = status === 'hadir' || status === 'wfh';
  db.db.run(
    `INSERT INTO absensi (karyawan_id, tanggal, status, keterangan, foto_path, sumber, durasi_menit, menit_lembur)
     VALUES (?, ?, ?, ?, ?, 'atasan', ?, ?)
     ON CONFLICT (karyawan_id, tanggal) DO UPDATE SET
       status = excluded.status,
       keterangan = excluded.keterangan,
       sumber = 'atasan',
       updated_at = datetime('now','localtime')`,
    karyawanId,
    tanggal,
    status,
    keterangan,
    fotoPath,
    dihitung ? Math.max(0, jadwal.durasiNormal) : 0,
    0,
  );
  return getById(karyawanId, tanggal);
}

function hapus(id) {
  const row = db.db.get('SELECT foto_path FROM absensi WHERE id = ?', id);
  if (row?.foto_path) require('../config/upload').hapusFoto(row.foto_path);
  return db.db.run('DELETE FROM absensi WHERE id = ?', id).changes;
}

/** Rekap satu karyawan untuk satu periode (dipakai payroll & slip gaji). */
function rekapKaryawan(karyawanId, bulan, tahun) {
  const awal = `${tahun}-${String(bulan).padStart(2, '0')}-01`;
  const akhir = h.dayjs(awal).endOf('month').format('YYYY-MM-DD');

  const rows = db.db.all(
    'SELECT * FROM absensi WHERE karyawan_id = ? AND tanggal BETWEEN ? AND ? ORDER BY tanggal',
    karyawanId,
    awal,
    akhir,
  );

  const rekap = {
    hariHadir: 0,
    hariIzin: 0,
    hariSakit: 0,
    hariCuti: 0,
    hariAlpha: 0,
    hariWfh: 0,
    hariLibur: 0,
    hariTidakAbsen: 0,
    menitKerja: 0,
    menitLembur: 0,
    terlambat: 0,
    terlambatMenit: 0,
    data: rows,
  };

  for (const row of rows) {
    switch (row.status) {
      case 'hadir': rekap.hariHadir += 1; break;
      case 'izin': rekap.hariIzin += 1; break;
      case 'sakit': rekap.hariSakit += 1; break;
      case 'cuti': rekap.hariCuti += 1; break;
      case 'alpha': rekap.hariAlpha += 1; break;
      case 'wfh': rekap.hariWfh += 1; break;
      case 'hari_libur': rekap.hariLibur += 1; break;
      default: break;
    }
    rekap.menitKerja += Number(row.durasi_menit || 0);
    rekap.menitLembur += Number(row.menit_lembur || 0);
  }

  // Keterlambatan dihitung dari jam masuk vs jadwal.
  const jadwal = getJadwal();
  const batasMasuk = h.timeToMinutes(jadwal.jamMasuk) + jadwal.toleransi;
  for (const row of rows) {
    if (!row.jam_masuk || row.status !== 'hadir') continue;
    const m = h.timeToMinutes(row.jam_masuk);
    if (m !== null && batasMasuk !== null && m > batasMasuk) {
      rekap.terlambat += 1;
      rekap.terlambatMenit += m - batasMasuk;
    }
  }

  return rekap;
}

/** Rekap seluruh karyawan untuk satu periode (tabel rekap bulanan). */
function rekapPeriode(bulan, tahun) {
  const awal = `${tahun}-${String(bulan).padStart(2, '0')}-01`;
  const akhir = h.dayjs(awal).endOf('month').format('YYYY-MM-DD');

  return db.db.all(
    `SELECT k.id, k.nip, k.nama_lengkap, k.jabatan, k.gaji_pokok,
            k.tunjangan_transport, k.tunjangan_makan, k.tunjangan_lain,
            d.nama AS departemen,
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
       LEFT JOIN absensi a ON a.karyawan_id = k.id AND a.tanggal BETWEEN ? AND ?
      WHERE k.status_karyawan = 'aktif'
      GROUP BY k.id
      ORDER BY k.nama_lengkap`,
    awal,
    akhir,
  );
}

/** Rekap harian (untuk dashboard & absensi hari ini). */
function rekapHarian(tanggal = h.today()) {
  const row = db.db.get(
    `SELECT
        COUNT(*) AS total_karyawan,
        SUM(CASE WHEN a.status = 'hadir' THEN 1 ELSE 0 END) AS hadir,
        SUM(CASE WHEN a.status = 'izin'  THEN 1 ELSE 0 END) AS izin,
        SUM(CASE WHEN a.status = 'sakit' THEN 1 ELSE 0 END) AS sakit,
        SUM(CASE WHEN a.status = 'alpha' THEN 1 ELSE 0 END) AS alpha,
        SUM(CASE WHEN a.status = 'wfh'   THEN 1 ELSE 0 END) AS wfh,
        SUM(CASE WHEN a.id IS NOT NULL THEN 1 ELSE 0 END) AS sudah_absen_masuk,
        SUM(CASE WHEN a.jam_masuk IS NOT NULL AND a.jam_pulang IS NULL THEN 1 ELSE 0 END) AS belum_pulang,
        SUM(CASE WHEN a.jam_pulang IS NOT NULL THEN 1 ELSE 0 END) AS sudah_pulang,
        COALESCE(SUM(a.menit_lembur), 0) AS menit_lembur
       FROM karyawan k
       LEFT JOIN absensi a ON a.karyawan_id = k.id AND a.tanggal = ?
      WHERE k.status_karyawan = 'aktif'`,
    tanggal,
  );

  return {
    tanggal,
    totalKaryawan: Number(row?.total_karyawan || 0),
    hadir: Number(row?.hadir || 0),
    izin: Number(row?.izin || 0),
    sakit: Number(row?.sakit || 0),
    alpha: Number(row?.alpha || 0),
    wfh: Number(row?.wfh || 0),
    sudahAbsenMasuk: Number(row?.sudah_absen_masuk || 0),
    belumPulang: Number(row?.belum_pulang || 0),
    sudahPulang: Number(row?.sudah_pulang || 0),
    menitLembur: Number(row?.menit_lembur || 0),
    belumAbsen: Math.max(0, Number(row?.total_karyawan || 0) - Number(row?.sudah_absen_masuk || 0)),
  };
}

/** Tren kehadiran 14 hari terakhir untuk grafik dashboard. */
function trenKehadiran(hari = 14) {
  const rows = [];
  for (let i = hari - 1; i >= 0; i -= 1) {
    const tanggal = h.dayjs().subtract(i, 'day').format('YYYY-MM-DD');
    const r = rekapHarian(tanggal);
    rows.push({
      tanggal,
      label: h.dayjs(tanggal).format('DD/MM'),
      hadir: r.hadir,
      izin: r.izin,
      sakit: r.sakit,
      alpha: r.alpha,
      wfh: r.wfh,
    });
  }
  return rows;
}

module.exports = {
  getJadwal,
  isHariKerja,
  hitungKerja,
  getById,
  sudahAbsen,
  absenMasuk,
  absenPulang,
  catatStatus,
  hapus,
  rekapKaryawan,
  rekapPeriode,
  rekapHarian,
  trenKehadiran,
  STATUS_MANDIRI,
};
