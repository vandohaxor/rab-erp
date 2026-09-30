(async () => {
  const r = await fetch('http://127.0.0.1:3001/login', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: 'direktur@rajawaliatasbumi.co.id', password: 'Direktur123!' }),
  });
  const t = await r.text();
  console.log('status:', r.status);
  for (const k of ['tidak sesuai', 'nonaktif', 'alert-danger', 'Terlalu banyak', 'Percobaan', 'email atau']) {
    console.log(`  ${k}: ${t.includes(k)}`);
  }
  const m = t.match(/<div class="alert[\s\S]{0,300}/);
  console.log('cuplikan alert:', m ? m[0].replace(/\s+/g, ' ') : '(tidak ada)');
})();
