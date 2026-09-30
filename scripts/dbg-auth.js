const db = require('../src/config/database');
const u = db.db.get('SELECT email, password_teks FROM users WHERE email = ?', 'direktur@rajawaliatasbumi.co.id');
const t = u.password_teks;
console.log('tipe         :', typeof t, t && t.constructor.name);
console.log('char codes   :', [...String(t)].map((c) => c.charCodeAt(0).toString(16)).join(' '));
console.log('hex string   :', JSON.stringify(String(t).split('').map((c) => c.charCodeAt(0).toString(16)).join('-')));
console.log('literal hex  :', [...'Direktur123!'].map((c) => c.charCodeAt(0).toString(16)).join(' '));
console.log('equal        :', String(t) === 'Direktur123!');
