'use strict';

/**
 * Pembuatan laporan Excel (.xlsx) untuk semua modul.
 * Tiap fungsi mengembalikan objek Laporan yang tinggal dikirim lewat `kirim(res, namaFile)`.
 */

const h = require('../utils/helpers');
const xls = require('../utils/excel');

const PERUSAHAAN = 'PT Rajawali Atas Bumi';

function jam(menit) {
  return Number((Number(menit || 0) / 60).toFixed(2));
}

function dibuatOleh(user) {
  return user?.nama || user?.nama_lengkap || user?.email || '';
}

/** Menit keterlambatan dibanding jadwal + toleransi. */
function telat(menitMasuk, jadwal) {
  if (!menitMasuk || !jadwal) return 0;
  const batas = h.timeToMinutes(jadwal.jamMasuk) + Number(jadwal.toleransi || 0);
  return Math.max(0, h.timeToMinutes(menitMasuk) - batas);
}

/* ================= ABSENSI ================= */

/** Sheet detail absensi yang dipakai bersama oleh beberapa laporan. */
function sheetRincian(L, nama, judul, subjudul, rows, jadwal) {
  const ws = L.sheet(nama, [
    { header: 'NIP', key: 'nip', width: 11 },
    { header: 'Nama', key: 'nama', width: 26 },
    { header: 'Departemen', key: 'departemen', width: 18 },
    { header: 'Tanggal', key: 'tanggal', width: 12, align: 'center' },
    { header: 'Hari', key: 'hari', width: 10, align: 'center' },
    { header: 'Masuk', key: 'masuk', width: 9, align: 'center' },
    { header: 'Pulang', key: 'pulang', width: 9, align: 'center' },
    { header: 'Durasi (jam)', key: 'durasi', width: 12, format: 'desimal', align: 'right' },
    { header: 'Terlambat (mnt)', key: 'telat', width: 12, format: 'angka', align: 'right' },
    { header: 'Lembur (jam)', key: 'lembur', width: 12, format: 'desimal', align: 'right' },
    { header: 'Status', key: 'status', width: 11, align: 'center', warna: true },
    { header: 'Keterangan', key: 'keterangan', width: 26, wrap: true },
    { header: 'Sumber', key: 'sumber', width: 14, align: 'center' },
    { header: 'Foto', key: 'foto', width: 8, align: 'center' },
  ], { judulSheet: judul, subjudulSheet: subjudul });

  const data = rows.map((r) => ({
    nip: r.nip,
    nama: r.nama_lengkap,
    departemen: r.departemen || '-',
    tanggal: h.date(r.tanggal),
    hari: h.dayName(r.tanggal),
    masuk: h.time(r.jam_masuk),
    pulang: h.time(r.jam_pulang),
    durasi: jam(r.durasi_menit),
    telat: telat(r.jam_masuk, jadwal),
    lembur: jam(r.menit_lembur),
    status: r.status,
    keterangan: r.keterangan || '',
    sumber: r.sumber === 'atasan' ? 'Atasan' : 'Mandiri',
    foto: r.foto_path ? 'Ya' : 'Tidak',
  }));

  L.ringkasan(ws, [
    { label: 'Jumlah Catatan', nilai: data.length, format: 'angka' },
    { label: 'Hadir', nilai: data.filter((d) => d.status === 'hadir').length, format: 'angka' },
    { label: 'Izin', nilai: data.filter((d) => d.status === 'izin').length, format: 'angka' },
    { label: 'Sakit', nilai: data.filter((d) => d.status === 'sakit').length, format: 'angka' },
    { label: 'Total Lembur (jam)', nilai: Number(data.reduce((a, d) => a + d.lembur, 0).toFixed(1)), format: 'desimal' },
  ]);

  L.data(ws, data);
  if (data.length) {
    L.total(ws, {
      label: 'TOTAL',
      labelKolom: 'nama',
      nilai: {
        durasi: Number(data.reduce((a, d) => a + d.durasi, 0).toFixed(2)),
        telat: data.reduce((a, d) => a + d.telat, 0),
        lembur: Number(data.reduce((a, d) => a + d.lembur, 0).toFixed(2)),
      },
    });
  }
  L.filter(ws);
  return ws;
}

