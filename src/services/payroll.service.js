'use strict';

const db = require('../config/database');
const h = require('../utils/helpers');
const absensiService = require('./absensi.service');

/** Parameter perhitungan payroll - dapat diubah Superadmin lewat halaman Pengaturan. */
function getParameter() {
  const rows = db.db.all("SELECT key, value FROM settings WHERE key LIKE 'payroll.%'");
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const num = (key, fallback) => (map[key] === undefined || map[key] === '' ? fallback : Number(map[key]));

  return {
    hariKerjaBulanan: num('payroll.hari_kerja_bulanan', 22),
    jamKerjaHarian: num('payroll.jam_kerja_harian', 8),
    faktorLembur: num('payroll.faktor_lembur', 1.5),
    persenPotonganBpjs: num('payroll.persen_bpjs', 0),
    persenTunjanganHadir: num('payroll.persen_tunjangan_hadir', 0),
    hariLiburNational: num('payroll.hari_libur', 0),
    /** Rata-rata tarif dasar lembur dari karyawan aktif, untuk ditampilkan di laporan. */
    dasarLemburPerJam: Math.round(rataDasarLembur(num('payroll.hari_kerja_bulanan', 22), num('payroll.jam_kerja_harian', 8))),
  };
}

function rataDasarLembur(hariKerja, jamKerja) {
  const baris = db.db.all(
    "SELECT gaji_pokok, tunjangan_lain FROM karyawan WHERE status_karyawan = 'aktif'",
  );
  if (!baris.length || hariKerja <= 0 || jamKerja <= 0) return 0;
  const total = baris.reduce(
    (acc, k) => acc + (Number(k.gaji_pokok || 0) + Number(k.tunjangan_lain || 0)) / (hariKerja * jamKerja),
    0,
  );
  return total / baris.length;
}

/**
 * Susun slip gaji satu karyawan untuk satu periode.
 * Sumber data: karyawan (komponen gaji) + absensi (hadir/izin/lembur).
 */
function hitungSlip(karyawan, bulan, tahun, opsi = {}) {
  const param = getParameter();
  const rekap = absensiService.rekapKaryawan(karyawan.id, bulan, tahun);

  const hariKerja = param.hariKerjaBulanan;
  const hariEfektifHadir = rekap.hariHadir + rekap.hariWfh;

  // Gaji harian = gaji pokok / hari kerja efektif (dibulatkan ke rupiah terdekat)
  const gajiPerHari = hariKerja > 0 ? Math.round(Number(karyawan.gaji_pokok || 0) / hariKerja) : 0;

  // Potongan absensi: izin & sakit tidak dibayar, alpha potong 2x (dis-regulated)
  const hariTidakDibayar = rekap.hariIzin + rekap.hariSakit + rekap.hariCuti + rekap.hariAlpha;
  const potonganAbsensi = hariTidakDibayar * gajiPerHari;
  const bonusAlpha = rekap.hariAlpha * gajiPerHari;

  // Tunjangan harian prorata hadir
  const tunjanganHarian = Number(karyawan.tunjangan_transport || 0) + Number(karyawan.tunjangan_makan || 0);
  const totalTunjangan = Math.round(tunjanganHarian * hariEfektifHadir * (1 + param.persenTunjanganHadir / 100));

  // Nilai lembur: (gaji pokok + tunjangan tetap) / (hari kerja x jam kerja) x 1.5 x jam lembur
  const tunjanganTetap = Number(karyawan.tunjangan_lain || 0);
  const dasarLembur = (Number(karyawan.gaji_pokok || 0) + tunjanganTetap) / (hariKerja * param.jamKerjaHarian);
  const nilaiLembur = Math.round(dasarLembur * param.faktorLembur * (rekap.menitLembur / 60));

  const bonus = Number(opsi.bonus || 0);
  const kasbon = Number(opsi.kasbon || 0);
  const potonganLain = Number(opsi.potongan_lain || 0);

  const totalPendapatan = Math.max(
    0,
    Number(karyawan.gaji_pokok || 0) - potonganAbsensi + bonusAlpha + totalTunjangan + nilaiLembur + bonus,
  );
  const totalPotongan = potonganAbsensi + kasbon + potonganLain
    + Math.round((totalPendapatan * param.persenPotonganBpjs) / 100);
  const gajiBersih = Math.max(0, totalPendapatan - totalPotongan);

  return {
    karyawan_id: karyawan.id,
    nip: karyawan.nip,
    nama_lengkap: karyawan.nama_lengkap,
    jabatan: karyawan.jabatan,
    departemen: karyawan.departemen || null,
    bulan,
    tahun,
    periode: `${h.monthName(bulan)} ${tahun}`,
    hari_kerja: hariKerja,
    hari_hadir: rekap.hariHadir,
    hari_izin: rekap.hariIzin,
    hari_sakit: rekap.hariSakit,
    hari_alpha: rekap.hariAlpha,
    hari_cuti: rekap.hariCuti,
    hari_wfh: rekap.hariWfh,
    hari_tidak_dibayar: hariTidakDibayar,
    menit_lembur: rekap.menitLembur,
    jam_lembur: Number((rekap.menitLembur / 60).toFixed(2)),
    menit_kerja: rekap.menitKerja,
    terlambat_hari: rekap.terlambat,
    gaji_pokok: Number(karyawan.gaji_pokok || 0),
    gaji_per_hari: gajiPerHari,
    tunjangan_harian: tunjanganHarian,
    bonus_alpha: bonusAlpha,
    total_tunjangan: totalTunjangan,
    dasar_lembur: Math.round(dasarLembur),
    nilai_lembur: nilaiLembur,
    bonus,
    kasbon,
    potongan_lain: potonganLain,
    potongan_absensi: potonganAbsensi,
    persen_bpjs: param.persenPotonganBpjs,
    total_pendapatan: totalPendapatan,
    total_potongan: totalPotongan,
    gaji_bersih: gajiBersih,
  };
}

