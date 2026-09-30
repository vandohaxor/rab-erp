'use strict';

/**
 * Pembuat laporan Excel (.xlsx) yang rapi dan siap cetak.
 * Semua modul export memakai util ini agar format seragam:
 * kop perusahaan, judul laporan, tabel bergaris, baris total, dan pengaturan cetak.
 */

const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

const C = {
  navy: 'FF0F2942',
  navy2: 'FF16395C',
  gold: 'FFC9A227',
  judul: 'FF102A43',
  headerText: 'FFFFFFFF',
  zebra: 'FFF4F6F9',
  border: 'FFCBD5E1',
  total: 'FFE2E8F0',
  hijau: 'FF157347',
  kuning: 'FFB54708',
  merah: 'FFB42318',
  abu: 'FF6B7A8D',
};

const FORMAT = {
  rp: '"Rp"#,##0',
  rp2: '"Rp"#,##0.00',
  angka: '#,##0',
  desimal: '#,##0.0',
  persen: '0.0%',
  tanggal: 'dd/mm/yyyy',
};

/** Warna teks otomatis untuk kolom status absensi. */
const WARNA_STATUS = {
  hadir: C.hijau,
  izin: C.kuning,
  sakit: C.merah,
  cuti: C.kuning,
  wfh: C.navy2,
};

function garis() {
  return { style: 'thin', color: { argb: C.border } };
}

function kotak(cell) {
  return { top: garis(), left: garis(), bottom: garis(), right: garis() };
}

const AKAR = path.resolve(__dirname, '..', '..');

/**
 * Logo perusahaan disimpan di folder publik, misalnya /uploads/logo.png.
 * URL absolut ditolak karena tidak bisa dibaca Excel.
 */
function fileLogo(logo) {
  if (!logo || typeof logo !== 'string') return null;
  if (/^(https?:)?\/\//i.test(logo)) return null;
  const rel = logo.split('?')[0].replace(/^\/+/, '');
  const f = path.isAbsolute(rel) ? rel : path.join(AKAR, 'public', rel);
  try {
    return fs.statSync(f).isFile() ? f : null;
  } catch (e) {
    return null;
  }
}

/** Baca ukuran gambar (PNG/JPEG) agar logo tidak gepeng. */
function ukuranGambar(file) {
  try {
    const b = fs.readFileSync(file);
    if (b.length > 24 && b.toString('ascii', 1, 4) === 'PNG') {
      return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    }
    if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i < b.length - 9) {
        if (b[i] !== 0xff) { i += 1; continue; }
        const m = b[i + 1];
        const len = b.readUInt16BE(i + 2);
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
          return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
        }
        i += 2 + len;
      }
    }
  } catch (e) { /* abaikan, pakai rasio 1:1 */ }
  return { w: 1, h: 1 };
}

class Laporan {
  constructor({
    judul,
    subjudul = '',
    perusahaan = 'PT Rajawali Atas Bumi',
    dibuatOleh = '',
    orientasi = null,
  } = {}) {
    this.judul = judul;
    this.subjudul = subjudul;
    this.perusahaan = typeof perusahaan === 'object' && perusahaan
      ? (perusahaan.badan || perusahaan.nama || 'PT Rajawali Atas Bumi')
      : (perusahaan || 'PT Rajawali Atas Bumi');
    this.logo = typeof perusahaan === 'object' && perusahaan ? perusahaan.logo : null;
    this.dibuatOleh = dibuatOleh;
    this.landscape = orientasi ? orientasi === 'landscape' : true;
    this.dicetak = new Date();
    this.wb = new ExcelJS.Workbook();
    this.wb.creator = this.perusahaan;
    this.wb.lastModifiedBy = dibuatOleh || this.perusahaan;
    this.wb.created = this.dicetak;
    this.state = new WeakMap();
    this.logoId = null;
  }

  /** Daftarkan logo ke workbook sekali saja (logo bisa dipakai di semua sheet). */
  gambarLogo() {
    if (this.logoId !== null) return this.logoId;
    this.logoId = false;
    const file = fileLogo(this.logo);
    if (!file) return this.logoId;
    try {
      const ext = path.extname(file).slice(1).toLowerCase();
      if (!['png', 'jpg', 'jpeg', 'gif'].includes(ext)) return this.logoId;
      this.logoId = this.wb.addImage({ filename: file, extension: ext === 'jpg' ? 'jpeg' : ext });
    } catch (e) {
      this.logoId = false;
    }
    return this.logoId;
  }

