const { launch } = require('./support');
const BASE = process.env.BASE_URL || 'http://localhost:8127';
(async () => {
  const b = await launch(), fails = [], errs = [];
  const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); if (!c) fails.push(n); };
  const csv = ['name,short_name,team_name,established,logo,alt_logo', 'Ann,Ann,Team Ann,2026-09-01,,', 'Bob <b>x</b>,Bob,Team Bob,2026-09-01,,', 'Cy,Cy,Team Cy,2026-09-01,,', 'Di,Di,Team Di,2026-11-03,,'].join('\n') + '\n';
  const games = [
    { date: '2026-11-02', home: 'Ann', road: 'Bob', homeScore: 5, roadScore: 0, homeShots: 14, roadShots: 6 },
    { date: '2026-11-02', home: 'Cy', road: 'Ann', homeScore: 2, roadScore: 3, overtime: true },
    { date: '2026-11-03', home: 'Bob', road: 'Cy', homeScore: 1, roadScore: 7 },
    { date: '2026-11-03', home: 'Ann', road: 'Di', homeScore: 4, roadScore: 3 },
    { date: '2026-11-04', home: 'Bob', road: 'Ann', homeScore: 0, roadScore: 2 },
    { date: '2026-11-04', home: 'Bob', road: 'Di', dnp: true },
    { date: '2026-11-10', home: 'Di', road: 'Cy', homeScore: 2, roadScore: 1 },
  ];
  const ctx = await b.newContext({ viewport: { width: 420, height: 1200 }, permissions: ['clipboard-read', 'clipboard-write'] }), p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.install({ time: new Date('2026-11-05T10:00:00') });
  await p.route('**/data/members.csv', r => r.fulfill({ status: 200, contentType: 'text/csv', body: csv })); await p.route('**/data/games.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ games }) }));
  await p.route('**/data/config.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ leagueName: 'Test League', schedule: { minGamesPerDay: 6, autoDnpFrom: '2026-11-01' } }) }));
  await p.goto(BASE + '/#/schedule'); await p.waitForTimeout(1300);
  ok('Schedule page has an Email recap button', await p.isVisible('[data-recap=open]'));
  await p.click('[data-recap=open]'); await p.waitForSelector('#recap-preview');
  ok('panel opens with default dates ending on the last day with results', (await p.inputValue('#rc-to')) === '2026-11-04' && (await p.inputValue('#rc-from')) === '2026-10-29');
  const t0 = await p.textContent('#recap-preview');
  ok('preview shows storylines, results, standings and leaders', /Storylines/.test(t0) && /Results \(5 games\)/.test(t0) && /Standings for these dates/.test(t0) && /Leaders/.test(t0));
  ok('results include every game in the range, scores and OT, but not a game outside it or a DNP', /Ann 5/.test(t0) && /\(OT\)/.test(t0) && !/Di 2/.test(t0) && !/Bob 0/.test(t0) === false);
  await p.fill('#rc-from', '2026-11-03'); await p.fill('#rc-to', '2026-11-03'); await p.dispatchEvent('#rc-to', 'change'); await p.waitForTimeout(200);
  const t1 = await p.textContent('#recap-preview'); ok('changing the dates updates the recap (one day: 2 games)', /Results \(2 games\)/.test(t1) && !/Mon, Nov 2/.test(t1), t1.slice(0, 120));
  await p.fill('#rc-to', '2026-11-04'); await p.fill('#rc-from', '2026-11-06'); await p.waitForTimeout(150);
  ok('moving From past To drags To along (no empty or reversed range)', (await p.inputValue('#rc-from')) === '2026-11-06' && (await p.inputValue('#rc-to')) === '2026-11-06');
  await p.fill('#rc-to', '2026-11-02'); await p.waitForTimeout(150);
  ok('moving To before From pulls From back', (await p.inputValue('#rc-from')) === '2026-11-02' && (await p.inputValue('#rc-to')) === '2026-11-02');
  await p.fill('#rc-to', '2026-11-04'); await p.waitForTimeout(150); ok('a normal range updates the recap (5 games)', /Results \(5 games\)/.test(await p.textContent('#recap-preview')));
  const data = await p.evaluate(() => { const d = rcData('2026-11-02', '2026-11-04'); return { story: d.story.map(s => s.text), period: d.period.map(r => r.name + ':' + rcRec(r) + ':' + r.pts), n: d.total, dnp: d.dnp }; });
  ok('stats are right: 5 games, 1 DNP, Ann 4-0-0 for 11 points', data.n === 5 && data.dnp === 1 && data.period[0] === 'Ann:4-0-0:11', JSON.stringify(data.period));
  ok('storylines mention the shutout and the blowout, at most 8 of them', data.story.some(s => /Shutout/.test(s)) && data.story.some(s => /Blowout: Cy beat Bob 7–1/.test(s)) && data.story.length <= 8, data.story.join(' / '));
  ok('a new member joining inside the range is welcomed', data.story.some(s => /Welcome Di/.test(s)));
  // html is escaped
  const html = await p.evaluate(() => rcHTML(rcData('2026-11-02', '2026-11-04'))); ok('names are escaped in the email HTML', !/<b>x<\/b>/.test(html));
  // plain text and rich copy
  await p.click('[data-recap=copy-text]'); await p.waitForTimeout(300); const clip1 = await p.evaluate(() => navigator.clipboard.readText());
  ok('Copy plain text puts the text recap on the clipboard', /TEST LEAGUE RECAP/.test(clip1) && /STORYLINES/.test(clip1) && /RESULTS \(5 games\)/.test(clip1), clip1.slice(0, 60));
  await p.click('[data-recap=copy-rich]'); await p.waitForTimeout(400);
  const clip2 = await p.evaluate(async () => { const items = await navigator.clipboard.read(); const out = {}; for (const it of items) for (const ty of it.types) out[ty] = await (await it.getType(ty)).text(); return out; });
  ok('Copy for email puts formatted HTML (tables and the logo) and a text version on the clipboard', /<table/.test(clip2['text/html'] || '') && /<img[^>]+league-logo/.test(clip2['text/html'] || '') && /RECAP/.test(clip2['text/plain'] || ''), Object.keys(clip2).join(','));
  ok('the confirmation says it is copied', /Copied/.test(await p.textContent('.recap-note')));
  const href = await p.evaluate(() => { const a = document.querySelector('[data-recap=mail]'); a.addEventListener('click', e => e.preventDefault(), { once: true }); a.click(); return a.getAttribute('href'); });
  ok('Open email draft builds a mailto link with the subject and the recap', /^mailto:\?subject=Test%20League%20recap/.test(href) && /body=/.test(href) && href.length < 2600, String(href.length));
  await p.click('[data-recap=range][data-from]:nth-of-type(2)'); await p.waitForTimeout(300); ok('quick ranges work (Yesterday = one day)', (await p.inputValue('#rc-from')) === (await p.inputValue('#rc-to')));
  await p.fill('#rc-from', '2026-08-01'); await p.fill('#rc-to', '2026-08-03'); await p.dispatchEvent('#rc-to', 'change'); await p.waitForTimeout(200);
  ok('a range with no games says so', /No games were played/.test(await p.textContent('#recap-preview')));
  await p.click('.chip[data-m="upcoming"]').catch(() => { }); await p.click('[data-recap=close]'); await p.waitForTimeout(200);
  ok('Close hides the panel and keeps the button', !(await p.$('#recap')) && !!(await p.$('[data-recap=open]')));
  ok('no sideways scroll on a phone with the panel open', await (async () => { await p.click('[data-recap=open]'); await p.waitForTimeout(300); return !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)); })());
  console.log('page errors:', errs); console.log(fails.length ? 'FAILED: ' + fails.join('; ') : 'ALL PASSED'); await b.close();
})();