/** Rekap per karyawan: hari hadir/izin/sakit, jam kerja, jam lembur. */
function sheetRekapKaryawan(L, nama, judul, subjudul, rekap) {
  const ws = L.sheet(nama, [
    { header: 'NIP', key: 'nip', width: 11 },
    { header: 'Nama', key: 'nama', width: 26 },
    { header: 'Departemen', key: 'departemen', width: 18 },
    { header: 'Hadir', key: 'hadir', width: 8, format: 'angka', align: 'center' },
    { header: 'Izin', key: 'izin', width: 8, format: 'angka', align: 'center' },
    { header: 'Sakit', key: 'sakit', width: 8, format: 'angka', align: 'center' },
    { header: 'Cuti', key: 'cuti', width: 8, format: 'angka', align: 'center' },
    { header: 'WFH', key: 'wfh', width: 8, format: 'angka', align: 'center' },
    { header: 'Total Kerja (jam)', key: 'kerja', width: 13, format: 'desimal', align: 'right' },
    { header: 'Lembur (jam)', key: 'lembur', width: 12, format: 'desimal', align: 'right' },
    { header: 'Rata2/Hari (jam)', key: 'rata', width: 13, format: 'desimal', align: 'right' },
  ], { judulSheet: judul, subjudulSheet: subjudul });

  const hariEfektif = rekap.map((r) => Number(r.hari_hadir || 0) + Number(r.hari_wfh || 0));
  const total = {
    hadir: rekap.reduce((a, r) => a + Number(r.hari_hadir || 0), 0),
    izin: rekap.reduce((a, r) => a + Number(r.hari_izin || 0), 0),
    sakit: rekap.reduce((a, r) => a + Number(r.hari_sakit || 0), 0),
    cuti: rekap.reduce((a, r) => a + Number(r.hari_cuti || 0), 0),
    wfh: rekap.reduce((a, r) => a + Number(r.hari_wfh || 0), 0),
    lembur: Number(rekap.reduce((a, r) => a + jam(r.menit_lembur), 0).toFixed(2)),
  };

  L.ringkasan(ws, [
    { label: 'Karyawan', nilai: rekap.length, format: 'angka' },
    { label: 'Total Hadir', nilai: total.hadir, format: 'angka' },
    { label: 'Izin', nilai: total.izin, format: 'angka' },
    { label: 'Sakit', nilai: total.sakit, format: 'angka' },
    { label: 'Total Lembur (jam)', nilai: total.lembur, format: 'desimal' },
  ]);

  L.data(ws, rekap.map((r, i) => {
    const kerja = jam(r.menit_kerja);
    return {
      nip: r.nip,
      nama: r.nama_lengkap,
      departemen: r.departemen || '-',
      hadir: Number(r.hari_hadir || 0),
      izin: Number(r.hari_izin || 0),
      sakit: Number(r.hari_sakit || 0),
      cuti: Number(r.hari_cuti || 0),
      wfh: Number(r.hari_wfh || 0),
      kerja,
      lembur: jam(r.menit_lembur),
      rata: hariEfektif[i] > 0 ? Number((kerja / hariEfektif[i]).toFixed(2)) : 0,
    };
  }));

  L.total(ws, {
    label: 'TOTAL',
    labelKolom: 'nama',
    nilai: {
      hadir: total.hadir, izin: total.izin, sakit: total.sakit, cuti: total.cuti,
      wfh: total.wfh,      kerja: Number(rekap.reduce((a, r) => a + jam(r.menit_kerja), 0).toFixed(2)),
      lembur: total.lembur,
    },
  });
  L.filter(ws);
  return ws;
}

