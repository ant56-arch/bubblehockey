const { launch } = require('./support');
const BASE = process.env.BASE_URL || 'http://localhost:8127';
(async () => {
  const b = await launch(), fails = [], errs = [];
  const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); if (!c) fails.push(n); };
  const csv = N => ['name,short_name,team_name,established,logo,alt_logo', ...Array.from({ length: N }, (_, i) => `Player ${i + 1},P${String(i + 1).padStart(2, '0')},Team ${i + 1},2026-10-01,,`)].join('\n') + '\n';
  const open = async (N, today = '2026-11-09', cfg) => { const p = await (await b.newContext({ viewport: { width: 390, height: 900 } })).newPage(); p.on('pageerror', e => errs.push(e.message)); await p.clock.install({ time: new Date(today + 'T10:00:00') });
    await p.route('**/data/members.csv', r => r.fulfill({ status: 200, contentType: 'text/csv', body: csv(N) })); await p.route('**/data/games.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ games: [] }) }));
    if (cfg) await p.route('**/data/config.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cfg) }));
    await p.goto(BASE + '/#/home'); await p.waitForTimeout(900); return p; };
  const stats = p => p.evaluate(() => { const days = gameDaysIn('2026-11').filter(d => dayKind(d) === 'regular'); const per = days.map(d => slateFor(d).length); const hr = {}, gp = {}, pairs = {};
    days.forEach(d => slateFor(d).forEach(g => { (hr[g.home] ??= { h: 0, r: 0 }).h++; (hr[g.road] ??= { h: 0, r: 0 }).r++; gp[g.home] = (gp[g.home] || 0) + 1; gp[g.road] = (gp[g.road] || 0) + 1; const k = [g.home, g.road].sort().join('|'); pairs[k] = (pairs[k] || 0) + 1; }));
    const diff = Math.max(...Object.values(hr).map(v => Math.abs(v.h - v.r))), gpv = Object.values(gp), pv = Object.values(pairs);
    // consecutive games for one player inside a day (rest)
    return { minDay: Math.min(...per), maxDay: Math.max(...per), days: days.length, homeRoadMaxDiff: diff, gamesSpread: Math.max(...gpv) - Math.min(...gpv), pairSpread: Math.max(...pv) - Math.min(...pv), pairCount: pv.length }; });
  const cfg = { leagueName: 'x', schedule: { minGamesPerDay: 6 }, points: { win: 3, overtimeWin: 2, overtimeLoss: 1, loss: 0 } };
  for (const N of [2, 3, 4, 5, 6, 7, 8, 10, 20]) { const p = await open(N, '2026-11-09', cfg); const s = await stats(p); const want = N < 4 ? null : 6;
    ok(`${N} players: every day has at least ${N < 4 ? 'one full round' : 6} games`, N < 4 ? s.minDay >= Math.floor(N / 2) : s.minDay >= 6, `min ${s.minDay}, max ${s.maxDay}`);
    if (N >= 3) ok(`${N} players: everyone plays everyone about equally (pair spread <= 1) and home/road stay balanced (within ${N <= 5 ? 1 : Math.ceil(N / 4)} over a month)`, s.pairSpread <= 1 && s.homeRoadMaxDiff <= (N <= 5 ? 1 : Math.ceil(N / 4)) && s.gamesSpread <= 2, JSON.stringify(s)); }
  let p = await open(5, '2026-11-09', cfg); const five = await p.evaluate(() => slateFor('2026-11-09'));
  ok('5 players: exactly 6 games on a day', five.length === 6, five.map(g => g.home + '>' + g.road).join(' '));
  const old = await open(5, '2026-11-09', { ...cfg, schedule: {} }); ok('without the setting a 5-player day is still 10 games (old behavior)', (await old.evaluate(() => slateFor('2026-11-09'))).length === 10);
  const four = await open(4, '2026-11-09', cfg), four0 = await open(4, '2026-11-09', { ...cfg, schedule: {} });
  ok('4 players: identical days with and without the setting (nothing in the past changes)', JSON.stringify(await four.evaluate(() => gameDaysIn('2026-11').map(d => slateFor(d)))) === JSON.stringify(await four0.evaluate(() => gameDaysIn('2026-11').map(d => slateFor(d)))));
  ok('Schedule page shows 6 games for a day', (await (async () => { await p.goto(BASE + '/#/schedule'); await p.waitForTimeout(800); return p.$$eval('.day', ds => ds[0] && ds[0].querySelectorAll('.mrow').length); })()) === 6);
  console.log('page errors:', errs); console.log(fails.length ? 'FAILED: ' + fails.join('; ') : 'ALL PASSED'); await b.close();
})();