  /**
   * Sheet baru berisi kop + judul kolom.
   * kolom = [{ header, key, width, format, align, wrap, warna }]
   */
  sheet(nama, kolom, opsi = {}) {
    const ws = this.wb.addWorksheet(nama, {
      pageSetup: {
        paperSize: 9,
        orientation: this.landscape ? 'landscape' : 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
      },
    });

    const jumlah = kolom.length;
    const judulSheet = opsi.judulSheet || this.judul;
    const subjudulSheet = opsi.subjudulSheet ?? this.subjudul;
    // Baris 6-7 disediakan untuk kotak ringkasan, tabel mulai di baris 8.
    const headerRow = 8;
    const baris = headerRow;

    // Kop perusahaan (logo di kiri bila tersedia).
    const logoId = this.gambarLogo();
    const adaLogo = Boolean(logoId);
    const mulaiKop = adaLogo && jumlah >= 4 ? 3 : 1;
    ws.mergeCells(1, mulaiKop, 1, jumlah);
    const kop = ws.getCell(1, mulaiKop);
    kop.value = this.perusahaan.toUpperCase();
    kop.font = { size: 14, bold: true, color: { argb: C.navy } };
    kop.alignment = { horizontal: 'center' };
    ws.getRow(1).height = adaLogo ? 34 : 22;

    if (adaLogo && mulaiKop === 3) {
      const uk = ukuranGambar(fileLogo(this.logo));
      const tinggiPx = 62;
      const lebarPx = Math.max(20, Math.round((uk.w / uk.h) * tinggiPx));
      ws.addImage(logoId, {
        tl: { col: 0.25, row: 0.15 },
        ext: { width: lebarPx, height: tinggiPx },
        editAs: 'oneCell',
      });
      if (mulaiKop > jumlah) ws.mergeCells(1, 1, 1, jumlah);
    }

    // Judul laporan.
    ws.mergeCells(2, 1, 2, jumlah);
    const jud = ws.getCell(2, 1);
    jud.value = judulSheet;
    jud.font = { size: 12, bold: true, color: { argb: C.judul } };
    jud.alignment = { horizontal: 'center' };
    ws.getRow(2).height = 18;

    // Periode / keterangan laporan.
    if (subjudulSheet) {
      ws.mergeCells(3, 1, 3, jumlah);
      const s = ws.getCell(3, 1);
      s.value = subjudulSheet;
      s.font = { size: 10, color: { argb: C.abu } };
      s.alignment = { horizontal: 'center' };
      ws.getRow(3).height = 15;
    }

    // Waktu cetak.
    ws.mergeCells(4, 1, 4, jumlah);
    const meta = ws.getCell(4, 1);
    meta.value = `Dicetak: ${h.dayjs(this.dicetak).format('DD/MM/YYYY HH:mm')}`
      + (this.dibuatOleh ? `  |  Oleh: ${this.dibuatOleh}` : '');
    meta.font = { size: 8, italic: true, color: { argb: C.abu } };
    meta.alignment = { horizontal: 'right' };
    ws.getRow(4).height = 13;
    ws.getRow(5).height = 6;

    // Judul kolom tabel.
    const hr = ws.getRow(headerRow);
    kolom.forEach((k, i) => {
      const cell = hr.getCell(i + 1);
      cell.value = k.header;
      cell.font = { size: 10, bold: true, color: { argb: C.headerText } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = kotak(cell);
      ws.getColumn(i + 1).width = k.width || 14;
    });
    hr.height = 28;

    ws.views = [{ state: 'frozen', ySplit: headerRow }];
    ws.headerFooter = { oddFooter: `&L${this.perusahaan} - ${judulSheet}&RHal &P dari &N` };

    this.state.set(ws, { kolom, jumlah, headerRow, baris });
    return ws;
  }

  /** Tulis baris data (array of object memakai key kolom). */
  data(ws, rows) {
    const st = this.state.get(ws);
    for (const row of rows) {
      st.baris += 1;
      const r = ws.getRow(st.baris);
      const zebra = (st.baris - st.headerRow) % 2 === 0;
      st.kolom.forEach((k, i) => {
        const cell = r.getCell(i + 1);
        const v = row && typeof row === 'object' ? row[k.key] : row[i];
        cell.value = v === undefined || v === null ? null : v;
        cell.border = kotak(cell);
        cell.font = { size: 10 };
        cell.alignment = {
          horizontal: k.align || (k.format === 'rp' || k.format === 'rp2' || k.format === 'angka' ? 'right' : 'left'),
          vertical: 'middle',
          wrapText: Boolean(k.wrap),
        };
        if (k.format && FORMAT[k.format]) cell.numFmt = FORMAT[k.format];
        if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };
        if (k.warna && typeof v === 'string') {
          const w = typeof k.warna === 'function' ? k.warna(v, row) : WARNA_STATUS[v.toLowerCase()];
          if (w) cell.font = { size: 10, bold: true, color: { argb: w } };
        }
      });
    }
    return st.baris;
  }