/** Rekap lembur: berapa kali dan total jam per karyawan. */
function sheetRekapLembur(L, nama, judul, subjudul, rows) {
  const ws = L.sheet(nama, [
    { header: 'NIP', key: 'nip', width: 11 },
    { header: 'Nama', key: 'nama', width: 26 },
    { header: 'Departemen', key: 'departemen', width: 18 },
    { header: 'Hari Lembur', key: 'hariLembur', width: 12, format: 'angka', align: 'center' },
    { header: 'Total Menit', key: 'menit', width: 12, format: 'angka', align: 'right' },
    { header: 'Total Jam', key: 'jamLembur', width: 12, format: 'desimal', align: 'right' },
    { header: 'Lembur Terbesar (jam)', key: 'maks', width: 18, format: 'desimal', align: 'right' },
    { header: 'Rata2 per Hari (jam)', key: 'rata', width: 17, format: 'desimal', align: 'right' },
  ], { judulSheet: judul, subjudulSheet: subjudul });

  const peta = new Map();
  for (const r of rows) {
    if (!Number(r.menit_lembur)) continue;
    const cur = peta.get(r.karyawan_id) || {
      nip: r.nip, nama: r.nama_lengkap, departemen: r.departemen || '-', hari: 0, menit: 0, maks: 0,
    };
    cur.hari += 1;
    cur.menit += Number(r.menit_lembur);
    cur.maks = Math.max(cur.maks, jam(r.menit_lembur));
    peta.set(r.karyawan_id, cur);
  }
  const data = [...peta.values()]
    .sort((a, b) => b.menit - a.menit)
    .map((d) => ({
      nip: d.nip,
      nama: d.nama,
      departemen: d.departemen,
      hariLembur: d.hari,
      menit: d.menit,
      jamLembur: jam(d.menit),
      maks: d.maks,
      rata: Number((jam(d.menit) / d.hari).toFixed(2)),
    }));

  L.ringkasan(ws, [
    { label: 'Karyawan Lembur', nilai: data.length, format: 'angka' },
    { label: 'Total Hari Lembur', nilai: data.reduce((a, d) => a + d.hariLembur, 0), format: 'angka' },
    { label: 'Total Jam Lembur', nilai: Number(data.reduce((a, d) => a + d.jamLembur, 0).toFixed(1)), format: 'desimal' },
  ]);

  L.data(ws, data);
  if (data.length) {
    L.total(ws, {
      label: 'TOTAL',
      labelKolom: 'nama',
      nilai: {
        hariLembur: data.reduce((a, d) => a + d.hariLembur, 0),
        menit: data.reduce((a, d) => a + d.menit, 0),
        jamLembur: Number(data.reduce((a, d) => a + d.jamLembur, 0).toFixed(2)),
      },
    });
  }
  L.filter(ws);
  return ws;
}

function absensiHarian({ rows, tanggal, jadwal, filter, user, perusahaan }) {
  const L = xls.baru({
    judul: 'Rekap Absensi Harian',
    subjudul: `${h.dayName(tanggal)}, ${h.date(tanggal)}${filter ? `  |  ${filter}` : ''}`,
    perusahaan: perusahaan || PERUSAHAAN,
    dibuatOleh: dibuatOleh(user),
  });
  sheetRincian(L, 'Absensi Harian', 'Rekap Absensi Harian', `${h.dayName(tanggal)}, ${h.date(tanggal)}`, rows, jadwal);
  return L;
}

function absensiRekap({ bulan, tahun, rekap, detail, jadwal, user, perusahaan }) {
  const periode = `${h.monthName(bulan)} ${tahun}`;
  const L = xls.baru({
    judul: 'Rekap Kehadiran Bulanan',
    subjudul: `Periode ${periode}`,
    perusahaan: perusahaan || PERUSAHAAN,
    dibuatOleh: dibuatOleh(user),
  });
  sheetRekapKaryawan(L, 'Rekap Bulanan', 'Rekap Kehadiran per Karyawan', `Periode ${periode}`, rekap);
  sheetRincian(L, 'Rincian Harian', 'Rincian Absensi Harian', `Periode ${periode}`, detail, jadwal);
  sheetRekapLembur(L, 'Rekap Lembur', 'Rekap Lembur per Karyawan', `Periode ${periode}`, detail);
  return L;
}

