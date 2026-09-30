const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('./data/rab.sqlite');
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all()
  .map((r) => r.name);
console.log('TABEL | JUMLAH');
for (const t of tables) {
  const c = db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n;
  console.log(`${t} | ${c}`);
}
db.close();
