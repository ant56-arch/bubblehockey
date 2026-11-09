const { launch } = require('./support');
const BASE = process.env.BASE_URL || 'http://localhost:8127';
(async () => {
  const b = await launch(), fails = [], errs = [];
  const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); if (!c) fails.push(n); };
  const p = await (await b.newContext({ viewport: { width: 400, height: 900 } })).newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE + '/#/resources'); await p.waitForTimeout(1400);
  const st = await p.evaluate(() => { const a = Array.from({ length: 4000 }, foWaitDelay), m = a.reduce((x, y) => x + y) / a.length, sd = Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); const bins = [0, 0, 0, 0, 0, 0, 0, 0]; a.forEach(v => bins[Math.min(7, Math.floor(v / 900))]++);
    let fe = 0, cnt = 0; for (let i = 0; i < 2000; i++) { const d = foWaitDelay(), f = foFeints(d); if (f.length) fe++; f.forEach(x => { if (x.at < 0 || x.at + x.dur > d) cnt++; }); } return { min: Math.min(...a), max: Math.max(...a), mean: m, sd, bins, feintRate: fe / 2000, badFeints: cnt }; });
  ok('waits range from under a second to over six seconds', st.min < 1000 && st.max > 6000, `${Math.round(st.min)}–${Math.round(st.max)} ms`);
  ok('spread is wide (std dev over 1.3 s) and every 0.9 s band is used', st.sd > 1300 && st.bins.slice(0, 7).every(n => n > 0), `sd ${Math.round(st.sd)}, bins ${st.bins.join(',')}`);
  ok('the referee fidgets in roughly 3 of 10 rounds, always before the real drop', st.feintRate > 0.22 && st.feintRate < 0.55 && st.badFeints === 0, `${Math.round(st.feintRate * 100)}%`);
  // a feint must not release the puck, and tapping during one is a false start
  await p.click('[data-res=faceoff]'); await p.click('[data-fo=start][data-mode=bot]'); await p.click('[data-fo=go]');
  await p.waitForFunction(() => FO.phase === 'wait', null, { timeout: 4000 });
  await p.evaluate(() => { FO.feints = [{ at: 0, dur: 5000, amp: 12 }]; });
  await p.waitForTimeout(300); const mid = await p.evaluate(() => ({ phase: FO.phase, drop: FO.drop })); ok('during a feint the puck has not dropped', mid.phase === 'wait' && mid.drop === 0);
  await p.click('.fo-tap'); await p.waitForSelector('.fo-after', { state: 'attached' }); ok('tapping during a feint is a false start', await p.evaluate(() => FO.res.fs === 0));
  console.log('page errors:', errs); console.log(fails.length ? 'FAILED: ' + fails.join('; ') : 'ALL PASSED'); await b.close();
})();
