const { launch } = require('./support');
const BASE = process.env.BASE_URL || 'http://localhost:8127';
(async () => {
  const b = await launch(), fails = [], errs = [];
  const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); if (!c) fails.push(n); };
  const mk = async () => { const p = await (await b.newContext({ viewport: { width: 400, height: 1000 } })).newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(BASE + '/#/resources'); await p.waitForTimeout(1300); return p; };
  const say = p => p.evaluate(() => (document.querySelector('.fo-say, .sg-say') || {}).textContent || '');
  const waitNow = p => p.waitForFunction(() => /NOW/.test((document.querySelector('.fo-say') || {}).textContent || ''), null, { timeout: 9000 });
  const skipAndNext = async p => { await p.evaluate(() => { if (FO.res && !FO.res.finished) FO.drop -= 6000; }); await p.waitForSelector('[data-fo=next]', { state: 'visible', timeout: 8000 }); };
  let p = await mk();
  ok('Resources lists the games', (await p.$$('.res-list .card')).length === 3 && /Shootout/.test(await p.textContent('.res-list')) && /Face-off/.test(await p.textContent('.res-list')));
  await p.click('[data-res=faceoff]'); ok('Face-off menu has computer and two-player modes', !!(await p.$('[data-fo=start][data-mode=bot]')) && !!(await p.$('[data-fo=start][data-mode=two]')));
  await p.click('[data-fo=start][data-mode=bot]'); await p.fill('#fo-n0', 'Ann'); await p.click('[data-fo=level][data-level=easy]'); await p.click('[data-fo=go]');
  ok('starts with Get ready, and the typed name survives picking a speed', /Get ready/.test(await say(p)) && (await p.textContent('.sg-board')).includes('Ann'));
  await p.waitForFunction(() => /Wait for the drop/.test((document.querySelector('.fo-say') || {}).textContent || ''), null, { timeout: 4000 });
  // false start: tap while waiting
  await p.click('.fo-tap'); await p.waitForSelector('.fo-after', { state: 'attached' });
  ok('tapping early is a false start and the computer gets the point', await p.evaluate(() => FO.res.fs === 0 && FO.res.winner === 1 && FO.score[1] === 1 && /False start/.test(FO.res.text)));
  ok('the board does not give the result away while it plays', /0/.test(await p.textContent('.sg-board')) && !(await p.isVisible('.fo-after')));
  await skipAndNext(p); ok('after the animation the score and Next button appear', /1/.test(await p.textContent('.sg-board')) && (await p.isVisible('[data-fo=next]')));
  await p.click('[data-fo=next]');
  // fast tap beats the computer
  await waitNow(p); await p.click('.fo-tap'); await p.waitForSelector('.fo-after', { state: 'attached' });
  const r2 = await p.evaluate(() => ({ w: FO.res.winner, rt: FO.res.rt, t: foText(FO.res) })); ok('a quick tap beats the computer and shows the times', r2.w === 0 && r2.rt[0] < r2.rt[1] && /ms/.test(r2.t), JSON.stringify(r2));
  await skipAndNext(p); await p.click('[data-fo=next]');
  // no tap: computer wins
  await waitNow(p); await p.waitForSelector('.fo-after', { state: 'attached', timeout: 6000 }); ok('doing nothing lets the computer win the draw', await p.evaluate(() => FO.res.winner === 1 && FO.res.rt[0] === null));
  await skipAndNext(p); await p.click('[data-fo=next]');
  // keep winning until the end (first to 3): computer already has 2, so one more computer win ends it; play out whatever happens
  for (let i = 0; i < 8 && !(await p.$('.sg-end')); i++) { await waitNow(p).catch(() => { }); if (await p.$('.fo-tap')) await p.click('.fo-tap').catch(() => { }); await p.waitForSelector('.fo-after', { state: 'attached', timeout: 6000 }).catch(() => { }); await skipAndNext(p).catch(() => { }); const nx = await p.$('[data-fo=next]'); if (nx) await nx.click(); }
  await p.waitForSelector('.sg-end', { timeout: 8000 }); ok('first to 3 draws ends the game', await p.evaluate(() => Math.max(...FO.score) === 3));
  const rec = await p.evaluate(() => localStorage.getItem('bhl_faceoff')); ok('record against the computer is saved', /"w":|"l":/.test(rec), rec);
  // the player's own time is shown even when the computer wins
  p = await mk(); await p.click('[data-res=faceoff]'); await p.click('[data-fo=start][data-mode=bot]'); await p.click('[data-fo=level][data-level=hard]'); await p.click('[data-fo=go]');
  await waitNow(p); await p.waitForFunction(() => FO.res && FO.res.winner === 1, null, { timeout: 4000 });
  await p.evaluate(() => foTap(0, FO.dropPerf + 520)); await skipAndNext(p);
  const lt = await p.textContent('.fo-after .sg-say'); ok('when the computer wins and you tapped late, your time is shown with how much slower you were', /Computer wins the draw with \d+ ms\./.test(lt) && /520 ms \(\d+ ms too slow\)/.test(lt), lt);
  await p.click('[data-fo=next]'); await waitNow(p); await p.waitForFunction(() => FO.res && FO.res.winner === 1, null, { timeout: 4000 }); await skipAndNext(p);
  ok('if you never tap it says so', /did not tap in time/.test(await p.textContent('.fo-after .sg-say')), await p.textContent('.fo-after .sg-say'));
  // a real late click on the button also counts
  await p.click('[data-fo=next]'); await waitNow(p); await p.waitForFunction(() => FO.res && FO.res.winner === 1, null, { timeout: 4000 }); await p.waitForTimeout(450); await p.click('.fo-tap').catch(() => { });
  await skipAndNext(p); ok('a late click on TAP records your time too', /Trotta: \d+ ms/.test(await p.textContent('.fo-after .sg-say')) || /\d+ ms \(\d+ ms too slow\)/.test(await p.textContent('.fo-after .sg-say')), await p.textContent('.fo-after .sg-say'));
  // two players
  p = await mk(); await p.click('[data-res=faceoff]'); await p.click('[data-fo=start][data-mode=two]'); await p.fill('#fo-n0', 'Ann'); await p.fill('#fo-n1', 'Bob'); await p.click('[data-fo=go]');
  ok('two big buttons, one per player', (await p.$$('[data-fo-tap]')).length === 2);
  await waitNow(p); await p.click('[data-fo-tap="1"]'); await p.waitForSelector('.fo-after', { state: 'attached', timeout: 4000 });
  ok('2P: the player who taps first wins the draw', await p.evaluate(() => FO.res.winner === 1));
  await skipAndNext(p); await p.click('[data-fo=next]');
  await waitNow(p); await p.evaluate(() => { foTap(0, FO.dropPerf + 330); foTap(1, FO.dropPerf + 260); }); await p.waitForSelector('.fo-after', { state: 'attached', timeout: 4000 });
  ok('2P: when both tap, the lower reaction time wins and both times are known', await p.evaluate(() => FO.res.winner === 1 && FO.res.rt[0] === 330 && FO.res.rt[1] === 260));
  await skipAndNext(p); await p.click('[data-fo=next]');
  await p.waitForFunction(() => /Wait for the drop/.test((document.querySelector('.fo-say') || {}).textContent || ''), null, { timeout: 4000 }); await p.keyboard.press('a');
  ok('2P: pressing A too early is a false start for player 1 (keyboard works)', await p.evaluate(() => FO.res && FO.res.fs === 0));
  ok('no sideways scroll on a phone', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  // shootout still reachable and back links work
  p = await mk(); await p.click('[data-res=shootout]'); ok('Shootout opens from the list', !!(await p.$('[data-sg=start][data-mode=bot]'))); await p.click('[data-res=list]'); ok('back to the games list', (await p.$$('.res-list .card')).length === 3);
  console.log('page errors:', errs); console.log(fails.length ? 'FAILED: ' + fails.join('; ') : 'ALL PASSED'); await b.close();
})();
