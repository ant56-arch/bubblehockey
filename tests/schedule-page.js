const { launch } = require('./support');
const BASE = process.env.BASE_URL || 'http://localhost:8127';
(async () => {
  const b = await launch(), fails = [], errs = [];
  const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); if (!c) fails.push(n); };
  const csv = ['name,short_name,team_name,established,logo,alt_logo', ...['Ann', 'Bob', 'Cy', 'Di', 'Ed'].map(n => `${n},${n},Team ${n},2026-09-01,,`)].join('\n') + '\n';
  const games = [
    { date: '2026-10-05', home: 'Ann', road: 'Bob', homeScore: 3, roadScore: 1, homeShots: 12, roadShots: 8 },
    { date: '2026-10-06', home: 'Cy', road: 'Di', homeScore: 2, roadScore: 3, overtime: true },
    { date: '2026-10-10', home: 'Ed', road: 'Ann', homeScore: 4, roadScore: 2 },                      // a Saturday
    { month: '2026-10', home: 'Bob', road: 'Cy', playoff: true, homeScore: 4, roadScore: 3 },                      // no date
    { date: '2026-11-02', home: 'Ann', road: 'Cy', homeScore: 5, roadScore: 0, homeShots: 14, roadShots: 6 },
    { date: '2026-11-03', home: 'Bob', road: 'Di', dnp: true },
  ];
  const open = async hash => { const p = await (await b.newContext({ viewport: { width: 420, height: 1200 } })).newPage(); p.on('pageerror', e => errs.push(e.message)); await p.clock.install({ time: new Date('2026-11-04T10:00:00') });
    await p.route('**/data/members.csv', r => r.fulfill({ status: 200, contentType: 'text/csv', body: csv })); await p.route('**/data/games.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ games }) }));
    await p.route('**/data/config.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ leagueName: 'x', schedule: { minGamesPerDay: 6, autoDnpFrom: '2026-11-01' } }) }));
    await p.goto(BASE + '/' + hash); await p.waitForTimeout(1200); return p; };
  let p = await open('#/schedule');
  ok('there is no Game Log tab any more', !(await p.$$eval('#nav a', a => a.some(x => /Game Log/.test(x.textContent)))));
  const chips = await p.$$eval('.chip', a => a.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  ok('chips: Upcoming, this month, earlier months', chips[0] === 'Upcoming' && /November 2026/.test(chips[1]) && /October 2026/.test(chips[2]), chips.join(' | '));
  const h = await p.$$eval('h2', a => a.map(x => x.textContent));
  ok('Upcoming shows what is next and the latest results', h.includes('Coming up') && h.includes('Latest results'), h.join(' | '));
  ok('latest results are the most recent played days (Nov 3 DNP, Nov 2)', (await p.textContent('#app')).includes('Tue, Nov 3') && (await p.textContent('#app')).includes('Mon, Nov 2'));
  await p.click('.chip[data-m="2026-11"]'); await p.waitForTimeout(400);
  const t = await p.textContent('#app');
  ok('this month: today and coming up first, with the rest collapsed', /Today and coming up/.test(t) && !!(await p.$('details.sub')) && /more game days/.test(t));
  const order = await p.evaluate(() => { const h = [...document.querySelectorAll('h2')].find(x => x.textContent === 'Played'); const days = h ? [...h.nextElementSibling.querySelectorAll('.day')].map(d => d.querySelector('.dayhead b').textContent) : []; return days; });
  ok('this month: played days listed below, newest first', order.length === 2 && order[0] === 'Tue, Nov 3' && order[1] === 'Mon, Nov 2', order.join(' | '));
  ok('shots appear under a logged score', /14–6 shots/.test(t));
  ok('a DNP shows as DNP', await p.$eval('#app', el => !!el.querySelector('.tag.dnp')));
  await p.click('.chip[data-m="2026-10"]'); await p.waitForTimeout(400);
  const o = await p.textContent('#app');
  ok('a past month lists every played day, newest first, with the OT tag', o.indexOf('Tue, Oct 6') < o.indexOf('Mon, Oct 5') && /OT/.test(o));
  ok('a game played on a day off (Saturday) is listed', /Sat, Oct 10/.test(o) && /not a scheduled game day/.test(o));
  ok('a playoff game with no date is listed under "Date not logged"', /Date not logged/.test(o));
  ok('past month shows 12 / 8 shots line', /(12–8|8–12) shots/.test(o));
  await p.click('.chip[data-m="table"]'); await p.waitForTimeout(300);
  ok('Table switches to the old compact log with every game', (await p.$$('table.games tbody tr')).length === 4 && !(await p.$('.day')), String((await p.$$('table.games tbody tr')).length));
  await p.click('.chip[data-m="days"]'); await p.waitForTimeout(200); ok('By day switches back', !!(await p.$('.day')));
  p = await open('#/gamelog'); ok('the old #/gamelog address opens this month on the Schedule', /Today and coming up|Results/.test(await p.textContent('#app')) && (await p.$$eval('.chip.on', a => a.map(x => x.textContent)))[0].includes('November'));
  p = await open('#/home'); ok('Home links to the Schedule for all results', (await p.$$eval('a', a => a.some(x => x.getAttribute('href') === '#/schedule' && /All results/.test(x.textContent)))));
  ok('no sideways scroll', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  console.log('page errors:', errs); console.log(fails.length ? 'FAILED: ' + fails.join('; ') : 'ALL PASSED'); await b.close();
})();