  /** Baris total. nilai = { keyKolom: angka }, labelKolom = key penanda label. */
  total(ws, { label = 'TOTAL', labelKolom = null, nilai = {}, fmt = null } = {}) {
    const st = this.state.get(ws);
    st.baris += 1;
    const r = ws.getRow(st.baris);
    st.kolom.forEach((k, i) => {
      const cell = r.getCell(i + 1);
      if (k.key === labelKolom) {
        cell.value = label;
      } else if (Object.prototype.hasOwnProperty.call(nilai, k.key)) {
        cell.value = nilai[k.key];
        cell.numFmt = FORMAT[fmt || k.format] || FORMAT.angka;
      } else {
        cell.value = null;
      }
      cell.font = { size: 10, bold: true, color: { argb: C.navy } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.total } };
      cell.border = kotak(cell);
      cell.alignment = { horizontal: cell.value === null ? 'center' : 'right', vertical: 'middle' };
    });
    r.height = 18;
    return st.baris;
  }

  /** Kotak ringkasan metrik di atas tabel. */
  ringkasan(ws, item) {
    const st = this.state.get(ws);
    const lebar = Math.max(1, Math.floor(st.jumlah / item.length));
    const atas = st.headerRow - 2;
    item.forEach((it, i) => {
      const mulai = 1 + i * lebar;
      const akhir = Math.min(st.jumlah, mulai + lebar - 1);
      ws.mergeCells(atas, mulai, atas, akhir);
      ws.mergeCells(atas + 1, mulai, atas + 1, akhir);
      const a = ws.getCell(atas, mulai);
      const b = ws.getCell(atas + 1, mulai);
      a.value = it.label;
      a.font = { size: 9, bold: true, color: { argb: C.abu } };
      a.alignment = { horizontal: 'center', vertical: 'bottom' };
      b.value = it.nilai;
      b.font = { size: 12, bold: true, color: { argb: C.navy } };
      b.alignment = { horizontal: 'center', vertical: 'middle' };
      if (it.format && FORMAT[it.format]) b.numFmt = FORMAT[it.format];
      b.border = { bottom: { style: 'medium', color: { argb: C.gold } } };
    });
    ws.getRow(atas).height = 13;
    ws.getRow(atas + 1).height = 20;
    return ws;
  }

  /** Keterangan kaki tabel. */
  catatan(ws, teks) {
    const st = this.state.get(ws);
    st.baris += 2;
    ws.mergeCells(st.baris, 1, st.baris, st.jumlah);
    const c = ws.getCell(st.baris, 1);
    c.value = teks;
    c.font = { size: 8, italic: true, color: { argb: C.abu } };
    c.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
    return st.baris;
  }

  /** Filter otomatis pada baris judul kolom. */
  filter(ws) {
    const st = this.state.get(ws);
    ws.autoFilter = {
      from: { row: st.headerRow, column: 1 },
      to: { row: Math.max(st.headerRow + 1, st.baris), column: st.jumlah },
    };
    return ws;
  }

  async kirim(res, filename) {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    await this.wb.xlsx.write(res);
    res.end();
  }

  async simpan(pathFile) {
    await this.wb.xlsx.writeFile(pathFile);
    return pathFile;
  }
}

function baru(opts) {
  return new Laporan(opts);
}

function filename(prefix, suffix = '') {
  return `${prefix}${suffix ? `-${suffix}` : ''}-${h.today()}.xlsx`;
}

module.exports = { baru, filename, Laporan, FORMAT, WARNA_STATUS, C };