function absensiPeriode({ dari, sampai, rows, rekap, jadwal, user, perusahaan }) {
  const L = xls.baru({
    judul: 'Rekap Absensi Periode',
    subjudul: `Periode ${h.date(dari)} s.d. ${h.date(sampai)}`,
    perusahaan: perusahaan || PERUSAHAAN,
    dibuatOleh: dibuatOleh(user),
  });
  sheetRekapKaryawan(L, 'Rekap Periode', 'Rekap Kehadiran per Karyawan', `${h.date(dari)} s.d. ${h.date(sampai)}`, rekap);
  sheetRincian(L, 'Rincian Absensi', 'Rincian Absensi', `${h.date(dari)} s.d. ${h.date(sampai)}`, rows, jadwal);
  sheetRekapLembur(L, 'Rekap Lembur', 'Rekap Lembur per Karyawan', `${h.date(dari)} s.d. ${h.date(sampai)}`, rows);
  return L;
}

function absensiLembur({ bulan, tahun, rows, rekap, user, perusahaan }) {
  const periode = `${h.monthName(bulan)} ${tahun}`;
  const L = xls.baru({
    judul: 'Rekap Lembur Karyawan',
    subjudul: `Periode ${periode}`,
    perusahaan: perusahaan || PERUSAHAAN,
    dibuatOleh: dibuatOleh(user),
  });
  sheetRekapLembur(L, 'Rekap Lembur', 'Rekap Lembur per Karyawan', `Periode ${periode}`, rows);
  sheetRekapKaryawan(L, 'Rekap Kehadiran', 'Rekap Kehadiran (referensi)', `Periode ${periode}`, rekap);
  return L;
}

/* ================= PAYROLL ================= */

