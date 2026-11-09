const { launch } = require('./support');
const BASE = process.env.BASE_URL || 'http://localhost:8127';
(async () => {
  const b = await launch(), fails = [], errs = [];
  const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); if (!c) fails.push(n); };
  const p = await (await b.newContext({ viewport: { width: 400, height: 900 } })).newPage(); p.on('pageerror', e => errs.push(e.message));
  const puts = []; let stored = null;
  await p.route('https://api.github.com/**', async r => { const req = r.request(), u = req.url();
    if (req.method() === 'GET') { const path = u.match(/contents\/([^?]+)/)[1]; const f = require('fs').readFileSync(path, 'utf8'); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(path === 'data/rules.txt' && stored ? stored : f).toString('base64'), sha: 'sha1', encoding: 'base64' }) }); }
    const body = JSON.parse(req.postData()); puts.push({ u, ...body, text: Buffer.from(body.content, 'base64').toString() }); stored = Buffer.from(body.content, 'base64').toString(); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 'sha2' } }) }); });
  await p.addInitScript(() => { localStorage.setItem('bhl_token', 'github_pat_test'); });
  await p.goto(BASE + '/#/add'); await p.waitForTimeout(1200);
  ok('Add / Edit has a Rules & text section', !!(await p.$('[data-m=rules]')));
  await p.click('[data-m=rules]'); await p.waitForSelector('#t-text');
  ok('rules text is loaded into the editor', (await p.inputValue('#t-text')).startsWith('# Bubble Hockey League Rules'));
  ok('preview shows the rules', /General Gameplay/i.test(await p.textContent('#t-preview')));
  await p.fill('#t-text', '# Bubble Hockey League Rules\n## House rules\n• Games to 7 minutes.\n• <b>no html</b>\n'); 
  ok('preview updates as you type and escapes html', /House rules/.test(await p.textContent('#t-preview')) && !(await p.$('#t-preview b')));
  await p.click('#t-save'); await p.waitForFunction(() => /Saved/.test(document.getElementById('t-note').textContent), null, { timeout: 8000 });
  ok('save sends one PUT to data/rules.txt with the new text', puts.length === 1 && /contents\/data\/rules\.txt/.test(puts[0].u) && puts[0].text.includes('House rules') && puts[0].text.endsWith('\n') && puts[0].sha === 'sha1' && puts[0].branch === 'main', puts[0] && puts[0].message);
  await p.goto('about:blank'); await p.goto(BASE + '/#/rules'); await p.waitForTimeout(1200);
  ok('Rules page shows the saved text on this device right away', /House rules/.test(await p.textContent('#app')) && /Games to 7 minutes/.test(await p.textContent('#app')));
  ok('html in the text is shown as text, not run', !(await p.$('#app .rules b')));
  // home text file too
  await p.goto(BASE + '/#/add'); await p.waitForTimeout(800); await p.click('[data-m=rules]'); await p.click('[data-txtfile=home]'); await p.waitForTimeout(200);
  ok('home text can be opened too', (await p.inputValue('#t-text')).length > 50);
  // not connected: asks to connect
  const q = await (await b.newContext()).newPage(); await q.goto(BASE + '/#/add'); await q.waitForTimeout(1000); await q.click('[data-m=rules]'); await q.click('#t-save'); await q.waitForTimeout(300);
  ok('without a token, Save explains how to connect', /connect to GitHub/i.test(await q.textContent('#t-note')));
  console.log('page errors:', errs); console.log(fails.length ? 'FAILED: ' + fails.join('; ') : 'ALL PASSED'); await b.close();
})();
