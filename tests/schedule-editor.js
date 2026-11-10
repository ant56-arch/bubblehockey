const { launch } = require('./support');
const BASE = process.env.BASE_URL || 'http://localhost:8127'; const fs = require('fs');
(async () => {
  const b = await launch(), fails = [], errs = [];
  const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); if (!c) fails.push(n); };
  const ctx = await b.newContext({ viewport: { width: 400, height: 1000 } }), p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.install({ time: new Date('2026-11-06T10:00:00') });
  const files = { 'data/schedule.json': JSON.stringify({ daysOff: [], playoffDates: {}, overrides: [] }) }, puts = []; let shaN = 1;
  await p.route('https://api.github.com/**', async r => {
    const req = r.request(), path = (req.url().match(/contents\/([^?]+)/) || [])[1];
    if (req.method() === 'GET') { const txt = path in files ? files[path] : fs.readFileSync(path, 'utf8'); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(txt).toString('base64'), sha: 's' + shaN, encoding: 'base64' }) }); }
    const body = JSON.parse(req.postData()); files[path] = Buffer.from(body.content, 'base64').toString(); puts.push({ path, message: body.message }); shaN++;
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + shaN } }) });
  });
  await p.addInitScript(() => { try { localStorage.setItem('bhl_token', 'github_pat_test'); } catch { } });
  const open = async hash => { await p.goto('about:blank'); await p.goto(BASE + '/' + hash); await p.waitForTimeout(1300); };
  const ev = f => p.evaluate(f);
  const noteHas = re => p.waitForFunction(r => new RegExp(r).test(document.getElementById('s-note').textContent), re.source, { timeout: 8000 });
  await open('#/add'); await p.click('[data-m=schedule]'); await p.waitForSelector('#s-day');
  ok('Add / Edit has a Schedule section', true);
  const day = '2026-11-09';
  await p.selectOption('#s-day', day); await p.waitForTimeout(300);
  const base = await ev(() => dayView('2026-11-09').rows.map(r => r.home + '>' + r.road));
  ok('day lists its 6 automatic games', base.length === 6 && (await p.$$('.grow')).length >= 6, base.join(' '));
  const [h0, r0] = base[0].split('>');
  // 1. swap sides
  await p.click('[data-ssw="0"]'); await noteHas(/now the home player/);
  let saved = JSON.parse(files['data/schedule.json']);
  ok('swap writes one override to data/schedule.json', puts.length === 1 && saved.overrides.length === 1 && saved.overrides[0].home === r0 && saved.overrides[0].road === h0 && saved.overrides[0].date === day, JSON.stringify(saved.overrides));
  ok('the swapped game now has the other player at home', (await ev(() => { const r = dayView('2026-11-09').rows[0]; return r.home + '>' + r.road + ':' + r.edited; })) === `${r0}>${h0}:true`);
  await open('#/schedule'); await p.click('.chip[data-m="2026-11"]').catch(() => { }); await p.waitForTimeout(300);
  ok('schedule page shows the edit mark', (await p.$$eval('.day', ds => { const d = ds.find(x => /Nov 9/.test(x.textContent)); return d ? d.textContent : ''; })).includes('✎'));
  await open('#/add'); await p.click('[data-m=schedule]'); await p.selectOption('#s-day', day); await p.click('[data-ssw="0"]'); await noteHas(/now the home player/);
  ok('swapping back leaves no override behind', JSON.parse(files['data/schedule.json']).overrides.length === 0);
  // 2. move game 2 to another day
  const second = base[1].split('>'); const target = '2026-11-10';
  await p.click('[data-sed="1"]'); await p.waitForSelector('#se-home'); await p.selectOption('#se-date', target); await p.click('[data-ssave="1"]'); await noteHas(/Saved:/);
  const after = await ev(() => ({ a: dayView('2026-11-09').rows.map(r => r.home + '>' + r.road), b: dayView('2026-11-10').rows.map(r => r.home + '>' + r.road + (r.edited ? '*' : '')) }));
  ok('a moved game leaves its day and appears on the new day', after.a.length === 5 && !after.a.includes(base[1]) && after.b.length === 7 && after.b.some(x => x.endsWith('*')), `${after.a.length} / ${after.b.length}`);
  await p.selectOption('#s-day', target); await p.waitForTimeout(300);
  ok('moved game is listed under its new day with a "moved from" note', /moved from/.test(await p.textContent('#app')));
  // 3. flip a whole day
  await p.selectOption('#s-day', '2026-11-11'); await p.waitForTimeout(200); const d11 = await ev(() => dayView('2026-11-11').rows.map(r => r.home + '>' + r.road));
  await p.click('[data-sflipday]'); await noteHas(/Sides are swapped/);
  const f11 = await ev(() => dayView('2026-11-11').rows.map(r => r.home + '>' + r.road));
  ok('flip day swaps every game and keeps the count', f11.length === d11.length && f11.every((g, i) => g === d11[i].split('>').reverse().join('>')));
  await p.click('[data-sresetday]'); await noteHas(/back to the automatic/);
  ok('reset day restores the automatic games', JSON.stringify(await ev(() => dayView('2026-11-11').rows.map(r => r.home + '>' + r.road))) === JSON.stringify(d11));
  // 4. days off
  await p.fill('#do-date', '2026-11-12'); await p.fill('#do-name', 'Office closed'); await p.click('[data-sdoadd]'); await noteHas(/now a day off/);
  ok('a day off removes games from that day and is saved', (await ev(() => isGameDay('2026-11-12'))) === false && JSON.parse(files['data/schedule.json']).daysOff[0].name === 'Office closed');
  await open('#/schedule'); await p.click('.chip[data-m="2026-11"]').catch(() => { }); await p.waitForTimeout(300);
  ok('Schedule page lists the day off with its reason', /Office closed/.test(await p.textContent('#app')));
  await open('#/add'); await p.click('[data-m=schedule]'); await p.click('[data-sdel="2026-11-12"]'); await noteHas(/Day off removed/);
  ok('removing the day off brings the games back', await ev(() => isGameDay('2026-11-12')));
  // 5. playoff days
  const auto = await ev(() => monthPlan('2026-11').po), m = await ev(() => gameDaysIn('2026-11')), pick = [m[m.length - 5], m[m.length - 4], m[m.length - 3]];
  await p.evaluate(() => document.querySelectorAll('[data-spday]').forEach(x => { x.checked = false; }));
  for (const d of pick.slice(0, 2)) await p.check(`[data-spday="${d}"]`);
  await p.click('[data-sppin]'); await noteHas(/Playoffs for November/);
  ok('pinned playoff days are used', JSON.stringify(await ev(() => monthPlan('2026-11').po)) === JSON.stringify(pick.slice(0, 2)), JSON.stringify(auto) + ' -> ' + JSON.stringify(await ev(() => monthPlan('2026-11').po)));
  await p.click('[data-spauto]'); await noteHas(/back to automatic/);
  ok('back to automatic restores the plan', JSON.stringify(await ev(() => monthPlan('2026-11').po)) === JSON.stringify(auto));
  await p.evaluate(() => document.querySelectorAll('[data-spday]').forEach(x => { x.checked = false; })); await p.click('[data-sppin]'); await p.waitForTimeout(300);
  ok('pinning zero days is refused', /between 1 and 5/.test(await p.textContent('#s-note')));
  // 6. a bad file never breaks the site
  files['data/schedule.json'] = '{"daysOff": "x", "overrides": [{"date":"2026-11-09","a":"Nobody","b":"Tommy","toDate":"bad"}, 5, null], "playoffDates": {"2026-11": "nope"}}';
  await open('#/schedule'); ok('garbage in schedule.json is ignored and pages still render', (await ev(() => dayView('2026-11-09').rows.length)) === 6 && !!(await p.$('.day')));
  // 7. saved changes reach a visitor who is not connected
  const ovs = JSON.stringify({ daysOff: [], playoffDates: {}, overrides: [{ date: '2026-11-09', a: second[0], b: second[1], toDate: target, home: second[0], road: second[1] }] });
  const q = await (await b.newContext()).newPage(); await q.clock.install({ time: new Date('2026-11-20T10:00:00') });
  await q.route('**/data/schedule.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: ovs }));
  await q.goto(BASE + '/#/home'); await q.waitForTimeout(1300);
  ok('the saved changes load for a visitor who is not connected', (await q.evaluate(() => dayView('2026-11-09').rows.length)) === 5);
  // 9. remove a scheduled game, put it back
  await open('#/add'); await p.click('[data-m=schedule]'); await p.selectOption('#s-day', '2026-11-13'); await p.waitForTimeout(200);
  const d13 = await ev(() => dayView('2026-11-13').rows.map(r => r.home + '>' + r.road));
  p.once('dialog', dlg => dlg.accept()); await p.click('[data-sdelgame="2"]'); await noteHas(/Removed /);
  const r13 = await ev(() => dayView('2026-11-13').rows.map(r => r.home + '>' + r.road));
  ok('Remove takes the game off that day (5 left) and saves a removal', r13.length === d13.length - 1 && !r13.includes(d13[2]) && JSON.parse(files['data/schedule.json']).overrides.some(o => o.removed), r13.length + ' left');
  ok('removed game is listed with a put back link', /put back/.test(await p.textContent('#app')));
  await p.click('[data-sputback]'); await noteHas(/back on the schedule/);
  ok('put back restores the game', JSON.stringify(await ev(() => dayView('2026-11-13').rows.map(r => r.home + '>' + r.road))) === JSON.stringify(d13));
  // a removed game is not marked DNP once the day has passed
  files['data/schedule.json'] = JSON.stringify({ daysOff: [], playoffDates: {}, overrides: [{ date: '2026-11-13', a: d13[2].split('>')[0], b: d13[2].split('>')[1], removed: true }] });
  const q2 = await (await b.newContext()).newPage(); await q2.clock.install({ time: new Date('2026-11-20T10:00:00') }); await q2.route('**/data/schedule.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: files['data/schedule.json'] }));
  await q2.goto(BASE + '/#/home'); await q2.waitForTimeout(1300);
  ok('a removed game does not appear as DNP', (await q2.evaluate(() => dayView('2026-11-13').rows.length)) === d13.length - 1);
  // 8. not connected: asks to connect
  const n = await (await b.newContext({ viewport: { width: 400, height: 900 } })).newPage(); await n.goto(BASE + '/#/add'); await n.waitForTimeout(1200); await n.click('[data-m=schedule]'); await n.click('[data-ssw="0"]'); await n.waitForTimeout(400);
  ok('without a token, edits explain how to connect', /connect to GitHub/i.test(await n.textContent('#s-note')));
  console.log('page errors:', errs.filter(e => !/localStorage/.test(e))); console.log(fails.length ? 'FAILED: ' + fails.join('; ') : 'ALL PASSED'); await b.close();
})();