/** Rekap gaji: pendapatan, potongan, gaji bersih + rincian hitungan. */
function payrollRekap({ bulan, tahun, slip, user, perusahaan }) {
  const periode = `${h.monthName(bulan)} ${tahun}`;
  const L = xls.baru({
    judul: 'Rekap Payroll Karyawan',
    subjudul: `Periode ${periode}`,
    perusahaan: perusahaan || PERUSAHAAN,
    dibuatOleh: dibuatOleh(user),
  });

  const ws = L.sheet('Rekap Gaji', [
    { header: 'NIP', key: 'nip', width: 11 },
    { header: 'Nama', key: 'nama', width: 26 },
    { header: 'Departemen', key: 'departemen', width: 18 },
    { header: 'Hadir', key: 'hadir', width: 8, format: 'angka', align: 'center' },
    { header: 'Lembur (jam)', key: 'lembur', width: 12, format: 'desimal', align: 'right' },
    { header: 'Nilai Lembur', key: 'nilaiLembur', width: 14, format: 'rp' },
    { header: 'Gaji Pokok', key: 'gajiPokok', width: 15, format: 'rp' },
    { header: 'Tunjangan', key: 'tunjangan', width: 14, format: 'rp' },
    { header: 'Potongan', key: 'potongan', width: 14, format: 'rp' },
    { header: 'Total Pendapatan', key: 'pendapatan', width: 16, format: 'rp' },
    { header: 'Gaji Bersih', key: 'bersih', width: 16, format: 'rp' },
  ], { judulSheet: 'Rekap Payroll Karyawan', subjudulSheet: `Periode ${periode}` });

  const t = {
    hadir: slip.reduce((a, s) => a + Number(s.hari_hadir || 0), 0),
    lembur: Number(slip.reduce((a, s) => a + jam(s.menit_lembur), 0).toFixed(2)),
    nilaiLembur: slip.reduce((a, s) => a + Number(s.nilai_lembur || 0), 0),
    gajiPokok: slip.reduce((a, s) => a + Number(s.gaji_pokok || 0), 0),
    tunjangan: slip.reduce((a, s) => a + Number(s.total_tunjangan || 0), 0),
    potongan: slip.reduce((a, s) => a + Number(s.total_potongan || 0), 0),
    pendapatan: slip.reduce((a, s) => a + Number(s.total_pendapatan || 0), 0),
    bersih: slip.reduce((a, s) => a + Number(s.gaji_bersih || 0), 0),
  };

  L.ringkasan(ws, [
    { label: 'Karyawan', nilai: slip.length, format: 'angka' },
    { label: 'Total Lembur (jam)', nilai: t.lembur, format: 'desimal' },
    { label: 'Nilai Lembur', nilai: t.nilaiLembur, format: 'rp' },
    { label: 'Total Potongan', nilai: t.potongan, format: 'rp' },
    { label: 'Total Gaji Bersih', nilai: t.bersih, format: 'rp' },
  ]);

  L.data(ws, slip.map((s) => ({
    nip: s.nip,
    nama: s.nama_lengkap,
    departemen: s.departemen || '-',
    hadir: Number(s.hari_hadir || 0),
    lembur: jam(s.menit_lembur),
    nilaiLembur: Number(s.nilai_lembur || 0),
    gajiPokok: Number(s.gaji_pokok || 0),
    tunjangan: Number(s.total_tunjangan || 0),
    potongan: Number(s.total_potongan || 0),
    pendapatan: Number(s.total_pendapatan || 0),
    bersih: Number(s.gaji_bersih || 0),
  })));
  L.total(ws, { label: 'TOTAL', labelKolom: 'nama', nilai: t });
  L.filter(ws);

  // Sheet rincian perhitungan per karyawan.
  const wr = L.sheet('Rincian Perhitungan', [
    { header: 'NIP', key: 'nip', width: 11 },
    { header: 'Nama', key: 'nama', width: 26 },
    { header: 'Hari Kerja', key: 'hariKerja', width: 11, format: 'angka', align: 'center' },
    { header: 'Gaji/Hari', key: 'gajiHari', width: 14, format: 'rp' },
    { header: 'Hadir', key: 'hadir', width: 8, format: 'angka', align: 'center' },
    { header: 'Izin', key: 'izin', width: 8, format: 'angka', align: 'center' },
    { header: 'Sakit', key: 'sakit', width: 8, format: 'angka', align: 'center' },
    { header: 'Potongan Absensi', key: 'potAbsensi', width: 16, format: 'rp' },
    { header: 'Tunjangan/Hari', key: 'tunjHari', width: 14, format: 'rp' },
    { header: 'Dasar Lembur/Jam', key: 'dasar', width: 16, format: 'rp' },
    { header: 'Jam Lembur', key: 'jamLembur', width: 11, format: 'desimal', align: 'right' },
    { header: 'Nilai Lembur', key: 'nilaiLembur', width: 14, format: 'rp' },
    { header: 'Bonus', key: 'bonus', width: 13, format: 'rp' },
    { header: 'Kasbon', key: 'kasbon', width: 13, format: 'rp' },
    { header: 'Total Potongan', key: 'potongan', width: 15, format: 'rp' },
    { header: 'Gaji Bersih', key: 'bersih', width: 16, format: 'rp' },
  ], { judulSheet: 'Rincian Perhitungan Gaji', subjudulSheet: `Periode ${periode}` });

  L.data(wr, slip.map((s) => ({
    nip: s.nip,
    nama: s.nama_lengkap,
    hariKerja: Number(s.hari_kerja || 0),
    gajiHari: Number(s.gaji_per_hari || 0),
    hadir: Number(s.hari_hadir || 0),
    izin: Number(s.hari_izin || 0),
    sakit: Number(s.hari_sakit || 0),
    potAbsensi: Number(s.potongan_absensi || 0),
    tunjHari: Number(s.tunjangan_harian || 0),
    dasar: Number(s.dasar_lembur || 0),
    jamLembur: jam(s.menit_lembur),
    nilaiLembur: Number(s.nilai_lembur || 0),
    bonus: Number(s.bonus || 0),
    kasbon: Number(s.kasbon || 0),
    potongan: Number(s.total_potongan || 0),
    bersih: Number(s.gaji_bersih || 0),
  })));
  L.catatan(wr, 'Potongan absensi = (izin + sakit + cuti) x gaji per hari. '
    + 'Nilai lembur = (gaji pokok + tunjangan tetap) / (hari kerja x jam kerja harian) x faktor lembur x jam lembur.');
  L.filter(wr);

  return L;
}

