const { launch } = require('./support');
const BASE = process.env.BASE_URL || 'http://localhost:8127'; const fs = require('fs'), vm = require('vm');
const ctx = {}; vm.createContext(ctx); vm.runInContext(fs.readFileSync('js/bracket.js', 'utf8') + '\nthis.bracketModel = bracketModel;', ctx); const { bracketModel } = ctx;
(async () => {
  const b = await launch(); const fails = [], errs = [];
  const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); if (!c) fails.push(n); };
  const pad = i => 'P' + String(i).padStart(2, '0'); const N = 8, seeds = Array.from({ length: N }, (_, i) => pad(i + 1));
  const csv = ['name,short_name,team_name,established,logo,alt_logo', ...seeds.map((s, i) => `Player ${i + 1},${s},Team ${i + 1},2026-10-01,,`)].join('\n') + '\n';
  const data = {}, entries = []; for (let g = 0; g < 5; g++) { const m = bracketModel(seeds, data), open = m.list.map(n => m.G[n]).filter(x => x.a && x.b && !x.w && !x.skipped); const x = open[0]; data['g' + x.n] = x.a; entries.push({ date: '2026-10-28', home: x.a, road: x.b, homeScore: 5, roadScore: 2, playoff: true }); }
  const next = bracketModel(seeds, data), want = next.list.map(n => next.G[n]).filter(x => x.a && x.b && !x.w && !x.skipped).slice(0, 8);
  const p = await (await b.newContext({ viewport: { width: 390, height: 900 } })).newPage(); p.on('pageerror', e => errs.push(e.message)); await p.clock.install({ time: new Date('2026-10-28T13:00:00') });
  await p.route('**/data/members.csv', r => r.fulfill({ status: 200, contentType: 'text/csv', body: csv })); await p.route('**/data/games.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ games: entries }) }));
  await p.goto(BASE + '/#/add'); await p.waitForTimeout(900);
  const rows = await p.$$eval('[data-pog]', e => e.map(x => x.closest('.grow').innerText.replace(/\s+/g, ' ').trim()));
  ok('lists exactly the playoff games that are ready (both teams known)', rows.length === want.length && want.every((g, i) => rows[i].includes(`Game ${g.n}`) && rows[i].includes(`${g.a} vs ${g.b}`)), rows.slice(0, 3).join(' | '));
  await p.click('[data-pog]'); await p.waitForTimeout(300);
  const f = await p.evaluate(() => ({ home: document.getElementById('a-home').value, road: document.getElementById('a-road').value, po: document.getElementById('a-po').checked, date: document.getElementById('a-date').value }));
  ok('"Use" fills the form with the right two teams, today, and the Playoff box ticked', f.home === want[0].a && f.road === want[0].b && f.po && f.date === '2026-10-28', JSON.stringify(f));
  const q = await (await b.newContext()).newPage(); await q.clock.install({ time: new Date('2026-10-28T13:00:00') }); await q.goto(BASE + '/#/add'); await q.waitForTimeout(900);
  ok('October (champion already decided): no playoff helper is shown', !(await q.$('[data-pog]')));
  const r = await (await b.newContext()).newPage(); await r.clock.install({ time: new Date('2026-11-05T13:00:00') }); await r.goto(BASE + '/#/add'); await r.waitForTimeout(900);
  ok('an ordinary regular-season day: no playoff helper', !(await r.$('[data-pog]')));
  console.log('page errors:', errs); console.log(fails.length ? 'FAILED: ' + fails.join('; ') : 'ALL PASSED'); await b.close();
})();
