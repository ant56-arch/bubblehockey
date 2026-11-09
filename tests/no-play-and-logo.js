const { launch } = require('./support');
const BASE = process.env.BASE_URL || 'http://localhost:8127'; const fs = require('fs');
(async () => {
  const b = await launch(), fails = [], errs = [];
  const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); if (!c) fails.push(n); };
  const csv = ['name,short_name,team_name,established,logo,alt_logo', ...['Ann', 'Bob', 'Cy', 'Di', 'Ed'].map(n => `${n},${n},Team ${n},2026-09-01,,`)].join('\n') + '\n';
  // Nov 2: games played; Nov 3: nothing logged at all; Nov 4: only DNP entries logged by hand
  const games = [{ date: '2026-11-02', home: 'Ann', road: 'Bob', homeScore: 5, roadScore: 0 }, { date: '2026-11-04', home: 'Cy', road: 'Di', dnp: true }];
  const mk = async (today = '2026-11-06') => { const p = await (await b.newContext({ viewport: { width: 420, height: 1200 } })).newPage(); p.on('pageerror', e => errs.push(e.message)); await p.clock.install({ time: new Date(today + 'T10:00:00') });
    await p.route('**/data/members.csv', r => r.fulfill({ status: 200, contentType: 'text/csv', body: csv })); await p.route('**/data/games.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ games }) }));
    await p.route('**/data/config.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ leagueName: 'Test', schedule: { minGamesPerDay: 6, autoDnpFrom: '2026-11-01' } }) })); return p; };
  let p = await mk(); await p.goto(BASE + '/#/schedule'); await p.waitForTimeout(1300); await p.click('.chip[data-m="2026-11"]'); await p.waitForTimeout(400);
  const v = await p.evaluate(() => ({ nov3: dayView('2026-11-03'), nov2rows: dayView('2026-11-02').rows.length, dnpAuto: allDnp().filter(g => g.auto && g.date === '2026-11-03').length }));
  ok('a past day with nothing logged is flagged as no games played', v.nov3.noPlay === true);
  ok('no automatic DNPs are made up for it', v.dnpAuto === 0);
  const t = await p.textContent('#app');
  ok('the month list shows it as one compact "No games played" card, not six rows', /Tue, Nov 3/.test(t) && /No games played/.test(t) && /6 scheduled, none played/.test(t) && (await p.$$('.day.noplay')).length >= 1);
  ok('a day with games logged still fills out the other scheduled games as DNP', (await p.evaluate(() => dayView('2026-11-02').noPlay)) === false && (await p.evaluate(() => dayView('2026-11-02').rows.filter(r => r.result && r.result.auto).length)) === 5);
  ok('a day with hand-entered DNPs keeps them (nothing is deleted)', (await p.evaluate(() => dayView('2026-11-04').noPlay)) === false);
  ok('today and future days are never "no games played"', (await p.evaluate(() => dayView('2026-11-06').noPlay)) === false && (await p.evaluate(() => dayView('2026-11-09').noPlay)) === false);
  // content
  const home = fs.readFileSync('data/home.txt', 'utf8'), rules = fs.readFileSync('data/rules.txt', 'utf8');
  ok('home text no longer has the placeholder wording', !/company-wide|portal|free agent|UWM/i.test(home) && /How it works/.test(home));
  ok('rules typos fixed and tie-breaker and playoff lines added', !/singles  on|periods  tracked|overtime lose|Commissioner hold /.test(rules) && /Tie-breakers/.test(rules) && /double-elimination/.test(rules));
  // league logo upload
  const ctx = await b.newContext({ viewport: { width: 420, height: 1200 } }), q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message)); const puts = [];
  await q.route('https://api.github.com/**', async r => { const req = r.request(), path = (req.url().match(/contents\/([^?]+)/) || [])[1];
    if (req.method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(fs.readFileSync(path, 'utf8')).toString('base64'), sha: 'sha1', encoding: 'base64' }) });
    const body = JSON.parse(req.postData()); puts.push({ path, body }); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 'sha2' } }) }); });
  await q.addInitScript(() => { try { localStorage.setItem('bhl_token', 'github_pat_test'); } catch { } });
  await q.goto(BASE + '/#/add'); await q.waitForTimeout(1300); await q.click('[data-m=rules]'); await q.waitForSelector('#ll-file');
  ok('Rules & text has a League logo section showing the current logo', !!(await q.$('#ll-cur')));
  await q.click('#ll-save'); ok('saving with no file asks to choose one', /Choose an image/.test(await q.textContent('#ll-note')));
  const png = fs.readFileSync('tests/fixtures/logo.png');
  await q.setInputFiles('#ll-file', { name: 'logo.png', mimeType: 'image/png', buffer: png }); await q.click('#ll-save'); await q.waitForFunction(() => /Saved\./.test(document.getElementById('ll-note').textContent), null, { timeout: 8000 }); 
  const img = puts.find(x => /^images\/(teams\/)?league-.*\.(webp|png)$/.test(x.path)), cfg = puts.find(x => x.path === 'data/config.json');
  ok('the image is uploaded under images/ and the settings file points at it', !!img && !!cfg && JSON.parse(Buffer.from(cfg.body.content, 'base64').toString()).logo === img.path, puts.map(x => x.path).join(', '));
  const saved = JSON.parse(Buffer.from(cfg.body.content, 'base64').toString()); ok('the rest of the settings are kept', saved.leagueName === 'Bubble Hockey League' && saved.points.win === 3 && saved.schedule.minGamesPerDay === 6 && saved.repo === 'ant56-arch/bubblehockey', JSON.stringify(Object.keys(saved)));
  ok('the header logo changes right away', (await q.getAttribute('.brand-logo', 'src')) === img.path);
  const r = await mk(); await r.route('**/data/config.json', x => x.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ leagueName: 'Test', logo: 'images/new-logo.webp' }) })); await r.goto(BASE + '/#/home'); await r.waitForTimeout(1300);
  ok('a visitor sees the logo named in the settings (header and tab icon)', (await r.getAttribute('.brand-logo', 'src')) === 'images/new-logo.webp' && (await r.getAttribute('link[rel~=icon]', 'href')) === 'images/new-logo.webp');
  console.log('page errors:', errs.filter(e => !/localStorage/.test(e))); console.log(fails.length ? 'FAILED: ' + fails.join('; ') : 'ALL PASSED'); await b.close();
})();