/* ================= KEUANGAN ================= */

function keuanganTransaksi({ rows, tanggalMulai, tanggalSelesai, user, perusahaan }) {
  const periode = `${h.date(tanggalMulai)} s.d. ${h.date(tanggalSelesai)}`;
  const L = xls.baru({
    judul: 'Rekap Transaksi Keuangan',
    subjudul: `Periode ${periode}`,
    perusahaan: perusahaan || PERUSAHAAN,
    dibuatOleh: dibuatOleh(user),
  });

  const ws = L.sheet('Transaksi', [
    { header: 'Kode', key: 'kode', width: 16 },
    { header: 'Tanggal', key: 'tanggal', width: 12, align: 'center' },
    { header: 'Jenis', key: 'jenis', width: 12, align: 'center' },
    { header: 'Kategori', key: 'kategori', width: 26, wrap: true },
    { header: 'Jumlah', key: 'jumlah', width: 17, format: 'rp' },
    { header: 'Metode', key: 'metode', width: 11, align: 'center' },
    { header: 'PIC', key: 'pic', width: 22 },
    { header: 'Referensi', key: 'referensi', width: 18 },
    { header: 'Keterangan', key: 'keterangan', width: 32, wrap: true },
  ], { judulSheet: 'Rekap Transaksi Keuangan', subjudulSheet: `Periode ${periode}` });

  const masuk = rows.filter((r) => r.jenis === 'pemasukan').reduce((a, r) => a + Number(r.jumlah || 0), 0);
  const keluar = rows.filter((r) => r.jenis === 'pengeluaran').reduce((a, r) => a + Number(r.jumlah || 0), 0);

  L.ringkasan(ws, [
    { label: 'Jumlah Transaksi', nilai: rows.length, format: 'angka' },
    { label: 'Total Pemasukan', nilai: masuk, format: 'rp' },
    { label: 'Total Pengeluaran', nilai: keluar, format: 'rp' },
    { label: 'Seldo Bersih', nilai: masuk - keluar, format: 'rp' },
  ]);

  L.data(ws, rows.map((r) => ({
    kode: r.kode,
    tanggal: h.date(r.tanggal),
    jenis: r.jenis === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran',
    kategori: r.kategori || '-',
    jumlah: Number(r.jumlah || 0),
    metode: r.metode || '-',
    pic: r.pic || '-',
    referensi: r.no_referensi || '-',
    keterangan: r.keterangan || '',
  })));
  if (rows.length) {
    L.total(ws, { label: 'TOTAL', labelKolom: 'kategori', nilai: { jumlah: masuk + keluar } });
  }
  L.filter(ws);

  // Ringkasan per kategori.
  const wk = L.sheet('Rekap per Kategori', [
    { header: 'Kategori', key: 'kategori', width: 32 },
    { header: 'Jenis', key: 'jenis', width: 14, align: 'center' },
    { header: 'Jumlah Transaksi', key: 'jumlahTransaksi', width: 16, format: 'angka', align: 'center' },
    { header: 'Total', key: 'total', width: 18, format: 'rp' },
    { header: 'Porsi', key: 'porsi', width: 12, format: 'persen', align: 'right' },
  ], { judulSheet: 'Rekap per Kategori', subjudulSheet: `Periode ${periode}` });

  const peta = new Map();
  for (const r of rows) {
    const key = `${r.jenis}|${r.kategori || '-'}`;
    const cur = peta.get(key) || { kategori: r.kategori || '-', jenis: r.jenis, n: 0, total: 0 };
    cur.n += 1;
    cur.total += Number(r.jumlah || 0);
    peta.set(key, cur);
  }
  const dasar = masuk || keluar || 1;
  const kat = [...peta.values()]
    .sort((a, b) => b.total - a.total)
    .map((d) => ({
      kategori: d.kategori,
      jenis: d.jenis === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran',
      jumlahTransaksi: d.n,
      total: d.total,
      porsi: d.total / dasar,
    }));
  L.data(wk, kat);
  if (kat.length) {
    L.total(wk, { label: 'TOTAL', labelKolom: 'kategori', nilai: { total: masuk + keluar } });
  }
  L.filter(wk);

  return L;
}

