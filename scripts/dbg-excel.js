const x = require('../src/utils/excel');

(async () => {
  const L = x.baru({ judul: 'Uji Laporan', subjudul: 'Periode test', dibuatOleh: 'Tester' });
  const ws = L.sheet('Data', [
    { header: 'Nama', key: 'nama', width: 22 },
    { header: 'Status', key: 'status', width: 12, warna: true },
    { header: 'Gaji Pokok', key: 'gaji', width: 18, format: 'rp' },
  ]);
  L.ringkasan(ws, [{ label: 'Karyawan', nilai: 2 }, { label: 'Total Gaji', nilai: 9000000, format: 'rp' }]);
  L.data(ws, [
    { nama: 'Ahmad Fauzi', status: 'hadir', gaji: 5000000 },
    { nama: 'Budi Santoso', status: 'sakit', gaji: 4000000 },
  ]);
  L.total(ws, { label: 'TOTAL', labelKolom: 'nama', nilai: { gaji: 9000000 } });
  L.catatan(ws, 'Keterangan: nilai gaji sudah termasuk tunjangan.');
  L.filter(ws);
  const out = await L.simpan('logs/uji-laporan.xlsx');
  console.log('tersimpan:', out);

  // Baca ulang untuk memastikan file valid.
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(out);
  const sh = wb.getWorksheet('Data');
  console.log('sheet    :', sh.name, '| baris:', sh.rowCount);
  console.log('A1       :', sh.getCell('A1').value);
  console.log('A2       :', sh.getCell('A2').value);
  console.log('A8       :', sh.getCell('A8').value, '| C8:', sh.getCell('C8').value, '| fmt:', sh.getCell('C8').numFmt);
  console.log('A10      :', sh.getCell('A10').value, '| C10:', sh.getCell('C10').value);
  console.log('B9 warna :', JSON.stringify(sh.getCell('B9').font));
  process.exit(0);
})().catch((e) => { console.error('GAGAL:', e); process.exit(1); });
