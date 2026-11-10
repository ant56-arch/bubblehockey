const { launch } = require('./support');
const BASE = process.env.BASE_URL || 'http://localhost:8127'; const fs = require('fs');
(async () => {
  const b = await launch(); const fails = [], errs = [];
  const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); if (!c) fails.push(n); };
  const pad = i => 'P' + String(i).padStart(2, '0'), cfg = JSON.parse(fs.readFileSync('data/config.json', 'utf8'));
  const csv = N => ['name,short_name,team_name,established,logo,alt_logo', ...Array.from({ length: N }, (_, i) => `Player ${i + 1},${pad(i + 1)},Team ${i + 1},2026-10-01,,`)].join('\n') + '\n';
  const open = async (N, config) => { const p = await (await b.newContext({ viewport: { width: 390, height: 900 } })).newPage(); p.on('pageerror', e => errs.push(e.message)); await p.clock.install({ time: new Date('2026-11-02T10:00:00') });
    await p.route('**/data/members.csv', r => r.fulfill({ status: 200, contentType: 'text/csv', body: csv(N) })); await p.route('**/data/games.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ games: [] }) }));
    await p.route('**/data/config.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(config) })); await p.goto(BASE + '/#/home'); await p.waitForTimeout(800); return p; };
  ok('config.json no longer forces a number of playoff days', !('playoffDays' in (cfg.schedule || {})));
  const out = [];
  for (const N of [2, 4, 8, 14, 15, 16, 20]) { const p = await open(N, cfg); out.push([N, await p.evaluate(() => monthPlan('2026-11').po.length)]); await p.context().close(); }
  ok('automatic: 2 days up to 14 teams, 3 days from 15 teams', out.every(([N, d]) => d === (N >= 15 ? 3 : 2)), out.map(x => x.join('→')).join('  '));
  let p = await open(20, { ...cfg, schedule: { ...cfg.schedule, playoffDays: 2 } }); ok('config can force 2 days even with 20 teams', await p.evaluate(() => monthPlan('2026-11').po.length) === 2);
  p = await open(8, { ...cfg, schedule: { ...cfg.schedule, playoffDays: 3 } }); ok('config can force 3 days with 8 teams', await p.evaluate(() => monthPlan('2026-11').po.length) === 3);
  p = await open(8, { ...cfg, schedule: { ...cfg.schedule, playoffDays: 'auto' } }); ok('"auto" in config behaves like leaving it out', await p.evaluate(() => monthPlan('2026-11').po.length) === 2);
  p = await open(20, { ...cfg, playoffs: { teams: 8 } }); ok('with the field capped at 8 teams, the automatic rule uses 8 (2 days)', await p.evaluate(() => monthPlan('2026-11').po.length) === 2);
  p = await open(20, cfg); await p.goto(BASE + '/#/schedule'); await p.waitForTimeout(700); await p.click('.chip[data-m="2026-11"]').catch(() => {}); await p.waitForTimeout(400);
  const days = await p.$$eval('.day', d => d.filter(x => x.querySelector('.tag')?.textContent === 'Playoffs').map(x => x.querySelectorAll('.mrow').length)), tags = await p.$$eval('.day .tag', t => t.map(x => x.textContent));
  ok('20 teams: three playoff days with the games split evenly (13 + 13 + 13)', days.length === 3 && days.reduce((a, c) => a + c, 0) === 39 && Math.max(...days) - Math.min(...days) <= 1, JSON.stringify(days));
  ok('20 teams: the last game day is still kept open as the makeup day', tags.includes('Makeup day'));
  ok('schedule page has no sideways scroll', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  // October's real playoffs (already played on one day) are unaffected
  const q = await (await b.newContext({ viewport: { width: 390, height: 900 } })).newPage(); await q.clock.install({ time: new Date('2026-10-28T13:00:00') }); await q.goto(BASE + '/#/schedule'); await q.waitForTimeout(800);
  const heads = await q.$$eval('.day .dayhead', d => d.map(x => x.textContent.replace(/\s+/g, ' '))); ok('October: Oct 28 is still the one 6-game playoff day', heads[0].includes('Oct 28') && heads[0].includes('Playoffs') && heads[0].includes('6 games'), heads[0]);
  console.log('page errors:', errs); console.log(fails.length ? 'FAILED: ' + fails.join('; ') : 'ALL PASSED'); await b.close();
})();