/* ================= KARYAWAN ================= */

function karyawan({ rows, user, perusahaan }) {
  const L = xls.baru({
    judul: 'Data Karyawan',
    subjudul: `Total ${rows.length} karyawan`,
    perusahaan: perusahaan || PERUSAHAAN,
    dibuatOleh: dibuatOleh(user),
  });

  const ws = L.sheet('Data Karyawan', [
    { header: 'NIP', key: 'nip', width: 11 },
    { header: 'Nama Lengkap', key: 'nama', width: 26 },
    { header: 'NIK', key: 'nik', width: 18 },
    { header: 'Departemen', key: 'departemen', width: 18 },
    { header: 'Jabatan', key: 'jabatan', width: 20 },
    { header: 'Status', key: 'status', width: 11, align: 'center' },
    { header: 'Tipe Kontrak', key: 'kontrak', width: 12, align: 'center' },
    { header: 'Tanggal Masuk', key: 'masuk', width: 14, align: 'center' },
    { header: 'Gaji Pokok', key: 'gaji', width: 15, format: 'rp' },
    { header: 'Tunjangan Transport', key: 'tTransport', width: 17, format: 'rp' },
    { header: 'Tunjangan Makan', key: 'tMakan', width: 15, format: 'rp' },
    { header: 'Tunjangan Lain', key: 'tLain', width: 15, format: 'rp' },
    { header: 'Total Pendapatan', key: 'total', width: 17, format: 'rp' },
    { header: 'No HP', key: 'noHp', width: 15 },
    { header: 'Email', key: 'email', width: 30 },
  ], { judulSheet: 'Data Karyawan', subjudulSheet: `Total ${rows.length} karyawan` });

  const data = rows.map((r) => {
    const t = Number(r.tunjangan_transport || 0) + Number(r.tunjangan_makan || 0) + Number(r.tunjangan_lain || 0);
    return {
      nip: r.nip,
      nama: r.nama_lengkap,
      nik: r.nik || '-',
      departemen: r.departemen || '-',
      jabatan: r.jabatan || '-',
      status: r.status_karyawan,
      kontrak: r.tipe_kontrak || '-',
      masuk: h.date(r.tanggal_masuk),
      gaji: Number(r.gaji_pokok || 0),
      tTransport: Number(r.tunjangan_transport || 0),
      tMakan: Number(r.tunjangan_makan || 0),
      tLain: Number(r.tunjangan_lain || 0),
      total: Number(r.gaji_pokok || 0) + t,
      noHp: r.no_hp || '-',
      email: r.email || '-',
    };
  });

  L.ringkasan(ws, [
    { label: 'Jumlah Karyawan', nilai: data.length, format: 'angka' },
    { label: 'Total Gaji Pokok', nilai: data.reduce((a, d) => a + d.gaji, 0), format: 'rp' },
    { label: 'Total Tunjangan', nilai: data.reduce((a, d) => a + d.total - d.gaji, 0), format: 'rp' },
    { label: 'Total Pendapatan', nilai: data.reduce((a, d) => a + d.total, 0), format: 'rp' },
  ]);

  L.data(ws, data);
  if (data.length) {
    L.total(ws, {
      label: 'TOTAL',
      labelKolom: 'nama',
      nilai: {
        gaji: data.reduce((a, d) => a + d.gaji, 0),
        tTransport: data.reduce((a, d) => a + d.tTransport, 0),
        tMakan: data.reduce((a, d) => a + d.tMakan, 0),
        tLain: data.reduce((a, d) => a + d.tLain, 0),
        total: data.reduce((a, d) => a + d.total, 0),
      },
    });
  }
  L.filter(ws);
  return L;
}

module.exports = {
  jam,
  telat,
  absensiHarian,
  absensiRekap,
  absensiPeriode,
  absensiLembur,
  payrollRekap,
  keuanganTransaksi,
  karyawan,
  PERUSAHAAN,
};
