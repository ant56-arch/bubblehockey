const { launch } = require('./support');
const BASE = process.env.BASE_URL || 'http://localhost:8127'; const fs = require('fs');
(async () => {
  const b = await launch(); const fails = [], errs = [];
  const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); if (!c) fails.push(n); };
  const orig = fs.readFileSync('data/games.json', 'utf8'); const st = { text: orig, sha: 's0', puts: [] };
  const p = await (await b.newContext({ viewport: { width: 390, height: 900 } })).newPage(); p.on('pageerror', e => errs.push(e.message)); await p.clock.install({ time: new Date('2026-11-03T12:00:00') });
  await p.addInitScript(() => localStorage.setItem('bhl_token', 'GOOD')); await p.route('**/data/config.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync('data/config.json', 'utf8') }));
  await p.route('https://api.github.com/**', r => { const q = r.request(); if (q.headers().authorization !== 'Bearer GOOD') return r.fulfill({ status: 401, json: {} });
    if (q.method() === 'PUT') { const b = JSON.parse(q.postData()); st.text = Buffer.from(b.content, 'base64').toString(); st.sha = 's' + st.puts.push(b.message); return r.fulfill({ status: 200, json: { content: { sha: st.sha } } }); }
    const path = new URL(q.url()).pathname; if (path.endsWith('games.json')) return r.fulfill({ status: 200, json: { sha: st.sha, content: Buffer.from(st.text).toString('base64') } }); return r.fulfill({ status: 404, json: {} }); });
  await p.goto(BASE + '/#/add'); await p.waitForTimeout(1000);
  await p.selectOption('#a-home', 'Tommy'); await p.selectOption('#a-road', 'Connor'); await p.fill('#a-date', '2026-11-03'); await p.fill('#a-hs', '4'); await p.fill('#a-rs', '2'); await p.waitForTimeout(150); await p.click('#a-save'); await p.waitForTimeout(900);
  const g = JSON.parse(st.text).games; ok('adding a game still saves one new line and valid JSON', g.length === JSON.parse(orig).games.length + 1 && g.at(-1).home === 'Tommy' && g.at(-1).homeScore === 4, st.puts.at(-1));
  ok('the playoff helper does not appear on an ordinary day', !(await p.$('[data-pog]')));
  console.log('page errors:', errs); console.log(fails.length ? 'FAILED: ' + fails.join('; ') : 'ALL PASSED'); await b.close();
})();