/** Semua karyawan aktif untuk periode tertentu. */
function karyawanPeriode(bulan, tahun) {
  const akhirBulan = new Date(tahun, bulan, 0).getDate();
  const batasMasuk = `${tahun}-${String(bulan).padStart(2, '0')}-${String(akhirBulan).padStart(2, '0')}`;

  return db.db.all(
    `SELECT k.*, d.nama AS departemen
       FROM karyawan k
       LEFT JOIN departemen d ON d.id = k.departemen_id
      WHERE k.status_karyawan = 'aktif' AND k.tanggal_masuk <= ?
      ORDER BY k.nama_lengkap`,
    batasMasuk,
  );
}

/** Perhitungan payroll untuk seluruh karyawan tanpa menyimpan. */
function preview(bulan, tahun, opsi = {}) {
  return karyawanPeriode(bulan, tahun).map((k) => hitungSlip(k, bulan, tahun, opsi));
}

function slipTersimpan(karyawanId, bulan, tahun) {
  return db.db.get(
    'SELECT * FROM payroll WHERE karyawan_id = ? AND bulan = ? AND tahun = ?',
    karyawanId,
    bulan,
    tahun,
  );
}

/** Buat/refresh draft payroll untuk satu karyawan. Opsi taken dari input form. */
function simpan(karyawan, bulan, tahun, opsi = {}) {
  const slip = hitungSlip(karyawan, bulan, tahun, opsi);
  const status = opsi.status || 'draft';

  db.db.run(
    `INSERT INTO payroll (
       bulan, tahun, karyawan_id, hari_kerja, hari_hadir, hari_izin, hari_sakit, hari_alpha,
       hari_cuti, hari_wfh, menit_lembur, gaji_pokok, gaji_per_hari, tunjangan_harian,
       total_tunjangan, dasar_lembur, nilai_lembur, bonus_alpha, potongan_absensi, persen_bpjs,
       bonus, kasbon, potongan_lain, total_pendapatan, total_potongan, gaji_bersih, status, catatan, updated_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now','localtime'))
     ON CONFLICT (bulan, tahun, karyawan_id) DO UPDATE SET
       hari_kerja = excluded.hari_kerja,
       hari_hadir = excluded.hari_hadir,
       hari_izin = excluded.hari_izin,
       hari_sakit = excluded.hari_sakit,
       hari_alpha = excluded.hari_alpha,
       hari_cuti = excluded.hari_cuti,
       hari_wfh = excluded.hari_wfh,
       menit_lembur = excluded.menit_lembur,
       gaji_pokok = excluded.gaji_pokok,
       gaji_per_hari = excluded.gaji_per_hari,
       tunjangan_harian = excluded.tunjangan_harian,
       total_tunjangan = excluded.total_tunjangan,
       dasar_lembur = excluded.dasar_lembur,
       nilai_lembur = excluded.nilai_lembur,
       bonus_alpha = excluded.bonus_alpha,
       potongan_absensi = excluded.potongan_absensi,
       persen_bpjs = excluded.persen_bpjs,
       bonus = excluded.bonus,
       kasbon = excluded.kasbon,
       potongan_lain = excluded.potongan_lain,
       total_pendapatan = excluded.total_pendapatan,
       total_potongan = excluded.total_potongan,
       gaji_bersih = excluded.gaji_bersih,
       catatan = excluded.catatan,
       updated_at = datetime('now','localtime')`,
    slip.bulan, slip.tahun, slip.karyawan_id, slip.hari_kerja, slip.hari_hadir, slip.hari_izin,
    slip.hari_sakit, slip.hari_alpha, slip.hari_cuti, slip.hari_wfh, slip.menit_lembur,
    slip.gaji_pokok, slip.gaji_per_hari, slip.tunjangan_harian, slip.total_tunjangan,
    slip.dasar_lembur, slip.nilai_lembur, slip.bonus_alpha, slip.potongan_absensi, slip.persen_bpjs,
    slip.bonus, slip.kasbon, slip.potongan_lain,
    slip.total_pendapatan, slip.total_potongan, slip.gaji_bersih, status, opsi.catatan || null,
  );

  return slip;
}

