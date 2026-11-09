const { launch } = require('./support');
const BASE = process.env.BASE_URL || 'http://localhost:8127';
(async () => {
  const b = await launch(), fails = [], errs = [];
  const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); if (!c) fails.push(n); };
  const csv = ['name,short_name,team_name,established,logo,alt_logo', ...['Ann', 'Bob', 'Cy', 'Di', 'Ed'].map(n => `${n},${n},Team ${n},2026-10-01,,`)].join('\n') + '\n';
  const open = async (games, today) => { const p = await (await b.newContext({ viewport: { width: 390, height: 900 } })).newPage(); p.on('pageerror', e => errs.push(e.message)); await p.clock.install({ time: new Date(today + 'T10:00:00') });
    await p.route('**/data/members.csv', r => r.fulfill({ status: 200, contentType: 'text/csv', body: csv })); await p.route('**/data/games.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ games }) }));
    await p.route('**/data/config.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ leagueName: 'x', schedule: { minGamesPerDay: 6, autoDnpFrom: '2026-11-01' } }) }));
    await p.goto(BASE + '/#/schedule'); await p.waitForTimeout(1000); return p; };
  const date = '2026-11-10';
  let p = await open([], date); const slate = await p.evaluate(d => slateFor(d).map(g => [g.home, g.road]), date);
  ok('6 scheduled games', slate.length === 6);
  const game = (h, r, hs = 3, rs = 1) => ({ date, home: h, road: r, homeScore: hs, roadScore: rs });
  const other = (() => { const all = ['Ann', 'Bob', 'Cy', 'Di', 'Ed']; for (const a of all) for (const c of all) if (a !== c && !slate.some(s => s.includes(a) && s.includes(c))) return [a, c]; return null; })();
  // 4 exact + 2 that were not scheduled (or are scheduled elsewhere)
  const exact4 = slate.slice(0, 4).map(([h, r]) => game(h, r)); const extra2 = [game(slate[4][1], slate[5][0]), game(slate[5][1], slate[4][0], 4, 2)];
  p = await open([...exact4, ...extra2], '2026-11-11');
  let v = await p.evaluate(d => { const v = dayView(d); return { rows: v.rows.length, results: v.rows.filter(r => r.result && !r.result.dnp).length, replaced: v.rows.filter(r => r.replaced).length, dnp: v.rows.filter(r => r.result && r.result.dnp).length, extra: v.extra.length }; }, date);
  ok('2 games played instead of scheduled ones fill the unplayed rows: still 6 rows, 6 played, no extra, no DNP', v.rows === 6 && v.results === 6 && v.replaced === 2 && v.dnp === 0 && v.extra === 0, JSON.stringify(v));
  ok('the Schedule card says 6 games · 6 played and shows no "Also played"', await (async () => { await p.click('.chip[data-m="2026-11"]'); await p.waitForTimeout(300); const t = await p.$$eval('.day', ds => ds.map(d => d.innerText)); const d10 = t.find(x => /Nov 10/.test(x)) || ''; return /6 games/.test(d10) && /6 played/.test(d10) && !/Also played/.test(d10); })());
  // only 5 played: the leftover scheduled game becomes DNP after the day
  p = await open([...exact4, extra2[0]], '2026-11-11');
  v = await p.evaluate(d => { const v = dayView(d); return { results: v.rows.filter(r => r.result && !r.result.dnp).length, dnp: v.rows.filter(r => r.result && r.result.dnp).length, extra: v.extra.length }; }, date);
  ok('5 played of 6: one DNP, nothing extra', v.results === 5 && v.dnp === 1 && v.extra === 0, JSON.stringify(v));
  // 8 played: 6 rows + 2 beyond
  p = await open([...exact4, ...extra2, game(other[0], other[1]), game(other[1], other[0])], '2026-11-11');
  v = await p.evaluate(d => { const v = dayView(d); return { results: v.rows.filter(r => r.result && !r.result.dnp).length, extra: v.extra.length }; }, date);
  ok('8 played: 6 rows filled and 2 shown as beyond the schedule', v.results === 6 && v.extra === 2, JSON.stringify(v));
  // standings and game log count every played game regardless
  ok('every played game still counts in the standings/log', (await p.evaluate(() => D.games.filter(isCounted).length)) === 8);
  // a replaced row shows who actually played, with the score
  p = await open([...exact4, ...extra2], date); const txt = await p.$$eval('.day', ds => (ds.find(d => /Nov 10/.test(d.innerText)) || {}).innerText || '');
  ok('replaced rows show the real players with an asterisk', txt.includes('*') && txt.includes(extra2[0].home) );
  // matching prefers a scheduled game that shares a player
  p = await open([game(slate[0][0], slate[1][1])], date);
  const shared = await p.evaluate(d => dayView(d).rows.findIndex(r => r.replaced), date); ok('a different matchup replaces a scheduled row that shares a player where possible', shared >= 0 && [slate[shared][0], slate[shared][1]].some(n => n === slate[0][0] || n === slate[1][1]));
  console.log('page errors:', errs); console.log(fails.length ? 'FAILED: ' + fails.join('; ') : 'ALL PASSED'); await b.close();
})();
