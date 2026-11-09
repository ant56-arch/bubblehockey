/* Editing a team's color from Add / Edit: the color column is added to members.csv and the accent uses it. */
const { chromium } = require('playwright'); const fs = require('fs');
const BASE = process.env.BASE_URL || 'http://localhost:8127';
(async () => {
  const b = await chromium.launch(), fails = [], errs = [], puts = [];
  const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); if (!c) fails.push(n); };
  const csvFixed = 'name,short_name,team_name,established,logo,alt_logo\nAnn Lee,Ann,Team Ann,2026-09-01,,\nConnor Dalton,Connor,Team Connor,2026-09-01,,\n';      // fixed data, so the test does not depend on the live members file
  const p = await (await b.newContext({ viewport: { width: 1000, height: 1200 } })).newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.route('**/data/members.csv', r => r.fulfill({ status: 200, contentType: 'text/csv', body: csvFixed }));
  await p.route('https://api.github.com/**', async r => { const req = r.request(), path = (req.url().match(/contents\/([^?]+)/) || [])[1];
    if (req.method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(path === 'data/members.csv' ? csvFixed : fs.readFileSync(path, 'utf8')).toString('base64'), sha: 'sha1', encoding: 'base64' }) });
    puts.push({ path, body: JSON.parse(req.postData()) }); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 'sha2' } }) }); });
  await p.addInitScript(() => { try { localStorage.setItem('bhl_token', 'github_pat_test'); } catch { } });
  await p.goto(BASE + '/#/add'); await p.waitForTimeout(1300); await p.click('[data-m=members]'); await p.click('[data-medit="Connor"]');
  ok('the form has a color picker and an automatic option', !!(await p.$('#m-color')) && (await p.isChecked('#m-color-auto')));
  await p.uncheck('#m-color-auto'); await p.fill('#m-color', '#e11d48'); await p.click('#m-save'); await p.waitForFunction(() => /Saved/.test(document.getElementById('m-note').textContent), null, { timeout: 8000 });
  const put = puts.find(x => x.path === 'data/members.csv'), csv = Buffer.from(put.body.content, 'base64').toString();
  ok('a color column is added to members.csv with the chosen color on Connor only', /,color\r?\n/.test(csv) && /Connor.*,#e11d48\r?\n/.test(csv) && (csv.match(/#e11d48/g) || []).length === 1, csv.split('\n')[0]);
  await p.goto(BASE + '/#/standings'); await p.waitForTimeout(500);
  ok('the accent color is the chosen one', (await p.evaluate(() => TC.Connor)) === '#e11d48');
  console.log('page errors:', errs.filter(e => !/localStorage/.test(e))); console.log(fails.length ? 'FAILED: ' + fails.join('; ') : 'ALL PASSED'); await b.close();
})();
