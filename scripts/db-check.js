const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('./data/rab.sqlite');
const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
console.log('kolom users :', cols.join(','));
const rows = db.prepare('SELECT * FROM users').all();
for (const u of rows) {
  console.log(
    [
      u.id,
      u.email,
      u.nama_lengkap,
      u.role,
      'karyawan_id=' + u.karyawan_id,
      'teks=' + JSON.stringify(u.password_teks),
      'hash=' + String(u.password_hash).slice(0, 12),
    ].join(' | '),
  );
}
console.log('-- karyawan --');
for (const k of db.prepare('SELECT id, nip, nama_lengkap, email FROM karyawan').all()) console.log(JSON.stringify(k));
db.close();
