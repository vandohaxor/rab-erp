'use strict';

const { createApp } = require('../src/app');

const app = createApp();
const out = [];

app.listen(3999, async () => {
  const B = 'http://127.0.0.1:3999';

  function client() {
    let cookie = '';
    return async (p, opt = {}) => {
      const headers = { ...(opt.headers || {}) };
      if (cookie) headers.cookie = cookie;
      const r = await fetch(B + p, { redirect: 'manual', ...opt, headers });
      for (const c of (r.headers.getSetCookie ? r.headers.getSetCookie() : [])) {
        cookie = c.split(';')[0];
      }
      return { s: r.status, loc: r.headers.get('location'), t: await r.text() };
    };
  }

  const akun = [
    ['superadmin', 'direktur@rajawaliatasbumi.co.id', 'Direktor123!'],
    ['keuangan', 'keuangan@rajawaliatasbumi.co.id', 'Keuangan123!'],
    ['karyawan', 'dewi.anggraini@rajawaliatasbumi.co.id', 'Karyawan123!'],
  ];

  for (const [role, email, pw] of akun) {
    const g = client();
    const l = await g('/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `email=${encodeURIComponent(email)}&password=${encodeURIComponent(pw)}`,
    });
    const d = await g('/');
    const u = await g('/users');
    out.push(`${role.padEnd(11)} login:${l.s}->${(l.loc || '').padEnd(4)} /:${d.s} /users:${u.s}  ${d.s === 200 ? 'DASHBOARD OK' : 'DASHBOARD GAGAL'}`);
  }

  process.stdout.write(`\n===HASIL===\n${out.join('\n')}\n`);
  process.exit(0);
});