/** Generate draft payroll untuk seluruh karyawan aktif. Opsi global per karyawan. */
function generate(bulan, tahun, opsiGlobal = {}) {
  const daftar = karyawanPeriode(bulan, tahun);
  const hasil = [];
  db.db.transaction(() => {
    for (const k of daftar) {
      const ada = slipTersimpan(k.karyawan_id || k.id, bulan, tahun);
      const statusLama = ada?.status;
      // Jangan menimpa slip yang sudah dibayar.
      if (statusLama === 'dibayar') {
        hasil.push({ karyawan: k, slip: null, dilewati: true });
        continue;
      }
      hasil.push({ karyawan: k, slip: simpan(k, bulan, tahun, opsiGlobal), dilewati: false });
    }
  });
  return hasil;
}

function daftar(bulan, tahun, filter = {}) {
  const where = ['p.bulan = ?', 'p.tahun = ?'];
  const params = [bulan, tahun];
  if (filter.status) {
    where.push('p.status = ?');
    params.push(filter.status);
  }
  if (filter.departemenId) {
    where.push('k.departemen_id = ?');
    params.push(filter.departemenId);
  }
  if (filter.q) {
    where.push('(k.nama_lengkap LIKE ? OR k.nip LIKE ?)');
    params.push(`%${filter.q}%`, `%${filter.q}%`);
  }
  return db.db.all(
    `SELECT p.*, k.nip, k.nama_lengkap, k.jabatan, d.nama AS departemen
       FROM payroll p
       JOIN karyawan k ON k.id = p.karyawan_id
       LEFT JOIN departemen d ON d.id = k.departemen_id
      WHERE ${where.join(' AND ')}
      ORDER BY k.nama_lengkap`,
    ...params,
  );
}

/**
 * Simpan penyesuaian manual (bonus, kasbon, potongan lain) pada satu slip.
 * Total pendapatan, potongan, dan gaji bersih dihitung ulang dari komponen
 * yang tersimpan sehingga edit berulang tidak menyebabkan nilai dobel.
 */
