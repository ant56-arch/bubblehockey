const { launch } = require('./support');
const BASE = process.env.BASE_URL || 'http://localhost:8127';
(async () => {
  const b = await launch(), fails = [], errs = [];
  const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); if (!c) fails.push(n); };
  // mode: 'good' | 'blocked' | 'bad401' | 'norepo404' | 'readonly'
  const run = async mode => {
    const p = await (await b.newContext({ viewport: { width: 420, height: 900 } })).newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.route('https://api.github.com/**', async r => {
      const u = r.request().url(), json = (status, body) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (mode === 'blocked') return r.abort('failed');
      if (/rate_limit/.test(u)) return json(200, { rate: {} });
      if (mode === 'bad401') return json(401, { message: 'Bad credentials' });
      if (mode === 'norepo404') return json(404, { message: 'Not Found' });
      if (/\/contents\//.test(u)) return json(200, { content: Buffer.from(require('fs').readFileSync('data/games.json', 'utf8')).toString('base64'), sha: 's' });
      return json(200, { permissions: { push: mode !== 'readonly', pull: true } });
    });
    await p.addInitScript(() => { try { localStorage.setItem('bhl_token', 'github_pat_test'); } catch { } });
    await p.goto(BASE + '/#/add'); await p.waitForTimeout(1500);
    await p.click('#a-diag'); await p.waitForFunction(() => /Found the problem|Everything checks out/.test(document.getElementById('diag-out').textContent), null, { timeout: 10000 });
    return (await p.textContent('#diag-out')).replace(/\s+/g, ' ');
  };
  let t = await run('good'); ok('a working setup says everything checks out', /Everything checks out/.test(t) && /allowed to save/.test(t), t.slice(0, 160));
  t = await run('blocked'); ok('blocked network is named as the problem', /Found the problem/.test(t) && /cannot reach api\.github\.com/.test(t) && /work network/.test(t));
  t = await run('bad401'); ok('an invalid or expired token is named', /invalid or has expired/.test(t));
  t = await run('norepo404'); ok('a token with no access to the repository is explained', /cannot see ant56-arch\/bubblehockey/.test(t) && /Only select repositories/.test(t));
  t = await run('readonly'); ok('a read-only token is named', /can only read, not save/.test(t));
  console.log('page errors:', errs.filter(e => !/localStorage/.test(e))); console.log(fails.length ? 'FAILED: ' + fails.join('; ') : 'ALL PASSED'); await b.close();
})();