function simpanPenyesuaian(id, opsi = {}) {
  const slip = db.db.get('SELECT * FROM payroll WHERE id = ?', id);
  if (!slip) return 0;

  const bonus = Number(opsi.bonus || 0);
  const kasbon = Number(opsi.kasbon || 0);
  const potonganLain = Number(opsi.potongan_lain || 0);
  const persenBpjs = slip.persen_bpjs !== null && slip.persen_bpjs !== undefined
    ? Number(slip.persen_bpjs)
    : getParameter().persenPotonganBpjs;

  const komponenPendapatan = Number(slip.gaji_pokok) + Number(slip.bonus_alpha || 0)
    + Number(slip.total_tunjangan) + Number(slip.nilai_lembur);
  const totalPendapatan = Math.max(0, komponenPendapatan + bonus);
  const potonganAbsensi = Math.max(0, Number(slip.gaji_pokok) - komponenPendapatan);
  const bpjs = Math.round((totalPendapatan * persenBpjs) / 100);
  const totalPotongan = potonganAbsensi + bonus + kasbon + potonganLain + bpjs;
  const gajiBersih = Math.max(0, totalPendapatan - totalPotongan);

  return db.db.run(
    `UPDATE payroll
        SET bonus = ?, kasbon = ?, potongan_lain = ?,
            persen_bpjs = ?,
            total_pendapatan = ?, total_potongan = ?, gaji_bersih = ?,
            catatan = ?, updated_at = datetime('now','localtime')
      WHERE id = ?`,
    bonus, kasbon, potonganLain, persenBpjs,
    totalPendapatan, totalPotongan, gajiBersih,
    opsi.catatan === undefined ? slip.catatan : opsi.catatan,
    id,
  ).changes;
}

function rekap(daftarSlip) {
  const total = daftarSlip.reduce(
    (acc, s) => ({
      karyawan: acc.karyawan + 1,
      gajiPokok: acc.gajiPokok + Number(s.gaji_pokok || 0),
      menitLembur: acc.menitLembur + Number(s.menit_lembur || 0),
      totalTunjangan: acc.totalTunjangan + Number(s.total_tunjangan || 0),
      nilaiLembur: acc.nilaiLembur + Number(s.nilai_lembur || 0),
      bonus: acc.bonus + Number(s.bonus || 0),
      kasbon: acc.kasbon + Number(s.kasbon || 0),
      totalPendapatan: acc.totalPendapatan + Number(s.total_pendapatan || 0),
      totalPotongan: acc.totalPotongan + Number(s.total_potongan || 0),
      gajiBersih: acc.gajiBersih + Number(s.gaji_bersih || 0),
    }),
    {
      karyawan: 0, gajiPokok: 0, menitLembur: 0, totalTunjangan: 0, nilaiLembur: 0,
      bonus: 0, kasbon: 0, totalPendapatan: 0, totalPotongan: 0, gajiBersih: 0,
    },
  );
  total.jamLembur = Number((total.menitLembur / 60).toFixed(1));
  return total;
}

/** Ubah status pembayaran massal (draft -> disetujui -> dibayar). */
function ubahStatus(id, status) {
  return db.db.run(
    "UPDATE payroll SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?",
    status,
    id,
  ).changes;
}

function ubahStatusPeriode(bulan, tahun, status) {
  return db.db.run(
    "UPDATE payroll SET status = ?, updated_at = datetime('now','localtime') WHERE bulan = ? AND tahun = ? AND status != 'dibayar'",
    status,
    bulan,
    tahun,
  ).changes;
}

function hapusPeriode(bulan, tahun) {
  return db.db.run(
    "DELETE FROM payroll WHERE bulan = ? AND tahun = ? AND status != 'dibayar'",
    bulan,
    tahun,
  ).changes;
}

function getById(id) {
  return db.db.get(
    `SELECT p.*, k.nip, k.nama_lengkap, k.jabatan, k.tunjangan_transport, k.tunjangan_makan,
            k.tunjangan_lain, k.nama_bank, k.no_rekening, d.nama AS departemen
       FROM payroll p
       JOIN karyawan k ON k.id = p.karyawan_id
       LEFT JOIN departemen d ON d.id = k.departemen_id
      WHERE p.id = ?`,
    id,
  );
}

module.exports = {
  getParameter,
  hitungSlip,
  karyawanPeriode,
  preview,
  simpan,
  simpanPenyesuaian,
  generate,
  daftar,
  rekap,
  slipTersimpan,
  ubahStatus,
  ubahStatusPeriode,
  hapusPeriode,
  getById,
};
